import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ClipboardList, Handshake, LoaderCircle, MessagesSquare, Rocket, Shirt, Sparkles, Wand2, X } from 'lucide-react';
import { api, media } from '../api';

const plans = [
  { id: 'rookie', name: 'Rookie', tag: 'Try it free', monthly: 0, yearly: 0, credits: 20, features: ['Unlimited 3D design studio', '3 saved projects', '20 AI credits each month', 'Standard-resolution exports', '3DEEZI watermark on AI images'] },
  { id: 'creator', name: 'Creator', tag: 'For designers & coaches', monthly: 19, yearly: 190, credits: 250, features: ['Everything in Rookie', '250 AI credits each month', 'Unlimited projects & versions', 'HD exports, no watermark', 'Convert any image to 3D'] },
  { id: 'club', name: 'Club', tag: 'For clubs & schools', monthly: 59, yearly: 590, credits: 900, popular: true, features: ['Everything in Creator', '900 AI credits each month', '5 team seats', 'Shared logo & asset library', 'Approval workflow for committees', 'Priority generation'] },
  { id: 'pro', name: 'Pro Studio', tag: 'For brands & resellers', monthly: 149, yearly: 1490, credits: 3000, features: ['Everything in Club', '3,000 AI credits each month', '15 team seats', 'Brand kit & commercial licence', 'Custom branding on mockups', 'Dedicated support'] },
];
const partnerPerks = ['Website integration', 'Your branding & garments', 'Team-led onboarding', 'Training & setup', 'Annual AI credit allowance', 'Priority partner support'];
const partnerSteps = [['Apply', ClipboardList], ['Consultation', MessagesSquare], ['Onboarding', Handshake], ['Launch', Rocket]] as const;
const costs = [['AI edit in the studio (“Ask 3DEEZI”)', 1], ['Convert an image to 3D', 1], ['Four AI designs', 2], ['AI print pattern', 3], ['Photoreal showcase image', 5], ['Make HD (an HD front and back presentation)', 10], ['Make it 3D (AI print sheet on the 3D kit)', 10]] as const;

/** Proposed subscription structure (credits, like current AI platforms). Payments are not live yet. */
export default function PricingPage({ onStart }: { onStart: () => void }) {
  const [yearly, setYearly] = useState(false);
  const [applying, setApplying] = useState(false);
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
    <section className="partner-plan glow-panel" aria-labelledby="partner-title">
      <div className="partner-copy">
        <span className="partner-pill">YEARLY ONLY</span>
        <h2 id="partner-title">Corporate <span>Partner</span></h2>
        <p className="partner-lead">Bring 3DEEZI to your website.</p>
        <p className="muted">For sportswear companies ready to offer their own online design studio.</p>
        <div className="partner-price"><span>From</span> <strong>A$5,990</strong><span>/year</span><small>Yearly only. Setup fee applies. Pricing excludes GST.</small></div>
        <button className="button button-gradient" onClick={() => setApplying(true)}>Apply to become a partner <ArrowRight size={16} /></button>
      </div>
      <ul className="partner-perks">{partnerPerks.map(p => <li key={p}><Check size={16} />{p}</li>)}</ul>
      <div className="partner-side">
        <PartnerMockup />
        <ol className="partner-steps">{partnerSteps.map(([label, Icon], i) => <li key={label}><span><Icon size={18} /></span>{label}{i < partnerSteps.length - 1 && <ArrowRight className="step-arrow" size={14} aria-hidden />}</li>)}</ol>
      </div>
    </section>
    <section className="credit-table glow-panel"><div><span className="eyebrow">WHAT A CREDIT BUYS</span><h2>Simple, predictable AI costs.</h2><p className="muted">Extra credits: 100 for A$9 or 500 for A$39, and they never expire. Prices include GST. Payments would run on Stripe (cards, Apple Pay, Google Pay) with invoices for clubs.</p></div>
      <table><tbody>{costs.map(([label, n]) => <tr key={label}><td>{label}</td><td>{n} credit{n > 1 ? 's' : ''}</td></tr>)}</tbody></table></section>
    <p className="field-hint pricing-note">This is a proposed structure for review. Prices, credit amounts and features can be adjusted before payments go live.</p>
    {applying && <PartnerDialog onClose={() => setApplying(false)} />}
  </div>;
}

/** A partner's own sportswear site with the 3DEEZI designer embedded. */
function PartnerMockup() {
  const variations = ['electric-chevron', 'royal-diagonal', 'midnight-stripes'];
  return <figure className="partner-mockup" aria-label="Example: a sportswear company's website with the 3DEEZI designer built in">
    <div className="pm-chrome"><i /><i /><i /><span>yoursport.com/design</span></div>
    <div className="pm-site">
      <header className="pm-nav"><strong>YOUR<span>SPORT</span></strong><nav><span>Teamwear</span><span className="on">Design your kit</span><span>Clubs</span><span>Contact</span></nav></header>
      <div className="pm-app">
        <aside className="pm-garments">{['Jersey', 'Shorts', 'Socks', 'Polo'].map((g, i) => <span key={g} className={i ? '' : 'on'}><Shirt size={13} />{g}</span>)}</aside>
        <div className="pm-stage"><img src={media('showroom/garment-jersey.webp')} alt="" /></div>
        <aside className="pm-ai">
          <b><Wand2 size={12} /> AI Design Assistant</b>
          <p className="pm-prompt">Navy and gold jersey with sharp chevrons and our club crest</p>
          <div className="pm-vars">{variations.map(v => <img key={v} src={media(`presets/${v}.webp`)} alt="" />)}</div>
          <span className="pm-generate"><Sparkles size={11} /> Generate</span>
          <small>Powered by <em>3DEEZI</em></small>
        </aside>
      </div>
    </div>
  </figure>;
}

function PartnerDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const [form, setForm] = useState({ company: '', name: '', email: '', phone: '', website: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value }) });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { setDone((await api<{ message: string }>('/partners/apply', { method: 'POST', body: JSON.stringify(form) })).message); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <dialog ref={ref} className="modal compact-modal admin-modal" onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button>
    <span className="eyebrow">CORPORATE PARTNER</span><h2>Apply to become a partner</h2>
    {done ? <><p className="success-message"><CheckCircle2 size={16} /> {done}</p><button className="button button-gradient full-width" onClick={onClose}>CLOSE</button></>
      : <><p className="muted">Tell us about your company. We’ll book a consultation to plan your branded 3DEEZI studio.</p>
      <form onSubmit={submit} className="admin-form">
        <div className="field-row"><label className="field">Company<input required maxLength={160} {...field('company')} /></label><label className="field">Website<input maxLength={255} placeholder="yoursport.com" {...field('website')} /></label></div>
        <div className="field-row"><label className="field">Your name<input required maxLength={120} autoComplete="name" {...field('name')} /></label><label className="field">Phone<input maxLength={40} autoComplete="tel" {...field('phone')} /></label></div>
        <label className="field">Email<input required type="email" maxLength={190} autoComplete="email" {...field('email')} /></label>
        <label className="field">What would you like to offer?<textarea rows={3} maxLength={3000} placeholder="Sports, garments, expected customers, launch date" {...field('message')} /></label>
        {error && <p className="error-message">{error}</p>}
        <button className="button button-gradient full-width" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}SEND APPLICATION</button>
      </form></>}
  </dialog>;
}
