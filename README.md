# FinetuneOps

FinetuneOps is a production SaaS for AI engineering teams that need to
turn production LLM failures into better datasets, prompts, evals, fine-tunes,
and releases.

It is not meant to be just another LLM observability dashboard. The product
direction is sharper:

> FinetuneOps should become the debugger that tells a team which training
> examples, prompts, or eval regressions broke model quality, then helps fix
> them in one click.

## Current Product

The platform already provides the foundation for a serious post-training ops
workflow:

- Trace capture through the FinetuneOps SDK, including OpenAI and Anthropic
  wrappers.
- Batch trace ingestion, retry logic, rate limiting, request-size protection,
  queue backpressure, and Redis caching.
- Dataset creation from production traces.
- Dataset quality checks for duplicates, PII, length issues, label balance,
  language consistency, health score, and cost estimates.
- Prompt versioning, prompt diff view, prompt playground, and SDK prompt fetch.
- OpenAI fine-tune orchestration with background workers, polling, progress
  tracking, and notifications.
- Release gates, review links, activity logs, analytics, CSV export, search,
  docs, billing, auth, health/readiness endpoints, Docker hardening, and SDK
  packaging.
- Production deployment path on Railway with PostgreSQL and Redis.

## Product Workflow

1. Capture production failures as traces.
2. Curate the best traces into versioned datasets.
3. Run dataset quality checks before training.
4. Compare candidate fixes with experiments and evals.
5. Launch fine-tunes only when the evidence justifies it.
6. Gate releases on quality, latency, and cost.
7. Track what changed across prompts, datasets, jobs, and releases.

## What's Missing

The current product is useful, but the strongest revenue features are not
fully built yet. These are the features that can separate FinetuneOps from
generic LLM observability tools.

### 1. Regression Detection Engine - Built

This should become the core paid feature.

Now built:

- `EvalRun.scores` stores multi-metric eval results.
- `RegressionAlert` stores per-metric regressions with severity and status.
- `src/lib/regression-engine.ts` compares baseline and candidate eval runs.
- Regression checks run after successful fine-tune polling when a completed eval is available.
- Alerts are written idempotently, so repeated checks do not create duplicates.

Current limitation:

- Regression alerts exist in the database, but the dedicated regressions UI is not built yet.
- Team-defined thresholds are not configurable in the UI yet.
- TRA analysis does not yet explain which training examples caused the regression.

Why it matters:

Teams do not just want to know that a model changed. They want to know
which metric regressed, by how much, and whether the release should be blocked.

### 2. TRA Engine - Built

TRA means Training Regression Autopilot.

This is the feature that can make customers pay more because it does not just
detect a regression. It explains the likely cause.

Now built:

- `src/lib/tra-engine.ts` with 4 analysis techniques:
  - Instruction conflict detection.
  - Label noise detection using LLM-as-judge.
  - Duplicate conflict detection.
  - Class imbalance correlation.
- `TraReport` and `SuspiciousExample` models in Prisma.
- `run-tra-analysis` worker.
- `/regressions` UI for alerts and full TRA reports.

The intended output (now live):

```text
Regression detected: billing_accuracy dropped from 87% to 63%.

Likely root cause:
Example #182 - Instruction conflict - 94% confidence
Example #445 - Label noise - 91% confidence
Example #512 - Duplicate conflict - 86% confidence
```

Why it matters:

Dashboards show symptoms. TRA should identify the training examples most
likely responsible for the regression.

### 3. One-Click Recovery - Built

This is the magic moment.

Now built:

- `RecoveryJob` model tracking recovery lifecycle.
- Action to automatically remove high-confidence suspicious examples.
- Background generation of a cleaned dataset version.
- Slack notifications with direct links to the new dataset.
- In-place UI updates via server actions.

The intended user action:

```text
Click "Remove & Retrain"
-> suspicious examples are removed
-> dataset v4 is created
-> quality check runs
-> fine-tune job is queued
-> regression can be retested
```

