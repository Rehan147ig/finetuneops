import { describe, expect, it, vi } from "vitest";
import { runRecovery } from "./recovery-engine";
import { prisma } from "./prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    traReport: {
      findUnique: vi.fn(),
    },
    dataset: {
      create: vi.fn(),
    },
    datasetExample: {
      createMany: vi.fn(),
    },
  },
}));

describe("recovery-engine", () => {
  it("runRecovery removes examples with confidence > 0.6 and creates a new dataset", async () => {
    vi.mocked(prisma.traReport.findUnique).mockResolvedValue({
      id: "report_1",
      suspiciousExamples: [
        { exampleId: "ex_1", confidence: 0.9 },
        { exampleId: "ex_2", confidence: 0.5 },
        { exampleId: "ex_3", confidence: 0.7 },
      ],
      regressionAlert: {
        candidateRun: {
          dataset: {
            id: "ds_1",
            projectId: "proj_1",
            name: "Original Dataset",
            version: "v1",
            examples: [
              { id: "ex_1", inputText: "A", outputText: "A" },
              { id: "ex_2", inputText: "B", outputText: "B" },
              { id: "ex_3", inputText: "C", outputText: "C" },
              { id: "ex_4", inputText: "D", outputText: "D" },
            ],
          },
        },
      },
    } as any);

    vi.mocked(prisma.dataset.create).mockResolvedValue({
      id: "ds_2",
    } as any);

    const result = await runRecovery("report_1");

    expect(result.removedCount).toBe(2);
    expect(result.removedExampleIndices).toEqual([0, 2]);
    expect(result.newDatasetId).toBe("ds_2");

    expect(prisma.dataset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: expect.stringContaining("Original Dataset — recovered"),
          rowCount: 2,
        }),
      })
    );

    expect(prisma.datasetExample.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ datasetId: "ds_2", inputText: "B" }),
          expect.objectContaining({ datasetId: "ds_2", inputText: "D" }),
        ]),
      })
    );
  });
});
