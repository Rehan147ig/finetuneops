export type DatasetStatus = "Ready" | "Processing" | "Needs review";
export type JobStatus = "Running" | "Queued" | "Failed" | "Completed";
export type EvalStatus = "Passing" | "Watch" | "Regressed";
export type TraceStatus = "Triaged" | "Ready for curation" | "Needs labeling";
export type ExperimentStatus = "Running" | "Review" | "Promote";
export type ReleaseStatus = "Gated" | "Approved" | "Live";

export type WorkspaceMetric = {
  label: string;
  value: string;
  detail: string;
};

export type WorkspaceSummary = {
  organizationName: string;
  billingPlan: string;
  projectCount: number;
  memberCount: number;
  activeProjectStatus: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  kind: "trace" | "dataset" | "experiment" | "job" | "release";
  at: string;
};

export type ActivityEventType =
  | "trace_captured"
  | "trace_promoted"
  | "dataset_created"
  | "dataset_scored"
  | "prompt_template_created"
  | "prompt_version_created"
  | "prompt_version_deployed"
  | "experiment_started"
  | "fine_tune_launched"
  | "fine_tune_completed"
  | "fine_tune_failed"
  | "release_approved"
  | "release_rejected"
  | "background_job_completed"
  | "trial_ending_soon"
  | "subscription_cancelled";

export type ActivityLogMetadata = Record<string, string | number | boolean | null>;

export type ActivityLogEntry = {
  id: string;
  type: ActivityEventType;
  message: string;
  timestamp: string;
  userId: string;
  metadata: ActivityLogMetadata;
};

export type WorkflowStage = {
  title: string;
  detail: string;
  status: string;
};

export type TraceRecord = {
  id: string;
  title: string;
  source: string;
  status: TraceStatus;
  severity: "High" | "Medium" | "Low";
  spanCount: number;
  opportunity: number;
  capturedAt: string;
  canPromote: boolean;
  convertedDatasetId?: string;
};

export type DatasetRecord = {
  id: string;
  name: string;
  version: string;
  status: DatasetStatus;
  rows: number;
  source: string;
  quality: number;
  lastUpdated: string;
  experimentCount?: number;
  qualityHealthScore?: number;
  qualityRecommendation?: string;
};

export type TrainingJobRecord = {
  id: string;
  name: string;
  baseModel: string;
  provider: string;
  status: JobStatus;
  progress: number;
  gpuType: string;
  gpuHours: number;
  checkpoint: string;
  experimentName?: string;
  datasetName?: string;
  openaiJobId?: string;
  pollCount?: number;
  progressNote?: string;
  completedModelId?: string;
};

export type BackgroundJobStatus = "Queued" | "Running" | "Completed" | "Failed";

export type BackgroundJobRecord = {
  id: string;
  queueName: string;
  jobType: string;
  status: BackgroundJobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  estimatedCompletion?: string;
  logs: string[];
  createdAt: string;
};

export type ExperimentRecord = {
  id: string;
  name: string;
  goal: string;
  candidateModel: string;
  promptVersion: string;
  status: ExperimentStatus;
  score: number;
  cost: number;
  ageHours?: number;
  canLaunchFineTune?: boolean;
  linkedJobCount?: number;
  datasetName?: string;
};

export type EvalRecord = {
  id: string;
  name: string;
  benchmark: string;
  score: number;
  delta: number;
  status: EvalStatus;
  judge: string;
};

export type ReleaseRecord = {
  id: string;
  name: string;
  channel: string;
  status: ReleaseStatus;
  qualityGate: string;
  latencyGate: string;
  costGate: string;
  approvedBy: string;
  ageHours?: number;
  reviewLinkToken?: string;
  reviewLinkStatus?: "active" | "expired" | "decided";
};
