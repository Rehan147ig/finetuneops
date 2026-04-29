import pino, { type DestinationStream, type LoggerOptions } from "pino";

const redactedPaths = [
  "apiKey",
  "encryptedKey",
  "authTag",
  "iv",
  "webhookUrl",
  "authorization",
  "headers.authorization",
  "headers.Authorization",
];

export function createLogger(input?: {
  service?: string;
  stream?: DestinationStream;
}) {
  const options: LoggerOptions = {
    level: process.env.LOG_LEVEL || "info",
    base: {
      service: input?.service ?? "finetuneops-web",
    },
    redact: {
      paths: redactedPaths,
      censor: "[REDACTED]",
    },
    transport:
      process.env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
          }
        : undefined,
  };

  return pino(options, input?.stream);
}

export const logger = createLogger();
