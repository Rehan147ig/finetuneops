import { createLogger } from "../lib/logger";

export const workerLogger = createLogger({
  service: "finetuneops-worker",
});
