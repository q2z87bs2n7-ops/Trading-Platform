export interface Account {
  account_number: string;
  status: string;
  currency: string;
  cash: number;
  equity: number;
  buying_power: number;
  non_marginable_buying_power: number;
  portfolio_value: number;
  long_market_value: number;
  short_market_value: number;
  initial_margin: number;
  maintenance_margin: number;
  daytrading_buying_power: number;
  regt_buying_power: number;
  pattern_day_trader: boolean;
  equity_at_market_open: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  time: number;
}

export interface Position {
  symbol: string;
  asset_class?: string;
  qty: number;
  side: string;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  unrealized_intraday_pl: number;
  unrealized_intraday_plpc: number;
  change_today: number;
}

export interface Order {
  id: string;
  symbol: string;
  asset_class?: string;
  side: string;
  type: string;
  order_class: string | null;
  qty: number | null;
  notional?: number | null;
  filled_qty: number;
  filled_avg_price: number | null;
  limit_price: number | null;
  stop_price: number | null;
  time_in_force: string | null;
  status: string;
  submitted_at: number | null;
}

// Mirrors backend/app/schemas.py SubmitOrderRequest.
export interface SubmitOrderInput {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  time_in_force?: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
  qty?: number;
  notional?: number;
  limit_price?: number;
  stop_price?: number;
  trail_price?: number;
  trail_percent?: number;
  extended_hours?: boolean;
  client_order_id?: string;
  order_class?: "simple" | "bracket" | "oco" | "oto";
  take_profit_limit_price?: number;
  stop_loss_stop_price?: number;
  stop_loss_limit_price?: number;
}

// Mirrors backend/app/schemas.py ReplaceOrderRequest.
export interface ReplaceOrderInput {
  qty?: number;
  limit_price?: number;
  stop_price?: number;
  trail?: number;
  time_in_force?: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
}

// Account activities are heterogeneous (fills, dividends, fees…); the
// backend passes Alpaca's raw shape straight through.
export type Activity = Record<string, unknown>;

export interface MarketClock {
  timestamp: number;
  is_open: boolean;
  next_open: number;
  next_close: number;
}

export interface PortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

// Daily cumulative net P/L curve for one asset-class silo (see
// backend/app/alpaca/pnl.py). `t` is unix seconds.
export interface PnlHistory {
  t: number[];
  pnl: number[];
}

export interface CalendarDay {
  date: string;
  open: string;
  close: string;
}

export interface Asset {
  symbol: string;
  name: string;
  exchange: string;
  asset_class: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  fractionable: boolean;
  sector?: string | null;
  logo_url?: string | null;
  market_cap?: number | null;
}

// Full catalogue enrichment for one symbol (/api/asset-profile). NULL columns
// are dropped server-side, so everything past identity is optional and the set
// present depends on asset_class (FMP fields for stocks, CoinGecko for crypto).
export interface AssetProfile {
  symbol: string;
  name: string;
  asset_class: string;
  exchange?: string;
  status?: string;
  tradable?: boolean;
  marginable?: boolean;
  shortable?: boolean;
  fractionable?: boolean;
  // Common enrichment.
  description?: string;
  website?: string;
  logo_url?: string;
  market_cap?: number;
  // Stock enrichment (FMP).
  sector?: string;
  industry?: string;
  country?: string;
  city?: string;
  state?: string;
  ipo_date?: string;
  isin?: string;
  cik?: string;
  is_etf?: boolean;
  is_adr?: boolean;
  is_fund?: boolean;
  is_actively_trading?: boolean;
  ceo?: string;
  employees?: number;
  beta?: number;
  // Crypto enrichment (CoinGecko).
  coingecko_id?: string;
  hashing_algorithm?: string;
  genesis_date?: string;
  categories?: string[];
  whitepaper_url?: string;
  github_url?: string;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
  market_cap_rank?: number;
  ath_usd?: number;
  ath_date?: string;
  atl_usd?: number;
  atl_date?: string;
  // Annual fundamentals (FMP, us_equity). Margins/ratios are fractions (0.21 =
  // 21%); financials_annual is newest-first, ≤5yr.
  pe_ratio?: number;
  ps_ratio?: number;
  pb_ratio?: number;
  ev_to_ebitda?: number;
  peg_ratio?: number;
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  roe?: number;
  roic?: number;
  debt_to_equity?: number;
  current_ratio?: number;
  eps_diluted?: number;
  book_value_per_share?: number;
  free_cash_flow?: number;
  revenue_growth_yoy?: number;
  eps_growth_yoy?: number;
  dividend_yield?: number;
  payout_ratio?: number;
  latest_fiscal_year?: number;
  reported_currency?: string;
  financials_annual?: FinancialsYear[];
  fundamentals_enriched_at?: string;
  // Metadata.
  enriched_at?: string;
  enrichment_source?: string;
}

