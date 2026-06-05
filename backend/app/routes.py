from __future__ import annotations

import time
from datetime import datetime, timezone
from secrets import token_urlsafe

from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy import func
from sqlalchemy.orm import contains_eager, joinedload, load_only, selectinload

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

MAX_POOLS_PER_USER_PER_TOURNAMENT = 5
MAX_PARTICIPANTS_PER_POOL = 30
from .seed_data import seed_database
from .team_list_cache import get_cached_team_list, invalidate_team_list_cache, set_cached_team_list
from .tournament_teams_cache import (
    get_cached_tournament_teams,
    invalidate_tournament_teams_cache,
    set_cached_tournament_teams,
)
from .soft_delete import (
    replace_snapshot_entries,
    soft_delete_group,
    soft_delete_match,
    soft_delete_round,
    soft_delete_stage,
    soft_delete_tournament_team,
)

api = Blueprint("api", __name__, url_prefix="/api")

_AWARDS_LOCK_CACHE_TTL_SECONDS = 30
_awards_lock_cache: dict[str, tuple[float, bool]] = {}
_first_match_cache: dict[str, tuple[float, datetime | None]] = {}


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
    """Lock award predictions once the tournament has started or finished."""
    tournament = pool.tournament
    if tournament.status == TournamentStatus.FINISHED.value:
        return True

    now = datetime.now(timezone.utc)
    if tournament.starts_at is not None:
        return now >= _as_aware_utc(tournament.starts_at)

    cached_lock = _awards_lock_cache.get(tournament.id)
    if cached_lock is not None:
        expires_at, locked = cached_lock
        if time.monotonic() < expires_at:
            return locked

    first_starts_at = _first_match_starts_at(tournament.id)
    if first_starts_at is None:
        locked = False
    else:
        locked = now >= _as_aware_utc(first_starts_at)

    _awards_lock_cache[tournament.id] = (time.monotonic() + _AWARDS_LOCK_CACHE_TTL_SECONDS, locked)
    return locked


def _first_match_starts_at(tournament_id: str) -> datetime | None:
    cached = _first_match_cache.get(tournament_id)
    if cached is not None:
        expires_at, starts_at = cached
        if time.monotonic() < expires_at:
            return starts_at

    first_match = (
        Match.active()
        .filter_by(tournament_id=tournament_id)
        .order_by(Match.starts_at.asc())
        .with_entities(Match.starts_at)
        .first()
    )
    starts_at = first_match[0] if first_match else None
    _first_match_cache[tournament_id] = (time.monotonic() + _AWARDS_LOCK_CACHE_TTL_SECONDS, starts_at)
    return starts_at


def _pool_or_404(slug: str) -> Pool:
    return (
        Pool.active()
        .filter_by(slug=slug)
        .options(
            joinedload(Pool.tournament),
            joinedload(Pool.creator),
            selectinload(Pool.prizes),
        )
        .first_or_404()
    )


def _pool_for_write_or_404(slug: str, *, load_tournament: bool = False) -> Pool:
    """Lightweight pool lookup for mutation endpoints."""
    query = Pool.active().filter_by(slug=slug)
    if load_tournament:
        query = query.options(joinedload(Pool.tournament))
    return query.first_or_404()


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "pictureUrl": user.picture_url,
        "isAdmin": user.is_admin,
    }


def _team_payload(team: Team | None):
    if team is None:
        return None
    return {
        "id": team.id,
        "name": team.name,
        "shortName": team.short_name,
        "teamType": team.team_type,
        "flagCode": team.flag_code,
        "logoUrl": team.logo_url,
    }


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


