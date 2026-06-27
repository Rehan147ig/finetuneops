#!/bin/sh
set -eu

echo "Generating Prisma client..."
npm run db:generate >/dev/null

echo "Running database migrations..."
npx prisma migrate deploy

if [ "${RUN_DEMO_SEED:-true}" = "true" ]; then
  echo "Seeding demo workspace..."
  npm run db:seed >/dev/null
fi

echo "Starting FineTuneOps..."
APP_PORT="${PORT:-3000}"
echo "Listening on 0.0.0.0:${APP_PORT}"
exec npx next start --hostname 0.0.0.0 --port "${APP_PORT}"
