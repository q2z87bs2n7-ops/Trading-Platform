-- Company-info enrichment cache for the asset catalogue.
-- Run once in the Supabase SQL Editor (or it is applied via db.ensure_schema()
-- on first use). Keyed by Alpaca symbol; refreshed write-through from Yahoo.
create table if not exists company_profiles (
    symbol       text primary key,
    name         text,
    exchange     text,
    sector       text,
    industry     text,
    market_cap   bigint,
    description  text,
    website      text,
    employees    integer,
    logo_url     text,
    fundamentals jsonb       not null default '{}'::jsonb,
    updated_at   timestamptz not null default now()
);
