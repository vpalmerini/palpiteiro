from __future__ import annotations

from datetime import datetime, timezone
from secrets import token_urlsafe

from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy import func

from .auth import (
    COOKIE_NAME,
    clear_cookie,
    get_current_user,
    make_session_jwt,
    require_admin,
    require_auth,
    set_cookie,
)
from .extensions import db
from .models import (
    AwardPrediction,
    Match,
    MatchStatus,
    Pool,
    PoolParticipant,
    PoolPrize,
    Prediction,
    Round,
    RoundSnapshot,
    RoundSnapshotEntry,
    ScoreEntry,
    Stage,
    StageType,
    Team,
    TeamType,
    Tournament,
    TournamentGroup,
    TournamentStatus,
    TournamentTeam,
    User,
)
from .scoring import calculate_prediction_score

api = Blueprint("api", __name__, url_prefix="/api")


def _json():
    return request.get_json(silent=True) or {}


def _parse_starts_at(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _awards_locked(pool: Pool) -> bool:
    """Lock award predictions once the tournament has started or finished.

    Uses Tournament.starts_at when available; falls back to the first match's
    start time so existing data without starts_at keeps working.
    """
    tournament = pool.tournament
    if tournament.status == TournamentStatus.FINISHED.value:
        return True
    if tournament.starts_at is not None:
        return datetime.now(timezone.utc) >= _as_aware_utc(tournament.starts_at)
    # Fallback: derive from first scheduled match
    first_match = (
        Match.query.filter_by(tournament_id=pool.tournament_id)
        .order_by(Match.starts_at.asc())
        .first()
    )
    if first_match is None:
        return False
    return datetime.now(timezone.utc) >= _as_aware_utc(first_match.starts_at)


def _pool_or_404(slug: str) -> Pool:
    return Pool.query.filter_by(slug=slug).first_or_404()


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "publicId": user.public_id,
        "name": user.name,
        "email": user.email,
        "pictureUrl": user.picture_url,
        "isAdmin": user.is_admin,
    }


def _team_payload(team: Team | None):
    if team is None:
        return None
    return {"id": team.id, "name": team.name, "shortName": team.short_name, "teamType": team.team_type}


def _match_group(match: Match, team_group_map: dict) -> dict | None:
    if match.stage.stage_type != StageType.GROUP.value:
        return None
    if not match.home_team_id or not match.away_team_id:
        return None
    hg = team_group_map.get(match.home_team_id)
    ag = team_group_map.get(match.away_team_id)
    if hg and ag and hg.id == ag.id:
        return _group_payload(hg)
    return None


def _round_payload(round: Round):
    return {"id": round.id, "number": round.number, "stageId": round.stage_id}


def _match_payload(match: Match, team_group_map: dict | None = None):
    stage = match.round.stage
    return {
        "id": match.id,
        "round": _round_payload(match.round),
        "stage": {
            "id": stage.id,
            "name": stage.name,
            "stageType": stage.stage_type,
            "isKnockout": stage.is_knockout,
        },
        "homeTeam": _team_payload(match.home_team),
        "awayTeam": _team_payload(match.away_team),
        "startsAt": _as_aware_utc(match.starts_at).isoformat(),
        "venue": match.venue,
        "status": match.status,
        "homeScore": match.home_score,
        "awayScore": match.away_score,
        "wentToPenalties": match.went_to_penalties,
        "penaltyWinnerTeamId": match.penalty_winner_team_id,
        "isLocked": datetime.now(timezone.utc) >= _as_aware_utc(match.starts_at),
        "group": _match_group(match, team_group_map or {}),
    }


def _pool_payload(pool: Pool):
    prizes = sorted(pool.prizes, key=lambda prize: prize.position)
    current_user = g.get("current_user") or get_current_user()
    is_participant = False
    if current_user:
        is_participant = PoolParticipant.query.filter_by(
            pool_id=pool.id, user_id=current_user.id
        ).first() is not None
    return {
        "id": pool.id,
        "slug": pool.slug,
        "name": pool.name,
        "description": pool.description,
        "creatorName": pool.creator_name,
        "creatorUserId": pool.creator.public_id if pool.creator else None,
        "tournamentId": pool.tournament_id,
        "isParticipant": is_participant,
        "scoring": {
            "exactScore": pool.exact_score_points,
            "outcome": pool.outcome_points,
            "oneTeamGoals": pool.one_team_goals_points,
            "penaltyBonus": pool.penalty_bonus_points,
        },
        "prizes": [
            {"position": prize.position, "description": prize.description}
            for prize in prizes
        ],
        "awardsLocked": _awards_locked(pool),
        "awards": {
            "champion": {"enabled": pool.predict_champion, "points": pool.champion_points},
            "runnerUp": {"enabled": pool.predict_runner_up, "points": pool.runner_up_points},
            "thirdPlace": {"enabled": pool.predict_third_place, "points": pool.third_place_points},
            "topScorer": {"enabled": pool.predict_top_scorer, "points": pool.top_scorer_points},
            "bestPlayer": {"enabled": pool.predict_best_player, "points": pool.best_player_points},
        },
    }


def _prediction_payload(prediction: Prediction):
    score = ScoreEntry.query.filter_by(prediction_id=prediction.id).first()
    return {
        "id": prediction.id,
        "matchId": prediction.match_id,
        "userId": prediction.user.public_id,
        "homeScore": prediction.predicted_home_score,
        "awayScore": prediction.predicted_away_score,
        "predictsPenalties": prediction.predicts_penalties,
        "penaltyWinnerTeamId": prediction.predicted_penalty_winner_team_id,
        "updatedAt": prediction.updated_at.isoformat(),
        "score": {
            "points": score.points,
            "exactScore": score.exact_score,
            "outcomeHit": score.outcome_hit,
            "penaltyHit": score.penalty_hit,
        } if score is not None else None,
    }


def _parse_optional_int(value):
    if value is None or value == "":
        return None
    return int(value)


def _recalculate_scores(pool: Pool):
    finished_match_ids = [
        match_id
        for (match_id,) in Match.query.with_entities(Match.id)
        .filter_by(tournament_id=pool.tournament_id, status=MatchStatus.FINISHED.value)
        .all()
    ]
    if not finished_match_ids:
        return

    predictions = Prediction.query.filter(
        Prediction.pool_id == pool.id,
        Prediction.match_id.in_(finished_match_ids),
    ).all()

    for prediction in predictions:
        score = calculate_prediction_score(prediction, prediction.match, pool)
        entry = ScoreEntry.query.filter_by(prediction_id=prediction.id).first()
        if entry is None:
            entry = ScoreEntry(prediction_id=prediction.id, points=score.points)
            db.session.add(entry)
        entry.points = score.points
        entry.exact_score = score.exact_score
        entry.outcome_hit = score.outcome_hit
        entry.penalty_hit = score.penalty_hit


def _ensure_creator_membership(pool: Pool):
    """Ensure the creator is a member of the pool (legacy guard for old data)."""
    if PoolParticipant.query.filter_by(pool_id=pool.id).first() is not None:
        return
    creator = pool.creator
    if creator is None:
        return
    db.session.add(
        PoolParticipant(pool_id=pool.id, user_id=creator.id, display_name=pool.creator_name)
    )


