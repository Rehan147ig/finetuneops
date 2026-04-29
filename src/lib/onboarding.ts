import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findActiveInviteByToken } from "@/lib/invitations";
import type { WorkspaceRole } from "@/lib/authz";
// @ts-expect-error Shared with the seed script; typed locally in onboarding usage.
import { buildDemoWorkspaceSeed } from "../../prisma/demo-workspace.mjs";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seedDemoProject(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  workspaceName: string,
) {
  const demo = buildDemoWorkspaceSeed({
    workspaceName,
    workspaceSlug: slugify(workspaceName),
    projectName: process.env.DEMO_PROJECT_NAME || "Support Specialist v2",
  });

  const project = await tx.project.create({
    data: {
      organizationId,
      ...demo.project,
    },
  });

  await tx.traceEvent.createMany({
    data: demo.traceEvents.map((trace: Record<string, unknown>) => ({
      projectId: project.id,
      ...trace,
    })),
  });

  const datasets: Array<{ id: string; status: string }> = [];
  for (const dataset of demo.datasets as Record<string, unknown>[]) {
    const seededDataset = dataset as {
      name: string;
      version: string;
      source?: string;
      status: string;
      rowCount: number;
      qualityScore: number;
    };
    datasets.push(
      await tx.dataset.create({
        data: {
          projectId: project.id,
          name: seededDataset.name,
          version: seededDataset.version,
          source: seededDataset.source,
          status: seededDataset.status,
          rowCount: seededDataset.rowCount,
          qualityScore: seededDataset.qualityScore,
        },
      }),
    );
  }

  const experiments: Array<{ id: string; status: string }> = [];
  for (const [index, experiment] of (demo.experiments as Record<string, unknown>[]).entries()) {
    const seededExperiment = experiment as {
      name: string;
      goal: string;
      candidateModel: string;
      promptVersion: string;
      status: string;
      score: number;
      costEstimate: number;
    };
    experiments.push(
      await tx.experimentRun.create({
        data: {
          projectId: project.id,
          datasetId: datasets[index]?.id ?? datasets[0].id,
          name: seededExperiment.name,
          goal: seededExperiment.goal,
          candidateModel: seededExperiment.candidateModel,
          promptVersion: seededExperiment.promptVersion,
          status: seededExperiment.status,
          score: seededExperiment.score,
          costEstimate: seededExperiment.costEstimate,
        },
      }),
    );
  }

  const completedExperiment =
    experiments.find((experiment) => experiment.status === "promote") ?? experiments[0];

  const seededTrainingJob = demo.trainingJobs[0] as {
    name: string;
    modelBase: string;
    provider: string;
    status: string;
    progress: number;
    gpuType: string;
    gpuHours: number;
    checkpoint: string;
    startedAt?: Date;
    finishedAt?: Date;
  };
  const completedJob = await tx.trainingJob.create({
    data: {
      projectId: project.id,
      datasetId: datasets[0].id,
      experimentId: completedExperiment.id,
      name: seededTrainingJob.name,
      modelBase: seededTrainingJob.modelBase,
      provider: seededTrainingJob.provider,
      status: seededTrainingJob.status,
      progress: seededTrainingJob.progress,
      gpuType: seededTrainingJob.gpuType,
      gpuHours: seededTrainingJob.gpuHours,
      checkpoint: seededTrainingJob.checkpoint,
      startedAt: seededTrainingJob.startedAt,
      finishedAt: seededTrainingJob.finishedAt,
    },
  });

  await tx.evalRun.createMany({
    data: (demo.evalRuns as Record<string, unknown>[]).map((evalRun, index) => {
      const seededEval = evalRun as {
        name: string;
        benchmark: string;
        status: string;
        score: number;
        delta: number;
        judge: string;
      };

      return {
        projectId: project.id,
        datasetId: datasets[index]?.id ?? datasets[0].id,
        name: seededEval.name,
        benchmark: seededEval.benchmark,
        status: seededEval.status,
        score: seededEval.score,
        delta: seededEval.delta,
        judge: seededEval.judge,
      };
    }),
  });

  const release = await tx.modelRelease.create({
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
    },
  });

  await tx.reviewLink.create({
    data: {
      releaseId: release.id,
      token: demo.pendingRelease.reviewToken,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });

  await tx.activityLog.createMany({
    data: (demo.activityLogs as Record<string, unknown>[]).map((entry) => ({
      projectId: project.id,
      userId,
      type: entry.type as string,
      message: entry.message as string,
      metadata: JSON.stringify((entry.metadata as Record<string, unknown>) ?? {}),
      timestamp: entry.timestamp as Date,
    })),
  });

  return project;
}

export async function createWorkspaceUser(input: {
  name: string;
  email: string;
  passwordHash?: string;
  image?: string | null;
  workspaceName?: string;
  inviteToken?: string | null;
}) {
  const normalizedEmail = input.email.toLowerCase();
  const pendingInvite = input.inviteToken ? await findActiveInviteByToken(input.inviteToken) : null;

  return prisma.$transaction(async (tx) => {
    if (pendingInvite) {
      const user = await tx.user.create({
        data: {
          organizationId: pendingInvite.organizationId,
          name: input.name,
          email: normalizedEmail,
          image: input.image ?? undefined,
          passwordHash: input.passwordHash,
          role: pendingInvite.role,
          onboardingCompleted: true,
        },
      });

      await tx.workspaceInvite.update({
        where: {
          token: pendingInvite.token,
        },
        data: {
          acceptedAt: new Date(),
        },
      });

      return {
        user,
        organization: pendingInvite.organization,
      };
    }

    const workspaceName = input.workspaceName?.trim() || `${input.name.split(" ")[0]}'s Workspace`;
    const organization = await tx.organization.create({
      data: {
        name: workspaceName,
        slug: `${slugify(workspaceName)}-${Math.random().toString(36).slice(2, 8)}`,
        billingPlan: "free",
      },
    });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        email: normalizedEmail,
        image: input.image ?? undefined,
        passwordHash: input.passwordHash,
        role: "owner",
        onboardingCompleted: true,
      },
    });

    await seedDemoProject(tx, organization.id, user.id, workspaceName);

    return {
      user,
      organization,
    };
  });
}

export async function ensureOAuthUser(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  const normalizedEmail = input.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
    include: {
      organization: true,
    },
  });

  if (existingUser) {
    const updatedUser = await prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        name: input.name ?? existingUser.name,
        image: input.image ?? existingUser.image,
        emailVerified: new Date(),
      },
      include: {
        organization: true,
      },
    });

    return updatedUser;
  }

  const pendingInvite = await prisma.workspaceInvite.findFirst({
    where: {
      email: normalizedEmail,
      acceptedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (pendingInvite) {
    const user = await prisma.user.create({
      data: {
        organizationId: pendingInvite.organizationId,
        name: input.name ?? normalizedEmail.split("@")[0],
        email: normalizedEmail,
        image: input.image ?? undefined,
        emailVerified: new Date(),
        role: pendingInvite.role as WorkspaceRole,
        onboardingCompleted: true,
      },
      include: {
        organization: true,
      },
    });

    await prisma.workspaceInvite.update({
      where: {
        id: pendingInvite.id,
      },
      data: {
        acceptedAt: new Date(),
      },
    });

    return user;
  }

  const created = await createWorkspaceUser({
    name: input.name ?? normalizedEmail.split("@")[0],
    email: normalizedEmail,
    image: input.image,
  });

  return prisma.user.findUniqueOrThrow({
    where: {
      id: created.user.id,
    },
    include: {
      organization: true,
    },
  });
}
