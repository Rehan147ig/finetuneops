import { SectionCard } from "@/components/dashboard/section-card";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { TraceBacklog } from "@/components/traces/trace-backlog";
import {
  createTraceAction,
  promoteTraceToDatasetAction,
} from "@/app/traces/actions";
import { requireAuthSession } from "@/lib/auth-session";
import { getTracePage } from "@/lib/workspace-data";

export default async function TracesPage() {
  const session = await requireAuthSession();
  const tracePage = await getTracePage(
    {
      organizationId: session.user.organizationId,
    },
    {
      limit: 20,
    },
  );

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Traces</p>
          <h2>Capture the failures that are worth fixing</h2>
        </div>
        <span className="pill success">New workflow anchor</span>
      </div>

      <SectionCard
        title="Trace intake"
        description="Give teams a fast way to capture failures before they disappear into chats and tickets."
        action="Live server action"
      >
        <ActionForm action={createTraceAction} className="page-grid" resetOnSuccess>
          <div className="page-grid two-column">
            <label className="mini-grid">
              <span className="eyebrow">Failure title</span>
              <input
                name="title"
                type="text"
                placeholder="Escalation loop after refund denial"
              />
            </label>
            <label className="mini-grid">
              <span className="eyebrow">Source</span>
              <input
                name="source"
                type="text"
                placeholder="Support copilot trace"
              />
            </label>
          </div>
          <div className="page-grid two-column">
            <label className="mini-grid">
              <span className="eyebrow">Severity</span>
              <select name="severity" defaultValue="medium">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <div className="mini-grid">
              <span className="eyebrow">What happens next</span>
              <p className="muted">
                The trace is written into Prisma, the backlog revalidates, and
                the new failure becomes part of the workflow immediately.
              </p>
            </div>
          </div>
          <div>
            <ActionSubmitButton
              idleLabel="Capture trace"
              pendingLabel="Capturing trace..."
            />
          </div>
        </ActionForm>
      </SectionCard>

      <SectionCard
        title="Trace backlog"
        description="The best training data often starts as production failures."
        action="Cursor pagination"
      >
        <TraceBacklog
          initialTraces={tracePage.traces}
          initialNextCursor={tracePage.nextCursor}
          promoteAction={promoteTraceToDatasetAction}
        />
      </SectionCard>

      <div className="page-grid two-column">
        <SectionCard
          title="Why traces matter"
          description="This is the product wedge that keeps the platform relevant."
          action="High leverage"
        >
          <ol className="checklist">
            <li>Find repeated failures instead of relying on founder intuition.</li>
            <li>Prioritize traces by severity, frequency, and revenue impact.</li>
            <li>Promote only the highest-opportunity cases into datasets.</li>
            <li>Close the loop by rechecking the same failure type after shipping.</li>
          </ol>
        </SectionCard>

        <SectionCard
          title="What customers buy"
          description="A trace layer saves both time and bad training decisions."
          action="Monetizable"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Signal</p>
              <h3>Find the failures that actually deserve annotation time.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Memory</p>
              <h3>Keep every regression tied to a concrete production example.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Speed</p>
              <h3>Move from issue to dataset without a pile of ad hoc scripts.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
