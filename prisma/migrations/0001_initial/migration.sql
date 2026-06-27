-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billingPlan" TEXT NOT NULL DEFAULT 'starter',
    "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
    "billingEmail" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeSubscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "stripeCurrentPeriodStart" TIMESTAMP(3),
    "stripeCurrentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "regressionThresholds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "promptTemplateId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "commitMessage" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evalScore" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "deployedAt" TIMESTAMP(3),
    "deployedBy" TEXT,
    "environment" TEXT,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "inputText" TEXT,
    "outputText" TEXT,
    "modelName" TEXT,
    "latencyMs" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'triaged',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "spanCount" INTEGER NOT NULL DEFAULT 0,
    "opportunityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedDatasetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "candidateModel" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "score" DOUBLE PRECISION,
    "costEstimate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT,
    "experimentId" TEXT,
    "name" TEXT NOT NULL,
    "modelBase" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "gpuType" TEXT,
    "gpuHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "checkpoint" TEXT,
    "openaiFileId" TEXT,
    "openaiJobId" TEXT,
    "pollCount" INTEGER NOT NULL DEFAULT 0,
    "progressNote" TEXT,
    "completedModelId" TEXT,
    "trainedTokens" INTEGER,
    "validationLoss" DOUBLE PRECISION,
    "providerJobId" TEXT,
    "fineTunedModelId" TEXT,
    "errorMessage" TEXT,
    "providerMetadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "SlackIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT,
    "jobId" TEXT,
    "name" TEXT NOT NULL,
    "benchmark" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "score" DOUBLE PRECISION,
    "scores" JSONB,
    "delta" DOUBLE PRECISION,
    "judge" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trainingJobId" TEXT,
    "modelId" TEXT,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baselineEvalRunId" TEXT NOT NULL,
    "candidateEvalRunId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "baselineScore" DOUBLE PRECISION NOT NULL,
    "candidateScore" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegressionAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraReport" (
    "id" TEXT NOT NULL,
    "regressionAlertId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rootCauseCategory" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "impactRating" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspiciousExample" (
    "id" TEXT NOT NULL,
    "traReportId" TEXT NOT NULL,
    "exampleId" TEXT NOT NULL,
    "exampleIndex" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL,
    "inputPreview" TEXT,
    "outputPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspiciousExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRelease" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "experimentId" TEXT,
    "trainingJobId" TEXT,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'gated',
    "qualityGate" TEXT NOT NULL,
    "latencyGate" TEXT NOT NULL,
    "costGate" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLink" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "decision" TEXT,
    "reviewerName" TEXT,
    "approverNotes" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "tracesUsed" INTEGER NOT NULL DEFAULT 0,
    "fineTuneJobsUsed" INTEGER NOT NULL DEFAULT 0,
    "overageTraces" INTEGER NOT NULL DEFAULT 0,
    "warningSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "queueName" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "estimatedCompletionAt" TIMESTAMP(3),
    "payload" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT,
    "logs" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetExample" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceTraceId" TEXT,
    "inputText" TEXT NOT NULL,
    "outputText" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetQualityReport" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "totalExamples" INTEGER NOT NULL,
    "goodExamples" INTEGER NOT NULL,
    "exactDuplicates" INTEGER NOT NULL,
    "nearDuplicates" INTEGER NOT NULL,
    "piiDetected" INTEGER NOT NULL,
    "tooShort" INTEGER NOT NULL,
    "tooLong" INTEGER NOT NULL,
    "emptyOutputs" INTEGER NOT NULL,
    "imbalanced" BOOLEAN NOT NULL,
    "languageMixed" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "duplicateScanSampled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetQualityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryJob" (
    "id" TEXT NOT NULL,
    "traReportId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "originalDatasetId" TEXT NOT NULL,
    "newDatasetId" TEXT,
    "removedExampleCount" INTEGER NOT NULL DEFAULT 0,
    "retrainJobId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RecoveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_idx" ON "AuditEvent"("organizationId");
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");
CREATE INDEX "AuditEvent_organizationId_action_idx" ON "AuditEvent"("organizationId", "action");
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX "Project_organizationId_createdAt_idx" ON "Project"("organizationId", "createdAt");
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_sourceType_sourceId_key" ON "SearchDocument"("sourceType", "sourceId");
CREATE INDEX "SearchDocument_organizationId_idx" ON "SearchDocument"("organizationId");
CREATE INDEX "SearchDocument_organizationId_createdAt_idx" ON "SearchDocument"("organizationId", "createdAt");
CREATE INDEX "SearchDocument_projectId_idx" ON "SearchDocument"("projectId");
CREATE INDEX "SearchDocument_sourceType_idx" ON "SearchDocument"("sourceType");
CREATE INDEX "SearchDocument_slug_idx" ON "SearchDocument"("slug");

-- CreateIndex
CREATE INDEX "PromptTemplate_organizationId_idx" ON "PromptTemplate"("organizationId");
CREATE INDEX "PromptTemplate_organizationId_createdAt_idx" ON "PromptTemplate"("organizationId", "createdAt");
CREATE INDEX "PromptTemplate_organizationId_deletedAt_idx" ON "PromptTemplate"("organizationId", "deletedAt");
CREATE INDEX "PromptTemplate_projectId_idx" ON "PromptTemplate"("projectId");

-- CreateIndex
CREATE INDEX "PromptVersion_promptTemplateId_idx" ON "PromptVersion"("promptTemplateId");
CREATE INDEX "PromptVersion_promptTemplateId_createdAt_idx" ON "PromptVersion"("promptTemplateId", "createdAt");

-- CreateIndex
CREATE INDEX "TraceEvent_projectId_idx" ON "TraceEvent"("projectId");
CREATE INDEX "TraceEvent_projectId_createdAt_idx" ON "TraceEvent"("projectId", "createdAt");
CREATE INDEX "TraceEvent_projectId_capturedAt_idx" ON "TraceEvent"("projectId", "capturedAt");
CREATE INDEX "TraceEvent_status_idx" ON "TraceEvent"("status");
CREATE INDEX "TraceEvent_projectId_status_idx" ON "TraceEvent"("projectId", "status");
CREATE INDEX "TraceEvent_opportunityScore_idx" ON "TraceEvent"("opportunityScore");

-- CreateIndex
CREATE INDEX "Dataset_projectId_idx" ON "Dataset"("projectId");
CREATE INDEX "Dataset_status_idx" ON "Dataset"("status");
CREATE INDEX "Dataset_projectId_status_idx" ON "Dataset"("projectId", "status");
CREATE INDEX "Dataset_qualityScore_idx" ON "Dataset"("qualityScore");

-- CreateIndex
CREATE INDEX "ExperimentRun_projectId_idx" ON "ExperimentRun"("projectId");
CREATE INDEX "ExperimentRun_projectId_createdAt_idx" ON "ExperimentRun"("projectId", "createdAt");
CREATE INDEX "ExperimentRun_status_idx" ON "ExperimentRun"("status");
CREATE INDEX "ExperimentRun_projectId_status_idx" ON "ExperimentRun"("projectId", "status");
CREATE INDEX "ExperimentRun_datasetId_idx" ON "ExperimentRun"("datasetId");

-- CreateIndex
CREATE INDEX "TrainingJob_projectId_idx" ON "TrainingJob"("projectId");
CREATE INDEX "TrainingJob_projectId_createdAt_idx" ON "TrainingJob"("projectId", "createdAt");
CREATE INDEX "TrainingJob_status_idx" ON "TrainingJob"("status");
CREATE INDEX "TrainingJob_projectId_status_idx" ON "TrainingJob"("projectId", "status");
CREATE INDEX "TrainingJob_datasetId_idx" ON "TrainingJob"("datasetId");
CREATE INDEX "TrainingJob_experimentId_idx" ON "TrainingJob"("experimentId");
CREATE INDEX "TrainingJob_openaiJobId_idx" ON "TrainingJob"("openaiJobId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_workspaceId_type_referenceId_key" ON "NotificationLog"("workspaceId", "type", "referenceId");
CREATE INDEX "NotificationLog_workspaceId_type_referenceId_idx" ON "NotificationLog"("workspaceId", "type", "referenceId");
CREATE INDEX "NotificationLog_workspaceId_sentAt_idx" ON "NotificationLog"("workspaceId", "sentAt");
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlackIntegration_workspaceId_key" ON "SlackIntegration"("workspaceId");

-- CreateIndex
CREATE INDEX "EvalRun_projectId_idx" ON "EvalRun"("projectId");
CREATE INDEX "EvalRun_projectId_createdAt_idx" ON "EvalRun"("projectId", "createdAt");
CREATE INDEX "EvalRun_status_idx" ON "EvalRun"("status");
CREATE INDEX "EvalRun_projectId_status_idx" ON "EvalRun"("projectId", "status");
CREATE INDEX "EvalRun_datasetId_idx" ON "EvalRun"("datasetId");
CREATE INDEX "EvalRun_jobId_idx" ON "EvalRun"("jobId");
CREATE INDEX "EvalRun_trainingJobId_idx" ON "EvalRun"("trainingJobId");

-- CreateIndex
CREATE UNIQUE INDEX "RegressionAlert_baselineEvalRunId_candidateEvalRunId_metric_key" ON "RegressionAlert"("baselineEvalRunId", "candidateEvalRunId", "metric");
CREATE INDEX "RegressionAlert_organizationId_idx" ON "RegressionAlert"("organizationId");
CREATE INDEX "RegressionAlert_projectId_idx" ON "RegressionAlert"("projectId");
CREATE INDEX "RegressionAlert_status_idx" ON "RegressionAlert"("status");
CREATE INDEX "RegressionAlert_severity_idx" ON "RegressionAlert"("severity");
CREATE INDEX "RegressionAlert_createdAt_idx" ON "RegressionAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TraReport_regressionAlertId_key" ON "TraReport"("regressionAlertId");
CREATE INDEX "TraReport_rootCauseCategory_idx" ON "TraReport"("rootCauseCategory");
CREATE INDEX "TraReport_confidence_idx" ON "TraReport"("confidence");
CREATE INDEX "TraReport_createdAt_idx" ON "TraReport"("createdAt");

-- CreateIndex
CREATE INDEX "SuspiciousExample_traReportId_idx" ON "SuspiciousExample"("traReportId");
CREATE INDEX "SuspiciousExample_category_idx" ON "SuspiciousExample"("category");
CREATE INDEX "SuspiciousExample_confidence_idx" ON "SuspiciousExample"("confidence");
CREATE INDEX "SuspiciousExample_impactScore_idx" ON "SuspiciousExample"("impactScore");

-- CreateIndex
CREATE INDEX "ModelRelease_projectId_idx" ON "ModelRelease"("projectId");
CREATE INDEX "ModelRelease_projectId_createdAt_idx" ON "ModelRelease"("projectId", "createdAt");
CREATE INDEX "ModelRelease_status_idx" ON "ModelRelease"("status");
CREATE INDEX "ModelRelease_projectId_status_idx" ON "ModelRelease"("projectId", "status");
CREATE INDEX "ModelRelease_experimentId_idx" ON "ModelRelease"("experimentId");
CREATE INDEX "ModelRelease_trainingJobId_idx" ON "ModelRelease"("trainingJobId");

-- CreateIndex
CREATE INDEX "ActivityLog_projectId_idx" ON "ActivityLog"("projectId");
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt");
CREATE INDEX "ActivityLog_projectId_timestamp_idx" ON "ActivityLog"("projectId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLink_token_key" ON "ReviewLink"("token");
CREATE INDEX "ReviewLink_token_expiresAt_idx" ON "ReviewLink"("token", "expiresAt");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_organizationId_email_idx" ON "WorkspaceInvite"("organizationId", "email");
CREATE INDEX "WorkspaceInvite_token_expiresAt_idx" ON "WorkspaceInvite"("token", "expiresAt");
CREATE UNIQUE INDEX "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_organizationId_revokedAt_idx" ON "ApiKey"("organizationId", "revokedAt");
CREATE INDEX "ApiKey_createdByUserId_idx" ON "ApiKey"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingUsage_organizationId_periodStart_periodEnd_key" ON "BillingUsage"("organizationId", "periodStart", "periodEnd");
CREATE INDEX "BillingUsage_organizationId_idx" ON "BillingUsage"("organizationId");
CREATE INDEX "BillingUsage_organizationId_periodStart_idx" ON "BillingUsage"("organizationId", "periodStart");
CREATE INDEX "BillingUsage_organizationId_periodEnd_idx" ON "BillingUsage"("organizationId", "periodEnd");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx" ON "ProcessedWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_organizationId_idx" ON "BackgroundJob"("organizationId");
CREATE INDEX "BackgroundJob_organizationId_createdAt_idx" ON "BackgroundJob"("organizationId", "createdAt");
CREATE INDEX "BackgroundJob_status_idx" ON "BackgroundJob"("status");
CREATE INDEX "BackgroundJob_organizationId_status_idx" ON "BackgroundJob"("organizationId", "status");
CREATE INDEX "BackgroundJob_projectId_status_idx" ON "BackgroundJob"("projectId", "status");
CREATE INDEX "BackgroundJob_jobType_status_idx" ON "BackgroundJob"("jobType", "status");

-- CreateIndex
CREATE INDEX "ProviderCredential_workspaceId_idx" ON "ProviderCredential"("workspaceId");
CREATE INDEX "ProviderCredential_workspaceId_provider_idx" ON "ProviderCredential"("workspaceId", "provider");
CREATE INDEX "ProviderCredential_workspaceId_provider_isActive_idx" ON "ProviderCredential"("workspaceId", "provider", "isActive");
CREATE INDEX "ProviderCredential_workspaceId_createdAt_idx" ON "ProviderCredential"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DatasetExample_datasetId_createdAt_idx" ON "DatasetExample"("datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetQualityReport_datasetId_key" ON "DatasetQualityReport"("datasetId");
CREATE INDEX "DatasetQualityReport_datasetId_idx" ON "DatasetQualityReport"("datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryJob_traReportId_key" ON "RecoveryJob"("traReportId");
CREATE INDEX "RecoveryJob_status_idx" ON "RecoveryJob"("status");
CREATE INDEX "RecoveryJob_originalDatasetId_idx" ON "RecoveryJob"("originalDatasetId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_promptTemplateId_fkey" FOREIGN KEY ("promptTemplateId") REFERENCES "PromptTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TraceEvent" ADD CONSTRAINT "TraceEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingJob" ADD CONSTRAINT "TrainingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingJob" ADD CONSTRAINT "TrainingJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingJob" ADD CONSTRAINT "TrainingJob_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ExperimentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlackIntegration" ADD CONSTRAINT "SlackIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_trainingJobId_fkey" FOREIGN KEY ("trainingJobId") REFERENCES "TrainingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegressionAlert" ADD CONSTRAINT "RegressionAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegressionAlert" ADD CONSTRAINT "RegressionAlert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegressionAlert" ADD CONSTRAINT "RegressionAlert_baselineEvalRunId_fkey" FOREIGN KEY ("baselineEvalRunId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegressionAlert" ADD CONSTRAINT "RegressionAlert_candidateEvalRunId_fkey" FOREIGN KEY ("candidateEvalRunId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TraReport" ADD CONSTRAINT "TraReport_regressionAlertId_fkey" FOREIGN KEY ("regressionAlertId") REFERENCES "RegressionAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuspiciousExample" ADD CONSTRAINT "SuspiciousExample_traReportId_fkey" FOREIGN KEY ("traReportId") REFERENCES "TraReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelRelease" ADD CONSTRAINT "ModelRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelRelease" ADD CONSTRAINT "ModelRelease_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ExperimentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelRelease" ADD CONSTRAINT "ModelRelease_trainingJobId_fkey" FOREIGN KEY ("trainingJobId") REFERENCES "TrainingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewLink" ADD CONSTRAINT "ReviewLink_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "ModelRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingUsage" ADD CONSTRAINT "BillingUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DatasetExample" ADD CONSTRAINT "DatasetExample_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DatasetQualityReport" ADD CONSTRAINT "DatasetQualityReport_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryJob" ADD CONSTRAINT "RecoveryJob_traReportId_fkey" FOREIGN KEY ("traReportId") REFERENCES "TraReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryJob" ADD CONSTRAINT "RecoveryJob_originalDatasetId_fkey" FOREIGN KEY ("originalDatasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryJob" ADD CONSTRAINT "RecoveryJob_newDatasetId_fkey" FOREIGN KEY ("newDatasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecoveryJob" ADD CONSTRAINT "RecoveryJob_retrainJobId_fkey" FOREIGN KEY ("retrainJobId") REFERENCES "TrainingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
