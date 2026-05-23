-- 002_assets.sql
-- Drops company_profiles and creates the unified assets table.
-- Run once in the Supabase SQL editor.

DROP TABLE IF EXISTS company_profiles;

CREATE TABLE assets (

    -- Base identity (Alpaca — populated for every asset on seed)
    symbol                  TEXT PRIMARY KEY,
    alpaca_id               UUID,
    name                    TEXT,
    asset_class             TEXT NOT NULL,      -- 'us_equity' | 'crypto'
    exchange                TEXT,
    status                  TEXT,               -- 'active' | 'inactive'
    tradable                BOOLEAN,
    marginable              BOOLEAN,
    shortable               BOOLEAN,
    fractionable            BOOLEAN,
    attributes              TEXT[],             -- e.g. has_options, overnight_tradable
    min_order_size          NUMERIC,            -- crypto only
    min_trade_increment     NUMERIC,            -- crypto only
    price_increment         NUMERIC,            -- crypto only

    -- Common enrichment (both asset classes, source determined by asset_class)
    description             TEXT,
    website                 TEXT,
    logo_url                TEXT,
    market_cap              BIGINT,

    -- Stock enrichment (FMP, us_equity only)
    sector                  TEXT,
    industry                TEXT,
    country                 TEXT,
    city                    TEXT,
    state                   TEXT,
    ipo_date                DATE,
    isin                    TEXT,
    cik                     TEXT,
    is_etf                  BOOLEAN,
    is_adr                  BOOLEAN,
    is_fund                 BOOLEAN,
    is_actively_trading     BOOLEAN,
    ceo                     TEXT,
    employees               INTEGER,
    phone                   TEXT,
    beta                    NUMERIC,
    dcf                     NUMERIC,
    dcf_diff                NUMERIC,

    -- Crypto enrichment (CoinGecko, crypto only)
    coingecko_id            TEXT,
    hashing_algorithm       TEXT,
    genesis_date            DATE,
    categories              TEXT[],
    whitepaper_url          TEXT,
    github_url              TEXT,
    circulating_supply      NUMERIC,
    total_supply            NUMERIC,
    max_supply              NUMERIC,
    market_cap_rank         INTEGER,
    ath_usd                 NUMERIC,
    ath_date                DATE,
    atl_usd                 NUMERIC,
    atl_date                DATE,

    -- Metadata
    seeded_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enriched_at             TIMESTAMPTZ,        -- NULL = not yet enriched
    enrichment_source       TEXT                -- 'fmp' | 'coingecko'

);

-- Screening indexes
CREATE INDEX idx_assets_asset_class   ON assets (asset_class);
CREATE INDEX idx_assets_tradable      ON assets (tradable);
CREATE INDEX idx_assets_sector        ON assets (sector);
CREATE INDEX idx_assets_market_cap    ON assets (market_cap);
CREATE INDEX idx_assets_enriched_at   ON assets (enriched_at);

-- Array containment indexes (e.g. categories @> '{DeFi}', attributes @> '{has_options}')
CREATE INDEX idx_assets_attributes    ON assets USING GIN (attributes);
CREATE INDEX idx_assets_categories    ON assets USING GIN (categories);