def seed_database() -> str:  # noqa: C901
    if Tournament.query.first() is not None:
        return "already_seeded"

    # ── Tournament ──────────────────────────────────────────────────────────────
    tournament = Tournament(
        name="Copa do Mundo FIFA 2026",
        year=2026,
        status=TournamentStatus.ONGOING.value,
    )
    db.session.add(tournament)
    db.session.flush()

    # ── Teams (48 seleções, todas nacionais) ────────────────────────────────────
    GROUP_TEAMS: dict[str, list[tuple[str, str]]] = {
        "A": [("México", "MEX"), ("África do Sul", "RSA"), ("Rep. da Coreia", "KOR"), ("Rep. Tcheca", "CZE")],
        "B": [("Canadá", "CAN"), ("Bósnia e Herz.", "BIH"), ("Catar", "QAT"), ("Suíça", "SUI")],
        "C": [("Brasil", "BRA"), ("Marrocos", "MAR"), ("Haiti", "HAI"), ("Escócia", "SCO")],
        "D": [("Estados Unidos", "USA"), ("Paraguai", "PAR"), ("Austrália", "AUS"), ("Turquia", "TUR")],
        "E": [("Alemanha", "GER"), ("Curaçau", "CUW"), ("Costa do Marfim", "CIV"), ("Equador", "ECU")],
        "F": [("Holanda", "NED"), ("Japão", "JPN"), ("Suécia", "SWE"), ("Tunísia", "TUN")],
        "G": [("Bélgica", "BEL"), ("Egito", "EGY"), ("Irã", "IRN"), ("Nova Zelândia", "NZL")],
        "H": [("Espanha", "ESP"), ("Cabo Verde", "CPV"), ("Arábia Saudita", "SAU"), ("Uruguai", "URU")],
        "I": [("França", "FRA"), ("Senegal", "SEN"), ("Iraque", "IRQ"), ("Noruega", "NOR")],
        "J": [("Áustria", "AUT"), ("Jordânia", "JOR"), ("Argentina", "ARG"), ("Argélia", "ALG")],
        "K": [("Portugal", "POR"), ("Rep. Dem. Congo", "COD"), ("Uzbequistão", "UZB"), ("Colômbia", "COL")],
        "L": [("Inglaterra", "ENG"), ("Croácia", "CRO"), ("Gana", "GHA"), ("Panamá", "PAN")],
    }
    team_map: dict[str, Team] = {}
    for group_teams in GROUP_TEAMS.values():
        for name, short in group_teams:
            t = Team(name=name, short_name=short, team_type=TeamType.NATIONAL.value)
            db.session.add(t)
            team_map[short] = t
    db.session.flush()

    # ── Stages ──────────────────────────────────────────────────────────────────
    st_groups = Stage(tournament_id=tournament.id, name="Fase de Grupos", order=1, stage_type=StageType.GROUP.value)
    st_32 = Stage(tournament_id=tournament.id, name="Fase de 32 avos", order=2, stage_type=StageType.KNOCKOUT.value)
    st_16 = Stage(tournament_id=tournament.id, name="Oitavas de Final", order=3, stage_type=StageType.KNOCKOUT.value)
    st_qf = Stage(tournament_id=tournament.id, name="Quartas de Final", order=4, stage_type=StageType.KNOCKOUT.value)
    st_sf = Stage(tournament_id=tournament.id, name="Semifinais", order=5, stage_type=StageType.KNOCKOUT.value)
    st_fn = Stage(tournament_id=tournament.id, name="Final", order=6, stage_type=StageType.KNOCKOUT.value)
    db.session.add_all([st_groups, st_32, st_16, st_qf, st_sf, st_fn])
    db.session.flush()

    # ── Groups A–L ───────────────────────────────────────────────────────────────
    group_entities: dict[str, TournamentGroup] = {}
    for letter in "ABCDEFGHIJKL":
        g = TournamentGroup(stage_id=st_groups.id, name=f"Grupo {letter}")
        db.session.add(g)
        group_entities[letter] = g
    db.session.flush()

    # ── TournamentTeams with group assignment ────────────────────────────────────
    for letter, group_teams in GROUP_TEAMS.items():
        grp = group_entities[letter]
        for _, short in group_teams:
            db.session.add(TournamentTeam(
                tournament_id=tournament.id,
                team_id=team_map[short].id,
                group_id=grp.id,
            ))
    db.session.flush()

    # ── Rounds ───────────────────────────────────────────────────────────────────
    r1 = Round(stage_id=st_groups.id, number=1)
    r2 = Round(stage_id=st_groups.id, number=2)
    r3 = Round(stage_id=st_groups.id, number=3)
    rko32 = Round(stage_id=st_32.id, number=1)
    rko16 = Round(stage_id=st_16.id, number=1)
    rkoqf = Round(stage_id=st_qf.id, number=1)
    rkosf = Round(stage_id=st_sf.id, number=1)
    rkofn = Round(stage_id=st_fn.id, number=1)
    db.session.add_all([r1, r2, r3, rko32, rko16, rkoqf, rkosf, rkofn])
    db.session.flush()

    # ── Match data ────────────────────────────────────────────────────────────────
    # Simulating the tournament in mid-progress:
    #   Round 1 (May 11-17): all finished
    #   Round 2 (May 18-23): all finished
    #   Round 3 (May 25-27): upcoming, open for predictions
    #   Knockout phases: upcoming (no matches yet, teams TBD)
    #
    # Format: (home_short, away_short, starts_at_utc, home_score|None, away_score|None)
    ROUND1_DATA: list[tuple] = [
        ("MEX", "RSA", "2026-05-11T19:00:00Z", 2, 0),
        ("KOR", "CZE", "2026-05-11T22:00:00Z", 1, 1),
        ("CAN", "BIH", "2026-05-12T19:00:00Z", 1, 0),
        ("USA", "PAR", "2026-05-12T22:00:00Z", 2, 1),
        ("QAT", "SUI", "2026-05-13T16:00:00Z", 0, 3),
        ("BRA", "MAR", "2026-05-13T22:00:00Z", 2, 0),
        ("HAI", "SCO", "2026-05-13T01:00:00Z", 0, 3),
        ("AUS", "TUR", "2026-05-13T23:00:00Z", 1, 2),
        ("GER", "CUW", "2026-05-14T17:00:00Z", 4, 0),
        ("NED", "JPN", "2026-05-14T20:00:00Z", 2, 1),
        ("CIV", "ECU", "2026-05-14T23:00:00Z", 1, 1),
        ("SWE", "TUN", "2026-05-14T23:00:00Z", 1, 0),
        ("ESP", "CPV", "2026-05-15T16:00:00Z", 3, 0),
        ("BEL", "EGY", "2026-05-15T19:00:00Z", 2, 0),
        ("SAU", "URU", "2026-05-15T22:00:00Z", 0, 2),
        ("IRN", "NZL", "2026-05-15T22:00:00Z", 0, 0),
        ("FRA", "SEN", "2026-05-16T19:00:00Z", 3, 0),
        ("IRQ", "NOR", "2026-05-16T22:00:00Z", 0, 2),
        ("AUT", "JOR", "2026-05-16T01:00:00Z", 2, 1),
        ("ARG", "ALG", "2026-05-16T23:00:00Z", 3, 0),
        ("POR", "COD", "2026-05-17T17:00:00Z", 2, 0),
        ("ENG", "CRO", "2026-05-17T20:00:00Z", 3, 1),
        ("UZB", "COL", "2026-05-17T21:00:00Z", 0, 1),
        ("GHA", "PAN", "2026-05-17T23:00:00Z", 1, 1),
    ]
    ROUND2_DATA: list[tuple] = [
        ("CZE", "RSA", "2026-05-18T16:00:00Z", 0, 1),
        ("SUI", "BIH", "2026-05-18T19:00:00Z", 3, 0),
        ("MEX", "KOR", "2026-05-18T22:00:00Z", 2, 0),
        ("CAN", "QAT", "2026-05-18T22:00:00Z", 2, 1),
        ("USA", "AUS", "2026-05-19T19:00:00Z", 3, 0),
        ("SCO", "MAR", "2026-05-19T22:00:00Z", 0, 2),
        ("BRA", "HAI", "2026-05-19T00:30:00Z", 4, 0),
        ("TUR", "PAR", "2026-05-19T23:00:00Z", 2, 0),
        ("NED", "SWE", "2026-05-20T17:00:00Z", 3, 1),
        ("GER", "CIV", "2026-05-20T20:00:00Z", 3, 1),
        ("TUN", "JPN", "2026-05-20T23:00:00Z", 0, 1),
        ("ECU", "CUW", "2026-05-20T23:00:00Z", 2, 1),
        ("ESP", "SAU", "2026-05-21T16:00:00Z", 4, 1),
        ("BEL", "IRN", "2026-05-21T19:00:00Z", 1, 0),
        ("URU", "CPV", "2026-05-21T22:00:00Z", 2, 0),
        ("NZL", "EGY", "2026-05-21T22:00:00Z", 1, 1),
        ("FRA", "IRQ", "2026-05-22T21:00:00Z", 2, 0),
        ("ARG", "AUT", "2026-05-22T17:00:00Z", 2, 1),
        ("NOR", "SEN", "2026-05-22T23:00:00Z", 1, 0),
        ("JOR", "ALG", "2026-05-22T23:00:00Z", 0, 2),
        ("POR", "UZB", "2026-05-23T17:00:00Z", 3, 0),
        ("ENG", "GHA", "2026-05-23T20:00:00Z", 2, 0),
        ("COL", "COD", "2026-05-23T23:00:00Z", 2, 0),
        ("PAN", "CRO", "2026-05-23T23:00:00Z", 0, 2),
    ]
    ROUND3_DATA: list[tuple] = [
        # Simultaneous pairs per group (all upcoming)
        ("RSA", "KOR", "2026-05-25T16:00:00Z", None, None),
        ("MEX", "CZE", "2026-05-25T16:00:00Z", None, None),
        ("SUI", "CAN", "2026-05-25T19:00:00Z", None, None),
        ("BIH", "QAT", "2026-05-25T19:00:00Z", None, None),
        ("BRA", "SCO", "2026-05-25T22:00:00Z", None, None),
        ("MAR", "HAI", "2026-05-25T22:00:00Z", None, None),
        ("USA", "TUR", "2026-05-26T01:00:00Z", None, None),
        ("PAR", "AUS", "2026-05-26T01:00:00Z", None, None),
        ("ECU", "GER", "2026-05-26T16:00:00Z", None, None),
        ("CUW", "CIV", "2026-05-26T16:00:00Z", None, None),
        ("JPN", "SWE", "2026-05-26T23:00:00Z", None, None),
        ("TUN", "NED", "2026-05-26T23:00:00Z", None, None),
        ("EGY", "IRN", "2026-05-26T23:00:00Z", None, None),
        ("NZL", "BEL", "2026-05-26T23:00:00Z", None, None),
        ("CPV", "SAU", "2026-05-26T22:00:00Z", None, None),
        ("URU", "ESP", "2026-05-26T22:00:00Z", None, None),
        ("NOR", "FRA", "2026-05-27T19:00:00Z", None, None),
        ("SEN", "IRQ", "2026-05-27T19:00:00Z", None, None),
        ("ALG", "AUT", "2026-05-27T22:00:00Z", None, None),
        ("JOR", "ARG", "2026-05-27T22:00:00Z", None, None),
        ("COL", "POR", "2026-05-27T00:30:00Z", None, None),
        ("COD", "UZB", "2026-05-27T00:30:00Z", None, None),
        ("PAN", "ENG", "2026-05-28T21:00:00Z", None, None),
        ("CRO", "GHA", "2026-05-28T21:00:00Z", None, None),
    ]

    # Knockout matches: dates in the future (June–July 2026), teams TBD
    ROUND32_DATA: list[tuple] = [
        (None, None, "2026-06-28T22:00:00Z", None, None),
        (None, None, "2026-06-29T19:00:00Z", None, None),
        (None, None, "2026-06-29T22:00:00Z", None, None),
        (None, None, "2026-06-29T01:00:00Z", None, None),
        (None, None, "2026-06-30T19:00:00Z", None, None),
        (None, None, "2026-06-30T22:00:00Z", None, None),
        (None, None, "2026-06-30T01:00:00Z", None, None),
        (None, None, "2026-07-01T19:00:00Z", None, None),
        (None, None, "2026-07-01T22:00:00Z", None, None),
        (None, None, "2026-07-01T01:00:00Z", None, None),
        (None, None, "2026-07-02T19:00:00Z", None, None),
        (None, None, "2026-07-02T22:00:00Z", None, None),
        (None, None, "2026-07-02T01:00:00Z", None, None),
        (None, None, "2026-07-03T19:00:00Z", None, None),
        (None, None, "2026-07-03T22:00:00Z", None, None),
        (None, None, "2026-07-03T01:00:00Z", None, None),
    ]

    def _make_matches(round_obj: Round, data: list[tuple]) -> list[Match]:
        result: list[Match] = []
        for row in data:
            home_short, away_short, starts_at_str, home_score, away_score = row
            m = Match(
                tournament_id=tournament.id,
                round_id=round_obj.id,
                home_team_id=team_map[home_short].id if home_short else None,
                away_team_id=team_map[away_short].id if away_short else None,
                starts_at=_parse_starts_at(starts_at_str),
            )
            if home_score is not None:
                m.home_score = home_score
                m.away_score = away_score
                m.status = MatchStatus.FINISHED.value
            result.append(m)
            db.session.add(m)
        db.session.flush()
        return result

    matches_r1 = _make_matches(r1, ROUND1_DATA)
    matches_r2 = _make_matches(r2, ROUND2_DATA)
    _make_matches(r3, ROUND3_DATA)
    _make_matches(rko32, ROUND32_DATA)

    # Lookup map for predictions: (home_short, away_short) → Match
    match_idx: dict[tuple[str, str], Match] = {}
    for m, row in zip(matches_r1, ROUND1_DATA):
        match_idx[(row[0], row[1])] = m
    for m, row in zip(matches_r2, ROUND2_DATA):
        match_idx[(row[0], row[1])] = m

    # ── Pool ─────────────────────────────────────────────────────────────────────
    pool = Pool(
        slug="copa26amigos",
        name="Bolão dos Amigos",
        description="O bolão oficial do grupo para a Copa do Mundo 2026!",
        creator_name="Victor",
        tournament_id=tournament.id,
        exact_score_points=5,
        outcome_points=3,
        one_team_goals_points=1,
        penalty_bonus_points=2,
        predict_champion=True,
        champion_points=15,
        predict_runner_up=True,
        runner_up_points=10,
        predict_third_place=True,
        third_place_points=7,
        predict_top_scorer=True,
        top_scorer_points=8,
        predict_best_player=True,
        best_player_points=5,
    )
    db.session.add(pool)
    db.session.flush()
    for pos, desc in [(1, "R$ 200,00"), (2, "R$ 100,00"), (3, "R$ 50,00")]:
        db.session.add(PoolPrize(pool_id=pool.id, position=pos, description=desc))

    pool2 = Pool(
        slug="copa26trabalho",
        name="Bolão do Trabalho",
        description="Bolão da galera do escritório para a Copa 2026.",
        creator_name="Victor",
        tournament_id=tournament.id,
        exact_score_points=5,
        outcome_points=3,
        one_team_goals_points=1,
        penalty_bonus_points=2,
        predict_champion=True,
        champion_points=15,
        predict_runner_up=True,
        runner_up_points=10,
        predict_third_place=True,
        third_place_points=7,
        predict_top_scorer=False,
        top_scorer_points=8,
        predict_best_player=False,
        best_player_points=5,
    )
    db.session.add(pool2)
    db.session.flush()
    for pos, desc in [(1, "Jantar no restaurante"), (2, "Almoço por conta"), (3, "Cafézinho")]:
        db.session.add(PoolPrize(pool_id=pool2.id, position=pos, description=desc))
    db.session.flush()

    # ── Users (seed accounts — fake google_ids) ───────────────────────────────
    PEOPLE = [
        ("Victor",          "victor@exemplo.com",   "Victor",  True),
        ("Ana Lima",        "ana@exemplo.com",       "Aninha",  False),
        ("Pedro Santos",    "pedro@exemplo.com",     "Pedão",   False),
        ("Juliana Costa",   "juliana@exemplo.com",   "Juli",    False),
        ("Rafael Mendes",   "rafael@exemplo.com",    "Rafa",    False),
    ]
    participants: list[User] = []
    for i, (name, email, _, is_admin) in enumerate(PEOPLE):
        p = User(
            google_id=f"seed_google_id_{i}",
            name=name,
            email=email,
            is_admin=is_admin,
        )
        db.session.add(p)
        participants.append(p)
    db.session.flush()

    pool.creator_user_id = participants[0].id
    pool2.creator_user_id = participants[0].id

    for p, (_, _, nick, _) in zip(participants, PEOPLE):
        db.session.add(PoolParticipant(pool_id=pool.id, user_id=p.id, display_name=nick))
    for p, (_, _, nick, _) in zip(participants[:3], PEOPLE[:3]):
        db.session.add(PoolParticipant(pool_id=pool2.id, user_id=p.id, display_name=nick))
    db.session.flush()

    # ── Predictions (rounds 1 and 2 only) ────────────────────────────────────────
    # Row format: (home, away, predicted_home, predicted_away)
    # Victor: accurate fan — lots of exact scores
    PREDS: list[list[tuple[str, str, int, int]]] = [
        [  # 0 – Victor (bom predictor)
            ("MEX", "RSA", 2, 0), ("KOR", "CZE", 0, 1), ("CAN", "BIH", 1, 0), ("USA", "PAR", 2, 1),
            ("QAT", "SUI", 0, 2), ("BRA", "MAR", 2, 0), ("HAI", "SCO", 0, 2), ("AUS", "TUR", 1, 1),
            ("GER", "CUW", 3, 0), ("NED", "JPN", 2, 1), ("CIV", "ECU", 1, 1), ("SWE", "TUN", 1, 0),
            ("ESP", "CPV", 3, 0), ("BEL", "EGY", 2, 0), ("SAU", "URU", 0, 2), ("IRN", "NZL", 0, 0),
            ("FRA", "SEN", 3, 0), ("IRQ", "NOR", 0, 2), ("AUT", "JOR", 2, 1), ("ARG", "ALG", 3, 0),
            ("POR", "COD", 2, 0), ("ENG", "CRO", 3, 1), ("UZB", "COL", 0, 1), ("GHA", "PAN", 1, 1),
            ("CZE", "RSA", 1, 0), ("SUI", "BIH", 3, 0), ("MEX", "KOR", 2, 0), ("CAN", "QAT", 2, 1),
            ("USA", "AUS", 3, 0), ("SCO", "MAR", 0, 2), ("BRA", "HAI", 4, 0), ("TUR", "PAR", 2, 0),
            ("NED", "SWE", 3, 1), ("GER", "CIV", 3, 1), ("TUN", "JPN", 0, 1), ("ECU", "CUW", 2, 1),
            ("ESP", "SAU", 4, 1), ("BEL", "IRN", 1, 0), ("URU", "CPV", 2, 0), ("NZL", "EGY", 1, 1),
            ("FRA", "IRQ", 2, 0), ("ARG", "AUT", 2, 1), ("NOR", "SEN", 1, 0), ("JOR", "ALG", 0, 2),
            ("POR", "UZB", 3, 0), ("ENG", "GHA", 2, 0), ("COL", "COD", 2, 0), ("PAN", "CRO", 0, 2),
        ],
        [  # 1 – Ana (torcedora da França, razoável)
            ("MEX", "RSA", 2, 1), ("KOR", "CZE", 1, 0), ("CAN", "BIH", 0, 1), ("USA", "PAR", 1, 1),
            ("QAT", "SUI", 1, 2), ("BRA", "MAR", 1, 0), ("HAI", "SCO", 0, 2), ("AUS", "TUR", 2, 1),
            ("GER", "CUW", 3, 0), ("NED", "JPN", 1, 0), ("CIV", "ECU", 2, 0), ("SWE", "TUN", 2, 1),
            ("ESP", "CPV", 2, 0), ("BEL", "EGY", 1, 0), ("SAU", "URU", 1, 1), ("IRN", "NZL", 1, 0),
            ("FRA", "SEN", 3, 0), ("IRQ", "NOR", 1, 2), ("AUT", "JOR", 1, 0), ("ARG", "ALG", 2, 0),
            ("POR", "COD", 3, 0), ("ENG", "CRO", 2, 0), ("UZB", "COL", 1, 0), ("GHA", "PAN", 2, 0),
            ("CZE", "RSA", 1, 1), ("SUI", "BIH", 2, 0), ("MEX", "KOR", 1, 0), ("CAN", "QAT", 3, 0),
            ("USA", "AUS", 2, 1), ("SCO", "MAR", 1, 1), ("BRA", "HAI", 3, 0), ("TUR", "PAR", 1, 0),
            ("NED", "SWE", 2, 0), ("GER", "CIV", 2, 0), ("TUN", "JPN", 1, 0), ("ECU", "CUW", 1, 0),
            ("ESP", "SAU", 3, 0), ("BEL", "IRN", 2, 0), ("URU", "CPV", 1, 0), ("NZL", "EGY", 0, 1),
            ("FRA", "IRQ", 3, 0), ("ARG", "AUT", 1, 0), ("NOR", "SEN", 0, 1), ("JOR", "ALG", 1, 1),
            ("POR", "UZB", 2, 0), ("ENG", "GHA", 1, 0), ("COL", "COD", 1, 0), ("PAN", "CRO", 1, 1),
        ],
        [  # 2 – Pedro (casual, erros misturados)
            ("MEX", "RSA", 1, 0), ("KOR", "CZE", 1, 1), ("CAN", "BIH", 1, 1), ("USA", "PAR", 1, 0),
            ("QAT", "SUI", 1, 1), ("BRA", "MAR", 3, 1), ("HAI", "SCO", 1, 1), ("AUS", "TUR", 0, 1),
            ("GER", "CUW", 3, 1), ("NED", "JPN", 1, 1), ("CIV", "ECU", 0, 1), ("SWE", "TUN", 0, 0),
            ("ESP", "CPV", 2, 0), ("BEL", "EGY", 3, 1), ("SAU", "URU", 1, 0), ("IRN", "NZL", 1, 1),
            ("FRA", "SEN", 2, 0), ("IRQ", "NOR", 0, 1), ("AUT", "JOR", 1, 0), ("ARG", "ALG", 2, 1),
            ("POR", "COD", 1, 0), ("ENG", "CRO", 1, 0), ("UZB", "COL", 0, 2), ("GHA", "PAN", 0, 1),
            ("CZE", "RSA", 2, 0), ("SUI", "BIH", 2, 1), ("MEX", "KOR", 1, 1), ("CAN", "QAT", 2, 0),
            ("USA", "AUS", 1, 0), ("SCO", "MAR", 1, 0), ("BRA", "HAI", 3, 0), ("TUR", "PAR", 1, 1),
            ("NED", "SWE", 1, 0), ("GER", "CIV", 2, 1), ("TUN", "JPN", 1, 1), ("ECU", "CUW", 2, 0),
            ("ESP", "SAU", 2, 0), ("BEL", "IRN", 0, 0), ("URU", "CPV", 3, 0), ("NZL", "EGY", 0, 2),
            ("FRA", "IRQ", 1, 0), ("ARG", "AUT", 3, 0), ("NOR", "SEN", 1, 1), ("JOR", "ALG", 0, 1),
            ("POR", "UZB", 2, 1), ("ENG", "GHA", 1, 1), ("COL", "COD", 1, 1), ("PAN", "CRO", 0, 1),
        ],
        [  # 3 – Juliana (palpita azarões)
            ("MEX", "RSA", 0, 1), ("KOR", "CZE", 2, 0), ("CAN", "BIH", 0, 2), ("USA", "PAR", 0, 2),
            ("QAT", "SUI", 0, 1), ("BRA", "MAR", 1, 0), ("HAI", "SCO", 1, 0), ("AUS", "TUR", 0, 2),
            ("GER", "CUW", 2, 1), ("NED", "JPN", 0, 1), ("CIV", "ECU", 2, 1), ("SWE", "TUN", 1, 1),
            ("ESP", "CPV", 1, 1), ("BEL", "EGY", 0, 1), ("SAU", "URU", 1, 0), ("IRN", "NZL", 2, 0),
            ("FRA", "SEN", 1, 0), ("IRQ", "NOR", 1, 0), ("AUT", "JOR", 0, 1), ("ARG", "ALG", 1, 0),
            ("POR", "COD", 0, 0), ("ENG", "CRO", 1, 2), ("UZB", "COL", 1, 1), ("GHA", "PAN", 0, 2),
            ("CZE", "RSA", 2, 1), ("SUI", "BIH", 1, 1), ("MEX", "KOR", 0, 1), ("CAN", "QAT", 1, 0),
            ("USA", "AUS", 1, 1), ("SCO", "MAR", 1, 2), ("BRA", "HAI", 2, 0), ("TUR", "PAR", 0, 1),
            ("NED", "SWE", 1, 2), ("GER", "CIV", 1, 2), ("TUN", "JPN", 2, 0), ("ECU", "CUW", 1, 2),
            ("ESP", "SAU", 1, 0), ("BEL", "IRN", 0, 1), ("URU", "CPV", 1, 1), ("NZL", "EGY", 2, 0),
            ("FRA", "IRQ", 0, 0), ("ARG", "AUT", 1, 1), ("NOR", "SEN", 0, 2), ("JOR", "ALG", 1, 0),
            ("POR", "UZB", 1, 0), ("ENG", "GHA", 0, 0), ("COL", "COD", 0, 1), ("PAN", "CRO", 1, 0),
        ],
        [  # 4 – Rafael (muito preciso — placares exatos em muitos jogos)
            ("MEX", "RSA", 2, 0), ("KOR", "CZE", 1, 1), ("CAN", "BIH", 1, 0), ("USA", "PAR", 2, 1),
            ("QAT", "SUI", 0, 3), ("BRA", "MAR", 2, 0), ("HAI", "SCO", 0, 3), ("AUS", "TUR", 1, 2),
            ("GER", "CUW", 4, 0), ("NED", "JPN", 2, 1), ("CIV", "ECU", 1, 1), ("SWE", "TUN", 1, 0),
            ("ESP", "CPV", 3, 0), ("BEL", "EGY", 2, 0), ("SAU", "URU", 0, 2), ("IRN", "NZL", 0, 0),
            ("FRA", "SEN", 3, 0), ("IRQ", "NOR", 0, 2), ("AUT", "JOR", 2, 1), ("ARG", "ALG", 3, 0),
            ("POR", "COD", 2, 0), ("ENG", "CRO", 3, 1), ("UZB", "COL", 0, 1), ("GHA", "PAN", 1, 1),
            ("CZE", "RSA", 0, 1), ("SUI", "BIH", 3, 0), ("MEX", "KOR", 2, 0), ("CAN", "QAT", 2, 1),
            ("USA", "AUS", 3, 0), ("SCO", "MAR", 0, 2), ("BRA", "HAI", 4, 0), ("TUR", "PAR", 2, 0),
            ("NED", "SWE", 3, 1), ("GER", "CIV", 3, 1), ("TUN", "JPN", 0, 1), ("ECU", "CUW", 2, 1),
            ("ESP", "SAU", 4, 1), ("BEL", "IRN", 1, 0), ("URU", "CPV", 2, 0), ("NZL", "EGY", 1, 1),
            ("FRA", "IRQ", 2, 0), ("ARG", "AUT", 2, 1), ("NOR", "SEN", 1, 0), ("JOR", "ALG", 0, 2),
            ("POR", "UZB", 3, 0), ("ENG", "GHA", 2, 0), ("COL", "COD", 2, 0), ("PAN", "CRO", 0, 2),
        ],
    ]

    for p_idx, pred_list in enumerate(PREDS):
        p = participants[p_idx]
        for home, away, ph, pa in pred_list:
            m = match_idx.get((home, away))
            if m is None:
                continue
            db.session.add(Prediction(
                pool_id=pool.id, user_id=p.id, match_id=m.id,
                predicted_home_score=ph, predicted_away_score=pa, predicts_penalties=False,
            ))
            if p_idx < 3:
                db.session.add(Prediction(
                    pool_id=pool2.id, user_id=p.id, match_id=m.id,
                    predicted_home_score=ph, predicted_away_score=pa, predicts_penalties=False,
                ))
    db.session.flush()

    # ── Award Predictions ─────────────────────────────────────────────────────────
    AWARD_PREDS = [
        (0, "BRA", "FRA", "ARG", "Vinicius Jr.", "Kylian Mbappé"),
        (1, "FRA", "BRA", "GER", "Kylian Mbappé", "Kylian Mbappé"),
        (2, "BRA", "FRA", "ARG", "Neymar Jr.", "Lionel Messi"),
        (3, "ARG", "BRA", "ENG", "Lionel Messi", "Lionel Messi"),
        (4, "BRA", "GER", "FRA", "Vinicius Jr.", "Vinicius Jr."),
    ]
    for p_idx, champ, runner, third, scorer, best in AWARD_PREDS:
        db.session.add(AwardPrediction(
            pool_id=pool.id,
            user_id=participants[p_idx].id,
            champion_team_id=team_map[champ].id,
            runner_up_team_id=team_map[runner].id,
            third_place_team_id=team_map[third].id,
            top_scorer=scorer,
            best_player=best,
        ))

    db.session.commit()
    return "seeded"


