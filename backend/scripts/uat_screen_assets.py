"""Live UAT sweep for db.screen_assets — exercises every execution path against
the real catalogue and checks invariants. The sandbox can't reach Postgres
(:5432 firewalled), so run this where DATABASE_URL resolves (Render shell, or
any host on the DB's network):

    DATABASE_URL='postgres://...' python backend/scripts/uat_screen_assets.py

Exits non-zero if any case fails an invariant. Pure-builder logic is covered
separately and offline by backend/tests/test_screen_filters.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import db  # noqa: E402

# (label, kwargs, expectations). Expectation keys are optional:
#   empty      -> total_matches must be 0 and a 'suggestion' returned
#   suggest    -> industry_suggestions must be present & non-empty
#   bucket     -> bucket_counts_by_sector must be present
#   nonempty   -> at least one result row (default True unless empty=True)
CASES = [
    ("crypto: layer1, default sort",      dict(asset_class="crypto", category="layer1"), {}),
    ("crypto: defi, market_cap_asc",      dict(asset_class="crypto", category="defi", sort_by="market_cap_asc"), {}),
    ("crypto: meme",                      dict(asset_class="crypto", category="meme"), {}),
    ("crypto: invalid category ignored",  dict(asset_class="crypto", category="bogus"), {}),
    ("stock: large-cap healthcare",       dict(sector="Healthcare", market_cap_min=1e10), {}),
    ("stock: industry Biotechnology",     dict(industry="Biotechnology"), {}),
    # "Oncology" is a true miss: no FMP healthcare *industry* label contains it
    # (cancer names live under Biotechnology / Drug Manufacturers), so the
    # did-you-mean path fires. NB: "Pharma" is NOT a miss — it substring-matches
    # "Medical - Pharmaceuticals" (and misses the big "Drug Manufacturers" names).
    ("stock: industry miss (Oncology)",   dict(sector="Healthcare", industry="Oncology"), {"empty": True, "suggest": True}),
    ("stock: high-beta tech, beta_desc",  dict(sector="Technology", beta_min=1.5, sort_by="beta_desc"), {}),
    ("stock: ipo>=2020, ipo_newest",      dict(ipo_after="2020-01-01", sort_by="ipo_newest"), {}),
    ("stock: exchange NYSE",              dict(exchange="NYSE", market_cap_min=1e10), {}),
    ("stock: asset_type etf",            dict(asset_type="etf"), {}),
    ("stock: impossible cap (empty)",     dict(market_cap_min=1e15), {"empty": True}),
    ("stock: broad, expect bucket",       dict(market_cap_min=1e9, limit=20), {"bucket": True}),
    ("stock: market_cap_asc",            dict(market_cap_min=1e9, sort_by="market_cap_asc"), {}),
]


def check(label, kw, exp):
    limit = kw.get("limit", 20)
    out = db.screen_assets(**kw)
    errs = []
    total, returned, results = out["total_matches"], out["returned"], out["results"]

    if returned != len(results):
        errs.append(f"returned={returned} != len(results)={len(results)}")
    if returned > limit:
        errs.append(f"returned={returned} > limit={limit}")
    if out["has_more"] != (total > returned):
        errs.append(f"has_more={out['has_more']} but total={total} returned={returned}")

    if exp.get("empty"):
        if total != 0:
            errs.append(f"expected empty, got total={total}")
        if "suggestion" not in out:
            errs.append("expected a 'suggestion' on empty result")
    elif not results:
        errs.append("expected >=1 result row, got none")

    if exp.get("suggest") and not out.get("industry_suggestions"):
        errs.append("expected non-empty industry_suggestions")
    if exp.get("bucket"):
        if not out["has_more"]:
            errs.append("bucket case did not overflow (raise the universe size?)")
        elif "bucket_counts_by_sector" not in out:
            errs.append("expected bucket_counts_by_sector")

    # Crypto must collapse to one row per base coin.
    if kw.get("asset_class") == "crypto":
        bases = [r["symbol"].split("/")[0] for r in results]
        if len(bases) != len(set(bases)):
            errs.append(f"duplicate base coins: {bases}")

    # Ordering: verify whichever sort column is present in the rows.
    sb = out["sorted_by"]
    col = "market_cap" if sb.startswith("market_cap") else ("beta" if sb.startswith("beta") else None)
    if col and len(results) > 1:
        vals = [r[col] for r in results if r.get(col) is not None]
        asc = sb.endswith("_asc")
        ordered = vals == sorted(vals) if asc else vals == sorted(vals, reverse=True)
        if not ordered:
            errs.append(f"rows not ordered by {sb}: {vals[:6]}")

    tip = results[0]["symbol"] if results else "-"
    status = "PASS" if not errs else "FAIL"
    print(f"[{status}] {label:36s} total={total:<6} returned={returned:<3} "
          f"sorted={sb:<16} top={tip}")
    for e in errs:
        print(f"         - {e}")
    return not errs


def main():
    try:
        with db._connect():  # fail fast with a clear message if unset/unreachable
            pass
    except db.DbUnavailable as e:
        print(f"DATABASE_URL not set or unreachable: {e}", file=sys.stderr)
        return 2

    print("screen_assets live UAT\n" + "-" * 88)
    ok = all(check(label, kw, exp) for label, kw, exp in CASES)
    print("-" * 88)
    print("ALL PASS" if ok else "FAILURES ABOVE")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
