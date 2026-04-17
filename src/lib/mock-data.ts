import type {
  DatasetRecord,
  EvalRecord,
  TrainingJobRecord,
  WorkspaceMetric,
} from "@/lib/types";

export const workspaceName = "Can of Soup Labs";
export const activeProject = "Support Specialist v1";

export const metrics: WorkspaceMetric[] = [
  {
    label: "Datasets ready",
    value: "12",
    detail: "2 need review before the next run",
  },
  {
    label: "Training jobs",
    value: "4 active",
    detail: "1 queued, 1 auto-recovering after checkpoint restore",
  },
  {
    label: "Eval win rate",
    value: "83.4%",
    detail: "Measured across support and factuality benchmarks",
  },
  {
    label: "Monthly spend",
    value: "$3,480",
    detail: "Tracking compute, storage, and dataset processing",
  },
];

export const datasets: DatasetRecord[] = [
  {
    id: "ds_support_v7",
    name: "Support Conversations",
    version: "v7",
    status: "Ready",
    rows: 1245000,
    source: "Zendesk + QA labels",
    quality: 96.1,
    lastUpdated: "2 hours ago",
  },
  {
    id: "ds_knowledge_v3",
    name: "Knowledge Base Distill",
    version: "v3",
    status: "Processing",
    rows: 387400,
    source: "Docs crawl + parser cleanup",
    quality: 88.4,
    lastUpdated: "18 minutes ago",
  },
  {
    id: "ds_safety_v2",
    name: "Safety Preference Pairs",
    version: "v2",
    status: "Needs review",
    rows: 84200,
    source: "Human preference labels",
    quality: 79.8,
    lastUpdated: "Yesterday",
  },
];

export const jobs: TrainingJobRecord[] = [
  {
    id: "job_lora_support",
    name: "LoRA support specialist",
    baseModel: "Llama 3.1 8B",
    provider: "RunPod",
    status: "Running",
    progress: 64,
    gpuType: "A100 80GB",
    gpuHours: 18.6,
    checkpoint: "Every 400 steps",
  },
  {
    id: "job_dpo_guardrails",
    name: "DPO guardrails refresh",
    baseModel: "Mistral Nemo",
    provider: "Lambda",
    status: "Queued",
    progress: 8,
    gpuType: "H100",
    gpuHours: 2.1,
    checkpoint: "Warm start ready",
  },
  {
    id: "job_reranker_v4",
    name: "Reranker v4",
    baseModel: "Qwen 2.5 7B",
    provider: "Vast",
    status: "Failed",
    progress: 41,
    gpuType: "A6000",
    gpuHours: 6.8,
    checkpoint: "Recovered at step 920",
  },
  {
    id: "job_eval_candidate",
    name: "Eval candidate export",
    baseModel: "Llama 3.1 8B",
    provider: "RunPod",
    status: "Completed",
    progress: 100,
    gpuType: "L40S",
    gpuHours: 4.3,
    checkpoint: "Artifacts saved",
  },
];

export const evals: EvalRecord[] = [
  {
    id: "eval_support_bench",
    name: "Support benchmark",
    benchmark: "Resolution + tone",
    score: 84.7,
    delta: 6.4,
    status: "Passing",
    judge: "Hybrid rubric judge",
  },
  {
    id: "eval_groundedness",
    name: "Groundedness sweep",
    benchmark: "Citation fidelity",
    score: 78.9,
    delta: -1.3,
    status: "Watch",
    judge: "LLM judge + spot checks",
  },
  {
    id: "eval_safety",
    name: "Safety regression",
    benchmark: "Policy compliance",
    score: 71.2,
    delta: -8.8,
    status: "Regressed",
    judge: "Preference classifier",
  },
];

export const milestones = [
  "Connect object storage and signed uploads",
  "Persist datasets, jobs, and evals with Prisma",
  "Add auth, organizations, and plan gating",
  "Attach workers for fine-tuning and eval execution",
];

export const reliabilityNotes = [
  "Checkpoint every 400 steps and requeue automatically on provider faults.",
  "Surface bad instance fingerprints so teams stop wasting GPU spend on busted nodes.",
  "Track eval regressions before model exports become production endpoints.",
];