@api.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@api.post("/auth/google")
def auth_google():
    """Verify a Google ID token, upsert the User, and issue a session cookie."""
    from datetime import timezone as _tz

    from flask import current_app

    data = _json()
    credential = data.get("credential")
    if not credential:
        abort(400, description="credential is required")

    client_id = current_app.config.get("GOOGLE_CLIENT_ID")
    if not client_id:
        abort(500, description="Google client ID not configured on server")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        id_info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError as exc:
        abort(401, description=f"invalid Google token: {exc}")

    google_id = id_info["sub"]
    email = id_info.get("email", "")
    name = id_info.get("name") or email
    picture = id_info.get("picture")

    user = User.query.filter_by(google_id=google_id).first()
    if user is None:
        user = User(google_id=google_id, email=email, name=name, picture_url=picture)
        db.session.add(user)
    else:
        user.name = name
        user.email = email
        user.picture_url = picture
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    token = make_session_jwt(user.id)
    response = jsonify(_user_payload(user))
    set_cookie(response, token)
    return response


@api.get("/auth/me")
def auth_me():
    user = get_current_user()
    if user is None:
        return jsonify({"error": "not authenticated"}), 401
    return jsonify(_user_payload(user))


@api.post("/auth/logout")
def auth_logout():
    response = jsonify({"ok": True})
    clear_cookie(response)
    return response


