import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

const plans = [
  { id: 'rookie', name: 'Rookie', tag: 'Try it free', monthly: 0, yearly: 0, credits: 20, features: ['Unlimited 3D design studio', '3 saved projects', '20 AI credits each month', 'Standard-resolution exports', '3DEEZI watermark on AI images'] },
  { id: 'creator', name: 'Creator', tag: 'For designers & coaches', monthly: 19, yearly: 190, credits: 250, features: ['Everything in Rookie', '250 AI credits each month', 'Unlimited projects & versions', 'HD exports, no watermark', 'Convert any image to 3D'] },
  { id: 'club', name: 'Club', tag: 'For clubs & schools', monthly: 59, yearly: 590, credits: 900, popular: true, features: ['Everything in Creator', '900 AI credits each month', '5 team seats', 'Shared logo & asset library', 'Approval workflow for committees', 'Priority generation'] },
  { id: 'pro', name: 'Pro Studio', tag: 'For brands & resellers', monthly: 149, yearly: 1490, credits: 3000, features: ['Everything in Club', '3,000 AI credits each month', '15 team seats', 'Brand kit & commercial licence', 'Custom branding on mockups', 'Dedicated support'] },
];
const costs = [['AI edit in the studio (“Ask 3DEEZI”)', 1], ['Convert an image to 3D', 1], ['Four AI concepts with previews', 2], ['AI print pattern', 3], ['Photoreal showcase image', 5], ['HD presentation mockup (one prompt)', 10]] as const;

/** Proposed subscription structure (credits, like current AI platforms). Payments are not live yet. */
export default function PricingPage({ onStart }: { onStart: () => void }) {
  const [yearly, setYearly] = useState(false);
  return <div className="page-shell pricing-page">
    <div className="page-heading centered"><span className="eyebrow">PROPOSED PLANS · FOR DISCUSSION</span><h1>Design more. <span>Pay for what you use.</span></h1><p>Monthly plans with AI credits, like ChatGPT, Midjourney and Canva. The 3D studio is unlimited on every plan; credits are only used when AI creates something.</p>
      <div className="billing-toggle" role="radiogroup" aria-label="Billing period"><button role="radio" aria-checked={!yearly} className={!yearly ? 'active' : ''} onClick={() => setYearly(false)}>Monthly</button><button role="radio" aria-checked={yearly} className={yearly ? 'active' : ''} onClick={() => setYearly(true)}>Yearly <small>2 months free</small></button></div></div>
    <div className="plan-grid">{plans.map(p => <article key={p.id} className={`plan glow-panel ${p.popular ? 'popular' : ''}`}>
      {p.popular && <span className="plan-badge">MOST POPULAR</span>}
      <h2>{p.name}</h2><p className="muted">{p.tag}</p>
      <div className="plan-price"><strong>{p.monthly ? `A$${yearly ? Math.round(p.yearly / 12) : p.monthly}` : 'Free'}</strong>{p.monthly > 0 && <span>/ month{yearly ? `, A$${p.yearly} billed yearly` : ''}</span>}</div>
      <p className="plan-credits"><Sparkles size={15} /> {p.credits.toLocaleString()} AI credits / month</p>
      <ul>{p.features.map(f => <li key={f}><Check size={15} />{f}</li>)}</ul>
      <button className={`button ${p.popular ? 'button-gradient' : 'button-outline'} full-width`} onClick={onStart}>{p.monthly ? 'Start 7-day free trial' : 'Start designing'}</button>
    </article>)}</div>
    <section className="credit-table glow-panel"><div><span className="eyebrow">WHAT A CREDIT BUYS</span><h2>Simple, predictable AI costs.</h2><p className="muted">Extra credits: 100 for A$9 or 500 for A$39, and they never expire. Prices include GST. Payments would run on Stripe (cards, Apple Pay, Google Pay) with invoices for clubs.</p></div>
      <table><tbody>{costs.map(([label, n]) => <tr key={label}><td>{label}</td><td>{n} credit{n > 1 ? 's' : ''}</td></tr>)}</tbody></table></section>
    <p className="field-hint pricing-note">This is a proposed structure for review. Prices, credit amounts and features can be adjusted before payments go live.</p>
  </div>;
}
