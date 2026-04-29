export type PromptVersionDiff = {
  added: string[];
  removed: string[];
  unchanged: string[];
};

export function extractVariables(content: string) {
  const seen = new Set<string>();
  const pattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

  for (const match of content.matchAll(pattern)) {
    const variableName = match[1]?.trim();

    if (variableName) {
      seen.add(variableName);
    }
  }

  return [...seen];
}

export function diffPromptVersions(versionA: string, versionB: string): PromptVersionDiff {
  const linesA = versionA.split(/\r?\n/);
  const linesB = versionB.split(/\r?\n/);
  const countsA = new Map<string, number>();
  const countsB = new Map<string, number>();

  for (const line of linesA) {
    countsA.set(line, (countsA.get(line) ?? 0) + 1);
  }

  for (const line of linesB) {
    countsB.set(line, (countsB.get(line) ?? 0) + 1);
  }

  const unchanged: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [line, count] of countsA.entries()) {
    const sharedCount = Math.min(count, countsB.get(line) ?? 0);

    for (let index = 0; index < sharedCount; index += 1) {
      unchanged.push(line);
    }

    for (let index = sharedCount; index < count; index += 1) {
      removed.push(line);
    }
  }

  for (const [line, count] of countsB.entries()) {
    const sharedCount = Math.min(count, countsA.get(line) ?? 0);

    for (let index = sharedCount; index < count; index += 1) {
      added.push(line);
    }
  }

  return {
    added,
    removed,
    unchanged,
  };
}

export function renderPromptTemplate(
  content: string,
  variables: Record<string, string> = {},
) {
  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName: string) => {
    return variables[variableName] ?? `{{${variableName}}}`;
  });
}
