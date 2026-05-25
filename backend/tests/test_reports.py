"""Offline checks for the Ask-anything CSV report builders in `app.ai.reports`.

The module imports the whole `app.alpaca` package at load (which needs the
alpaca-py SDK), so we stub `app.alpaca` + `app.alpaca.pnl` before importing —
the pure CSV/scope logic under test never touches the SDK or the network. The
`build_report` tests inject fixture data through the same stub. Run from
anywhere:

    python backend/tests/test_reports.py

The live data paths (real positions/orders/activities) need Alpaca creds and
aren't reachable from the sandbox; this only exercises the deterministic core.
"""

import csv
import importlib
import io
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Stub app.alpaca (+ .pnl) so `app.ai.reports` imports without alpaca-py. The
# data-fetching functions default to empty; build_report tests override them.
_app = importlib.import_module("app")  # empty __init__, safe
_alp = types.ModuleType("app.alpaca")
_alp.is_crypto = lambda s: "/" in s
_alp.get_positions = lambda *a, **k: []
_alp.get_orders = lambda *a, **k: []
_alp.get_activities = lambda *a, **k: []
_pnl = types.ModuleType("app.alpaca.pnl")
_pnl.get_pnl_history = lambda *a, **k: {}
_alp.pnl = _pnl
_app.alpaca = _alp
sys.modules["app.alpaca"] = _alp
sys.modules["app.alpaca.pnl"] = _pnl

from app.ai import reports  # noqa: E402


def parse(text):
    """CSV text -> list of rows (avoids brittle \\r\\n string asserts)."""
    return list(csv.reader(io.StringIO(text)))


class ToCsv(unittest.TestCase):
    def test_header_then_rows(self):
        out = parse(reports._to_csv(["a", "b"], [[1, 2], [3, 4]]))
        self.assertEqual(out, [["a", "b"], ["1", "2"], ["3", "4"]])

    def test_empty_rows_keeps_header(self):
        self.assertEqual(parse(reports._to_csv(["x", "y"], [])), [["x", "y"]])

    def test_commas_and_quotes_are_escaped(self):
        # A value containing the delimiter must round-trip as one field.
        out = parse(reports._to_csv(["note"], [["a,b"], ['has "quote"']]))
        self.assertEqual(out, [["note"], ["a,b"], ['has "quote"']])


class RowsToCsv(unittest.TestCase):
    def test_infers_columns_first_seen_union(self):
        out = parse(reports.rows_to_csv([{"a": 1, "b": 2}, {"b": 3, "c": 4}]))
        self.assertEqual(out[0], ["a", "b", "c"])
        self.assertEqual(out[1], ["1", "2", ""])  # missing c -> blank
        self.assertEqual(out[2], ["", "3", "4"])  # missing a -> blank

    def test_explicit_columns_subset_and_order(self):
        out = parse(reports.rows_to_csv([{"a": 1, "b": 2, "c": 3}], ["c", "a"]))
        self.assertEqual(out, [["c", "a"], ["3", "1"]])  # b dropped, order kept

    def test_non_dict_rows_skipped(self):
        out = parse(reports.rows_to_csv([{"a": 1}, "junk", 5, None, {"a": 2}]))
        self.assertEqual(out, [["a"], ["1"], ["2"]])

    def test_empty_with_columns_writes_header_only(self):
        self.assertEqual(parse(reports.rows_to_csv([], ["x", "y"])), [["x", "y"]])


class ScopeHelpers(unittest.TestCase):
    def test_is_crypto_by_slash_or_asset_class(self):
        self.assertTrue(reports._is_crypto("BTC/USD"))
        self.assertTrue(reports._is_crypto("AAPL", "crypto"))  # asset_class wins
        self.assertFalse(reports._is_crypto("AAPL"))
        self.assertFalse(reports._is_crypto("AAPL", "us_equity"))

    def test_in_scope_all_passes_everything(self):
        self.assertTrue(reports._in_scope("AAPL", "us_equity", "all"))
        self.assertTrue(reports._in_scope("BTC/USD", "crypto", "all"))

    def test_in_scope_stocks_excludes_crypto(self):
        self.assertTrue(reports._in_scope("AAPL", "us_equity", "stocks"))
        self.assertFalse(reports._in_scope("BTC/USD", "crypto", "stocks"))

    def test_in_scope_crypto_excludes_stocks(self):
        self.assertTrue(reports._in_scope("BTC/USD", "crypto", "crypto"))
        self.assertFalse(reports._in_scope("AAPL", "us_equity", "crypto"))

    def test_suffix(self):
        self.assertEqual(reports._suffix("all"), "account")
        self.assertEqual(reports._suffix("stocks"), "stocks")
        self.assertEqual(reports._suffix("crypto"), "crypto")


POSITIONS = [
    {
        "symbol": "AAPL", "asset_class": "us_equity", "qty": "10",
        "avg_entry_price": "100", "current_price": "110", "market_value": "1100",
        "cost_basis": "1000", "unrealized_pl": "100", "unrealized_plpc": "0.1",
    },
    {
        "symbol": "BTC/USD", "asset_class": "crypto", "qty": "1",
        "avg_entry_price": "50000", "current_price": "60000",
        "market_value": "60000", "cost_basis": "50000",
        "unrealized_pl": "10000", "unrealized_plpc": "0.2",
    },
]


class BuildReport(unittest.TestCase):
    def tearDown(self):
        _alp.get_positions = lambda *a, **k: []
        _alp.get_orders = lambda *a, **k: []
        _alp.get_activities = lambda *a, **k: []

    def test_unknown_kind_raises(self):
        with self.assertRaises(ValueError):
            reports.build_report("bogus", "all")

    def test_positions_all_returns_every_row(self):
        _alp.get_positions = lambda *a, **k: POSITIONS
        name, text, count = reports.build_report("positions", "all")
        rows = parse(text)
        self.assertEqual(rows[0][0], "symbol")  # header present
        self.assertEqual(len(rows[0]), 9)       # the 9 declared columns
        self.assertEqual(count, 2)
        self.assertEqual(len(rows), 3)          # header + 2 data rows
        self.assertTrue(name.startswith("positions-account-"))
        self.assertTrue(name.endswith(".csv"))

    def test_positions_scope_filters_to_silo(self):
        _alp.get_positions = lambda *a, **k: POSITIONS
        _, text, count = reports.build_report("positions", "stocks")
        rows = parse(text)
        self.assertEqual(count, 1)
        self.assertEqual([r[0] for r in rows[1:]], ["AAPL"])

        name, text, count = reports.build_report("positions", "crypto")
        self.assertEqual(count, 1)
        self.assertEqual([r[0] for r in parse(text)[1:]], ["BTC/USD"])
        self.assertTrue(name.startswith("positions-crypto-"))

    def test_invalid_scope_falls_back_to_all(self):
        _alp.get_positions = lambda *a, **k: POSITIONS
        name, _, count = reports.build_report("positions", "nonsense")
        self.assertEqual(count, 2)               # treated as "all"
        self.assertTrue(name.startswith("positions-account-"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
