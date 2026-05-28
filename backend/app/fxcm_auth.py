"""
FXCM JWT mint + cache for the Endpoints suite (watchlist API and friends).

Two-step setup the FXCM web app performs:
  1. POST /iam/authenticate with {loginId, password, ...} → returns
     {accessToken (60s JWT), refreshToken (30d JWT)}
  2. Authorization: Bearer <accessToken> on every endpoints-demo.fxcorporate.com call

We re-mint via /iam/authenticate every ~50s instead of using the
cookie-based refresh-token flow at /iam/refresh. Reasons:
  - Single-user paper app, traffic cost (~1 req/min) is negligible.
  - Refresh flow requires a stateful cookie jar (refresh-token cookie +
    matching x-xsrf-token header echo). Re-mint is just a credentials POST.
  - On credential failure the error surface is identical and one-shot.

Demo-only base URL hardcoded for now; promote to env var once a live env
is in scope.
"""

import asyncio
import time
from typing import Optional

import httpx
from fastapi import HTTPException

from .config import get_settings

# Demo Endpoints-suite host. Live env would be endpoints.fxcm.com (no -demo).
_IAM_BASE = "https://endpoints-demo.fxcm.com"

# Token mint endpoint (POST). Returns JSON {accessToken, refreshToken}.
_MINT_PATH = "/iam/authenticate"

# Re-mint when the cached token has fewer seconds than this left. 10s is
# generous — captured tokens have 60s lifetimes, so this gives 50s of reuse
# per mint and leaves 10s of safety margin for clock skew + in-flight calls.
_REFRESH_SAFETY_SEC = 10

# Trading-session values the app.fxcm.com login uses; demo account is
# always MINIDEMO under the FXCM session. Promote to env if needed.
_APP_NAME           = "Trading Platform"
_TRADING_SESSION_ID = "FXCM"
_TRADING_SUB_ID     = "MINIDEMO"

_HTTP_TIMEOUT = 10.0


class _TokenCache:
    """Module-level singleton — single-user app, no per-request scope."""

    def __init__(self) -> None:
        self.token: Optional[str] = None
        self.expires_at: float = 0  # unix seconds
        # asyncio.Lock so only one mint runs at a time even under
        # concurrent first-page requests.
        self.lock = asyncio.Lock()


_cache = _TokenCache()


def _credentials() -> tuple[str, str]:
    """Read FXCM_USER / FXCM_PASS from the same env vars the Java bridge uses.
    Falls back to the bridge's hardcoded demo defaults so a fresh dev env
    works without setup."""
    import os
    return (
        os.environ.get("FXCM_USER", "D161665432"),
        os.environ.get("FXCM_PASS", "Qak5i"),
    )


async def _mint() -> tuple[str, int]:
    """POST /iam/authenticate and return (accessToken, lifetime_seconds).

    Lifetime is parsed from the JWT exp claim rather than trusted from any
    server-supplied expires_in — FXCM only returns the JWT, no metadata.
    """
    user, password = _credentials()
    body = {
        "appName":             _APP_NAME,
        "loginId":             user,
        "password":            password,
        "tradingSessionId":    _TRADING_SESSION_ID,
        "tradingSessionSubId": _TRADING_SUB_ID,
    }
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            r = await client.post(
                f"{_IAM_BASE}{_MINT_PATH}",
                json=body,
                # Spring CSRF echo: server requires header value == cookie
                # value. Server-to-server we have no cookie jar, so we
                # generate a fresh UUID and trust FXCM only checks presence
                # (which the captured preflight allowed-headers suggests).
                # If FXCM tightens this, switch to a stateful cookie jar.
                headers={
                    "Origin":          "https://app.fxcm.com",
                    "x-cookie-domain": "fxcm.com",
                    "x-xsrf-token":    "00000000-0000-0000-0000-000000000000",
                },
            )
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"FXCM auth failed: {e.response.text}")
    except httpx.ConnectError as e:
        raise HTTPException(503, f"FXCM auth host unreachable: {e}")

    data = r.json()
    access = data.get("accessToken")
    if not access:
        raise HTTPException(502, "FXCM auth response missing accessToken")

    # Parse the JWT exp claim — base64-url-decode the middle segment.
    import base64
    import json

    try:
        payload_b64 = access.split(".")[1]
        # JWT uses url-safe b64 without padding; pad to multiple of 4.
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        exp = int(payload["exp"])
        lifetime = max(1, exp - int(time.time()))
    except (KeyError, ValueError, IndexError):
        # Token didn't decode cleanly — assume the documented 60s window.
        lifetime = 60

    return access, lifetime


async def get_access_token() -> str:
    """Return a fresh accessToken, minting only when the cached one is
    about to expire. Safe to call concurrently."""
    # Fast path: cached token still valid for at least the safety window.
    if _cache.token and _cache.expires_at - time.time() > _REFRESH_SAFETY_SEC:
        return _cache.token

    async with _cache.lock:
        # Re-check after acquiring the lock — another coroutine may have
        # just minted while we were waiting.
        if _cache.token and _cache.expires_at - time.time() > _REFRESH_SAFETY_SEC:
            return _cache.token
        token, lifetime = await _mint()
        _cache.token = token
        _cache.expires_at = time.time() + lifetime
        return token


def reset_cache() -> None:
    """Test/dev hook: force the next call to re-mint."""
    _cache.token = None
    _cache.expires_at = 0
