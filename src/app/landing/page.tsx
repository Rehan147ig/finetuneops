import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FinetuneOps — The debugger for fine-tuned LLMs",
  description:
    "FinetuneOps finds which specific training examples caused your fine-tune to regress, explains why, and removes them in one click. 4 engineer-days to 11 minutes.",
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="landing-stat">
      <div className="landing-stat-value">{value}</div>
      <div className="landing-stat-label">{label}</div>
    </div>
  );
}

const workflow = [
  {
    n: "1",
    title: "Capture",
    body: "Wrap your OpenAI, Anthropic, Fireworks, or Together SDK calls. Every production inference is logged.",
  },
  {
    n: "2",
    title: "Curate",
    body: "Promote real traces into versioned datasets. Quality gates flag duplicates, PII, and imbalance.",
  },
  {
    n: "3",
    title: "Fine-tune",
    body: "Launch a fine-tune job on your provider. Polling, progress, and notifications are handled for you.",
  },
  {
    n: "4",
    title: "Detect",
    body: "Baseline vs candidate evals run automatically. A regression past your threshold fires an alert.",
  },
  {
    n: "5",
    title: "Explain",
    body: "The TRA engine finds the exact training examples that caused the drop — with confidence and reasons.",
  },
  {
    n: "6",
    title: "Recover",
    body: "One click removes the bad rows, builds a clean dataset, queues a retrain, and re-tests the regression.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      {/* NAV */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">FinetuneOps</span>
          <div className="landing-nav-links">
            <a href="#problem">The problem</a>
            <a href="#how">How it works</a>
            <a href="#tra">TRA engine</a>
            <a href="#pricing">Pricing</a>
            <Link className="landing-cta-sm" href="/sign-in">
              Sign in
            </Link>
            <Link className="landing-cta-pill" href="/sign-up">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">The debugger for fine-tuned LLMs</span>
          <h1>
            Find the training example that broke your model — <span className="landing-grad">in 11 minutes</span>, not 4 days.
          </h1>
          <p className="landing-lede">
            When a fine-tune makes your model worse, FinetuneOps automatically pinpoints the exact
            training examples that caused the regression, explains why each one is bad, and removes
            them in one click. What used to take 4 engineer-days now takes 11 minutes.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-cta" href="/sign-up">
              Start free trial
            </Link>
            <Link className="landing-cta-ghost" href="/sign-in">
              Live demo →
            </Link>
          </div>
          <div className="landing-stats">
            <Stat value="11 min" label="To root cause" />
            <Stat value="87 → 63 → 82" label="Detect · recover · verify" />
            <Stat value="4" label="TRA techniques" />
            <Stat value="$4–6k" label="Saved per incident" />
          </div>
        </div>
      </header>

      {/* PROBLEM */}
      <section id="problem" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">The problem</span>
            <h2>73% of bad fine-tunes trace back to training data — not the model.</h2>
            <p>
              Today, finding the bad rows means manually reviewing hundreds of examples in
              spreadsheets, forming hypotheses, removing examples, retraining, and testing. It burns
              3–5 engineer-days and ~$4,000–6,000 per incident.
            </p>
          </div>
          <div className="landing-compare">
            <div className="landing-compare-card landing-compare-bad">
              <h3>Without FinetuneOps</h3>
              <ul>
                <li>❌ 3–5 engineer-days per regression</li>
                <li>❌ Manual spreadsheet review of hundreds of rows</li>
                <li>❌ Guess-and-retrain cycles</li>
                <li>❌ No record of why a model changed</li>
              </ul>
            </div>
            <div className="landing-compare-card landing-compare-good">
              <h3>With FinetuneOps</h3>
              <ul>
                <li>✓ Root cause in 11 minutes</li>
                <li>✓ Ranked suspicious examples with reasons</li>
                <li>✓ One-click clean dataset + retrain</li>
                <li>✓ Full audit trail for compliance</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">How it works</span>
            <h2>From trace to clean dataset in six steps</h2>
            <p>The closed loop that turns a painful regression into a proof point.</p>
          </div>
          <div className="landing-flow">
            {workflow.map((step) => (
              <article key={step.n} className="landing-flow-card">
                <span className="landing-flow-num">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TRA */}
      <section id="tra" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">TRA engine — the core IP</span>
            <h2>Four techniques that find the bad examples</h2>
            <p>
              TRA (Training Regression Autopilot) combines an LLM-as-judge with pure statistics. Two
              techniques use your own provider key (we hold no LLM key of our own); two run for free.
            </p>
          </div>
          <div className="landing-tra-grid">
            <article className="landing-tra-card">
              <div className="landing-tra-icon">⚔️</div>
              <h3>Instruction conflict</h3>
              <p>Inputs that contradict their output labels — teaching the model the wrong behavior.</p>
              <span className="landing-tag landing-tag-llm">LLM-judge</span>
            </article>
            <article className="landing-tra-card">
              <div className="landing-tra-icon">🏷️</div>
              <h3>Label noise</h3>
              <p>Mislabeled examples whose answers don&apos;t make sense for the input.</p>
              <span className="landing-tag landing-tag-llm">LLM-judge</span>
            </article>
            <article className="landing-tra-card">
              <div className="landing-tra-icon">📑</div>
              <h3>Duplicate conflict</h3>
              <p>Near-duplicate inputs with conflicting outputs that bias the model.</p>
              <span className="landing-tag landing-tag-stat">Statistical</span>
            </article>
            <article className="landing-tra-card">
              <div className="landing-tra-icon">⚖️</div>
              <h3>Class imbalance</h3>
              <p>Skewed label distributions that destabilize minority-case accuracy.</p>
              <span className="landing-tag landing-tag-stat">Statistical</span>
            </article>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">Pricing</span>
            <h2>One regression pays for a year</h2>
            <p>The buying trigger is pain. If you&apos;ve been burned by a fine-tune regression, this pays for itself immediately.</p>
          </div>
          <div className="landing-pricing">
            <article className="landing-price-card">
              <h3>Starter</h3>
              <div className="landing-price">$149<span>/mo</span></div>
              <ul>
                <li>1 project</li>
                <li>Limited TRA runs</li>
                <li>Trace capture SDK</li>
                <li>Quality gates</li>
              </ul>
              <Link className="landing-cta-ghost landing-block" href="/sign-up">
                Start free trial
              </Link>
            </article>
            <article className="landing-price-card landing-price-featured">
              <span className="landing-price-badge">Most popular</span>
              <h3>Growth</h3>
              <div className="landing-price">$399<span>/mo</span></div>
              <ul>
                <li>Unlimited projects</li>
                <li>Full TRA engine (4 techniques)</li>
                <li>One-click recovery + retrain</li>
                <li>Regression alerts + Slack</li>
                <li>Multi-provider fine-tuning</li>
              </ul>
              <Link className="landing-cta landing-block" href="/sign-up">
                Start free trial
              </Link>
            </article>
            <article className="landing-price-card">
              <h3>Enterprise</h3>
              <div className="landing-price">$2,500<span>/mo+</span></div>
              <ul>
                <li>SSO / SAML</li>
                <li>Compliance &amp; audit export</li>
                <li>BYOC deployment</li>
                <li>Priority support + SLA</li>
              </ul>
              <a className="landing-cta-ghost landing-block" href="mailto:founder@finetuneops.local">
                Contact sales
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section landing-cta-band">
        <div className="landing-section-inner landing-cta-inner">
          <h2>Stop guessing why your fine-tune got worse.</h2>
          <p>Know which training example caused it — and fix it in one click.</p>
          <Link className="landing-cta landing-cta-lg" href="/sign-up">
            Get started free
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="landing-section-inner landing-footer-inner">
          <span>FinetuneOps · The debugger for fine-tuned LLMs</span>
          <span>Next.js · TypeScript · Prisma · BullMQ · Stripe · NextAuth</span>
        </div>
      </footer>
    </div>
  );
}
