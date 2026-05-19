/**
 * TradingView Broker adapter — wires TV's built-in trading panel to our
 * FastAPI/Alpaca backend. TV calls these methods; we forward to existing
 * /api/orders, /api/positions endpoints.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, {
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
    side: o.side === "buy" ? 1 : -1, // TV: 1=buy, -1=sell
    type: o.type === "market" ? 1 : o.type === "limit" ? 2 : 3,
    status: toTVStatus(o.status as string),
    qty: parseFloat(o.qty as string ?? "0"),
    filledQty: parseFloat(o.filled_qty as string ?? "0"),
    limitPrice: o.limit_price ? parseFloat(o.limit_price as string) : undefined,
    stopPrice: o.stop_price ? parseFloat(o.stop_price as string) : undefined,
  };
}

// Map Alpaca position → TV position shape
function toTVPosition(p: Record<string, unknown>) {
  return {
    id: p.symbol,
    symbol: p.symbol,
    qty: parseFloat(p.qty as string ?? "0"),
    side: parseFloat(p.qty as string ?? "0") > 0 ? 1 : -1,
    avgPrice: parseFloat(p.avg_entry_price as string ?? "0"),
    unrealizedPL: parseFloat(p.unrealized_pl as string ?? "0"),
  };
}

export function createBroker(onUpdate: () => void) {
  // Poll orders + positions every 5s so TV panel stays current
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling() {
    pollTimer = setInterval(onUpdate, 5000);
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

    // --- Close position (TV calls this to flatten) ---
    async closePosition(symbol: string) {
      await apiFetch(`/api/positions/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      return {};
    },

    // --- Account info shown in TV header ---
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
