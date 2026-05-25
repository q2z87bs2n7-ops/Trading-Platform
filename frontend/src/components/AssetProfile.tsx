import { useState } from "react";

import { useAssetProfile } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import { fmtCryptoPrice, pct } from "../lib/format";
import type { AssetProfile as Profile } from "../types";

// Catalogue enrichment surface — company fundamentals for stocks (FMP) and
// tokenomics / price extremes for crypto (CoinGecko). Location-agnostic: takes
// `symbol` + `assetClass`; the Workspace Profile widget wraps it.

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString("en-US")}`;
}

function fmtUnits(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function fmtDate(s: string): string {
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] p-1" style={{ color: "var(--mute)" }}>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="text-[10px] font-medium uppercase"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[12.5px] tabular-nums truncate"
        style={{ color: "var(--text)" }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10.5px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "var(--panel-2)", color: "var(--mute)" }}
    >
      {children}
    </span>
  );
}

function LinkPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[11px] px-2 py-1 rounded-full no-underline"
      style={{ background: "var(--panel-2)", color: "var(--accent)" }}
    >
      {children} ↗
    </a>
  );
}

function StockStats({ p, dense }: { p: Profile; dense?: boolean }) {
  const hq = [p.city, p.state, p.country].filter(Boolean).join(", ");
  const flags = [
    p.is_etf && "ETF",
    p.is_adr && "ADR",
    p.is_fund && "Fund",
  ].filter(Boolean) as string[];
  return (
    <div className={`grid ${dense ? "grid-cols-1" : "grid-cols-2"} gap-x-4 gap-y-2.5`}>
      {p.market_cap != null && <Stat label="Market cap" value={fmtUsd(p.market_cap)} />}
      {p.beta != null && <Stat label="Beta" value={p.beta.toFixed(2)} />}
      {p.employees != null && (
        <Stat label="Employees" value={p.employees.toLocaleString("en-US")} />
      )}
      {p.ipo_date && <Stat label="IPO" value={fmtDate(p.ipo_date)} />}
      {p.ceo && <Stat label="CEO" value={p.ceo} />}
      {hq && <Stat label="Headquarters" value={hq} />}
      {p.exchange && <Stat label="Exchange" value={p.exchange} />}
      {flags.length > 0 && <Stat label="Type" value={flags.join(" · ")} />}
    </div>
  );
}

function CryptoStats({ p, last, dense }: { p: Profile; last?: number; dense?: boolean }) {
  const athDist = p.ath_usd && last ? (last - p.ath_usd) / p.ath_usd : undefined;
  const atlDist = p.atl_usd && last ? (last - p.atl_usd) / p.atl_usd : undefined;
  const supplyPct =
    p.circulating_supply && p.max_supply
      ? Math.min(1, p.circulating_supply / p.max_supply)
      : undefined;
  const cols = dense ? "grid-cols-1" : "grid-cols-2";
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid ${cols} gap-x-4 gap-y-2.5`}>
        {p.market_cap != null && <Stat label="Market cap" value={fmtUsd(p.market_cap)} />}
        {p.market_cap_rank != null && (
          <Stat label="Rank" value={`#${p.market_cap_rank}`} />
        )}
        {p.circulating_supply != null && (
          <Stat label="Circulating" value={fmtUnits(p.circulating_supply)} />
        )}
        <Stat
          label="Max supply"
          value={p.max_supply != null ? fmtUnits(p.max_supply) : "∞"}
        />
        {p.genesis_date && <Stat label="Genesis" value={fmtDate(p.genesis_date)} />}
        {p.hashing_algorithm && <Stat label="Algorithm" value={p.hashing_algorithm} />}
      </div>

      {supplyPct != null && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] uppercase" style={{ color: "var(--mute)", letterSpacing: "0.04em" }}>
            <span>Circulating / max</span>
            <span className="font-mono">{(supplyPct * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--panel-2)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${supplyPct * 100}%`, background: "var(--accent)" }}
            />
          </div>
        </div>
      )}

      {(p.ath_usd != null || p.atl_usd != null) && (
        <div className={`grid ${cols} gap-x-4 gap-y-2.5`} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 10 }}>
          {p.ath_usd != null && (
            <Stat
              label={`All-time high${p.ath_date ? ` · ${fmtDate(p.ath_date)}` : ""}`}
              value={
                <>
                  {fmtCryptoPrice(p.ath_usd)}
                  {athDist != null && (
                    <span style={{ color: "var(--neg)" }}> ({pct(athDist)})</span>
                  )}
                </>
              }
            />
          )}
          {p.atl_usd != null && (
            <Stat
              label={`All-time low${p.atl_date ? ` · ${fmtDate(p.atl_date)}` : ""}`}
              value={
                <>
                  {fmtCryptoPrice(p.atl_usd)}
                  {atlDist != null && (
                    <span style={{ color: "var(--pos)" }}> ({pct(atlDist)})</span>
                  )}
                </>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function AssetProfile({
  symbol,
  assetClass,
  dense,
}: {
  symbol: string;
  assetClass: "stocks" | "crypto";
  dense?: boolean;
}) {
  const { data: p, isLoading } = useAssetProfile(symbol);
  const isCrypto = p ? p.asset_class === "crypto" : assetClass === "crypto";
  // ATH/ATL distance needs a live price; only crypto carries those fields.
  const { quotes } = useLiveQuotes(isCrypto && symbol ? [symbol] : []);
  const last = quotes[symbol]?.mid;
  const [showFull, setShowFull] = useState(false);

  if (!symbol) return <Notice>Pick an instrument to see its profile.</Notice>;
  if (isLoading && !p) return <Notice>Loading profile…</Notice>;
  if (!p) return <Notice>No profile available for {symbol}.</Notice>;

  const enriched = !!p.enrichment_source;
  const tags = isCrypto ? (p.categories ?? []).slice(0, 4) : [p.sector, p.industry].filter(Boolean) as string[];
  const desc = p.description?.replace(/<\/?[^>]+>/g, "").trim();
  const links: React.ReactNode[] = [];
  if (p.website) links.push(<LinkPill key="web" href={p.website}>Website</LinkPill>);
  if (p.whitepaper_url) links.push(<LinkPill key="wp" href={p.whitepaper_url}>Whitepaper</LinkPill>);
  if (p.github_url) links.push(<LinkPill key="gh" href={p.github_url}>GitHub</LinkPill>);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start gap-2.5">
        {p.logo_url && (
          <img
            src={p.logo_url}
            alt=""
            width={36}
            height={36}
            className="rounded-full shrink-0"
            style={{ objectFit: "contain", background: "var(--panel-2)" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight truncate" title={p.name}>
            {p.name}
          </div>
          <div className="text-[11px]" style={{ color: "var(--mute)" }}>
            <span className="font-mono">{p.symbol}</span>
            {p.exchange && ` · ${p.exchange}`}
          </div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      )}

      {isCrypto ? (
        <CryptoStats p={p} last={last} dense={dense} />
      ) : (
        <StockStats p={p} dense={dense} />
      )}

      {desc && (
        <div>
          <p
            className="text-[12px] leading-relaxed"
            style={
              {
                color: "var(--mute)",
                display: "-webkit-box",
                WebkitLineClamp: showFull ? "unset" : 6,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              } as React.CSSProperties
            }
          >
            {desc}
          </p>
          {desc.length > 280 && (
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="text-[11px] mt-1 cursor-pointer bg-transparent border-0 p-0"
              style={{ color: "var(--accent)" }}
            >
              {showFull ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {links.length > 0 && <div className="flex flex-wrap gap-1.5">{links}</div>}

      {!enriched && (
        <Notice>No catalogue enrichment for {p.symbol} yet — showing base identity.</Notice>
      )}
    </div>
  );
}
