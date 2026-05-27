// Full-screen gate. Two modes:
//  - graceful (default): the status poll keeps running underneath, so when the
//    maintenance flag is flipped off the app returns on its own (no reload).
//  - terminal (`terminal` prop, the force_stop boot): the caller has stopped all
//    polling, so this page is inert — it never reconnects on its own and the
//    user must reload the browser to return.
export default function MaintenancePage({
  message,
  terminal = false,
}: {
  message?: string;
  terminal?: boolean;
}) {
  return (
    <div
      className="min-h-[100dvh] grid place-items-center px-6 text-center"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="max-w-[420px] flex flex-col items-center gap-4">
        <div
          className="w-12 h-12 rounded-full grid place-items-center text-[22px]"
          style={{ background: "var(--panel-2)" }}
          aria-hidden
        >
          {terminal ? "🔌" : "🛠️"}
        </div>
        <h1 className="text-[20px] font-semibold">
          {terminal ? "Session ended" : "Temporarily offline"}
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--mute)" }}>
          {message?.trim()
            ? message
            : terminal
              ? "This session has been disconnected."
              : "We're doing some maintenance and will be back shortly."}
        </p>
        <p className="text-[12px]" style={{ color: "var(--mute)" }}>
          {terminal
            ? "Refresh your browser to reconnect."
            : "This page will reconnect automatically."}
        </p>
      </div>
    </div>
  );
}
