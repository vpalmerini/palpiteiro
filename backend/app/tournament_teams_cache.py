"""In-memory cache for tournament team lists (changes rarely)."""

from __future__ import annotations

import time
from typing import Any

_CACHE_TTL_SECONDS = 120
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def get_cached_tournament_teams(tournament_id: str) -> list[dict[str, Any]] | None:
    entry = _cache.get(tournament_id)
    if entry is None:
        return None
    expires_at, payload = entry
    if time.monotonic() >= expires_at:
        _cache.pop(tournament_id, None)
        return None
    return payload


def set_cached_tournament_teams(tournament_id: str, payload: list[dict[str, Any]]) -> None:
    _cache[tournament_id] = (time.monotonic() + _CACHE_TTL_SECONDS, payload)


def invalidate_tournament_teams_cache(tournament_id: str | None = None) -> None:
    if tournament_id is None:
        _cache.clear()
        return
    _cache.pop(tournament_id, None)
