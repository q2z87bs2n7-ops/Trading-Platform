# Design Brief — CFD "Scalp" Mode

**Audience:** Claude (design). **Status of the current build:** foundation / working
wireframe — *everything visual is open to change.* **Owner intent:** make this the
one high-energy corner of an otherwise calm, investing-oriented app.

---

## 1. The product, and why Scalp is different

This is a serious hobby-grade **paper-trading platform**. It has three silos:

- **Stocks** and **Crypto** — Alpaca, paper-only (no live path).
- **CFDs** — an FXCM demo account via a Java bridge (forex, indices, metals,
  commodities, stock CFDs).

The whole app is deliberately **calm and investing-oriented**: a Discover surface
(market overview, AI desk-note summaries, watchlists, news, calendars), a Portfolio
view, a full TradingView Chart mode, and a dockable Workspace. The visual language is
restrained — a "Calm v2" oklch token set, generous spacing, muted panels, an accent
that recolours per silo. It reads like a research tool, not a casino.

**Scalp is the deliberate exception.** We want **one area that is genuinely exciting
for hardcore traders** — the people who open and close positions in *seconds*, read
the bid/ask like a tape, and live or die by execution speed and spread. Think the
energy of a professional FX dealing desk (FXCM Trading Station / MT4 / cTrader quick-
trade panels) dropped into our design system. It should feel *alive* the moment you
enter it, and it should feel earned — a "fast lane" you step into, not the default.

The creative tension we want design to resolve:

> **A calm, considered investing app — with one room where the lights flash, the
> numbers tick, and a trade is one click away. Make that room thrilling without
> betraying the brand or tipping into gimmick.**

---

## 2. What CFD trading actually is (so the UI speaks the language)

A **CFD** (contract for difference) is a leveraged bet on a price moving up or down —
you never own the underlying. Key mechanics the UI must respect:

- **Two prices, always:** a **bid** (the price you *sell* at) and an **ask** (the
  price you *buy* at). The gap between them is the **spread** — the trader's cost of
  entry, measured in **pips/points**. Tight spread = cheap to scalp; a widening
  spread is a real signal (and a real cost).
- **Long or short:** you can profit from a fall as easily as a rise. Buy/Sell are
  equal-weight actions, not "buy = good".
- **Lots / contract sizes:** FX trades in unit lots (e.g. 1,000 / 10,000 …); indices,
  metals and stock CFDs trade in contracts sized by the instrument. Position size is
  chosen *before* the click and must be fast to change.
- **Price precision is per-instrument:** EUR/USD shows 5 decimals (the 4th is the
  "pip", the 5th a fractional pip); USD/JPY 3; an index like US30 just 1. Brokers
  render this as a **big-figure / big-pips / fractional-pip** split (small handle,
  large pips, tiny tenth) so the eye locks onto the digits that move.
- **Scalping specifically:** many trades, **seconds-to-minutes** holding, on 1-minute
  or tick charts. What matters: *current* bid/ask, spread, which way the last tick
  went, your open P&L, and the ability to fire and flatten instantly. Speed and
  glanceability beat depth of information.

The traditional answer to this is the **rate matrix / dealing tiles**: a grid of live
bid/ask tiles, one per instrument, with one-click execution and flashing prices.
That's the spine of what we built — but the form is yours to reinvent.

---

## 3. What exists in this branch today (the foundation)

A working, desktop-only Scalp surface lives in the CFD silo. Treat it as a
**wireframe that happens to function** — the logic is sound, the visuals are a first
pass.

**How you reach it.** Not a header pill. The splash / Account Hub **CFD card** carries
a "⚡ Scalp" affordance that drops you straight in. (Discover/Portfolio/Chart/Workspace
remain the calm, shared modes.) Desktop + CFD only; mobile/other silos fall back.

**Layout** (single-column stack — desktop now mirrors the iPad flow):

1. **Control strip** — equity · day P/L · free margin · live open P/L · lot-size
   presets (per-instrument-type) · a **1-click toggle**.
2. **Rate matrix** — a grid of live **bid/ask tiles**, one per watchlist instrument.
   Each tile: instrument name, spread chip, big-figure/pips/fractional-pip Sell(bid)
   and Buy(ask) one-click buttons, **per-side tick flashes**, a net position/P&L
   footer, an inline **×** to remove, and a trailing **"+ Add instrument"** search
   tile. Add/remove never leave the surface.
3. **Chart-led deal ticket** — the chart leads (1-minute, zoomed to recent bars),
   with the selected instrument's big **Buy/Sell** directly beneath it, then that
   instrument's open positions.
4. **Open-positions blotter** — every lot with live P&L, per-row close + close-all.
5. **Price-alerts panel** — set a **rate-cross** alert (above/below a level on
   bid/ask/mid); fires an on-screen toast + a short chime; edit / cancel / re-arm.

