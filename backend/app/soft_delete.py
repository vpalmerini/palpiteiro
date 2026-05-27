"""Soft-delete helpers with cascade rules."""

from __future__ import annotations

from .extensions import db
from .model_mixins import utc_now
from .models import (
    AwardPrediction,
    Match,
    PoolParticipant,
    PoolPrize,
    Prediction,
    Round,
    RoundSnapshot,
    RoundSnapshotEntry,
    ScoreEntry,
    Stage,
    TournamentGroup,
    TournamentTeam,
)


def soft_delete_score_entry(entry: ScoreEntry) -> None:
    entry.soft_delete()


def soft_delete_prediction(prediction: Prediction) -> None:
    if prediction.score_entry and not prediction.score_entry.is_deleted:
        soft_delete_score_entry(prediction.score_entry)
    prediction.soft_delete()


def soft_delete_match(match: Match) -> None:
    for prediction in Prediction.active().filter_by(match_id=match.id).all():
        soft_delete_prediction(prediction)
    match.soft_delete()


def soft_delete_round(round_: Round) -> None:
    for match in Match.active().filter_by(round_id=round_.id).all():
        soft_delete_match(match)
    for snapshot in RoundSnapshot.active().filter_by(round_id=round_.id).all():
        soft_delete_snapshot(snapshot)
    round_.soft_delete()


def soft_delete_snapshot(snapshot: RoundSnapshot) -> None:
    for entry in RoundSnapshotEntry.active().filter_by(snapshot_id=snapshot.id).all():
        entry.soft_delete()
    snapshot.soft_delete()


def soft_delete_group(group: TournamentGroup) -> None:
    TournamentTeam.active().filter_by(group_id=group.id).update({"group_id": None})
    group.soft_delete()


def soft_delete_stage(stage: Stage) -> None:
    for round_ in Round.active().filter_by(stage_id=stage.id).all():
        soft_delete_round(round_)
    for group in TournamentGroup.active().filter_by(stage_id=stage.id).all():
        soft_delete_group(group)
    stage.soft_delete()


def soft_delete_tournament_team(entry: TournamentTeam) -> None:
    entry.soft_delete()


def soft_delete_pool_prize(prize: PoolPrize) -> None:
    prize.soft_delete()


def soft_delete_pool_participant(participant: PoolParticipant) -> None:
    for prediction in Prediction.active().filter_by(
        pool_id=participant.pool_id,
        user_id=participant.user_id,
    ).all():
        soft_delete_prediction(prediction)
    award = AwardPrediction.active().filter_by(
        pool_id=participant.pool_id,
        user_id=participant.user_id,
    ).first()
    if award:
        award.soft_delete()
    participant.soft_delete()


def replace_snapshot_entries(snapshot: RoundSnapshot, entries: list[dict]) -> None:
    """Soft-delete previous snapshot rows and insert fresh active ones."""
    for entry in RoundSnapshotEntry.active().filter_by(snapshot_id=snapshot.id).all():
        entry.soft_delete()
    snapshot.updated_at = utc_now()
    for entry in entries:
        db.session.add(
            RoundSnapshotEntry(
                snapshot_id=snapshot.id,
                user_id=entry["userId"],
                display_name=entry["displayName"],
                position=entry["position"],
                points=entry["points"],
                exact_scores=entry["exactScores"],
                outcome_hits=entry["outcomeHits"],
                knockout_points=entry["knockoutPoints"],
                award_points=entry["awardPoints"],
            )
        )