export interface FinancialsYear {
  year: number;
  revenue?: number | null;
  net_income?: number | null;
  eps?: number | null;
  fcf?: number | null;
}

export interface Snapshot {
  symbol: string;
  prev_close: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  day_close: number | null;
  day_volume: number | null;
  last_price: number | null;
  last_time: number | null;
}

export interface Mover {
  symbol: string;
  price: number;
  change: number;
  percent_change: number;
}

export interface MoversResponse {
  gainers: Mover[];
  losers: Mover[];
  last_updated: number;
}

export interface MostActive {
  symbol: string;
  volume: number;
  trade_count: number;
}

export interface MostActiveResponse {
  most_actives: MostActive[];
  by: string;
  last_updated: number;
}

export interface MarketNewsArticle {
  title: string;
  link: string;
  summary: string;
  source: string;
  pub_time: number;
}

export interface MarketNewsResponse {
  articles: MarketNewsArticle[];
}

// FMP earnings calendar row (/api/calendar/earnings[/{symbol}]). `date` is
// YYYY-MM-DD; estimates are null until reported, actuals null until released.
export interface EarningsRow {
  symbol: string;
  date: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
  market_cap?: number | null;
}

export interface EarningsResponse {
  earnings: EarningsRow[];
  as_of?: number;
}

// FMP economic calendar row (/api/calendar/economic). `date` is
// "YYYY-MM-DD HH:MM:SS" (UTC); `impact` is "High" | "Medium" | "Low".
export interface EconomicRow {
  date: string;
  country: string | null;
  event: string | null;
  currency: string | null;
  impact: string | null;
  previous: number | null;
  estimate: number | null;
  actual: number | null;
  unit: string | null;
}

export interface EconomicResponse {
  economic: EconomicRow[];
  as_of?: number;
}

// Tipranks trending stocks (/api/research/trending). Whole-market list of
// equities by analyst coverage; no symbol input. Per-row enriched with PT
// range + analyst count from the stocks/overview endpoint (batched).
export interface TrendingResearchRow {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  popularity: number | null;
  sentiment: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  consensus: string | null;
  average_price_target: number | null;
  market_cap: number | null;
  market_name: string | null;
  last_rating_date: string | null;
  // From stocks/overview (additive context — does NOT replace
  // average_price_target as the displayed price).
  low_price_target: number | null;
  high_price_target: number | null;
  total_analysts: number | null;
}

export interface TrendingResearchResponse {
  trending: TrendingResearchRow[];
  as_of?: number;
}

// Tipranks SmartScore (/api/research/smart-score/{symbol}). Composite 1–10
// + six component signals + a Tipranks-sourced price target. fundamentals_*
// fields are kept in the payload for AI tool answers but hidden in the
// SmartScore widget UI (Fundamentals widget owns those metrics).
export interface SmartScoreRow {
  ticker: string;
  smart_score: number | null;
  price_target: number | null;
  hedge_fund_trend_value: number | null;
  blogger_bullish_sentiment: number | null;
  blogger_sector_avg: number | null;
  insiders_last_3_months_sum: number | null;
  news_sentiments_bullish_percent: number | null;
  news_sentiments_bearish_percent: number | null;
  investor_holding_change_last_7_days: number | null;
  investor_holding_change_last_30_days: number | null;
  fundamentals_return_on_equity: number | null;
  fundamentals_asset_growth: number | null;
}

export interface SmartScoreResponse {
  symbol: string;
  smart_score: SmartScoreRow | null;
  as_of?: number;
}

// Benzinga ticker news via Alpaca /api/news
export interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  author: string;
  source: string;
  url: string;
  symbols: string[];
  time: number;
}

export interface IndexData {
  name: string;
  symbol: string;
  region: "US" | "Europe" | "Asia";
  price: number;
  prev_close: number;
  change: number;
  change_pct: number;
  session?: "regular" | "pre" | "post";
  ext_price?: number;
  ext_change_pct?: number;
}

export interface IndicesResponse {
  indices: IndexData[];
  as_of: number;
}
