import { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description: string;
  action?: string;
  children: ReactNode;
};

export function SectionCard({
  title,
  description,
  action,
  children,
}: SectionCardProps) {
  return (
    <section className="panel section-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{description}</h2>
        </div>
        {action ? <span className="pill">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}
