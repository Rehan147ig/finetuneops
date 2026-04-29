import { PrismaClient } from "@prisma/client";
import { buildDemoWorkspaceSeed } from "./demo-workspace.mjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.reviewLink.deleteMany();
  await prisma.modelRelease.deleteMany();
  await prisma.evalRun.deleteMany();
  await prisma.trainingJob.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.experimentRun.deleteMany();
  await prisma.datasetQualityReport.deleteMany();
  await prisma.datasetExample.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.traceEvent.deleteMany();
  await prisma.providerCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();

  const demo = buildDemoWorkspaceSeed({
    workspaceName: process.env.DEMO_WORKSPACE_NAME,
    workspaceSlug: process.env.DEMO_WORKSPACE_SLUG,
    projectName: process.env.DEMO_PROJECT_NAME,
  });

  const organization = await prisma.organization.create({
    data: {
      ...demo.organization,
    },
  });

  const users = await Promise.all(
    demo.users.map((user) =>
      prisma.user.create({
        data: {
          organizationId: organization.id,
          ...user,
        },
      }),
    ),
  );

  const primaryUser = users[0];

  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      ...demo.project,
    },
  });

  await prisma.traceEvent.createMany({
    data: demo.traceEvents.map((trace) => ({
      projectId: project.id,
      ...trace,
    })),
  });

  const datasets = [];
  for (const [index, dataset] of demo.datasets.entries()) {
    datasets.push(
      await prisma.dataset.create({
        data: {
          projectId: project.id,
          ...dataset,
        },
      }),
    );

    const examples = demo.datasetExamples[index] ?? [];
    if (examples.length > 0) {
      await prisma.datasetExample.createMany({
        data: examples.map((example) => ({
          datasetId: datasets[index].id,
          inputText: example.inputText,
          outputText: example.outputText,
          metadata: JSON.stringify({
            source: "demo-workspace",
          }),
        })),
      });
    }
  }

  const readyDataset = datasets.find((dataset) => dataset.status === "ready") ?? datasets[0];

  const experiments = [];
  for (const [index, experiment] of demo.experiments.entries()) {
    experiments.push(
      await prisma.experimentRun.create({
        data: {
          projectId: project.id,
          datasetId: datasets[index]?.id ?? readyDataset.id,
          ...experiment,
        },
      }),
    );
  }

  const completedExperiment = experiments.find((experiment) => experiment.status === "promote") ?? experiments[0];

  const completedJob = await prisma.trainingJob.create({
    data: {
      projectId: project.id,
      datasetId: readyDataset.id,
      experimentId: completedExperiment.id,
      ...demo.trainingJobs[0],
    },
  });

  await prisma.backgroundJob.createMany({
    data: demo.backgroundJobs.map((job) => ({
      organizationId: organization.id,
      projectId: project.id,
      queueName: job.queueName,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      estimatedCompletionAt: job.estimatedCompletionAt,
      payload: JSON.stringify({ source: "demo-seed" }),
      logs: JSON.stringify(job.logs),
    })),
  });

  await prisma.evalRun.createMany({
    data: demo.evalRuns.map((evalRun, index) => ({
      projectId: project.id,
      datasetId: datasets[index]?.id ?? readyDataset.id,
      ...evalRun,
    })),
  });

  const pendingRelease = await prisma.modelRelease.create({
    data: {
      projectId: project.id,
      experimentId: completedExperiment.id,
      trainingJobId: completedJob.id,
      name: demo.pendingRelease.name,
      channel: demo.pendingRelease.channel,
      status: demo.pendingRelease.status,
      qualityGate: demo.pendingRelease.qualityGate,
      latencyGate: demo.pendingRelease.latencyGate,
      costGate: demo.pendingRelease.costGate,
      approvedBy: demo.pendingRelease.approvedBy,
      createdAt: new Date("2026-04-18T17:00:00.000Z"),
      updatedAt: new Date("2026-04-18T17:00:00.000Z"),
    },
  });

  await prisma.reviewLink.create({
    data: {
      releaseId: pendingRelease.id,
      token: demo.pendingRelease.reviewToken,
      expiresAt: new Date("2026-04-25T17:00:00.000Z"),
    },
  });

  await prisma.activityLog.createMany({
    data: demo.activityLogs.map((entry) => ({
      projectId: project.id,
      userId: primaryUser.id,
      type: entry.type,
      message: entry.message,
      metadata: JSON.stringify(entry.metadata),
      timestamp: entry.timestamp,
    })),
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    process.stderr.write(`${String(error)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
