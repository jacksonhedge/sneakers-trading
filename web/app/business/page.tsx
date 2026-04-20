"use client";

import { useState } from "react";
import Link from "next/link";
import { saveLeadLocally, submitLead, type EnterpriseLead } from "@/lib/enterprise";
import { PLANS } from "@/lib/subscriptions";

const FEATURES: Array<{ emoji: string; title: string; body: string }> = [
  {
    emoji: "📊",
    title: "Full Terminal access",
    body: "Simple, Medium, and Terminal modes with every data feed we run. Unlimited markets, unlimited platforms, unlimited modes per seat.",
  },
  {
    emoji: "🔌",
    title: "API + streaming feeds",
    body: "REST for snapshots, WebSocket for real-time order books, arbitrage signals, and O'Toole edge calls. Rate limits scale with chair count.",
  },
  {
    emoji: "🚀",
    title: "Fast Execution routing",
    body: "Sub-100ms order routing on authorized platforms. Dedicated infrastructure — no shared queues with retail.",
  },
  {
    emoji: "🤖",
    title: "O'Toole AI — unrestricted",
    body: "Insights + Execution modes without guardrail caps. Custom strategies, per-desk prompts, internal model plug-ins.",
  },
  {
    emoji: "🏢",
    title: "On-prem + VPC options",
    body: "Deploy the terminal + scanner inside your own network. SOC 2 Type II, SSO (Okta, Azure AD), audit logs.",
  },
  {
    emoji: "🎧",
    title: "Dedicated support",
    body: "Named customer engineer + 24/5 coverage. Direct line to the team that builds the scrapers and the scanner.",
  },
];

const USE_CASES: Array<{ emoji: string; title: string; desc: string }> = [
  { emoji: "🏦", title: "Hedge funds",   desc: "Event-driven strategies, cross-asset hedging against macro prediction markets." },
  { emoji: "⚡", title: "Prop shops",     desc: "Cross-platform arbitrage at scale, automated execution, edge-decay monitoring." },
  { emoji: "📰", title: "Newsrooms",      desc: "Real-time probabilistic indicators for breaking-news desks and opinion polling." },
  { emoji: "🎓", title: "Research firms", desc: "Forecast-accuracy benchmarks, calibration data, historical resolution records." },
];