# ---------------------------------------------------------------------------
# Pools
# ---------------------------------------------------------------------------

@api.post("/pools")
@require_auth
def create_pool():
    user: User = g.current_user
    data = _json()
    if not data.get("name") or not data.get("tournamentId"):
        abort(400, description="name and tournamentId are required")

    tournament = Tournament.query.get(int(data["tournamentId"]))
    if tournament is None:
        abort(404, description="tournament not found")

    slug = token_urlsafe(8)
    while Pool.query.filter_by(slug=slug).first() is not None:
        slug = token_urlsafe(8)

    scoring = data.get("scoring") or {}
    awards_cfg = data.get("awards") or {}
    creator_nickname = (data.get("creatorNickname") or "").strip()
    creator_display_name = creator_nickname or user.name

    def _award_cfg(key: str, default_enabled: bool, default_pts: int):
        cfg = awards_cfg.get(key) or {}
        return bool(cfg.get("enabled", default_enabled)), int(cfg.get("points", default_pts))

    champion_enabled, champion_pts = _award_cfg("champion", True, 15)
    runner_up_enabled, runner_up_pts = _award_cfg("runnerUp", True, 10)
    third_place_enabled, third_place_pts = _award_cfg("thirdPlace", True, 7)
    top_scorer_enabled, top_scorer_pts = _award_cfg("topScorer", False, 10)
    best_player_enabled, best_player_pts = _award_cfg("bestPlayer", False, 10)

    pool = Pool(
        slug=slug,
        name=data["name"].strip(),
        description=(data.get("description") or "").strip() or None,
        creator_name=user.name,
        creator_user_id=user.id,
        tournament_id=tournament.id,
        exact_score_points=int(scoring.get("exactScore", 5)),
        outcome_points=int(scoring.get("outcome", 3)),
        one_team_goals_points=int(scoring.get("oneTeamGoals", 1)),
        penalty_bonus_points=int(scoring.get("penaltyBonus", 2)),
        predict_champion=champion_enabled,
        champion_points=champion_pts,
        predict_runner_up=runner_up_enabled,
        runner_up_points=runner_up_pts,
        predict_third_place=third_place_enabled,
        third_place_points=third_place_pts,
        predict_top_scorer=top_scorer_enabled,
        top_scorer_points=top_scorer_pts,
        predict_best_player=best_player_enabled,
        best_player_points=best_player_pts,
    )
    db.session.add(pool)
    db.session.flush()

    prizes = data.get("prizes") or []
    for position in [1, 2, 3]:
        prize_data = next((prize for prize in prizes if int(prize.get("position", 0)) == position), None)
        description = (prize_data or {}).get("description") or f"Premio do {position}o lugar"
        db.session.add(PoolPrize(pool_id=pool.id, position=position, description=description.strip()))

    db.session.add(PoolParticipant(pool_id=pool.id, user_id=user.id, display_name=creator_display_name))

    db.session.commit()
    payload = _pool_payload(pool)
    payload["creatorDisplayName"] = creator_display_name
    return jsonify(payload), 201


