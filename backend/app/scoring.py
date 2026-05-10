from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreResult:
    points: int
    exact_score: bool
    outcome_hit: bool
    penalty_hit: bool


def _outcome(home_score: int, away_score: int) -> str:
    if home_score > away_score:
        return "home"
    if away_score > home_score:
        return "away"
    return "draw"


def calculate_prediction_score(prediction, match, pool) -> ScoreResult:
    if match.home_score is None or match.away_score is None:
        return ScoreResult(points=0, exact_score=False, outcome_hit=False, penalty_hit=False)

    exact_score = (
        prediction.predicted_home_score == match.home_score
        and prediction.predicted_away_score == match.away_score
    )
    outcome_hit = _outcome(
        prediction.predicted_home_score,
        prediction.predicted_away_score,
    ) == _outcome(match.home_score, match.away_score)

    points = 0
    if exact_score:
        points += pool.exact_score_points
    elif outcome_hit:
        points += pool.outcome_points

    if not exact_score:
        if prediction.predicted_home_score == match.home_score:
            points += pool.one_team_goals_points
        if prediction.predicted_away_score == match.away_score:
            points += pool.one_team_goals_points

    penalty_hit = False
    if match.went_to_penalties:
        penalty_hit = (
            prediction.predicts_penalties
            and prediction.predicted_penalty_winner_team_id == match.penalty_winner_team_id
        )
        if penalty_hit:
            points += pool.penalty_bonus_points

    return ScoreResult(
        points=points,
        exact_score=exact_score,
        outcome_hit=outcome_hit,
        penalty_hit=penalty_hit,
    )
