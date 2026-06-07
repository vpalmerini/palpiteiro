import sys
import types
from datetime import datetime, timedelta, timezone

from app import create_app
from app.extensions import db
from app.models import (
    Match,
    NotificationLog,
    Pool,
    PoolParticipant,
    Prediction,
    PushSubscription,
    Round,
    Stage,
    Tournament,
    User,
)
from app.push import send_to_subscription
from app.reminders import send_pending_prediction_reminders

# Fixed reference: 2026-06-10 15:00 UTC == 12:00 BRT
NOW = datetime(2026, 6, 10, 15, 0, tzinfo=timezone.utc)


class TestConfig:
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = "http://localhost:3000"
    JWT_SECRET = "test-secret"


def _app():
    app = create_app(TestConfig)
    ctx = app.app_context()
    ctx.push()
    db.create_all()
    return app


def _build_pool_with_match(starts_at: datetime, *, with_subscription=True):
    tournament = Tournament(name="Copa Teste", year=2026, status="ongoing")
    db.session.add(tournament)
    db.session.flush()

    stage = Stage(tournament_id=tournament.id, name="Fase de Grupos", order=1, stage_type="group")
    db.session.add(stage)
    db.session.flush()

    rnd = Round(stage_id=stage.id, number=1)
    db.session.add(rnd)
    db.session.flush()

    match = Match(
        tournament_id=tournament.id,
        round_id=rnd.id,
        starts_at=starts_at,
        status="scheduled",
    )
    db.session.add(match)

    user = User(google_id="g1", name="Ana", email="ana@example.com")
    db.session.add(user)
    db.session.flush()

    pool = Pool(slug="bolao1", name="Bolão", creator_name="Ana", tournament_id=tournament.id)
    db.session.add(pool)
    db.session.flush()

    db.session.add(PoolParticipant(pool_id=pool.id, user_id=user.id, display_name="Ana"))

    if with_subscription:
        db.session.add(
            PushSubscription(user_id=user.id, endpoint="https://push/1", p256dh="p", auth="a")
        )

    db.session.commit()
    return tournament, pool, user, match


def _capture_sends(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.reminders.send_to_user",
        lambda user_id, payload: calls.append((user_id, payload)) or 1,
    )
    return calls


def test_reminder_sent_within_window_with_pending(monkeypatch):
    _app()
    calls = _capture_sends(monkeypatch)
    # match 2h ahead → now is within the 3h window
    _build_pool_with_match(NOW + timedelta(hours=2))

    notified = send_pending_prediction_reminders(now=NOW)

    assert notified == 1
    assert len(calls) == 1
    assert "/pools/bolao1/predictions" == calls[0][1]["url"]


def test_no_reminder_outside_window(monkeypatch):
    _app()
    calls = _capture_sends(monkeypatch)
    # match 5h ahead → first-3h is still 2h in the future, before the window
    _build_pool_with_match(NOW + timedelta(hours=5))

    notified = send_pending_prediction_reminders(now=NOW)

    assert notified == 0
    assert calls == []


def test_no_duplicate_reminder_same_day(monkeypatch):
    _app()
    calls = _capture_sends(monkeypatch)
    _build_pool_with_match(NOW + timedelta(hours=2))

    first = send_pending_prediction_reminders(now=NOW)
    second = send_pending_prediction_reminders(now=NOW + timedelta(minutes=30))

    assert first == 1
    assert second == 0
    assert len(calls) == 1
    assert NotificationLog.active().count() == 1


def test_no_reminder_when_all_predicted(monkeypatch):
    _app()
    calls = _capture_sends(monkeypatch)
    _, pool, user, match = _build_pool_with_match(NOW + timedelta(hours=2))
    db.session.add(
        Prediction(
            pool_id=pool.id,
            user_id=user.id,
            match_id=match.id,
            predicted_home_score=1,
            predicted_away_score=0,
        )
    )
    db.session.commit()

    notified = send_pending_prediction_reminders(now=NOW)

    assert notified == 0
    assert calls == []


def test_removed_participant_excluded(monkeypatch):
    _app()
    calls = _capture_sends(monkeypatch)
    _, pool, user, _ = _build_pool_with_match(NOW + timedelta(hours=2))
    membership = PoolParticipant.active().filter_by(pool_id=pool.id, user_id=user.id).first()
    membership.removed_by_creator = True
    membership.soft_delete()
    db.session.commit()

    notified = send_pending_prediction_reminders(now=NOW)

    assert notified == 0
    assert calls == []


def test_no_reminder_without_subscription(monkeypatch):
    _app()
    calls = _capture_sends(monkeypatch)
    _build_pool_with_match(NOW + timedelta(hours=2), with_subscription=False)

    notified = send_pending_prediction_reminders(now=NOW)

    assert notified == 0
    assert calls == []


def test_stale_subscription_soft_deleted(monkeypatch):
    app = _app()
    app.config["VAPID_PRIVATE_KEY"] = "dummy-key"
    app.config["VAPID_SUBJECT"] = "mailto:test@example.com"

    user = User(google_id="g9", name="Bob", email="bob@example.com")
    db.session.add(user)
    db.session.flush()
    sub = PushSubscription(user_id=user.id, endpoint="https://push/stale", p256dh="p", auth="a")
    db.session.add(sub)
    db.session.commit()

    # Inject a fake pywebpush that raises a 410 (subscription gone)
    fake = types.ModuleType("pywebpush")

    class WebPushException(Exception):
        def __init__(self, message, response=None):
            super().__init__(message)
            self.response = response

    class _Resp:
        status_code = 410

    def webpush(**kwargs):
        raise WebPushException("gone", response=_Resp())

    fake.WebPushException = WebPushException
    fake.webpush = webpush
    monkeypatch.setitem(sys.modules, "pywebpush", fake)

    ok = send_to_subscription(sub, {"title": "t", "body": "b"})

    assert ok is False
    assert sub.is_deleted
