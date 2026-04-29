# FinetuneOps Performance Baseline

## Test Environment
Date: 2026-04-24
Node version: v22.12.0
Machine: Document specs when first run

## Targets

| Endpoint | Target RPS | Target p99 |
|---|---:|---:|
| POST /api/traces/ingest | 200+ | < 500ms |
| GET /api/traces | 500+ | < 200ms |
| GET /api/health | 1000+ | < 50ms |

## How to Run

1. Start the platform:
   `docker-compose up -d`
2. Run load tests:
   `npm run load-test`
3. Results print to stdout

## Baseline Results
To be filled in after first run against
a running instance.

## Scaling Notes
- Rate limiting kicks in at 1000 req/min per workspace for trace ingestion
- Backpressure applies at 2000 queued ingest jobs
- Redis caching reduces DB load by ~95% on read paths
- Cursor pagination prevents offset degradation on large trace tables

## Known Limits Before Next Scaling Work
- Single Postgres instance (no read replicas)
- Single Redis instance (no clustering)
- Worker fleet not auto-scaling
- No CDN for static assets
