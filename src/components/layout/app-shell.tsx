"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/traces", label: "Traces", icon: "traces" },
  { href: "/datasets", label: "Datasets", icon: "datasets" },
  { href: "/prompts", label: "Prompts", icon: "prompt" },
  { href: "/experiments", label: "Experiments", icon: "experiments" },
  { href: "/analytics", label: "Analytics", icon: "chart" },
  { href: "/jobs", label: "Fine-tunes", icon: "jobs" },
  { href: "/evals", label: "Evals", icon: "evals" },
  { href: "/releases", label: "Releases", icon: "releases" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

type AppShellProps = {
  children: ReactNode;
};

function NavIcon({ icon }: { icon: string }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <path d="M4 13h6V4H4z" />
        <path d="M14 20h6V4h-6z" />
        <path d="M4 20h6v-3H4z" />
      </>
    ),
    traces: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h16" />
        <path d="M18 9v6" />
      </>
    ),
    datasets: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    prompt: (
      <>
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M15 4v4h4" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </>
    ),
    experiments: (
      <>
        <path d="M9 3v5l-4 8a4 4 0 0 0 3.6 5h6.8A4 4 0 0 0 19 16l-4-8V3" />
        <path d="M8 3h8" />
        <path d="M7 15h10" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19h16" />
        <path d="M7 16V9" />
        <path d="M12 16V5" />
        <path d="M17 16v-3" />
      </>
    ),
    jobs: (
      <>
        <path d="M12 3v4" />
        <path d="M12 17v4" />
        <path d="M4.9 4.9l2.8 2.8" />
        <path d="M16.3 16.3l2.8 2.8" />
        <path d="M3 12h4" />
        <path d="M17 12h4" />
        <path d="M4.9 19.1l2.8-2.8" />
        <path d="M16.3 7.7l2.8-2.8" />
      </>
    ),
    evals: (
      <>
        <path d="M5 12l4 4L19 6" />
        <path d="M4 20h16" />
      </>
    ),
    releases: (
      <>
        <path d="M12 3l3 7h7l-5.5 4.3 2.1 7L12 17l-6.6 4.3 2.1-7L2 10h7z" />
      </>
    ),
    settings: (
      <>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V22h-4v-.5a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 6 15a1.7 1.7 0 0 0-1.5-1H4v-4h.5A1.7 1.7 0 0 0 6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1A1.7 1.7 0 0 0 9.7 4a1.7 1.7 0 0 0 1-1.5V2h4v.5a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.2-.1 2 3.4-.1.1A1.7 1.7 0 0 0 18 9c.3.6.9 1 1.5 1h.5v4h-.5c-.6 0-1.2.4-1.5 1z" />
      </>
    ),
  };

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
      {paths[icon]}
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
          <div className="brand-lockup">
            <div className="brand-mark">F</div>
            <div className="brand-copy">
              <p className="brand-name">FinetuneOps</p>
              <p className="muted">Production LLM improvement loop</p>
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
                  <NavIcon icon={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer panel">
          <p className="eyebrow">Live loop</p>
          <h3>Trace to release without losing context.</h3>
          <p className="muted">
            Capture failures, promote them into datasets, compare fixes, version
            prompts, and release only when quality gates pass.
          </p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Production cockpit</p>
            <h1>LLM improvement command center</h1>
          </div>
          <div className="topbar-actions">
            <span className="pill success">Railway live</span>
            <Link className="secondary-button" href="/docs">
              Docs
            </Link>
            <Link className="secondary-button" href="/search">
              Search
            </Link>
            <Link className="primary-button" href="/traces">
              Capture trace
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
