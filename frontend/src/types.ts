export interface Account {
  account_number: string;
  status: string;
  currency: string;
  cash: number;
  equity: number;
  buying_power: number;
  portfolio_value: number;
  long_market_value: number;
  pattern_day_trader: boolean;
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
  qty: number;
  side: string;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  change_today: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: string;
  type: string;
  order_class: string | null;
  qty: number | null;
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

export interface MostActiveStock {
  symbol: string;
  volume: number;
  trade_count: number;
}

export interface MostActivesResponse {
  most_actives: MostActiveStock[];
  by: "volume" | "trades";
  last_updated: number;
}

export interface NewsArticle {
  id: number;
  headline: string;
  summary: string;
  author: string;
  source: string;
  url: string | null;
  symbols: string[];
  time: number;
}
