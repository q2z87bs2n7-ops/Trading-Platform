// Section heading used between Portfolio + Discover surfaces. `size` lets a
// surface promote one heading visually above its siblings (Positions reads as
// the primary block under PortfolioHero; Orders + Activity stay md).
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { fontSize: number; mt: number; mb: number }> = {
  sm: { fontSize: 11.5, mt: 24, mb: 8 },
  md: { fontSize: 13, mt: 32, mb: 12 },
  lg: { fontSize: 17, mt: 32, mb: 14 },
};

export default function SectionHeading({
  label,
  ctx,
  ctxRight,
  size = "md",
}: {
  label: string;
  ctx?: string;
  ctxRight?: React.ReactNode;
  size?: Size;
}) {
  const s = SIZE[size];
  const isLg = size === "lg";
  return (
    <h2
      className="flex items-center gap-2.5 font-semibold"
      style={{
        marginTop: s.mt,
        marginBottom: s.mb,
        fontSize: s.fontSize,
        color: isLg ? "var(--text)" : "var(--text-2)",
        letterSpacing: isLg ? "-0.005em" : "0.04em",
        textTransform: isLg ? "none" : "uppercase",
      }}
    >
      <span>{label}</span>
      {ctx && (
        <span
          className="font-medium normal-case"
          style={{
            fontSize: isLg ? 12.5 : 12,
            color: "var(--mute)",
            letterSpacing: 0,
            textTransform: "none",
          }}
        >
          {ctx}
        </span>
      )}
      {ctxRight && (
        <span
          className="ml-auto font-mono font-medium normal-case"
          style={{
            fontSize: 11.5,
            color: "var(--mute)",
            letterSpacing: 0,
            textTransform: "none",
          }}
        >
          {ctxRight}
        </span>
      )}
    </h2>
  );
}
