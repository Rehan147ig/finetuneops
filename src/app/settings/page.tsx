import { createApiKeyAction, inviteMemberAction, revokeApiKeyAction } from "@/app/settings/actions";
import { createBillingPortalAction, createCheckoutSessionAction } from "@/app/settings/billing-actions";
import {
  createCredentialAction,
  deleteCredentialAction,
  testCredentialAction,
} from "@/app/settings/credential-actions";
import { reindexSearchAction } from "@/app/settings/ops-actions";
import {
  connectSlackAction,
  disconnectSlackAction,
  testSlackConnectionAction,
} from "@/app/settings/slack-actions";
import { SectionCard } from "@/components/dashboard/section-card";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { requireAuthSession } from "@/lib/auth-session";
import { getAuditEvents } from "@/lib/audit";
import { canManageApiKeys, canManageIntegrations, canManageWorkspace, canViewAuditLog } from "@/lib/authz";
import { billingPlans, calculateTraceOverageCharge, getAnnualPrice, getBillingPlan } from "@/lib/billing";
import { getOrCreateBillingUsage, getWorkspaceUsage } from "@/lib/billing-data";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSearchDocumentStats } from "@/lib/search-data";
import { getWorkspaceData } from "@/lib/workspace-data";

const integrations = [
  "Authentication provider for teams and organization roles",
  "Managed Postgres for production metadata",
  "S3 or R2 buckets for dataset and artifact storage",
  "Stripe billing for subscription and usage metering",
  "GPU providers such as RunPod, Vast, or Lambda",
];

const recoveryChecklist = [
  "Validate Postgres backups daily and confirm retention.",
  "Rotate provider credentials and API keys on a defined cadence.",
  "Reindex workspace search after bulk imports or recovery events.",
  "Verify worker health, queue depth, and Slack ops alerts before deploys.",
];

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAuditAction(action: string) {
  return action.replace(/_/g, " ");
}

