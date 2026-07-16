from __future__ import annotations

from app.award_matching import names_match, normalize_name


# ---------------------------------------------------------------------------
# normalize_name
# ---------------------------------------------------------------------------

def test_normalize_strips_whitespace():
    assert normalize_name("  Mbappe  ") == "mbappe"


def test_normalize_lowercases():
    assert normalize_name("MBAPPE") == "mbappe"


def test_normalize_removes_accents():
    assert normalize_name("Mbappé") == "mbappe"
    assert normalize_name("Vinicius Júnior") == "vinicius junior"
    assert normalize_name("Müller") == "muller"


def test_normalize_removes_special_chars():
    assert normalize_name("Neymar Jr.") == "neymar jr"
    assert normalize_name("O'Brien") == "obrien"


def test_normalize_empty_string():
    assert normalize_name("") == ""


# ---------------------------------------------------------------------------
# names_match — exact / case / accent variants
# ---------------------------------------------------------------------------

def test_exact_match():
    assert names_match("Kylian Mbappe", "Kylian Mbappe") is True


def test_case_insensitive():
    assert names_match("kylian mbappe", "Kylian Mbappe") is True


def test_accent_insensitive():
    assert names_match("Mbappe", "Mbappé") is True
    assert names_match("Mbappé", "Mbappe") is True


# ---------------------------------------------------------------------------
# names_match — last name only (partial match)
# ---------------------------------------------------------------------------

def test_last_name_only_matches_full_name():
    assert names_match("Mbappe", "Kylian Mbappe") is True


def test_last_name_only_haaland():
    assert names_match("Haaland", "Erling Haaland") is True


def test_last_name_only_ronaldo():
    assert names_match("Ronaldo", "Cristiano Ronaldo") is True


def test_last_name_only_vinicius():
    assert names_match("Vinicius", "Vinicius Junior") is True


# ---------------------------------------------------------------------------
# names_match — single-letter typos
# ---------------------------------------------------------------------------

def test_single_typo_mbape():
    """One missing letter (Mbape vs Mbappe) should still match."""
    assert names_match("Mbape", "Kylian Mbappe") is True


def test_single_typo_in_last_name():
    assert names_match("Haland", "Erling Haaland") is True


# ---------------------------------------------------------------------------
# names_match — word order
# ---------------------------------------------------------------------------

def test_reversed_word_order():
    assert names_match("Junior Vinicius", "Vinicius Junior") is True


def test_reversed_full_name():
    assert names_match("Mbappe Kylian", "Kylian Mbappe") is True


# ---------------------------------------------------------------------------
# names_match — clearly wrong names should NOT match
# ---------------------------------------------------------------------------

def test_completely_different_name():
    assert names_match("Messi", "Kylian Mbappe") is False


def test_empty_guess_does_not_match():
    assert names_match("", "Kylian Mbappe") is False


def test_empty_official_does_not_match():
    assert names_match("Mbappe", "") is False


def test_both_empty_does_not_match():
    assert names_match("", "") is False


def test_unrelated_short_name():
    assert names_match("Ali", "Cristiano Ronaldo") is False


# ---------------------------------------------------------------------------
# names_match — multiple top scorers scenario
# ---------------------------------------------------------------------------

def test_any_match_in_list():
    """Simulates how scoring iterates over tournament.top_scorers."""
    top_scorers = ["Kylian Mbappe", "Erling Haaland"]
    assert any(names_match("Mbappe", official) for official in top_scorers) is True
    assert any(names_match("Haaland", official) for official in top_scorers) is True
    assert any(names_match("Messi", official) for official in top_scorers) is False


def test_single_item_list():
    top_scorers = ["Cristiano Ronaldo"]
    assert any(names_match("Ronaldo", official) for official in top_scorers) is True
    assert any(names_match("Messi", official) for official in top_scorers) is False
