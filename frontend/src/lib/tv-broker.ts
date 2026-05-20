/**
 * TradingView Broker adapter — wires TV's built-in trading panel to our
 * FastAPI/Alpaca backend. TV calls these methods; we forward to existing
 * /api/orders, /api/positions endpoints.
 */

// Strip trailing slash so ${BASE}/api/... never produces a double-slash
// when VITE_API_BASE is set with a trailing slash (e.g. "https://x.vercel.app/").
const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new Error(text);
  }
  return r.json();
}

// Map Alpaca order status → TradingView order status
function toTVStatus(status: string): number {
  // TV statuses: 1=Inactive, 2=Working, 3=Rejected, 4=Filled, 5=Cancelled
  const map: Record<string, number> = {
    new: 2,
    partially_filled: 2,
    filled: 4,
    done_for_day: 5,
    canceled: 5,
    expired: 5,
    replaced: 5,
    pending_cancel: 2,
    pending_replace: 2,
    accepted: 2,
    pending_new: 2,
    accepted_for_bidding: 2,
    stopped: 5,
    rejected: 3,
    suspended: 1,
    calculated: 2,
  };
  return map[status] ?? 2;
}

// Map Alpaca order → TV order shape
function toTVOrder(o: Record<string, unknown>) {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side === "buy" ? 1 : -1,
    type: o.type === "market" ? 1 : o.type === "limit" ? 2 : 3,
    status: toTVStatus(o.status as string),
    qty: parseFloat((o.qty as string) ?? "0"),
    filledQty: parseFloat((o.filled_qty as string) ?? "0"),
    limitPrice: o.limit_price ? parseFloat(o.limit_price as string) : undefined,
    stopPrice: o.stop_price ? parseFloat(o.stop_price as string) : undefined,
  };
}

// Map Alpaca position → TV position shape
function toTVPosition(p: Record<string, unknown>) {
  return {
    id: p.symbol,
    symbol: p.symbol,
    qty: parseFloat((p.qty as string) ?? "0"),
    side: parseFloat((p.qty as string) ?? "0") > 0 ? 1 : -1,
    avgPrice: parseFloat((p.avg_entry_price as string) ?? "0"),
    unrealizedPL: parseFloat((p.unrealized_pl as string) ?? "0"),
  };
}

// Host is IBrokerConnectionAdapterHost — provides factory.createWatchedValue
// for the summary fields TV expects to be reactive.
interface TVWatchedValue<T> {
  setValue(value: T, forceUpdate?: boolean): void;
}
interface TVHost {
  factory: {
    createWatchedValue<T>(value?: T): TVWatchedValue<T>;
  };
}

