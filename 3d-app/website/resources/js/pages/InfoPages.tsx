import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Box, CircleCheck, FileText, LoaderCircle, MessageCircle, PackageCheck, PenTool, Send, Shirt, Smartphone, Sparkles, Upload, Wand2 } from 'lucide-react';
import { api, type User } from '../api';
import { openAssist } from '../components/Assist';
import { AssistCard, OrderField, OrderPageHeader, OrderPageLayout, OrderSection } from '../components/OrderPageParts';
import '../../css/info-pages.css';

/**
 * The footer's pages: About, Support (FAQs, 3DEEZI ASSIST and the contact form) and the Privacy Policy and Terms of
 * Use (drafts for the client to review). They use the order pages' header and cards (OrderPageParts.tsx).
 */
const HOME = [{ label: 'Home', to: '/' }];
const UPDATED = '20 October 2026';

/** "Last updated" and, on the legal pages, the note that the text is a draft for the client. */
function Updated({ draft = false }: { draft?: boolean }) {
  return <div className="info-meta">
    <span>Last updated <time dateTime="2026-10-20">{UPDATED}</time></span>
    {draft && <p className="info-draft" role="note"><FileText size={16} /> This text is a draft for the client to review.</p>}
  </div>;
}

/** The side card on every page: questions go to 3DEEZI ASSIST or the Support page. */
function HelpCard({ support = true }: { support?: boolean }) {
  return <section className="op-card info-help" aria-label="Get help">
    <h2 className="op-card-title">Questions?</h2>
    <p>3DEEZI ASSIST answers questions about the website, the design tools and ordering, on every page.</p>
    <button type="button" className="info-assist-button" onClick={openAssist}><Sparkles size={18} /> Ask 3DEEZI ASSIST</button>
    {support && <Link className="op-link" to="/support">Contact the 3DEEZI team <ArrowRight size={16} /></Link>}
  </section>;
}

