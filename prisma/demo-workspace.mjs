const failureTraceScenarios = [
  ["Refund policy confused with cancellation policy", "Support copilot", "gpt-4o-mini", 1980],
  ["Invoice dispute answer skipped tax guidance", "Billing assistant", "gpt-4o", 1420],
  ["Delayed shipment answer promised impossible SLA", "Voice QA replay", "claude-3-sonnet", 2310],
  ["Warranty exception routed to the wrong region", "Support copilot", "gpt-4o-mini", 1870],
  ["Order edit flow hallucinated a nonexistent button", "Agent assist", "llama-3-8b", 1160],
  ["Enterprise plan quote omitted SOC 2 details", "Sales copilot", "claude-3-sonnet", 1640],
  ["Chargeback response contradicted finance runbook", "Billing assistant", "gpt-4o", 2050],
  ["Escalation loop after refund denial", "Support copilot", "gpt-4o-mini", 2480],
  ["Onboarding bot skipped role-based setup steps", "Customer onboarding bot", "gpt-4o-mini", 1330],
  ["API quota answer used stale documentation", "Knowledge assistant", "claude-3-sonnet", 1750],
  ["Cancellation grace period explained incorrectly", "Support copilot", "gpt-4o", 1885],
  ["Security FAQ answer exposed internal-only policy", "Security support assistant", "gpt-4o", 1575],
  ["Multilingual response mixed Hindi and English incorrectly", "Global support bot", "llama-3-8b", 1390],
  ["Return label answer ignored premium customer exception", "Support copilot", "gpt-4o-mini", 1735],
  ["Partner onboarding answer missed compliance form", "Partner enablement bot", "claude-3-sonnet", 1510],
  ["KYC helpdesk output asked for prohibited PII", "Operations assistant", "gpt-4o", 2140],
  ["Promo eligibility answer inverted plan tiers", "Lifecycle messaging bot", "gpt-4o-mini", 1450],
  ["Bulk order cancellation answer lacked approval path", "Sales support bot", "claude-3-sonnet", 2010],
  ["RMA answer ignored replacement inventory cap", "Warehouse assistant", "llama-3-8b", 1680],
  ["Refund answer cited retired policy version", "Knowledge assistant", "gpt-4o-mini", 1595],
];

