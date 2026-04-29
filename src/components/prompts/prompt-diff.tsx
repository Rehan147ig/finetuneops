"use client";

import { diffPromptVersions } from "@/lib/prompt-utils";

type PromptDiffProps = {
  versionAContent: string;
  versionBContent: string;
  versionALabel?: string;
  versionBLabel?: string;
};

function buildLineCounts(lines: string[]) {
  const counts = new Map<string, number>();

  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  return counts;
}

function lineTone(line: string, counts: Map<string, number>, tone: "added" | "removed") {
  const remaining = counts.get(line) ?? 0;

  if (remaining <= 0) {
    return "unchanged";
  }

  counts.set(line, remaining - 1);
  return tone;
}

export function PromptDiff({
  versionAContent,
  versionBContent,
  versionALabel = "Previous version",
  versionBLabel = "Selected version",
}: PromptDiffProps) {
  const diff = diffPromptVersions(versionAContent, versionBContent);
  const removedCounts = buildLineCounts(diff.removed);
  const addedCounts = buildLineCounts(diff.added);
  const linesA = versionAContent.split(/\r?\n/);
  const linesB = versionBContent.split(/\r?\n/);

  return (
    <div className="prompt-diff">
      <div className="prompt-diff-column">
        <p className="eyebrow">{versionALabel}</p>
        <div className="prompt-diff-panel">
          {linesA.map((line, index) => (
            <div
              key={`a-${index}-${line}`}
              className={`prompt-diff-line ${lineTone(line, removedCounts, "removed")}`}
            >
              <span className="prompt-diff-number">{index + 1}</span>
              <code>{line || " "}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="prompt-diff-column">
        <p className="eyebrow">{versionBLabel}</p>
        <div className="prompt-diff-panel">
          {linesB.map((line, index) => (
            <div
              key={`b-${index}-${line}`}
              className={`prompt-diff-line ${lineTone(line, addedCounts, "added")}`}
            >
              <span className="prompt-diff-number">{index + 1}</span>
              <code>{line || " "}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
