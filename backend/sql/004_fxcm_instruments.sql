-- 004_fxcm_instruments.sql
-- FXCM instrument metadata from endpoints.fxcorporate.com/symbol/data.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS fxcm_instruments (
    name             TEXT PRIMARY KEY,   -- FCLite instrument name e.g. "EUR/USD"
    display_name     TEXT,
    description      TEXT,
    type             TEXT,               -- "forex" | "stock" | etc.
    currency         TEXT,
    session          TEXT,
    timezone         TEXT,
    underlying_unit  TEXT,
    alternatives     TEXT[],             -- search aliases (forex only)
    seeded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
