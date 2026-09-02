"""Unit tests for outcome-fill volume parsing (no network / DB)."""

from rewards import is_outcome_fill_coin, sum_outcome_fills, MAX_SYNC_NOTIONAL_USD


def test_outcome_coins():
    assert is_outcome_fill_coin("#12420")
    assert is_outcome_fill_coin("+12421")
    assert is_outcome_fill_coin("#10")
    assert not is_outcome_fill_coin("BTC")
    assert not is_outcome_fill_coin("xyz:TSLA")
    assert not is_outcome_fill_coin("PURR/USDC")
    assert not is_outcome_fill_coin("#12a")
    assert not is_outcome_fill_coin("#")
    assert not is_outcome_fill_coin("")
    assert not is_outcome_fill_coin(None)


def test_sums_outcome_only_and_advances_cursor():
    fills = [
        {"coin": "BTC", "px": "100000", "sz": "2", "time": 100},
        {"coin": "#12420", "px": "0.50", "sz": "20", "time": 90},
        {"coin": "+12421", "px": "0.25", "sz": "8", "time": 80},
    ]
    vol, latest = sum_outcome_fills(fills)
    assert abs(vol - (0.50 * 20 + 0.25 * 8)) < 1e-9
    assert latest == 100  # perp fill still moves the cursor


def test_rejects_bad_px_and_huge_fills():
    fills = [
        {"coin": "#1", "px": "1.5", "sz": "10", "time": 1},
        {"coin": "#1", "px": "-0.1", "sz": "10", "time": 2},
        {"coin": "#1", "px": "0.5", "sz": "10000000", "time": 3},
        {"coin": "#1", "px": "0.40", "sz": "10", "time": 4},
    ]
    vol, latest = sum_outcome_fills(fills)
    assert abs(vol - 4.0) < 1e-9
    assert latest == 4


def test_empty_and_malformed():
    assert sum_outcome_fills(None) == (0.0, 0)
    assert sum_outcome_fills("nope") == (0.0, 0)
    vol, latest = sum_outcome_fills([{"coin": "#1", "px": "x", "sz": "1", "time": 5}])
    assert vol == 0.0
    assert latest == 5


if __name__ == "__main__":
    test_outcome_coins()
    test_sums_outcome_only_and_advances_cursor()
    test_rejects_bad_px_and_huge_fills()
    test_empty_and_malformed()
    print("ok", MAX_SYNC_NOTIONAL_USD)
