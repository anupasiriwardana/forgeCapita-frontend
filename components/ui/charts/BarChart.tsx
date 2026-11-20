"use client";

import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AXIS_TICK, CHART_TOOLTIP_PROPS, ChartFrame, toRows, type ChartDatum } from "@/components/ui/charts/ChartFrame";

interface BarChartProps<T extends ChartDatum> {
  data: ReadonlyArray<T>;
  xKey: keyof T & string;
  /** Numeric field to plot. Convert bigint amounts to display numbers at this UI edge only. */
  yKey: keyof T & string;
  formatter?: (value: number) => string;
  summary: string;
  seriesName?: string;
  height?: number;
  emptyText?: string;
  className?: string;
}

const defaultFormat = (v: number): string => String(v);

export function BarChart<T extends ChartDatum>({
  data,
  xKey,
  yKey,
  formatter = defaultFormat,
  summary,
  seriesName,
  height = 240,
  emptyText,
  className,
}: BarChartProps<T>): React.ReactElement {
  return (
    <ChartFrame summary={summary} height={height} empty={data.length === 0} emptyText={emptyText} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={toRows(data)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey={xKey as string} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatter(v)} />
          <Tooltip {...CHART_TOOLTIP_PROPS} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(value) => formatter(Number(value))} />
          <Bar dataKey={yKey as string} name={seriesName ?? yKey} fill="#3ee08f" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </RBarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
