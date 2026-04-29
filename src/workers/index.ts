import { Worker } from "bullmq";
import { backgroundJobTypes, getQueueNameForJobType } from "../lib/background-jobs";
import { getServerEnv } from "../lib/env";
import { checkQueuesAndAlert } from "../lib/queue-monitor";
import { initializeSentry, Sentry } from "../lib/sentry";
import {
  createWorkerHealthServer,
  createWorkerProcessor,
  gracefulShutdown,
} from "./runtime";
import { workerLogger } from "./logger";

const env = getServerEnv();
const redisUrl = new URL(env.REDIS_URL);

function getRedisConnection() {
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
  };
}

const concurrencyByJob = {
  "ingest-trace": 10,
  "score-dataset": 3,
  "run-experiment": 3,
  "launch-finetune": 2,
  "poll-finetune": 5,
  "send-notification": 5,
  "expire-review-links": 1,
  "generate-nudges": 1,
  "run-ab-test": 2,
  "safety-scan": 3,
} as const;

async function start() {
  initializeSentry();
  const workers = backgroundJobTypes.map((jobType) => {
    const worker = new Worker(
      getQueueNameForJobType(jobType),
      createWorkerProcessor(jobType),
      {
        connection: getRedisConnection(),
        concurrency: concurrencyByJob[jobType],
      },
    );

    return Object.assign(worker, { name: jobType });
  });

  const healthServer = createWorkerHealthServer(backgroundJobTypes, 3002);
  await checkQueuesAndAlert();
  const monitorInterval = setInterval(() => {
    void checkQueuesAndAlert();
  }, 60_000);

  const shutdown = async () => {
    clearInterval(monitorInterval);
    workerLogger.info({
      event: "worker_shutdown_started",
      workerCount: workers.length,
    });
    await gracefulShutdown({
      workers,
      server: healthServer,
    });
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("unhandledRejection", (reason) => {
    workerLogger.error({
      event: "worker_unhandled_rejection",
      error: reason instanceof Error ? reason.message : String(reason),
    });
    Sentry.captureException(reason);
  });
  process.on("uncaughtException", (error) => {
    workerLogger.error({
      event: "worker_uncaught_exception",
      error: error.message,
    });
    Sentry.captureException(error);
  });

  workerLogger.info({
    event: "worker_fleet_started",
    workerCount: workers.length,
  });
}

void start();
