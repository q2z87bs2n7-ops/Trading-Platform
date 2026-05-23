"""Offline checks for the screen_assets *pure* builders — the security boundary
(`_screen_filters`) and sort whitelist (`_resolve_sort`). No DB: pg8000 is
shimmed so the module imports without the driver. Run from anywhere:

    python backend/tests/test_screen_filters.py

The live SQL-execution paths can't be reached from the sandbox (Postgres :5432
is firewalled); exercise those with backend/scripts/uat_screen_assets.py where
DATABASE_URL is reachable.
"""

import os
import sys
import types
import unittest

# Shim pg8000 so `from app import db` works without the driver; the builders
# under test never touch it.
_pg = types.ModuleType("pg8000")
_pg.dbapi = types.ModuleType("pg8000.dbapi")
sys.modules.setdefault("pg8000", _pg)
sys.modules.setdefault("pg8000.dbapi", _pg.dbapi)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import db  # noqa: E402


def f(**kw):
    return db._screen_filters(
        kw.get("asset_class", "us_equity"), kw.get("sector"), kw.get("industry"),
        kw.get("asset_type", "stock"), kw.get("category"),
        kw.get("market_cap_min"), kw.get("market_cap_max"),
        kw.get("beta_min"), kw.get("beta_max"), kw.get("exchange"),
        kw.get("ipo_after"), kw.get("ipo_before"),
    )


class ScreenFilters(unittest.TestCase):
    def test_param_count_matches_placeholders(self):
        # Structural invariant across every branch: one %s per bound param.
        for kw in (
            {},
            dict(sector="Healthcare", market_cap_min=1e10, beta_min=1.2),
            dict(asset_type="etf", exchange="nyse", ipo_after="2015-01-01"),
            dict(asset_class="crypto", category="defi", market_cap_min=1e9),
            dict(asset_class="crypto", sector="Tech", industry="x"),  # ignored fields
        ):
            where, params, *_ = f(**kw)
            self.assertEqual(where.count("%s"), len(params), kw)

    def test_stock_defaults_exclude_etf_and_fund(self):
        where, _, applied, _, ac = f()
        self.assertEqual(ac, "us_equity")
        self.assertEqual(applied["asset_type"], "stock")
        self.assertIn("is_etf IS NOT TRUE AND is_fund IS NOT TRUE", where)

    def test_market_cap_bound_as_int_not_float(self):
        _, params, applied, *_ = f(market_cap_min=1e10)
        self.assertIn(10_000_000_000, params)
        self.assertIsInstance(applied["market_cap_min"], int)  # BIGINT column

    def test_sector_validated(self):
        _, _, applied, ignored, _ = f(sector="Healthcare")
        self.assertEqual(applied.get("sector"), "Healthcare")
        _, _, applied2, ignored2, _ = f(sector="Nonsense")
        self.assertNotIn("sector", applied2)
        self.assertIn("sector=Nonsense", ignored2)

    def test_exchange_uppercased_and_validated(self):
        _, _, applied, _, _ = f(exchange="nasdaq")
        self.assertEqual(applied.get("exchange"), "NASDAQ")
        _, _, _, ignored, _ = f(exchange="LSE")
        self.assertIn("exchange=LSE", ignored)

    def test_beta_clamped(self):
        _, _, applied, *_ = f(beta_min=-999, beta_max=999)
        self.assertEqual(applied["beta_min"], -100)
        self.assertEqual(applied["beta_max"], 100)

    def test_ipo_floor_1980(self):
        _, _, applied, *_ = f(ipo_after="1900-01-01")
        self.assertEqual(applied["ipo_after"], "1980-01-01")

    def test_crypto_category_valid_and_invalid(self):
        where, params, applied, _, ac = f(asset_class="crypto", category="defi")
        self.assertEqual(ac, "crypto")
        self.assertIn("categories && %s::text[]", where)
        self.assertIn(db.CRYPTO_CATEGORY_MAP["defi"], params)
        _, _, applied2, ignored2, _ = f(asset_class="crypto", category="bogus")
        self.assertNotIn("category", applied2)
        self.assertIn("category=bogus", ignored2)

    def test_crypto_ignores_stock_only_fields(self):
        _, _, _, ignored, _ = f(asset_class="crypto", sector="Healthcare",
                                beta_min=1.0, exchange="NYSE")
        self.assertIn("sector (stocks-only)", ignored)
        self.assertIn("beta_min (stocks-only)", ignored)
        self.assertIn("exchange (stocks-only)", ignored)


class ResolveSort(unittest.TestCase):
    def test_default(self):
        order, key, note = db._resolve_sort(None, is_crypto=False)
        self.assertEqual(key, "market_cap_desc")
        self.assertIn("market_cap DESC", order)
        self.assertIsNone(note)

    def test_known_keys(self):
        self.assertEqual(db._resolve_sort("market_cap_asc", False)[1], "market_cap_asc")
        self.assertEqual(db._resolve_sort("beta_desc", False)[1], "beta_desc")
        self.assertEqual(db._resolve_sort("ipo_newest", False)[1], "ipo_newest")

    def test_unknown_falls_back_with_note(self):
        order, key, note = db._resolve_sort("price_desc", is_crypto=False)
        self.assertEqual(key, "market_cap_desc")
        self.assertEqual(note, "sort_by=price_desc")

    def test_crypto_rejects_stock_only_sort(self):
        order, key, note = db._resolve_sort("beta_desc", is_crypto=True)
        self.assertEqual(key, "market_cap_desc")
        self.assertEqual(note, "sort_by=beta_desc (stocks-only)")

    def test_crypto_allows_market_cap_sort(self):
        order, key, note = db._resolve_sort("market_cap_asc", is_crypto=True)
        self.assertEqual(key, "market_cap_asc")
        self.assertIsNone(note)

    def test_order_sql_from_fixed_whitelist(self):
        # Every resolved fragment must be a value we authored (injection guard).
        for k in list(db._SORT_MAP) + ["bogus", None]:
            order, _, _ = db._resolve_sort(k, is_crypto=False)
            self.assertIn(order, db._SORT_MAP.values())


if __name__ == "__main__":
    unittest.main(verbosity=2)
