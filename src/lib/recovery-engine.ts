import { prisma } from "@/lib/prisma";

export type RecoveryResult = {
  newDatasetId: string;
  removedCount: number;
  removedExampleIndices: number[];
};

export async function runRecovery(traReportId: string): Promise<RecoveryResult> {
  const traReport = await prisma.traReport.findUnique({
    where: { id: traReportId },
    include: {
      suspiciousExamples: true,
      regressionAlert: {
        include: {
          candidateRun: {
            include: {
              dataset: {
                include: {
                  examples: {
                    orderBy: {
                      createdAt: "asc",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!traReport || !traReport.regressionAlert.candidateRun.dataset) {
    throw new Error("Cannot run recovery: TraReport or original dataset not found.");
  }

  const originalDataset = traReport.regressionAlert.candidateRun.dataset;
  const suspiciousExamples = traReport.suspiciousExamples;

  // Only auto-remove examples the analysis is HIGHLY confident about. This bar
  // matches TRA's "high confidence" threshold (0.75); auto-deleting training
  // rows on a weaker (e.g. 0.6) signal is unsafe. Confidence is the analysis /
  // LLM-judge's self-reported score, and recovery is non-destructive (it writes
  // a new cleaned dataset version rather than mutating the original).
  const HIGH_CONFIDENCE_THRESHOLD = 0.75;
  const removeIds = new Set(
    suspiciousExamples
      .filter((ex) => ex.confidence >= HIGH_CONFIDENCE_THRESHOLD)
      .map((ex) => ex.exampleId)
  );

  const keepExamples = originalDataset.examples.filter((ex) => !removeIds.has(ex.id));

  const removedExampleIndices = originalDataset.examples
    .map((ex, idx) => (removeIds.has(ex.id) ? idx : -1))
    .filter((idx) => idx !== -1);

  const dateStr = new Date().toISOString().split("T")[0];
  const newDatasetName = `${originalDataset.name} — cleaned ${dateStr}`;

  const newDataset = await prisma.dataset.create({
    data: {
      projectId: originalDataset.projectId,
      name: newDatasetName,
      version: `${originalDataset.version}-cleaned`,
      source: "One-Click Dataset Cleanup",
      status: "processing",
      rowCount: keepExamples.length,
    },
  });

  if (keepExamples.length > 0) {
    await prisma.datasetExample.createMany({
      data: keepExamples.map((ex) => ({
        datasetId: newDataset.id,
        sourceTraceId: ex.sourceTraceId,
        inputText: ex.inputText,
        outputText: ex.outputText,
        metadata: ex.metadata,
      })),
    });
  }

  return {
    newDatasetId: newDataset.id,
    removedCount: removeIds.size,
    removedExampleIndices,
  };
}
