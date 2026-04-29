import type {
  EvalRecord,
  ExperimentRecord,
  ReleaseRecord,
  TraceRecord,
  TrainingJobRecord,
} from "@/lib/types";

export type WorkspaceNudge = {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  actionLabel: string;
  href: string;
};

type NudgeInput = {
  traces: TraceRecord[];
  experiments: ExperimentRecord[];
  jobs: TrainingJobRecord[];
  evals: EvalRecord[];
  releases: ReleaseRecord[];
};

export function buildWorkspaceNudges(input: NudgeInput): WorkspaceNudge[] {
  const nudges: WorkspaceNudge[] = [];

  const promotableTraces = input.traces.filter((trace) => trace.canPromote);
  if (promotableTraces.length >= 2) {
    nudges.push({
      id: "promote-traces",
      message: `You have ${promotableTraces.length} similar failed traces ready to promote into a dataset.`,
      severity: "info",
      actionLabel: "Review traces",
      href: "/traces",
    });
  }

  const staleExperiment = input.experiments.find((experiment) => {
    return experiment.status === "Running" && (experiment.ageHours ?? 0) >= 120;
  });

  if (staleExperiment) {
    nudges.push({
      id: "stale-experiment",
      message: `${staleExperiment.name} has been running for ${Math.round((staleExperiment.ageHours ?? 0) / 24)} days with no action. Review it before more work piles up.`,
      severity: "warning",
      actionLabel: "Review experiment",
      href: "/experiments",
    });
  }

  const latestExpensiveJob = input.jobs.find((job) => job.gpuHours * 110 >= 10);
  const regressedEval = input.evals.find((evalRun) => evalRun.status === "Regressed");
  if (latestExpensiveJob && regressedEval) {
    nudges.push({
      id: "expensive-regression",
      message: `Your last fine-tune spent about $${(latestExpensiveJob.gpuHours * 110).toFixed(0)} but ${regressedEval.name} regressed. Check dataset quality before the next run.`,
      severity: "critical",
      actionLabel: "Inspect fine-tunes",
      href: "/jobs",
    });
  }

  const pendingReleases = input.releases.filter((release) => {
    return release.status === "Gated" && (release.ageHours ?? 0) >= 48;
  });

  if (pendingReleases.length >= 1) {
    nudges.push({
      id: "pending-reviews",
      message: `${pendingReleases.length} release${pendingReleases.length > 1 ? "s" : ""} have been waiting more than 48 hours. Share review links and unblock them.`,
      severity: "warning",
      actionLabel: "Open releases",
      href: "/releases",
    });
  }

  return nudges;
}
