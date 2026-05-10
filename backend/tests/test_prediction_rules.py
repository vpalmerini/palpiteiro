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
                "prizes": [
                    {"position": 1, "description": "R$ 500"},
                    {"position": 2, "description": "R$ 250"},
                    {"position": 3, "description": "R$ 100"},
                ],
            },
        ).get_json()
        participant = client.post(f"/api/pools/{pool['slug']}/join", json={"name": "Ana"}).get_json()
        yield client, pool["slug"], participant["participantId"]


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
