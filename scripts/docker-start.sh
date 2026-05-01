#!/bin/sh
set -eu

echo "Generating Prisma client..."
npm run db:generate >/dev/null

echo "Applying database schema..."
npx prisma db push --skip-generate >/dev/null

if [ "${RUN_DEMO_SEED:-true}" = "true" ]; then
  echo "Seeding demo workspace..."
  npm run db:seed >/dev/null
fi

echo "Starting FineTuneOps..."
if [ -f ".next/standalone/server.js" ]; then
  export HOSTNAME=0.0.0.0
  export PORT=3000
  exec node .next/standalone/server.js
fi

exec npx next start --hostname 0.0.0.0 --port 3000
