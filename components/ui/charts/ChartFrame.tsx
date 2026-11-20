import type { CSSProperties, ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface ChartFrameProps {
  /** Text summary of what the chart shows; rendered as the figcaption (visually hidden unless showCaption). */
  summary: string;
  showCaption?: boolean;
  height: number;
  empty: boolean;
  emptyText?: string;
  className?: string;
  children: ReactNode;
}

/** figure + figcaption wrapper with a fixed-height plot area and an empty state; charts never show fake data. */
export function ChartFrame({ summary, showCaption = false, height, empty, emptyText = "No data yet.", className, children }: ChartFrameProps): React.ReactElement {
  const plot: CSSProperties = { width: "100%", height };
  return (
    <figure className={className} style={{ margin: 0 }}>
      {empty ? (
        <div style={{ ...plot, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState icon={<BarChart3 size={20} />} title="No data" text={emptyText} />
        </div>
      ) : (
        <div style={plot} aria-hidden="true">
          {children}
        </div>
      )}
      <figcaption className={showCaption ? undefined : "sr-only"} style={showCaption ? { marginTop: 8, fontSize: 12, color: "var(--text-2)" } : undefined}>
        {summary}
      </figcaption>
    </figure>
  );
}

/** One chart row: display values only (bigint amounts are converted at this UI edge). */
export type ChartDatum = Record<string, string | number>;

/** Copy typed rows into the string-indexed shape recharts expects for string data keys. */
export function toRows<T extends ChartDatum>(data: ReadonlyArray<T>): ChartDatum[] {
  return data.map((row): ChartDatum => ({ ...row }));
}

export const CHART_AXIS_TICK = { fill: "var(--text-3)", fontSize: 11 } as const;

export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    color: "var(--text)",
  },
  labelStyle: { color: "var(--text-2)", marginBottom: 4 },
  itemStyle: { color: "var(--text)" },
} as const;

/** Grey ramp used after the accent in categorical charts. */
export const CHART_PALETTE: readonly string[] = ["#3ee08f", "#a3ada9", "#6b7672", "#3c4542", "#22c57a", "#d3dad7"];
