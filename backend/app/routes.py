from __future__ import annotations

from datetime import datetime, timezone
from secrets import token_urlsafe

from flask import Blueprint, abort, jsonify, request
from sqlalchemy import func

from .extensions import db
from .models import (
    Match,
    MatchStatus,
    Participant,
    Pool,
    PoolParticipant,
    PoolPrize,
    Prediction,
    ScoreEntry,
    Stage,
    Team,
    Tournament,
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


def _pool_or_404(slug: str) -> Pool:
    return Pool.query.filter_by(slug=slug).first_or_404()


def _participant_or_404(public_id: str) -> Participant:
    return Participant.query.filter_by(public_id=public_id).first_or_404()


def _team_payload(team: Team | None):
    if team is None:
        return None
    return {"id": team.id, "name": team.name, "shortName": team.short_name}


def _match_payload(match: Match):
    return {
        "id": match.id,
        "stage": {
            "id": match.stage.id,
            "name": match.stage.name,
            "isKnockout": match.stage.is_knockout,
        },
        "homeTeam": _team_payload(match.home_team),
        "awayTeam": _team_payload(match.away_team),
        "startsAt": _as_aware_utc(match.starts_at).isoformat(),
        "status": match.status,
        "homeScore": match.home_score,
        "awayScore": match.away_score,
        "wentToPenalties": match.went_to_penalties,
        "penaltyWinnerTeamId": match.penalty_winner_team_id,
        "isLocked": datetime.now(timezone.utc) >= _as_aware_utc(match.starts_at),
    }


def _pool_payload(pool: Pool):
    prizes = sorted(pool.prizes, key=lambda prize: prize.position)
    return {
        "id": pool.id,
        "slug": pool.slug,
        "name": pool.name,
        "description": pool.description,
        "creatorName": pool.creator_name,
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
    }


def _prediction_payload(prediction: Prediction):
    return {
        "id": prediction.id,
        "matchId": prediction.match_id,
        "participantId": prediction.participant.public_id,
        "homeScore": prediction.predicted_home_score,
        "awayScore": prediction.predicted_away_score,
        "predictsPenalties": prediction.predicts_penalties,
        "penaltyWinnerTeamId": prediction.predicted_penalty_winner_team_id,
        "updatedAt": prediction.updated_at.isoformat(),
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
    if PoolParticipant.query.filter_by(pool_id=pool.id).first() is not None:
        return

    creator = Participant(name=pool.creator_name)
    db.session.add(creator)
    db.session.flush()
    db.session.add(
        PoolParticipant(
            pool_id=pool.id,
            participant_id=creator.id,
            display_name=pool.creator_name,
        )
    )


def seed_database() -> str:
    if Tournament.query.first() is not None:
        return "already_seeded"

    tournament = Tournament(name="Copa do Mundo", year=2026)
    db.session.add(tournament)
    db.session.flush()

    teams = [
        Team(name="Brasil", short_name="BRA"),
        Team(name="Argentina", short_name="ARG"),
        Team(name="Franca", short_name="FRA"),
        Team(name="Alemanha", short_name="ALE"),
        Team(name="Espanha", short_name="ESP"),
        Team(name="Inglaterra", short_name="ING"),
    ]
    db.session.add_all(teams)
    db.session.flush()

    group_stage = Stage(tournament_id=tournament.id, name="Fase de grupos", order=1, is_knockout=False)
    round_16 = Stage(tournament_id=tournament.id, name="Oitavas", order=2, is_knockout=True)
    db.session.add_all([group_stage, round_16])
    db.session.flush()

    matches = [
        Match(
            tournament_id=tournament.id,
            stage_id=group_stage.id,
            home_team_id=teams[0].id,
            away_team_id=teams[1].id,
            starts_at=_parse_starts_at("2026-06-11T19:00:00Z"),
        ),
        Match(
            tournament_id=tournament.id,
            stage_id=group_stage.id,
            home_team_id=teams[2].id,
            away_team_id=teams[3].id,
            starts_at=_parse_starts_at("2026-06-12T16:00:00Z"),
        ),
        Match(
            tournament_id=tournament.id,
            stage_id=round_16.id,
            home_team_id=teams[4].id,
            away_team_id=teams[5].id,
            starts_at=_parse_starts_at("2026-06-28T19:00:00Z"),
        ),
    ]
    db.session.add_all(matches)
    db.session.commit()

    return "seeded"


@api.get("/health")
def health():
    return {"status": "ok"}


@api.post("/pools")
def create_pool():
    data = _json()
    required = ["name", "creatorName", "creatorEmail"]
    if any(not data.get(field) for field in required):
        abort(400, description="name, creatorName and creatorEmail are required")

    tournament = Tournament.query.order_by(Tournament.id).first()
    if tournament is None:
        abort(400, description="seed tournament data before creating a pool")

    slug = token_urlsafe(8)
    while Pool.query.filter_by(slug=slug).first() is not None:
        slug = token_urlsafe(8)

    scoring = data.get("scoring") or {}
    creator_name = data["creatorName"].strip()
    creator_email = data["creatorEmail"].strip()
    creator_nickname = (data.get("creatorNickname") or "").strip()
    creator_display_name = creator_nickname or creator_name
    pool = Pool(
        slug=slug,
        name=data["name"].strip(),
        description=(data.get("description") or "").strip() or None,
        creator_name=creator_name,
        tournament_id=tournament.id,
        exact_score_points=int(scoring.get("exactScore", 5)),
        outcome_points=int(scoring.get("outcome", 3)),
        one_team_goals_points=int(scoring.get("oneTeamGoals", 1)),
        penalty_bonus_points=int(scoring.get("penaltyBonus", 2)),
    )
    db.session.add(pool)
    db.session.flush()

    prizes = data.get("prizes") or []
    for position in [1, 2, 3]:
        prize_data = next((prize for prize in prizes if int(prize.get("position", 0)) == position), None)
        description = (prize_data or {}).get("description") or f"Premio do {position}o lugar"
        db.session.add(PoolPrize(pool_id=pool.id, position=position, description=description.strip()))

    creator = Participant(name=creator_name, email=creator_email)
    db.session.add(creator)
    db.session.flush()
    db.session.add(
        PoolParticipant(
            pool_id=pool.id,
            participant_id=creator.id,
            display_name=creator_display_name,
        )
    )

    db.session.commit()
    payload = _pool_payload(pool)
    payload["creatorParticipantId"] = creator.public_id
    payload["creatorDisplayName"] = creator_display_name
    return jsonify(payload), 201


@api.get("/pools/<slug>")
def get_pool(slug):
    return jsonify(_pool_payload(_pool_or_404(slug)))


@api.post("/pools/<slug>/join")
def join_pool(slug):
    pool = _pool_or_404(slug)
    data = _json()
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    nickname = (data.get("nickname") or "").strip()
    display_name = nickname or name
    if not name or not email:
        abort(400, description="name and email are required")

    participant_public_id = data.get("participantId")
    participant = (
        Participant.query.filter_by(public_id=participant_public_id).first()
        if participant_public_id
        else None
    )
    if participant is None:
        participant = Participant(name=name, email=email)
        db.session.add(participant)
        db.session.flush()
    else:
        participant.name = name
        participant.email = email

    membership = PoolParticipant.query.filter_by(
        pool_id=pool.id,
        participant_id=participant.id,
    ).first()
    if membership is None:
        membership = PoolParticipant(
            pool_id=pool.id,
            participant_id=participant.id,
            display_name=display_name,
        )
        db.session.add(membership)
    else:
        membership.display_name = display_name

    db.session.commit()
    return jsonify(
        {
            "participantId": participant.public_id,
            "displayName": membership.display_name,
            "pool": _pool_payload(pool),
        }
    )


@api.get("/pools/<slug>/matches")
def list_matches(slug):
    pool = _pool_or_404(slug)
    matches = (
        Match.query.filter_by(tournament_id=pool.tournament_id)
        .join(Stage)
        .order_by(Stage.order, Match.starts_at)
        .all()
    )
    return jsonify([_match_payload(match) for match in matches])


@api.get("/pools/<slug>/predictions")
def list_predictions(slug):
    pool = _pool_or_404(slug)
    participant_id = request.args.get("participantId")
    query = Prediction.query.filter_by(pool_id=pool.id)
    if participant_id:
        participant = _participant_or_404(participant_id)
        query = query.filter_by(participant_id=participant.id)

    return jsonify([_prediction_payload(prediction) for prediction in query.all()])


@api.post("/pools/<slug>/predictions")
def upsert_prediction(slug):
    pool = _pool_or_404(slug)
    data = _json()
    participant = _participant_or_404(data.get("participantId", ""))
    match = Match.query.filter_by(id=data.get("matchId"), tournament_id=pool.tournament_id).first_or_404()

    if datetime.now(timezone.utc) >= _as_aware_utc(match.starts_at):
        abort(409, description="predictions are locked for this match")

    membership = PoolParticipant.query.filter_by(pool_id=pool.id, participant_id=participant.id).first()
    if membership is None:
        abort(403, description="participant has not joined this pool")

    predicted_home_score = int(data["homeScore"])
    predicted_away_score = int(data["awayScore"])
    predicts_penalties = match.stage.is_knockout and predicted_home_score == predicted_away_score
    penalty_winner_team_id = _parse_optional_int(data.get("penaltyWinnerTeamId"))
    if predicts_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
        abort(400, description="penalty winner is required for knockout draws")

    prediction = Prediction.query.filter_by(
        pool_id=pool.id,
        participant_id=participant.id,
        match_id=match.id,
    ).first()
    if prediction is None:
        prediction = Prediction(pool_id=pool.id, participant_id=participant.id, match_id=match.id)
        db.session.add(prediction)

    prediction.predicted_home_score = predicted_home_score
    prediction.predicted_away_score = predicted_away_score
    prediction.predicts_penalties = predicts_penalties
    prediction.predicted_penalty_winner_team_id = penalty_winner_team_id if predicts_penalties else None

    db.session.commit()
    return jsonify(_prediction_payload(prediction))


@api.get("/pools/<slug>/ranking")
def get_ranking(slug):
    pool = _pool_or_404(slug)
    _ensure_creator_membership(pool)
    _recalculate_scores(pool)
    db.session.commit()

    rows = (
        db.session.query(
            PoolParticipant.display_name,
            Participant.public_id,
            func.coalesce(func.sum(ScoreEntry.points), 0).label("points"),
            func.coalesce(func.sum(func.cast(ScoreEntry.exact_score, db.Integer)), 0).label("exact_scores"),
            func.coalesce(func.sum(func.cast(ScoreEntry.outcome_hit, db.Integer)), 0).label("outcome_hits"),
        )
        .join(Participant, PoolParticipant.participant_id == Participant.id)
        .outerjoin(Prediction, (Prediction.pool_id == pool.id) & (Prediction.participant_id == Participant.id))
        .outerjoin(ScoreEntry, ScoreEntry.prediction_id == Prediction.id)
        .filter(PoolParticipant.pool_id == pool.id)
        .group_by(PoolParticipant.display_name, Participant.public_id, PoolParticipant.joined_at)
        .order_by(
            db.desc("points"),
            db.desc("exact_scores"),
            db.desc("outcome_hits"),
            PoolParticipant.joined_at,
        )
        .all()
    )

    return jsonify(
        [
            {
                "position": index + 1,
                "displayName": row.display_name,
                "participantId": row.public_id,
                "points": int(row.points),
                "exactScores": int(row.exact_scores),
                "outcomeHits": int(row.outcome_hits),
            }
            for index, row in enumerate(rows)
        ]
    )


@api.post("/admin/seed")
def seed_data():
    return jsonify({"status": seed_database()})


@api.post("/admin/matches/<int:match_id>/result")
def update_match_result(match_id):
    match = Match.query.get_or_404(match_id)
    data = _json()
    home_score = int(data["homeScore"])
    away_score = int(data["awayScore"])
    went_to_penalties = match.stage.is_knockout and home_score == away_score
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
