#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import {
  analyzeRegressionReport,
  renderRegressionReportMarkdown,
  type EvalCase,
  type TrainingExample,
} from "./regression-report";
import { importLangSmithRuns, type LangSmithRun } from "./langsmith-import";

type CliOptions = {
  baseline?: string;
  candidate?: string;
  training?: string;
  format: "json" | "markdown";
  output?: string;
  minDrop?: number;
  failOnRegression: boolean;
  input?: string;
  scoreKey?: string;
};

function printHelp() {
  console.log(`FineTuneOps CLI

Usage:
  finetuneops regression --baseline baseline.jsonl --candidate candidate.jsonl [--training train.jsonl]
  finetuneops import-langsmith --input langsmith-runs.json --output eval-cases.jsonl [--score-key correctness]

Options:
  --baseline <file>       Baseline eval cases as JSON array or JSONL
  --candidate <file>      Candidate eval cases as JSON array or JSONL
  --training <file>       Optional training data as JSON array or JSONL
  --format <json|markdown>  Output format (default: json)
  --output <file>         Write report to a file
  --min-drop <number>     Minimum per-case/global score drop (default: 0.05)
  --fail-on-regression    Exit with code 2 when a regression is detected
  --input <file>          LangSmith run export as a JSON array or JSONL
  --score-key <key>       Feedback metric to use as the eval score
  --help                  Show this help
`);
}

function parseArgs(argv: string[]): { command?: string; options: CliOptions } {
  const [command, ...rest] = argv;
  const options: CliOptions = {
    format: "json",
    failOnRegression: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];

    switch (arg) {
      case "--baseline":
        options.baseline = next;
        index += 1;
        break;
      case "--candidate":
        options.candidate = next;
        index += 1;
        break;
      case "--training":
        options.training = next;
        index += 1;
        break;
      case "--input":
        options.input = next;
        index += 1;
        break;
      case "--score-key":
        options.scoreKey = next;
        index += 1;
        break;
      case "--format":
        if (next !== "json" && next !== "markdown") {
          throw new Error("--format must be json or markdown.");
        }
        options.format = next;
        index += 1;
        break;
      case "--output":
        options.output = next;
        index += 1;
        break;
      case "--min-drop":
        options.minDrop = Number(next);
        if (!Number.isFinite(options.minDrop) || options.minDrop < 0) {
          throw new Error("--min-drop must be a non-negative number.");
        }
        index += 1;
        break;
      case "--fail-on-regression":
        options.failOnRegression = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, options };
}

function parseDataFile<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${filePath} must contain a JSON array or JSONL rows.`);
    }
    return parsed as T[];
  }

  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function runRegression(options: CliOptions) {
  if (!options.baseline || !options.candidate) {
    throw new Error("Both --baseline and --candidate are required.");
  }

  const report = analyzeRegressionReport({
    baseline: parseDataFile<EvalCase>(options.baseline),
    candidate: parseDataFile<EvalCase>(options.candidate),
    trainingData: options.training ? parseDataFile<TrainingExample>(options.training) : undefined,
    minDrop: options.minDrop,
  });

  const output =
    options.format === "markdown"
      ? renderRegressionReportMarkdown(report)
      : `${JSON.stringify(report, null, 2)}\n`;

  if (options.output) {
    writeFileSync(options.output, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  if (options.failOnRegression && report.summary.regressed) {
    process.exitCode = 2;
  }
}

function runLangSmithImport(options: CliOptions) {
  if (!options.input || !options.output) {
    throw new Error("Both --input and --output are required for import-langsmith.");
  }

  const cases = importLangSmithRuns(parseDataFile<LangSmithRun>(options.input), {
    scoreKey: options.scoreKey,
  });
  writeFileSync(options.output, `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
}

export function runCli(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "import-langsmith") {
    runLangSmithImport(options);
    return;
  }

  if (command !== "regression") {
    throw new Error(`Unknown command: ${command}`);
  }

  runRegression(options);
}

try {
  if (require.main === module) {
    runCli();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