const successTraceScenarios = [
  ["Refund request grounded to current policy article", "Support copilot", "gpt-4o-mini", 820],
  ["Invoice explanation matched finance SOP", "Billing assistant", "gpt-4o", 770],
  ["Shipment delay response stayed empathetic and precise", "Voice QA replay", "claude-3-sonnet", 930],
  ["Warranty answer cited the regional knowledge base", "Support copilot", "gpt-4o-mini", 850],
  ["Plan comparison response highlighted enterprise controls", "Sales copilot", "gpt-4o", 910],
  ["Tax invoice reply captured VAT edge case", "Billing assistant", "gpt-4o", 760],
  ["Cancellation answer included the grace period correctly", "Support copilot", "gpt-4o-mini", 880],
  ["API quota answer linked the right developer guide", "Knowledge assistant", "claude-3-sonnet", 960],
  ["Premium return flow respected loyalty exceptions", "Support copilot", "gpt-4o-mini", 890],
  ["Partner onboarding answer included compliance checklist", "Partner enablement bot", "claude-3-sonnet", 940],
  ["Exchange request answer referenced live stock status", "Warehouse assistant", "llama-3-8b", 990],
  ["Billing retry answer stayed within PCI guidance", "Operations assistant", "gpt-4o", 810],
  ["Refund answer surfaced the expected settlement window", "Knowledge assistant", "gpt-4o-mini", 770],
  ["Subscription downgrade answer matched pricing policy", "Lifecycle messaging bot", "gpt-4o-mini", 740],
  ["Delayed order reply escalated only when needed", "Support copilot", "claude-3-sonnet", 920],
  ["Escalation handoff preserved conversation context", "Agent assist", "gpt-4o-mini", 860],
  ["KYC answer requested only approved documents", "Operations assistant", "gpt-4o", 905],
  ["Chargeback answer cited the correct evidence packet", "Billing assistant", "claude-3-sonnet", 930],
  ["Bulk order change reply captured the manager approval path", "Sales support bot", "gpt-4o-mini", 890],
  ["RMA answer routed replacements to the correct queue", "Warehouse assistant", "llama-3-8b", 1010],
  ["Fraud review explanation remained policy-grounded", "Risk assistant", "gpt-4o", 870],
  ["Locale-specific refund reply used the right currency rules", "Global support bot", "claude-3-sonnet", 950],
  ["Developer support answer linked the correct status page", "Knowledge assistant", "gpt-4o-mini", 820],
  ["Renewal reminder answer used the active promo matrix", "Lifecycle messaging bot", "gpt-4o-mini", 760],
  ["Invoice correction answer captured billing address edge case", "Billing assistant", "gpt-4o", 790],
  ["Password reset help stayed compliant with security policy", "Security support assistant", "claude-3-sonnet", 870],
  ["Feature access reply reflected the latest plan entitlements", "Sales copilot", "gpt-4o-mini", 900],
  ["Team member invite answer matched workspace permissions", "Admin assistant", "gpt-4o-mini", 780],
  ["Policy citation answer quoted the latest documentation", "Knowledge assistant", "claude-3-sonnet", 940],
  ["Refund follow-up answer preserved tone and next steps", "Support copilot", "gpt-4o-mini", 840],
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildTraceRecord([title, source, modelName, latencyMs], index, status) {
  const success = status === "success";

  return {
    title,
    source,
    inputText: `Customer asked about ${title.toLowerCase()}.`,
    outputText: success
      ? `Assistant resolved ${title.toLowerCase()} with the latest approved policy and clear next steps.`
      : `Assistant responded to ${title.toLowerCase()} with an answer that needs review before shipping.`,
    modelName,
    latencyMs,
    metadata: JSON.stringify({
      segment: success ? "resolved" : "needs_attention",
      channel: source,
      sampleIndex: index + 1,
    }),
    tags: JSON.stringify([
      "production",
      success ? "successful" : "failed",
      slugify(source),
      slugify(modelName),
    ]),
    status: success ? "triaged" : index % 2 === 0 ? "ready_for_curation" : "needs_labeling",
    severity: success ? "low" : index % 3 === 0 ? "high" : "medium",
    spanCount: success ? 12 + (index % 5) : 20 + (index % 8),
    opportunityScore: success ? 32 + (index % 15) : 76 + (index % 19),
    capturedAt: new Date(Date.now() - index * 1000 * 60 * 47),
  };
}

export function buildDemoWorkspaceSeed({
  workspaceName = "Can of Soup Labs",
  workspaceSlug = "can-of-soup-labs",
  projectName = "Support Specialist v2",
} = {}) {
  const traceEvents = [
    ...failureTraceScenarios.map((scenario, index) => buildTraceRecord(scenario, index, "failure")),
    ...successTraceScenarios.map((scenario, index) => buildTraceRecord(scenario, index, "success")),
  ];
  const datasetExamples = [
    [
      {
        inputText: "Refund policy says refunds land in 5 business days.",
        outputText: "Refunds land in 5 business days.",
      },
      {
        inputText: "Refund policy says refunds land in 5 business days.",
        outputText: "Refunds land in 5 business days.",
      },
      {
        inputText: "Contact me at buyer@example.com about the refund timeline.",
        outputText: "Please email buyer@example.com once approved.",
      },
      {
        inputText: "refund",
        outputText: "",
      },
      {
        inputText: "The cancellation policy is separate from the refund policy and needs manager approval.",
        outputText: "Manager approval is required for late refund exceptions.",
      },
    ],
    [
      {
        inputText: "Refunds are processed in five business days for annual plans.",
        outputText: "Refunds are processed in five business days.",
      },
      {
        inputText: "Where can I find the VAT invoice workflow for annual plans?",
        outputText: "Use the finance SOP and attach the VAT invoice workflow article.",
      },
      {
        inputText: "Which knowledge base page explains cancellation grace periods?",
        outputText: "See policy article KB-114 for cancellation grace periods.",
      },
      {
        inputText: "How do premium return exceptions work?",
        outputText: "Premium returns can bypass the default restocking fee.",
      },
      {
        inputText: "What policy governs enterprise access controls?",
        outputText: "Enterprise access controls are documented in the latest trust center article.",
      },
    ],
    [
      {
        inputText: "Share onboarding steps for a new workspace admin.",
        outputText: "Step 1: create the workspace. Step 2: invite the first admin.",
      },
      {
        inputText: "Provide onboarding steps for a new workspace admin.",
        outputText: "Create the workspace, then invite the first admin.",
      },
      {
        inputText: "What documents are needed for onboarding verification?",
        outputText: "Collect the signed onboarding form and proof of company registration.",
      },
      {
        inputText: "नया वर्कस्पेस एडमिन सेटअप कैसे करें?",
        outputText: "पहले वर्कस्पेस बनाएं, फिर एडमिन को आमंत्रित करें।",
      },
      {
        inputText: "How should we explain onboarding SLAs to customers?",
        outputText: "Use the current onboarding SLA article and include the 3-day review window.",
      },
    ],
  ];

  return {
    organization: {
      name: workspaceName,
      slug: workspaceSlug,
      billingPlan: "pro",
    },
    users: [
      {
        name: "Rehan",
        email: "founder@finetuneops.local",
        role: "owner",
      },
      {
        name: "Alex",
        email: "alex@finetuneops.local",
        role: "engineer",
      },
      {
        name: "Nadia",
        email: "nadia@finetuneops.local",
        role: "reviewer",
      },
    ],
    project: {
      name: projectName,
      slug: slugify(projectName),
      description: "Production post-training workspace for customer support and policy-grounded answers.",
      status: "active",
    },
    traceEvents,
    datasets: [
      {
        name: "Support Failures Raw Backlog",
        version: "v12",
        source: "Promoted failed traces + manual QA notes",
        status: "needs_review",
        rowCount: 1240,
        qualityScore: 66.3,
      },
      {
        name: "Policy Grounded Answers",
        version: "v5",
        source: "Docs crawl + reviewed production traces",
        status: "ready",
        rowCount: 982,
        qualityScore: 92.4,
      },
      {
        name: "Onboarding Assistant Cleanroom",
        version: "v2",
        source: "Newly imported onboarding transcripts",
        status: "processing",
        rowCount: 417,
        qualityScore: 79.1,
      },
    ],
    datasetExamples,
    experiments: [
      {
        name: "Refund rescue prompt pack",
        goal: "Reduce policy confusion and escalation loops on refund requests",
        candidateModel: "gpt-4o-mini",
        promptVersion: "support-v2.4",
        status: "promote",
        score: 88.6,
        costEstimate: 620,
      },
      {
        name: "Grounded policy answerer",
        goal: "Increase citation fidelity for policy questions",
        candidateModel: "claude-3-sonnet",
        promptVersion: "policy-v1.9",
        status: "running",
        score: 79.4,
        costEstimate: 340,
      },
    ],
    trainingJobs: [
      {
        name: "LoRA escalation recovery",
        modelBase: "gpt-4o-mini",
        provider: "OpenAI",
        status: "completed",
        progress: 100,
        gpuType: "Managed fine-tune",
        gpuHours: 4.3,
        checkpoint: "Artifacts saved",
        startedAt: new Date("2026-04-18T08:30:00.000Z"),
        finishedAt: new Date("2026-04-18T11:10:00.000Z"),
      },
    ],
    backgroundJobs: [
      {
        queueName: "finetuneops-background-jobs",
        jobType: "ingest-trace",
        status: "completed",
        progress: 100,
        attempts: 1,
        maxAttempts: 3,
        estimatedCompletionAt: new Date("2026-04-18T08:55:00.000Z"),
        logs: ["Trace batch finished validation.", "Queued ingest-trace"],
      },
      {
        queueName: "finetuneops-background-jobs",
        jobType: "score-dataset",
        status: "running",
        progress: 68,
        attempts: 1,
        maxAttempts: 3,
        estimatedCompletionAt: new Date("2026-04-18T12:30:00.000Z"),
        logs: ["Scoring duplicate clusters.", "Queued score-dataset"],
      },
      {
        queueName: "finetuneops-background-jobs",
        jobType: "generate-nudges",
        status: "queued",
        progress: 0,
        attempts: 0,
        maxAttempts: 3,
        estimatedCompletionAt: new Date("2026-04-18T13:00:00.000Z"),
        logs: ["Queued generate-nudges"],
      },
      {
        queueName: "finetuneops-background-jobs",
        jobType: "send-notification",
        status: "failed",
        progress: 42,
        attempts: 3,
        maxAttempts: 3,
        estimatedCompletionAt: new Date("2026-04-18T09:40:00.000Z"),
        logs: ["Slack webhook timed out on retry 3.", "Queued send-notification"],
      },
    ],
    evalRuns: [
      {
        name: "Escalation benchmark",
        benchmark: "Resolution + empathy",
        status: "passing",
        score: 88.6,
        delta: 7.8,
        judge: "Hybrid rubric judge",
      },
      {
        name: "Groundedness sweep",
        benchmark: "Citation fidelity",
        status: "watch",
        score: 79.4,
        delta: 2.1,
        judge: "LLM judge + spot checks",
      },
    ],
    pendingRelease: {
      name: "Support Specialist v2.4",
      channel: "Staging",
      status: "gated",
      qualityGate: "Pass",
      latencyGate: "Pass",
      costGate: "Watch",
      approvedBy: "Waiting on review",
      reviewToken: "review_demo_support_v24",
    },
    activityLogs: [
      {
        type: "trace_captured",
        message: "Refund policy confusion was captured from the support copilot.",
        metadata: {
          source: "Support copilot",
        },
        timestamp: new Date("2026-04-18T09:10:00.000Z"),
      },
      {
        type: "dataset_created",
        message: "Policy Grounded Answers v5 was prepared for experiment launch.",
        metadata: {
          datasetName: "Policy Grounded Answers",
          version: "v5",
        },
        timestamp: new Date("2026-04-18T11:00:00.000Z"),
      },
      {
        type: "experiment_started",
        message: "Grounded policy answerer started from the curated dataset.",
        metadata: {
          experimentName: "Grounded policy answerer",
          model: "claude-3-sonnet",
        },
        timestamp: new Date("2026-04-18T12:45:00.000Z"),
      },
      {
        type: "fine_tune_launched",
        message: "LoRA escalation recovery finished and is waiting on release review.",
        metadata: {
          trainingJobName: "LoRA escalation recovery",
          provider: "OpenAI",
        },
        timestamp: new Date("2026-04-18T16:15:00.000Z"),
      },
    ],
  };
}