**Interaction details worth keeping or improving:**

- **1-click toggle.** ON = a single click fires a market order. OFF = the clicked
  Buy/Sell *arms* ("Confirm") and a second click within ~4s executes — a modal-free
  fat-finger guard. Every execution raises a success/error toast.
- **Tick flashes follow a dealing-tile convention:** each quote flashes on *its own*
  change vs its previous value, gated by a **half-point dead-band**, so an unchanged
  side stays quiet while its counterpart moves (no synchronized strobing every poll).
  The spread chip tints (never red/green) only when the spread itself widens/tightens.
- **Alerts** are client-side only and fire while the app is open (toast + a sharp,
  short Web-Audio chime — deliberately *not* an alarm).

---

## 4. Technical aspects & honest constraints

Design should know what's real, what's faked, and what the data can/can't do.

- **Data feed.** Prices come from an FXCM **demo** account through a Java (FCLite)
  bridge co-running on our always-on host. Today the surface **polls every ~1 second**
  — there is **no true per-tick stream yet** (it's backlogged). So "flashing lights"
  are currently 1s deltas, not real ticks. *Design for a tick-ready world*, but know
  the current cadence. The demo session can also drop (the UI shows an offline state).
- **Instrument metadata drives precision.** The bridge gives us `digits`, `point_size`
  (pip size), `instrument_type` and `base_unit_size` per instrument. All
  precision/pip/lot logic reads these — so the design can assume correct per-
  instrument rendering (5dp FX, 3dp JPY, 1dp indices, contract-sized lots, etc.).
- **What's real vs stub:** one-click execution, lot sizing, position close/close-all,
  toasts, and alerts are **real** (against the demo). **SL/TP is a visual stub** — not
  wired to the bridge yet. There's no live trading anywhere in the app (paper/demo
  only) and **no push notifications** (alerts are in-browser only).
- **Charts:** the inline scalp chart is **lightweight-charts** (no built-in indicators
  — RSI/MACD etc. would be custom or live in the full TradingView Chart mode). The
  separate Chart mode has the full TradingView studies catalogue.
- **Design system to align with:** Calm v2 **oklch token set**, light + dark themes,
  **Inter + IBM Plex Mono** (mono for all numbers/prices), per-silo accent — **CFD is
  orange/amber** (`oklch(72% 0.18 55)`); `--pos`/`--neg` are the P/L green/red and are
  shared app-wide. Tailwind utilities + the token CSS vars. **Free / very-low-cost
  infra only.**
- **Where it lives:** `frontend/src/components/CfdScalpPage.tsx` (surface),
  `CfdPriceChart.tsx` (chart), `CfdAlertsPanel.tsx` / `CfdAlertEngine.tsx` +
  `lib/alerts.ts` + `lib/sound.ts` (alerts). Background + status in `CLAUDE.md`
  (search "Scalp"), the FXCM data layer in `docs/fxcm.md`, open items in `BACKLOG.md`.

---

## 5. The ask to design

**The entire UI is open.** Do not treat the current layout, components, density,
motion, colour intensity, or even the single-column structure as fixed. The build
exists to prove the loop (quote → flash → one-click → fill → manage → alert) works and
to give you something real to push against. Redraw it freely.

**New features are welcome** — suggest boldly. Things that would suit a scalper and
we'd happily consider: a price-ladder / DOM, keyboard-driven trading + hotkeys, a
spread/volatility heat read, a richer tape, draggable SL/TP on the chart, quick-flatten
gestures, sound design for fills vs alerts, a denser multi-pane "cockpit" mode, presets
for instrument sets. Pitch what makes the room exciting.

**But it must belong to *this* app.** The scheme has to align with the rest of the
product: same oklch tokens, the **amber CFD accent**, Inter/IBM Plex Mono, dark/light
parity, the spacing and component vocabulary used in Discover/Portfolio/Chart. The goal
is the app's **adrenaline mode**, not a different product bolted on. Energetic, fast,
glanceable, a little loud — but unmistakably the same family as the calm surfaces.

**Questions worth answering in the design:**

1. How much motion/colour is "alive" vs "noisy"? Where's the line for flashing, and
   should the *whole tile*, just the quote, or a separate indicator carry it?
2. Density: a calm, roomy dealing desk, or a tight, information-dense cockpit? Should
   density be a user choice?
3. Layout: keep the single-column stack, or a true multi-pane cockpit (matrix +
   chart + ladder + blotter visible at once)?
4. How do Buy/Sell, lot size, and the 1-click/confirm safety read as a single fast
   gesture? Where do SL/TP live once they're real?
5. Sound: what should a fill, an alert, a rejection sound like — and how restrained?
6. Mobile: out of scope today (desktop-only). Is a phone scalp surface worth a concept?

Bring back a direction; we'll iterate. The bar isn't perfection — it's a clear,
defensible, *exciting* scheme that still feels like home.
