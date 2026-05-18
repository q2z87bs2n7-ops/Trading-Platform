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
