"""Scheduled reminder logic for users with pending match predictions."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app

from .extensions import db
from .models import (
    Match,
    NotificationLog,
    Pool,
    PoolParticipant,
    Prediction,
    PushSubscription,
    Tournament,
    TournamentStatus,
)
from .push import send_to_user

BRT = ZoneInfo("America/Sao_Paulo")
KIND = "pending_predictions"


def _reminder_window() -> timedelta:
    hours = current_app.config.get("REMINDER_WINDOW_HOURS", 3)
    return timedelta(hours=hours)


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def send_pending_prediction_reminders(now: datetime | None = None) -> int:
    """Notify participants who still have pending predictions for today's games.

    Fires only during the 3h window before the first match of the day (local
    BRT day). Each user is reminded at most once per day via NotificationLog.
    Returns the number of users notified.
    """
    now = now or datetime.now(timezone.utc)
    today_brt = now.astimezone(BRT).date()
    dedup_key = today_brt.isoformat()

    pools_with_pending: dict[str, set[str]] = {}  # user_id -> set(pool_id)
    pending_matches_by_user: dict[str, set[str]] = {}  # user_id -> set(match_id)
    slug_by_user: dict[str, str] = {}  # user_id -> a pool slug (for deep-link)

    tournaments = (
        Tournament.active().filter_by(status=TournamentStatus.ONGOING.value).all()
    )
    for tournament in tournaments:
        matches = Match.active().filter_by(tournament_id=tournament.id).all()
        todays = [
            m for m in matches
            if _as_aware_utc(m.starts_at).astimezone(BRT).date() == today_brt
        ]
        if not todays:
            continue

        first_start = min(_as_aware_utc(m.starts_at) for m in todays)
        if not (first_start - _reminder_window() <= now < first_start):
            continue

        open_ids = {m.id for m in todays if _as_aware_utc(m.starts_at) > now}
        if not open_ids:
            continue

        pools = Pool.active().filter_by(tournament_id=tournament.id).all()
        for pool in pools:
            participants = PoolParticipant.active().filter_by(pool_id=pool.id).all()
            for participant in participants:
                predicted = {
                    row[0]
                    for row in Prediction.active()
                    .filter_by(pool_id=pool.id, user_id=participant.user_id)
                    .with_entities(Prediction.match_id)
                    .all()
                }
                missing = open_ids - predicted
                if missing:
                    pools_with_pending.setdefault(participant.user_id, set()).add(pool.id)
                    pending_matches_by_user.setdefault(participant.user_id, set()).update(missing)
                    slug_by_user.setdefault(participant.user_id, pool.slug)

    notified = 0
    for user_id, pool_ids in pools_with_pending.items():
        already = (
            NotificationLog.active()
            .filter_by(user_id=user_id, kind=KIND, dedup_key=dedup_key)
            .first()
        )
        if already:
            continue

        has_subscription = (
            PushSubscription.active().filter_by(user_id=user_id).first() is not None
        )
        if not has_subscription:
            continue

        url = (
            f"/pools/{slug_by_user[user_id]}/predictions"
            if len(pool_ids) == 1
            else "/meus-boloes"
        )
        n = len(pending_matches_by_user.get(user_id, set()))
        jogo = "jogo" if n == 1 else "jogos"
        payload = {
            "title": "Palpites pendentes",
            "body": f"Você tem {n} {jogo} sem palpite hoje. Não esqueça!",
            "url": url,
        }
        send_to_user(user_id, payload)
        db.session.add(NotificationLog(user_id=user_id, kind=KIND, dedup_key=dedup_key))
        db.session.commit()
        notified += 1

    return notified
