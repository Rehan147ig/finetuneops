const fs = require("fs");
const path = require("path");

const EXCLUDED_PATHS = new Set([
  ".git",
  ".next",
  ".swc",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
  ".env",
]);

function resolveTargetDirectory(baseDirectory, targetName) {
  return path.resolve(baseDirectory, targetName);
}

function resolveSourceDirectory(currentDirectory) {
  return path.resolve(currentDirectory, "..", "..", "..");
}

function shouldCopyPath(relativePath) {
  const normalizedPath = relativePath.split(/[\\/]+/).join("/");

  return ![...EXCLUDED_PATHS].some(
    (segment) => normalizedPath === segment || normalizedPath.startsWith(`${segment}/`),
  );
}

function copyTemplate(sourceDirectory, targetDirectory, relativePath = "") {
  const sourcePath = path.join(sourceDirectory, relativePath);
  const destinationPath = path.join(targetDirectory, relativePath);
  const stats = fs.statSync(sourcePath);

  if (!shouldCopyPath(relativePath) && relativePath) {
    return;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });

    for (const entry of fs.readdirSync(sourcePath)) {
      copyTemplate(sourceDirectory, targetDirectory, path.join(relativePath, entry));
    }

    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function buildEnvFile({ databaseUrl, redisUrl, openAiKey, appUrl }) {
  return [
    'NEXT_PUBLIC_APP_NAME="FineTuneOps"',
    `APP_URL="${appUrl}"`,
    'NODE_ENV="development"',
    `DATABASE_URL="${databaseUrl}"`,
    `REDIS_URL="${redisUrl}"`,
    'RUN_DEMO_SEED="true"',
    'DEMO_WORKSPACE_NAME="Can of Soup Labs"',
    'DEMO_WORKSPACE_SLUG="can-of-soup-labs"',
    'DEMO_PROJECT_NAME="Support Specialist v2"',
    `OPENAI_API_KEY="${openAiKey}"`,
    'ANTHROPIC_API_KEY=""',
    'HUGGINGFACE_API_KEY=""',
    'OTEL_EXPORTER_OTLP_ENDPOINT=""',
    "",
  ].join("\n");
}

function formatNextSteps(targetName) {
  return [
    `1. cd ${targetName}`,
    "2. docker compose up --build",
    "3. Open http://localhost:3000",
    "4. Demo workspace data will be seeded automatically on first boot",
  ].join("\n");
}

module.exports = {
  buildEnvFile,
  copyTemplate,
  formatNextSteps,
  resolveSourceDirectory,
  resolveTargetDirectory,
  shouldCopyPath,
};
