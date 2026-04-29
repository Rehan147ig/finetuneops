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
