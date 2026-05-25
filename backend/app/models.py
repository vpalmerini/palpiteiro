from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from .extensions import db


def utc_now():
    return datetime.now(timezone.utc)


def _uuid4_str():
    return str(uuid4())


class MatchStatus(str, Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FINISHED = "finished"


class TournamentStatus(str, Enum):
    ONGOING = "ongoing"
    FINISHED = "finished"


class TeamType(str, Enum):
    CLUB = "club"
    NATIONAL = "national"


class StageType(str, Enum):
    GROUP = "group"
    LEAGUE = "league"
    KNOCKOUT = "knockout"


# ── Auth / Identity ──────────────────────────────────────────────────────────

class User(db.Model):
    """Authenticated account. Replaces the old unauthenticated Participant."""
    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(36), unique=True, nullable=False, default=_uuid4_str)
    google_id = db.Column(db.String(128), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    picture_url = db.Column(db.String(512), nullable=True)
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)


# ── Tournament / Teams ────────────────────────────────────────────────────────

class Tournament(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(24), nullable=False, default=TournamentStatus.ONGOING.value)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=True)
    champion_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    runner_up_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    third_place_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    top_scorer = db.Column(db.String(120), nullable=True)
    best_player = db.Column(db.String(120), nullable=True)

    champion = db.relationship("Team", foreign_keys=[champion_team_id])
    runner_up = db.relationship("Team", foreign_keys=[runner_up_team_id])
    third_place = db.relationship("Team", foreign_keys=[third_place_team_id])

    __table_args__ = (
        db.UniqueConstraint("name", "year", name="uq_tournament_name_year"),
    )


class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    short_name = db.Column(db.String(12), nullable=True)
    team_type = db.Column(db.String(16), nullable=False, default=TeamType.NATIONAL.value)


