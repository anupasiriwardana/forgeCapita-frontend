import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";

interface StatDelta {
  value: string;
  positive: boolean;
}

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: StatDelta;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, unit, delta, hint, icon, loading = false, className }: StatCardProps): React.ReactElement {
  return (
    <div className={cx("stat-card", className)} aria-busy={loading || undefined}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--text-2)" }}>{label}</span>
        {icon && (
          <span aria-hidden="true" style={{ color: "var(--text-3)", display: "inline-flex" }}>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <>
          <Skeleton width="60%" height={26} />
          <span className="sr-only">Loading</span>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: 13, color: "var(--text-2)" }}>{unit}</span>}
          {delta && <DeltaBadge delta={delta} />}
        </div>
      )}
      {hint && <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-2)" }}>{hint}</div>}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: StatDelta }): React.ReactElement {
  const Icon = delta.positive ? TrendingUp : TrendingDown;
  return (
    <span
      className="num"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 500,
        color: delta.positive ? "var(--success)" : "var(--danger)",
      }}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="sr-only">{delta.positive ? "Up" : "Down"}</span>
      {delta.value}
    </span>
  );
}
