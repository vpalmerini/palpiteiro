from __future__ import annotations

from dataclasses import dataclass

from app.scoring import calculate_prediction_score


@dataclass
class PoolStub:
    exact_score_points: int = 5
    outcome_points: int = 3
    one_team_goals_points: int = 1
    penalty_bonus_points: int = 2


@dataclass
class MatchStub:
    home_score: int
    away_score: int
    went_to_penalties: bool = False
    penalty_winner_team_id: str | None = None


@dataclass
class PredictionStub:
    predicted_home_score: int
    predicted_away_score: int
    predicts_penalties: bool = False
    predicted_penalty_winner_team_id: str | None = None


def test_exact_score_gets_full_points():
    score = calculate_prediction_score(
        PredictionStub(2, 1),
        MatchStub(2, 1),
        PoolStub(),
    )

    assert score.points == 5
    assert score.exact_score is True


def test_outcome_and_one_team_goal_can_stack():
    score = calculate_prediction_score(
        PredictionStub(2, 0),
        MatchStub(2, 1),
        PoolStub(),
    )

    assert score.points == 4
    assert score.outcome_hit is True


def test_penalty_bonus_requires_penalty_winner():
    score = calculate_prediction_score(
        PredictionStub(1, 1, True, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        MatchStub(1, 1, True, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        PoolStub(),
    )

    assert score.points == 7
    assert score.penalty_hit is True