class TournamentGroup(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stage_id = db.Column(
        db.Integer,
        db.ForeignKey("stage.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(40), nullable=False)

    stage = db.relationship("Stage", backref=db.backref("groups", passive_deletes=True))
    __table_args__ = (db.UniqueConstraint("stage_id", "name", name="uq_group_name"),)


class TournamentTeam(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=False, index=True)
    group_id = db.Column(
        db.Integer,
        db.ForeignKey("tournament_group.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    tournament = db.relationship("Tournament", backref="tournament_teams")
    team = db.relationship("Team", backref="tournament_teams")
    group = db.relationship("TournamentGroup", backref="team_assignments")
    __table_args__ = (db.UniqueConstraint("tournament_id", "team_id", name="uq_tournament_team"),)


# ── Stages / Rounds / Matches ─────────────────────────────────────────────────

class Stage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(
        db.Integer,
        db.ForeignKey("tournament.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(80), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    stage_type = db.Column(db.String(16), nullable=False, default=StageType.GROUP.value)

    tournament = db.relationship(
        "Tournament",
        backref=db.backref("stages", passive_deletes=True),
    )

    @property
    def is_knockout(self) -> bool:
        return self.stage_type == StageType.KNOCKOUT.value

    __table_args__ = (
        db.UniqueConstraint("tournament_id", "order", name="uq_stage_order"),
        db.UniqueConstraint("tournament_id", "name", name="uq_stage_name"),
    )


class Round(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stage_id = db.Column(
        db.Integer,
        db.ForeignKey("stage.id", ondelete="CASCADE"),
        nullable=False,
    )
    number = db.Column(db.Integer, nullable=False)

    stage = db.relationship("Stage", backref=db.backref("rounds", passive_deletes=True))
    __table_args__ = (db.UniqueConstraint("stage_id", "number", name="uq_round_number"),)


class Match(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(
        db.Integer,
        db.ForeignKey("tournament.id"),
        nullable=False,
        index=True,
    )
    round_id = db.Column(
        db.Integer,
        db.ForeignKey("round.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    home_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    away_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    venue = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(24), nullable=False, default=MatchStatus.SCHEDULED.value, index=True)
    home_score = db.Column(db.Integer, nullable=True)
    away_score = db.Column(db.Integer, nullable=True)
    went_to_penalties = db.Column(db.Boolean, nullable=False, default=False)
    penalty_winner_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)

    tournament = db.relationship("Tournament", backref="matches")
    round = db.relationship("Round", backref=db.backref("matches", passive_deletes=True))
    home_team = db.relationship("Team", foreign_keys=[home_team_id])
    away_team = db.relationship("Team", foreign_keys=[away_team_id])
    penalty_winner = db.relationship("Team", foreign_keys=[penalty_winner_team_id])

    @property
    def stage(self) -> "Stage":
        return self.round.stage

    __table_args__ = (
        db.CheckConstraint(
            "home_team_id IS NULL OR away_team_id IS NULL OR home_team_id != away_team_id",
            name="ck_match_teams_differ",
        ),
        db.CheckConstraint(
            "(home_score IS NULL AND away_score IS NULL) OR (home_score IS NOT NULL AND away_score IS NOT NULL)",
            name="ck_match_scores_both_or_neither",
        ),
        db.CheckConstraint("home_score IS NULL OR home_score >= 0", name="ck_match_home_score_positive"),
        db.CheckConstraint("away_score IS NULL OR away_score >= 0", name="ck_match_away_score_positive"),
    )


# ── Pools ─────────────────────────────────────────────────────────────────────

class Pool(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(64), unique=True, nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    creator_name = db.Column(db.String(120), nullable=False)
    creator_user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=True,
        index=True,
    )
    tournament_id = db.Column(
        db.Integer,
        db.ForeignKey("tournament.id"),
        nullable=False,
        index=True,
    )
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
    creator = db.relationship("User", foreign_keys=[creator_user_id], backref="created_pools")


class PoolPrize(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(
        db.Integer,
        db.ForeignKey("pool.id", ondelete="CASCADE"),
        nullable=False,
    )
    position = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255), nullable=False)

    pool = db.relationship("Pool", backref=db.backref("prizes", passive_deletes=True))
    __table_args__ = (
        db.UniqueConstraint("pool_id", "position", name="uq_pool_prize_position"),
        db.CheckConstraint("position BETWEEN 1 AND 3", name="ck_pool_prize_position_range"),
    )


class PoolParticipant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(
        db.Integer,
        db.ForeignKey("pool.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False,
        index=True,
    )
    display_name = db.Column(db.String(120), nullable=False)
    joined_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    pool = db.relationship("Pool", backref=db.backref("memberships", passive_deletes=True))
    user = db.relationship("User", backref="memberships")
    __table_args__ = (
        db.UniqueConstraint("pool_id", "user_id", name="uq_pool_user"),
    )


# ── Predictions & Scoring ─────────────────────────────────────────────────────

class Prediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(
        db.Integer,
        db.ForeignKey("pool.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False,
        index=True,
    )
    match_id = db.Column(
        db.Integer,
        db.ForeignKey("match.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    predicted_home_score = db.Column(db.Integer, nullable=False)
    predicted_away_score = db.Column(db.Integer, nullable=False)
    predicts_penalties = db.Column(db.Boolean, nullable=False, default=False)
    predicted_penalty_winner_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    pool = db.relationship("Pool", backref=db.backref("predictions", passive_deletes=True))
    user = db.relationship("User", backref="predictions")
    match = db.relationship("Match", backref=db.backref("predictions", passive_deletes=True))
    predicted_penalty_winner = db.relationship("Team", foreign_keys=[predicted_penalty_winner_team_id])
    __table_args__ = (
        db.UniqueConstraint("pool_id", "user_id", "match_id", name="uq_prediction_per_match"),
        db.CheckConstraint("predicted_home_score >= 0", name="ck_prediction_home_score_positive"),
        db.CheckConstraint("predicted_away_score >= 0", name="ck_prediction_away_score_positive"),
    )


class ScoreEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    prediction_id = db.Column(
        db.Integer,
        db.ForeignKey("prediction.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    points = db.Column(db.Integer, nullable=False)
    exact_score = db.Column(db.Boolean, nullable=False, default=False)
    outcome_hit = db.Column(db.Boolean, nullable=False, default=False)
    penalty_hit = db.Column(db.Boolean, nullable=False, default=False)
    calculated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    prediction = db.relationship(
        "Prediction",
        backref=db.backref("score_entry", uselist=False, passive_deletes=True),
    )

    __table_args__ = (
        db.CheckConstraint("points >= 0", name="ck_score_entry_points_positive"),
    )


class AwardPrediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(
        db.Integer,
        db.ForeignKey("pool.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False,
        index=True,
    )
    champion_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    runner_up_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    third_place_team_id = db.Column(db.Integer, db.ForeignKey("team.id"), nullable=True, index=True)
    top_scorer = db.Column(db.String(120), nullable=True)
    best_player = db.Column(db.String(120), nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    pool = db.relationship("Pool", backref=db.backref("award_predictions", passive_deletes=True))
    user = db.relationship("User", backref="award_predictions")
    champion = db.relationship("Team", foreign_keys=[champion_team_id])
    runner_up = db.relationship("Team", foreign_keys=[runner_up_team_id])
    third_place = db.relationship("Team", foreign_keys=[third_place_team_id])
    __table_args__ = (db.UniqueConstraint("pool_id", "user_id", name="uq_award_prediction"),)


# ── Ranking Snapshots ─────────────────────────────────────────────────────────

class RoundSnapshot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(
        db.Integer,
        db.ForeignKey("round.id", ondelete="CASCADE"),
        nullable=False,
    )
    pool_id = db.Column(
        db.Integer,
        db.ForeignKey("pool.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)

    round = db.relationship("Round", backref=db.backref("snapshots", passive_deletes=True))
    pool = db.relationship("Pool", backref=db.backref("snapshots", passive_deletes=True))
    entries = db.relationship(
        "RoundSnapshotEntry",
        backref="snapshot",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    __table_args__ = (db.UniqueConstraint("round_id", "pool_id", name="uq_snapshot_round_pool"),)


class RoundSnapshotEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    snapshot_id = db.Column(
        db.Integer,
        db.ForeignKey("round_snapshot.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False,
        index=True,
    )
    display_name = db.Column(db.String(120), nullable=False)
    position = db.Column(db.Integer, nullable=False)
    points = db.Column(db.Integer, nullable=False)
    exact_scores = db.Column(db.Integer, nullable=False, default=0)
    outcome_hits = db.Column(db.Integer, nullable=False, default=0)
    knockout_points = db.Column(db.Integer, nullable=False, default=0)
    award_points = db.Column(db.Integer, nullable=False, default=0)

    user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("snapshot_id", "user_id", name="uq_snapshot_entry_user"),
        db.CheckConstraint("position >= 1", name="ck_snapshot_entry_position_positive"),
        db.CheckConstraint("points >= 0", name="ck_snapshot_entry_points_positive"),
    )
