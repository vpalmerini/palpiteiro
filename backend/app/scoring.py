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


def _match_is_knockout(match) -> bool:
    """True when the match belongs to a knockout stage."""
    if hasattr(match, "is_knockout"):
        return bool(match.is_knockout)
    round_ = getattr(match, "round", None)
    stage = getattr(round_, "stage", None) if round_ is not None else None
    if stage is None:
        return False
    if hasattr(stage, "is_knockout"):
        return bool(stage.is_knockout)
    return stage.stage_type == "knockout"


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

    knockout_multiplier = getattr(pool, "knockout_score_multiplier", 1) or 1
    if _match_is_knockout(match) and knockout_multiplier > 1 and points > 0:
        points *= knockout_multiplier

    if pool.is_multiplier_enabled and prediction.has_multiplier and points > 0:
        points *= pool.multiplier_value

    return ScoreResult(
        points=points,
        exact_score=exact_score,
        outcome_hit=outcome_hit,
        penalty_hit=penalty_hit,
    )
