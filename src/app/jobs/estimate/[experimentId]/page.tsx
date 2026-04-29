import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { SectionCard } from "@/components/dashboard/section-card";
import { estimateFineTuneCost, isSupportedModelId } from "@/lib/cost-estimator";
import { formatCurrencyDetailed, formatNumber, formatPercent } from "@/lib/format";
import { launchFineTuneFromExperimentAction } from "@/app/jobs/actions";
import { prisma } from "@/lib/prisma";

type EstimatePageProps = {
  params: Promise<{
    experimentId: string;
  }>;
};

export default async function FineTuneEstimatePage({ params }: EstimatePageProps) {
  const { experimentId } = await params;
  const experiment = await prisma.experimentRun.findUnique({
    where: {
      id: experimentId,
    },
    include: {
      dataset: true,
    },
  });

  if (!experiment || !experiment.dataset || !isSupportedModelId(experiment.candidateModel)) {
    notFound();
  }

  const estimate = estimateFineTuneCost({
    datasetSize: experiment.dataset.rowCount,
    model: experiment.candidateModel,
    estimatedEpochs: 3,
    datasetQuality: experiment.dataset.qualityScore ?? 0,
  });

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fine-tune estimate</p>
          <h2>Review cost and dataset quality before launching.</h2>
        </div>
        <span className={estimate.blockedWithoutConfirmation ? "pill warning" : "pill success"}>
          {estimate.blockedWithoutConfirmation ? "High-cost confirmation required" : "Ready to launch"}
        </span>
      </div>

      <SectionCard
        title="Run estimate"
        description="Use this screen to decide whether the run is worth the spend right now."
        action={experiment.name}
      >
        <div className="estimate-grid">
          <div className="estimate-summary panel">
            <div className="estimate-row">
              <span>Dataset size</span>
              <strong>{formatNumber(estimate.datasetSize)} examples</strong>
            </div>
            <div className="estimate-row">
              <span>Model</span>
              <strong>{estimate.model}</strong>
            </div>
            <div className="estimate-row">
              <span>Estimated epochs</span>
              <strong>{estimate.estimatedEpochs}</strong>
            </div>
            <div className="estimate-row">
              <span>Estimated cost</span>
              <strong>{formatCurrencyDetailed(estimate.estimatedCost)}</strong>
            </div>
            <div className="estimate-row">
              <span>Low quality traces</span>
              <strong>~{estimate.lowQualityTraceRate}%</strong>
            </div>
            <div className="estimate-row">
              <span>Recommended action</span>
              <strong>{estimate.recommendedAction}</strong>
            </div>
            <div className="estimate-row">
              <span>Potential savings</span>
              <strong>{formatCurrencyDetailed(estimate.potentialSavings)}</strong>
            </div>
          </div>

          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Dataset quality</p>
              <h3>{formatPercent(experiment.dataset.qualityScore ?? 0)} quality score</h3>
              <p className="muted">
                Lower-quality traces increase the odds of paying for a run that does not
                improve evals enough to justify the spend.
              </p>
            </article>

            {estimate.blockedWithoutConfirmation ? (
              <article className="panel mini-card warning-card">
                <p className="eyebrow">Manual confirmation</p>
                <h3>This run is above the $50 protection threshold.</h3>
                <p className="muted">
                  Confirm the spend explicitly if you still want to queue the run.
                </p>
              </article>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Launch decision"
        description="Customers pay for convenience, but they stay for guardrails."
        action="Protected action"
      >
        <ActionForm action={launchFineTuneFromExperimentAction} className="page-grid">
          <input name="experimentId" type="hidden" value={experiment.id} />
          {!estimate.blockedWithoutConfirmation ? (
            <input name="confirmHighCost" type="hidden" value="true" />
          ) : null}

          {estimate.blockedWithoutConfirmation ? (
            <label className="confirmation-check">
              <input
                name="confirmHighCost"
                type="checkbox"
                value="true"
              />
              <span>
                I understand this run is estimated at {formatCurrencyDetailed(estimate.estimatedCost)}
                {" "}
                and still want to proceed.
              </span>
            </label>
          ) : null}

          <div className="estimate-actions">
            <ActionSubmitButton
              idleLabel="Proceed anyway"
              pendingLabel="Queueing fine-tune..."
            />
            <Link href="/datasets" className="secondary-button">
              Clean dataset first
            </Link>
          </div>
        </ActionForm>
      </SectionCard>
    </div>
  );
}
