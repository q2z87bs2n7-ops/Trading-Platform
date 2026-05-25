import { setEngine, useEngine, type WsEngine } from "./engine";

// Segmented Dockview|Golden switch shown in both Workspace toolbars so the
// engine can be flipped from either canvas while evaluating the prototype.
const OPTIONS: { id: WsEngine; label: string }[] = [
  { id: "dockview", label: "Dockview" },
  { id: "golden", label: "Golden" },
];

export default function EngineToggle() {
  const engine = useEngine();
  return (
    <div
      className="inline-flex items-center"
      title="Layout engine (prototype A/B)"
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {OPTIONS.map((o) => {
        const active = engine === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setEngine(o.id)}
            className="text-[11px] cursor-pointer rounded-full"
            style={{
              padding: "3px 9px",
              border: "1px solid transparent",
              background: active ? "var(--panel)" : "transparent",
              color: active ? "var(--text)" : "var(--text-2)",
              fontWeight: active ? 600 : 500,
              boxShadow: active ? "0 1px 2px rgba(20,22,28,0.10)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