export default async function SettingsPage() {
  const session = await requireAuthSession();
  const { summary } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });
  const workspace = await prisma.organization.findUniqueOrThrow({
    where: {
      id: session.user.organizationId,
    },
    include: {
      users: {
        orderBy: {
          createdAt: "asc",
        },
      },
      invites: {
        where: {
          acceptedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
      apiKeys: {
        orderBy: {
          createdAt: "desc",
        },
      },
      providerCredentials: {
        where: {
          isActive: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      slackIntegration: true,
    },
  });
  const canManage = canManageWorkspace(session.user.role);
  const canManageSecrets = canManageIntegrations(session.user.role);
  const canManageKeys = canManageApiKeys(session.user.role);
  const canSeeAudit = canViewAuditLog(session.user.role);
  const usage =
    (await getWorkspaceUsage(session.user.organizationId)) ??
    (await getOrCreateBillingUsage(session.user.organizationId)).usage;
  const currentPlan = getBillingPlan(workspace.billingPlan);
  const usagePercent = Math.min((usage.tracesUsed / currentPlan.includedTraces) * 100, 100);
  const providerStatus = ["openai", "anthropic", "huggingface"].map((provider) => {
    const credential = workspace.providerCredentials.find((item) => item.provider === provider);
    return {
      provider,
      credential,
    };
  });
  const [auditEvents, searchStats] = await Promise.all([
    canSeeAudit ? getAuditEvents(session.user.organizationId, 10) : Promise.resolve([]),
    canManage ? getSearchDocumentStats(session.user.organizationId) : Promise.resolve(null),
  ]);

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Prepare the platform for real tenants, billing, and provider isolation</h2>
        </div>
        <span className="pill warning">Still local-first</span>
      </div>

      <div className="page-grid two-column">
        <SectionCard
          title="Production checklist"
          description="These are the integrations that turn the post-training workspace into a business."
          action="Core SaaS"
        >
          <ol className="checklist">
            {integrations.map((integration) => (
              <li key={integration}>{integration}</li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="Workspace summary"
          description="The product should make tenant and team context visible everywhere."
          action={summary.organizationName}
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Billing plan</p>
              <h3>{summary.billingPlan}</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Projects</p>
              <h3>{summary.projectCount} tracked projects</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Members</p>
              <h3>{summary.memberCount} workspace members</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Active status</p>
              <h3>{summary.activeProjectStatus}</h3>
            </article>
          </div>
        </SectionCard>

        <SectionCard
          title="Billing and usage"
          description="Customers pay for convenience, so limits and spend need to be obvious before the product blocks them."
          action={`${currentPlan.name} plan`}
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Billing status</p>
              <h3>{workspace.stripeSubscriptionStatus}</h3>
              <p className="muted">
                {workspace.trialEndsAt
                  ? `Trial ends ${workspace.trialEndsAt.toLocaleDateString("en-US")}`
                  : `Billing interval: ${workspace.billingInterval}`}
              </p>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Trace usage</p>
              <h3>
                {formatNumber(usage.tracesUsed)} / {formatNumber(currentPlan.includedTraces)}
              </h3>
              <p className="muted">{formatPercent(usagePercent)} of included traces used</p>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Fine-tune jobs</p>
              <h3>
                {formatNumber(usage.fineTuneJobsUsed)} / {currentPlan.includedFineTuneJobs === "unlimited" ? "Unlimited" : currentPlan.includedFineTuneJobs}
              </h3>
              <p className="muted">Tracked for the current billing window</p>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Projected overage</p>
              <h3>{formatCurrency(calculateTraceOverageCharge(usage.overageTraces))}</h3>
              <p className="muted">{formatNumber(usage.overageTraces)} overage traces this period</p>
            </article>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${usagePercent}%` }} />
          </div>
          {canManage && workspace.stripeCustomerId ? (
            <ActionForm action={createBillingPortalAction}>
              <ActionSubmitButton
                idleLabel="Open billing portal"
                pendingLabel="Opening portal..."
                className="secondary-button"
              />
            </ActionForm>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Plans"
          description="Stripe checkout upgrades the workspace, while Free stays hard-capped and paid plans meter overage."
          action="Monthly and annual"
        >
          <div className="mini-grid">
            {Object.values(billingPlans).map((plan) => (
              <article key={plan.id} className="panel mini-card">
                <p className="eyebrow">{plan.name}</p>
                <h3>
                  {plan.monthlyPrice === 0 ? "Free" : `${formatCurrency(plan.monthlyPrice)}/month`}
                </h3>
                <p className="muted">
                  {plan.monthlyPrice === 0
                    ? "Start with a single workspace and light usage."
                    : `${formatCurrency(getAnnualPrice(plan.monthlyPrice))}/year when billed annually`}
                </p>
                <ol className="checklist">
                  <li>{formatNumber(plan.includedTraces)} traces per month</li>
                  <li>
                    {plan.includedTeamMembers === "unlimited"
                      ? "Unlimited team members"
                      : `${plan.includedTeamMembers} team members`}
                  </li>
                  <li>
                    {plan.includedFineTuneJobs === "unlimited"
                      ? "Unlimited fine-tune jobs"
                      : `${plan.includedFineTuneJobs} fine-tune job${plan.includedFineTuneJobs === 1 ? "" : "s"} per month`}
                  </li>
                  <li>{plan.support}</li>
                </ol>
                {canManage && plan.id !== "free" ? (
                  <div className="auth-actions">
                    <ActionForm action={createCheckoutSessionAction}>
                      <input name="planId" type="hidden" value={plan.id} />
                      <input name="interval" type="hidden" value="monthly" />
                      <ActionSubmitButton
                        idleLabel="Choose monthly"
                        pendingLabel="Opening checkout..."
                        className="primary-button"
                      />
                    </ActionForm>
                    <ActionForm action={createCheckoutSessionAction}>
                      <input name="planId" type="hidden" value={plan.id} />
                      <input name="interval" type="hidden" value="annual" />
                      <ActionSubmitButton
                        idleLabel="Choose annual"
                        pendingLabel="Opening checkout..."
                        className="secondary-button"
                      />
                    </ActionForm>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Provider credentials"
          description="Encrypted provider keys unlock real fine-tunes, eval sync, and worker integrations without exposing secrets."
          action={`${workspace.providerCredentials.length} connected`}
        >
          <div className="list">
            {providerStatus.map(({ provider, credential }) => (
              <article key={provider} className="list-item">
                <div className="list-copy">
                  <h3>{provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "Hugging Face"}</h3>
                  <p className="muted">
                    {credential
                      ? credential.lastTestedAt
                        ? credential.lastTestOk
                          ? `Tested ${credential.lastTestedAt.toLocaleString("en-US")} and healthy`
                          : `Tested ${credential.lastTestedAt.toLocaleString("en-US")} and failed`
                        : "Not tested yet"
                      : "Not connected"}
                  </p>
                </div>
                <div className="mini-grid">
                  <div className="value-stack">
                    <strong>
                      {credential
                        ? credential.lastTestedAt
                          ? credential.lastTestOk
                            ? "Connected"
                            : "Needs attention"
                          : "Pending test"
                        : "Not connected"}
                    </strong>
                    <span className="muted">{credential?.label ?? "No active credential"}</span>
                  </div>
                  {credential && canManageSecrets ? (
                    <div className="auth-actions">
                      <ActionForm action={testCredentialAction}>
                        <input name="credentialId" type="hidden" value={credential.id} />
                        <ActionSubmitButton
                          idleLabel="Test connection"
                          pendingLabel="Testing..."
                          className="secondary-button"
                        />
                      </ActionForm>
                      <ActionForm action={deleteCredentialAction}>
                        <input name="credentialId" type="hidden" value={credential.id} />
                        <ActionSubmitButton
                          idleLabel="Delete"
                          pendingLabel="Deleting..."
                          className="secondary-button"
                        />
                      </ActionForm>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {canManageSecrets ? (
            <ActionForm action={createCredentialAction} resetOnSuccess className="stack-form">
              <label className="field">
                <span>Provider</span>
                <select name="provider" defaultValue="openai">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="huggingface">Hugging Face</option>
                </select>
              </label>
              <label className="field">
                <span>Label</span>
                <input name="label" type="text" placeholder="Production key" required />
              </label>
              <label className="field">
                <span>API key</span>
                <input name="apiKey" type="password" placeholder="Paste API key" required />
              </label>
              <ActionSubmitButton idleLabel="Save credential" pendingLabel="Saving..." />
            </ActionForm>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Slack alerts"
          description="Send fine-tune and dataset alerts into the team channel without making people live in their inbox."
          action={workspace.slackIntegration?.isActive ? workspace.slackIntegration.channel : "Not connected"}
        >
          <div className="list">
            <article className="list-item">
              <div className="list-copy">
                <h3>Workspace Slack channel</h3>
                <p className="muted">
                  {workspace.slackIntegration?.isActive
                    ? `Connected to ${workspace.slackIntegration.channel}`
                    : "No Slack webhook connected yet."}
                </p>
              </div>
              <div className="value-stack">
                <strong>{workspace.slackIntegration?.isActive ? "Connected" : "Disconnected"}</strong>
              </div>
            </article>
          </div>
          {canManageSecrets ? (
            <div className="auth-actions">
              <ActionForm action={connectSlackAction} resetOnSuccess className="stack-form">
                <label className="field">
                  <span>Webhook URL</span>
                  <input
                    name="webhookUrl"
                    type="password"
                    placeholder="https://hooks.slack.com/services/..."
                    required
                  />
                </label>
                <label className="field">
                  <span>Channel</span>
                  <input
                    name="channel"
                    type="text"
                    placeholder="#alerts"
                    defaultValue={workspace.slackIntegration?.channel ?? "#alerts"}
                    required
                  />
                </label>
                <ActionSubmitButton idleLabel="Connect Slack" pendingLabel="Connecting..." />
              </ActionForm>
              {workspace.slackIntegration?.isActive ? (
                <>
                  <ActionForm action={testSlackConnectionAction}>
                    <ActionSubmitButton
                      idleLabel="Test connection"
                      pendingLabel="Testing..."
                      className="secondary-button"
                    />
                  </ActionForm>
                  <ActionForm action={disconnectSlackAction}>
                    <ActionSubmitButton
                      idleLabel="Disconnect"
                      pendingLabel="Disconnecting..."
                      className="secondary-button"
                    />
                  </ActionForm>
                </>
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Current schema"
          description="The Prisma models now reflect the full trace-to-release loop."
          action="Organizations, traces, datasets, experiments, jobs, evals, releases"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Organizations</p>
              <h3>Multi-tenant boundary for billing and permissions.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Projects</p>
              <h3>Each model initiative gets isolated datasets and runs.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Execution data</p>
              <h3>Jobs and evals become the operational heartbeat of the app.</h3>
            </article>
          </div>
        </SectionCard>

        <SectionCard
          title="Team members"
          description="Workspace access should stay explicit and role-based."
          action={`${workspace.users.length} members`}
        >
          <div className="list">
            {workspace.users.map((user) => (
              <article key={user.id} className="list-item">
                <div className="list-copy">
                  <h3>{user.name}</h3>
                  <p className="muted">{user.email}</p>
                </div>
                <div className="value-stack">
                  <strong>{user.role}</strong>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Pending invites"
          description="Invites land in the right workspace and role before a teammate signs in."
          action={`${workspace.invites.length} active`}
        >
          <div className="list">
            {workspace.invites.length === 0 ? (
              <article className="list-item">
                <div className="list-copy">
                  <h3>No pending invites</h3>
                  <p className="muted">Invitations will appear here until they are accepted.</p>
                </div>
              </article>
            ) : (
              workspace.invites.map((invite) => (
                <article key={invite.id} className="list-item">
                  <div className="list-copy">
                    <h3>{invite.email}</h3>
                    <p className="muted">Expires {invite.expiresAt.toLocaleDateString("en-US")}</p>
                  </div>
                  <div className="value-stack">
                    <strong>{invite.role}</strong>
                  </div>
                </article>
              ))
            )}
          </div>
          {canManage ? (
            <ActionForm action={inviteMemberAction} resetOnSuccess className="stack-form">
              <label className="field">
                <span>Invite teammate email</span>
                <input name="email" type="email" required />
              </label>
              <label className="field">
                <span>Role</span>
                <select name="role" defaultValue="engineer">
                  <option value="admin">Admin</option>
                  <option value="engineer">Engineer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <ActionSubmitButton idleLabel="Send invite" pendingLabel="Sending invite..." />
            </ActionForm>
          ) : null}
        </SectionCard>

        <SectionCard
          title="SDK API keys"
          description="API keys are shown once, then stored only as hashes."
          action={`${workspace.apiKeys.length} keys`}
        >
          <div className="list">
            {workspace.apiKeys.map((apiKey) => (
              <article key={apiKey.id} className="list-item">
                <div className="list-copy">
                  <h3>{apiKey.name}</h3>
                  <p className="muted">
                    {apiKey.keyPrefix}_****{apiKey.lastFour}
                  </p>
                </div>
                <div className="mini-grid">
                  <div className="value-stack">
                    <strong>{apiKey.revokedAt ? "Revoked" : "Active"}</strong>
                    <span className="muted">
                      Created {apiKey.createdAt.toLocaleDateString("en-US")}
                    </span>
                  </div>
                  {!apiKey.revokedAt && canManageKeys ? (
                    <ActionForm action={revokeApiKeyAction}>
                      <input name="apiKeyId" type="hidden" value={apiKey.id} />
                      <ActionSubmitButton
                        idleLabel="Revoke"
                        pendingLabel="Revoking..."
                        className="secondary-button"
                      />
                    </ActionForm>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {canManageKeys ? (
            <ActionForm action={createApiKeyAction} resetOnSuccess className="stack-form">
              <label className="field">
                <span>Key name</span>
                <input name="name" type="text" placeholder="Production SDK key" required />
              </label>
              <ActionSubmitButton idleLabel="Generate API key" pendingLabel="Generating..." />
            </ActionForm>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Operational controls"
          description="Keep search, indexing, and recovery workflows visible so the workspace stays supportable under load."
          action={searchStats ? `${formatNumber(searchStats.workspaceDocuments)} indexed docs` : "Managers only"}
        >
          {searchStats ? (
            <>
              <div className="mini-grid">
                <article className="panel mini-card">
                  <p className="eyebrow">Workspace search docs</p>
                  <h3>{formatNumber(searchStats.workspaceDocuments)}</h3>
                  <p className="muted">Traces, datasets, and prompts indexed for this tenant</p>
                </article>
                <article className="panel mini-card">
                  <p className="eyebrow">Public docs indexed</p>
                  <h3>{formatNumber(searchStats.publicDocuments)}</h3>
                  <p className="muted">Shared documentation content available in public search</p>
                </article>
                <article className="panel mini-card">
                  <p className="eyebrow">Last indexed</p>
                  <h3>{formatDateTime(searchStats.lastIndexedAt)}</h3>
                  <p className="muted">Use reindex after bulk imports or recovery work</p>
                </article>
              </div>
              <div className="list">
                {searchStats.bySourceType.map((bucket) => (
                  <article className="list-item" key={bucket.sourceType}>
                    <div className="list-copy">
                      <h3>{bucket.sourceType.replace(/_/g, " ")}</h3>
                      <p className="muted">Indexed documents ready for semantic search</p>
                    </div>
                    <div className="value-stack">
                      <strong>{formatNumber(bucket.count)}</strong>
                    </div>
                  </article>
                ))}
              </div>
              <ActionForm action={reindexSearchAction}>
                <ActionSubmitButton
                  idleLabel="Reindex workspace search"
                  pendingLabel="Reindexing..."
                  className="secondary-button"
                />
              </ActionForm>
            </>
          ) : (
            <p className="muted">Only workspace owners and admins can view or run operational controls.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Audit history"
          description="Sensitive workspace changes are captured so teams can explain who changed production behavior and when."
          action={canSeeAudit ? `${auditEvents.length} recent events` : "Managers only"}
        >
          {canSeeAudit ? (
            <div className="list">
              {auditEvents.length === 0 ? (
                <article className="list-item">
                  <div className="list-copy">
                    <h3>No audit events yet</h3>
                    <p className="muted">Sensitive workspace changes will appear here as the team uses the control plane.</p>
                  </div>
                </article>
              ) : (
                auditEvents.map((event) => (
                  <article key={event.id} className="list-item">
                    <div className="list-copy">
                      <h3>{formatAuditAction(event.action)}</h3>
                      <p className="muted">
                        {event.actorName}
                        {event.actorEmail ? ` (${event.actorEmail})` : ""} changed{" "}
                        {event.targetName ?? event.targetType}
                      </p>
                    </div>
                    <div className="value-stack">
                      <strong>{event.actorRole ?? "unknown role"}</strong>
                      <span className="muted">{formatDateTime(event.createdAt)}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : (
            <p className="muted">Only workspace owners and admins can view the audit trail.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Backup and recovery"
          description="Operational resilience matters as much as features once customers depend on the workspace every day."
          action="Runbook"
        >
          <ol className="checklist">
            {recoveryChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p className="muted">
            Recovery drills should include database restore validation, queue health checks, and search reindex verification before traffic is reopened.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
