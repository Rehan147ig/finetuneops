import { getBackgroundJobQueue, type BackgroundJobType } from "@/lib/background-jobs";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

type ThresholdConfig = {
  warning: number;
  critical: number;
};

function getNumericThreshold(name: string, fallback: number) {
  const value = process.env[name];
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const THRESHOLDS: Record<
  Extract<
    BackgroundJobType,
    "ingest-trace" | "score-dataset" | "launch-finetune" | "poll-finetune" | "send-notification"
  >,
  ThresholdConfig
> = {
  "ingest-trace": {
    warning: getNumericThreshold("QUEUE_INGEST_TRACE_WARNING_THRESHOLD", 500),
    critical: getNumericThreshold("QUEUE_INGEST_TRACE_CRITICAL_THRESHOLD", 2000),
  },
  "score-dataset": {
    warning: getNumericThreshold("QUEUE_SCORE_DATASET_WARNING_THRESHOLD", 50),
    critical: getNumericThreshold("QUEUE_SCORE_DATASET_CRITICAL_THRESHOLD", 200),
  },
  "launch-finetune": {
    warning: getNumericThreshold("QUEUE_LAUNCH_FINETUNE_WARNING_THRESHOLD", 20),
    critical: getNumericThreshold("QUEUE_LAUNCH_FINETUNE_CRITICAL_THRESHOLD", 50),
  },
  "poll-finetune": {
    warning: getNumericThreshold("QUEUE_POLL_FINETUNE_WARNING_THRESHOLD", 100),
    critical: getNumericThreshold("QUEUE_POLL_FINETUNE_CRITICAL_THRESHOLD", 500),
  },
  "send-notification": {
    warning: getNumericThreshold("QUEUE_SEND_NOTIFICATION_WARNING_THRESHOLD", 100),
    critical: getNumericThreshold("QUEUE_SEND_NOTIFICATION_CRITICAL_THRESHOLD", 500),
  },
};

export type QueueStats = {
  name: string;
  waiting: number;
  active: number;
  level: "ok" | "warning" | "critical";
};

function getQueueLevel(name: keyof typeof THRESHOLDS, waiting: number): QueueStats["level"] {
  if (waiting >= THRESHOLDS[name].critical) {
    return "critical";
  }

  if (waiting >= THRESHOLDS[name].warning) {
    return "warning";
  }

  return "ok";
}

async function sendInternalSlackAlert(input: {
  queue: string;
  waiting: number;
  threshold: number;
}) {
  const env = getServerEnv();
  const webhookUrl = env.INTERNAL_SLACK_WEBHOOK;

  if (!webhookUrl) {
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: [
          "\u{1F6A8} Queue depth critical",
          `Queue: ${input.queue}`,
          `Waiting: ${input.waiting} jobs`,
          `Threshold: ${input.threshold}`,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      throw new Error("Internal Slack alert request failed");
    }
  } catch (error) {
    logger.warn({
      event: "queue_alert_failed",
      queue: input.queue,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function getQueueStats(): Promise<QueueStats[]> {
  const stats: QueueStats[] = [];

  for (const queueName of Object.keys(THRESHOLDS) as Array<keyof typeof THRESHOLDS>) {
    let queue:
      | ReturnType<typeof getBackgroundJobQueue>
      | null = null;

    try {
      queue = getBackgroundJobQueue(queueName);
      const [waiting, active] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
      ]);

      stats.push({
        name: queueName,
        waiting,
        active,
        level: getQueueLevel(queueName, waiting),
      });
    } catch (error) {
      logger.warn({
        event: "queue_stats_unavailable",
        queue: queueName,
        error: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      if (queue) {
        await queue.close().catch(() => undefined);
      }
    }
  }

  return stats;
}

export async function checkQueuesAndAlert(): Promise<void> {
  const stats = await getQueueStats();

  for (const queue of stats) {
    if (!(queue.name in THRESHOLDS)) {
      continue;
    }

    const thresholds = THRESHOLDS[queue.name as keyof typeof THRESHOLDS];

    if (queue.level === "warning") {
      logger.warn({
        event: "queue_depth_warning",
        queue: queue.name,
        waiting: queue.waiting,
        active: queue.active,
        threshold: thresholds.warning,
      });
      continue;
    }

    if (queue.level === "critical") {
      logger.error({
        event: "queue_depth_critical",
        queue: queue.name,
        waiting: queue.waiting,
        active: queue.active,
        threshold: thresholds.critical,
      });
      await sendInternalSlackAlert({
        queue: queue.name,
        waiting: queue.waiting,
        threshold: thresholds.critical,
      });
    }
  }
}

export function shouldApplyBackpressure(stats: QueueStats[]): boolean {
  return stats.some((queue) => queue.level === "critical");
}
