import type { ActivityItem } from "@/lib/types";

type ActivityTimelineProps = {
  items: ActivityItem[];
};

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <section className="panel timeline-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">Live timeline</p>
          <h2>Every workflow transition in one feed.</h2>
        </div>
        <span className="pill">{items.length} events</span>
      </div>

      <div className="timeline-scroll" role="log" aria-live="polite">
        {items.map((item) => (
          <article key={item.id} className="timeline-item">
            <div className="timeline-dot" aria-hidden="true" />
            <div className="timeline-copy">
              <div className="timeline-heading">
                <strong>{item.title}</strong>
                <span className="pill">{item.kind}</span>
              </div>
              <p className="muted">{item.detail}</p>
              <span className="timeline-time">{item.at}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
