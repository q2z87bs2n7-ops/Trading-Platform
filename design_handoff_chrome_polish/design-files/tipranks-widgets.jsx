// TipRanks widget bodies — same JSX structure as the v0.70 code in
// frontend/src/components/research/* and discover/TrendingResearchCard.tsx.
// Polish toggles via a `.polish` class on the outer wrapper (set in
// TipRanks Polish.html). Elements tagged `polish-only` only render in the
// polished view; `current-only` only renders in the v0.70 view. The wrapper
// styles handle the display swap so this file stays close to the real code.
//
// Mock data is realistic-AAPL-shaped; no API calls.

const cx = (...c) => c.filter(Boolean).join(" ");
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const compact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
};
const signed = (n) => (n < 0 ? "−" : n > 0 ? "+" : "") + compact(Math.abs(n));
const signedColor = (n) => (n == null || n === 0 ? "var(--mute)" : n > 0 ? "var(--pos)" : "var(--neg)");
const signedArrow = (n) => (n == null || n === 0 ? "·" : n > 0 ? "▴" : "▾");

function CardTitle({ symbol = "AAPL", kind }) {
  return (
    <div className="tr-card-title">
      <span className="tr-symbol">{symbol}</span>
      <span className="tr-widget-kind">{kind}</span>
    </div>
  );
}

/* ─────────────── SmartScore ─────────────── */

