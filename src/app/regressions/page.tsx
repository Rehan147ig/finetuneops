import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { requireAuthSession } from "@/lib/auth-session";
import { formatPercent } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { analyzeRegressionAction } from "./actions";

export default async function RegressionsPage() {
  const session = await requireAuthSession();

  let alerts: any[] = [];
  try {
    alerts = await prisma.regressionAlert.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: { in: ["open", "investigating"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        traReport: true,
        project: true,
      },
    });
  } catch (e) {
    // Fallback for local dev without database
  }

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Regressions</p>
          <h2>Training Regression Autopilot (TRA)</h2>
        </div>
        <span className="pill">Monitoring enabled</span>
      </div>

      <SectionCard
        title="Active Regressions"
        description="Eval score drops that require investigation."
        action={`${alerts.length} active alerts`}
      >
        {alerts.length === 0 ? (
          <p className="muted">No active regression alerts. Your models are performing well.</p>
        ) : (
          <div className="list">
            {alerts.map((alert) => (
              <article key={alert.id} className="list-item">
                <div className="list-copy">
                  <h3>{alert.project.name} - {alert.metric}</h3>
                  <p className="muted">
                    Detected on {alert.createdAt.toLocaleDateString("en-US")}
                  </p>
                  <div className="list-meta">
                    <span
                      className={
                        alert.severity === "critical"
                          ? "pill danger"
                          : alert.severity === "warning"
                            ? "pill warning"
                            : "pill"
                      }
                    >
                      {alert.severity}
                    </span>
                    <span className="pill">Delta: {alert.delta.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="mini-grid">
                  <div className="value-stack">
                    {alert.traReport ? (
                      <>
                        <strong>{formatPercent(alert.traReport.confidence)} confident</strong>
                        <span className="muted">{alert.traReport.rootCauseCategory}</span>
                      </>
                    ) : (
                      <>
                        <strong>Pending Analysis</strong>
                        <span className="muted">Click analyze to run TRA</span>
                      </>
                    )}
                  </div>
                  
                  <div className="auth-actions">
                    {!alert.traReport && (
                      <ActionForm action={analyzeRegressionAction}>
                        <input name="alertId" type="hidden" value={alert.id} />
                        <ActionSubmitButton
                          idleLabel="Analyze with TRA"
                          pendingLabel="Queuing..."
                        />
                      </ActionForm>
                    )}
                    <Link href={`/regressions/${alert.id}`} className="secondary-button">
                      Open Report
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
