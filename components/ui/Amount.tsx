import { cx } from "@/components/ui/cx";
import { formatTokenAmount } from "@/lib/format";

interface AmountProps {
  /** A bigint is treated as wei (18 decimals) and formatted bigint-safely; a string is shown as given. */
  value: bigint | string;
  unit?: string;
  maxFractionDigits?: number;
  className?: string;
}

/** Amount with unit in mono tabular figures. Never pass floating point money values. */
export function Amount({ value, unit, maxFractionDigits = 4, className }: AmountProps): React.ReactElement {
  const text = typeof value === "bigint" ? formatTokenAmount(value, maxFractionDigits) : value;
  return (
    <span className={cx("mono num", className)} style={{ whiteSpace: "nowrap" }}>
      {text}
      {unit && <span style={{ color: "var(--text-2)", marginLeft: "0.35em", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>{unit}</span>}
    </span>
  );
}
