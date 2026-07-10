import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FineTuneOps - LLM regression root-cause analysis",
  description:
    "FineTuneOps explains why LLM releases regress across prompts, evals, model upgrades, RAG changes, and fine-tune datasets.",
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
    title: "Import",
    body: "Bring eval results from frontier models, prompts, RAG pipelines, or fine-tune candidates.",
  },
  {
    n: "2",
    title: "Compare",
    body: "Compare baseline vs candidate quality, latency, cost, and policy scores case by case.",
  },
  {
    n: "3",
    title: "Explain",
    body: "Identify whether the regression came from a prompt, model version, retrieval change, eval case, or training row.",
  },
  {
    n: "4",
    title: "Gate",
    body: "Block risky releases in CI with a machine-readable regression report.",
  },
  {
    n: "5",
    title: "Recover",
    body: "For fine-tunes, TRA ranks suspicious training examples and creates a cleaned recovery dataset.",
  },
  {
    n: "6",
    title: "Audit",
    body: "Keep release evidence that shows what changed, why it failed, and what the team fixed.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">FineTuneOps</span>
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

      <header className="landing-hero">
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">LLM regression root-cause analysis</span>
          <h1>
            Find why your LLM release got worse{" "}
            <span className="landing-grad">before it reaches production</span>.
          </h1>
          <p className="landing-lede">
            FineTuneOps compares baseline and candidate evals, then explains the likely root cause
            across prompt changes, model upgrades, retrieval updates, eval drift, and fine-tune
            training data. TRA is the specialist mode that ranks the suspicious rows behind a bad
            fine-tune.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-cta" href="/sign-up">
              Start free trial
            </Link>
            <Link className="landing-cta-ghost" href="/sign-in">
              Live demo
            </Link>
          </div>
          <div className="landing-stats">
            <Stat value="1 CLI" label="Fits existing eval pipelines" />
            <Stat value="87 -> 63" label="Regression evidence" />
            <Stat value="4" label="TRA dataset checks" />
            <Stat value="CI gate" label="Block risky releases" />
          </div>
        </div>
      </header>

      <section id="problem" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">The problem</span>
            <h2>LLM teams know quality dropped, but not what caused it.</h2>
            <p>
              A release can regress because of a prompt edit, model migration, retrieval change, eval
              change, or bad fine-tune data. Most tools show traces and scores. FineTuneOps turns
              those scores into a root-cause report engineers can act on.
            </p>
          </div>
          <div className="landing-compare">
            <div className="landing-compare-card landing-compare-bad">
              <h3>Without FineTuneOps</h3>
              <ul>
                <li>Regression score drops without cause</li>
                <li>Manual prompt, RAG, and dataset review</li>
                <li>Guess-and-rerun release cycles</li>
                <li>No durable evidence for approvals</li>
              </ul>
            </div>
            <div className="landing-compare-card landing-compare-good">
              <h3>With FineTuneOps</h3>
              <ul>
                <li>Baseline vs candidate RCA report</li>
                <li>Prompt, model, and RAG change detection</li>
                <li>Ranked fine-tune training-row evidence</li>
                <li>CI gate and audit trail</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">How it works</span>
            <h2>From eval files to release evidence in six steps</h2>
            <p>The workflow that meets developers where they already build and test LLM apps.</p>
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

      <section id="tra" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">TRA engine - the fine-tune edge</span>
            <h2>Four techniques that find suspicious training rows</h2>
            <p>
              TRA (Training Regression Autopilot) is the paid wedge for fine-tuned models. The
              broader product explains LLM release regressions; TRA goes deeper when training data is
              involved.
            </p>
          </div>
          <div className="landing-tra-grid">
            <article className="landing-tra-card">
              <div className="landing-tra-icon">IC</div>
              <h3>Instruction conflict</h3>
              <p>Inputs that contradict their output labels and teach the model the wrong behavior.</p>
              <span className="landing-tag landing-tag-llm">LLM judge</span>
            </article>
            <article className="landing-tra-card">
              <div className="landing-tra-icon">LN</div>
              <h3>Label noise</h3>
              <p>Mislabeled examples whose answers do not make sense for the input.</p>
              <span className="landing-tag landing-tag-llm">LLM judge</span>
            </article>
            <article className="landing-tra-card">
              <div className="landing-tra-icon">DC</div>
              <h3>Duplicate conflict</h3>
              <p>Near-duplicate inputs with conflicting outputs that bias the model.</p>
              <span className="landing-tag landing-tag-stat">Statistical</span>
            </article>
            <article className="landing-tra-card">
              <div className="landing-tra-icon">CI</div>
              <h3>Class imbalance</h3>
              <p>Skewed label distributions that destabilize minority-case accuracy.</p>
              <span className="landing-tag landing-tag-stat">Statistical</span>
            </article>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <span className="landing-kicker">Pricing</span>
            <h2>Start as a release gate, expand into the system of record</h2>
            <p>
              The buying trigger is pain: a model, prompt, RAG, or fine-tune release got worse and
              the team needs proof fast.
            </p>
          </div>
          <div className="landing-pricing">
            <article className="landing-price-card">
              <h3>Starter</h3>
              <div className="landing-price">$149<span>/mo</span></div>
              <ul>
                <li>1 project</li>
                <li>Regression reports</li>
                <li>Trace capture SDK</li>
                <li>CLI release gate</li>
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
                <li>Full TRA engine for fine-tunes</li>
                <li>One-click recovery and retrain</li>
                <li>Regression alerts and Slack</li>
                <li>Prompt, model, and RAG change RCA</li>
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
                <li>Compliance and audit export</li>
                <li>BYOC deployment</li>
                <li>Priority support and SLA</li>
              </ul>
              <a className="landing-cta-ghost landing-block" href="mailto:founder@finetuneops.local">
                Contact sales
              </a>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section landing-cta-band">
        <div className="landing-section-inner landing-cta-inner">
          <h2>Stop guessing why your LLM release got worse.</h2>
          <p>Generate a root-cause report from eval evidence, then fix the highest-risk change first.</p>
          <Link className="landing-cta landing-cta-lg" href="/sign-up">
            Get started free
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-section-inner landing-footer-inner">
          <span>FineTuneOps - LLM regression root-cause analysis</span>
          <span>Next.js - TypeScript - Prisma - BullMQ - Stripe - NextAuth</span>
        </div>
      </footer>
    </div>
  );
}
