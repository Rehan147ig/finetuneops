"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function SignInPanel() {
  const [error, setError] = useState<string>("");
  const [pending, setPending] = useState(false);

  async function handleCredentialsSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      callbackUrl: "/",
      redirect: false,
    });

    setPending(false);

    if (response?.error) {
      setError("Your email or password is incorrect.");
      return;
    }

    window.location.href = response?.url || "/";
  }

  return (
    <section className="auth-shell">
      <article className="panel auth-card">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Sign in</p>
            <h2>Open your FinetuneOps workspace</h2>
          </div>
          <span className="pill success">Auth.js</span>
        </div>

        <form className="auth-form" onSubmit={handleCredentialsSignIn}>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" required />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or continue with</span>
        </div>

        <div className="auth-actions">
          <button className="secondary-button" type="button" onClick={() => signIn("google", { callbackUrl: "/" })}>
            Google
          </button>
          <button className="secondary-button" type="button" onClick={() => signIn("github", { callbackUrl: "/" })}>
            GitHub
          </button>
        </div>

        <p className="muted">
          Need an account? <Link href="/sign-up">Create one</Link>
        </p>
      </article>
    </section>
  );
}
