import { useCalendar } from "../data/hooks";

// Local YYYY-MM-DD (Alpaca calendar dates are calendar days, not instants;
// using the local date avoids a UTC off-by-one near midnight).
function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">
        Trading Calendar
      </h2>
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && (
        <div className="text-xs text-muted">Loading…</div>
      )}
      {days && days.length === 0 && (
        <div className="text-xs text-muted">No upcoming sessions</div>
      )}
      {days &&
        days.map((d) => (
          <div
            className="flex justify-between py-1.5 text-sm"
            key={d.date}
          >
            <span
              className={
                d.date === START ? "text-green" : "text-muted"
              }
            >
              {label(d.date)}
            </span>
            <span className="tabular-nums">
              {d.open}–{d.close}
            </span>
          </div>
        ))}
    </div>
  );
}
