# FineTuneOps SDK

## Install

```bash
npm install finetuneops
```

## Regression report CLI

Use FineTuneOps without adopting the dashboard first. Compare baseline and
candidate eval files, optionally include training data, and emit a release-gate
report.

```bash
npx finetuneops regression \
  --baseline baseline.jsonl \
  --candidate candidate.jsonl \
  --training train.jsonl \
  --format markdown \
  --output finetuneops-report.md \
  --fail-on-regression
```

Eval files can be JSON arrays or JSONL rows:

```json
{"id":"refund-policy","input":"Can I get a refund?","score":1,"model":"gpt-4.1-mini","promptVersion":"support-v1"}
{"id":"cancel-plan","input":"Cancel my plan.","score":0.9,"model":"gpt-4.1-mini","promptVersion":"support-v1"}
```

The report highlights global score drop, highest-impact failed cases,
model/prompt/RAG version changes, and optional training-data risks such as PII
or duplicate conflicts.

## Import LangSmith runs

Export filtered LangSmith baseline and candidate runs, then convert them into
FineTuneOps eval cases. Keep stable ids and release metadata on both exports so
the RCA report can compare them.

```bash
npx finetuneops import-langsmith --input baseline-runs.json --output baseline.jsonl --score-key correctness
npx finetuneops import-langsmith --input candidate-runs.json --output candidate.jsonl --score-key correctness
npx finetuneops regression --baseline baseline.jsonl --candidate candidate.jsonl --fail-on-regression
```

## Regression report SDK

```ts
import { analyzeRegressionReport } from "finetuneops";

const report = analyzeRegressionReport({
  baseline,
  candidate,
  trainingData,
});

if (report.summary.regressed) {
  throw new Error(report.recommendation);
}
```

## Quick start

```ts
import { FineTuneOps } from "finetuneops";

const ops = new FineTuneOps({
  apiKey: "fto_live_xxxx",
});
```

## Auto-wrap OpenAI

```ts
import OpenAI from "openai";

const openai = ops.wrapOpenAI(new OpenAI());
```

All calls now traced automatically.

## Auto-wrap Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = ops.wrapAnthropic(new Anthropic());
```

## Manual trace

```ts
await ops.trace({
  input: "user message",
  output: "model response",
  model: "gpt-4o-mini",
  latency_ms: 340,
});
```

## Fetch a prompt template

```ts
const prompt = await ops.prompt("customer-support", {
  customer_name: "Alex",
  issue: "refund request",
});
```

`prompt()` fetches the current deployed template from FinetuneOps, fills any
`{{variables}}`, and caches the template locally for five minutes.

## Configuration options

| Field | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | required | FineTuneOps API key |
| `baseUrl` | `string` | `https://api.finetuneops.com` | FineTuneOps API base URL |
| `workspace` | `string` | `""` | Optional workspace slug for client-side context |
| `batchSize` | `number` | `10` | Number of traces to buffer before flushing |
| `flushIntervalMs` | `number` | `5000` | Flush interval for buffered traces |
| `debug` | `boolean` | `false` | Enable SDK debug logging |

## API key formats

- `fto_live_xxxx` production
- `fto_test_xxxx` testing
