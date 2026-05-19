import { useEffect, useState } from "react";

import { useActivities, useNews } from "../data/hooks";
import Activities from "./Activities";
import News from "./News";

type Tab = "news" | "activities";

// Persist tab selection across reloads (per spec UI-07).
function loadInitialTab(symbol: string): Tab {
  const stored = localStorage.getItem("bottom_tab") as Tab | null;
  if (stored === "news" || stored === "activities") return stored;
  return symbol ? "news" : "activities";
}

// Cheap change-stamp for unread tracking: data length + first-item id.
// React Query gives a new reference per fetch, but length + first id is
// stable across re-renders that didn't actually receive new content.
// `unknown` row type covers both NewsArticle (id: number) and Activity
// (Record<string, unknown> — id field is unknown statically).
function stamp(rows: ReadonlyArray<unknown> | undefined): string | null {
  if (!rows) return null;
  const first = rows[0] as { id?: unknown } | undefined;
  return `${rows.length}:${String(first?.id ?? "")}`;
}

export default function BottomDrawer({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<Tab>(() => loadInitialTab(symbol));
  useEffect(() => {
    localStorage.setItem("bottom_tab", tab);
  }, [tab]);

  // Both hooks are also called from the inner News/Activities components.
  // React Query dedupes by query key — one fetch, two subscribers. The
  // drawer needs its own subscription to compute the unread stamp without
  // poking through the child component's state.
  const { data: actData } = useActivities(25);
  const { data: newsData } = useNews(symbol, 10);
  const actStamp = stamp(actData?.activities);
  const newsStamp = stamp(newsData?.news);

  // "Last seen" stamps. Initialise from the first non-null stamp so the
  // dot doesn't fire on the very first data arrival, and refresh whenever
  // the user is actively on that tab.
  const [actLastSeen, setActLastSeen] = useState<string | null>(null);
  const [newsLastSeen, setNewsLastSeen] = useState<string | null>(null);

  useEffect(() => {
    if (actStamp === null) return;
    if (actLastSeen === null || tab === "activities") setActLastSeen(actStamp);
  }, [tab, actStamp, actLastSeen]);

  useEffect(() => {
    if (newsStamp === null) return;
    if (newsLastSeen === null || tab === "news") setNewsLastSeen(newsStamp);
  }, [tab, newsStamp, newsLastSeen]);

  const actUnread =
    tab !== "activities" &&
    actStamp !== null &&
    actLastSeen !== null &&
    actStamp !== actLastSeen;
  const newsUnread =
    tab !== "news" &&
    newsStamp !== null &&
    newsLastSeen !== null &&
    newsStamp !== newsLastSeen;

  return (
    <div className="bg-panel border border-border rounded-lg p-3 mt-4">
      <div className="flex gap-1 mb-3 border-b border-border pb-2">
        <TabButton
          active={tab === "news"}
          unread={newsUnread}
          onClick={() => setTab("news")}
          label={symbol ? `News · ${symbol}` : "News"}
        />
        <TabButton
          active={tab === "activities"}
          unread={actUnread}
          onClick={() => setTab("activities")}
          label="Activities"
        />
      </div>
      {tab === "news" && <News symbol={symbol} bare />}
      {tab === "activities" && <Activities bare />}
    </div>
  );
}

function TabButton({
  active,
  unread,
  onClick,
  label,
}: {
  active: boolean;
  unread: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-mini${active ? " active" : ""} flex items-center gap-1.5`}
      style={{ opacity: active ? 1 : 0.6 }}
      aria-selected={active}
      role="tab"
    >
      <span>{label}</span>
      {unread && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
          aria-label="unread"
        />
      )}
    </button>
  );
}
