FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl openssl

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/finetuneops?schema=public
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app ./
RUN chmod +x ./scripts/docker-start.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD curl -fsS "http://localhost:${PORT:-3000}/api/health" || exit 1
CMD ["sh", "./scripts/docker-start.sh"]
