# FineTuneOps Private Beta Launch Checklist

FineTuneOps is ready for a private-beta deployment after the app, worker, database, Redis, and required secrets are connected. It is not yet a "set it and forget it" public launch; run this checklist before putting real customer data through it.

## 1. Deployment Shape

Run two services from the same repository:

- Web app: Next.js server, public HTTP entrypoint.
- Worker: BullMQ workers for ingestion, dataset scoring, fine-tune orchestration, TRA, recovery, and notifications.

Required managed services:

- PostgreSQL 16+.
- Redis 7+ with a no-eviction policy for BullMQ queues.
- A production domain with HTTPS termination.

Recommended first deployment:

- Railway, Render, Fly.io, or Vercel for the web app plus a separate worker service.
- Managed Postgres and Redis from the same platform or a trusted provider.

## 2. Required Environment Variables

Set these in both the web app and worker unless noted otherwise:

```text
DATABASE_URL
REDIS_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
APP_URL
ENCRYPTION_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
```

Optional but recommended:

```text
SENTRY_DSN
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
INTERNAL_SLACK_WEBHOOK
LOG_LEVEL=info
RUN_DEMO_SEED=false
```

Provider credentials such as OpenAI, Anthropic, and Hugging Face should be added through the workspace settings UI when possible. That path encrypts customer provider keys with `ENCRYPTION_KEY`.

## 3. Database Setup

For a fresh production database:

```bash
npm run db:generate
npm run db:migrate
```

Do not run `npm run db:seed` against a customer production database. Use demo seeding only in a staging or sales-demo environment.

## 4. Build And Runtime Commands

Build:

```bash
npm run build
```

Web:

```bash
npm start
```

Worker:

```bash
npm run worker:start
```

The build now produces:

- `.next/standalone` for the production Docker web image.
- `dist/workers/index.js` for the worker service.

## 5. Smoke Tests On The Live URL

After deploy, verify:

```bash
curl https://your-domain.com/api/health
curl https://your-domain.com/api/ready
```

Then test in the UI:

1. Sign up or sign in.
2. Create or open a workspace.
3. Generate an SDK API key.
4. Add an OpenAI provider credential.
5. Send one trace through the SDK or ingestion API.
6. Promote a trace to a dataset.
7. Run dataset quality.
8. Launch or simulate an eval.
9. Confirm a regression alert can produce a TRA report.
10. Confirm worker health at the worker `/health` endpoint.

## 6. Private Beta Acceptance Criteria

Treat the product as private-beta ready when all of these are true:

- `npm run build` passes.
- `npm test` passes.
- `npm run lint` passes.
- `npx tsc --noEmit --incremental false` passes.
- Web health and readiness endpoints pass on the live URL.
- Worker health passes.
- A real SDK trace appears in the tenant workspace.
- Provider credentials are encrypted and never logged.
- One regression-to-TRA-to-recovery demo flow works in staging.
- Tenant isolation has been manually checked with at least two workspaces.

## 7. GitHub Release Path

Do not delete the GitHub repository contents and re-upload unless the repository history is already disposable. The safer path is:

1. Commit the current work on a branch such as `codex/launch-readiness`.
2. Push the branch.
3. Open a draft PR into `main`.
4. Let GitHub show file-level changes and CI results.
5. Merge only after checks pass.

If GitHub auth fails locally, run:

```bash
gh auth login -h github.com
```

Then push the branch again.

## 8. Current Market Launch Positioning

Lead with the differentiated wedge:

> FineTuneOps diagnoses AI regressions and turns them into safe recovery workflows.

Do not lead with a feature list. The public story should be:

- Capture production failures.
- Detect regressions.
- Use TRA to explain likely data, prompt, or eval causes.
- Create a recovery dataset.
- Verify the fix before release.

This positions FineTuneOps as anti-botsitting infrastructure: fewer humans manually babysitting broken AI workflows, more automated diagnosis and recovery.
