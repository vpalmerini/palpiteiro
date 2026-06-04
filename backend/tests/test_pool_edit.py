from app import create_app
from app.auth import COOKIE_NAME, make_session_jwt
from app.extensions import db
from app.models import AwardPrediction, Match, Prediction, Tournament, TournamentStatus, User


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
    """Seed DB, return (app, client, creator, pool_slug)."""
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

    pool = client.post(
        "/api/pools",
        json={"name": "Bolao Original", "tournamentId": tournament.id},
    ).get_json()

    return app, ctx, client, creator, pool["slug"]


# ---------------------------------------------------------------------------
# Payload fields
# ---------------------------------------------------------------------------

def test_pool_payload_includes_tournament_status():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={"name": "Bolao", "tournamentId": tournament.id},
        ).get_json()

        detail = client.get(f"/api/pools/{pool['slug']}/detail").get_json()

        assert detail["pool"]["tournamentStatus"] == TournamentStatus.ONGOING.value


def test_pool_payload_has_predictions_false_when_empty():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={"name": "Bolao", "tournamentId": tournament.id},
        ).get_json()

        detail = client.get(f"/api/pools/{pool['slug']}/detail").get_json()

        assert detail["pool"]["hasPredictions"] is False


def test_pool_payload_has_predictions_true_with_match_prediction():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={"name": "Bolao", "tournamentId": tournament.id},
        ).get_json()

        # Get first match for this pool
        match = Match.active().filter_by(tournament_id=tournament.id).first()

        # Insert a prediction directly
        db.session.add(Prediction(
            pool_id=pool["id"],
            user_id=creator.id,
            match_id=match.id,
            predicted_home_score=1,
            predicted_away_score=0,
        ))
        db.session.commit()

        detail = client.get(f"/api/pools/{pool['slug']}/detail").get_json()

        assert detail["pool"]["hasPredictions"] is True


def test_pool_payload_has_predictions_true_with_award_prediction():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={"name": "Bolao", "tournamentId": tournament.id},
        ).get_json()

        db.session.add(AwardPrediction(pool_id=pool["id"], user_id=creator.id))
        db.session.commit()

        detail = client.get(f"/api/pools/{pool['slug']}/detail").get_json()

        assert detail["pool"]["hasPredictions"] is True


# ---------------------------------------------------------------------------
# Auth and permission
# ---------------------------------------------------------------------------

def test_edit_requires_auth():
    app, ctx, client, creator, slug = _setup()
    try:
        unauthenticated = app.test_client()
        response = unauthenticated.patch(f"/api/pools/{slug}", json={"name": "Novo nome"})
        assert response.status_code == 401
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_requires_creator():
    app, ctx, client, creator, slug = _setup()
    try:
        other = _make_user("Outro", "outro@example.com")
        db.session.commit()
        _set_auth(client, other)

        response = client.patch(f"/api/pools/{slug}", json={"name": "Tentativa"})

        assert response.status_code == 403
    finally:
        db.session.remove()
        ctx.pop()


# ---------------------------------------------------------------------------
# Basic edits (name, description, prizes)
# ---------------------------------------------------------------------------

def test_edit_name():
    app, ctx, client, creator, slug = _setup()
    try:
        response = client.patch(f"/api/pools/{slug}", json={"name": "Novo nome"})

        assert response.status_code == 200
        assert response.get_json()["name"] == "Novo nome"
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_empty_name_returns_400():
    app, ctx, client, creator, slug = _setup()
    try:
        response = client.patch(f"/api/pools/{slug}", json={"name": ""})

        assert response.status_code == 400
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_description():
    app, ctx, client, creator, slug = _setup()
    try:
        response = client.patch(f"/api/pools/{slug}", json={"description": "Nova descrição"})

        assert response.status_code == 200
        assert response.get_json()["description"] == "Nova descrição"
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_prizes():
    app, ctx, client, creator, slug = _setup()
    try:
        response = client.patch(f"/api/pools/{slug}", json={
            "prizes": [
                {"position": 1, "description": "R$ 1000"},
                {"position": 2, "description": "R$ 500"},
                {"position": 3, "description": "R$ 200"},
            ]
        })

        assert response.status_code == 200
        prizes = {p["position"]: p["description"] for p in response.get_json()["prizes"]}
        assert prizes[1] == "R$ 1000"
        assert prizes[2] == "R$ 500"
        assert prizes[3] == "R$ 200"
    finally:
        db.session.remove()
        ctx.pop()


