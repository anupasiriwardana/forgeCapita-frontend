"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_PALETTE, CHART_TOOLTIP_PROPS, ChartFrame } from "@/components/ui/charts/ChartFrame";

export interface DonutSlice {
  name: string;
  /** Display number (convert bigint at the UI edge). */
  value: number;
}

interface DonutChartProps {
  data: ReadonlyArray<DonutSlice>;
  summary: string;
  centerLabel?: string;
  centerValue?: string;
  formatter?: (value: number) => string;
  height?: number;
  emptyText?: string;
  className?: string;
}

const defaultFormat = (v: number): string => String(v);

export function DonutChart({
  data,
  summary,
  centerLabel,
  centerValue,
  formatter = defaultFormat,
  height = 220,
  emptyText,
  className,
}: DonutChartProps): React.ReactElement {
  const empty = data.length === 0 || data.every((d) => d.value <= 0);
  return (
    <ChartFrame summary={summary} height={height} empty={empty} emptyText={emptyText} className={className}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...CHART_TOOLTIP_PROPS} formatter={(value) => formatter(Number(value))} />
            <Pie
              data={[...data]}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((slice, i) => (
                <Cell key={slice.name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {centerValue && (
              <span className="num" style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>
                {centerValue}
              </span>
            )}
            {centerLabel && <span style={{ fontSize: 12, color: "var(--text-2)" }}>{centerLabel}</span>}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
