export type DatasetStatus = "Ready" | "Processing" | "Needs review";
export type JobStatus = "Running" | "Queued" | "Failed" | "Completed";
export type EvalStatus = "Passing" | "Watch" | "Regressed";

export type WorkspaceMetric = {
  label: string;
  value: string;
  detail: string;
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
