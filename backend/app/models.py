from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from .extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class MatchStatus(str, Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FINISHED = "finished"


class Participant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid4()))
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)


class TournamentStatus(str, Enum):
    ONGOING = "ongoing"
    FINISHED = "finished"


class Tournament(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(24), nullable=False, default=TournamentStatus.ONGOING.value)
    champion_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    runner_up_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    third_place_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    top_scorer = db.Column(db.String(120), nullable=True)
    best_player = db.Column(db.String(120), nullable=True)

    champion = db.relationship("Team", foreign_keys=[champion_team_id])
    runner_up = db.relationship("Team", foreign_keys=[runner_up_team_id])
    third_place = db.relationship("Team", foreign_keys=[third_place_team_id])


class TeamType(str, Enum):
    CLUB = "club"
    NATIONAL = "national"


class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    short_name = db.Column(db.String(12), nullable=True)
    team_type = db.Column(db.String(16), nullable=False, default=TeamType.NATIONAL.value)


class TournamentTeam(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=False)

    tournament = db.relationship("Tournament", backref="tournament_teams")
    team = db.relationship("Team", backref="tournament_teams")
    __table_args__ = (db.UniqueConstraint("tournament_id", "team_id", name="uq_tournament_team"),)


class StageType(str, Enum):
    GROUP = "group"
    LEAGUE = "league"
    KNOCKOUT = "knockout"


class Stage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    stage_type = db.Column(db.String(16), nullable=False, default=StageType.GROUP.value)

    tournament = db.relationship("Tournament", backref="stages")

    @property
    def is_knockout(self) -> bool:
        return self.stage_type == StageType.KNOCKOUT.value


class Pool(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(64), unique=True, nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    creator_name = db.Column(db.String(120), nullable=False)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    exact_score_points = db.Column(db.Integer, nullable=False, default=5)
    outcome_points = db.Column(db.Integer, nullable=False, default=3)
    one_team_goals_points = db.Column(db.Integer, nullable=False, default=1)
    penalty_bonus_points = db.Column(db.Integer, nullable=False, default=2)
    predict_champion = db.Column(db.Boolean, nullable=False, default=True)
    champion_points = db.Column(db.Integer, nullable=False, default=15)
    predict_runner_up = db.Column(db.Boolean, nullable=False, default=True)
    runner_up_points = db.Column(db.Integer, nullable=False, default=10)
    predict_third_place = db.Column(db.Boolean, nullable=False, default=True)
    third_place_points = db.Column(db.Integer, nullable=False, default=7)
    predict_top_scorer = db.Column(db.Boolean, nullable=False, default=False)
    top_scorer_points = db.Column(db.Integer, nullable=False, default=10)
    predict_best_player = db.Column(db.Boolean, nullable=False, default=False)
    best_player_points = db.Column(db.Integer, nullable=False, default=10)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    tournament = db.relationship("Tournament", backref="pools")


class PoolPrize(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer, db.ForeignKey("pool.id"), nullable=False)
    position = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255), nullable=False)

    pool = db.relationship("Pool", backref="prizes")
    __table_args__ = (db.UniqueConstraint("pool_id", "position", name="uq_pool_prize_position"),)


class PoolParticipant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer, db.ForeignKey("pool.id"), nullable=False)
    participant_id = db.Column(db.Integer, db.ForeignKey("participant.id"), nullable=False)
    display_name = db.Column(db.String(120), nullable=False)
    joined_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    pool = db.relationship("Pool", backref="memberships")
    participant = db.relationship("Participant", backref="memberships")
    __table_args__ = (
        db.UniqueConstraint("pool_id", "participant_id", name="uq_pool_participant"),
    )


class Match(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    stage_id = db.Column(db.Integer, db.ForeignKey("stage.id"), nullable=False)
    home_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    away_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=False)
    status = db.Column(db.String(24), nullable=False, default=MatchStatus.SCHEDULED.value)
    home_score = db.Column(db.Integer, nullable=True)
    away_score = db.Column(db.Integer, nullable=True)
    went_to_penalties = db.Column(db.Boolean, nullable=False, default=False)
    penalty_winner_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)

    tournament = db.relationship("Tournament", backref="matches")
    stage = db.relationship("Stage", backref="matches")
    home_team = db.relationship("Team", foreign_keys=[home_team_id])
    away_team = db.relationship("Team", foreign_keys=[away_team_id])
    penalty_winner = db.relationship("Team", foreign_keys=[penalty_winner_team_id])


class Prediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer, db.ForeignKey("pool.id"), nullable=False)
    participant_id = db.Column(db.Integer, db.ForeignKey("participant.id"), nullable=False)
    match_id = db.Column(db.Integer, db.ForeignKey("match.id"), nullable=False)
    predicted_home_score = db.Column(db.Integer, nullable=False)
    predicted_away_score = db.Column(db.Integer, nullable=False)
    predicts_penalties = db.Column(db.Boolean, nullable=False, default=False)
    predicted_penalty_winner_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    pool = db.relationship("Pool", backref="predictions")
    participant = db.relationship("Participant", backref="predictions")
    match = db.relationship("Match", backref="predictions")
    predicted_penalty_winner = db.relationship("Team", foreign_keys=[predicted_penalty_winner_team_id])
    __table_args__ = (
        db.UniqueConstraint("pool_id", "participant_id", "match_id", name="uq_prediction_per_match"),
    )


class ScoreEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    prediction_id = db.Column(db.Integer, db.ForeignKey("prediction.id"), nullable=False, unique=True)
    points = db.Column(db.Integer, nullable=False)
    exact_score = db.Column(db.Boolean, nullable=False, default=False)
    outcome_hit = db.Column(db.Boolean, nullable=False, default=False)
    penalty_hit = db.Column(db.Boolean, nullable=False, default=False)
    calculated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    prediction = db.relationship("Prediction", backref="score_entry")


class AwardPrediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer, db.ForeignKey("pool.id"), nullable=False)
    participant_id = db.Column(db.Integer, db.ForeignKey("participant.id"), nullable=False)
    champion_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    runner_up_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    third_place_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    top_scorer = db.Column(db.String(120), nullable=True)
    best_player = db.Column(db.String(120), nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    pool = db.relationship("Pool", backref="award_predictions")
    participant = db.relationship("Participant", backref="award_predictions")
    champion = db.relationship("Team", foreign_keys=[champion_team_id])
    runner_up = db.relationship("Team", foreign_keys=[runner_up_team_id])
    third_place = db.relationship("Team", foreign_keys=[third_place_team_id])
    __table_args__ = (db.UniqueConstraint("pool_id", "participant_id", name="uq_award_prediction"),)