/** "On this page" for the legal pages. */
function Contents({ items }: { items: { id: string; title: string }[] }) {
  return <nav className="op-card info-toc" aria-label="On this page">
    <h2 className="op-card-title">On this page</h2>
    <ol>{items.map(i => <li key={i.id}><a href={`#${i.id}`} onClick={e => { e.preventDefault(); document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{i.title}</a></li>)}</ol>
  </nav>;
}

/* ------------------------------------------------------------------------------------------------ About */

const features: { icon: ReactNode; title: string; text: ReactNode; to: string; action: string }[] = [
  { icon: <Sparkles />, title: 'AI Powered Sportswear', to: '/create/ai', action: 'Start with AI',
    text: 'Describe the kit you want (team name, colours, style, mood) and add pictures if you like. 3DEEZI creates four concept designs; pick one and it opens in the 3D Studio, fully editable. AI also creates print patterns, photoreal showcase images and HD presentation mockups.' },
  { icon: <Shirt />, title: 'Design Your Own in the 3D Studio', to: '/create/sport', action: 'Design your own',
    text: 'Choose your sport and garment, then design on a rotating 3D garment: colours, patterns, logos, text, player names and numbers. Every save keeps a version, and Export gives you mockups, front and back views, print panels and a PDF design sheet.' },
  { icon: <PenTool />, title: '3DEEZI Artboard', to: '/artboard', action: 'Open the Artboard',
    text: 'A professional vector editor in the browser, modelled on CorelDRAW, for logos, crests, names, numbers and graphics. Send your artwork to the 3D Studio, or export it as PDF, SVG or PNG.' },
  { icon: <Wand2 />, title: 'Convert', to: '/convert', action: 'Convert a picture',
    text: 'Upload a photo, sketch or mockup of a kit and 3DEEZI turns it into an editable 3D design.' },
  { icon: <PackageCheck />, title: 'Ordering with 3DEEZI', to: '/orders/new', action: 'Create an order form',
    text: <>Build an order step by step with the <Link to="/orders/new">Create Order Form</Link>, or send a completed order form and artwork with <Link to="/orders/upload">Upload Your Order</Link>. <Link to="/orders">My Orders</Link> follows every order from Order received through Design &amp; approval, Production and Shipped to Delivered.</> },
  { icon: <Smartphone />, title: 'The 3DEEZI apps', to: '/downloads', action: 'See the apps',
    text: '3DEEZI is coming to the App Store and Google Play, with your projects, assets and orders in your account. The website also works on phones and tablets.' },
];

export function AboutPage() {
  return <OrderPageLayout className="info-page"
    header={<OrderPageHeader current="About" title="About 3DEEZI" trail={HOME} back={null}
      subtitle="3DEEZI is an AI sportswear designer. Teams, clubs, coaches, schools and brands design custom sportswear in real-time 3D, with AI and with their own artwork, and order it from the same place." />}
    main={<>
      <div className="info-features">{features.map(f => <section key={f.title} className="op-card info-feature">
        <span className="info-feature-icon" aria-hidden="true">{f.icon}</span>
        <h2>{f.title}</h2>
        <p>{f.text}</p>
        <Link className="op-link caps" to={f.to}>{f.action} <ArrowRight size={17} /></Link>
      </section>)}</div>
      <OrderSection title="Your sport. Your way.">
        <div className="info-prose">
          <p>Sports: Rugby League, Rugby Union, Football, Basketball, Netball, AFL, Hockey and Training. Garments: Jersey, Shorts, Training Tee, Singlet, Polo and Full Kit (jersey and shorts together).</p>
          <p>Your designs are saved to your account, so you can reopen, change and download them at any time, on the website and in the app. Production starts once you have approved the design and the order is paid in full.</p>
        </div>
      </OrderSection>
    </>}
    side={<>
      <section className="op-card info-start" aria-label="Start creating">
        <h2 className="op-card-title">Start creating</h2>
        <Link className="info-start-link" to="/create/ai"><Sparkles size={18} /> AI Powered Sportswear</Link>
        <Link className="info-start-link" to="/create/sport"><Box size={18} /> Design Your Own</Link>
        <Link className="info-start-link" to="/orders/new"><PackageCheck size={18} /> Create Order Form</Link>
        <Link className="info-start-link" to="/orders/upload"><Upload size={18} /> Upload Your Order</Link>
      </section>
      <HelpCard />
    </>} />;
}

/* ------------------------------------------------------------------------------------------------ Support */

/** Short answers from 3DEEZI ASSIST's FAQs (resources/assist/knowledge.md). */
const faqs: { q: string; a: ReactNode }[] = [
  { q: 'How do I start designing?', a: <>Choose <Link to="/create/ai">AI Powered Sportswear</Link> to create a kit from a description, or <Link to="/create/sport">Design Your Own</Link> to pick a sport and garment and build the kit yourself in the 3D Studio.</> },
  { q: 'Do I need an account?', a: 'You can try the Studio and the Artboard without one. To save designs, use Projects, Assets and the Dashboard, use AI or place an order, sign in or create a free account (Sign in, top right).' },
  { q: 'How do I save my design?', a: <>In the 3D Studio click Save (top right) and give the kit a name. It appears in <Link to="/projects">Projects</Link>; each save keeps a new version.</> },
  { q: 'How do I download my design?', a: 'In the 3D Studio open Export: 3D mockup, Front & back, print panels, the PDF design sheet or the design specification. In the Artboard use File > Export (PDF, SVG, PNG).' },
  { q: 'How do I add my logo?', a: <>In the 3D Studio open Artwork, upload your logo or pick it from your library, and choose where it goes, or drag it onto the garment. Logos you upload are kept in <Link to="/assets">Assets</Link>.</> },
  { q: 'Can I turn a picture of a kit into 3D?', a: <>Yes. On <Link to="/convert">Convert</Link>, upload a photo, sketch or mockup and 3DEEZI turns it into an editable 3D kit.</> },
  { q: 'How do I order my kit?', a: <>Use the <Link to="/orders/new">Create Order Form</Link> to build an order step by step, or <Link to="/orders/upload">Upload Your Order</Link> if you already have an order form. Nothing is sent before you review and confirm, and each order gets a reference (3DZ-…).</> },
  { q: 'Where can I see how my order is going?', a: <><Link to="/orders">My Orders</Link> shows every order by stage: Order received, Design &amp; approval, Production, Shipped and Delivered. You also get a notice when a design needs your approval and when your order ships.</> },
  { q: 'Is there a mobile app?', a: <>3DEEZI is coming to the App Store and Google Play (see <Link to="/downloads">Downloads</Link>). The website also works on phones and tablets.</> },
];

interface SupportForm { name: string; email: string; order_reference: string; message: string }

export function SupportPage({ user }: { user: User | null }) {
  const [form, setForm] = useState<SupportForm>({ name: '', email: '', order_reference: '', message: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof SupportForm, string>>>({});
  const [state, setState] = useState<{ busy?: boolean; sent?: string; error?: string }>({});
  // A signed-in visitor's name and email are filled in (they can still change them).
  useEffect(() => { if (user) setForm(f => ({ ...f, name: f.name || user.name, email: f.email || user.email })); }, [user]);
  const set = (key: keyof SupportForm) => (e: { target: { value: string } }) => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(x => ({ ...x, [key]: undefined })); };
  const read = (key: keyof SupportForm) => form[key].trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { name: read('name'), email: read('email'), order_reference: read('order_reference'), message: read('message') };
    const local: typeof errors = {};
    if (!body.name) local.name = 'Please enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(body.email)) local.email = 'Please enter a valid email address.';
    if (body.message.length < 10) local.message = 'Please tell us a little more (at least 10 characters).';
    setErrors(local);
    if (Object.keys(local).length) return;
    setState({ busy: true });
    try {
      const r = await api<{ message: string }>('/support', { method: 'POST', body: JSON.stringify(body) });
      setState({ sent: r.message });
      setForm(f => ({ ...f, order_reference: '', message: '' }));
    } catch (err) {
      const fields = (err as { errors?: Record<string, string[]> }).errors;
      if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      setState({ error: (err as Error).message || 'Your message could not be sent. Please try again.' });
    }
  }

  return <OrderPageLayout className="info-page"
    header={<OrderPageHeader current="Support" title="Support" trail={HOME} back={null}
      subtitle="Help with designing, your account and your orders: ask 3DEEZI ASSIST, read the answers to common questions, or send the 3DEEZI team a message." />}
    main={<>
      <OrderSection number={1} title="Frequently asked questions" id="faq">
        <div className="info-faq">{faqs.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </OrderSection>
      <OrderSection number={2} title="Contact the 3DEEZI team" id="contact">
        {state.sent ? <div className="info-sent" role="status"><CircleCheck size={22} /><div><strong>Message sent.</strong><p>{state.sent}</p><button type="button" className="op-link" onClick={() => setState({})}>Send another message</button></div></div>
          : <form className="info-form" onSubmit={submit} noValidate>
            <p className="info-form-intro">For questions about an order, a quote, your account or anything else. We reply by email.</p>
            <div className="op-fields">
              <OrderField label="Your name" error={errors.name}><input className="op-input" name="name" autoComplete="name" maxLength={120} placeholder="Your name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} required /></OrderField>
              <OrderField label="Email" error={errors.email}><input className="op-input" type="email" name="email" autoComplete="email" maxLength={190} placeholder="Your email address" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} required /></OrderField>
              <OrderField label="Order reference (optional)" error={errors.order_reference} hint="For example 3DZ-1042, if your message is about an order."><input className="op-input" name="order_reference" maxLength={60} placeholder="3DZ-…" value={form.order_reference} onChange={set('order_reference')} aria-invalid={!!errors.order_reference} /></OrderField>
            </div>
            <OrderField label="Message" error={errors.message} className="info-message"><textarea className="op-input" name="message" rows={6} maxLength={5000} placeholder="How can we help?" value={form.message} onChange={set('message')} aria-invalid={!!errors.message} required /></OrderField>
            {state.error && <p className="op-error info-error" role="alert">{state.error}</p>}
            <div className="info-form-actions">
              <button className="info-send" disabled={state.busy}>{state.busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />} Send message</button>
              <small>By sending this form you agree to our <Link to="/privacy">Privacy Policy</Link>.</small>
            </div>
          </form>}
      </OrderSection>
    </>}
    side={<>
      <AssistCard title="3DEEZI ASSIST" heading="Get an answer straight away" line="3DEEZI ASSIST knows the website, the design tools and ordering. Ask it anything, on any page."
        actions={[{ key: 'open', icon: <MessageCircle size={20} />, label: 'Open 3DEEZI ASSIST', onClick: openAssist }]} placeholder="Ask 3DEEZI ASSIST…" />
      <section className="op-card info-help" aria-label="Your orders">
        <h2 className="op-card-title">About an order?</h2>
        <p><Link to="/orders">My Orders</Link> shows each order's stage, updates, design proofs to approve and delivery tracking.</p>
        <p className="info-small">Read how we handle your information in the <Link to="/privacy">Privacy Policy</Link> and the <Link to="/terms">Terms of Use</Link>.</p>
      </section>
    </>} />;
}

/* ------------------------------------------------------------------------------------------------ Privacy and Terms */

type Clause = { id: string; title: string; body: ReactNode };

function LegalPage({ current, title, subtitle, clauses }: { current: string; title: string; subtitle: ReactNode; clauses: Clause[] }) {
  return <OrderPageLayout className="info-page info-legal"
    header={<OrderPageHeader current={current} title={title} trail={HOME} back={null} subtitle={subtitle} />}
    main={<>
      <Updated draft />
      {clauses.map((c, i) => <OrderSection key={c.id} id={c.id} number={i + 1} title={c.title}><div className="info-prose">{c.body}</div></OrderSection>)}
    </>}
    side={<><Contents items={clauses} /><HelpCard /></>} />;
}

const support = <Link to="/support">Support page</Link>;

const privacy: Clause[] = [
  { id: 'about', title: 'About this policy', body: <>
    <p>This policy explains how 3DEEZI collects, uses, stores and shares personal information when you use the 3DEEZI website and apps. We handle personal information in line with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs).</p>
    <p>Questions about privacy? Contact us through the {support}.</p></> },
  { id: 'collect', title: 'What we collect', body: <ul>
    <li><strong>Your account:</strong> your name, email address and password (stored only in a scrambled, hashed form).</li>
    <li><strong>Your designs:</strong> kits, projects and their versions, Artboard designs and templates.</li>
    <li><strong>Your uploads:</strong> logos, artwork, pictures, order forms and other files you add.</li>
    <li><strong>Your orders:</strong> contact name, email, phone, team or organisation, delivery address, garments, sizes, player names and numbers, notes, design approvals, quotes, invoices and payment status.</li>
    <li><strong>Messages:</strong> questions you ask 3DEEZI ASSIST, the page you ask from, and messages you send with the Support form.</li>
    <li><strong>Technical information:</strong> your IP address, browser and device type, and server logs, used for security and to keep the service running.</li>
  </ul> },
  { id: 'why', title: 'Why we use it', body: <>
    <p>We use your information to run your account, save and show your designs, create AI designs you ask for, process, produce and deliver your orders, send you order updates, approval requests and invoices, answer your questions, keep the service secure and prevent misuse, improve 3DEEZI, and meet our legal obligations.</p>
    <p>We do not sell your personal information. We only send marketing messages if you have agreed to receive them, and you can opt out at any time.</p></> },
  { id: 'ai', title: 'AI processing', body: <>
    <p>AI features (AI Powered Sportswear, Convert, AI patterns, image editing, showcase images and mockups, and 3DEEZI ASSIST) send what you give them, such as your brief, pictures and chat questions, from our server to OpenAI, which creates the result for us. Your browser never sends this to OpenAI directly.</p>
    <p>OpenAI processes this information on our behalf under its own terms and privacy policy, and its servers may be outside Australia. Please do not include sensitive personal information (for example health details) in briefs, pictures or chat messages.</p></> },
  { id: 'payments', title: 'Payments', body: <p>Payments are handled by Stripe. You enter your card details on Stripe's secure payment forms and they go straight to Stripe: they never reach or are stored on our servers. Stripe tells us whether a payment succeeded, with its amount and reference, so we can match it to your invoice.</p> },
  { id: 'storage', title: 'Storage, security and retention', body: <>
    <p>Your information is stored on the servers of our hosting provider. We protect it with access controls, encrypted connections and hashed passwords, and only people who need it to run 3DEEZI or fulfil your orders can see it.</p>
    <p>We keep your account, designs and uploads while your account is open. We keep order, invoice and payment records for as long as Australian tax and business record laws require (generally five years). Support messages are kept while we help you and for a reasonable time after. When information is no longer needed, we delete or de-identify it.</p></> },
  { id: 'sharing', title: 'Who we share it with', body: <>
    <p>We share information only as needed to provide 3DEEZI: our hosting provider, OpenAI (AI features), Stripe (payments), email services (order and account emails), and the production and delivery partners who make and ship your order. Some of these providers may store or process information outside Australia, such as in the United States; we take reasonable steps so they protect it as the APPs require.</p>
    <p>We may also disclose information when the law requires it.</p></> },
  { id: 'rights', title: 'Your rights', body: <>
    <p>You can ask to <strong>access</strong> the personal information we hold about you, to <strong>correct</strong> it, or to <strong>delete</strong> your account and its information (except records we must keep by law). You can change your name and email on your Profile page; for anything else, contact us through the {support}. We will reply within 30 days.</p>
    <p>If you are not happy with how we handled a privacy concern, you can complain to the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.</p></> },
  { id: 'cookies', title: 'Cookies and local storage', body: <>
    <p>The website stores a few things in your browser so it works: your sign-in, the design you are working on, your Artboard work on this device, and your 3DEEZI ASSIST conversation for the current tab. We do not use advertising or third-party tracking cookies.</p>
    <p>Stripe may use its own cookies on payment pages to keep payments secure. You can clear your browser's storage at any time; you will then need to sign in again.</p></> },
  { id: 'young', title: 'Players and young people', body: <p>Orders can include players' names, numbers and sizes. Please only add them with the players' agreement (or, for children, their parent's or guardian's). If you are under 18, please use 3DEEZI with the permission of a parent, guardian, school or club.</p> },
  { id: 'changes', title: 'Changes to this policy', body: <p>We may update this policy as 3DEEZI changes. The date at the top shows the latest version, and we will tell you about important changes on the website or by email.</p> },
  { id: 'contact', title: 'Contact us', body: <p>For privacy questions or requests, contact the 3DEEZI team through the {support}.</p> },
];

const terms: Clause[] = [
  { id: 'about', title: 'About these terms', body: <p>These terms apply when you use the 3DEEZI website and apps and when you order from 3DEEZI. By creating an account, using 3DEEZI or placing an order, you agree to them. Our <Link to="/privacy">Privacy Policy</Link> explains how we handle your information.</p> },
  { id: 'accounts', title: 'Your account', body: <p>Give accurate details when you create an account, keep your password safe and tell us if you think someone else is using your account. You are responsible for what happens in your account. We may suspend or close accounts that break these terms.</p> },
  { id: 'designs', title: 'Your designs and intellectual property', body: <>
    <p><strong>You own your designs</strong> and the artwork you upload. You confirm that you own, or have permission to use, every logo, crest, name, picture and other artwork you upload or put on a design, including club, school and sponsor logos.</p>
    <p>You let 3DEEZI store, display, process (including with AI) and reproduce your designs and uploads as needed to provide the service and to produce your orders. We will not use your designs to promote 3DEEZI without your permission.</p>
    <p>The 3DEEZI website, apps, software, brand, templates and garment models belong to 3DEEZI.</p></> },
  { id: 'ai', title: 'AI-generated content', body: <p>AI designs, patterns, mockups and answers from 3DEEZI ASSIST are created automatically. They may contain mistakes or look similar to other designs. Check them before you use or order them, and make sure your final design does not use anyone else's logos, trademarks or artwork without permission. AI features may use credits under your plan.</p> },
  { id: 'orders', title: 'Orders and quotes', body: <>
    <p>When you confirm an order, you ask us to make it. We review every order and confirm its price in a quote or invoice; the order is accepted when we confirm it. We send a design proof for you to approve, and production starts only after you approve the design.</p>
    <p>Your garments are made to order from the details you approve, so please check sizes, names, numbers and spelling carefully before approving.</p></> },
  { id: 'payment', title: 'Payment', body: <p>Orders are paid in full before production starts. Prices are in Australian dollars and include GST unless shown otherwise. Payments are handled securely by Stripe, and we email you an invoice and a receipt.</p> },
  { id: 'delivery', title: 'Production and delivery', body: <p>Production and delivery times are estimates. My Orders shows each order's stage and updates, and you get the carrier and tracking number when your order ships. Please give a delivery address where someone can receive the parcel.</p> },
  { id: 'returns', title: 'Faulty items and returns', body: <>
    <p>Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. If an item is faulty or does not match the design you approved, contact us through the <Link to="/support">Support page</Link> as soon as possible, with your order reference and photos, and we will repair, replace or refund it as the law requires.</p>
    <p>Because every item is made to order, we do not accept returns for a change of mind or for details that match the approved design and order (such as sizes or spelling).</p></> },
  { id: 'use', title: 'Using 3DEEZI fairly', body: <p>Do not upload anything unlawful, offensive or that infringes someone else's rights, try to break or overload the service, or copy or resell 3DEEZI without a partner agreement. We may remove content that breaks these terms.</p> },
  { id: 'liability', title: 'Limitation of liability', body: <p>Nothing in these terms excludes rights you have under the Australian Consumer Law. To the extent the law allows, 3DEEZI is not liable for indirect or consequential loss, and our liability for an order is limited to repairing, replacing or re-supplying the goods or services, or refunding what you paid for them.</p> },
  { id: 'law', title: 'Governing law', body: <p>These terms are governed by the laws of Australia, and the courts of Australia can hear any dispute about them.</p> },
  { id: 'changes', title: 'Changes to these terms', body: <p>We may update these terms as 3DEEZI changes. The date at the top shows the latest version; we will tell you about important changes on the website or by email, and the terms that applied when you placed an order apply to that order.</p> },
  { id: 'contact', title: 'Contact us', body: <p>Questions about these terms? Contact the 3DEEZI team through the {support}.</p> },
];

export function PrivacyPage() {
  return <LegalPage current="Privacy" title="Privacy Policy" clauses={privacy}
    subtitle="How 3DEEZI handles your personal information, in plain language." />;
}

export function TermsPage() {
  return <LegalPage current="Terms" title="Terms of Use" clauses={terms}
    subtitle="The rules for using 3DEEZI and ordering your kit, in plain language." />;
}
