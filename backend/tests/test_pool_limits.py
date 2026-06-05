import jwt
from datetime import datetime, timezone, timedelta

from app import create_app
from app.extensions import db
from app.models import User, Tournament
from app.routes import MAX_POOLS_PER_USER_PER_TOURNAMENT, MAX_PARTICIPANTS_PER_POOL


class TestConfig:
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = "http://localhost:3000"
    JWT_SECRET = "test-secret"


def _make_user(google_id="g1", name="User One", email="user1@example.com"):
    user = User(google_id=google_id, name=name, email=email)
    db.session.add(user)
    db.session.flush()
    return user


def _set_auth(client, user_id):
    token = jwt.encode(
        {
            "sub": user_id,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
        },
        "test-secret",
        algorithm="HS256",
    )
    client.set_cookie("bolao_session", token)


def _setup():
    app = create_app(TestConfig)
    ctx = app.app_context()
    ctx.push()
    db.create_all()
    client = app.test_client()
    client.post("/api/admin/seed")

    tournament = Tournament.active().first()
    assert tournament is not None, "seed must create at least one tournament"
    return client, tournament


def _create_pool(client, tournament_id, name="Bolão Teste"):
    return client.post(
        "/api/pools",
        json={
            "tournamentId": tournament_id,
            "name": name,
            "prizes": [
                {"position": 1, "description": "R$ 500"},
                {"position": 2, "description": "R$ 250"},
                {"position": 3, "description": "R$ 100"},
            ],
        },
    )


# ── Pool creation limit ───────────────────────────────────────────────────────

def test_pool_limit_allows_up_to_max():
    client, tournament = _setup()
    user = _make_user()
    db.session.commit()
    _set_auth(client, user.id)

    for i in range(MAX_POOLS_PER_USER_PER_TOURNAMENT):
        resp = _create_pool(client, tournament.id, name=f"Bolão {i + 1}")
        assert resp.status_code == 201, f"Pool {i + 1} should be created"


def test_pool_limit_blocks_beyond_max():
    client, tournament = _setup()
    user = _make_user()
    db.session.commit()
    _set_auth(client, user.id)

    for i in range(MAX_POOLS_PER_USER_PER_TOURNAMENT):
        _create_pool(client, tournament.id, name=f"Bolão {i + 1}")

    resp = _create_pool(client, tournament.id, name="Bolão Extra")
    assert resp.status_code == 422
    assert "limite" in resp.get_json().get("error", "").lower()


def test_pool_limit_is_per_tournament():
    """Limit is per tournament — a second tournament allows new pools."""
    client, tournament = _setup()

    second_tournament = Tournament(name="Copa Alternativa", year=2030, status="ongoing")
    db.session.add(second_tournament)
    db.session.commit()

    user = _make_user()
    db.session.commit()
    _set_auth(client, user.id)

    for i in range(MAX_POOLS_PER_USER_PER_TOURNAMENT):
        _create_pool(client, tournament.id, name=f"Bolão {i + 1}")

    resp = _create_pool(client, second_tournament.id, name="Bolão Outro Torneio")
    assert resp.status_code == 201


def test_pool_limit_per_user_not_global():
    """Each user has their own independent quota."""
    client, tournament = _setup()

    user1 = _make_user(google_id="g1", name="User 1", email="u1@example.com")
    user2 = _make_user(google_id="g2", name="User 2", email="u2@example.com")
    db.session.commit()

    _set_auth(client, user1.id)
    for i in range(MAX_POOLS_PER_USER_PER_TOURNAMENT):
        _create_pool(client, tournament.id, name=f"Bolão U1 {i + 1}")

    _set_auth(client, user2.id)
    resp = _create_pool(client, tournament.id, name="Bolão U2")
    assert resp.status_code == 201


def test_pool_limit_requires_auth():
    client, tournament = _setup()
    resp = _create_pool(client, tournament.id)
    assert resp.status_code == 401


# ── Participant limit ─────────────────────────────────────────────────────────

def _join_pool(client, slug, nickname=""):
    return client.post(f"/api/pools/{slug}/join", json={"nickname": nickname})


def test_participant_limit_allows_up_to_max():
    client, tournament = _setup()

    creator = _make_user(google_id="creator", name="Creator", email="creator@example.com")
    db.session.commit()
    _set_auth(client, creator.id)
    pool_resp = _create_pool(client, tournament.id, name="Bolão Cheio")
    slug = pool_resp.get_json()["slug"]

    # Creator already counts as 1; add MAX_PARTICIPANTS_PER_POOL - 1 more
    for i in range(MAX_PARTICIPANTS_PER_POOL - 1):
        u = _make_user(
            google_id=f"p{i}",
            name=f"Participante {i}",
            email=f"p{i}@example.com",
        )
        db.session.commit()
        _set_auth(client, u.id)
        resp = _join_pool(client, slug, nickname=f"Nick {i}")
        assert resp.status_code == 200, f"Join {i + 1} should succeed"


def test_participant_limit_blocks_beyond_max():
    client, tournament = _setup()

    creator = _make_user(google_id="creator", name="Creator", email="creator@example.com")
    db.session.commit()
    _set_auth(client, creator.id)
    pool_resp = _create_pool(client, tournament.id, name="Bolão Cheio")
    slug = pool_resp.get_json()["slug"]

    for i in range(MAX_PARTICIPANTS_PER_POOL - 1):
        u = _make_user(
            google_id=f"p{i}",
            name=f"Participante {i}",
            email=f"p{i}@example.com",
        )
        db.session.commit()
        _set_auth(client, u.id)
        _join_pool(client, slug)

    extra = _make_user(google_id="extra", name="Extra", email="extra@example.com")
    db.session.commit()
    _set_auth(client, extra.id)
    resp = _join_pool(client, slug)
    assert resp.status_code == 422
    assert "limite" in resp.get_json().get("error", "").lower()


def test_creator_counts_as_participant():
    """Pool starts with 1 participant (the creator), so only MAX - 1 more can join."""
    client, tournament = _setup()

    creator = _make_user(google_id="creator", name="Creator", email="creator@example.com")
    db.session.commit()
    _set_auth(client, creator.id)
    pool_resp = _create_pool(client, tournament.id, name="Bolão Criador")
    slug = pool_resp.get_json()["slug"]

    for i in range(MAX_PARTICIPANTS_PER_POOL - 1):
        u = _make_user(
            google_id=f"p{i}",
            name=f"Participante {i}",
            email=f"p{i}@example.com",
        )
        db.session.commit()
        _set_auth(client, u.id)
        _join_pool(client, slug)

    extra = _make_user(google_id="extra", name="Extra", email="extra@example.com")
    db.session.commit()
    _set_auth(client, extra.id)
    resp = _join_pool(client, slug)
    assert resp.status_code == 422


def test_participants_count_in_pool_payload():
    """participantsCount field is returned in the pool payload."""
    client, tournament = _setup()

    creator = _make_user(google_id="creator", name="Creator", email="creator@example.com")
    db.session.commit()
    _set_auth(client, creator.id)
    pool_resp = _create_pool(client, tournament.id)
    slug = pool_resp.get_json()["slug"]

    detail = client.get(f"/api/pools/{slug}").get_json()
    assert detail["participantsCount"] == 1

    other = _make_user(google_id="other", name="Other", email="other@example.com")
    db.session.commit()
    _set_auth(client, other.id)
    _join_pool(client, slug)

    detail = client.get(f"/api/pools/{slug}").get_json()
    assert detail["participantsCount"] == 2
