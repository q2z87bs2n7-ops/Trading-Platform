import { useCalendar } from "../data/hooks";

// Local YYYY-MM-DD (Alpaca calendar dates are calendar days, not instants;
// using the local date avoids a UTC off-by-one near midnight).
function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Returns every Mon–Fri date string in [start, end] inclusive.
function weekdaysBetween(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  while (ymd(cur) <= ymd(end)) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const today = new Date();
const horizon = new Date(today);
horizon.setDate(horizon.getDate() + 21);
const START = ymd(today);
const END = ymd(horizon);

const label = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export default function Calendar() {
  const { data, error, isPending } = useCalendar(START, END);
  const days = data?.calendar;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Trading Calendar
      </h2>
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && (
        <div className="text-xs text-muted">Loading…</div>
      )}
      {days && (() => {
        const tradingMap = new Map(days.map((d) => [d.date, d]));
        const exceptions = weekdaysBetween(today, horizon).flatMap((date) => {
          const td = tradingMap.get(date);
          if (!td) return [{ date, closed: true, open: "", close: "" }];
          if (!td.open.endsWith("09:30:00") || !td.close.endsWith("16:00:00"))
            return [{ date, closed: false, open: td.open, close: td.close }];
          return [];
        });

        if (exceptions.length === 0)
          return (
            <div className="text-xs text-muted">
              No exceptions — standard hours all week
            </div>
          );

        return exceptions.map((ex) => (
          <div className="flex justify-between py-1 text-[13px]" key={ex.date}>
            <span className={ex.date === START ? "text-accent" : "text-muted"}>
              {label(ex.date)}
            </span>
            {ex.closed ? (
              <span className="text-xs text-muted italic">Market Closed</span>
            ) : (
              <span className="tabular-nums">{ex.open}–{ex.close}</span>
            )}
          </div>
        ));
      })()}
    </div>
  );
}
