from datetime import datetime, timedelta, timezone

from app import create_app
from app.auth import COOKIE_NAME, make_session_jwt
from app.extensions import db
from app.models import Match, MatchStatus, Pool, Prediction, Round, ScoreEntry, Stage, StageType, Team, Tournament, User


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


def _ensure_knockout_match_has_teams(tournament_id: str) -> None:
    """Assign teams to the first knockout match that has none, so predictions work."""
    knockout_stage = (
        Stage.query.filter_by(tournament_id=tournament_id, stage_type=StageType.KNOCKOUT.value).first()
    )
    if knockout_stage is None:
        return

    match = (
        Match.active()
        .join(Round, Match.round_id == Round.id)
        .filter(Round.stage_id == knockout_stage.id)
        .filter(Match.home_team_id.is_(None))
        .first()
    )
    if match is None:
        return

    teams = Team.active().limit(2).all()
    if len(teams) < 2:
        return

    match.home_team_id = teams[0].id
    match.away_team_id = teams[1].id
    # Seed knockout dates can fall in the past as the calendar advances; keep open for tests.
    starts_at = match.starts_at
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    if starts_at <= datetime.now(timezone.utc):
        match.starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
    db.session.flush()


def _client_with_pool():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        _ensure_knockout_match_has_teams(tournament.id)

        creator = _make_user("Victor", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={"name": "Bolao Teste", "tournamentId": tournament.id},
        ).get_json()

        participant = _make_user("Ana", "ana@example.com")
        db.session.commit()
        _set_auth(client, participant)

        client.post(f"/api/pools/{pool['slug']}/join", json={})

        yield client, pool["slug"]


def test_pool_creator_joins_with_nickname_in_ranking():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor Palmerini", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "tournamentId": tournament.id,
                "creatorNickname": "VP",
            },
        ).get_json()

        ranking = client.get(f"/api/pools/{pool['slug']}/ranking").get_json()

        assert pool["slug"]
        assert ranking[0]["displayName"] == "VP"


def test_pool_creator_uses_name_when_nickname_is_blank():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor Palmerini", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={
                "name": "Bolao Teste",
                "tournamentId": tournament.id,
                "creatorNickname": "",
            },
        ).get_json()

        ranking = client.get(f"/api/pools/{pool['slug']}/ranking").get_json()

        assert ranking[0]["displayName"] == "Victor Palmerini"


def test_ranking_backfills_creator_for_existing_empty_pool():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        tournament = Tournament.active().first()
        creator = _make_user("Victor Palmerini", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        pool = client.post(
            "/api/pools",
            json={"name": "Bolao Teste", "tournamentId": tournament.id},
        ).get_json()

        db.session.execute(db.text("delete from pool_participants"))
        db.session.commit()

        ranking = client.get(f"/api/pools/{pool['slug']}/ranking").get_json()

        assert ranking[0]["displayName"] == "Victor Palmerini"


def test_pool_creation_requires_tournament_id():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()
        client.post("/api/admin/seed")

        creator = _make_user("Victor Palmerini", "victor@example.com")
        db.session.commit()
        _set_auth(client, creator)

        response = client.post("/api/pools", json={"name": "Bolao Teste"})

        assert response.status_code == 400


def test_participant_joins_with_nickname_in_ranking():
    for client, slug in _client_with_pool():
        ranking = client.get(f"/api/pools/{slug}/ranking").get_json()

        assert any(entry["displayName"] == "Ana" for entry in ranking)


def test_participant_joins_with_custom_nickname():
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
            json={"name": "Bolao Teste", "tournamentId": tournament.id},
        ).get_json()
        slug = pool["slug"]

        participant = _make_user("Ana Maria", "ana@example.com")
        db.session.commit()
        _set_auth(client, participant)

        response = client.post(f"/api/pools/{slug}/join", json={"nickname": "AnaBolao"})
        ranking = client.get(f"/api/pools/{slug}/ranking").get_json()

        assert response.status_code == 200
        assert any(entry["displayName"] == "AnaBolao" for entry in ranking)


