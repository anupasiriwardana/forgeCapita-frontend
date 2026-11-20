import { cx } from "@/components/ui/cx";

interface SpinnerProps {
  size?: number;
  /** Accessible label; omit when the surrounding element already announces the busy state. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className }: SpinnerProps): React.ReactElement {
  return (
    <span
      className={cx("spinner", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}
