"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/traces", label: "Traces" },
  { href: "/datasets", label: "Datasets" },
  { href: "/prompts", label: "Prompts", icon: "prompt" },
  { href: "/experiments", label: "Experiments" },
  { href: "/analytics", label: "Analytics", icon: "chart" },
  { href: "/jobs", label: "Fine-tunes" },
  { href: "/evals", label: "Evals" },
  { href: "/releases", label: "Releases" },
  { href: "/settings", label: "Settings" },
];

type AppShellProps = {
  children: ReactNode;
};

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function PromptIcon() {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M15 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isPublicRoute =
    pathname.startsWith("/docs") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/review/");

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">F</div>
          <div className="brand-copy">
            <p className="brand-name">FineTuneOps</p>
            <p className="muted">Trace, curate, evaluate, ship</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? "nav-link active" : "nav-link"}
              >
                {item.icon === "chart" ? <ChartIcon /> : null}
                {item.icon === "prompt" ? <PromptIcon /> : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer panel">
          <p className="eyebrow">Beta readiness</p>
          <h3>Start with failure-driven improvement</h3>
          <p className="muted">
            Pull failures from production, turn them into datasets, compare
            candidates, and only then spend on fine-tuning or release them.
          </p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SaaS MVP</p>
            <h1>Post-training ops workspace</h1>
          </div>
          <div className="topbar-actions">
            <span className="pill success">Deployable foundation</span>
            <Link className="secondary-button" href="/search">
              Search workspace
            </Link>
            <button className="primary-button" type="button">
              Capture a new failure trace
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
            >
              Sign out
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
