export function buildEnvFile(input: {
  databaseUrl: string;
  redisUrl: string;
  openAiKey: string;
  appUrl: string;
}): string;

export function copyTemplate(
  sourceDirectory: string,
  targetDirectory: string,
  relativePath?: string,
): void;

export function formatNextSteps(targetName: string): string;

export function resolveSourceDirectory(currentDirectory: string): string;

export function resolveTargetDirectory(baseDirectory: string, targetName: string): string;

export function shouldCopyPath(relativePath: string): boolean;
