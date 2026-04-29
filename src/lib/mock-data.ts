import type {
  DatasetRecord,
  EvalRecord,
  ExperimentRecord,
  ReleaseRecord,
  TraceRecord,
  TrainingJobRecord,
  WorkflowStage,
  WorkspaceMetric,
} from "@/lib/types";

export const workspaceName = "Can of Soup Labs";
export const activeProject = "Support Specialist v2";

export const workflow: WorkflowStage[] = [
  {
    title: "Trace",
    detail: "Capture production failures and high-friction prompts.",
    status: "124 new traces this week",
  },
  {
    title: "Curate",
    detail: "Turn the best traces into versioned datasets and labels.",
    status: "3 datasets ready for promotion",
  },
  {
    title: "Experiment",
    detail: "Compare prompt, model, and retrieval candidates before training.",
    status: "2 candidates beating baseline",
  },
  {
    title: "Fine-tune",
    detail: "Launch targeted runs only after the data and evals are ready.",
    status: "1 LoRA run auto-resuming",
  },
  {
    title: "Promote",
    detail: "Ship only when quality, latency, and cost gates all pass.",
    status: "1 release waiting for approval",
  },
];

export const metrics: WorkspaceMetric[] = [
  {
    label: "Trace backlog",
    value: "124",
    detail: "17 high-opportunity failures ready for curation",
  },
  {
    label: "Datasets ready",
    value: "5",
    detail: "2 promoted this week from live production traces",
  },
  {
    label: "Experiment win rate",
    value: "66.7%",
    detail: "Measured against the current support baseline",
  },
  {
    label: "Monthly AI spend",
    value: "$3,480",
    detail: "Inference, evals, storage, and fine-tune compute",
  },
];

export const traces: TraceRecord[] = [
  {
    id: "trace_escalation_loop",
    title: "Escalation loop after refund request",
    source: "Support copilot trace",
    status: "Ready for curation",
    severity: "High",
    spanCount: 42,
    opportunity: 94.2,
    capturedAt: "14 minutes ago",
    canPromote: true,
  },
  {
    id: "trace_grounding_gap",
    title: "Missing citation in policy explanation",
    source: "Knowledge assistant trace",
    status: "Triaged",
    severity: "Medium",
    spanCount: 18,
    opportunity: 81.3,
    capturedAt: "1 hour ago",
    canPromote: true,
  },
  {
    id: "trace_tone_regression",
    title: "Overconfident tone on delayed shipment",
    source: "Voice QA transcript",
    status: "Needs labeling",
    severity: "Medium",
    spanCount: 27,
    opportunity: 76.8,
    capturedAt: "Yesterday",
    canPromote: false,
  },
];

export const datasets: DatasetRecord[] = [
  {
    id: "ds_escalations_v8",
    name: "Escalation Recovery",
    version: "v8",
    status: "Ready",
    rows: 248000,
    source: "Production traces + QA labels",
    quality: 97.4,
    lastUpdated: "35 minutes ago",
  },
  {
    id: "ds_grounding_v4",
    name: "Grounded Policy Answers",
    version: "v4",
    status: "Processing",
    rows: 91300,
    source: "Docs crawl + trace extraction",
    quality: 89.7,
    lastUpdated: "12 minutes ago",
  },
  {
    id: "ds_tone_v3",
    name: "Tone Correction Pairs",
    version: "v3",
    status: "Needs review",
    rows: 46200,
    source: "Human preference labels",
    quality: 81.2,
    lastUpdated: "Yesterday",
  },
];

