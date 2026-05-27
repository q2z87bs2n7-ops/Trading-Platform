import { forwardRef, useState } from "react";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visually emphasized state — used by SettingsMenu when its dropdown is open. */
  active?: boolean;
  children: React.ReactNode;
}

/**
 * Shared chrome for the header utility buttons (Ask pill, theme toggle,
 * settings gear). Panel-fill + shadow-sm so they read as real surfaces on
 * Windows displays where the previous transparent + 1px-border treatment
 * subpixel-rendered unevenly.
 */
const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { active, children, className = "", style, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false);
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      onMouseEnter={(e) => {
        setHover(true);
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        rest.onMouseLeave?.(e);
      }}
      className={`inline-flex items-center gap-2 rounded-card border cursor-pointer transition-colors ${className}`}
      style={{
        background: active || hover ? "var(--panel-2)" : "transparent",
        borderColor: active || hover ? "var(--border)" : "transparent",
        boxShadow: "none",
        color: active ? "var(--accent)" : hover ? "var(--text)" : "var(--text-2)",
        ...style,
      }}
    >
      {children}
    </button>
  );
});

export default IconButton;
