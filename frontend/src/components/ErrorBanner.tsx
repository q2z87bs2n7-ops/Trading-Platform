// Replaces the "red 13px text" error treatment used everywhere with a
// proper banner: --neg-bg fill, 2px --neg left-border, body-color
// message, red dot for instant signal at the start of the line.

export default function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 text-[13px] rounded text-text"
      style={{
        backgroundColor: "var(--neg-bg)",
        borderLeft: "2px solid var(--neg)",
      }}
      role="alert"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: "var(--neg)" }}
        aria-hidden
      />
      <span>{message}</span>
    </div>
  );
}
