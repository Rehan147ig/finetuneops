"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import type { CostDataPoint } from "@/lib/analytics-data";

type CostChartProps = {
  data: CostDataPoint[];
  title: string;
};

export function CostChart({ data, title }: CostChartProps) {
  const hasData = data.some((point) => point.totalCost > 0 || point.wastedCost > 0);

  if (!data.length || !hasData) {
    return (
      <div className="chart-empty">
        <p className="eyebrow">{title}</p>
        <p className="muted">No cost data yet</p>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <p className="eyebrow">{title}</p>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="model" stroke="rgba(102, 88, 76, 0.8)" />
            <YAxis stroke="rgba(102, 88, 76, 0.8)" />
            <Tooltip
              formatter={(value: ValueType | undefined, _name: NameType | undefined) => {
                const normalizedValue = Array.isArray(value) ? value[0] : value;
                const amount =
                  typeof normalizedValue === "number"
                    ? normalizedValue
                    : Number(normalizedValue ?? 0);

                return [`$${amount.toFixed(2)}`, "Cost"];
              }}
            />
            <Bar dataKey="totalCost" fill="var(--accent, #00e5a0)" radius={[8, 8, 0, 0]} />
            <Bar dataKey="wastedCost" fill="#8a2f2f" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
