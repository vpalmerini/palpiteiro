from app import create_app
from app.extensions import db


class TestConfig:
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = "http://localhost:3000"


def _client_with_pool():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")
        pool = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "creatorName": "Victor",
                "creatorEmail": "victor@example.com",
                "prizes": [
                    {"position": 1, "description": "R$ 500"},
                    {"position": 2, "description": "R$ 250"},
                    {"position": 3, "description": "R$ 100"},
                ],
            },
        ).get_json()
        participant = client.post(
            f"/api/pools/{pool['slug']}/join",
            json={"name": "Ana", "email": "ana@example.com"},
        ).get_json()
        yield client, pool["slug"], participant["participantId"]


def test_pool_creator_joins_with_nickname_in_ranking():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        pool = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "creatorName": "Victor Palmerini",
                "creatorEmail": "victor@example.com",
                "creatorNickname": "VP",
                "prizes": [
                    {"position": 1, "description": "R$ 500"},
                    {"position": 2, "description": "R$ 250"},
                    {"position": 3, "description": "R$ 100"},
                ],
            },
        ).get_json()

        ranking = client.get(f"/api/pools/{pool['slug']}/ranking").get_json()

        assert pool["creatorParticipantId"]
        assert pool["creatorDisplayName"] == "VP"
        assert ranking[0]["displayName"] == "VP"


def test_pool_creator_uses_name_when_nickname_is_blank():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        pool = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "creatorName": "Victor Palmerini",
                "creatorEmail": "victor@example.com",
                "creatorNickname": "",
                "prizes": [
                    {"position": 1, "description": "R$ 500"},
                    {"position": 2, "description": "R$ 250"},
                    {"position": 3, "description": "R$ 100"},
                ],
            },
        ).get_json()

        ranking = client.get(f"/api/pools/{pool['slug']}/ranking").get_json()

        assert pool["creatorDisplayName"] == "Victor Palmerini"
        assert ranking[0]["displayName"] == "Victor Palmerini"


def test_ranking_backfills_creator_for_existing_empty_pool():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        pool = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "creatorName": "Victor Palmerini",
                "creatorEmail": "victor@example.com",
                "prizes": [
                    {"position": 1, "description": "R$ 500"},
                    {"position": 2, "description": "R$ 250"},
                    {"position": 3, "description": "R$ 100"},
                ],
            },
        ).get_json()

        db.session.execute(db.text("delete from pool_participant"))
        db.session.execute(db.text("delete from participant"))
        db.session.commit()

        ranking = client.get(f"/api/pools/{pool['slug']}/ranking").get_json()

        assert ranking[0]["displayName"] == "Victor Palmerini"


def test_pool_creation_requires_creator_email():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        response = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "creatorName": "Victor Palmerini",
                "prizes": [
                    {"position": 1, "description": "R$ 500"},
                    {"position": 2, "description": "R$ 250"},
                    {"position": 3, "description": "R$ 100"},
                ],
            },
        )

        assert response.status_code == 400


def test_participant_joins_with_nickname_in_ranking():
    for client, slug, _participant_id in _client_with_pool():
        response = client.post(
            f"/api/pools/{slug}/join",
            json={"name": "Ana Maria", "email": "ana@example.com", "nickname": "AnaBolao"},
        )

        ranking = client.get(f"/api/pools/{slug}/ranking").get_json()

        assert response.status_code == 200
        assert any(entry["displayName"] == "AnaBolao" for entry in ranking)


def test_participant_join_requires_email():
    for client, slug, _participant_id in _client_with_pool():
        response = client.post(f"/api/pools/{slug}/join", json={"name": "Ana"})

        assert response.status_code == 400


def test_knockout_draw_requires_penalty_winner():
    for client, slug, participant_id in _client_with_pool():
        knockout_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json() if match["stage"]["isKnockout"]
        )

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "participantId": participant_id,
                "matchId": knockout_match["id"],
                "homeScore": 1,
                "awayScore": 1,
            },
        )

        assert response.status_code == 400
        assert "penalty winner is required" in response.get_json()["error"]


def test_knockout_draw_automatically_predicts_penalties():
    for client, slug, participant_id in _client_with_pool():
        knockout_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json() if match["stage"]["isKnockout"]
        )

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "participantId": participant_id,
                "matchId": knockout_match["id"],
                "homeScore": 1,
                "awayScore": 1,
                "penaltyWinnerTeamId": knockout_match["homeTeam"]["id"],
            },
        )

        assert response.status_code == 200
        assert response.get_json()["predictsPenalties"] is True


def test_knockout_non_draw_ignores_penalty_winner():
    for client, slug, participant_id in _client_with_pool():
        knockout_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json() if match["stage"]["isKnockout"]
        )

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "participantId": participant_id,
                "matchId": knockout_match["id"],
                "homeScore": 2,
                "awayScore": 1,
                "penaltyWinnerTeamId": knockout_match["homeTeam"]["id"],
            },
        )

        assert response.status_code == 200
        assert response.get_json()["predictsPenalties"] is False
        assert response.get_json()["penaltyWinnerTeamId"] is None
