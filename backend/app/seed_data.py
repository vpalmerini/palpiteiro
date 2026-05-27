"""Demo seed data for local development and tests."""

from __future__ import annotations

from datetime import datetime, timezone

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


def _parse_starts_at(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def seed_database() -> str:  # noqa: C901
    if Tournament.active().first() is not None:
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
