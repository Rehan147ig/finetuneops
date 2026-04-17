import type { WorkspaceMetric } from "@/lib/types";

type MetricCardProps = {
  metric: WorkspaceMetric;
};

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="panel metric-card">
      <p className="eyebrow">{metric.label}</p>
      <h3>{metric.value}</h3>
      <p className="muted">{metric.detail}</p>
    </article>
  );
}
