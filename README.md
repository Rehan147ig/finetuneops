# FineTuneOps

FineTuneOps is a post-training ops SaaS scaffold for teams that need a clean
workflow for tracing failures, curating datasets, running experiments,
launching fine-tunes, and gating releases.

## Current status

- Next.js app shell with workflow pages for `traces`, `datasets`,
  `experiments`, `fine-tunes`, `evals`, and `releases`
- Prisma schema for organizations, projects, traces, datasets, experiments,
  jobs, evals, and model releases
- Dockerized app + PostgreSQL + Redis foundation
- Seeded demo workspace with realistic traces, datasets, experiments, jobs,
  and a pending release review link
- Local `create-finetuneops` bootstrap package for fast self-hosting setup

## Product workflow

1. Capture production failures as traces
2. Curate traces into versioned datasets
3. Compare candidate fixes in experiments
4. Launch fine-tunes when the evidence justifies it
5. Promote only when quality, latency, and cost gates pass

## Local setup

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Docker setup

1. Copy `.env.example` to `.env`
2. Run `docker compose up --build`
3. Open `http://localhost:3000`

The container startup automatically:
- applies the current Prisma schema
- seeds a realistic demo workspace
- exposes the app health endpoint at `/api/health`

## Bootstrap CLI

The local bootstrap package lives in
`packages/create-finetuneops`.

When published, the intended flow is:

```bash
npx create-finetuneops@latest my-workspace
```

The wizard asks for:
- OpenAI API key
- database URL
- Redis URL

It then writes a ready-to-run `.env` file and prints the exact next steps.

## Next steps

1. Add authentication and organization switching
2. Add teams, invites, and scoped API keys
3. Add billing, usage controls, and plan enforcement
4. Add worker orchestration and provider integrations
5. Add analytics, docs, and production hardening
