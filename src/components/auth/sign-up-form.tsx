import Link from "next/link";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { signUpAction } from "@/app/sign-up/actions";

type SignUpFormProps = {
  inviteToken?: string;
  inviteEmail?: string;
  organizationName?: string;
};

export function SignUpForm({
  inviteToken,
  inviteEmail,
  organizationName,
}: SignUpFormProps) {
  return (
    <section className="auth-shell">
      <div className="auth-showcase">
        <div className="hero-orbit" aria-hidden="true" />
        <div className="auth-showcase-copy">
          <p className="eyebrow">Start the loop</p>
          <h1>Build a workspace your AI team can trust.</h1>
          <p className="muted">
            FinetuneOps keeps the evidence behind every prompt, trace, dataset,
            experiment, fine-tune, and release in one place.
          </p>
          <div className="hero-actions">
            <span className="pill success">Demo data included</span>
            <span className="pill">SDK ready</span>
            <span className="pill">Team workflow</span>
          </div>
        </div>
      </div>

      <article className="panel auth-card">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Sign up</p>
            <h2>
              {organizationName
                ? `Join ${organizationName} on FinetuneOps`
                : "Create your FinetuneOps workspace"}
            </h2>
          </div>
          <span className="pill">Beta access</span>
        </div>

        <ActionForm className="auth-form" action={signUpAction} resetOnSuccess>
          <label className="field">
            <span>Full name</span>
            <input name="name" type="text" autoComplete="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={inviteEmail}
              readOnly={Boolean(inviteEmail)}
              required
            />
          </label>
          {!inviteToken ? (
            <label className="field">
              <span>Workspace name</span>
              <input
                name="workspaceName"
                type="text"
                placeholder="Can of Soup Labs"
              />
            </label>
          ) : null}
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          {inviteToken ? (
            <input name="inviteToken" type="hidden" value={inviteToken} />
          ) : null}
          <ActionSubmitButton
            idleLabel="Create account"
            pendingLabel="Creating account..."
          />
        </ActionForm>

        <p className="muted">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </article>
    </section>
  );
}
