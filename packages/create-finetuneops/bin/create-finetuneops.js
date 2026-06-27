#!/usr/bin/env node

const path = require("path");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const {
  buildEnvFile,
  copyTemplate,
  formatNextSteps,
  resolveSourceDirectory,
  resolveTargetDirectory,
} = require("../src/scaffold");

async function run() {
  const targetName = process.argv[2] || "my-finetuneops";
  const targetDirectory = resolveTargetDirectory(process.cwd(), targetName);
  const sourceDirectory = resolveSourceDirectory(__dirname);

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  const openAiKey = (await rl.question("OpenAI API key (leave blank to add later): ")).trim();
  const databaseUrl =
    (await rl.question(
      "Database URL [postgresql://finetuneops:finetuneops@localhost:5432/finetuneops?schema=public]: ",
    )).trim() || "postgresql://finetuneops:finetuneops@localhost:5432/finetuneops?schema=public";
  const redisUrl =
    (await rl.question("Redis URL [redis://localhost:6379]: ")).trim() || "redis://localhost:6379";

  rl.close();

  copyTemplate(sourceDirectory, targetDirectory);

  const envFile = buildEnvFile({
    appUrl: "http://localhost:3000",
    databaseUrl,
    openAiKey,
    redisUrl,
  });

  require("fs").writeFileSync(path.join(targetDirectory, ".env"), envFile, "utf8");

  stdout.write(`\nFinetuneOps is ready in ${targetDirectory}\n\n`);
  stdout.write(`${formatNextSteps(targetName)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
