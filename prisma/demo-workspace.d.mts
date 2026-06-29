type DemoTraceEvent = {
  title: string;
  source: string;
  inputText: string;
  outputText: string;
  modelName: string;
  latencyMs: number;
  metadata: string;
  tags: string;
  status: string;
  severity: string;
  spanCount: number;
  opportunityScore: number;
  capturedAt: Date;
};

type DemoDataset = {
  name: string;
  version: string;
  source?: string;
  status: string;
  rowCount: number;
  qualityScore: number;
};

type DemoExperiment = {
  name: string;
  goal: string;
  candidateModel: string;
  promptVersion: string;
  status: string;
  score: number;
  costEstimate: number;
};

type DemoTrainingJob = {
  name: string;
  modelBase: string;
  provider: string;
  status: string;
  progress: number;
  gpuType: string;
  gpuHours: number;
  checkpoint: string;
  startedAt?: Date;
  finishedAt?: Date;
};

type DemoEvalRun = {
  name: string;
  benchmark: string;
  status: string;
  score: number;
  delta: number;
  judge: string;
};

type DemoSuspiciousExample = {
  exampleIndex: number;
  confidence: number;
  reason: string;
  category: string;
  impactScore: number;
};

export function buildDemoWorkspaceSeed(input?: {
  workspaceName?: string;
  workspaceSlug?: string;
  projectName?: string;
}): {
  organization: {
    name: string;
    slug: string;
    billingPlan: string;
  };
  project: {
    name: string;
    slug: string;
    description: string;
    status: string;
  };
  traceEvents: DemoTraceEvent[];
  datasets: DemoDataset[];
  experiments: DemoExperiment[];
  trainingJobs: DemoTrainingJob[];
  evalRuns: DemoEvalRun[];
  regression: {
    baseline: {
      name: string;
      benchmark: string;
      status: string;
      score: number;
      judge: string;
      modelId: string;
      runAt: Date;
    };
    candidate: {
      name: string;
      benchmark: string;
      status: string;
      score: number;
      delta: number;
      judge: string;
      modelId: string;
      runAt: Date;
    };
    alert: {
      metric: string;
      baselineScore: number;
      candidateScore: number;
      delta: number;
      severity: string;
      status: string;
      createdAt: Date;
    };
    traReport: {
      confidence: number;
      rootCauseCategory: string;
      summary: string;
      recommendedAction: string;
      estimatedRecovery: number;
      suspiciousExamples: DemoSuspiciousExample[];
    };
  };
  pendingRelease: {
    name: string;
    channel: string;
    status: string;
    qualityGate: string;
    latencyGate: string;
    costGate: string;
    approvedBy: string;
    reviewToken: string;
  };
  activityLogs: Array<{
    type: string;
    message: string;
    metadata: Record<string, unknown>;
    timestamp: Date;
  }>;
};
