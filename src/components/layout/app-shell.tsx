"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/datasets", label: "Datasets" },
  { href: "/jobs", label: "Jobs" },
  { href: "/evals", label: "Evals" },
  { href: "/settings", label: "Settings" },
];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">F</div>
          <div className="brand-copy">
            <p className="brand-name">FineTuneOps</p>
            <p className="muted">Training, datasets, evals</p>
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
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer panel">
          <p className="eyebrow">Beta readiness</p>
          <h3>Start with one workflow</h3>
          <p className="muted">
            Upload data, launch a training run, compare evals, and charge for
            the saved engineering time.
          </p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SaaS MVP</p>
            <h1>Model ops workspace</h1>
          </div>
          <div className="topbar-actions">
            <span className="pill success">Deployable foundation</span>
            <button className="primary-button" type="button">
              New training run
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
