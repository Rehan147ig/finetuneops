declare module "../../prisma/demo-workspace.mjs" {
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
    traceEvents: Record<string, unknown>[];
    datasets: Record<string, unknown>[];
    experiments: Record<string, unknown>[];
    trainingJobs: Record<string, unknown>[];
    evalRuns: Record<string, unknown>[];
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
        suspiciousExamples: Array<{
          exampleIndex: number;
          confidence: number;
          reason: string;
          category: string;
          impactScore: number;
        }>;
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
}
