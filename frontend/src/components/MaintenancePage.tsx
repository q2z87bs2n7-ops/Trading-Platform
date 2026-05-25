// Full-screen graceful gate shown while the maintenance switch is on. The app's
// status poll keeps running underneath (App still mounts useAppStatus), so when
// the flag is flipped off the app returns on its own — no manual reload.
export default function MaintenancePage({ message }: { message?: string }) {
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
          🛠️
        </div>
        <h1 className="text-[20px] font-semibold">Temporarily offline</h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--mute)" }}>
          {message?.trim()
            ? message
            : "We're doing some maintenance and will be back shortly."}
        </p>
        <p className="text-[12px]" style={{ color: "var(--mute)" }}>
          This page will reconnect automatically.
        </p>
      </div>
    </div>
  );
}
