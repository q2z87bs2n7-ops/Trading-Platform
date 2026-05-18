"""Vercel Python serverless entrypoint.

Vercel's Python runtime serves the ASGI ``app`` exported here. The actual
FastAPI app lives in ``backend/app``; we just put that on the import path.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
