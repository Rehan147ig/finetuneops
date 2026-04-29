import { CostChart } from "@/components/analytics/cost-chart";
import { DateRangeSelector } from "@/components/analytics/date-range-selector";
import { TracesChart } from "@/components/analytics/traces-chart";
import { SectionCard } from "@/components/dashboard/section-card";
import { requireAuthSession } from "@/lib/auth-session";
import {
  getAnalyticsSummary,
  getCostAnalytics,
  getEvalTrends,
  getModelBreakdown,
  getTeamActivity,
  getTracesPerDay,
} from "@/lib/analytics-data";

type AnalyticsPageProps = {
  searchParams?: Promise<{
    range?: string;
  }>;
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function parseRange(value?: string): 7 | 30 | 90 {
  if (value === "7d") {
    return 7;
  }

  if (value === "90d") {
    return 90;
  }

  return 30;
}

function selectedRangeLabel(value?: string): "7d" | "30d" | "90d" {
  if (value === "7d" || value === "90d") {
    return value;
  }

  return "30d";
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await requireAuthSession();
  const params = (await searchParams) ?? {};
  const selectedRange = selectedRangeLabel(params.range);
  const rangeDays = parseRange(params.range);

  const [summary, tracesPerDay, modelBreakdown, costAnalytics, evalTrends, teamActivity] =
    await Promise.all([
      getAnalyticsSummary(session.user.organizationId),
      getTracesPerDay(session.user.organizationId, rangeDays),
      getModelBreakdown(session.user.organizationId, rangeDays),
      getCostAnalytics(session.user.organizationId, rangeDays),
      getEvalTrends(session.user.organizationId),
      getTeamActivity(session.user.organizationId, 7),
    ]);

  const totalModelTraces = modelBreakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Understand how your team uses the platform</h2>
        </div>
        <DateRangeSelector selectedRange={selectedRange} />
      </div>

      <section className="metric-grid">
        <article className="panel metric-card">
          <p className="eyebrow">Total traces captured</p>
          <h3>{formatNumber(summary.tracesTotal)}</h3>
          <p className="muted">{formatNumber(summary.tracesLast24h)} in the last 24 hours</p>
        </article>
        <article className="panel metric-card">
          <p className="eyebrow">Error rate last 7 days</p>
          <h3>{formatPercent(summary.errorRateLast7d)}</h3>
          <p className="muted">{formatNumber(summary.tracesLast7d)} traces observed</p>
        </article>
        <article className="panel metric-card">
          <p className="eyebrow">Fine-tunes completed</p>
          <h3>{formatNumber(summary.finetunesSucceeded)}</h3>
          <p className="muted">{formatNumber(summary.finetunesTotal)} total fine-tune jobs</p>
        </article>
        <article className="panel metric-card">
          <p className="eyebrow">Average dataset health score</p>
          <h3>{summary.avgDatasetHealthScore.toFixed(1)}</h3>
          <p className="muted">{formatNumber(summary.datasetsTotal)} datasets tracked</p>
        </article>
      </section>

      <SectionCard
        title="Traces over time"
        description={`Traces captured per day (last ${rangeDays} days)`}
        action={`${rangeDays} day range`}
      >
        <TracesChart
          data={tracesPerDay}
          title={`Traces captured per day (last ${rangeDays} days)`}
        />
      </SectionCard>

      <SectionCard
        title="Model breakdown"
        description="See which models generate the most traffic and where failure risk clusters."
        action={`${modelBreakdown.length} models`}
      >
        {modelBreakdown.length === 0 ? (
          <p className="muted">No model usage has been captured in this range yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Traces</th>
                <th>Error Rate</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {modelBreakdown.map((item) => (
                <tr key={item.model}>
                  <td>{item.model}</td>
                  <td>{formatNumber(item.count)}</td>
                  <td>{formatPercent(item.errorRate)}</td>
                  <td>
                    {totalModelTraces === 0
                      ? "0.0%"
                      : formatPercent(item.count / totalModelTraces)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard
        title="Cost analytics"
        description="Estimated spend and wasted spend by base model for the selected range."
        action={`${costAnalytics.length} models`}
      >
        <CostChart data={costAnalytics} title="Estimated cost by model" />
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Estimated cost</th>
              <th>Wasted cost</th>
            </tr>
          </thead>
          <tbody>
            {costAnalytics.map((item) => (
              <tr key={item.model}>
                <td>{item.model}</td>
                <td>{formatCurrency(item.totalCost)}</td>
                <td>{formatCurrency(item.wastedCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Cost estimates based on dataset sizes. Actual token costs available after
          connecting provider credentials.
        </p>
      </SectionCard>

      <SectionCard
        title="Eval score trends"
        description="Track completed fine-tune jobs and the metrics they produced."
        action={`${evalTrends.length} completed jobs`}
      >
        {evalTrends.length === 0 ? (
          <p className="muted">
            No completed fine-tune jobs yet. Launch a fine-tune to see results here.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job name</th>
                <th>Model</th>
                <th>Quality score</th>
                <th>Trained tokens</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {evalTrends.map((trend) => (
                <tr key={`${trend.version}-${trend.releasedAt}`}>
                  <td>{trend.version}</td>
                  <td>{trend.model ?? "Unknown"}</td>
                  <td>{trend.qualityScore}</td>
                  <td>{formatNumber(trend.trainedTokens ?? 0)}</td>
                  <td>{new Date(trend.releasedAt).toLocaleDateString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard
        title="Team activity"
        description="Who is creating traces, curating datasets, and shipping releases this week."
        action="Last 7 days"
      >
        {teamActivity.length === 0 ? (
          <p className="muted">No team activity has been recorded yet.</p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Traces</th>
                  <th>Datasets</th>
                  <th>Releases</th>
                </tr>
              </thead>
              <tbody>
                {teamActivity.map((member) => (
                  <tr key={member.userId}>
                    <td>{member.userName}</td>
                    <td>{member.tracesCreated}</td>
                    <td>{member.datasetsCreated}</td>
                    <td>{member.releasesShipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {teamActivity.length === 1 ? (
              <p className="muted">
                You are the only active teammate right now. Invite your team to
                compare experiments and ship releases together.
              </p>
            ) : null}
          </>
        )}
      </SectionCard>
    </div>
  );
}
