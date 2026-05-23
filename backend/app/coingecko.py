"""CoinGecko public API — crypto profile enrichment. No API key required."""
from __future__ import annotations

import logging
import time

import requests

_log = logging.getLogger(__name__)

_BASE = "https://api.coingecko.com/api/v3"
_HEADERS = {"Accept": "application/json", "User-Agent": "trading-platform/1.0"}
CALL_DELAY = 4.0  # seconds between calls; free keyless tier is ~15/min max

# Static map: crypto base ticker → CoinGecko coin ID. Alpaca lists each coin
# against several quote currencies (BTC/USD, BTC/USDC, BTC/USDT) but the
# CoinGecko profile is per coin, so we key on the base ticker (the part before
# the slash). CoinGecko's symbol field is not unique across 17k+ coins so
# dynamic resolution is unreliable; this hardcoded table is the safe approach.
# IDs verified against the live CoinGecko API.
_BASE_MAP: dict[str, str] = {
    "AAVE":   "aave",
    "ADA":    "cardano",
    "ARB":    "arbitrum",
    "AVAX":   "avalanche-2",
    "BAT":    "basic-attention-token",
    "BCH":    "bitcoin-cash",
    "BONK":   "bonk",
    "BTC":    "bitcoin",
    "CRV":    "curve-dao-token",
    "DOGE":   "dogecoin",
    "DOT":    "polkadot",
    "ETH":    "ethereum",
    "FIL":    "filecoin",
    "GRT":    "the-graph",
    "HYPE":   "hyperliquid",
    "LDO":    "lido-dao",
    "LINK":   "chainlink",
    "LTC":    "litecoin",
    "ONDO":   "ondo-finance",
    "PAXG":   "pax-gold",
    "PEPE":   "pepe",
    "POL":    "polygon-ecosystem-token",
    "RENDER": "render-token",
    "SHIB":   "shiba-inu",
    "SKY":    "sky",
    "SOL":    "solana",
    "SUSHI":  "sushi",
    "TRUMP":  "official-trump",
    "UNI":    "uniswap",
    "USDC":   "usd-coin",
    "USDG":   "global-dollar",
    "USDT":   "tether",
    "WIF":    "dogwifcoin",
    "XRP":    "ripple",
    "XTZ":    "tezos",
    "YFI":    "yearn-finance",
}


def coingecko_id_for(symbol: str) -> str | None:
    base = symbol.upper().split("/", 1)[0]
    return _BASE_MAP.get(base)


def fetch_coin_profile(cg_id: str, *, _retry: int = 1) -> dict:
    r = requests.get(
        f"{_BASE}/coins/{cg_id}",
        params={
            "localization":   "false",
            "tickers":        "false",
            "market_data":    "true",
            "community_data": "false",
            "developer_data": "false",
        },
        headers=_HEADERS,
        timeout=15,
    )
    if r.status_code == 429 and _retry > 0:
        _log.warning("CoinGecko rate limited on %s; waiting 30s", cg_id)
        time.sleep(30)
        return fetch_coin_profile(cg_id, _retry=_retry - 1)
    r.raise_for_status()
    return r.json()


def map_coin_enrichment(symbol: str, data: dict) -> dict:
    md    = data.get("market_data") or {}
    links = data.get("links") or {}
    image = data.get("image") or {}
    cats  = [c for c in (data.get("categories") or []) if c] or None
    desc  = ((data.get("description") or {}).get("en") or "").strip() or None
    home  = (links.get("homepage") or [None])[0] or None
    git   = ((links.get("repos_url") or {}).get("github") or [None])[0] or None
    ath_d = ((md.get("ath_date") or {}).get("usd") or "")[:10] or None
    atl_d = ((md.get("atl_date") or {}).get("usd") or "")[:10] or None
    mc    = (md.get("market_cap") or {}).get("usd")
    return {
        "symbol":            symbol,
        "description":       desc,
        "website":           home,
        "logo_url":          image.get("large") or None,
        "market_cap":        int(mc) if mc else None,
        "coingecko_id":      data.get("id"),
        "hashing_algorithm": data.get("hashing_algorithm") or None,
        "genesis_date":      data.get("genesis_date") or None,
        "categories":        cats,
        "whitepaper_url":    links.get("whitepaper") or None,
        "github_url":        git,
        "circulating_supply": md.get("circulating_supply"),
        "total_supply":      md.get("total_supply"),
        "max_supply":        md.get("max_supply"),
        "market_cap_rank":   data.get("market_cap_rank"),
        "ath_usd":           (md.get("ath") or {}).get("usd"),
        "ath_date":          ath_d,
        "atl_usd":           (md.get("atl") or {}).get("usd"),
        "atl_date":          atl_d,
        "enrichment_source": "coingecko",
    }