export const jobs: TrainingJobRecord[] = [
  {
    id: "job_lora_escalation",
    name: "LoRA escalation recovery",
    baseModel: "Llama 3.1 8B",
    provider: "RunPod",
    status: "Running",
    progress: 71,
    gpuType: "A100 80GB",
    gpuHours: 15.2,
    checkpoint: "Every 400 steps",
  },
  {
    id: "job_grounding_refresh",
    name: "Grounding refresh",
    baseModel: "Qwen 2.5 7B",
    provider: "Lambda",
    status: "Queued",
    progress: 12,
    gpuType: "H100",
    gpuHours: 1.4,
    checkpoint: "Warm start ready",
  },
  {
    id: "job_tone_patch",
    name: "Tone patch candidate",
    baseModel: "Mistral Nemo",
    provider: "Vast",
    status: "Failed",
    progress: 43,
    gpuType: "A6000",
    gpuHours: 5.6,
    checkpoint: "Recovered at step 880",
  },
  {
    id: "job_export_candidate",
    name: "Export candidate snapshot",
    baseModel: "Llama 3.1 8B",
    provider: "RunPod",
    status: "Completed",
    progress: 100,
    gpuType: "L40S",
    gpuHours: 4.3,
    checkpoint: "Artifacts saved",
  },
];

export const experiments: ExperimentRecord[] = [
  {
    id: "exp_refund_rescue",
    name: "Refund rescue prompt pack",
    goal: "Reduce escalations after refund denial",
    candidateModel: "Llama 3.1 8B + retrieval",
    promptVersion: "support-v2.4",
    status: "Promote",
    score: 88.6,
    cost: 620,
  },
  {
    id: "exp_grounded_policy",
    name: "Grounded policy answerer",
    goal: "Increase citation fidelity on policy questions",
    candidateModel: "Qwen 2.5 7B",
    promptVersion: "policy-v1.9",
    status: "Review",
    score: 81.4,
    cost: 340,
  },
  {
    id: "exp_tone_fix",
    name: "Tone repair baseline",
    goal: "Reduce overconfident answers on delayed shipment issues",
    candidateModel: "Mistral Nemo",
    promptVersion: "tone-v0.8",
    status: "Running",
    score: 74.2,
    cost: 180,
  },
];

export const evals: EvalRecord[] = [
  {
    id: "eval_escalation_bench",
    name: "Escalation benchmark",
    benchmark: "Resolution + empathy",
    score: 88.6,
    delta: 7.8,
    status: "Passing",
    judge: "Hybrid rubric judge",
  },
  {
    id: "eval_groundedness",
    name: "Groundedness sweep",
    benchmark: "Citation fidelity",
    score: 81.4,
    delta: 2.2,
    status: "Watch",
    judge: "LLM judge + spot checks",
  },
  {
    id: "eval_safety",
    name: "Safety regression",
    benchmark: "Policy compliance",
    score: 73.1,
    delta: -4.4,
    status: "Regressed",
    judge: "Preference classifier",
  },
];

export const releases: ReleaseRecord[] = [
  {
    id: "rel_support_v2_4",
    name: "Support Specialist v2.4",
    channel: "Staging",
    status: "Gated",
    qualityGate: "Pass",
    latencyGate: "Pass",
    costGate: "Watch",
    approvedBy: "Waiting on ops",
  },
  {
    id: "rel_policy_v1_9",
    name: "Policy Assistant v1.9",
    channel: "Production",
    status: "Live",
    qualityGate: "Pass",
    latencyGate: "Pass",
    costGate: "Pass",
    approvedBy: "Nadia",
  },
  {
    id: "rel_tone_v0_8",
    name: "Tone Repair v0.8",
    channel: "Canary",
    status: "Approved",
    qualityGate: "Pass",
    latencyGate: "Watch",
    costGate: "Pass",
    approvedBy: "Rehan",
  },
];

export const milestones = [
  "Connect production traces and turn them into curated training slices",
  "Persist traces, experiments, fine-tunes, and releases with Prisma",
  "Add auth, organizations, and plan gating",
  "Attach workers for experiment evals, fine-tunes, and gated promotions",
];

export const reliabilityNotes = [
  "Checkpoint every 400 steps and requeue automatically on provider faults.",
  "Cluster production failures before anyone spends time labeling the wrong cases.",
  "Block release promotion when quality, latency, or cost gates regress.",
];