# ---------------------------------------------------------------------------
# Tournament finished
# ---------------------------------------------------------------------------

def test_edit_blocked_when_tournament_finished():
    app, ctx, client, creator, slug = _setup()
    try:
        tournament = Tournament.active().first()
        tournament.status = TournamentStatus.FINISHED.value
        db.session.commit()

        response = client.patch(f"/api/pools/{slug}", json={"name": "Novo nome"})

        assert response.status_code == 409
    finally:
        db.session.remove()
        ctx.pop()


# ---------------------------------------------------------------------------
# Scoring and awards (locked by predictions)
# ---------------------------------------------------------------------------

def test_edit_scoring_without_predictions():
    app, ctx, client, creator, slug = _setup()
    try:
        response = client.patch(f"/api/pools/{slug}", json={
            "scoring": {"exactScore": 10, "outcome": 5, "oneTeamGoals": 2, "penaltyBonus": 3}
        })

        assert response.status_code == 200
        scoring = response.get_json()["scoring"]
        assert scoring["exactScore"] == 10
        assert scoring["outcome"] == 5
        assert scoring["oneTeamGoals"] == 2
        assert scoring["penaltyBonus"] == 3
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_awards_without_predictions():
    app, ctx, client, creator, slug = _setup()
    try:
        response = client.patch(f"/api/pools/{slug}", json={
            "awards": {
                "champion": {"enabled": True, "points": 20},
                "topScorer": {"enabled": True, "points": 15},
            }
        })

        assert response.status_code == 200
        awards = response.get_json()["awards"]
        assert awards["champion"]["points"] == 20
        assert awards["topScorer"]["enabled"] is True
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_scoring_blocked_with_match_predictions():
    app, ctx, client, creator, slug = _setup()
    try:
        tournament = Tournament.active().first()
        match = Match.active().filter_by(tournament_id=tournament.id).first()

        pool_resp = client.get(f"/api/pools/{slug}").get_json()
        db.session.add(Prediction(
            pool_id=pool_resp["id"],
            user_id=creator.id,
            match_id=match.id,
            predicted_home_score=2,
            predicted_away_score=1,
        ))
        db.session.commit()

        response = client.patch(f"/api/pools/{slug}", json={
            "scoring": {"exactScore": 99}
        })

        assert response.status_code == 409
        assert "predictions" in response.get_json()["error"]
    finally:
        db.session.remove()
        ctx.pop()


def test_edit_awards_blocked_with_award_predictions():
    app, ctx, client, creator, slug = _setup()
    try:
        pool_resp = client.get(f"/api/pools/{slug}").get_json()
        db.session.add(AwardPrediction(pool_id=pool_resp["id"], user_id=creator.id))
        db.session.commit()

        response = client.patch(f"/api/pools/{slug}", json={
            "awards": {"champion": {"enabled": False}}
        })

        assert response.status_code == 409
        assert "predictions" in response.get_json()["error"]
    finally:
        db.session.remove()
        ctx.pop()


def test_name_and_prizes_still_editable_with_predictions():
    """Name, description and prizes remain editable even when predictions exist."""
    app, ctx, client, creator, slug = _setup()
    try:
        tournament = Tournament.active().first()
        match = Match.active().filter_by(tournament_id=tournament.id).first()

        pool_resp = client.get(f"/api/pools/{slug}").get_json()
        db.session.add(Prediction(
            pool_id=pool_resp["id"],
            user_id=creator.id,
            match_id=match.id,
            predicted_home_score=1,
            predicted_away_score=1,
        ))
        db.session.commit()

        response = client.patch(f"/api/pools/{slug}", json={
            "name": "Nome atualizado",
            "prizes": [
                {"position": 1, "description": "R$ 2000"},
                {"position": 2, "description": "R$ 1000"},
                {"position": 3, "description": "R$ 500"},
            ],
        })

        assert response.status_code == 200
        data = response.get_json()
        assert data["name"] == "Nome atualizado"
        prizes = {p["position"]: p["description"] for p in data["prizes"]}
        assert prizes[1] == "R$ 2000"
    finally:
        db.session.remove()
        ctx.pop()
