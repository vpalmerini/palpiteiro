"""Automatic match result synchronisation with football-data.org v4.

Exposes two public entry-points:

* ``sync_tournament_results(tournament)``  – candidate-driven hourly sync.
* ``link_external_ids()``                  – one-shot ID population command.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from flask import current_app

from .extensions import db
from .football_data import list_all_matches, list_matches_for_dates
from .models import Match, MatchStatus, Team, Tournament

# ── one-shot team map (short_name → football-data.org team id) ────────────────

SHORT_NAME_TO_EXTERNAL_ID: dict[str, int] = {
    "MEX": 769, "RSA": 774, "KOR": 772, "CZE": 798,
    "CAN": 828, "BIH": 1060, "QAT": 8030, "SUI": 788,
    "BRA": 764, "MAR": 815, "HAI": 836, "SCO": 8873,
    "USA": 771, "PAR": 761, "AUS": 779, "TUR": 803,
    "GER": 759, "CUW": 9460, "CIV": 1935, "ECU": 791,
    "NED": 8601, "JPN": 766, "SWE": 792, "TUN": 802,
    "BEL": 805, "EGY": 825, "IRN": 840, "NZL": 783,
    "ESP": 760, "CPV": 1930, "SAU": 801, "KSA": 801, "URU": 758,
    "FRA": 773, "SEN": 804, "IRQ": 8062, "NOR": 8872,
    "AUT": 816, "JOR": 8049, "ARG": 762, "ALG": 778,
    "POR": 765, "COD": 1934, "UZB": 8070, "COL": 818,
    "ENG": 770, "CRO": 799, "GHA": 763, "PAN": 1836,
}


# ── sync ──────────────────────────────────────────────────────────────────────

@dataclass
class SyncSummary:
    updated: list[str] = field(default_factory=list)
    skipped_not_finished: list[str] = field(default_factory=list)
    skipped_not_mapped: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return (
            f"updated={len(self.updated)} "
            f"skipped_not_finished={len(self.skipped_not_finished)} "
            f"skipped_not_mapped={len(self.skipped_not_mapped)}"
        )


def _parse_utc_date(utc_date_str: str) -> datetime:
    """Parse ISO-8601 UTC string from the API into an aware datetime."""
    return datetime.fromisoformat(utc_date_str.replace("Z", "+00:00"))


def _team_score_values(node: dict | None) -> tuple[int, int] | None:
    """Read home/away goals from a football-data.org score node (v4 uses homeTeam/awayTeam)."""
    if not node:
        return None
    home = node.get("homeTeam", node.get("home"))
    away = node.get("awayTeam", node.get("away"))
    if home is not None and away is not None:
        return home, away
    return None


def _regular_time_score(ext_match: dict) -> tuple[int, int] | None:
    """Extract the pre-penalty score from an external match payload.

    The v4 API populates ``score.regularTime`` when the game went to extra
    time or penalties.  Fall back to ``score.fullTime`` for normal finishes.
    Returns None if the score fields are missing.
    """
    score = ext_match.get("score", {})
    duration = score.get("duration", "REGULAR")

    if duration == "PENALTY_SHOOTOUT":
        for node in (score.get("regularTime"), score.get("halfTime"), score.get("extraTime")):
            values = _team_score_values(node)
            if values is not None:
                return values

    values = _team_score_values(score.get("fullTime"))
    if values is not None:
        return values

    return None


def _penalty_winner_team_id(match: Match, ext_match: dict, home_score: int, away_score: int) -> str | None:
    """Return the internal team id of the penalty-shootout winner, or None."""
    score = ext_match.get("score", {})
    duration = score.get("duration", "REGULAR")
    winner = score.get("winner")

    is_knockout = match.round.stage.is_knockout
    went_to_penalties = duration == "PENALTY_SHOOTOUT" or (
        is_knockout and home_score == away_score and winner in ("HOME_TEAM", "AWAY_TEAM")
    )
    if not went_to_penalties:
        return None

    if winner == "HOME_TEAM":
        return match.home_team_id
    if winner == "AWAY_TEAM":
        return match.away_team_id
    return None


def sync_tournament_results(tournament: Tournament) -> SyncSummary:
    """Candidate-driven sync: only query the API when unfinished matches exist.

    Steps:
    1. Select candidate matches (status != finished, started ≥2h ago, within 24h window).
    2. If no candidates, return early without hitting the API.
    3. Fetch external matches for the date window.
    4. Resolve candidates → external match by external_id (or home/away pair).
    5. Apply scores for FINISHED external matches; recalculate pool scores.
    """
    from .routes import apply_match_result
    from .models import Pool

    summary = SyncSummary()
    now = datetime.now(timezone.utc)
    lookback_start = now - timedelta(hours=24)
    candidate_cutoff = now - timedelta(hours=2)

    candidates: list[Match] = (
        Match.active()
        .filter(
            Match.tournament_id == tournament.id,
            Match.status != MatchStatus.FINISHED.value,
            Match.home_team_id.isnot(None),
            Match.away_team_id.isnot(None),
            Match.starts_at <= candidate_cutoff,
            Match.starts_at >= lookback_start,
        )
        .all()
    )

    if not candidates:
        current_app.logger.info(
            "sync_results: no candidates for tournament %s", tournament.id
        )
        return summary

    code = tournament.external_competition_code
    date_from = lookback_start.strftime("%Y-%m-%d")
    date_to = now.strftime("%Y-%m-%d")

    current_app.logger.info(
        "sync_results: %d candidates, querying %s matches %s..%s",
        len(candidates), code, date_from, date_to,
    )

    ext_matches = list_matches_for_dates(code, date_from, date_to)

    # Index external matches by id and by (home_external_id, away_external_id)
    ext_by_id: dict[int, dict] = {m["id"]: m for m in ext_matches}
    ext_by_pair: dict[tuple[int, int], dict] = {}
    for m in ext_matches:
        home_id = m.get("homeTeam", {}).get("id")
        away_id = m.get("awayTeam", {}).get("id")
        if home_id and away_id:
            ext_by_pair[(home_id, away_id)] = m

    for match in candidates:
        home_ext_id = match.home_team.external_id if match.home_team else None
        away_ext_id = match.away_team.external_id if match.away_team else None

        ext_match: dict | None = None
        if match.external_id:
            ext_match = ext_by_id.get(match.external_id)
        elif home_ext_id and away_ext_id:
            ext_match = ext_by_pair.get((home_ext_id, away_ext_id))
            if ext_match:
                match.external_id = ext_match["id"]

        if ext_match is None:
            summary.skipped_not_mapped.append(str(match.id))
            current_app.logger.warning(
                "sync_results: match %s not mapped to external", match.id
            )
            continue

        if ext_match.get("status") != "FINISHED":
            summary.skipped_not_finished.append(str(match.id))
            continue

        scores = _regular_time_score(ext_match)
        if scores is None:
            current_app.logger.warning(
                "sync_results: could not extract score for match %s (ext %s)",
                match.id, ext_match.get("id"),
            )
            summary.skipped_not_mapped.append(str(match.id))
            continue

        home_score, away_score = scores
        pen_winner_id = _penalty_winner_team_id(match, ext_match, home_score, away_score)

        apply_match_result(match, home_score, away_score, pen_winner_id)
        summary.updated.append(str(match.id))
        current_app.logger.info(
            "sync_results: match %s → %d-%d (penalties: %s)",
            match.id, home_score, away_score, pen_winner_id is not None,
        )

    if summary.updated:
        db.session.commit()

    return summary


# ── one-shot link command ─────────────────────────────────────────────────────

@dataclass
class LinkSummary:
    teams_linked: int = 0
    teams_skipped: int = 0
    matches_linked: int = 0
    matches_unresolved: int = 0

    def __str__(self) -> str:
        return (
            f"teams_linked={self.teams_linked} "
            f"teams_skipped={self.teams_skipped} "
            f"matches_linked={self.matches_linked} "
            f"matches_unresolved={self.matches_unresolved}"
        )


def link_external_ids() -> LinkSummary:
    """Populate Team.external_id and Match.external_id from football-data.org.

    Idempotent: only fills NULL values, never overwrites existing ones.
    """
    summary = LinkSummary()

    # ── 1. Teams ─────────────────────────────────────────────────────────────
    teams: list[Team] = Team.active().all()
    for team in teams:
        if team.external_id is not None:
            summary.teams_skipped += 1
            continue
        ext_id = SHORT_NAME_TO_EXTERNAL_ID.get(team.short_name or "")
        if ext_id:
            team.external_id = ext_id
            summary.teams_linked += 1
        else:
            current_app.logger.warning(
                "link_external_ids: no mapping for team short_name=%r", team.short_name
            )

    # ── 2. Tournament external_competition_code ───────────────────────────────
    tournaments: list[Tournament] = Tournament.active().all()
    for tournament in tournaments:
        if tournament.external_competition_code is None:
            if "Copa do Mundo" in (tournament.name or ""):
                tournament.external_competition_code = "WC"

    db.session.flush()

    # ── 3. Build external_id → internal team lookup ───────────────────────────
    team_by_ext_id: dict[int, Team] = {
        t.external_id: t for t in teams if t.external_id is not None
    }

    # ── 4. Matches (one API call per tournament with a code) ──────────────────
    for tournament in tournaments:
        code = tournament.external_competition_code
        if not code:
            continue

        ext_matches = list_all_matches(code)
        ext_by_pair: dict[tuple[int, int], dict] = {}
        for em in ext_matches:
            h = em.get("homeTeam", {}).get("id")
            a = em.get("awayTeam", {}).get("id")
            if h and a:
                ext_by_pair[(h, a)] = em

        matches: list[Match] = (
            Match.active()
            .filter(
                Match.tournament_id == tournament.id,
                Match.home_team_id.isnot(None),
                Match.away_team_id.isnot(None),
                Match.external_id.is_(None),
            )
            .all()
        )

        for match in matches:
            home_team = team_by_ext_id.get(
                match.home_team.external_id if match.home_team else None  # type: ignore[arg-type]
            )
            away_team = team_by_ext_id.get(
                match.away_team.external_id if match.away_team else None  # type: ignore[arg-type]
            )
            if home_team is None or away_team is None:
                summary.matches_unresolved += 1
                continue

            home_ext = home_team.external_id
            away_ext = away_team.external_id
            if home_ext is None or away_ext is None:
                summary.matches_unresolved += 1
                continue

            ext_match = ext_by_pair.get((home_ext, away_ext))
            if ext_match:
                match.external_id = ext_match["id"]
                summary.matches_linked += 1
            else:
                summary.matches_unresolved += 1
                current_app.logger.warning(
                    "link_external_ids: no external match for %s vs %s",
                    match.home_team.short_name, match.away_team.short_name,
                )

    db.session.commit()
    return summary
