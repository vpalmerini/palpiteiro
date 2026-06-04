from datetime import datetime, timezone

from app import create_app
from app.auth import COOKIE_NAME, make_session_jwt
from app.extensions import db
from app.models import PoolParticipant, Tournament, User


class TestConfig:
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = "http://localhost:3000"
    JWT_SECRET = "test-secret"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(name: str, email: str) -> User:
    user = User(name=name, email=email, google_id=f"google-{email}")
    db.session.add(user)
    db.session.flush()
    return user


def _set_auth(client, user: User) -> None:
    token = make_session_jwt(user.id)
    client.set_cookie(COOKIE_NAME, token)


def _setup():
    """Return (app, ctx, creator_client, participant_client, creator, participant, slug)."""
    app = create_app(TestConfig)
    ctx = app.app_context()
    ctx.push()
    db.create_all()
    client = app.test_client()
    client.post("/api/admin/seed")

    tournament = Tournament.active().first()

    creator = _make_user("Victor", "victor@example.com")
    participant = _make_user("Ana", "ana@example.com")
    db.session.commit()

    _set_auth(client, creator)
    pool = client.post(
        "/api/pools",
        json={"name": "Bolao Teste", "tournamentId": tournament.id},
    ).get_json()
    slug = pool["slug"]

    # participant joins
    participant_client = app.test_client()
    _set_auth(participant_client, participant)
    participant_client.post(f"/api/pools/{slug}/join", json={})

    return app, ctx, client, participant_client, creator, participant, slug


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_creator_removes_participant():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        response = creator_client.delete(f"/api/pools/{slug}/participants/{participant.id}")

        assert response.status_code == 200
        # participant should no longer have an active membership
        membership = PoolParticipant.active().filter_by(
            pool_id=response.get_json()["id"], user_id=participant.id
        ).first()
        assert membership is None
    finally:
        db.session.remove()
        ctx.pop()


def test_removed_participant_has_removed_by_creator_flag():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        pool_resp = creator_client.get(f"/api/pools/{slug}").get_json()
        creator_client.delete(f"/api/pools/{slug}/participants/{participant.id}")

        banned = PoolParticipant.query.filter_by(
            pool_id=pool_resp["id"], user_id=participant.id, removed_by_creator=True
        ).first()
        assert banned is not None
        assert banned.deleted_at is not None
    finally:
        db.session.remove()
        ctx.pop()


def test_remove_requires_auth():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        anon = app.test_client()
        response = anon.delete(f"/api/pools/{slug}/participants/{participant.id}")
        assert response.status_code == 401
    finally:
        db.session.remove()
        ctx.pop()


def test_remove_requires_creator():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        response = participant_client.delete(f"/api/pools/{slug}/participants/{creator.id}")
        assert response.status_code == 403
    finally:
        db.session.remove()
        ctx.pop()


def test_creator_cannot_remove_themselves():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        response = creator_client.delete(f"/api/pools/{slug}/participants/{creator.id}")
        assert response.status_code == 400
    finally:
        db.session.remove()
        ctx.pop()


def test_remove_nonexistent_participant_returns_404():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        import uuid
        fake_id = str(uuid.uuid4())
        response = creator_client.delete(f"/api/pools/{slug}/participants/{fake_id}")
        assert response.status_code == 404
    finally:
        db.session.remove()
        ctx.pop()


def test_removed_participant_cannot_rejoin():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        creator_client.delete(f"/api/pools/{slug}/participants/{participant.id}")

        response = participant_client.post(f"/api/pools/{slug}/join", json={})
        assert response.status_code == 403
        assert "removed" in response.get_json()["error"]
    finally:
        db.session.remove()
        ctx.pop()


def test_is_removed_true_for_removed_user():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        creator_client.delete(f"/api/pools/{slug}/participants/{participant.id}")

        detail = participant_client.get(f"/api/pools/{slug}/detail").get_json()
        assert detail["pool"]["isRemoved"] is True
    finally:
        db.session.remove()
        ctx.pop()


def test_is_removed_false_for_active_participant():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        detail = participant_client.get(f"/api/pools/{slug}/detail").get_json()
        assert detail["pool"]["isRemoved"] is False
    finally:
        db.session.remove()
        ctx.pop()


def test_is_removed_false_for_unauthenticated_user():
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        anon = app.test_client()
        detail = anon.get(f"/api/pools/{slug}/detail").get_json()
        assert detail["pool"]["isRemoved"] is False
    finally:
        db.session.remove()
        ctx.pop()


def test_pool_not_in_my_pools_after_removal():
    """After removal, GET /me/pools should not include the removed pool."""
    app, ctx, creator_client, participant_client, creator, participant, slug = _setup()
    try:
        before = participant_client.get("/api/me/pools").get_json()
        slugs_before = [p["slug"] for group in before for p in group["pools"]]
        assert slug in slugs_before

        creator_client.delete(f"/api/pools/{slug}/participants/{participant.id}")

        after = participant_client.get("/api/me/pools").get_json()
        slugs_after = [p["slug"] for group in after for p in group["pools"]]
        assert slug not in slugs_after
    finally:
        db.session.remove()
        ctx.pop()
