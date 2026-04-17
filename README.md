# FineTuneOps

FineTuneOps is a SaaS MVP scaffold for teams that need cleaner dataset ops,
training orchestration, and eval visibility for custom LLM workflows.

## Current status

- Next.js app shell with multi-page dashboard
- Prisma schema for organizations, projects, datasets, jobs, and evals
- Product-oriented UI that we can extend with auth, uploads, workers, and billing

## Planned next steps

1. Install dependencies and boot the app locally
2. Add Prisma client wiring and seed data
3. Replace mock data with database-backed queries
4. Add authentication and organization switching
5. Wire dataset uploads, training workers, and evaluation runs

## Local setup

```bash
npm install
npm run dev
```

Create a `.env.local` based on `.env.example` before running Prisma commands.
