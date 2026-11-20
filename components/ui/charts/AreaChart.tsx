"use client";

import { useId } from "react";
import { Area, AreaChart as RAreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AXIS_TICK, CHART_TOOLTIP_PROPS, ChartFrame, toRows, type ChartDatum } from "@/components/ui/charts/ChartFrame";

interface AreaChartProps<T extends ChartDatum> {
  data: ReadonlyArray<T>;
  xKey: keyof T & string;
  /** Numeric field to plot. Convert bigint amounts to display numbers at this UI edge only. */
  yKey: keyof T & string;
  /** Formats y values in the axis and tooltip. */
  formatter?: (value: number) => string;
  xFormatter?: (value: string | number) => string;
  /** Accessible text summary (figcaption). */
  summary: string;
  seriesName?: string;
  height?: number;
  emptyText?: string;
  className?: string;
}

const defaultFormat = (v: number): string => String(v);

export function AreaChart<T extends ChartDatum>({
  data,
  xKey,
  yKey,
  formatter = defaultFormat,
  xFormatter,
  summary,
  seriesName,
  height = 240,
  emptyText,
  className,
}: AreaChartProps<T>): React.ReactElement {
  const gradientId = `area-${useId().replace(/:/g, "")}`;
  return (
    <ChartFrame summary={summary} height={height} empty={data.length === 0} emptyText={emptyText} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={toRows(data)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3ee08f" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#3ee08f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey={xKey as string} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={xFormatter} minTickGap={24} />
          <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatter(v)} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            formatter={(value) => formatter(Number(value))}
            labelFormatter={xFormatter ? (label) => (typeof label === "string" || typeof label === "number" ? xFormatter(label) : label) : undefined}
          />
          <Area
            type="monotone"
            dataKey={yKey as string}
            name={seriesName ?? yKey}
            stroke="#3ee08f"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "#3ee08f", stroke: "#070908", strokeWidth: 2 }}
          />
        </RAreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
