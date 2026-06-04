from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from sqlalchemy import Index

from .extensions import db
from .model_mixins import ACTIVE_ONLY, TimestampSoftDeleteMixin, active_unique_index, utc_now

UUID = db.String(36)


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

class User(TimestampSoftDeleteMixin, db.Model):
    """Authenticated account."""
    __tablename__ = "users"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    google_id = db.Column(db.String(128), nullable=False, index=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    picture_url = db.Column(db.String(512), nullable=True)
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        active_unique_index("uq_user_google_id_active", "google_id"),
        active_unique_index("uq_user_email_active", "email"),
    )


# ── Tournament / Teams ────────────────────────────────────────────────────────

class Tournament(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "tournaments"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    name = db.Column(db.String(160), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(24), nullable=False, default=TournamentStatus.ONGOING.value)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=True)
    champion_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    runner_up_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    third_place_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    top_scorer = db.Column(db.String(120), nullable=True)
    best_player = db.Column(db.String(120), nullable=True)

    champion = db.relationship("Team", foreign_keys=[champion_team_id])
    runner_up = db.relationship("Team", foreign_keys=[runner_up_team_id])
    third_place = db.relationship("Team", foreign_keys=[third_place_team_id])

    __table_args__ = (
        active_unique_index("uq_tournament_name_year_active", "name", "year"),
    )


