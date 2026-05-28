-- 005_merge_fxcm_instruments.sql
-- Extends assets to host FXCM instruments alongside Alpaca rows, giving all
-- asset types a single enrichment home.  Run once in the Supabase SQL editor
-- AFTER 004_fxcm_instruments.sql.

-- Source discriminator.  All existing Alpaca rows default to 'alpaca'.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'alpaca';

-- FXCM-specific metadata columns (NULL for Alpaca rows).
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fxcm_type             TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fxcm_display_name     TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fxcm_underlying_unit  TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fxcm_alternatives     TEXT[];
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fxcm_session          TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fxcm_timezone         TEXT;

-- Resolved FMP ticker for stock_cfd enrichment (e.g. 'RBLX' for 'RBLX.us',
-- 'ASML' or 'ASML.AS' for 'ASML.nl' depending on which candidate returned data).
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fmp_ticker            TEXT;

-- Index for source-filtered queries.
CREATE INDEX IF NOT EXISTS idx_assets_source ON assets (source);

-- Migrate fxcm_instruments rows into assets.
-- asset_class is derived from the FXCM Type field.
INSERT INTO assets (
    symbol, name, asset_class, source,
    description,
    fxcm_type, fxcm_display_name, fxcm_underlying_unit,
    fxcm_alternatives, fxcm_session, fxcm_timezone,
    seeded_at
)
SELECT
    fi.name,
    COALESCE(fi.display_name, fi.name),
    CASE fi.type
        WHEN 'forex'     THEN 'forex'
        WHEN 'stock'     THEN 'stock_cfd'
        WHEN 'index'     THEN 'index'
        WHEN 'metal'     THEN 'metal'
        WHEN 'commodity' THEN 'commodity'
        ELSE                  'cfd_other'
    END,
    'fxcm',
    fi.description,
    fi.type,
    fi.display_name,
    fi.underlying_unit,
    fi.alternatives,
    fi.session,
    fi.timezone,
    fi.seeded_at
FROM fxcm_instruments fi
ON CONFLICT (symbol) DO UPDATE SET
    source               = 'fxcm',
    asset_class          = excluded.asset_class,
    name                 = excluded.name,
    description          = COALESCE(excluded.description, assets.description),
    fxcm_type            = excluded.fxcm_type,
    fxcm_display_name    = excluded.fxcm_display_name,
    fxcm_underlying_unit = excluded.fxcm_underlying_unit,
    fxcm_alternatives    = excluded.fxcm_alternatives,
    fxcm_session         = excluded.fxcm_session,
    fxcm_timezone        = excluded.fxcm_timezone,
    seeded_at            = excluded.seeded_at;