def _pool_payload(pool: Pool, *, is_participant: bool | None = None):
    prizes = sorted(
        (prize for prize in pool.prizes if prize.deleted_at is None),
        key=lambda prize: prize.position,
    )
    if is_participant is None:
        current_user = g.get("current_user") or get_current_user()
        is_participant = False
        if current_user:
            is_participant = PoolParticipant.active().filter_by(
                pool_id=pool.id, user_id=current_user.id
            ).first() is not None
    participants_count = PoolParticipant.active().filter_by(pool_id=pool.id).count()
    return {
        "id": pool.id,
        "slug": pool.slug,
        "name": pool.name,
        "description": pool.description,
        "creatorName": pool.creator_name,
        "creatorUserId": pool.creator.id if pool.creator else None,
        "tournamentId": pool.tournament_id,
        "isParticipant": is_participant,
        "participantsCount": participants_count,
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


def _prediction_payload(
    prediction: Prediction,
    score: ScoreEntry | None = None,
    *,
    user_id: str | None = None,
    include_score: bool = True,
):
    if include_score and score is None:
        score = ScoreEntry.active().filter_by(prediction_id=prediction.id).first()
    resolved_user_id = user_id
    if resolved_user_id is None:
        resolved_user_id = prediction.user.id
    return {
        "id": prediction.id,
        "matchId": prediction.match_id,
        "userId": resolved_user_id,
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


def _parse_optional_id(value):
    if value is None or value == "":
        return None
    return str(value)


def _route_id(value) -> str:
    return str(value)


def _recalculate_scores(pool: Pool):
    finished_match_ids = [
        match_id
        for (match_id,) in Match.active().with_entities(Match.id)
        .filter_by(tournament_id=pool.tournament_id, status=MatchStatus.FINISHED.value)
        .all()
    ]
    if not finished_match_ids:
        return

    predictions = (
        Prediction.active()
        .filter(
            Prediction.pool_id == pool.id,
            Prediction.match_id.in_(finished_match_ids),
            Prediction.deleted_at.is_(None),
        )
        .options(joinedload(Prediction.match))
        .all()
    )
    if not predictions:
        return

    existing_entries = {
        entry.prediction_id: entry
        for entry in ScoreEntry.active().filter(
            ScoreEntry.prediction_id.in_([p.id for p in predictions])
        ).all()
    }

    for prediction in predictions:
        score = calculate_prediction_score(prediction, prediction.match, pool)
        entry = existing_entries.get(prediction.id)
        if entry is None:
            entry = ScoreEntry(prediction_id=prediction.id, points=score.points)
            db.session.add(entry)
            existing_entries[prediction.id] = entry
        entry.points = score.points
        entry.exact_score = score.exact_score
        entry.outcome_hit = score.outcome_hit
        entry.penalty_hit = score.penalty_hit


def _ensure_creator_membership(pool: Pool):
    """Ensure the creator is a member of the pool (legacy guard for old data)."""
    if PoolParticipant.active().filter_by(pool_id=pool.id).first() is not None:
        return
    creator = pool.creator
    if creator is None:
        return
    db.session.add(
        PoolParticipant(pool_id=pool.id, user_id=creator.id, display_name=pool.creator_name)
    )



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
    if user is not None and user.is_deleted:
        user.restore()
    elif user is None:
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

    tournament = Tournament.active().filter_by(id=str(data["tournamentId"])).first()
    if tournament is None:
        abort(404, description="tournament not found")

    pool_count = Pool.active().filter_by(
        creator_user_id=user.id, tournament_id=tournament.id
    ).count()
    if pool_count >= MAX_POOLS_PER_USER_PER_TOURNAMENT:
        abort(422, description=f"Você já criou o limite de {MAX_POOLS_PER_USER_PER_TOURNAMENT} bolões para este torneio")

    slug = token_urlsafe(12)

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
    return jsonify({"id": pool.id, "slug": pool.slug}), 201


@api.get("/pools/<slug>")
def get_pool(slug):
    return jsonify(_pool_payload(_pool_or_404(slug)))


@api.get("/pools/<slug>/detail")
def get_pool_detail(slug):
    """Single round-trip bootstrap for the pool detail page."""
    pool = _pool_or_404(slug)
    _ensure_creator_membership(pool)

    current_user = g.get("current_user") or get_current_user()
    is_participant = False
    predicted_match_ids: list[str] = []
    if current_user:
        is_participant = PoolParticipant.active().filter_by(
            pool_id=pool.id, user_id=current_user.id
        ).first() is not None
        if is_participant:
            predicted_match_ids = _predicted_match_ids(pool, current_user.id)

    ranking = _build_ranking(pool, recalculate=False)
    db.session.commit()

    return jsonify({
        "pool": _pool_payload(pool, is_participant=is_participant),
        "matches": _list_pool_matches_payload(pool),
        "ranking": [{k: v for k, v in e.items()} for e in ranking],
        "snapshots": _list_pool_snapshots_payload(pool),
        "predictedMatchIds": predicted_match_ids,
    })


@api.post("/pools/<slug>/join")
@require_auth
def join_pool(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    data = _json()
    nickname = (data.get("nickname") or "").strip()
    display_name = nickname or user.name

    membership = PoolParticipant.active().filter_by(pool_id=pool.id, user_id=user.id).first()
    if membership is None:
        participant_count = PoolParticipant.active().filter_by(pool_id=pool.id).count()
        if participant_count >= MAX_PARTICIPANTS_PER_POOL:
            abort(422, description=f"Este bolão já atingiu o limite de {MAX_PARTICIPANTS_PER_POOL} participantes")
        membership = PoolParticipant(pool_id=pool.id, user_id=user.id, display_name=display_name)
        db.session.add(membership)
    else:
        membership.display_name = display_name

    db.session.commit()
    return jsonify({"displayName": membership.display_name, "pool": _pool_payload(pool)})


@api.get("/pools/<slug>/matches")
def list_matches(slug):
    pool = _pool_or_404(slug)
    return jsonify(_list_pool_matches_payload(pool))


def _list_pool_matches_payload(pool: Pool) -> list[dict]:
    matches = (
        Match.active()
        .filter_by(tournament_id=pool.tournament_id)
        .join(Round, Match.round_id == Round.id)
        .join(Stage, Stage.id == Round.stage_id)
        .options(
            contains_eager(Match.round).contains_eager(Round.stage),
            joinedload(Match.home_team),
            joinedload(Match.away_team),
        )
        .order_by(Stage.order, Round.number, Match.starts_at)
        .all()
    )
    tgm = _build_team_group_map(pool.tournament_id)
    return [_match_payload(m, tgm) for m in matches]


def _predicted_match_ids(pool: Pool, user_id: str) -> list[str]:
    rows = (
        Prediction.active()
        .filter_by(pool_id=pool.id, user_id=user_id)
        .with_entities(Prediction.match_id)
        .all()
    )
    return [row[0] for row in rows]


def _list_pool_snapshots_payload(pool: Pool) -> list[dict]:
    snapshots = (
        RoundSnapshot.active()
        .filter_by(pool_id=pool.id)
        .join(Round, RoundSnapshot.round_id == Round.id)
        .join(Stage, Stage.id == Round.stage_id)
        .options(
            contains_eager(RoundSnapshot.round).contains_eager(Round.stage),
            selectinload(RoundSnapshot.entries).joinedload(RoundSnapshotEntry.user),
        )
        .order_by(Stage.order, Round.number)
        .all()
    )
    return [_snapshot_payload(s) for s in snapshots]


def _list_user_predictions_payload(pool: Pool, user_id: str) -> list[dict]:
    predictions = (
        Prediction.active()
        .filter_by(pool_id=pool.id, user_id=user_id)
        .options(joinedload(Prediction.user))
        .all()
    )
    if not predictions:
        return []

    scores_by_prediction = {
        entry.prediction_id: entry
        for entry in ScoreEntry.active().filter(
            ScoreEntry.prediction_id.in_([p.id for p in predictions])
        ).all()
    }
    return [_prediction_payload(p, scores_by_prediction.get(p.id)) for p in predictions]


def _award_prediction_response(pool: Pool, user_id: str) -> dict:
    award_pred = AwardPrediction.active().filter_by(pool_id=pool.id, user_id=user_id).first()
    return {
        "isLocked": _awards_locked(pool),
        "prediction": _award_prediction_payload(award_pred) if award_pred else None,
    }


@api.get("/pools/<slug>/prediction-setup")
@require_auth
def get_prediction_setup(slug):
    """Single round-trip bootstrap for the predictions page."""
    pool = _pool_or_404(slug)
    user: User = g.current_user
    return jsonify({
        "pool": _pool_payload(pool),
        "matches": _list_pool_matches_payload(pool),
        "predictions": _list_user_predictions_payload(pool, user.id),
        "awardPrediction": _award_prediction_response(pool, user.id),
        "teams": _list_tournament_teams_payload(pool.tournament_id),
    })


@api.get("/pools/<slug>/predictions")
@require_auth
def list_predictions(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    return jsonify(_list_user_predictions_payload(pool, user.id))


@api.post("/pools/<slug>/predictions")
@require_auth
def upsert_prediction(slug):
    pool = _pool_for_write_or_404(slug)
    user: User = g.current_user
    data = _json()
    match = (
        Match.active()
        .filter_by(id=str(data.get("matchId")), tournament_id=pool.tournament_id)
        .options(joinedload(Match.round).joinedload(Round.stage))
        .first_or_404()
    )

    if datetime.now(timezone.utc) >= _as_aware_utc(match.starts_at):
        abort(409, description="predictions are locked for this match")

    membership = PoolParticipant.active().filter_by(pool_id=pool.id, user_id=user.id).first()
    if membership is None:
        abort(403, description="user has not joined this pool")

    predicted_home_score = int(data["homeScore"])
    predicted_away_score = int(data["awayScore"])
    predicts_penalties = match.stage.is_knockout and predicted_home_score == predicted_away_score
    penalty_winner_team_id = _parse_optional_id(data.get("penaltyWinnerTeamId"))
    if predicts_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
        abort(400, description="penalty winner is required for knockout draws")

    prediction = Prediction.active().filter_by(pool_id=pool.id, user_id=user.id, match_id=match.id).first()
    if prediction is None:
        prediction = Prediction(pool_id=pool.id, user_id=user.id, match_id=match.id)
        db.session.add(prediction)

    prediction.predicted_home_score = predicted_home_score
    prediction.predicted_away_score = predicted_away_score
    prediction.predicts_penalties = predicts_penalties
    prediction.predicted_penalty_winner_team_id = penalty_winner_team_id if predicts_penalties else None

    db.session.commit()
    return jsonify(_prediction_payload(prediction, user_id=user.id, include_score=False))


@api.get("/me/pools")
@require_auth
def get_my_pools():
    user: User = g.current_user
    memberships = PoolParticipant.active().filter_by(user_id=user.id).all()

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
            .outerjoin(
                Prediction,
                (Prediction.pool_id == pool.id)
                & (Prediction.user_id == User.id)
                & Prediction.deleted_at.is_(None),
            )
            .outerjoin(
                ScoreEntry,
                (ScoreEntry.prediction_id == Prediction.id) & ScoreEntry.deleted_at.is_(None),
            )
            .filter(
                PoolParticipant.pool_id == pool.id,
                PoolParticipant.deleted_at.is_(None),
                User.deleted_at.is_(None),
            )
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
    entries = _build_ranking(pool, recalculate=False)
    db.session.commit()
    return jsonify([{k: v for k, v in e.items()} for e in entries])


def _build_ranking(pool: Pool, *, recalculate: bool = False) -> list[dict]:
    """Return sorted ranking entries for a pool."""
    if recalculate:
        _recalculate_scores(pool)

    award_by_user = {
        ap.user_id: ap
        for ap in AwardPrediction.active().filter_by(pool_id=pool.id).all()
    }
    tournament = pool.tournament

    rows = (
        db.session.query(
            PoolParticipant.display_name,
            User.id.label("user_id"),
            User.picture_url,
            func.coalesce(func.sum(ScoreEntry.points), 0).label("match_points"),
            func.coalesce(func.sum(func.cast(ScoreEntry.exact_score, db.Integer)), 0).label("exact_scores"),
            func.coalesce(func.sum(func.cast(ScoreEntry.outcome_hit, db.Integer)), 0).label("outcome_hits"),
            func.coalesce(
                func.sum(db.case((Stage.stage_type == StageType.KNOCKOUT.value, ScoreEntry.points), else_=0)), 0
            ).label("knockout_points"),
        )
        .join(User, PoolParticipant.user_id == User.id)
        .outerjoin(
            Prediction,
            (Prediction.pool_id == pool.id)
            & (Prediction.user_id == User.id)
            & Prediction.deleted_at.is_(None),
        )
        .outerjoin(
            ScoreEntry,
            (ScoreEntry.prediction_id == Prediction.id) & ScoreEntry.deleted_at.is_(None),
        )
        .outerjoin(Match, (Match.id == Prediction.match_id) & Match.deleted_at.is_(None))
        .outerjoin(Round, (Round.id == Match.round_id) & Round.deleted_at.is_(None))
        .outerjoin(Stage, (Stage.id == Round.stage_id) & Stage.deleted_at.is_(None))
        .filter(
            PoolParticipant.pool_id == pool.id,
            PoolParticipant.deleted_at.is_(None),
            User.deleted_at.is_(None),
        )
        .group_by(PoolParticipant.display_name, User.id, PoolParticipant.created_at)
        .all()
    )
    entries = []
    for row in rows:
        award_pts = _calculate_award_points(
            pool,
            row.user_id,
            award_pred=award_by_user.get(row.user_id),
            tournament=tournament,
        )
        entries.append({
            "userId": row.user_id,
            "displayName": row.display_name,
            "pictureUrl": row.picture_url,
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


@api.post("/admin/rounds/<uuid:round_id>/snapshot")
@require_admin
def generate_round_snapshot(round_id):
    round_ = Round.active_or_404(round_id)
    tournament = round_.stage.tournament
    pools = Pool.active().filter_by(tournament_id=tournament.id).all()

    for pool in pools:
        ranking = _build_ranking(pool, recalculate=True)

        snapshot = RoundSnapshot.active().filter_by(round_id=round_.id, pool_id=pool.id).first()
        if snapshot is None:
            snapshot = RoundSnapshot(round_id=round_.id, pool_id=pool.id)
            db.session.add(snapshot)
            db.session.flush()
        replace_snapshot_entries(snapshot, ranking)

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
    entries = sorted(
        [e for e in snapshot.entries if e.deleted_at is None],
        key=lambda e: e.position,
    )
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
                "userId": e.user.id,
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
    return jsonify(_list_pool_snapshots_payload(pool))


@api.post("/admin/seed")
def seed_data():
    return jsonify({"status": seed_database()})


@api.post("/admin/matches/<uuid:match_id>/result")
@require_admin
def update_match_result(match_id):
    match = Match.active_or_404(match_id)
    data = _json()
    home_score = int(data["homeScore"])
    away_score = int(data["awayScore"])
    went_to_penalties = match.round.stage.is_knockout and home_score == away_score
    penalty_winner_team_id = _parse_optional_id(data.get("penaltyWinnerTeamId"))
    if went_to_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
        abort(400, description="penalty winner is required for knockout draws")

    match.home_score = home_score
    match.away_score = away_score
    match.went_to_penalties = went_to_penalties
    match.penalty_winner_team_id = penalty_winner_team_id if went_to_penalties else None
    match.status = MatchStatus.FINISHED.value

    for pool in Pool.active().filter_by(tournament_id=match.tournament_id).all():
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
        "stagesCount": Stage.active().filter_by(tournament_id=tournament.id).count(),
        "matchesCount": Match.active().filter_by(tournament_id=tournament.id).count(),
        "poolsCount": Pool.active().filter_by(tournament_id=tournament.id).count(),
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


def _calculate_award_points(
    pool: Pool,
    user_id: str,
    *,
    award_pred: AwardPrediction | None = None,
    tournament: Tournament | None = None,
) -> int:
    tournament = tournament or pool.tournament
    if award_pred is None:
        award_pred = AwardPrediction.active().filter_by(pool_id=pool.id, user_id=user_id).first()
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
        "groups": [
            _group_payload(g)
            for g in sorted(
                TournamentGroup.active().filter_by(stage_id=stage.id).all(),
                key=lambda g: g.name,
            )
        ],
        "rounds": [
            _round_payload(r)
            for r in sorted(
                Round.active().filter_by(stage_id=stage.id).all(),
                key=lambda r: r.number,
            )
        ],
    }


def _team_full_payload(team: Team):
    return {
        "id": team.id,
        "name": team.name,
        "shortName": team.short_name,
        "teamType": team.team_type,
        "flagCode": team.flag_code,
        "logoUrl": team.logo_url,
    }


def _list_active_teams_payload() -> list[dict]:
    cached = get_cached_team_list()
    if cached is not None:
        return cached

    teams = (
        Team.active()
        .options(
            load_only(
                Team.id,
                Team.name,
                Team.short_name,
                Team.team_type,
                Team.flag_code,
                Team.logo_url,
            )
        )
        .order_by(Team.name)
        .all()
    )
    payload = [_team_full_payload(t) for t in teams]
    set_cached_team_list(payload)
    return payload


def _group_payload(group: TournamentGroup):
    return {"id": group.id, "name": group.name, "stageId": group.stage_id}


def _build_team_group_map(tournament_id: str) -> dict:
    """Returns {team_id: TournamentGroup} for teams assigned to a group."""
    entries = (
        TournamentTeam.active()
        .filter_by(tournament_id=tournament_id)
        .filter(TournamentTeam.group_id.isnot(None))
        .options(joinedload(TournamentTeam.group))
        .all()
    )
    return {e.team_id: e.group for e in entries}


def _list_tournament_teams_payload(tournament_id: str) -> list[dict]:
    cached = get_cached_tournament_teams(tournament_id)
    if cached is not None:
        return cached

    entries = (
        TournamentTeam.active()
        .filter_by(tournament_id=tournament_id)
        .join(Team, TournamentTeam.team_id == Team.id)
        .options(contains_eager(TournamentTeam.team))
        .order_by(Team.name)
        .all()
    )
    payload = [_team_full_payload(entry.team) for entry in entries]
    set_cached_tournament_teams(tournament_id, payload)
    return payload


@api.get("/admin/tournaments")
def list_tournaments():
    tournaments = Tournament.active().order_by(Tournament.year.desc(), Tournament.id.desc()).all()
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


@api.patch("/admin/tournaments/<uuid:tournament_id>/status")
@require_admin
def update_tournament_status(tournament_id):
    tournament = Tournament.active_or_404(tournament_id)
    data = _json()
    new_status = data.get("status")
    valid = [s.value for s in TournamentStatus]
    if new_status not in valid:
        abort(400, description=f"status must be one of: {', '.join(valid)}")
    tournament.status = new_status
    db.session.commit()
    return jsonify(_tournament_payload(tournament))


@api.get("/admin/tournaments/<uuid:tournament_id>/stages")
def list_stages(tournament_id):
    tournament = Tournament.active_or_404(tournament_id)
    stages = Stage.active().filter_by(tournament_id=tournament.id).order_by(Stage.order).all()
    return jsonify([_stage_payload(s) for s in stages])


@api.post("/admin/tournaments/<uuid:tournament_id>/stages")
@require_admin
def create_stage(tournament_id):
    tournament = Tournament.active_or_404(tournament_id)
    _assert_tournament_editable(tournament)
    data = _json()
    name = (data.get("name") or "").strip()
    order = data.get("order")
    if not name or order is None:
        abort(400, description="name and order are required")
    stage = Stage(
        tournament_id=tournament.id,
        name=name,
        order=int(order),
        stage_type=(data.get("stageType") or StageType.GROUP.value),
    )
    db.session.add(stage)
    db.session.commit()
    return jsonify(_stage_payload(stage)), 201


@api.patch("/admin/stages/<uuid:stage_id>")
@require_admin
def update_stage(stage_id):
    stage = Stage.active_or_404(stage_id)
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

@api.get("/admin/stages/<uuid:stage_id>/rounds")
def list_rounds(stage_id):
    stage = Stage.active_or_404(stage_id)
    rounds = Round.active().filter_by(stage_id=stage.id).order_by(Round.number).all()
    return jsonify([_round_payload(r) for r in rounds])


@api.post("/admin/stages/<uuid:stage_id>/rounds")
@require_admin
def create_round(stage_id):
    stage = Stage.active_or_404(stage_id)
    _assert_tournament_editable(stage.tournament)
    data = _json()
    number = data.get("number")
    if number is None:
        abort(400, description="number is required")
    round_ = Round(stage_id=_route_id(stage_id), number=int(number))
    db.session.add(round_)
    db.session.commit()
    return jsonify(_round_payload(round_)), 201


@api.patch("/admin/rounds/<uuid:round_id>")
@require_admin
def update_round(round_id):
    round_ = Round.active_or_404(round_id)
    _assert_tournament_editable(round_.stage.tournament)
    data = _json()
    if "number" in data:
        round_.number = int(data["number"])
    db.session.commit()
    return jsonify(_round_payload(round_))


@api.delete("/admin/rounds/<uuid:round_id>")
@require_admin
def delete_round(round_id):
    round_ = Round.active_or_404(round_id)
    _assert_tournament_editable(round_.stage.tournament)
    soft_delete_round(round_)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin — teams
# ---------------------------------------------------------------------------

@api.get("/admin/teams")
def list_teams():
    return jsonify(_list_active_teams_payload())


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
    flag_code = (data.get("flagCode") or "").strip().upper() or None
    if flag_code and len(flag_code) != 2:
        abort(400, description="flagCode must be a 2-letter ISO country code")
    logo_url = (data.get("logoUrl") or "").strip() or None
    team = Team(name=name, short_name=short_name, team_type=team_type,
                flag_code=flag_code, logo_url=logo_url)
    db.session.add(team)
    db.session.commit()
    invalidate_team_list_cache()
    return jsonify(_team_full_payload(team)), 201


@api.patch("/admin/teams/<uuid:team_id>")
@require_admin
def update_team(team_id):
    team = Team.active().filter_by(id=_route_id(team_id)).first()
    if team is None:
        abort(404)
    data = _json()
    if "name" in data:
        team.name = (data["name"] or "").strip() or team.name
    if "shortName" in data:
        team.short_name = (data["shortName"] or "").strip().upper() or None
    if "flagCode" in data:
        code = (data["flagCode"] or "").strip().upper() or None
        if code and len(code) != 2:
            abort(400, description="flagCode must be a 2-letter ISO country code")
        team.flag_code = code
    if "logoUrl" in data:
        team.logo_url = (data["logoUrl"] or "").strip() or None
    db.session.commit()
    invalidate_team_list_cache()
    return jsonify(_team_full_payload(team))


def _tournament_team_payload(entry: TournamentTeam) -> dict:
    return {
        **_team_full_payload(entry.team),
        "groupId": entry.group_id,
        "groupName": entry.group.name if entry.group else None,
    }


@api.get("/admin/tournaments/<uuid:tournament_id>/teams")
def list_tournament_teams(tournament_id):
    tid = _route_id(tournament_id)
    Tournament.active_or_404(tid)
    entries = TournamentTeam.active().filter_by(tournament_id=tid).all()
    return jsonify([_tournament_team_payload(e) for e in entries])


@api.post("/admin/tournaments/<uuid:tournament_id>/teams")
@require_admin
def add_tournament_team(tournament_id):
    tid = _route_id(tournament_id)
    Tournament.active_or_404(tid)
    data = _json()
    team_id = _parse_optional_id(data.get("teamId"))
    if not team_id:
        abort(400, description="teamId is required")
    Team.active_or_404(team_id)
    existing = TournamentTeam.active().filter_by(tournament_id=tid, team_id=team_id).first()
    if existing:
        abort(409, description="team already in tournament")
    entry = TournamentTeam(tournament_id=tid, team_id=team_id)
    db.session.add(entry)
    db.session.commit()
    invalidate_tournament_teams_cache(tid)
    return jsonify({"tournamentId": tid, "teamId": team_id}), 201


@api.delete("/admin/tournaments/<uuid:tournament_id>/teams/<uuid:team_id>")
@require_admin
def remove_tournament_team(tournament_id, team_id):
    entry = TournamentTeam.active().filter_by(
        tournament_id=_route_id(tournament_id),
        team_id=_route_id(team_id),
    ).first_or_404()
    soft_delete_tournament_team(entry)
    db.session.commit()
    invalidate_tournament_teams_cache(_route_id(tournament_id))
    return "", 204


@api.patch("/admin/tournaments/<uuid:tournament_id>/teams/<uuid:team_id>/group")
@require_admin
def assign_team_group(tournament_id, team_id):
    tid = _route_id(tournament_id)
    entry = TournamentTeam.active().filter_by(tournament_id=tid, team_id=_route_id(team_id)).first_or_404()
    data = _json()
    group_id = _parse_optional_id(data.get("groupId"))
    if group_id is not None:
        group = TournamentGroup.active_or_404(group_id)
        if group.stage.tournament_id != tid:
            abort(400, description="group does not belong to this tournament")
    entry.group_id = group_id
    db.session.commit()
    return jsonify(_tournament_team_payload(entry))


@api.get("/admin/tournaments/<uuid:tournament_id>/groups")
def list_tournament_groups(tournament_id):
    tid = _route_id(tournament_id)
    Tournament.active_or_404(tid)
    stages = Stage.active().filter_by(tournament_id=tid, stage_type=StageType.GROUP.value).all()
    groups = []
    for stage in stages:
        for g in TournamentGroup.active().filter_by(stage_id=stage.id).all():
            groups.append(_group_payload(g))
    groups.sort(key=lambda g: g["name"])
    return jsonify(groups)


@api.post("/admin/stages/<uuid:stage_id>/groups")
@require_admin
def create_group(stage_id):
    stage = Stage.active_or_404(stage_id)
    if stage.stage_type != StageType.GROUP.value:
        abort(400, description="groups can only be created for group-type stages")
    data = _json()
    name = (data.get("name") or "").strip()
    if not name:
        abort(400, description="name is required")
    group = TournamentGroup(stage_id=_route_id(stage_id), name=name)
    db.session.add(group)
    db.session.commit()
    return jsonify(_group_payload(group)), 201


@api.patch("/admin/groups/<uuid:group_id>")
@require_admin
def update_group(group_id):
    group = TournamentGroup.active_or_404(group_id)
    data = _json()
    if "name" in data:
        group.name = (data["name"] or "").strip() or group.name
    db.session.commit()
    return jsonify(_group_payload(group))


@api.delete("/admin/groups/<uuid:group_id>")
@require_admin
def delete_group(group_id):
    group = TournamentGroup.active_or_404(group_id)
    TournamentTeam.active().filter_by(group_id=group_id).update({"group_id": None})
    soft_delete_group(group)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin — matches
# ---------------------------------------------------------------------------

@api.get("/admin/tournaments/<uuid:tournament_id>/matches")
def list_tournament_matches(tournament_id):
    tid = _route_id(tournament_id)
    Tournament.active_or_404(tid)
    matches = (
        Match.active().filter_by(tournament_id=tid)
        .join(Round)
        .join(Stage, Stage.id == Round.stage_id)
        .order_by(Stage.order, Round.number, Match.starts_at)
        .all()
    )
    tgm = _build_team_group_map(tid)
    return jsonify([_match_payload(m, tgm) for m in matches])


@api.post("/admin/tournaments/<uuid:tournament_id>/matches")
@require_admin
def create_match(tournament_id):
    tid = _route_id(tournament_id)
    tournament = Tournament.active_or_404(tid)
    _assert_tournament_editable(tournament)
    data = _json()
    round_id = data.get("roundId")
    starts_at_raw = data.get("startsAt")
    if not round_id or not starts_at_raw:
        abort(400, description="roundId and startsAt are required")
    round_ = Round.active_or_404(round_id)
    if round_.stage.tournament_id != tid:
        abort(400, description="round does not belong to this tournament")
    match = Match(
        tournament_id=tid,
        round_id=round_.id,
        home_team_id=_parse_optional_id(data.get("homeTeamId")),
        away_team_id=_parse_optional_id(data.get("awayTeamId")),
        starts_at=_parse_starts_at(starts_at_raw),
        venue=data.get("venue") or None,
    )
    db.session.add(match)
    db.session.commit()
    return jsonify(_match_payload(match)), 201


@api.patch("/admin/matches/<uuid:match_id>")
@require_admin
def update_match(match_id):
    match = Match.active_or_404(match_id)
    _assert_tournament_editable(match.tournament)
    data = _json()

    if "roundId" in data:
        round_ = Round.active_or_404(data["roundId"])
        if round_.stage.tournament_id != match.tournament_id:
            abort(400, description="round does not belong to this tournament")
        match.round_id = round_.id
    if "homeTeamId" in data:
        match.home_team_id = _parse_optional_id(data["homeTeamId"])
    if "awayTeamId" in data:
        match.away_team_id = _parse_optional_id(data["awayTeamId"])
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
        penalty_winner_team_id = _parse_optional_id(data.get("penaltyWinnerTeamId"))
        if went_to_penalties and penalty_winner_team_id not in [match.home_team_id, match.away_team_id]:
            abort(400, description="penalty winner is required for knockout draws")
        match.home_score = home_score
        match.away_score = away_score
        match.went_to_penalties = went_to_penalties
        match.penalty_winner_team_id = penalty_winner_team_id if went_to_penalties else None
        match.status = MatchStatus.FINISHED.value
        for pool in Pool.active().filter_by(tournament_id=match.tournament_id).all():
            _recalculate_scores(pool)

    db.session.commit()
    return jsonify(_match_payload(match))


@api.delete("/admin/matches/<uuid:match_id>")
@require_admin
def delete_match(match_id):
    match = Match.active_or_404(match_id)
    _assert_tournament_editable(match.tournament)
    soft_delete_match(match)
    db.session.commit()
    return "", 204


@api.delete("/admin/stages/<uuid:stage_id>")
@require_admin
def delete_stage(stage_id):
    stage = Stage.active_or_404(stage_id)
    _assert_tournament_editable(stage.tournament)
    soft_delete_stage(stage)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin — pools per tournament
# ---------------------------------------------------------------------------

@api.get("/tournaments")
def list_tournaments_public():
    tournaments = Tournament.active().order_by(Tournament.year.desc(), Tournament.id.desc()).all()
    return jsonify([
        {"id": t.id, "name": t.name, "year": t.year, "status": t.status}
        for t in tournaments
    ])


@api.get("/teams")
def list_teams_public():
    return jsonify(_list_active_teams_payload())


@api.get("/tournaments/<uuid:tournament_id>/teams")
def list_tournament_teams_public(tournament_id):
    tid = _route_id(tournament_id)
    Tournament.active_or_404(tid)
    return jsonify(_list_tournament_teams_payload(tid))


@api.get("/pools/<slug>/award-prediction")
@require_auth
def get_award_prediction(slug):
    pool = _pool_or_404(slug)
    user: User = g.current_user
    return jsonify(_award_prediction_response(pool, user.id))


@api.post("/pools/<slug>/award-prediction")
@require_auth
def upsert_award_prediction(slug):
    pool = _pool_for_write_or_404(slug, load_tournament=True)
    user: User = g.current_user
    data = _json()
    membership = PoolParticipant.active().filter_by(pool_id=pool.id, user_id=user.id).first()
    if membership is None:
        abort(403, description="user has not joined this pool")
    if _awards_locked(pool):
        abort(409, description="award predictions are locked")
    award_pred = AwardPrediction.active().filter_by(pool_id=pool.id, user_id=user.id).first()
    if award_pred is None:
        award_pred = AwardPrediction(pool_id=pool.id, user_id=user.id)
        db.session.add(award_pred)
    if pool.predict_champion:
        award_pred.champion_team_id = _parse_optional_id(data.get("championTeamId"))
    if pool.predict_runner_up:
        award_pred.runner_up_team_id = _parse_optional_id(data.get("runnerUpTeamId"))
    if pool.predict_third_place:
        award_pred.third_place_team_id = _parse_optional_id(data.get("thirdPlaceTeamId"))
    if pool.predict_top_scorer:
        award_pred.top_scorer = (data.get("topScorer") or "").strip() or None
    if pool.predict_best_player:
        award_pred.best_player = (data.get("bestPlayer") or "").strip() or None
    db.session.commit()
    return "", 204


@api.patch("/admin/tournaments/<uuid:tournament_id>/awards")
@require_admin
def update_tournament_awards(tournament_id):
    tournament = Tournament.active_or_404(tournament_id)
    _assert_tournament_editable(tournament)
    data = _json()
    if "championTeamId" in data:
        tournament.champion_team_id = _parse_optional_id(data["championTeamId"])
    if "runnerUpTeamId" in data:
        tournament.runner_up_team_id = _parse_optional_id(data["runnerUpTeamId"])
    if "thirdPlaceTeamId" in data:
        tournament.third_place_team_id = _parse_optional_id(data["thirdPlaceTeamId"])
    if "topScorer" in data:
        tournament.top_scorer = (data["topScorer"] or "").strip() or None
    if "bestPlayer" in data:
        tournament.best_player = (data["bestPlayer"] or "").strip() or None
    db.session.commit()
    return jsonify(_tournament_payload(tournament))


@api.get("/admin/tournaments/<uuid:tournament_id>/pools")
def list_tournament_pools(tournament_id):
    tid = _route_id(tournament_id)
    Tournament.active_or_404(tid)
    pools = Pool.active().filter_by(tournament_id=tid).order_by(Pool.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": pool.id,
                "slug": pool.slug,
                "name": pool.name,
                "creatorName": pool.creator_name,
                "participantsCount": PoolParticipant.active().filter_by(pool_id=pool.id).count(),
                "createdAt": _as_aware_utc(pool.created_at).isoformat(),
            }
            for pool in pools
        ]
    )