class Team(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "teams"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    name = db.Column(db.String(120), nullable=False)
    short_name = db.Column(db.String(12), nullable=True)
    team_type = db.Column(db.String(16), nullable=False, default=TeamType.NATIONAL.value)
    flag_code = db.Column(db.String(2), nullable=True)
    logo_url = db.Column(db.String(500), nullable=True)

    __table_args__ = (
        Index("ix_teams_name_active", "name", postgresql_where=ACTIVE_ONLY, sqlite_where=ACTIVE_ONLY),
    )


class TournamentGroup(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "tournament_groups"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    stage_id = db.Column(
        UUID,
        db.ForeignKey("stages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(40), nullable=False)

    stage = db.relationship("Stage", backref=db.backref("groups", passive_deletes=True))
    __table_args__ = (active_unique_index("uq_group_name_active", "stage_id", "name"),)


class TournamentTeam(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "tournament_teams"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    tournament_id = db.Column(UUID, db.ForeignKey("tournaments.id"), nullable=False)
    team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=False, index=True)
    group_id = db.Column(
        UUID,
        db.ForeignKey("tournament_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    tournament = db.relationship("Tournament", backref="tournament_teams")
    team = db.relationship("Team", backref="tournament_teams")
    group = db.relationship("TournamentGroup", backref="team_assignments")
    __table_args__ = (active_unique_index("uq_tournament_team_active", "tournament_id", "team_id"),)


# ── Stages / Rounds / Matches ─────────────────────────────────────────────────

class Stage(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "stages"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    tournament_id = db.Column(
        UUID,
        db.ForeignKey("tournaments.id", ondelete="CASCADE"),
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
        active_unique_index("uq_stage_order_active", "tournament_id", "order"),
        active_unique_index("uq_stage_name_active", "tournament_id", "name"),
    )


class Round(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "rounds"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    stage_id = db.Column(
        UUID,
        db.ForeignKey("stages.id", ondelete="CASCADE"),
        nullable=False,
    )
    number = db.Column(db.Integer, nullable=False)

    stage = db.relationship("Stage", backref=db.backref("rounds", passive_deletes=True))
    __table_args__ = (active_unique_index("uq_round_number_active", "stage_id", "number"),)


class Match(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "matches"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    tournament_id = db.Column(
        UUID,
        db.ForeignKey("tournaments.id"),
        nullable=False,
        index=True,
    )
    round_id = db.Column(
        UUID,
        db.ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    home_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    away_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    venue = db.Column(db.String(120), nullable=True)
    status = db.Column(db.String(24), nullable=False, default=MatchStatus.SCHEDULED.value, index=True)
    home_score = db.Column(db.Integer, nullable=True)
    away_score = db.Column(db.Integer, nullable=True)
    went_to_penalties = db.Column(db.Boolean, nullable=False, default=False)
    penalty_winner_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)

    tournament = db.relationship("Tournament", backref="matches")
    round = db.relationship("Round", backref=db.backref("matches", passive_deletes=True))
    home_team = db.relationship("Team", foreign_keys=[home_team_id])
    away_team = db.relationship("Team", foreign_keys=[away_team_id])
    penalty_winner = db.relationship("Team", foreign_keys=[penalty_winner_team_id])

    @property
    def stage(self) -> "Stage":
        return self.round.stage

    __table_args__ = (
        Index(
            "ix_matches_tournament_starts_at_active",
            "tournament_id",
            "starts_at",
            postgresql_where=ACTIVE_ONLY,
            sqlite_where=ACTIVE_ONLY,
        ),
        Index(
            "ix_matches_tournament_status_active",
            "tournament_id",
            "status",
            postgresql_where=ACTIVE_ONLY,
            sqlite_where=ACTIVE_ONLY,
        ),
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

class Pool(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "pools"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    slug = db.Column(db.String(64), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    creator_name = db.Column(db.String(120), nullable=False)
    creator_user_id = db.Column(
        UUID,
        db.ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    tournament_id = db.Column(
        UUID,
        db.ForeignKey("tournaments.id"),
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

    tournament = db.relationship("Tournament", backref="pools")
    creator = db.relationship("User", foreign_keys=[creator_user_id], backref="created_pools")

    __table_args__ = (active_unique_index("uq_pool_slug_active", "slug"),)


class PoolPrize(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "pool_prizes"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    pool_id = db.Column(
        UUID,
        db.ForeignKey("pools.id", ondelete="CASCADE"),
        nullable=False,
    )
    position = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255), nullable=False)

    pool = db.relationship("Pool", backref=db.backref("prizes", passive_deletes=True))
    __table_args__ = (
        active_unique_index("uq_pool_prize_position_active", "pool_id", "position"),
        db.CheckConstraint("position BETWEEN 1 AND 3", name="ck_pool_prize_position_range"),
    )


class PoolParticipant(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "pool_participants"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    pool_id = db.Column(
        UUID,
        db.ForeignKey("pools.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        UUID,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    display_name = db.Column(db.String(120), nullable=False)
    removed_by_creator = db.Column(db.Boolean, nullable=False, default=False)

    pool = db.relationship("Pool", backref=db.backref("memberships", passive_deletes=True))
    user = db.relationship("User", backref="memberships")
    __table_args__ = (
        active_unique_index("uq_pool_user_active", "pool_id", "user_id"),
    )


# ── Predictions & Scoring ─────────────────────────────────────────────────────

class Prediction(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "predictions"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    pool_id = db.Column(
        UUID,
        db.ForeignKey("pools.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        UUID,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    match_id = db.Column(
        UUID,
        db.ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    predicted_home_score = db.Column(db.Integer, nullable=False)
    predicted_away_score = db.Column(db.Integer, nullable=False)
    predicts_penalties = db.Column(db.Boolean, nullable=False, default=False)
    predicted_penalty_winner_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True)

    pool = db.relationship("Pool", backref=db.backref("predictions", passive_deletes=True))
    user = db.relationship("User", backref="predictions")
    match = db.relationship("Match", backref=db.backref("predictions", passive_deletes=True))
    predicted_penalty_winner = db.relationship("Team", foreign_keys=[predicted_penalty_winner_team_id])
    __table_args__ = (
        Index(
            "ix_predictions_pool_match_active",
            "pool_id",
            "match_id",
            postgresql_where=ACTIVE_ONLY,
            sqlite_where=ACTIVE_ONLY,
        ),
        active_unique_index("uq_prediction_per_match_active", "pool_id", "user_id", "match_id"),
        db.CheckConstraint("predicted_home_score >= 0", name="ck_prediction_home_score_positive"),
        db.CheckConstraint("predicted_away_score >= 0", name="ck_prediction_away_score_positive"),
    )


class ScoreEntry(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "score_entries"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    prediction_id = db.Column(
        UUID,
        db.ForeignKey("predictions.id", ondelete="CASCADE"),
        nullable=False,
    )
    points = db.Column(db.Integer, nullable=False)
    exact_score = db.Column(db.Boolean, nullable=False, default=False)
    outcome_hit = db.Column(db.Boolean, nullable=False, default=False)
    penalty_hit = db.Column(db.Boolean, nullable=False, default=False)

    prediction = db.relationship(
        "Prediction",
        backref=db.backref("score_entry", uselist=False, passive_deletes=True),
    )

    __table_args__ = (
        active_unique_index("uq_score_entry_prediction_active", "prediction_id"),
        db.CheckConstraint("points >= 0", name="ck_score_entry_points_positive"),
    )


class AwardPrediction(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "award_predictions"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    pool_id = db.Column(
        UUID,
        db.ForeignKey("pools.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        UUID,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    champion_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    runner_up_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    third_place_team_id = db.Column(UUID, db.ForeignKey("teams.id"), nullable=True, index=True)
    top_scorer = db.Column(db.String(120), nullable=True)
    best_player = db.Column(db.String(120), nullable=True)

    pool = db.relationship("Pool", backref=db.backref("award_predictions", passive_deletes=True))
    user = db.relationship("User", backref="award_predictions")
    champion = db.relationship("Team", foreign_keys=[champion_team_id])
    runner_up = db.relationship("Team", foreign_keys=[runner_up_team_id])
    third_place = db.relationship("Team", foreign_keys=[third_place_team_id])
    __table_args__ = (active_unique_index("uq_award_prediction_active", "pool_id", "user_id"),)


# ── Ranking Snapshots ─────────────────────────────────────────────────────────

class RoundSnapshot(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "round_snapshots"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    round_id = db.Column(
        UUID,
        db.ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
    )
    pool_id = db.Column(
        UUID,
        db.ForeignKey("pools.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    round = db.relationship("Round", backref=db.backref("snapshots", passive_deletes=True))
    pool = db.relationship("Pool", backref=db.backref("snapshots", passive_deletes=True))
    entries = db.relationship(
        "RoundSnapshotEntry",
        backref="snapshot",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    __table_args__ = (active_unique_index("uq_snapshot_round_pool_active", "round_id", "pool_id"),)


class RoundSnapshotEntry(TimestampSoftDeleteMixin, db.Model):
    __tablename__ = "round_snapshot_entries"

    id = db.Column(UUID, primary_key=True, default=_uuid4_str)
    snapshot_id = db.Column(
        UUID,
        db.ForeignKey("round_snapshots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        UUID,
        db.ForeignKey("users.id"),
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
        active_unique_index("uq_snapshot_entry_user_active", "snapshot_id", "user_id"),
        db.CheckConstraint("position >= 1", name="ck_snapshot_entry_position_positive"),
        db.CheckConstraint("points >= 0", name="ck_snapshot_entry_points_positive"),
    )
