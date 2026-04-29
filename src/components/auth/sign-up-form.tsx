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
      <article className="panel auth-card">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Sign up</p>
            <h2>
              {organizationName
                ? `Join ${organizationName} on FineTuneOps`
                : "Create your FineTuneOps workspace"}
            </h2>
          </div>
          <span className="pill">Demo workspace included</span>
        </div>

        <ActionForm className="auth-form" action={signUpAction} resetOnSuccess>
          <label className="field">
            <span>Full name</span>
            <input name="name" type="text" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" defaultValue={inviteEmail} readOnly={Boolean(inviteEmail)} required />
          </label>
          {!inviteToken ? (
            <label className="field">
              <span>Workspace name</span>
              <input name="workspaceName" type="text" placeholder="Can of Soup Labs" />
            </label>
          ) : null}
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" required />
          </label>
          {inviteToken ? <input name="inviteToken" type="hidden" value={inviteToken} /> : null}
          <ActionSubmitButton idleLabel="Create account" pendingLabel="Creating account..." />
        </ActionForm>

        <p className="muted">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </article>
    </section>
  );
}