export default function BusinessPage() {
  const [pricingView, setPricingView] = useState<"individual" | "business">("business");
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    chairs: "3",
    useCase: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const chairs = Math.max(1, Number(form.chairs) || 1);
    if (!form.name || !form.email || !form.company || !form.useCase) {
      setErr("Please fill out name, work email, company, and use case.");
      return;
    }
    const lead: EnterpriseLead = {
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim(),
      role: form.role.trim() || undefined,
      chairs,
      useCase: form.useCase.trim(),
      phone: form.phone.trim() || undefined,
      submittedAt: Date.now(),
    };
    setSubmitting(true);
    saveLeadLocally(lead);
    const res = await submitLead(lead);
    setSubmitting(false);
    if (!res.ok) {
      setErr(res.error ?? "Submission failed. We saved your info locally — try again or email enterprise@otoole.ai.");
      return;
    }
    setSubmitted(true);
  }

  const chairsNum = Math.max(1, Number(form.chairs) || 1);
  const SETUP_PER_CHAIR = 25_000;
  const MONTHLY_PER_CHAIR = 2_000;
  const discountPct = chairsNum >= 25 ? 0.15 : chairsNum >= 10 ? 0.10 : chairsNum >= 5 ? 0.05 : 0;
  const setupCost = Math.round(chairsNum * SETUP_PER_CHAIR * (1 - discountPct));
  const monthlyCost = chairsNum * MONTHLY_PER_CHAIR;
  const year1Cost = setupCost + monthlyCost * 12;

  return (
    <div className="biz-page">
      {/* ═══ NAV ═══ */}
      <header className="biz-nav">
        <Link href="/" className="biz-brand">
          <span className="biz-brand-icon">Ø</span>
          <span className="biz-brand-text">
            <span className="biz-brand-main">O&apos;Toole</span>
            <span className="biz-brand-sub">TERMINAL · ENTERPRISE</span>
          </span>
        </Link>
        <nav className="biz-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#usecases">Use cases</a>
          <a href="#demo">Request demo</a>
          <Link href="/" className="biz-nav-retail">← Consumer app</Link>
        </nav>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="biz-hero">
        <div className="biz-hero-kicker">FOR INSTITUTIONS</div>
        <h1 className="biz-hero-title">
          Prediction-market intelligence,<br />
          wired into your trading desk.
        </h1>
        <p className="biz-hero-sub">
          Every prediction market on one terminal. Every arbitrage opportunity across Kalshi, Polymarket,
          Coinbase, Robinhood, and 28+ sportsbooks in real time. REST + WebSocket APIs for every signal we run.
          Per-chair licensing — priced like Bloomberg, designed for the next decade.
        </p>
        <div className="biz-compliance-row">
          <span className="biz-comp-pill">SOC 2 Type II</span>
          <span className="biz-comp-pill">SSO — Okta · Azure AD · Google</span>
          <span className="biz-comp-pill">Audit logs</span>
          <span className="biz-comp-pill">On-premise deployment</span>
          <span className="biz-comp-pill">99.9% uptime SLA</span>
        </div>
        <div className="biz-hero-cta">
          <a href="#demo" className="biz-btn biz-btn-primary">Request a demo</a>
          <a href="#pricing" className="biz-btn">See pricing →</a>
        </div>
        <div className="biz-cohort-strip">
          <div className="biz-cohort-dot" />
          Onboarding cohort Q3 2026 · dedicated customer engineer · 2-week integration
        </div>
        <div className="biz-hero-stat-row">
          <div className="biz-stat"><div className="biz-stat-num">13,000+</div><div className="biz-stat-lbl">markets tracked</div></div>
          <div className="biz-stat"><div className="biz-stat-num">32</div><div className="biz-stat-lbl">platforms integrated</div></div>
          <div className="biz-stat"><div className="biz-stat-num">&lt;100ms</div><div className="biz-stat-lbl">execution latency</div></div>
          <div className="biz-stat"><div className="biz-stat-num">$25K + $2K/mo</div><div className="biz-stat-lbl">setup + recurring per chair</div></div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="biz-section">
        <div className="biz-section-label">What&apos;s in a chair</div>
        <h2 className="biz-section-title">Six pillars, one license</h2>
        <div className="biz-feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="biz-feat-card">
              <div className="biz-feat-emoji">{f.emoji}</div>
              <div className="biz-feat-title">{f.title}</div>
              <div className="biz-feat-body">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="biz-section biz-section-alt">
        <div className="biz-section-label">Pricing</div>
        <h2 className="biz-section-title">
          {pricingView === "business" ? "One-time setup + monthly per chair" : "Individual plans"}
        </h2>

        <div className="biz-pricing-toggle">
          <button
            className={`biz-toggle-btn ${pricingView === "individual" ? "active" : ""}`}
            onClick={() => setPricingView("individual")}
          >
            👤 For individuals
          </button>
          <button
            className={`biz-toggle-btn ${pricingView === "business" ? "active" : ""}`}
            onClick={() => setPricingView("business")}
          >
            🏢 For businesses
          </button>
        </div>
        <div className="biz-toggle-sub">
          {pricingView === "individual"
            ? "Individual plans — for traders using their own capital. Billed monthly, cancel anytime."
            : "Enterprise Chairs are for trading desks and institutions — different scale, different support model."}
        </div>

        {pricingView === "individual" && (
          <div className="biz-ind-grid">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`biz-ind-card biz-ind-${plan.id}`}>
                {plan.id === "pro" && <div className="biz-ind-ribbon">Most popular</div>}
                <div className="biz-ind-head">
                  <span className="biz-ind-emoji">{plan.emoji}</span>
                  <div>
                    <div className="biz-ind-name">{plan.name}</div>
                    <div className="biz-ind-tag">{plan.tagline}</div>
                  </div>
                </div>
                <div className="biz-ind-price">
                  {plan.priceMonthly === 0 ? (
                    <span className="biz-ind-big">Free</span>
                  ) : (
                    <>
                      <span className="biz-ind-big">${plan.priceMonthly}</span>
                      <span className="biz-ind-period">/mo</span>
                    </>
                  )}
                </div>
                <ul className="biz-ind-features">
                  {plan.highlights.map((h) => <li key={h}>{h}</li>)}
                </ul>
                <Link href="/" className="biz-btn" style={{ width: "100%", justifyContent: "center" }}>
                  {plan.priceMonthly === 0 ? "Start free →" : `Get ${plan.name} →`}
                </Link>
              </div>
            ))}
          </div>
        )}

        {pricingView === "individual" && (
          <div className="biz-ind-compare">
            <div className="biz-ind-compare-head">Need more than Elite?</div>
            <div className="biz-ind-compare-sub">
              Businesses and trading desks get a dedicated Terminal chair — unlimited API, SSO, on-prem, and dedicated support. <button className="biz-inline-link" onClick={() => setPricingView("business")}>See business pricing →</button>
            </div>
          </div>
        )}

        {pricingView === "business" && (
        <div className="biz-price-card">
          <div className="biz-price-head">
            <div>
              <div className="biz-price-name">Enterprise Chair</div>
              <div className="biz-price-tag">One seat · one human · everything unlocked</div>
            </div>
            <div className="biz-price-split">
              <div className="biz-price-col">
                <span className="biz-price-dollar">$25,000</span>
                <span className="biz-price-period">one-time setup / chair</span>
              </div>
              <div className="biz-price-plus">+</div>
              <div className="biz-price-col">
                <span className="biz-price-dollar">$2,000</span>
                <span className="biz-price-period">per chair / month</span>
              </div>
            </div>
          </div>
          <div className="biz-price-whats-included">
            <strong>What the setup fee buys:</strong> provisioning the dedicated system — Fast Execution routing infra on your own rate-limit bucket, SSO + audit-log wiring, data-feed contracts with every platform, onboarding sessions, and custom strategy templates for your desk.
            <br /><br />
            <strong>What the monthly covers:</strong> running + maintaining that dedicated system — real-time scanners, O&apos;Toole Execution API, support escalation, infrastructure, and software updates.
          </div>
          <ul className="biz-price-features">
            <li>Unlimited terminal usage — every mode, every platform, every sport + prediction market</li>
            <li>Full REST + WebSocket API, rate-limited to 10k req/min per chair</li>
            <li>O&apos;Toole Insights + Execution, no guardrail ceilings</li>
            <li>Sub-100ms Fast Execution routing included</li>
            <li>Cross-platform arbitrage alerts (prediction markets + sportsbooks)</li>
            <li>Dedicated customer engineer, 24/5 coverage</li>
            <li>SSO (Okta, Azure AD, Google Workspace), audit logs, SOC 2 Type II</li>
            <li>On-premise / VPC deployment available at 5+ chairs</li>
          </ul>
          <div className="biz-price-addons">
            <div className="biz-addon-row">
              <span>Volume discount (applies to setup fee)</span>
              <span>5% at 5 chairs · 10% at 10 · 15% at 25+</span>
            </div>
            <div className="biz-addon-row">
              <span>Custom model integration</span>
              <span>+$50k one-time per model</span>
            </div>
            <div className="biz-addon-row">
              <span>On-prem deployment</span>
              <span>+$75k setup · +$1k/mo per chair</span>
            </div>
            <div className="biz-addon-row">
              <span>Annual prepay</span>
              <span>−10% off recurring</span>
            </div>
          </div>
          <div className="biz-compare">
            <div className="biz-compare-title">vs. consumer Elite ($199/mo)</div>
            <div className="biz-compare-grid">
              <div>
                <div className="biz-compare-label">Elite tier</div>
                <ul>
                  <li>Single user, web-only</li>
                  <li>Shared rate limits</li>
                  <li>Best-effort support</li>
                  <li>No SSO, no audit logs</li>
                </ul>
              </div>
              <div>
                <div className="biz-compare-label">Enterprise Chair</div>
                <ul>
                  <li>Per-seat license, desktop + API + mobile</li>
                  <li>Dedicated rate limit (10k/min)</li>
                  <li>Named customer engineer</li>
                  <li>SSO, audit logs, SOC 2, on-prem</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        )}
      </section>

      {/* ═══ USE CASES ═══ */}
      <section id="usecases" className="biz-section">
        <div className="biz-section-label">Who uses it</div>
        <h2 className="biz-section-title">Built for desks that move on information.</h2>
        <div className="biz-use-grid">
          {USE_CASES.map((u) => (
            <div key={u.title} className="biz-use-card">
              <div className="biz-use-emoji">{u.emoji}</div>
              <div className="biz-use-title">{u.title}</div>
              <div className="biz-use-desc">{u.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ LEAD FORM ═══ */}
      <section id="demo" className="biz-section biz-section-alt">
        <div className="biz-section-label">Get started</div>
        <h2 className="biz-section-title">Request a demo</h2>
        <p className="biz-lead-sub">
          Tell us about your desk and we&apos;ll send a working terminal + API key within one business day.
        </p>

        {submitted ? (
          <div className="biz-success">
            <div className="biz-success-emoji">✓</div>
            <div className="biz-success-title">Got it, {form.name.split(" ")[0]}.</div>
            <div className="biz-success-body">
              We&apos;ll email {form.email} within one business day with credentials and a Calendly link.
              In the meantime, the consumer app is live at <Link href="/">otoole.ai</Link>.
            </div>
          </div>
        ) : (
          <form className="biz-form" onSubmit={handleSubmit}>
            <div className="biz-form-grid">
              <label className="biz-field">
                <span>Name *</span>
                <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
              </label>
              <label className="biz-field">
                <span>Work email *</span>
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
              </label>
              <label className="biz-field">
                <span>Company *</span>
                <input value={form.company} onChange={(e) => update("company", e.target.value)} required />
              </label>
              <label className="biz-field">
                <span>Your role</span>
                <input value={form.role} onChange={(e) => update("role", e.target.value)} placeholder="PM, Trader, CTO, etc." />
              </label>
              <label className="biz-field">
                <span>Chairs needed</span>
                <input type="number" min="1" value={form.chairs} onChange={(e) => update("chairs", e.target.value)} />
                <span className="biz-field-hint">
                  ${setupCost.toLocaleString()} setup{discountPct > 0 ? ` (−${(discountPct * 100).toFixed(0)}%)` : ""}
                  {" + "}${monthlyCost.toLocaleString()}/mo · Yr 1 ≈ ${year1Cost.toLocaleString()}
                </span>
              </label>
              <label className="biz-field">
                <span>Phone</span>
                <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </label>
              <label className="biz-field biz-field-full">
                <span>What are you trying to solve? *</span>
                <textarea
                  value={form.useCase}
                  onChange={(e) => update("useCase", e.target.value)}
                  rows={4}
                  placeholder="e.g. Our macro desk hedges Fed cycles against prediction markets and we need a cross-platform view."
                  required
                />
              </label>
            </div>
            {err && <div className="biz-form-err">{err}</div>}
            <div className="biz-form-actions">
              <button type="submit" className="biz-btn biz-btn-primary" disabled={submitting}>
                {submitting ? "Submitting…" : "Request demo"}
              </button>
              <div className="biz-form-note">
                We only contact you about Enterprise. No lists, no newsletter.
              </div>
            </div>
          </form>
        )}
      </section>

      <footer className="biz-footer">
        <div className="biz-footer-inner">
          <div>© 2026 O&apos;Toole Terminal · All rights reserved</div>
          <div className="biz-footer-links">
            <Link href="/">Consumer app</Link>
            <a href="mailto:enterprise@otoole.ai">enterprise@otoole.ai</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
