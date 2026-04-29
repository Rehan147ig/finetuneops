import { basename } from "node:path";
import autocannon, { type Result } from "autocannon";

const BASE_URL = process.env.LOAD_TEST_URL || "http://localhost:3000";
const API_KEY = process.env.LOAD_TEST_API_KEY || "";

export const RESULTS: Record<
  string,
  {
    passed: boolean;
    rps: number;
    p99: number;
    target: { rps: number; p99: number };
  }
> = {};

type TestConfig = {
  title: string;
  url: string;
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  connections: number;
  duration: number;
  targetRps: number;
  targetP99Ms: number;
};

export function evaluateResult(
  actual: { rps: number; p99: number },
  target: { rps: number; p99: number },
): boolean {
  return actual.rps >= target.rps && actual.p99 <= target.p99;
}

export function evaluateOverall(
  results: Record<string, { passed: boolean }>,
): boolean {
  return Object.values(results).every((result) => result.passed);
}

function writeLine(line = "") {
  process.stdout.write(`${line}\n`);
}

function formatRps(value: number) {
  return value.toFixed(1);
}

function formatLatency(value: number) {
  return value.toFixed(1);
}

async function runAutocannon(config: TestConfig): Promise<Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        connections: config.connections,
        duration: config.duration,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      },
    );

    instance.on("error", reject);
  });
}

export async function runTest(config: TestConfig): Promise<void> {
  const result = await runAutocannon(config);
  const actual = {
    rps: result.requests.average,
    p99: result.latency.p99,
  };
  const target = {
    rps: config.targetRps,
    p99: config.targetP99Ms,
  };
  const passed = evaluateResult(actual, target);

  RESULTS[config.title] = {
    passed,
    rps: actual.rps,
    p99: actual.p99,
    target,
  };

  writeLine(`Test: ${config.title}`);
  writeLine(`Requests/sec: ${formatRps(actual.rps)} (target: ${config.targetRps})`);
  writeLine(`Latency p99:  ${formatLatency(actual.p99)}ms (target: ${config.targetP99Ms}ms)`);
  writeLine(`Status: ${passed ? "PASS" : "FAIL"}`);
  writeLine();
}

async function main() {
  const traceHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (API_KEY) {
    traceHeaders["x-finetuneops-key"] = API_KEY;
    traceHeaders["x-api-key"] = API_KEY;
  }

  await runTest({
    title: "Trace ingestion",
    url: `${BASE_URL}/api/traces/ingest`,
    method: "POST",
    headers: traceHeaders,
    body: JSON.stringify({
      input: "Customer asked about refund policy",
      output: "Refunds take 5-7 business days",
      model: "gpt-4o-mini",
      latency_ms: 340,
      tags: ["support", "refund"],
    }),
    connections: 50,
    duration: 30,
    targetRps: 200,
    targetP99Ms: 500,
  });

  await runTest({
    title: "Trace list read",
    url: `${BASE_URL}/api/traces`,
    method: "GET",
    connections: 50,
    duration: 30,
    targetRps: 500,
    targetP99Ms: 200,
  });

  await runTest({
    title: "Health endpoint",
    url: `${BASE_URL}/api/health`,
    method: "GET",
    connections: 20,
    duration: 15,
    targetRps: 1000,
    targetP99Ms: 50,
  });

  writeLine("==========================================");
  writeLine("LOAD TEST RESULTS");
  writeLine("==========================================");
  writeLine(
    `Trace ingestion: ${RESULTS["Trace ingestion"]?.passed ? "PASS" : "FAIL"} ${formatRps(RESULTS["Trace ingestion"]?.rps ?? 0)} req/s p99 ${formatLatency(RESULTS["Trace ingestion"]?.p99 ?? 0)}ms`,
  );
  writeLine(
    `Trace list read: ${RESULTS["Trace list read"]?.passed ? "PASS" : "FAIL"} ${formatRps(RESULTS["Trace list read"]?.rps ?? 0)} req/s p99 ${formatLatency(RESULTS["Trace list read"]?.p99 ?? 0)}ms`,
  );
  writeLine(
    `Health endpoint: ${RESULTS["Health endpoint"]?.passed ? "PASS" : "FAIL"} ${formatRps(RESULTS["Health endpoint"]?.rps ?? 0)} req/s p99 ${formatLatency(RESULTS["Health endpoint"]?.p99 ?? 0)}ms`,
  );
  writeLine("==========================================");
  writeLine(`Overall: ${evaluateOverall(RESULTS) ? "PASS" : "FAIL"}`);
  writeLine("==========================================");

  process.exitCode = evaluateOverall(RESULTS) ? 0 : 1;
}

if (basename(process.argv[1] ?? "") === "load-test.ts") {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown load-test failure";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