function SmartScoreWidget() {
  const score = 8;
  const label = "Bullish";
  const pt = 234.5;
  const scoreColor = score >= 8 ? "var(--pos)" : score >= 5 ? "var(--text)" : "var(--neg)";
  const rows = [
    { label: "12M momentum", value: "+17.0%", status: "Positive", tone: "var(--pos)" },
    { label: "Hedge funds", value: "+245K", status: "Increased", tone: "var(--pos)" },
    { label: "Insiders (3mo)", value: "−340K", status: "Selling", tone: "var(--neg)" },
    { label: "Bloggers", value: null, status: "Bullish", tone: "var(--pos)" },
    { label: "News", value: null, status: "Positive", tone: "var(--pos)" },
    { label: "Investors", value: null, status: "Very Bullish", tone: "var(--pos)" },
  ];
  return (
    <div className="tr-card">
      <CardTitle kind="SmartScore" />
      <div className="sscore-head" style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="sscore-num" style={{ color: scoreColor, fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 600, lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 11, color: "var(--mute)" }}>/ 10</span>
        <span style={{ fontSize: 13, color: scoreColor }}>{label}</span>
        <span className="sscore-pt" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
          PT {money(pt)}
        </span>
      </div>
      {/* Gauge rail — only in polished view */}
      <div className="sscore-rail polish-only">
        <div className="fill" style={{ width: "100%" }}></div>
        <div className="tick" style={{ left: `calc(${(score / 10) * 100}% - 1px)` }}></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div key={r.label} className={cx("tr-row", i === 0 && "section-break")}>
            <span className="tr-row-label">{r.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {r.value && <span className="tr-row-value tr-mute">{r.value}</span>}
              <span style={{ fontSize: 12, color: r.tone }}>{r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Sentiment ─────────────── */

function SentimentBar({ pos, neu, neg }) {
  const total = pos + neu + neg || 1;
  return (
    <div className="tr-sbar">
      <div style={{ width: `${(pos / total) * 100}%`, background: "var(--pos)" }}></div>
      <div style={{ width: `${(neu / total) * 100}%`, background: "var(--mute)" }}></div>
      <div style={{ width: `${(neg / total) * 100}%`, background: "var(--neg)" }}></div>
    </div>
  );
}

function SentimentWidget() {
  return (
    <div className="tr-card">
      <CardTitle kind="Sentiment" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* News */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="tr-sec">News</span>
          <div className="sent-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: "var(--text)" }}>Positive <span style={{ color: "var(--mute)" }}> · vs sector 0.42</span></span>
            <span className="sent-buzz current-only" style={{ fontSize: 10.5, color: "var(--mute)" }}>Buzz 1.83×</span>
            <span className="sent-buzz polish-only" style={{ display: "inline-block" }}>Buzz 1.83×</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, width: 44, color: "var(--mute)" }}>Stock</span>
              <SentimentBar pos={0.62} neu={0.25} neg={0.13} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pos)", width: 40, textAlign: "right" }}>62.0%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, width: 44, color: "var(--mute)" }}>Sector</span>
              <SentimentBar pos={0.48} neu={0.32} neg={0.20} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pos)", width: 40, textAlign: "right" }}>48.0%</span>
            </div>
          </div>
          {/* Word cloud */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {["earnings", "iPhone", "services", "AI", "China", "growth"].map((w) => (
              <span
                key={w}
                className="wc-chip"
                style={{ fontSize: 10.5, padding: "2px 7px", background: "var(--panel-2)", color: "var(--mute)", borderRadius: 4 }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>

        {/* Bloggers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="tr-sec">Bloggers</span>
          <div className="tr-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <span className="tr-row-label">Bullish</span>
            <span className="tr-row-value tr-pos">74.0%</span>
          </div>
          <div className="tr-row">
            <span className="tr-row-label">Bearish</span>
            <span className="tr-row-value tr-neg">26.0%</span>
          </div>
          <div className="tr-row">
            <span className="tr-row-label">Sector bullish (avg)</span>
            <span className="tr-row-value">61.0%</span>
          </div>
        </div>

        {/* Investors */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="tr-sec">Investors</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span style={{ color: "var(--text)" }}>Score 7.20</span>
            <span style={{ color: "var(--mute)" }}>· vs sector 6.10</span>
            <span style={{ marginLeft: "auto", color: "var(--pos)" }}>Very Positive</span>
          </div>
          <div className="tr-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <span className="tr-row-label">Portfolios holding</span>
            <span className="tr-row-value">124.5K</span>
          </div>
          <div className="tr-row">
            <span className="tr-row-label">Avg allocation</span>
            <span className="tr-row-value">8.5%</span>
          </div>
          <div className="tr-row">
            <span className="tr-row-label">7d change</span>
            <span className="tr-row-value tr-pos">+1.2%</span>
          </div>
          <div className="tr-row">
            <span className="tr-row-label">30d change</span>
            <span className="tr-row-value tr-pos">+3.4%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Analyst Ratings ─────────────── */

const ANALYST_ROWS = [
  { name: "Dan Ives", firm: "Wedbush", action: "Upgraded", actColor: "var(--pos)", rec: "Strong Buy", recColor: "var(--pos)", pt: 250, hit: 0.71, avg: 18.4, date: "Mar 14 '26" },
  { name: "Erik Woodring", firm: "Morgan Stanley", action: "Maintained", actColor: "var(--mute)", rec: "Buy", recColor: "var(--pos)", pt: 235, hit: 0.68, avg: 14.2, date: "Mar 12 '26" },
  { name: "Aaron Rakers", firm: "Wells Fargo", action: "Initiated", actColor: "var(--accent)", rec: "Buy", recColor: "var(--pos)", pt: 225, hit: 0.54, avg: 8.1, date: "Mar 10 '26" },
  { name: "Krish Sankar", firm: "TD Cowen", action: "Maintained", actColor: "var(--mute)", rec: "Hold", recColor: "var(--mute)", pt: 200, hit: 0.48, avg: -1.2, date: "Mar 8 '26" },
  { name: "Brandon Nispel", firm: "KeyBanc", action: "Downgraded", actColor: "var(--neg)", rec: "Hold", recColor: "var(--mute)", pt: 195, hit: 0.51, avg: 2.4, date: "Mar 5 '26" },
];

function AnalystRatingsWidget() {
  return (
    <div className="tr-card">
      <CardTitle kind="Analyst Ratings" />
      <div>
        {ANALYST_ROWS.map((r, i) => (
          <div
            key={r.name}
            style={{
              padding: "10px 0",
              borderTop: i === 0 ? 0 : "1px solid var(--border)",
            }}
            className={cx(i > 0 && "ar-divider")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{r.firm}</span>
              </div>
              <span
                className={cx("tr-badge", r.action === "Initiated" && "ar-initiated")}
                style={{ color: r.actColor }}
              >
                {r.action.slice(0, 8)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: r.recColor, fontFamily: "var(--font-mono)" }}>
                {r.rec}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              {/* PT — chip in polished view, plain text in current */}
              <span className="ar-pt current-only" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                PT ${r.pt}
              </span>
              <span className="ar-pt polish-only" style={{ display: "inline-block" }}>
                PT ${r.pt}
              </span>
              {/* Hit rate */}
              <span className="ar-hit current-only" style={{ fontSize: 11, color: r.hit >= 0.55 ? "var(--pos)" : r.hit <= 0.45 ? "var(--neg)" : "var(--mute)" }}>
                {pct(r.hit)} hit
                <span style={{ color: "var(--mute)" }}> · {r.avg > 0 ? "+" : ""}{r.avg.toFixed(1)}% avg</span>
              </span>
              <span className="ar-hit polish-only" style={{ display: "none" }}>
                <span className="ar-hit-bar" aria-hidden>
                  <div style={{ width: `${r.hit * 100}%`, background: r.hit >= 0.55 ? "var(--pos)" : r.hit <= 0.45 ? "var(--neg)" : "var(--mute)" }}></div>
                </span>
                <span style={{ fontSize: 11, color: r.hit >= 0.55 ? "var(--pos)" : r.hit <= 0.45 ? "var(--neg)" : "var(--mute)", fontFamily: "var(--font-mono)" }}>
                  {pct(r.hit)}
                </span>
                <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
                  {r.avg > 0 ? "+" : ""}{r.avg.toFixed(1)}%
                </span>
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
                {r.date}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Hedge Funds ─────────────── */

const HF_FUNDS = [
  { mgr: "Warren Buffett", inst: "Berkshire Hathaway", action: "Added", shares: 840000, pct: 1.8, val: 382e6 },
  { mgr: "John Bogle", inst: "Vanguard Group", action: "Added", shares: 620000, pct: 0.4, val: 284e6 },
  { mgr: "Larry Fink", inst: "BlackRock", action: "Added", shares: 485000, pct: 0.3, val: 221e6 },
  { mgr: "Cyrus Taraporevala", inst: "State Street", action: "Reduced", shares: -210000, pct: 0.2, val: 96e6 },
  { mgr: "James Simons", inst: "Renaissance Tech", action: "Closed", shares: -180000, pct: 0.8, val: 82e6 },
];

const HF_QUARTERS = [
  { q: "Q1 '25", net: -240000 },
  { q: "Q2 '25", net: 180000 },
  { q: "Q3 '25", net: 860000 },
  { q: "Q4 '25", net: 1240000 },
];

function HedgeFundsWidget() {
  const maxNet = Math.max(...HF_QUARTERS.map((q) => Math.abs(q.net)));
  return (
    <div className="tr-card">
      <CardTitle kind="Hedge Funds" />

      {/* Signal headline */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="hf-signal" style={{ fontWeight: 600, fontSize: 15, color: "var(--pos)" }}>Positive</span>
        <span style={{ fontSize: 11, color: "var(--mute)" }}>· Moderate confidence</span>
      </div>

      {/* Top stats */}
      <div className="hf-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div className="hf-stat" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Last Q net</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--pos)" }}>+1.24M</span>
        </div>
        <div className="hf-stat" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Funds covered</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>142</span>
        </div>
        <div className="hf-stat" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Total holders</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>824</span>
        </div>
      </div>

      {/* Quarterly net Δ — current is plain numbers row; polished is mini bar chart */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="tr-sec">Quarterly net Δ</span>
        {/* Current: plain numbers row */}
        <div className="current-only" style={{ display: "flex", gap: 8 }}>
          {HF_QUARTERS.map((q) => (
            <div key={q.q} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: signedColor(q.net) }}>
                {signed(q.net)}
              </span>
              <span style={{ fontSize: 10, color: "var(--mute)" }}>{q.q}</span>
            </div>
          ))}
        </div>
        {/* Polished: mini bar chart */}
        <div className="hf-quarters polish-only" style={{ display: "none" }}>
          {HF_QUARTERS.map((q) => {
            const h = (Math.abs(q.net) / maxNet) * 100;
            const isNeg = q.net < 0;
            return (
              <div key={q.q} className="hf-q">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: signedColor(q.net), fontVariantNumeric: "tabular-nums" }}>
                  {signed(q.net)}
                </span>
                <div className="hf-q-bar">
                  <div style={{
                    height: `${h}%`,
                    background: isNeg ? "var(--neg)" : "var(--pos)",
                    opacity: 0.85,
                  }}></div>
                </div>
                <span style={{ fontSize: 10, color: "var(--mute)" }}>{q.q}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top movers */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="tr-sec">Largest movers (last Q)</span>
        {HF_FUNDS.map((f, i) => {
          const actColor = f.action === "Added" || f.action === "New" ? "var(--pos)" : f.action === "Reduced" || f.action === "Closed" ? "var(--neg)" : "var(--mute)";
          return (
            <div
              key={f.mgr}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto 56px",
                gap: 8,
                alignItems: "center",
                padding: "6px 0",
                borderTop: i === 0 ? 0 : "1px solid var(--border)",
              }}
              className={cx(i > 0 && "hf-row-divider")}
            >
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.mgr}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{f.inst}</span>
              </div>
              <span className="tr-badge" style={{ color: actColor }}>{f.action}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: signedColor(f.shares), textAlign: "right" }}>
                {signed(f.shares)}
              </span>
              <div className="tr-fund-bar" style={{ alignSelf: "center" }}>
                <div style={{
                  width: `${Math.min(f.pct * 30, 100)}%`,
                  background: f.pct >= 1 ? "var(--pos)" : "var(--text-2)",
                }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────── Insiders ─────────────── */

const INS_MONTHLY = [
  { m: "Oct", buy: 0, sell: 4.2e6 },
  { m: "Nov", buy: 0.8e6, sell: 2.1e6 },
  { m: "Dec", buy: 0, sell: 5.6e6 },
  { m: "Jan", buy: 0, sell: 8.4e6 },
  { m: "Feb", buy: 1.2e6, sell: 3.1e6 },
  { m: "Mar", buy: 0, sell: 4.8e6 },
];

const INS_TXNS = [
  { name: "Timothy Cook", pos: "CEO", stars: 5, amt: -8.4e6, date: "Mar 12 '26", side: "Sell", informative: true },
  { name: "Luca Maestri", pos: "CFO", stars: 4, amt: -5.2e6, date: "Mar 8 '26", side: "Sell", informative: true },
  { name: "Katherine Adams", pos: "General Counsel", stars: 3, amt: -2.8e6, date: "Feb 28 '26", side: "Sell", informative: false },
  { name: "Arthur Levinson", pos: "Chair", stars: 5, amt: -4.8e6, date: "Feb 18 '26", side: "Sell", informative: true },
  { name: "Jeff Williams", pos: "COO", stars: 4, amt: 0.4e6, date: "Feb 14 '26", side: "Buy", informative: true },
];

function Stars({ n }) {
  return (
    <span className="tr-stars" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < n ? "filled" : "empty"}>
          {i < n ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function InsidersWidget() {
  return (
    <div className="tr-card">
      <CardTitle kind="Insiders" />

      {/* Net flow + confidence chip */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Net 12-mo flow</span>
          {/* Current: 15px; Polished: 22px */}
          <span className="current-only" style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--neg)" }}>
            −$28.4M
          </span>
          <span className="ins-headline polish-only" style={{ color: "var(--neg)", display: "none" }}>
            −$28.4M
          </span>
        </div>
        <span className="tr-badge" style={{ color: "var(--neg)" }}>Negative Sentiment</span>
        <div style={{ marginLeft: "auto", textAlign: "right", display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Stock · sector</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>0.34 · 0.58</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Discretionary</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>12</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tr-sec">Uninformative</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--mute)" }}>28</span>
        </div>
      </div>

      {/* Monthly bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="tr-sec">Last 6 months (buys vs sells)</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {INS_MONTHLY.map((m) => {
            const total = m.buy + m.sell || 1;
            return (
              <div key={m.m} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div className="tr-mbar">
                  <div style={{ width: `${(m.buy / total) * 100}%`, background: "var(--pos)" }}></div>
                  <div style={{ width: `${(m.sell / total) * 100}%`, background: "var(--neg)" }}></div>
                </div>
                <span style={{ fontSize: 9.5, color: "var(--mute)", textAlign: "center" }}>{m.m}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transactions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <span className="tr-sec" style={{ marginBottom: 4 }}>Recent transactions</span>
        {INS_TXNS.map((t, i) => {
          const accent = t.side === "Buy" ? "var(--pos)" : "var(--neg)";
          return (
            <div
              key={t.name}
              style={{
                display: "grid",
                gridTemplateColumns: "3px 1fr auto auto auto",
                gap: 8,
                alignItems: "center",
                padding: "7px 0",
                borderTop: i === 0 ? 0 : "1px solid var(--border)",
              }}
              className={cx(i > 0 && "ins-row-divider")}
            >
              <div style={{
                width: 3, height: 28, background: accent,
                opacity: t.informative ? 1 : 0.35, borderRadius: 1.5,
              }}></div>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.pos}
                </span>
              </div>
              <Stars n={t.stars} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: accent, textAlign: "right" }}>
                {t.amt < 0 ? "−" : "+"}${compact(Math.abs(t.amt))}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>
                {t.date}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────── Related Tickers ─────────────── */

const RT_ROWS = [
  { tk: "MSFT", co: "Microsoft Corporation", sent: "Positive", d30: 0.024, mc: 3.1e12 },
  { tk: "NVDA", co: "NVIDIA Corporation", sent: "Very Positive", d30: 0.128, mc: 2.4e12 },
  { tk: "GOOGL", co: "Alphabet Inc.", sent: "Positive", d30: 0.012, mc: 2.1e12 },
  { tk: "META", co: "Meta Platforms", sent: "Positive", d30: 0.038, mc: 1.4e12 },
  { tk: "AMZN", co: "Amazon.com", sent: "Positive", d30: 0.008, mc: 1.9e12 },
  { tk: "NFLX", co: "Netflix", sent: "Neutral", d30: -0.004, mc: 280e9 },
  { tk: "AMD", co: "Advanced Micro Devices", sent: "Positive", d30: 0.042, mc: 305e9 },
  { tk: "TSLA", co: "Tesla", sent: "Negative", d30: -0.021, mc: 612e9 },
];

function RelatedTickersWidget() {
  const sentColor = (s) => s.startsWith("Positive") || s.startsWith("Very Positive") ? "var(--pos)" : s.startsWith("Negative") ? "var(--neg)" : "var(--mute)";
  return (
    <div className="tr-card">
      <CardTitle kind="Related Tickers" />
      {/* Cohort selector */}
      <div className="rt-cohorts current-only" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {["All", "Young", "Mid", "Eldest"].map((c, i) => (
          <button
            key={c}
            type="button"
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: i === 0 ? "var(--panel-2)" : "transparent",
              color: i === 0 ? "var(--text)" : "var(--mute)",
              border: i === 0 ? "1px solid var(--border)" : "1px solid transparent",
              cursor: "pointer",
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="rt-cohorts polish-only" style={{ display: "none" }}>
        {["All", "Young", "Mid", "Eldest"].map((c, i) => (
          <button key={c} type="button" className={cx("rt-cohort", i === 0 && "active")}>
            {c}
          </button>
        ))}
      </div>

      <div>
        {RT_ROWS.map((r, i) => (
          <div
            key={r.tk}
            className="rt-row"
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr auto 64px 60px",
              gap: 8,
              alignItems: "center",
              padding: "6px 0",
              borderTop: i === 0 ? 0 : "1px solid var(--border)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "var(--font-mono)" }}>{r.tk}</span>
            <span style={{ fontSize: 12, color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.co}
            </span>
            <span style={{ fontSize: 11, color: sentColor(r.sent) }}>{r.sent}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: signedColor(r.d30), textAlign: "right" }}>
              {r.d30 > 0 ? "+" : ""}{(r.d30 * 100).toFixed(1)}%
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)", textAlign: "right" }}>
              {compact(r.mc)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Holder Demographics ─────────────── */

const HD_COHORTS = [
  { key: "young", label: "Young", holders: 0.184, d7: 0.012, d30: 0.034, beta: 1.18, mret: 0.024, div: 0.004, pe: 28.5 },
  { key: "mid", label: "Mid", holders: 0.221, d7: 0.004, d30: 0.018, beta: 1.05, mret: 0.018, div: 0.006, pe: 26.8 },
  { key: "eldest", label: "Eldest", holders: 0.142, d7: -0.002, d30: 0.006, beta: 0.92, mret: 0.012, div: 0.009, pe: 25.4 },
];

const HD_FIELDS = [
  { key: "holders", label: "Holders", fmt: (n) => pct(n) },
  { key: "d7", label: "7d Δ", fmt: (n) => pct(n), signed: true },
  { key: "d30", label: "30d Δ", fmt: (n) => pct(n), signed: true },
  { key: "beta", label: "Avg β", fmt: (n) => n.toFixed(2) },
  { key: "mret", label: "Mo. return", fmt: (n) => pct(n), signed: true },
  { key: "div", label: "Div. yield", fmt: (n) => pct(n) },
  { key: "pe", label: "Avg P/E", fmt: (n) => n.toFixed(1) },
];

function HolderDemographicsWidget() {
  return (
    <div className="tr-card">
      <CardTitle kind="Holder Demographics" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
        {HD_COHORTS.map((c) => (
          <div key={c.key} className={cx("hd-cohort", c.key)} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="tr-sec">{c.label}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {HD_FIELDS.map((f) => {
                const v = c[f.key];
                const tone = f.signed ? signedColor(v) : "var(--text)";
                return (
                  <div key={f.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                    <span style={{ color: "var(--mute)" }}>{f.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: tone }}>
                      {f.signed && (
                        <span className="hd-delta-arrow polish-only" style={{ display: "none" }}>
                          {signedArrow(v)}
                        </span>
                      )}
                      {f.fmt(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "4px 16px",
        paddingTop: 10, borderTop: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="tr-sec">Sector</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            6.10 <span style={{ color: "var(--mute)" }}>· Positive</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="tr-sec">Best investors</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            8,420 holding <span style={{ color: "var(--mute)" }}>· 12.4% alloc</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Trending ─────────────── */

const TREND_ROWS = [
  { tk: "NVDA", co: "NVIDIA Corporation", cons: "StrongBuy", consLabel: "Strong Buy", pt: 185, ups: 28.4, mc: 2.4e12 },
  { tk: "TSLA", co: "Tesla Inc.", cons: "Hold", consLabel: "Hold", pt: 245, ups: 12.6, mc: 612e9 },
  { tk: "AMD", co: "Advanced Micro Devices", cons: "Buy", consLabel: "Buy", pt: 180, ups: 18.2, mc: 305e9 },
  { tk: "META", co: "Meta Platforms", cons: "StrongBuy", consLabel: "Strong Buy", pt: 620, ups: 14.8, mc: 1.4e12 },
  { tk: "PLTR", co: "Palantir Technologies", cons: "Buy", consLabel: "Buy", pt: 28, ups: 8.4, mc: 62e9 },
];

function TrendingWidget() {
  const consColor = (c) => c === "StrongBuy" || c === "Buy" ? "var(--pos)" : c === "Sell" || c === "StrongSell" ? "var(--neg)" : "var(--mute)";
  return (
    <div className="tr-card">
      <CardTitle symbol="Market" kind="Trending" />
      <div>
        {TREND_ROWS.map((r, i) => (
          <div
            key={r.tk}
            className="tr-trow"
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr auto 72px 64px",
              gap: 10,
              alignItems: "center",
              padding: "8px 0",
              borderTop: i === 0 ? 0 : "1px solid var(--border)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, fontFamily: "var(--font-mono)" }}>{r.tk}</span>
            <span style={{ fontSize: 12, color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.co}
            </span>
            {/* Consensus — plain text in current, chip in polished */}
            <span className="current-only" style={{ fontSize: 12, color: consColor(r.cons) }}>
              {r.consLabel}
            </span>
            <span className="tr-consensus polish-only" style={{ color: consColor(r.cons), display: "none" }}>
              {r.consLabel}
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text)" }}>
                ${r.pt}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: r.ups > 0 ? "var(--pos)" : "var(--neg)" }}>
                {r.ups > 0 ? "+" : ""}{r.ups.toFixed(1)}%
              </span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--mute)", textAlign: "right" }}>
              {compact(r.mc)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  SmartScoreWidget, SentimentWidget, AnalystRatingsWidget, HedgeFundsWidget,
  InsidersWidget, RelatedTickersWidget, HolderDemographicsWidget, TrendingWidget,
});
