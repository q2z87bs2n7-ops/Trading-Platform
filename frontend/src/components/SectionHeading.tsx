export default function SectionHeading({
  label,
  ctx,
  ctxRight,
}: {
  label: string;
  ctx?: string;
  ctxRight?: React.ReactNode;
}) {
  return (
    <h2
      className="mt-8 mb-3 text-[13px] font-semibold uppercase flex items-center gap-2.5"
      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
    >
      <span>{label}</span>
      {ctx && (
        <span
          className="font-medium text-[12px] normal-case"
          style={{ color: "var(--mute)", letterSpacing: 0 }}
        >
          {ctx}
        </span>
      )}
      {ctxRight && (
        <span
          className="ml-auto font-mono font-medium text-[11.5px] normal-case"
          style={{ color: "var(--mute)", letterSpacing: 0 }}
        >
          {ctxRight}
        </span>
      )}
    </h2>
  );
}
