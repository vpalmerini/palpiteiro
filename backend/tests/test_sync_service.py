"""Tests for sync_service: link_external_ids and sync_tournament_results."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app import create_app
from app.extensions import db
from app.models import Match, MatchStatus, Pool, Round, Stage, StageType, Team, Tournament


class TestConfig:
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = "http://localhost:3000"
    JWT_SECRET = "test-secret"
    FOOTBALL_DATA_API_KEY = "test-key"
    FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4"


# ── fixtures ──────────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_tournament(name="Copa do Mundo FIFA 2026", code=None):
    t = Tournament(name=name, year=2026, external_competition_code=code)
    db.session.add(t)
    db.session.flush()
    return t


def _make_team(short_name: str, external_id: int | None = None):
    t = Team(name=short_name, short_name=short_name, external_id=external_id)
    db.session.add(t)
    db.session.flush()
    return t


def _make_stage(tournament, stage_type=StageType.GROUP.value):
    s = Stage(tournament_id=tournament.id, name="Group Stage", order=1, stage_type=stage_type)
    db.session.add(s)
    db.session.flush()
    return s


def _make_round(stage):
    r = Round(stage_id=stage.id, number=1)
    db.session.add(r)
    db.session.flush()
    return r


def _make_match(
    tournament,
    round_,
    home_team,
    away_team,
    starts_at=None,
    status=MatchStatus.SCHEDULED.value,
    external_id=None,
):
    if starts_at is None:
        starts_at = _utcnow() - timedelta(hours=3)
    m = Match(
        tournament_id=tournament.id,
        round_id=round_.id,
        home_team_id=home_team.id if home_team else None,
        away_team_id=away_team.id if away_team else None,
        starts_at=starts_at,
        status=status,
        external_id=external_id,
    )
    db.session.add(m)
    db.session.flush()
    return m


def _make_pool(tournament):
    p = Pool(
        slug="test-pool",
        name="Test Pool",
        creator_name="Tester",
        tournament_id=tournament.id,
    )
    db.session.add(p)
    db.session.flush()
    return p


@pytest.fixture
def app():
    application = create_app(TestConfig)
    ctx = application.app_context()
    ctx.push()
    db.create_all()
    yield application
    db.session.remove()
    db.drop_all()
    ctx.pop()


# ── link_external_ids ─────────────────────────────────────────────────────────

class TestLinkExternalIds:
    def test_fills_all_48_teams(self, app):
        from app.sync_service import SHORT_NAME_TO_EXTERNAL_ID, link_external_ids

        for short_name in SHORT_NAME_TO_EXTERNAL_ID:
            _make_team(short_name)
        db.session.commit()

        tournament = _make_tournament()
        db.session.commit()

        with patch("app.sync_service.list_all_matches", return_value=[]):
            summary = link_external_ids()

        assert summary.teams_linked == 49
        assert summary.teams_skipped == 0

        for short_name, ext_id in SHORT_NAME_TO_EXTERNAL_ID.items():
            team = Team.active().filter_by(short_name=short_name).first()
            assert team is not None
            assert team.external_id == ext_id, f"expected {ext_id} for {short_name}"

    def test_skips_already_filled_teams(self, app):
        from app.sync_service import link_external_ids

        _make_team("BRA", external_id=764)
        _make_team("ARG", external_id=762)
        db.session.commit()

        _make_tournament()
        db.session.commit()

        with patch("app.sync_service.list_all_matches", return_value=[]):
            summary = link_external_ids()

        assert summary.teams_skipped == 2
        assert summary.teams_linked == 0

    def test_fills_match_external_id_by_team_pair(self, app):
        from app.sync_service import link_external_ids

        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        _make_match(tournament, round_, home, away)
        db.session.commit()

        ext_matches = [
            {
                "id": 9999,
                "status": "SCHEDULED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
            }
        ]
        with patch("app.sync_service.list_all_matches", return_value=ext_matches):
            summary = link_external_ids()

        assert summary.matches_linked == 1
        assert summary.matches_unresolved == 0
        match = Match.active().first()
        assert match.external_id == 9999

    def test_idempotent_match_linking(self, app):
        from app.sync_service import link_external_ids

        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        _make_match(tournament, round_, home, away, external_id=9999)
        db.session.commit()

        ext_matches = [
            {
                "id": 9999,
                "status": "SCHEDULED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
            }
        ]
        with patch("app.sync_service.list_all_matches", return_value=ext_matches):
            s1 = link_external_ids()
            s2 = link_external_ids()

        # Already had external_id — no new links
        assert s1.matches_linked == 0
        assert s2.matches_linked == 0

    def test_match_without_teams_left_unresolved(self, app):
        from app.sync_service import link_external_ids

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        # knockout match — teams not defined yet
        m = Match(
            tournament_id=tournament.id,
            round_id=round_.id,
            home_team_id=None,
            away_team_id=None,
            starts_at=_utcnow() + timedelta(days=30),
            status=MatchStatus.SCHEDULED.value,
        )
        db.session.add(m)
        db.session.commit()

        with patch("app.sync_service.list_all_matches", return_value=[]):
            summary = link_external_ids()

        assert summary.matches_unresolved == 0  # filtered out by query (both teams required)
        assert summary.matches_linked == 0


# ── sync_tournament_results ───────────────────────────────────────────────────

class TestSyncTournamentResults:
    def test_no_candidates_skips_api(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)

        # Match starting in the future — not a candidate
        _make_match(
            tournament, round_, home, away,
            starts_at=_utcnow() + timedelta(hours=2),
        )
        db.session.commit()

        with patch("app.sync_service.list_matches_for_dates") as mock_api:
            summary = sync_tournament_results(tournament)
            mock_api.assert_not_called()

        assert summary.updated == []

    def test_finished_match_not_a_candidate(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        _make_match(
            tournament, round_, home, away,
            starts_at=_utcnow() - timedelta(hours=3),
            status=MatchStatus.FINISHED.value,
        )
        db.session.commit()

        with patch("app.sync_service.list_matches_for_dates") as mock_api:
            sync_tournament_results(tournament)
            mock_api.assert_not_called()

    def test_candidate_skipped_if_external_not_finished(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        _make_match(tournament, round_, home, away, external_id=9001)
        db.session.commit()

        ext_matches = [
            {
                "id": 9001,
                "status": "IN_PLAY",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
                "score": {"duration": "REGULAR", "fullTime": {"home": None, "away": None}},
            }
        ]
        with patch("app.sync_service.list_matches_for_dates", return_value=ext_matches):
            summary = sync_tournament_results(tournament)

        assert summary.skipped_not_finished != []
        assert summary.updated == []

        match = Match.active().first()
        assert match.status == MatchStatus.SCHEDULED.value

    def test_applies_score_by_external_id(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        _make_pool(tournament)
        match = _make_match(tournament, round_, home, away, external_id=9001)
        db.session.commit()

        ext_matches = [
            {
                "id": 9001,
                "status": "FINISHED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
                "score": {
                    "duration": "REGULAR",
                    "winner": "HOME_TEAM",
                    "fullTime": {"home": 2, "away": 1},
                },
            }
        ]
        with patch("app.sync_service.list_matches_for_dates", return_value=ext_matches):
            summary = sync_tournament_results(tournament)

        assert len(summary.updated) == 1
        db.session.refresh(match)
        assert match.home_score == 2
        assert match.away_score == 1
        assert match.status == MatchStatus.FINISHED.value
        assert match.went_to_penalties is False

    def test_resolves_by_team_pair_and_saves_external_id(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        _make_pool(tournament)
        match = _make_match(tournament, round_, home, away)  # no external_id
        assert match.external_id is None
        db.session.commit()

        ext_matches = [
            {
                "id": 9001,
                "status": "FINISHED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
                "score": {
                    "duration": "REGULAR",
                    "winner": "HOME_TEAM",
                    "fullTime": {"home": 3, "away": 0},
                },
            }
        ]
        with patch("app.sync_service.list_matches_for_dates", return_value=ext_matches):
            summary = sync_tournament_results(tournament)

        assert len(summary.updated) == 1
        db.session.refresh(match)
        assert match.external_id == 9001
        assert match.home_score == 3

    def test_applies_penalty_shootout_score(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament, stage_type=StageType.KNOCKOUT.value)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        _make_pool(tournament)
        match = _make_match(tournament, round_, home, away, external_id=9002)
        db.session.commit()

        ext_matches = [
            {
                "id": 9002,
                "status": "FINISHED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
                "score": {
                    "duration": "PENALTY_SHOOTOUT",
                    "winner": "AWAY_TEAM",
                    "regularTime": {"home": 1, "away": 1},
                    "fullTime": {"home": 1, "away": 1},
                },
            }
        ]
        with patch("app.sync_service.list_matches_for_dates", return_value=ext_matches):
            summary = sync_tournament_results(tournament)

        assert len(summary.updated) == 1
        db.session.refresh(match)
        assert match.home_score == 1
        assert match.away_score == 1
        assert match.went_to_penalties is True
        assert match.penalty_winner_team_id == away.id

    def test_idempotent_sync(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=764)
        away = _make_team("ARG", external_id=762)
        _make_pool(tournament)
        match = _make_match(tournament, round_, home, away, external_id=9001)
        db.session.commit()

        ext_matches = [
            {
                "id": 9001,
                "status": "FINISHED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
                "score": {
                    "duration": "REGULAR",
                    "winner": "HOME_TEAM",
                    "fullTime": {"home": 2, "away": 0},
                },
            }
        ]
        with patch("app.sync_service.list_matches_for_dates", return_value=ext_matches):
            s1 = sync_tournament_results(tournament)
            # second run: match is now FINISHED, so no candidates
            s2 = sync_tournament_results(tournament)

        assert len(s1.updated) == 1
        assert s2.updated == []  # already finished, not a candidate

        db.session.refresh(match)
        assert match.home_score == 2  # unchanged

    def test_team_without_external_id_skipped(self, app):
        from app.sync_service import sync_tournament_results

        tournament = _make_tournament(code="WC")
        stage = _make_stage(tournament)
        round_ = _make_round(stage)
        home = _make_team("BRA", external_id=None)  # no external_id
        away = _make_team("ARG", external_id=762)
        _make_match(tournament, round_, home, away)
        db.session.commit()

        ext_matches = [
            {
                "id": 9001,
                "status": "FINISHED",
                "homeTeam": {"id": 764},
                "awayTeam": {"id": 762},
                "score": {"duration": "REGULAR", "fullTime": {"home": 1, "away": 0}},
            }
        ]
        with patch("app.sync_service.list_matches_for_dates", return_value=ext_matches):
            summary = sync_tournament_results(tournament)

        assert summary.skipped_not_mapped != []
        assert summary.updated == []
