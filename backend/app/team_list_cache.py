"""In-memory cache for the teams list (rarely changes, hit on every admin load)."""

from __future__ import annotations

import time
from typing import Any

_CACHE_TTL_SECONDS = 120
_cache: dict[str, Any] = {"expires_at": 0.0, "payload": None}


def get_cached_team_list() -> list[dict[str, Any]] | None:
    if _cache["payload"] is not None and time.monotonic() < _cache["expires_at"]:
        return _cache["payload"]
    return None


def set_cached_team_list(payload: list[dict[str, Any]]) -> None:
    _cache["payload"] = payload
    _cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS


def invalidate_team_list_cache() -> None:
    _cache["payload"] = None
    _cache["expires_at"] = 0.0
