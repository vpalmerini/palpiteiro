from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz as _fuzz


def normalize_name(s: str) -> str:
    """Lowercase, strip accents and non-alphanumeric characters from a player name."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def names_match(guess: str, official: str, threshold: int = 80) -> bool:
    """Return True when *guess* is similar enough to *official* to be considered correct.

    Uses two rapidfuzz metrics combined with OR so that both abbreviations
    (substring match via partial_ratio) and word-order differences
    (token_set_ratio) are handled:

    - partial_ratio: "Mbappe" vs "Kylian Mbappe" → 100
    - token_set_ratio: "Junior Vinicius" vs "Vinicius Junior" → 100

    The threshold of 80 allows single-letter typos ("Mbape" → 80) while
    rejecting clearly wrong names.
    """
    g, o = normalize_name(guess), normalize_name(official)
    if not g or not o:
        return False
    return _fuzz.partial_ratio(g, o) >= threshold or _fuzz.token_set_ratio(g, o) >= threshold