export function createBroker(host: TVHost, onUpdate: () => void) {
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Reactive values surfaced in the Account Manager summary row.
  // TV reads these via subscribe() and re-renders on setValue() — they
  // are NOT plain numbers, so creating them via factory is required.
  const equityWV = host.factory.createWatchedValue<number>(0);
  const buyingPowerWV = host.factory.createWatchedValue<number>(0);

  async function refreshAccount() {
    try {
      const data = await apiFetch("/api/account");
      equityWV.setValue(parseFloat(data.equity ?? "0"));
      buyingPowerWV.setValue(parseFloat(data.buying_power ?? "0"));
    } catch {
      /* leave last-known values */
    }
  }

  function startPolling() {
    refreshAccount();
    pollTimer = setInterval(() => {
      refreshAccount();
      onUpdate();
    }, 5000);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
  }

  return {
    // --- Lifecycle ---
    connect() {
      startPolling();
      return Promise.resolve();
    },
    disconnect() {
      stopPolling();
    },

    // --- Required by TV: can this symbol be traded? ---
    // Alpaca supports all tradable assets; always true here.
    async isTradable(_symbol: string): Promise<boolean> {
      return true;
    },

    // --- Required by TV: describes the account manager bottom panel ---
    // Per charting_library.d.ts AccountManagerInfo: summary uses `text`+`wValue`
    // (not `label`+`property`); columns need an `id`; `pages` is required.
    accountManagerInfo() {
      return {
        accountTitle: "Paper Account",
        summary: [
          { text: "Equity", wValue: equityWV, formatter: "formatPrice" },
          { text: "Buying Power", wValue: buyingPowerWV, formatter: "formatPrice" },
        ],
        orderColumns: [
          { id: "symbol", label: "Symbol", formatter: "symbol", dataFields: ["symbol"] },
          { id: "side", label: "Side", formatter: "side", dataFields: ["side"] },
          { id: "type", label: "Type", formatter: "type", dataFields: ["type"] },
          { id: "qty", label: "Qty", formatter: "formatQuantity", dataFields: ["qty"] },
          { id: "status", label: "Status", formatter: "status", dataFields: ["status"] },
        ],
        positionColumns: [
          { id: "symbol", label: "Symbol", formatter: "symbol", dataFields: ["symbol"] },
          { id: "qty", label: "Qty", formatter: "formatQuantity", dataFields: ["qty"] },
          { id: "avgPrice", label: "Avg Price", formatter: "formatPrice", dataFields: ["avgPrice"] },
          { id: "unrealizedPL", label: "Unreal P/L", formatter: "profit", dataFields: ["unrealizedPL"] },
        ],
        historyColumns: [
          { id: "symbol", label: "Symbol", formatter: "symbol", dataFields: ["symbol"] },
          { id: "side", label: "Side", formatter: "side", dataFields: ["side"] },
          { id: "qty", label: "Qty", formatter: "formatQuantity", dataFields: ["qty"] },
          { id: "price", label: "Price", formatter: "formatPrice", dataFields: ["price"] },
        ],
        pages: [],
      };
    },

    // --- Required by TV: which account is currently active ---
    currentAccount() {
      return "paper";
    },

    // --- Required by TV: list of accounts (single paper account) ---
    async accountsMetainfo() {
      return [{ id: "paper", name: "Paper Account", currency: "USD" }];
    },

    // --- Required by TV: per-symbol trading constraints ---
    async symbolInfo(_symbol: string) {
      return {
        qty: { min: 0.01, max: 10000, step: 0.01, default: 1 },
        pipSize: 0.01,
        pipValue: 0.01,
        minTick: 0.01,
        lotSize: 1,
        description: _symbol,
        type: "stock",
        currency: "USD",
      };
    },

    // --- Required by TV: trade executions / fills ---
    // Map Alpaca fill activities; returns empty array on error so the panel
    // still loads even when activities are unavailable.
    async executions(_symbol: string) {
      try {
        const data = await apiFetch("/api/activities?type=FILL&limit=50");
        return (data.activities ?? [])
          .filter((a: Record<string, unknown>) => !_symbol || a.symbol === _symbol)
          .map((a: Record<string, unknown>) => ({
            id: a.id,
            symbol: a.symbol,
            price: parseFloat((a.price as string) ?? "0"),
            qty: parseFloat((a.qty as string) ?? "0"),
            side: a.side === "buy" ? 1 : -1,
            time: new Date(a.transaction_time as string).getTime(),
          }));
      } catch {
        return [];
      }
    },

    // --- Positions ---
    async positions() {
      const data = await apiFetch("/api/positions");
      return (data.positions ?? []).map(toTVPosition);
    },

    // --- Orders ---
    async orders() {
      const data = await apiFetch("/api/orders?status=open");
      return (data.orders ?? []).map(toTVOrder);
    },

    // --- Place order ---
    async placeOrder(order: Record<string, unknown>) {
      const body: Record<string, unknown> = {
        symbol: order.symbol,
        side: order.side === 1 ? "buy" : "sell",
        type: order.type === 1 ? "market" : order.type === 2 ? "limit" : "stop",
        qty: order.qty,
        time_in_force: "day",
      };
      if (order.limitPrice) body.limit_price = order.limitPrice;
      if (order.stopPrice) body.stop_price = order.stopPrice;

      const data = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { orderId: data.id };
    },

    // --- Cancel order ---
    async cancelOrder(orderId: string) {
      await apiFetch(`/api/orders/${orderId}`, { method: "DELETE" });
      return {};
    },

    // --- Close position ---
    async closePosition(symbol: string) {
      await apiFetch(`/api/positions/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      return {};
    },

    // --- Account summary shown in TV header ---
    async accountInfo() {
      const data = await apiFetch("/api/account");
      return {
        currency: "USD",
        buyingPower: parseFloat(data.buying_power ?? "0"),
        equity: parseFloat(data.equity ?? "0"),
      };
    },
  };
}