def test_participant_join_requires_auth():
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
            json={"name": "Bolao Teste", "tournamentId": tournament.id},
        ).get_json()

        unauthenticated = app.test_client()
        response = unauthenticated.post(f"/api/pools/{pool['slug']}/join", json={})

        assert response.status_code == 401


def test_knockout_draw_requires_penalty_winner():
    for client, slug in _client_with_pool():
        knockout_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json()
            if match["stage"]["isKnockout"] and match["homeTeam"] is not None
        )

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "matchId": knockout_match["id"],
                "homeScore": 1,
                "awayScore": 1,
            },
        )

        assert response.status_code == 400
        assert "penalty winner is required" in response.get_json()["error"]


def test_knockout_draw_automatically_predicts_penalties():
    for client, slug in _client_with_pool():
        knockout_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json()
            if match["stage"]["isKnockout"] and match["homeTeam"] is not None
        )

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "matchId": knockout_match["id"],
                "homeScore": 1,
                "awayScore": 1,
                "penaltyWinnerTeamId": knockout_match["homeTeam"]["id"],
            },
        )

        assert response.status_code == 200
        assert response.get_json()["predictsPenalties"] is True


def test_knockout_non_draw_ignores_penalty_winner():
    for client, slug in _client_with_pool():
        knockout_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json()
            if match["stage"]["isKnockout"] and match["homeTeam"] is not None
        )

        response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "matchId": knockout_match["id"],
                "homeScore": 2,
                "awayScore": 1,
                "penaltyWinnerTeamId": knockout_match["homeTeam"]["id"],
            },
        )

        assert response.status_code == 200
        assert response.get_json()["predictsPenalties"] is False
        assert response.get_json()["penaltyWinnerTeamId"] is None


def test_pool_detail_ranking_updated_at_is_null_without_scores():
    for client, slug in _client_with_pool():
        detail = client.get(f"/api/pools/{slug}/detail").get_json()

        assert detail["rankingUpdatedAt"] is None


def test_pool_detail_ranking_updated_at_reflects_latest_score_entry():
    for client, slug in _client_with_pool():
        detail_before = client.get(f"/api/pools/{slug}/detail").get_json()
        assert detail_before["rankingUpdatedAt"] is None

        upcoming_match = next(
            match for match in client.get(f"/api/pools/{slug}/matches").get_json()
            if not match["stage"]["isKnockout"]
            and match["homeTeam"] is not None
            and match["status"] != MatchStatus.FINISHED.value
        )
        match_obj = Match.query.filter_by(id=upcoming_match["id"]).one()
        match_obj.starts_at = datetime.now(timezone.utc) + timedelta(hours=2)
        db.session.commit()

        pred_response = client.post(
            f"/api/pools/{slug}/predictions",
            json={
                "matchId": upcoming_match["id"],
                "homeScore": 2,
                "awayScore": 1,
            },
        )
        assert pred_response.status_code == 200

        pool_obj = Pool.query.filter_by(slug=slug).one()
        creator = pool_obj.creator
        assert creator is not None
        creator.is_admin = True
        db.session.commit()
        _set_auth(client, creator)

        result_response = client.post(
            f"/api/admin/matches/{upcoming_match['id']}/result",
            json={"homeScore": 2, "awayScore": 1},
        )
        assert result_response.status_code == 200

        score_updated_at = (
            db.session.query(ScoreEntry.updated_at)
            .join(Prediction, ScoreEntry.prediction_id == Prediction.id)
            .filter(
                Prediction.pool_id == pool_obj.id,
                Prediction.match_id == upcoming_match["id"],
            )
            .scalar()
        )
        assert score_updated_at is not None

        detail_after = client.get(f"/api/pools/{slug}/detail").get_json()
        assert detail_after["rankingUpdatedAt"] == score_updated_at.isoformat()
