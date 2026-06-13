"""HTTP client for football-data.org v4 API."""
from __future__ import annotations

import time

import requests
from flask import current_app


def _get(path: str, params: dict | None = None) -> dict:
    """Make an authenticated GET request; retries once on HTTP 429."""
    base_url = current_app.config["FOOTBALL_DATA_BASE_URL"]
    api_key = current_app.config["FOOTBALL_DATA_API_KEY"]
    url = f"{base_url}{path}"
    headers = {"X-Auth-Token": api_key}

    response = requests.get(url, headers=headers, params=params, timeout=15)

    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", "60"))
        current_app.logger.warning(
            "football-data.org rate limit hit; sleeping %ds", retry_after
        )
        time.sleep(retry_after)
        response = requests.get(url, headers=headers, params=params, timeout=15)

    response.raise_for_status()
    return response.json()


def list_competition_teams(code: str) -> list[dict]:
    """Return all teams for the given competition code."""
    data = _get(f"/competitions/{code}/teams")
    return data.get("teams", [])


def list_matches_for_dates(code: str, date_from: str, date_to: str) -> list[dict]:
    """Return all matches for the competition in the given date range (YYYY-MM-DD)."""
    data = _get(
        f"/competitions/{code}/matches",
        params={"dateFrom": date_from, "dateTo": date_to},
    )
    return data.get("matches", [])


def list_all_matches(code: str) -> list[dict]:
    """Return all matches for the competition (full season)."""
    data = _get(f"/competitions/{code}/matches")
    return data.get("matches", [])
