import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getDateRange } from "@/lib/analytics-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

type ExportType = "traces" | "datasets" | "jobs";

function escapeCsv(value: string | number | null | undefined) {
  const stringValue = value == null ? "" : String(value);
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function formatCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ];

  return lines.join("\n");
}

function parseRange(rawRange: string | null): "7d" | "30d" | "90d" {
  if (rawRange === "7d" || rawRange === "90d") {
    return rawRange;
  }

  return "30d";
}

function estimateTrainingJobCost(gpuHours: number) {
  return Number((gpuHours * 110).toFixed(2));
}

export const GET = withApiErrorHandling("analytics_export_failed", async (request) => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rl = await checkRateLimit(session.user.organizationId, "api");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as ExportType | null;
  const range = parseRange(searchParams.get("range"));
  const { from } = getDateRange(range);

  if (!type || !["traces", "datasets", "jobs"].includes(type)) {
    return NextResponse.json(
      { error: "Unknown export type." },
      { status: 400, headers: rateLimitHeaders(rl) },
    );
  }

  let csv = "";

  if (type === "traces") {
    const traces = await prisma.traceEvent.findMany({
      where: {
        project: {
          is: {
            organizationId: session.user.organizationId,
          },
        },
        capturedAt: {
          gte: from,
        },
      },
      select: {
        id: true,
        title: true,
        modelName: true,
        status: true,
        severity: true,
        capturedAt: true,
        latencyMs: true,
      },
      orderBy: {
        capturedAt: "desc",
      },
    });

    csv = formatCsv(
      traces.map((trace) => ({
        id: trace.id,
        title: trace.title,
        model: trace.modelName ?? "",
        status: trace.status,
        severity: trace.severity,
        capturedAt: trace.capturedAt.toISOString(),
        latencyMs: trace.latencyMs ?? 0,
      })),
    );
  }

  if (type === "datasets") {
    const datasets = await prisma.dataset.findMany({
      where: {
        project: {
          is: {
            organizationId: session.user.organizationId,
          },
        },
      },
      include: {
        qualityReport: {
          select: {
            healthScore: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    csv = formatCsv(
      datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        version: dataset.version,
        exampleCount: dataset.rowCount,
        healthScore: dataset.qualityReport?.healthScore ?? dataset.qualityScore ?? 0,
        createdAt: dataset.createdAt.toISOString(),
      })),
    );
  }

  if (type === "jobs") {
    const jobs = await prisma.trainingJob.findMany({
      where: {
        project: {
          is: {
            organizationId: session.user.organizationId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        modelBase: true,
        status: true,
        trainedTokens: true,
        gpuHours: true,
        finishedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    csv = formatCsv(
      jobs.map((job) => ({
        id: job.id,
        name: job.name,
        model: job.modelBase,
        status: job.status,
        trainedTokens: job.trainedTokens ?? 0,
        estimatedCost: estimateTrainingJobCost(job.gpuHours),
        completedAt: job.finishedAt?.toISOString() ?? "",
      })),
    );
  }

  const filenameDate = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...rateLimitHeaders(rl),
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="finetuneops-${type}-${filenameDate}.csv"`,
    },
  });
});
