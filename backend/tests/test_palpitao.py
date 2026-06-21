"""Integration tests for the Palpitão (score multiplier) feature."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app import create_app
from app.auth import COOKIE_NAME, make_session_jwt
from app.extensions import db
from app.models import Match, MatchStatus, Pool, Prediction, Tournament, User


class TestConfig:
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = "http://localhost:3000"
    JWT_SECRET = "test-secret"


def _make_user(name: str, email: str) -> User:
    user = User(name=name, email=email, google_id=f"google-{email}")
    db.session.add(user)
    db.session.flush()
    return user


def _set_auth(client, user: User) -> None:
    token = make_session_jwt(user.id)
    client.set_cookie(COOKIE_NAME, token)


def _open_matches(tournament_id: str, limit: int = 2) -> list[Match]:
    """Return up to `limit` group-stage matches made open for prediction."""
    matches = (
        Match.active()
        .filter(
            Match.tournament_id == tournament_id,
            Match.home_team_id.isnot(None),
            Match.status != MatchStatus.FINISHED.value,
        )
        .limit(limit)
        .all()
    )
    for m in matches:
        m.starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    db.session.flush()
    return matches


def _setup(palpitao: dict | None = None):
    """Return (app, ctx, client, creator, slug, open_matches)."""
    app = create_app(TestConfig)
    ctx = app.app_context()
    ctx.push()
    db.create_all()
    client = app.test_client()
    client.post("/api/admin/seed")

    tournament = Tournament.active().first()
    creator = _make_user("Victor", "victor@example.com")
    db.session.commit()
    _set_auth(client, creator)

    pool_payload: dict = {"name": "Bolao Palpitão", "tournamentId": tournament.id}
    if palpitao is not None:
        pool_payload["palpitao"] = palpitao

    pool = client.post("/api/pools", json=pool_payload).get_json()
    slug = pool["slug"]

    matches = _open_matches(tournament.id, limit=2)
    db.session.commit()

    return app, ctx, client, creator, slug, matches


# ---------------------------------------------------------------------------
# Pool payload
# ---------------------------------------------------------------------------

def test_pool_creation_defaults_palpitao_enabled_with_3x():
    app, ctx, client, creator, slug, _ = _setup()
    try:
        detail = client.get(f"/api/pools/{slug}/detail").get_json()
        palpitao = detail["pool"]["palpitao"]

        assert palpitao["enabled"] is True
        assert palpitao["multiplier"] == 3
    finally:
        db.session.remove()
        ctx.pop()


def test_pool_creation_accepts_custom_palpitao_config():
    app, ctx, client, creator, slug, _ = _setup(palpitao={"enabled": True, "multiplier": 5})
    try:
        detail = client.get(f"/api/pools/{slug}/detail").get_json()
        palpitao = detail["pool"]["palpitao"]

        assert palpitao["enabled"] is True
        assert palpitao["multiplier"] == 5
    finally:
        db.session.remove()
        ctx.pop()


def test_pool_creation_can_disable_palpitao():
    app, ctx, client, creator, slug, _ = _setup(palpitao={"enabled": False})
    try:
        detail = client.get(f"/api/pools/{slug}/detail").get_json()

        assert detail["pool"]["palpitao"]["enabled"] is False
    finally:
        db.session.remove()
        ctx.pop()


# ---------------------------------------------------------------------------
# Prediction with hasMultiplier
# ---------------------------------------------------------------------------

def test_prediction_can_enable_palpitao():
    app, ctx, client, creator, slug, matches = _setup()
    try:
        match = matches[0]

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={"matchId": match.id, "homeScore": 2, "awayScore": 1, "hasMultiplier": True},
        )

        assert response.status_code == 200
        assert response.get_json()["hasMultiplier"] is True
    finally:
        db.session.remove()
        ctx.pop()


def test_palpitao_is_exclusive_across_predictions():
    """Activating Palpitão on a second prediction must clear it from the first."""
    app, ctx, client, creator, slug, matches = _setup()
    try:
        match_a, match_b = matches[0], matches[1]

        resp_a = client.post(
            f"/api/pools/{slug}/predictions",
            json={"matchId": match_a.id, "homeScore": 1, "awayScore": 0, "hasMultiplier": True},
        )
        assert resp_a.get_json()["hasMultiplier"] is True

        client.post(
            f"/api/pools/{slug}/predictions",
            json={"matchId": match_b.id, "homeScore": 2, "awayScore": 1, "hasMultiplier": True},
        )

        pred_a = Prediction.active().filter_by(
            pool_id=Pool.query.filter_by(slug=slug).one().id,
            match_id=match_a.id,
            user_id=creator.id,
        ).one()
        assert pred_a.has_multiplier is False
    finally:
        db.session.remove()
        ctx.pop()


def test_palpitao_blocked_when_disabled_in_pool():
    app, ctx, client, creator, slug, matches = _setup(palpitao={"enabled": False})
    try:
        match = matches[0]

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={"matchId": match.id, "homeScore": 1, "awayScore": 0, "hasMultiplier": True},
        )

        assert response.status_code == 400
    finally:
        db.session.remove()
        ctx.pop()


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

def test_ranking_shows_has_used_palpitao_false_by_default():
    app, ctx, client, creator, slug, _ = _setup()
    try:
        ranking = client.get(f"/api/pools/{slug}/ranking").get_json()

        assert all(entry["hasUsedPalpitao"] is False for entry in ranking)
    finally:
        db.session.remove()
        ctx.pop()


def test_ranking_shows_has_used_palpitao_true_after_setting():
    app, ctx, client, creator, slug, matches = _setup()
    try:
        match = matches[0]

        client.post(
            f"/api/pools/{slug}/predictions",
            json={"matchId": match.id, "homeScore": 1, "awayScore": 0, "hasMultiplier": True},
        )

        ranking = client.get(f"/api/pools/{slug}/ranking").get_json()
        creator_entry = next(e for e in ranking if e["userId"] == creator.id)

        assert creator_entry["hasUsedPalpitao"] is True
    finally:
        db.session.remove()
        ctx.pop()


# ---------------------------------------------------------------------------
# Pool edit (palpitao settings locked when predictions exist)
# ---------------------------------------------------------------------------

def test_edit_palpitao_without_predictions():
    app, ctx, client, creator, slug, _ = _setup()
    try:
        response = client.patch(
            f"/api/pools/{slug}",
            json={"palpitao": {"enabled": True, "multiplier": 7}},
        )

        assert response.status_code == 200
        assert response.get_json()["palpitao"]["multiplier"] == 7
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_palpitao_blocked_with_predictions():
    app, ctx, client, creator, slug, matches = _setup()
    try:
        match = matches[0]

        client.post(
            f"/api/pools/{slug}/predictions",
            json={"matchId": match.id, "homeScore": 2, "awayScore": 0},
        )

        response = client.patch(
            f"/api/pools/{slug}",
            json={"palpitao": {"multiplier": 10}},
        )

        assert response.status_code == 409
        assert "predictions" in response.get_json()["error"]
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_palpitao_multiplier_clamped_between_2_and_10():
    app, ctx, client, creator, slug, _ = _setup()
    try:
        resp_low = client.patch(f"/api/pools/{slug}", json={"palpitao": {"multiplier": 0}})
        resp_high = client.patch(f"/api/pools/{slug}", json={"palpitao": {"multiplier": 99}})

        assert resp_low.get_json()["palpitao"]["multiplier"] == 2
        assert resp_high.get_json()["palpitao"]["multiplier"] == 10
    finally:
        db.session.remove()
        ctx.pop()
