"use client";

import type { ReactNode } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import type { DailyCount } from "@/lib/analytics-data";

type TracesChartProps = {
  data: DailyCount[];
  title: string;
};

function formatLabel(day: string) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TracesChart({ data, title }: TracesChartProps) {
  const hasData = data.some((point) => point.count > 0);

  if (!data.length || !hasData) {
    return (
      <div className="chart-empty">
        <p className="eyebrow">{title}</p>
        <p className="muted">No trace data yet</p>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <p className="eyebrow">{title}</p>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <XAxis
              dataKey="day"
              tickFormatter={formatLabel}
              stroke="rgba(102, 88, 76, 0.8)"
            />
            <YAxis stroke="rgba(102, 88, 76, 0.8)" allowDecimals={false} />
            <Tooltip
              formatter={(value: ValueType | undefined, _name: NameType | undefined) => {
                const normalizedValue = Array.isArray(value) ? value[0] : value;
                const count =
                  typeof normalizedValue === "number"
                    ? normalizedValue
                    : Number(normalizedValue ?? 0);

                return [`${count}`, "Traces"];
              }}
              labelFormatter={(label: ReactNode) =>
                formatLabel(typeof label === "string" ? label : String(label ?? ""))
              }
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--accent, #00e5a0)"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