Why it matters:

The customer is not paying for another alert. They are paying because the tool
shortens the path from "model got worse" to "we fixed the data and retrained."

### 4. Evals Page - Partial

The `/evals` page exists, but it is currently closer to a shell than a full
decision engine.

Missing today:

- Raw output storage per eval case.
- Per-metric threshold configuration.
- Regression gating tied to releases.

Why it matters:

Regression detection depends on evals being more than one score. Teams need
metric-level evidence before trusting automated recovery.

### 5. Multi-Provider Fine-Tuning - Partial

The SDK can wrap OpenAI and Anthropic calls, but fine-tune orchestration is
currently OpenAI-focused.

Missing today:

- Together AI fine-tuning adapter.
- Fireworks fine-tuning adapter.
- Provider abstraction for launching and polling training jobs.

Why it matters:

OpenAI support is enough for a first beta. Multi-provider support expands the
market to teams using open-source and hosted model providers.

## Revenue Feature Roadmap

These are the highest-leverage features to build next.

| Feature | Estimated Effort | Revenue Impact |
| --- | ---: | --- |
| Multi-metric EvalRun scores | Done | Blocker for regression detection |
| RegressionAlert schema and detection engine | Done | Core product wedge |
| TRA Engine with 4 analysis techniques | Done | Main reason to pay $399/month |
| TRA report UI | Done | Customer-visible proof and trust |
| One-click recovery | Done | Magic moment |
| Fireworks and Together adapters | 1 day | Expands total addressable market |

## Recommended Build Order

Build only these in order before adding more dashboards or polish:

1. Build `src/lib/tra-engine.ts`.
2. Add `TraReport`, `SuspiciousExample`, and `RecoveryJob`.
3. Add `run-tra-analysis` and `run-recovery-job` worker types.
4. Add `/regressions` UI for alerts, TRA reports, and recovery actions.
5. Add one-click recovery to remove suspicious examples and retrain.
6. Add Together AI and Fireworks fine-tune adapters.

## Why Teams Would Pay

The strongest paid promise is not:

> "Monitor your LLM app."

The stronger promise is:

> "When your fine-tuned model gets worse, FinetuneOps tells you which metric
> regressed, which training examples likely caused it, and lets you create a
> cleaned recovery dataset in one click."

That solves a painful, expensive problem for teams building production AI:

- regressions are hard to explain,
- bad training data is hard to find,
- eval failures are hard to connect to dataset examples,
- retraining takes too much manual coordination,
- teams lose the reason why a model changed.

FinetuneOps should own that failure-to-fix workflow.

## Local Setup

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Docker Setup

1. Copy `.env.example` to `.env`.
2. Run `docker compose up --build`.
3. Open `http://localhost:3000`.

The container startup automatically:

- generates the Prisma client,
- applies the current Prisma schema,
- optionally seeds a demo workspace,
- exposes health checks at `/api/health` and `/api/ready`.

## Useful Scripts

```bash
npm test
npm run build
npm run db:generate
npm run db:push
npm run sdk:test
npm run sdk:build
```

## Deployment Notes

For Railway:

- Set `DATABASE_URL`.
- Set `REDIS_URL`.
- Set `NEXTAUTH_SECRET`.
- Set `NEXTAUTH_URL` and `APP_URL` to the production domain.
- Set `ENCRYPTION_KEY`.
- Set OAuth provider credentials.
- Set Railway public networking target port to the same port shown in deploy
  logs, usually `8080`.
- Set `RUN_DEMO_SEED=false` for production after initial testing.

## Current Strategic Status

FinetuneOps has a strong technical foundation and enough workflow surface area
to demo as a real SaaS.

The next step is not more generic analytics. The next step is the revenue
engine:

```text
Regression detected -> TRA explains why -> one-click recovery creates a
cleaned dataset -> retraining starts -> team verifies the fix.
```

That is the path from useful tool to paid product.
