# FinetuneOps SDK

## Install

```bash
npm install finetuneops
```

## Quick start

```ts
import { FinetuneOps } from "finetuneops";

const ops = new FinetuneOps({
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
| `apiKey` | `string` | required | FinetuneOps API key |
| `baseUrl` | `string` | `https://api.finetuneops.com` | FinetuneOps API base URL |
| `workspace` | `string` | `""` | Optional workspace slug for client-side context |
| `batchSize` | `number` | `10` | Number of traces to buffer before flushing |
| `flushIntervalMs` | `number` | `5000` | Flush interval for buffered traces |
| `debug` | `boolean` | `false` | Enable SDK debug logging |

## API key formats

- `fto_live_xxxx` production
- `fto_test_xxxx` testing
