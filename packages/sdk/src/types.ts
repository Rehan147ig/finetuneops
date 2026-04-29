export type FinetuneOpsConfig = {
  apiKey: string;
  baseUrl?: string;
  workspace?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  debug?: boolean;
};

export type TraceInput = {
  input: string | object;
  output: string | object;
  model: string;
  latency_ms?: number;
  tags?: string[];
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

export type TraceResult = {
  id: string;
  status: "captured" | "queued" | "failed";
  timestamp: string;
};

export type SDKError = {
  code:
    | "AUTH_FAILED"
    | "RATE_LIMITED"
    | "NETWORK_ERROR"
    | "INVALID_PAYLOAD"
    | "SERVER_ERROR";
  message: string;
  retryAfter?: number;
};

export type NormalizedConfig = Required<FinetuneOpsConfig>;

export type BatchTracePayload = {
  input: string;
  output: string;
  model: string;
  latency_ms: number;
  tags: string[];
  userId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
};