@api.get("/pools/<slug>")
def get_pool(slug):
    return jsonify(_pool_payload(_pool_or_404(slug)))


@api.post("/pools/<slug>/join")
@require_auth
def join_pool(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    data = _json()
    nickname = (data.get("nickname") or "").strip()
    display_name = nickname or user.name

    membership = PoolParticipant.query.filter_by(pool_id=pool.id, user_id=user.id).first()
    if membership is None:
        membership = PoolParticipant(pool_id=pool.id, user_id=user.id, display_name=display_name)
        db.session.add(membership)
    else:
        membership.display_name = display_name

    db.session.commit()
    return jsonify({"displayName": membership.display_name, "pool": _pool_payload(pool)})


@api.get("/pools/<slug>/matches")
def list_matches(slug):
    pool = _pool_or_404(slug)
    matches = (
        Match.query.filter_by(tournament_id=pool.tournament_id)
        .join(Round)
        .join(Stage, Stage.id == Round.stage_id)
        .order_by(Stage.order, Round.number, Match.starts_at)
        .all()
    )
    tgm = _build_team_group_map(pool.tournament_id)
    return jsonify([_match_payload(m, tgm) for m in matches])


@api.get("/pools/<slug>/predictions")
@require_auth
def list_predictions(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    predictions = Prediction.query.filter_by(pool_id=pool.id, user_id=user.id).all()
    return jsonify([_prediction_payload(p) for p in predictions])


@api.post("/pools/<slug>/predictions")
@require_auth
def upsert_prediction(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    data = _json()
    match = Match.query.filter_by(id=data.get("matchId"), tournament_id=pool.tournament_id).first_or_404()

    if datetime.now(timezone.utc) >= _as_aware_utc(match.starts_at):
        abort(409, description="predictions are locked for this match")

    membership = PoolParticipant.query.filter_by(pool_id=pool.id, user_id=user.id).first()
    if membership is None:
        abort(403, description="user has not joined this pool")

    predicted_home_score = int(data["homeScore"])
    predicted_away_score = int(data["awayScore"])
    predicts_penalties = match.stage.is_knockout and predicted_home_score == predicted_away_score
    penalty_winner_team_id = _parse_optional_int(data.get("penaltyWinnerTeamId"))
    if predicts_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
        abort(400, description="penalty winner is required for knockout draws")

    prediction = Prediction.query.filter_by(pool_id=pool.id, user_id=user.id, match_id=match.id).first()
    if prediction is None:
        prediction = Prediction(pool_id=pool.id, user_id=user.id, match_id=match.id)
        db.session.add(prediction)

    prediction.predicted_home_score = predicted_home_score
    prediction.predicted_away_score = predicted_away_score
    prediction.predicts_penalties = predicts_penalties
    prediction.predicted_penalty_winner_team_id = penalty_winner_team_id if predicts_penalties else None

    db.session.commit()
    return jsonify(_prediction_payload(prediction))


@api.get("/me/pools")
@require_auth
def get_my_pools():
    user: User = g.current_user
    memberships = PoolParticipant.query.filter_by(user_id=user.id).all()

    by_tournament: dict = {}
    for membership in memberships:
        pool = membership.pool
        t = pool.tournament

        rows = (
            db.session.query(
                User.id.label("pid"),
                func.coalesce(func.sum(ScoreEntry.points), 0).label("match_pts"),
            )
            .join(PoolParticipant, PoolParticipant.user_id == User.id)
            .outerjoin(Prediction, (Prediction.pool_id == pool.id) & (Prediction.user_id == User.id))
            .outerjoin(ScoreEntry, ScoreEntry.prediction_id == Prediction.id)
            .filter(PoolParticipant.pool_id == pool.id)
            .group_by(User.id)
            .all()
        )

        totals = {row.pid: int(row.match_pts) + _calculate_award_points(pool, row.pid) for row in rows}
        my_total = totals.get(user.id, 0)
        position = sum(1 for pts in totals.values() if pts > my_total) + 1

        pool_entry = {
            "slug": pool.slug,
            "name": pool.name,
            "creatorName": pool.creator_name,
            "participantsCount": len(rows),
            "myPoints": my_total,
            "myPosition": position,
        }

        if t.id not in by_tournament:
            by_tournament[t.id] = {
                "tournament": {"id": t.id, "name": t.name, "year": t.year, "status": t.status},
                "pools": [],
            }
        by_tournament[t.id]["pools"].append(pool_entry)

    grouped = sorted(by_tournament.values(), key=lambda x: x["tournament"]["year"], reverse=True)
    return jsonify(grouped)


@api.get("/pools/<slug>/ranking")
def get_ranking(slug):
    pool = _pool_or_404(slug)
    _ensure_creator_membership(pool)
    entries = _build_ranking(pool)
    db.session.commit()
    return jsonify([{k: v for k, v in e.items() if k != "userDbId"} for e in entries])


def _build_ranking(pool: Pool) -> list[dict]:
    """Return sorted ranking entries for a pool (recalculates scores first)."""
    _recalculate_scores(pool)
    rows = (
        db.session.query(
            PoolParticipant.display_name,
            User.public_id,
            User.id.label("user_db_id"),
            func.coalesce(func.sum(ScoreEntry.points), 0).label("match_points"),
            func.coalesce(func.sum(func.cast(ScoreEntry.exact_score, db.Integer)), 0).label("exact_scores"),
            func.coalesce(func.sum(func.cast(ScoreEntry.outcome_hit, db.Integer)), 0).label("outcome_hits"),
            func.coalesce(
                func.sum(db.case((Stage.stage_type == StageType.KNOCKOUT.value, ScoreEntry.points), else_=0)), 0
            ).label("knockout_points"),
        )
        .join(User, PoolParticipant.user_id == User.id)
        .outerjoin(Prediction, (Prediction.pool_id == pool.id) & (Prediction.user_id == User.id))
        .outerjoin(ScoreEntry, ScoreEntry.prediction_id == Prediction.id)
        .outerjoin(Match, Match.id == Prediction.match_id)
        .outerjoin(Round, Round.id == Match.round_id)
        .outerjoin(Stage, Stage.id == Round.stage_id)
        .filter(PoolParticipant.pool_id == pool.id)
        .group_by(PoolParticipant.display_name, User.public_id, User.id, PoolParticipant.joined_at)
        .all()
    )
    entries = []
    for row in rows:
        award_pts = _calculate_award_points(pool, row.user_db_id)
        entries.append({
            "userDbId": row.user_db_id,
            "userId": row.public_id,
            "displayName": row.display_name,
            "points": int(row.match_points) + award_pts,
            "exactScores": int(row.exact_scores),
            "outcomeHits": int(row.outcome_hits),
            "knockoutPoints": int(row.knockout_points),
            "awardPoints": award_pts,
        })
    entries.sort(key=lambda e: (-e["points"], -e["exactScores"], -e["outcomeHits"], -e["knockoutPoints"]))
    for i, entry in enumerate(entries):
        entry["position"] = i + 1
    return entries


@api.post("/admin/rounds/<int:round_id>/snapshot")
@require_admin
def generate_round_snapshot(round_id):
    round_ = Round.query.get_or_404(round_id)
    tournament = round_.stage.tournament
    pools = Pool.query.filter_by(tournament_id=tournament.id).all()

    for pool in pools:
        ranking = _build_ranking(pool)

        snapshot = RoundSnapshot.query.filter_by(round_id=round_.id, pool_id=pool.id).first()
        if snapshot is None:
            snapshot = RoundSnapshot(round_id=round_.id, pool_id=pool.id)
            db.session.add(snapshot)
            db.session.flush()
        else:
            RoundSnapshotEntry.query.filter_by(snapshot_id=snapshot.id).delete()
            snapshot.created_at = db.func.now()

        for entry in ranking:
            db.session.add(RoundSnapshotEntry(
                snapshot_id=snapshot.id,
                user_id=entry["userDbId"],
                display_name=entry["displayName"],
                position=entry["position"],
                points=entry["points"],
                exact_scores=entry["exactScores"],
                outcome_hits=entry["outcomeHits"],
                knockout_points=entry["knockoutPoints"],
                award_points=entry["awardPoints"],
            ))

    db.session.commit()
    return jsonify({
        "roundId": round_.id,
        "roundNumber": round_.number,
        "stageName": round_.stage.name,
        "poolsSnapshotted": len(pools),
    })


def _snapshot_payload(snapshot: RoundSnapshot) -> dict:
    round_ = snapshot.round
    stage = round_.stage
    entries = sorted(snapshot.entries, key=lambda e: e.position)
    return {
        "id": snapshot.id,
        "roundId": round_.id,
        "roundNumber": round_.number,
        "stageId": stage.id,
        "stageName": stage.name,
        "stageOrder": stage.order,
        "stageType": stage.stage_type,
        "createdAt": _as_aware_utc(snapshot.created_at).isoformat(),
        "entries": [
            {
                "position": e.position,
                "userId": e.user.public_id,
                "displayName": e.display_name,
                "points": e.points,
                "exactScores": e.exact_scores,
                "outcomeHits": e.outcome_hits,
                "knockoutPoints": e.knockout_points,
                "awardPoints": e.award_points,
            }
            for e in entries
        ],
    }


@api.get("/pools/<slug>/snapshots")
def list_pool_snapshots(slug):
    pool = _pool_or_404(slug)
    snapshots = (
        RoundSnapshot.query.filter_by(pool_id=pool.id)
        .join(Round)
        .join(Stage, Stage.id == Round.stage_id)
        .order_by(Stage.order, Round.number)
        .all()
    )
    return jsonify([_snapshot_payload(s) for s in snapshots])


@api.post("/admin/seed")
def seed_data():
    return jsonify({"status": seed_database()})


@api.post("/admin/matches/<int:match_id>/result")
@require_admin
def update_match_result(match_id):
    match = Match.query.get_or_404(match_id)
    data = _json()
    home_score = int(data["homeScore"])
    away_score = int(data["awayScore"])
    went_to_penalties = match.round.stage.is_knockout and home_score == away_score
    penalty_winner_team_id = _parse_optional_int(data.get("penaltyWinnerTeamId"))
    if went_to_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
        abort(400, description="penalty winner is required for knockout draws")

    match.home_score = home_score
    match.away_score = away_score
    match.went_to_penalties = went_to_penalties
    match.penalty_winner_team_id = penalty_winner_team_id if went_to_penalties else None
    match.status = MatchStatus.FINISHED.value

    for pool in Pool.query.filter_by(tournament_id=match.tournament_id).all():
        _recalculate_scores(pool)

    db.session.commit()
    return jsonify(_match_payload(match))


# ---------------------------------------------------------------------------
# Admin — tournaments
# ---------------------------------------------------------------------------

def _tournament_payload(tournament: Tournament):
    return {
        "id": tournament.id,
        "name": tournament.name,
        "year": tournament.year,
        "status": tournament.status,
        "stagesCount": len(tournament.stages),
        "matchesCount": len(tournament.matches),
        "poolsCount": len(tournament.pools),
        "awards": {
            "championTeamId": tournament.champion_team_id,
            "championTeam": _team_payload(tournament.champion) if tournament.champion_team_id else None,
            "runnerUpTeamId": tournament.runner_up_team_id,
            "runnerUpTeam": _team_payload(tournament.runner_up) if tournament.runner_up_team_id else None,
            "thirdPlaceTeamId": tournament.third_place_team_id,
            "thirdPlaceTeam": _team_payload(tournament.third_place) if tournament.third_place_team_id else None,
            "topScorer": tournament.top_scorer,
            "bestPlayer": tournament.best_player,
        },
    }


def _award_prediction_payload(award_pred: AwardPrediction):
    return {
        "id": award_pred.id,
        "championTeamId": award_pred.champion_team_id,
        "runnerUpTeamId": award_pred.runner_up_team_id,
        "thirdPlaceTeamId": award_pred.third_place_team_id,
        "topScorer": award_pred.top_scorer,
        "bestPlayer": award_pred.best_player,
        "updatedAt": award_pred.updated_at.isoformat(),
    }


def _assert_tournament_editable(tournament: Tournament):
    if tournament.status == TournamentStatus.FINISHED.value:
        abort(403, description="O torneio está encerrado e não pode ser editado")


def _calculate_award_points(pool: Pool, user_db_id: int) -> int:
    tournament = pool.tournament
    award_pred = AwardPrediction.query.filter_by(pool_id=pool.id, user_id=user_db_id).first()
    if award_pred is None:
        return 0
    points = 0
    if pool.predict_champion and tournament.champion_team_id:
        if award_pred.champion_team_id == tournament.champion_team_id:
            points += pool.champion_points
    if pool.predict_runner_up and tournament.runner_up_team_id:
        if award_pred.runner_up_team_id == tournament.runner_up_team_id:
            points += pool.runner_up_points
    if pool.predict_third_place and tournament.third_place_team_id:
        if award_pred.third_place_team_id == tournament.third_place_team_id:
            points += pool.third_place_points
    if pool.predict_top_scorer and tournament.top_scorer and award_pred.top_scorer:
        if award_pred.top_scorer.strip().lower() == tournament.top_scorer.strip().lower():
            points += pool.top_scorer_points
    if pool.predict_best_player and tournament.best_player and award_pred.best_player:
        if award_pred.best_player.strip().lower() == tournament.best_player.strip().lower():
            points += pool.best_player_points
    return points


def _stage_payload(stage: Stage):
    return {
        "id": stage.id,
        "name": stage.name,
        "order": stage.order,
        "stageType": stage.stage_type,
        "isKnockout": stage.is_knockout,
        "groups": [_group_payload(g) for g in sorted(stage.groups, key=lambda g: g.name)],
        "rounds": [_round_payload(r) for r in sorted(stage.rounds, key=lambda r: r.number)],
    }


def _team_full_payload(team: Team):
    return {"id": team.id, "name": team.name, "shortName": team.short_name, "teamType": team.team_type}


def _group_payload(group: TournamentGroup):
    return {"id": group.id, "name": group.name, "stageId": group.stage_id}


def _build_team_group_map(tournament_id: int) -> dict:
    """Returns {team_id: TournamentGroup} for teams assigned to a group."""
    entries = (
        TournamentTeam.query
        .filter_by(tournament_id=tournament_id)
        .filter(TournamentTeam.group_id.isnot(None))
        .all()
    )
    return {e.team_id: e.group for e in entries}


@api.get("/admin/tournaments")
def list_tournaments():
    tournaments = Tournament.query.order_by(Tournament.year.desc(), Tournament.id.desc()).all()
    return jsonify([_tournament_payload(t) for t in tournaments])


@api.post("/admin/tournaments")
@require_admin
def create_tournament():
    data = _json()
    name = (data.get("name") or "").strip()
    year = data.get("year")
    if not name or not year:
        abort(400, description="name and year are required")
    tournament = Tournament(name=name, year=int(year))
    db.session.add(tournament)
    db.session.commit()
    return jsonify(_tournament_payload(tournament)), 201


@api.patch("/admin/tournaments/<int:tournament_id>/status")
@require_admin
def update_tournament_status(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    data = _json()
    new_status = data.get("status")
    valid = [s.value for s in TournamentStatus]
    if new_status not in valid:
        abort(400, description=f"status must be one of: {', '.join(valid)}")
    tournament.status = new_status
    db.session.commit()
    return jsonify(_tournament_payload(tournament))


@api.get("/admin/tournaments/<int:tournament_id>/stages")
def list_stages(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    stages = sorted(tournament.stages, key=lambda s: s.order)
    return jsonify([_stage_payload(s) for s in stages])


@api.post("/admin/tournaments/<int:tournament_id>/stages")
@require_admin
def create_stage(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    _assert_tournament_editable(tournament)
    data = _json()
    name = (data.get("name") or "").strip()
    order = data.get("order")
    if not name or order is None:
        abort(400, description="name and order are required")
    stage = Stage(
        tournament_id=tournament_id,
        name=name,
        order=int(order),
        stage_type=(data.get("stageType") or StageType.GROUP.value),
    )
    db.session.add(stage)
    db.session.commit()
    return jsonify(_stage_payload(stage)), 201


@api.patch("/admin/stages/<int:stage_id>")
@require_admin
def update_stage(stage_id):
    stage = Stage.query.get_or_404(stage_id)
    _assert_tournament_editable(stage.tournament)
    data = _json()
    if "name" in data:
        stage.name = (data["name"] or "").strip() or stage.name
    if "order" in data:
        stage.order = int(data["order"])
    if "stageType" in data and data["stageType"] in [t.value for t in StageType]:
        stage.stage_type = data["stageType"]
    db.session.commit()
    return jsonify(_stage_payload(stage))


# ---------------------------------------------------------------------------
# Admin — rounds
# ---------------------------------------------------------------------------

@api.get("/admin/stages/<int:stage_id>/rounds")
def list_rounds(stage_id):
    stage = Stage.query.get_or_404(stage_id)
    rounds = sorted(stage.rounds, key=lambda r: r.number)
    return jsonify([_round_payload(r) for r in rounds])


@api.post("/admin/stages/<int:stage_id>/rounds")
@require_admin
def create_round(stage_id):
    stage = Stage.query.get_or_404(stage_id)
    _assert_tournament_editable(stage.tournament)
    data = _json()
    number = data.get("number")
    if number is None:
        abort(400, description="number is required")
    round_ = Round(stage_id=stage_id, number=int(number))
    db.session.add(round_)
    db.session.commit()
    return jsonify(_round_payload(round_)), 201


@api.patch("/admin/rounds/<int:round_id>")
@require_admin
def update_round(round_id):
    round_ = Round.query.get_or_404(round_id)
    _assert_tournament_editable(round_.stage.tournament)
    data = _json()
    if "number" in data:
        round_.number = int(data["number"])
    db.session.commit()
    return jsonify(_round_payload(round_))


@api.delete("/admin/rounds/<int:round_id>")
@require_admin
def delete_round(round_id):
    round_ = Round.query.get_or_404(round_id)
    _assert_tournament_editable(round_.stage.tournament)
    for match in list(round_.matches):
        _delete_match_cascade(match)
    db.session.delete(round_)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin — teams
# ---------------------------------------------------------------------------

@api.get("/admin/teams")
def list_teams():
    teams = Team.query.order_by(Team.name).all()
    return jsonify([_team_full_payload(t) for t in teams])


@api.post("/admin/teams")
@require_admin
def create_team():
    data = _json()
    name = (data.get("name") or "").strip()
    short_name = (data.get("shortName") or "").strip() or None
    team_type = (data.get("teamType") or TeamType.NATIONAL.value).strip()
    if not name:
        abort(400, description="name is required")
    if team_type not in [t.value for t in TeamType]:
        abort(400, description="teamType must be 'club' or 'national'")
    team = Team(name=name, short_name=short_name, team_type=team_type)
    db.session.add(team)
    db.session.commit()
    return jsonify(_team_full_payload(team)), 201


def _tournament_team_payload(entry: TournamentTeam) -> dict:
    return {
        **_team_full_payload(entry.team),
        "groupId": entry.group_id,
        "groupName": entry.group.name if entry.group else None,
    }


@api.get("/admin/tournaments/<int:tournament_id>/teams")
def list_tournament_teams(tournament_id):
    Tournament.query.get_or_404(tournament_id)
    entries = TournamentTeam.query.filter_by(tournament_id=tournament_id).all()
    return jsonify([_tournament_team_payload(e) for e in entries])


@api.post("/admin/tournaments/<int:tournament_id>/teams")
@require_admin
def add_tournament_team(tournament_id):
    Tournament.query.get_or_404(tournament_id)
    data = _json()
    team_id = data.get("teamId")
    if not team_id:
        abort(400, description="teamId is required")
    Team.query.get_or_404(team_id)
    existing = TournamentTeam.query.filter_by(tournament_id=tournament_id, team_id=team_id).first()
    if existing:
        abort(409, description="team already in tournament")
    entry = TournamentTeam(tournament_id=tournament_id, team_id=team_id)
    db.session.add(entry)
    db.session.commit()
    return jsonify({"tournamentId": tournament_id, "teamId": team_id}), 201


@api.delete("/admin/tournaments/<int:tournament_id>/teams/<int:team_id>")
@require_admin
def remove_tournament_team(tournament_id, team_id):
    entry = TournamentTeam.query.filter_by(tournament_id=tournament_id, team_id=team_id).first_or_404()
    db.session.delete(entry)
    db.session.commit()
    return "", 204


@api.patch("/admin/tournaments/<int:tournament_id>/teams/<int:team_id>/group")
@require_admin
def assign_team_group(tournament_id, team_id):
    entry = TournamentTeam.query.filter_by(tournament_id=tournament_id, team_id=team_id).first_or_404()
    data = _json()
    group_id = _parse_optional_int(data.get("groupId"))
    if group_id is not None:
        group = TournamentGroup.query.get_or_404(group_id)
        if group.stage.tournament_id != tournament_id:
            abort(400, description="group does not belong to this tournament")
    entry.group_id = group_id
    db.session.commit()
    return jsonify(_tournament_team_payload(entry))


@api.get("/admin/tournaments/<int:tournament_id>/groups")
def list_tournament_groups(tournament_id):
    Tournament.query.get_or_404(tournament_id)
    stages = Stage.query.filter_by(tournament_id=tournament_id, stage_type=StageType.GROUP.value).all()
    groups = []
    for stage in stages:
        for g in stage.groups:
            groups.append(_group_payload(g))
    groups.sort(key=lambda g: g["name"])
    return jsonify(groups)


@api.post("/admin/stages/<int:stage_id>/groups")
@require_admin
def create_group(stage_id):
    stage = Stage.query.get_or_404(stage_id)
    if stage.stage_type != StageType.GROUP.value:
        abort(400, description="groups can only be created for group-type stages")
    data = _json()
    name = (data.get("name") or "").strip()
    if not name:
        abort(400, description="name is required")
    group = TournamentGroup(stage_id=stage_id, name=name)
    db.session.add(group)
    db.session.commit()
    return jsonify(_group_payload(group)), 201


@api.patch("/admin/groups/<int:group_id>")
@require_admin
def update_group(group_id):
    group = TournamentGroup.query.get_or_404(group_id)
    data = _json()
    if "name" in data:
        group.name = (data["name"] or "").strip() or group.name
    db.session.commit()
    return jsonify(_group_payload(group))


@api.delete("/admin/groups/<int:group_id>")
@require_admin
def delete_group(group_id):
    group = TournamentGroup.query.get_or_404(group_id)
    TournamentTeam.query.filter_by(group_id=group_id).update({"group_id": None})
    db.session.delete(group)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin — matches
# ---------------------------------------------------------------------------

@api.get("/admin/tournaments/<int:tournament_id>/matches")
def list_tournament_matches(tournament_id):
    Tournament.query.get_or_404(tournament_id)
    matches = (
        Match.query.filter_by(tournament_id=tournament_id)
        .join(Round)
        .join(Stage, Stage.id == Round.stage_id)
        .order_by(Stage.order, Round.number, Match.starts_at)
        .all()
    )
    tgm = _build_team_group_map(tournament_id)
    return jsonify([_match_payload(m, tgm) for m in matches])


@api.post("/admin/tournaments/<int:tournament_id>/matches")
@require_admin
def create_match(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    _assert_tournament_editable(tournament)
    data = _json()
    round_id = data.get("roundId")
    starts_at_raw = data.get("startsAt")
    if not round_id or not starts_at_raw:
        abort(400, description="roundId and startsAt are required")
    round_ = Round.query.get_or_404(int(round_id))
    if round_.stage.tournament_id != tournament_id:
        abort(400, description="round does not belong to this tournament")
    match = Match(
        tournament_id=tournament_id,
        round_id=round_.id,
        home_team_id=_parse_optional_int(data.get("homeTeamId")),
        away_team_id=_parse_optional_int(data.get("awayTeamId")),
        starts_at=_parse_starts_at(starts_at_raw),
        venue=data.get("venue") or None,
    )
    db.session.add(match)
    db.session.commit()
    return jsonify(_match_payload(match)), 201


@api.patch("/admin/matches/<int:match_id>")
@require_admin
def update_match(match_id):
    match = Match.query.get_or_404(match_id)
    _assert_tournament_editable(match.tournament)
    data = _json()

    if "roundId" in data:
        round_ = Round.query.get_or_404(int(data["roundId"]))
        if round_.stage.tournament_id != match.tournament_id:
            abort(400, description="round does not belong to this tournament")
        match.round_id = round_.id
    if "homeTeamId" in data:
        match.home_team_id = _parse_optional_int(data["homeTeamId"])
    if "awayTeamId" in data:
        match.away_team_id = _parse_optional_int(data["awayTeamId"])
    if "startsAt" in data:
        match.starts_at = _parse_starts_at(data["startsAt"])
    if "venue" in data:
        match.venue = data["venue"] or None
    if "status" in data and data["status"] in [s.value for s in MatchStatus]:
        match.status = data["status"]

    if "homeScore" in data and "awayScore" in data:
        home_score = int(data["homeScore"])
        away_score = int(data["awayScore"])
        went_to_penalties = match.round.stage.is_knockout and home_score == away_score
        penalty_winner_team_id = _parse_optional_int(data.get("penaltyWinnerTeamId"))
        if went_to_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
            abort(400, description="penalty winner is required for knockout draws")
        match.home_score = home_score
        match.away_score = away_score
        match.went_to_penalties = went_to_penalties
        match.penalty_winner_team_id = penalty_winner_team_id if went_to_penalties else None
        match.status = MatchStatus.FINISHED.value
        for pool in Pool.query.filter_by(tournament_id=match.tournament_id).all():
            _recalculate_scores(pool)

    db.session.commit()
    return jsonify(_match_payload(match))


@api.delete("/admin/matches/<int:match_id>")
@require_admin
def delete_match(match_id):
    match = Match.query.get_or_404(match_id)
    _assert_tournament_editable(match.tournament)
    _delete_match_cascade(match)
    db.session.commit()
    return "", 204


def _delete_match_cascade(match: Match) -> None:
    for pred in list(match.predictions):
        if hasattr(pred, "score_entry") and pred.score_entry:
            db.session.delete(pred.score_entry)
        db.session.delete(pred)
    db.session.delete(match)


@api.delete("/admin/stages/<int:stage_id>")
@require_admin
def delete_stage(stage_id):
    stage = Stage.query.get_or_404(stage_id)
    _assert_tournament_editable(stage.tournament)
    for round_ in list(stage.rounds):
        for match in list(round_.matches):
            _delete_match_cascade(match)
        db.session.delete(round_)
    for group in list(stage.groups):
        TournamentTeam.query.filter_by(group_id=group.id).update({"group_id": None})
        db.session.delete(group)
    db.session.delete(stage)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin — pools per tournament
# ---------------------------------------------------------------------------

@api.get("/tournaments")
def list_tournaments_public():
    tournaments = Tournament.query.order_by(Tournament.year.desc(), Tournament.id.desc()).all()
    return jsonify([
        {"id": t.id, "name": t.name, "year": t.year, "status": t.status}
        for t in tournaments
    ])


@api.get("/teams")
def list_teams_public():
    teams = Team.query.order_by(Team.name).all()
    return jsonify([_team_full_payload(t) for t in teams])


@api.get("/tournaments/<int:tournament_id>/teams")
def list_tournament_teams_public(tournament_id):
    Tournament.query.get_or_404(tournament_id)
    entries = (
        TournamentTeam.query.filter_by(tournament_id=tournament_id)
        .join(Team)
        .order_by(Team.name)
        .all()
    )
    return jsonify([_team_full_payload(e.team) for e in entries])


@api.get("/pools/<slug>/award-prediction")
@require_auth
def get_award_prediction(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    award_pred = AwardPrediction.query.filter_by(pool_id=pool.id, user_id=user.id).first()
    return jsonify({
        "isLocked": _awards_locked(pool),
        "prediction": _award_prediction_payload(award_pred) if award_pred else None,
    })


@api.post("/pools/<slug>/award-prediction")
@require_auth
def upsert_award_prediction(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    data = _json()
    membership = PoolParticipant.query.filter_by(pool_id=pool.id, user_id=user.id).first()
    if membership is None:
        abort(403, description="user has not joined this pool")
    if _awards_locked(pool):
        abort(409, description="award predictions are locked")
    award_pred = AwardPrediction.query.filter_by(pool_id=pool.id, user_id=user.id).first()
    if award_pred is None:
        award_pred = AwardPrediction(pool_id=pool.id, user_id=user.id)
        db.session.add(award_pred)
    if pool.predict_champion:
        award_pred.champion_team_id = _parse_optional_int(data.get("championTeamId"))
    if pool.predict_runner_up:
        award_pred.runner_up_team_id = _parse_optional_int(data.get("runnerUpTeamId"))
    if pool.predict_third_place:
        award_pred.third_place_team_id = _parse_optional_int(data.get("thirdPlaceTeamId"))
    if pool.predict_top_scorer:
        award_pred.top_scorer = (data.get("topScorer") or "").strip() or None
    if pool.predict_best_player:
        award_pred.best_player = (data.get("bestPlayer") or "").strip() or None
    db.session.commit()
    return jsonify(_award_prediction_payload(award_pred))


@api.patch("/admin/tournaments/<int:tournament_id>/awards")
@require_admin
def update_tournament_awards(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    _assert_tournament_editable(tournament)
    data = _json()
    if "championTeamId" in data:
        tournament.champion_team_id = _parse_optional_int(data["championTeamId"])
    if "runnerUpTeamId" in data:
        tournament.runner_up_team_id = _parse_optional_int(data["runnerUpTeamId"])
    if "thirdPlaceTeamId" in data:
        tournament.third_place_team_id = _parse_optional_int(data["thirdPlaceTeamId"])
    if "topScorer" in data:
        tournament.top_scorer = (data["topScorer"] or "").strip() or None
    if "bestPlayer" in data:
        tournament.best_player = (data["bestPlayer"] or "").strip() or None
    db.session.commit()
    return jsonify(_tournament_payload(tournament))


@api.get("/admin/tournaments/<int:tournament_id>/pools")
def list_tournament_pools(tournament_id):
    Tournament.query.get_or_404(tournament_id)
    pools = Pool.query.filter_by(tournament_id=tournament_id).order_by(Pool.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": pool.id,
                "slug": pool.slug,
                "name": pool.name,
                "creatorName": pool.creator_name,
                "participantsCount": len(pool.memberships),
                "createdAt": _as_aware_utc(pool.created_at).isoformat(),
            }
            for pool in pools
        ]
    )
