/**
 * 3DEEZI TEAM, the human designer service (client brief 2026-10-21): the landing page with the request form
 * (/team), My design requests (/team/requests) and one request with its progress, conversation, designs for
 * review and the final design (/team/requests/:id). Server: T1's team-api.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Box, CalendarClock, Check, CheckCircle2, ClipboardList, CreditCard, Download, FileText, ImagePlus, LoaderCircle, MessageSquare, Paperclip, PenTool, Plus, RefreshCw, Send, ShieldCheck, ShoppingBag, Sparkles, Upload, UserRound, Users, X } from 'lucide-react';
import { ApiError, media, type Catalog, type User } from '../api';
import { clearIdempotencyKey, idempotencyKey } from '../orderApi';
import { TEAM_DEFAULTS, TEAM_LIMITS, TEAM_REFUNDS, TEAM_STEPS, audMoney, extOf, inclGst, money, teamApi, type TeamAllowance, type TeamFile, type TeamRequest, type TeamStatus } from '../teamApi';
import '../../css/team.css';

type RequireAuth = (after?: () => void) => void;
const SWATCHES = ['#0a0f16', '#ffffff', '#12e1f0', '#0a2342', '#1f5fff', '#7b5cff', '#e11d48', '#f97316', '#facc15', '#16a34a', '#6b7280', '#b8860b'];
const STATUS_TONE: Record<TeamStatus, string> = { awaiting_payment: 'amber', received: 'blue', assigned: 'blue', in_progress: 'violet', review: 'cyan', revision: 'amber', approved: 'green', closed: 'grey' };
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
/** The Review & Pay page of an invoice, inside this site (the server's pay_url is an absolute address). */
export const payPath = (invoice?: { invoice_number: string | null } | null) => invoice?.invoice_number ? `/invoices/${encodeURIComponent(invoice.invoice_number)}` : null;
const sizeMb = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function StatusChip({ request }: { request: Pick<TeamRequest, 'status' | 'status_label'> }) {
  return <span className={`tm-chip tone-${STATUS_TONE[request.status] ?? 'grey'}`}>{request.status_label}</span>;
}

/** The progress steps: REQUEST RECEIVED → DESIGNER ASSIGNED → DESIGN IN PROGRESS → READY FOR REVIEW → APPROVED / REVISIONS. */
export function TeamSteps({ request }: { request: Pick<TeamRequest, 'status' | 'stage_index' | 'status_label'> }) {
  if (request.status === 'awaiting_payment' || request.status === 'closed') return <p className={`tm-steps-note tone-${STATUS_TONE[request.status]}`}>{request.status === 'closed' ? 'This request is closed.' : 'Waiting for payment: your designer starts as soon as the invoice is paid.'}</p>;
  return <ol className="tm-steps" aria-label="Progress">{TEAM_STEPS.map((label, i) => {
    const text = i === 3 && request.status === 'revision' ? 'Revisions requested' : label;
    const state = i < request.stage_index || request.status === 'approved' ? 'done' : i === request.stage_index ? 'current' : 'todo';
    return <li key={label} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}><span className="tm-step-dot">{state === 'done' ? <Check size={14} /> : i + 1}</span><span>{text}</span></li>;
  })}</ol>;
}

/** A picture from the API, fetched with the sign-in token (the thumb shows until it arrives). */
function TeamImage({ file, alt, className }: { file: TeamFile; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(file.thumb);
  useEffect(() => {
    let url = ''; let live = true;
    teamApi.fileBlob(file).then(blob => { if (!live) return; url = URL.createObjectURL(blob); setSrc(url); }).catch(() => { /* keep the thumb */ });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [file.url]);
  return src ? <img className={className} src={src} alt={alt} /> : <span className={`tm-img-wait ${className || ''}`}><LoaderCircle className="spin" size={20} /></span>;
}

function FileChip({ file }: { file: TeamFile }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" className="tm-file" onClick={async () => { setBusy(true); try { await teamApi.download(file); } finally { setBusy(false); } }} title={`Download ${file.name}`}>
    {file.thumb ? <img src={file.thumb} alt="" /> : <FileText size={18} />}<span>{file.name}</span>{busy ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}
  </button>;
}

/** Files picked on the computer (logos, references, chat attachments): checked against the contract's limits. */
function useFilePicks(max: number, types: string[]) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const add = (list: FileList | File[] | null) => {
    if (!list) return; setError('');
    const picked = [...list]; const ok: File[] = [];
    for (const file of picked) {
      if (!types.includes(extOf(file.name))) { setError(`${file.name}: this file type is not accepted (${types.join(', ')}).`); continue; }
      if (file.size > TEAM_LIMITS.fileMb * 1048576) { setError(`${file.name} is over ${TEAM_LIMITS.fileMb} MB.`); continue; }
      ok.push(file);
    }
    setFiles(prev => { const next = [...prev, ...ok]; if (next.length > max) setError(`Up to ${max} files here.`); return next.slice(0, max); });
  };
  return { files, error, add, remove: (i: number) => setFiles(prev => prev.filter((_, k) => k !== i)), clear: () => { setFiles([]); setError(''); } };
}

function DropZone({ id, label, hint, icon, picks, accept, max }: { id: string; label: string; hint: string; icon: ReactNode; picks: ReturnType<typeof useFilePicks>; accept: string[]; max: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const previews = useMemo(() => picks.files.map(f => f.type.startsWith('image/') && !f.type.includes('svg') ? URL.createObjectURL(f) : ''), [picks.files]);
  useEffect(() => () => previews.forEach(u => u && URL.revokeObjectURL(u)), [previews]);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); picks.add(e.dataTransfer.files); };
  return <div className="tm-field">
    <span className="tm-label" id={`${id}-l`}>{label}</span>
    <div className={`tm-drop${over ? ' is-over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {icon}<span><strong>Drop files here</strong> or <button type="button" className="tm-link" onClick={() => input.current?.click()} aria-describedby={`${id}-l`}>browse</button></span><small>{hint}</small>
      <input ref={input} id={id} type="file" multiple hidden accept={accept.map(a => `.${a}`).join(',')} onChange={(e: ChangeEvent<HTMLInputElement>) => { picks.add(e.target.files); e.target.value = ''; }} />
    </div>
    {picks.files.length > 0 && <ul className="tm-picks">{picks.files.map((f, i) => <li key={`${f.name}${i}`}>{previews[i] ? <img src={previews[i]} alt="" /> : <FileText size={18} />}<span>{f.name}<small>{sizeMb(f.size)}</small></span><button type="button" className="icon-button" aria-label={`Remove ${f.name}`} onClick={() => picks.remove(i)}><X size={14} /></button></li>)}</ul>}
    <small className="tm-count">{picks.files.length} / {max}</small>
    {picks.error && <p className="error-message" role="alert">{picks.error}</p>}
  </div>;
}

function ColourPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [custom, setCustom] = useState('#12e1f0');
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter(v => v !== c) : value.length >= 8 ? value : [...value, c]);
  return <div className="tm-field">
    <span className="tm-label" id="tm-colours-l">Preferred colours <small>(up to 8)</small></span>
    <div className="tm-swatches" role="group" aria-labelledby="tm-colours-l">
      {SWATCHES.map(c => <button key={c} type="button" className={`tm-swatch${value.includes(c) ? ' is-on' : ''}`} style={{ background: c }} aria-pressed={value.includes(c)} aria-label={`Colour ${c}`} onClick={() => toggle(c)}>{value.includes(c) && <Check size={14} />}</button>)}
      <label className="tm-swatch tm-swatch-custom" title="Pick any colour"><input type="color" value={custom} onChange={e => setCustom(e.target.value)} aria-label="Pick any colour" /><span style={{ background: custom }} /></label>
      <button type="button" className="button button-outline tm-add-colour" onClick={() => toggle(custom)} disabled={value.includes(custom) || value.length >= 8}><Plus size={14} /> Add</button>
    </div>
    {value.length > 0 && <div className="tm-chosen">{value.map(c => <span key={c}><i style={{ background: c }} />{c}<button type="button" aria-label={`Remove ${c}`} onClick={() => toggle(c)}><X size={12} /></button></span>)}</div>}
  </div>;
}

function AllowanceCard({ allowance, user, onSignIn }: { allowance: TeamAllowance | null; user: User | null; onSignIn: () => void }) {
  if (!user) return <aside className="tm-allow panel"><span className="tm-kicker">YOUR ALLOWANCE</span><p>Sign in to see the design requests included in your plan and the price of the next one.</p><button className="button button-outline" onClick={onSignIn}>Sign in <ArrowRight size={15} /></button></aside>;
  if (!allowance) return <aside className="tm-allow panel" aria-busy="true"><span className="tm-kicker">YOUR ALLOWANCE</span><p><LoaderCircle className="spin" size={16} /> Checking your plan…</p></aside>;
  const next = allowance.next_request;
  return <aside className="tm-allow panel" aria-label="Your 3DEEZI TEAM allowance">
    <span className="tm-kicker">YOUR PLAN · {allowance.plan_name.toUpperCase()}</span>
    <div className="tm-allow-grid">
      <div><b>{allowance.unlimited ? '∞' : allowance.remaining_included}</b><span>{allowance.unlimited ? 'Unlimited requests' : `of ${allowance.included_per_month + allowance.bonus_remaining} included left this month`}</span></div>
      <div><b>{next.billing === 'paid' ? money(next.total, next.currency) : 'Included'}</b><span>{next.billing === 'paid' ? `Your next request, incl. ${next.tax_name || 'GST'}` : 'Your next request'}</span></div>
      <div><b>{allowance.revisions_per_request}</b><span>Revisions per request</span></div>
    </div>
    {next.billing === 'paid' && <p className="tm-allow-note"><CreditCard size={15} /> {next.pay_first ? 'You pay the invoice first; your designer starts when it is paid.' : 'An invoice is issued; your designer starts straight away.'}</p>}
    {!allowance.can_submit && allowance.blocked_reason && <p className="tm-allow-note is-warn" role="status">{allowance.blocked_reason}</p>}
  </aside>;
}

function RequestList({ requests, compact }: { requests: TeamRequest[]; compact?: boolean }) {
  if (!requests.length) return <p className="muted tm-empty">No design requests yet. Your requests and their progress appear here.</p>;
  return <ul className={`tm-list${compact ? ' is-compact' : ''}`}>{requests.map(r => <li key={r.id}><Link to={`/team/requests/${r.id}`} className="tm-row">
    <span className="tm-row-ref">{r.number}</span>
    <span className="tm-row-main"><strong>{r.garment_name || r.garment} · {r.sport_name || r.sport}</strong><small>{r.name} · {fmtDate(r.created_at)}</small></span>
    <StatusChip request={r} />
    {r.unread > 0 && <span className="tm-unread" aria-label={`${r.unread} new messages`}>{r.unread}</span>}
    <ArrowRight size={16} className="tm-row-go" />
  </Link></li>)}</ul>;
}

/** /team: the landing page (heading, how it works, allowance), the request form and the customer's requests. */
export function TeamPage({ user, requireAuth, catalog }: { user: User | null; requireAuth: RequireAuth; catalog: Catalog | null }) {
  const navigate = useNavigate();
  const [allowance, setAllowance] = useState<TeamAllowance | null>(null);
  const [requests, setRequests] = useState<TeamRequest[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sent, setSent] = useState<TeamRequest | null>(null);
  const load = useCallback(() => {
    if (!user) { setAllowance(null); setRequests(null); return; }
    setLoadError('');
    teamApi.allowance().then(setAllowance).catch(e => setLoadError((e as Error).message));
    teamApi.list().then(setRequests).catch(e => setLoadError((e as Error).message));
  }, [user]);
  useEffect(load, [load]);
  const toForm = () => document.getElementById('tm-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="tm-page">
    <section className="tm-hero" style={{ backgroundImage: `linear-gradient(90deg,#020912 0,#020912f0 38%,#02091299 62%,#0209124d),url(${media('images/art/home_team.webp')})` }}>
      <div className="tm-hero-inner">
        <span className="tm-kicker"><Users size={15} /> HUMAN DESIGN SERVICE</span>
        <h1>3DEEZI <span>TEAM</span></h1>
        <p className="tm-sub">REAL DESIGNERS. REAL RESULTS.</p>
        <p className="tm-lead">Let our professional design team bring your ideas to life. Simply upload your logos, colours, examples and design requirements, and we’ll take care of the rest.</p>
        <p className="tm-promise" data-testid="team-promise"><CalendarClock size={17} /> First design within {(allowance?.turnaround ?? TEAM_DEFAULTS.turnaround).first_draft_days} business days</p>
        <div className="tm-hero-actions"><button className="button button-gradient tm-cta" onClick={toForm}>REQUEST A DESIGNER <ArrowRight size={18} /></button>{user && requests && requests.length > 0 && <Link className="button button-outline" to="/team/requests"><ClipboardList size={16} /> MY DESIGN REQUESTS</Link>}</div>
      </div>
    </section>
    <div className="page-shell tm-shell">
      <section className="tm-how" aria-labelledby="tm-how-h">
        <h2 id="tm-how-h">HOW IT <span>WORKS</span></h2>
        <ol>
          <li><span className="tm-how-icon"><Upload /></span><b>1. Send your brief</b><p>Your sport and garment, logos, colours, examples and anything else your designer should know.</p></li>
          <li><span className="tm-how-icon"><UserRound /></span><b>2. Meet your designer</b><p>A 3DEEZI designer takes your request and keeps you posted here and by notification.</p></li>
          <li><span className="tm-how-icon"><PenTool /></span><b>3. Review and refine</b><p>See the designs, chat with your designer and ask for revisions until it is right.</p></li>
          <li><span className="tm-how-icon"><CheckCircle2 /></span><b>4. Approve and order</b><p>Your final design goes to My assets: open it on the 3D kit or order it straight away.</p></li>
        </ol>
      </section>
      <TeamFacts allowance={allowance} />
      <div className="tm-columns">
        <section className="tm-form-wrap" id="tm-request" aria-labelledby="tm-form-h">
          {sent ? <Confirmation request={sent} onAnother={() => { setSent(null); load(); }} onPay={url => navigate(url)} />
            : <RequestForm user={user} catalog={catalog} allowance={allowance} requireAuth={requireAuth} onSent={r => { setSent(r); load(); setTimeout(() => document.getElementById('tm-request')?.scrollIntoView({ block: 'start' }), 30); }} />}
        </section>
        <div className="tm-side">
          <AllowanceCard allowance={allowance} user={user} onSignIn={() => requireAuth()} />
          {user && <section className="tm-mine panel" aria-labelledby="tm-mine-h"><div className="tm-mine-head"><h2 id="tm-mine-h">MY DESIGN REQUESTS</h2>{requests && requests.length > 0 && <Link to="/team/requests">View all</Link>}</div>
            {loadError ? <p className="error-message" role="alert">{loadError} <button className="tm-link" onClick={load}>Try again</button></p> : requests ? <RequestList requests={requests.slice(0, 5)} compact /> : <p className="muted"><LoaderCircle className="spin" size={16} /> Loading…</p>}
          </section>}
        </div>
      </div>
    </div>
  </div>;
}

/** Prices (incl. GST), revisions and extra rounds, turnaround and the refund policy (client answers 2026-10-21). */
function TeamFacts({ allowance }: { allowance: TeamAllowance | null }) {
  const plans = allowance?.plans?.length ? allowance.plans : TEAM_DEFAULTS.plans;
  const turnaround = allowance?.turnaround ?? TEAM_DEFAULTS.turnaround;
  const currency = allowance?.next_request.currency ?? 'AUD';
  const tax = allowance?.next_request.tax_name || 'GST';
  const extra = allowance?.extra_revision?.price ?? TEAM_DEFAULTS.extraRevision;
  const short = (name: string) => name.split(' / ')[0];
  const included = plans.filter(p => p.included_per_month > 0);
  return <section className="tm-facts-panel" aria-labelledby="tm-facts-h">
    <h2 id="tm-facts-h">GOOD TO <span>KNOW</span></h2>
    <dl className="tm-faq">
      <div><dt><CreditCard size={17} /> Prices</dt><dd>{included.length > 0 && <>{included.map(p => `${short(p.name)}: ${p.included_per_month} included a month`).join(' · ')} (no carry-over). </>}Each extra request: {plans.map(p => `${short(p.name)} ${audMoney(p.price, currency)}`).join(', ')}, all incl. {tax}.</dd></div>
      <div><dt><RefreshCw size={17} /> Revisions</dt><dd>{plans.map(p => `${short(p.name)} ${p.revisions}`).join(', ')} per request. Need more? An extra revision round is {inclGst(extra, currency, tax)}, and it starts once paid.</dd></div>
      <div><dt><CalendarClock size={17} /> Turnaround</dt><dd>First design within {turnaround.first_draft_days} business days; each revision within {turnaround.revision_days} business days (Monday to Friday). Paid requests start once the invoice is paid.</dd></div>
      <div><dt><ShieldCheck size={17} /> Refunds</dt><dd data-testid="team-refunds">{TEAM_REFUNDS.join(' ')}</dd></div>
    </dl>
  </section>;
}

function Confirmation({ request, onAnother, onPay }: { request: TeamRequest; onAnother: () => void; onPay: (url: string) => void }) {
  const mustPay = request.status === 'awaiting_payment' || (request.billing === 'paid' && request.invoice?.can_pay);
  return <div className="tm-confirm panel" role="status">
    <CheckCircle2 size={44} />
    <span className="tm-kicker">SENT TO 3DEEZI TEAM</span>
    <h2>Your reference: <span data-testid="team-ref">{request.number}</span></h2>
    {mustPay && request.invoice
      ? <><p>This request is {inclGst(request.invoice.total || request.price, request.currency)}. Pay invoice {request.invoice.invoice_number} and your designer starts straight away.</p><div className="tm-confirm-actions">{payPath(request.invoice) && <button className="button button-gradient" onClick={() => onPay(payPath(request.invoice)!)}><CreditCard size={16} /> REVIEW &amp; PAY</button>}<Link className="button button-outline" to={`/team/requests/${request.id}`}>VIEW REQUEST</Link></div></>
      : <><p>We have your brief. A designer will be assigned shortly; you will get a notification at each step.</p><div className="tm-confirm-actions"><Link className="button button-gradient" to={`/team/requests/${request.id}`}>VIEW REQUEST <ArrowRight size={16} /></Link><button className="button button-outline" onClick={onAnother}>SEND ANOTHER REQUEST</button></div></>}
  </div>;
}

function RequestForm({ user, catalog, allowance, requireAuth, onSent }: { user: User | null; catalog: Catalog | null; allowance: TeamAllowance | null; requireAuth: RequireAuth; onSent: (r: TeamRequest) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [sport, setSport] = useState(''); const [garment, setGarment] = useState(''); const [garmentOther, setGarmentOther] = useState('');
  const [description, setDescription] = useState(''); const [instructions, setInstructions] = useState('');
  const [colours, setColours] = useState<string[]>([]);
  const logos = useFilePicks(TEAM_LIMITS.logos, TEAM_LIMITS.logoTypes);
  const references = useFilePicks(TEAM_LIMITS.references, TEAM_LIMITS.referenceTypes);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  useEffect(() => { if (user) { setName(n => n || user.name); setEmail(e => e || user.email); } }, [user]);
  const sports = catalog?.sports ?? [];
  const chosenSport = sports.find(s => s.id === sport);
  const garments = useMemo(() => {
    const all = catalog?.garments ?? [];
    const wanted = chosenSport?.garments;
    return wanted?.length ? [...wanted.map(id => all.find(g => g.id === id)).filter((g): g is NonNullable<typeof g> => !!g), ...all.filter(g => !wanted.includes(g.id))] : all;
  }, [catalog, chosenSport]);
  const groups = [{ key: 'sports', label: 'Sports' }, { key: 'apparel', label: 'Apparel' }];
  const totalMb = [...logos.files, ...references.files].reduce((t, f) => t + f.size, 0) / 1048576;
  const blocked = !!allowance && !allowance.can_submit;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setFieldErrors({});
    if (!user) { requireAuth(); return; }
    if (totalMb > TEAM_LIMITS.totalMb) { setError(`Your files add up to ${totalMb.toFixed(0)} MB: the limit is ${TEAM_LIMITS.totalMb} MB per request.`); return; }
    const garmentValue = garment === '__other' ? garmentOther.trim() : garment;
    if (!garmentValue) { setError('Choose the garment type.'); return; }
    setBusy(true);
    const key = idempotencyKey('team-request');
    try {
      const request = await teamApi.create({ name, email, sport, garment: garmentValue, category: chosenSport?.group === 'apparel' ? 'Apparel' : chosenSport ? 'Sports' : undefined, description, colours, instructions, logos: logos.files, references: references.files }, key);
      clearIdempotencyKey('team-request');
      logos.clear(); references.clear(); setDescription(''); setInstructions(''); setColours([]);
      onSent(request);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      setError((err as Error).message);
    } finally { setBusy(false); }
  }
  const fe = (k: string) => fieldErrors[k]?.[0] ? <small className="tm-field-error">{fieldErrors[k][0]}</small> : null;
  return <form className="tm-form panel" onSubmit={submit} noValidate={false}>
    <span className="tm-kicker"><Sparkles size={14} /> REQUEST A DESIGNER</span>
    <h2 id="tm-form-h">Tell us what you need</h2>
    {!user && <p className="tm-signin-note">You can fill in your brief now; you sign in when you send it.</p>}
    <div className="tm-grid2">
      <label className="field">Customer or business name<input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoComplete="organization" placeholder="Northside Hawks" />{fe('name')}</label>
      <label className="field">Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={190} autoComplete="email" placeholder="you@yourclub.com" />{fe('email')}</label>
      <label className="field">Sport or apparel category<select value={sport} onChange={e => { setSport(e.target.value); }} required>
        <option value="" disabled>{catalog ? 'Choose a sport or category' : 'Loading the catalogue…'}</option>
        {groups.map(g => { const items = sports.filter(s => (s.group ?? 'sports') === g.key); return items.length ? <optgroup key={g.key} label={g.label}>{items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup> : null; })}
      </select>{fe('sport')}</label>
      <label className="field">Garment type<select value={garment} onChange={e => setGarment(e.target.value)} required>
        <option value="" disabled>Choose a garment</option>
        {garments.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}<option value="__other">Something else…</option>
      </select>{fe('garment')}</label>
      {garment === '__other' && <label className="field tm-span2">Which garment?<input value={garmentOther} onChange={e => setGarmentOther(e.target.value)} required maxLength={60} placeholder="e.g. Hoodie, bucket hat" /></label>}
    </div>
    <label className="field">Design description<textarea value={description} onChange={e => setDescription(e.target.value)} required minLength={10} maxLength={4000} rows={5} placeholder="The look you want: style, pattern, where the logos go, names and numbers, the feel of the kit…" /><small className="tm-count">{description.length} / 4000</small>{fe('description')}</label>
    <ColourPicker value={colours} onChange={setColours} />
    {fe('colours')}
    <div className="tm-grid2">
      <DropZone id="tm-logos" label="Logos" hint={`Up to ${TEAM_LIMITS.logos}: PNG, JPG, SVG, PDF, AI, EPS · ${TEAM_LIMITS.fileMb} MB each`} icon={<ImagePlus size={22} />} picks={logos} accept={TEAM_LIMITS.logoTypes} max={TEAM_LIMITS.logos} />
      <DropZone id="tm-refs" label="Reference images and documents" hint={`Up to ${TEAM_LIMITS.references}: pictures, PDF, Word, PowerPoint, ZIP`} icon={<Paperclip size={22} />} picks={references} accept={TEAM_LIMITS.referenceTypes} max={TEAM_LIMITS.references} />
    </div>
    {fe('logos')}{fe('references')}
    <label className="field">Additional instructions <small className="muted">(optional)</small><textarea value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={4000} rows={3} placeholder="Deadlines, sponsors, sizes of the logos, anything else" /></label>
    {allowance && allowance.next_request.billing === 'paid' && <p className="tm-price" role="note"><CreditCard size={16} /> This request is <b>{money(allowance.next_request.total, allowance.next_request.currency)}</b> incl. {allowance.next_request.tax_name || 'GST'}. After sending, you pay the invoice on the Review &amp; Pay page.</p>}
    {allowance && allowance.next_request.billing !== 'paid' && <p className="tm-price is-included" role="note"><Check size={16} /> {allowance.unlimited || allowance.next_request.billing === 'free' ? 'This request is free on your plan.' : 'This request is included in your plan.'}</p>}
    {blocked && <p className="error-message" role="alert">{allowance?.blocked_reason}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="button button-gradient tm-send" disabled={busy || blocked}>{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={17} />} SEND TO 3DEEZI TEAM</button>
  </form>;
}

/** /team/requests: the customer's design requests (history). */
export function TeamRequestsPage() {
  const [requests, setRequests] = useState<TeamRequest[] | null>(null); const [error, setError] = useState('');
  const load = () => { setError(''); teamApi.list().then(setRequests).catch(e => setError((e as Error).message)); };
  useEffect(load, []);
  return <div className="page-shell tm-shell tm-requests-page">
    <div className="tm-page-head"><div><span className="tm-kicker"><Users size={15} /> 3DEEZI TEAM</span><h1>MY DESIGN <span>REQUESTS</span></h1></div><Link className="button button-gradient" to="/team#tm-request">REQUEST A DESIGNER <ArrowRight size={16} /></Link></div>
    {error ? <p className="error-message" role="alert">{error} <button className="tm-link" onClick={load}>Try again</button></p> : requests ? <RequestList requests={requests} /> : <p className="muted"><LoaderCircle className="spin" size={16} /> Loading…</p>}
  </div>;
}

/** /team/requests/:id: progress, the designs for review, the conversation and the final design. */
export function TeamRequestPage({ onStudio, onNotice }: { onStudio: (picture: { asset: number; name: string; garment: string; sport: string }) => void; onNotice: (text: string) => void }) {
  const { requestId = '' } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<TeamRequest | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [actionError, setActionError] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [revising, setRevising] = useState<false | 'included' | 'extra'>(false); const [revision, setRevision] = useState('');
  const revisionFiles = useFilePicks(TEAM_LIMITS.messageFiles, TEAM_LIMITS.referenceTypes);
  const chatBox = useRef<HTMLTextAreaElement>(null);
  const load = useCallback((quiet = false) => {
    if (!quiet) setError('');
    return teamApi.get(requestId).then(r => { setRequest(r); setVersion(v => v ?? r.latest_version); }).catch(e => { if (!quiet) setError((e as Error).message); });
  }, [requestId]);
  useEffect(() => { setRequest(null); setVersion(null); load(); }, [load]);
  // New messages and status changes while the page is open (the PHP server is light: once a minute, only when visible).
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60000); return () => clearInterval(t); }, [load]);

  async function act(name: string, run: () => Promise<unknown>) {
    setBusy(name); setActionError('');
    try { await run(); } catch (e) { setActionError((e as Error).message); } finally { setBusy(''); }
  }
  if (error) return <div className="page-shell tm-shell"><p className="error-message" role="alert">{error}</p><Link className="button button-outline" to="/team/requests"><ArrowLeft size={16} /> My design requests</Link></div>;
  if (!request) return <div className="page-shell empty-state"><LoaderCircle className="spin" /><p>Loading your request…</p></div>;
  const deliveries = [...(request.deliveries ?? [])].sort((a, b) => b.version - a.version);
  const shown = deliveries.find(d => d.version === version) ?? deliveries[0];
  const reviewing = request.status === 'review';
  const left = request.revisions_allowed - request.revisions_used;
  const extraPrice = request.extra_revision_price;
  const extraText = extraPrice ? inclGst(extraPrice.price, extraPrice.currency, extraPrice.tax_name) : '';
  const revisionInvoice = request.pending_revision?.invoice ?? null;
  return <div className="page-shell tm-shell tm-detail">
    <Link className="tm-back" to="/team/requests"><ArrowLeft size={16} /> My design requests</Link>
    <div className="tm-page-head"><div><span className="tm-kicker"><Users size={15} /> 3DEEZI TEAM · {request.number}</span><h1>{request.garment_name || request.garment} <span>· {request.sport_name || request.sport}</span></h1><p className="muted">{request.name} · sent {fmtDate(request.created_at)}{request.designer ? ` · designer ${request.designer.name}` : ''}</p>{request.due_date && ['received', 'assigned', 'in_progress', 'revision'].includes(request.status) && <p className="tm-due" data-testid="team-due"><CalendarClock size={16} /> {request.status === 'revision' ? 'Revision' : request.latest_version ? 'Next design' : 'First design'} due by <b>{fmtDate(request.due_date)}</b></p>}</div><StatusChip request={request} /></div>
    <TeamSteps request={request} />
    {actionError && <p className="error-message" role="alert">{actionError}</p>}
    {request.can.pay && request.invoice && payPath(request.invoice) && <div className="tm-banner panel"><CreditCard size={20} /><span>Invoice {request.invoice.invoice_number}: {money(request.invoice.amount_due || request.invoice.total || request.price, request.currency)} incl. GST to pay before your designer starts.</span><button className="button button-gradient" onClick={() => navigate(payPath(request.invoice)!)}>REVIEW &amp; PAY</button></div>}
    {revisionInvoice && <div className="tm-banner panel" data-testid="team-extra-pay"><CreditCard size={20} /><span>Extra revision: invoice {revisionInvoice.invoice_number}, {inclGst(revisionInvoice.amount_due || revisionInvoice.total || '0')}. Your designer starts the revision once it is paid.</span>{request.can.pay_revision && payPath(revisionInvoice) && <button className="button button-gradient" onClick={() => navigate(payPath(revisionInvoice)!)}>REVIEW &amp; PAY</button>}</div>}
    {request.refund_status && <div className="tm-banner panel is-refund" role="status"><ShieldCheck size={20} /><span>{request.refund_status === 'refunded' ? 'Refunded in full.' : 'Cancelled before work started: your full refund is being processed.'}</span></div>}

    {request.final && <section className="tm-final panel" aria-labelledby="tm-final-h">
      <span className="tm-kicker"><CheckCircle2 size={15} /> FINAL DESIGN · VERSION {request.final.version}</span>
      <h2 id="tm-final-h">Approved {fmtDate(request.final.approved_at)}. It is saved in <Link to="/assets">My assets</Link>.</h2>
      <div className="tm-final-grid">{request.final.files.filter(f => f.is_image).map(f => <TeamImage key={f.id} file={f} alt={`Final design ${f.name}`} className="tm-final-img" />)}</div>
      <div className="tm-final-actions">
        {request.can.to_studio && <button className="button button-gradient" disabled={!!busy} onClick={() => act('studio', async () => { const r = await teamApi.toStudio(request.id); onStudio({ asset: r.asset_id, name: r.name, garment: r.garment || request.garment, sport: r.sport || request.sport }); })}>{busy === 'studio' ? <LoaderCircle className="spin" size={16} /> : <Box size={16} />} OPEN IN 3D DESIGNER</button>}
        {request.can.order && <button className="button button-outline" disabled={!!busy} onClick={() => act('order', async () => { const r = await teamApi.orderDraft(request.id); navigate(r.link || `/orders/new?draft=${r.draft_id}`); })}>{busy === 'order' ? <LoaderCircle className="spin" size={16} /> : <ShoppingBag size={16} />} ORDER THIS DESIGN</button>}
        <div className="tm-final-files">{request.final.files.map(f => <FileChip key={f.id} file={f} />)}</div>
      </div>
    </section>}

    <div className="tm-detail-cols">
      <div className="tm-detail-main">
        <section className="tm-review panel" aria-labelledby="tm-review-h">
          <div className="tm-review-head"><h2 id="tm-review-h">{reviewing ? 'READY FOR YOUR REVIEW' : 'DESIGNS'}</h2>
            {deliveries.length > 1 && <div className="tm-versions" role="tablist" aria-label="Versions">{deliveries.map(d => <button key={d.version} role="tab" aria-selected={shown?.version === d.version} className={shown?.version === d.version ? 'is-on' : ''} onClick={() => setVersion(d.version)}>V{d.version}</button>)}</div>}
          </div>
          {!shown ? <p className="muted tm-empty">Your designer’s designs appear here for you to review. You will get a notification when they are ready.</p> : <>
            <div className="tm-designs">{shown.files.map(f => f.is_image ? <figure key={f.id}><TeamImage file={f} alt={`Design version ${shown.version}: ${f.name}`} /><figcaption>{f.name}</figcaption></figure> : <FileChip key={f.id} file={f} />)}</div>
            {shown.note && <p className="tm-note"><MessageSquare size={15} /> {shown.note}</p>}
          </>}
          {reviewing && shown && <div className="tm-review-actions">
            <button className="button button-gradient" disabled={!!busy || !request.can.approve} onClick={() => act('approve', async () => { const r = await teamApi.approve(request.id, shown.version); setRequest(r); onNotice(`${r.number} approved. Your design is in My assets.`); })}>{busy === 'approve' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} APPROVE V{shown.version}</button>
            {request.can.extra_revision
              ? <button className="button button-outline" disabled={!!busy} onClick={() => setRevising(v => v === 'extra' ? false : 'extra')} data-testid="team-extra-revision"><RefreshCw size={16} /> EXTRA REVISION {extraPrice ? money(extraPrice.price, extraPrice.currency) : ''}</button>
              : <button className="button button-outline" disabled={!!busy || !request.can.revise || left <= 0} onClick={() => setRevising(v => v ? false : 'included')}><RefreshCw size={16} /> REQUEST REVISIONS</button>}
            <button className="button button-quiet" onClick={() => chatBox.current?.focus()}><MessageSquare size={16} /> MESSAGE</button>
            <small className="muted">{left > 0 ? `${left} of ${request.revisions_allowed} revisions left` : revisionInvoice ? 'Extra revision waiting for payment.' : request.can.extra_revision ? `Your included revisions are used: an extra round is ${extraText}.` : 'No revisions left: message your designer or approve the design.'}</small>
          </div>}
          {revising && reviewing && <form className="tm-revise" onSubmit={e => { e.preventDefault(); act('revise', async () => { const extra = revising === 'extra'; const r = await teamApi.revise(request.id, revision.trim(), revisionFiles.files, extra); setRequest(r); setRevising(false); setRevision(''); revisionFiles.clear(); const inv = r.pending_revision?.invoice; if (extra && inv && payPath(inv)) { onNotice(`Extra revision: pay invoice ${inv.invoice_number} and your designer starts it.`); navigate(payPath(inv)!); } else onNotice('Revision request sent to your designer.'); }); }}>
            {revising === 'extra' && <p className="tm-price" role="note"><CreditCard size={16} /> An extra revision round is <b>{extraText}</b>. After sending, you pay its invoice; your designer starts once it is paid.</p>}
            <label className="field">What should change?<textarea value={revision} onChange={e => setRevision(e.target.value)} required minLength={3} maxLength={4000} rows={3} placeholder="e.g. Make the stripes thinner and the logo bigger" /></label>
            <DropZone id="tm-rev-files" label="Pictures or notes (optional)" hint="Up to 5 files" icon={<Paperclip size={20} />} picks={revisionFiles} accept={TEAM_LIMITS.referenceTypes} max={TEAM_LIMITS.messageFiles} />
            <div className="tm-row-actions"><button className="button button-gradient" disabled={!!busy || revision.trim().length < 3}>{busy === 'revise' ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {revising === 'extra' ? 'SEND AND PAY' : 'SEND REVISIONS'}</button><button type="button" className="button button-quiet" onClick={() => setRevising(false)}>Cancel</button></div>
          </form>}
        </section>
        <Conversation request={request} chatBox={chatBox} onSent={() => load(true)} />
      </div>
      <aside className="tm-detail-side">
        <section className="tm-brief panel" aria-labelledby="tm-brief-h"><h2 id="tm-brief-h">YOUR BRIEF</h2>
          <p className="tm-brief-text">{request.description}</p>
          {request.colours.length > 0 && <div className="tm-chosen" aria-label="Colours">{request.colours.map(c => <span key={c}><i style={{ background: c }} />{c}</span>)}</div>}
          {request.instructions && <p className="tm-brief-text muted">{request.instructions}</p>}
          {(request.files ?? []).filter(f => f.kind === 'logo' || f.kind === 'reference').length > 0 && <div className="tm-brief-files">{(request.files ?? []).filter(f => f.kind === 'logo' || f.kind === 'reference').map(f => <FileChip key={f.id} file={f} />)}</div>}
          <dl className="tm-facts"><div><dt>Billing</dt><dd>{request.billing === 'paid' ? inclGst(request.price, request.currency) : request.billing === 'free' ? 'Free' : 'Included in your plan'}</dd></div><div><dt>Revisions</dt><dd>{request.revisions_used} of {request.revisions_allowed} used{request.extra_revisions ? ` (${request.extra_revisions} extra)` : ''}</dd></div>{request.due_date && <div><dt>Due</dt><dd>{fmtDate(request.due_date)}</dd></div>}{request.invoice?.invoice_number && <div><dt>Invoice</dt><dd><Link to={payPath(request.invoice)!}>{request.invoice.invoice_number}</Link> {request.invoice.label ? `· ${request.invoice.label}` : ''}</dd></div>}</dl>
          {request.can.cancel && request.billing === 'paid' && request.invoice?.status === 'paid' && <p className="muted tm-refund-note">Cancel before your designer starts and you get a full refund.</p>}
          {request.can.cancel && <button className="button button-quiet tm-cancel" disabled={!!busy} onClick={() => { if (window.confirm(`Cancel ${request.number}? This cannot be undone.`)) act('cancel', async () => { const r = await teamApi.cancel(request.id); setRequest(r); onNotice(`${r.number} cancelled.`); }); }}><X size={15} /> Cancel this request</button>}
        </section>
        {(request.history ?? []).length > 0 && <section className="tm-history panel" aria-labelledby="tm-hist-h"><h2 id="tm-hist-h">HISTORY</h2><ol>{(request.history ?? []).slice().reverse().map((h, i) => <li key={i}><span>{h.text}</span><small>{fmtTime(h.at)}{h.by ? ` · ${h.by}` : ''}</small></li>)}</ol></section>}
      </aside>
    </div>
  </div>;
}

function Conversation({ request, chatBox, onSent }: { request: TeamRequest; chatBox: React.RefObject<HTMLTextAreaElement | null>; onSent: () => void }) {
  const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const files = useFilePicks(TEAM_LIMITS.messageFiles, TEAM_LIMITS.referenceTypes);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const messages = request.messages ?? [];
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);
  async function send(e: FormEvent) {
    e.preventDefault(); if (!body.trim() && !files.files.length) return;
    setBusy(true); setError('');
    try { await teamApi.message(request.id, body.trim(), files.files); setBody(''); files.clear(); onSent(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="tm-chat panel" aria-labelledby="tm-chat-h">
    <h2 id="tm-chat-h">CONVERSATION{request.designer ? <small> with {request.designer.name}</small> : null}</h2>
    {messages.length === 0 ? <p className="muted tm-empty">No messages yet. Ask your designer anything here.</p>
      : <ol className="tm-messages" ref={list}>{messages.map(m => <li key={m.id} className={`is-${m.role === 'customer' ? 'mine' : m.role === 'system' ? 'system' : 'theirs'}`}>
        {m.role !== 'customer' && m.role !== 'system' && <span className="tm-msg-who">{m.author?.name || '3DEEZI TEAM'} · {m.role === 'admin' ? '3DEEZI' : 'Designer'}</span>}
        {m.body && <p>{m.body}</p>}
        {m.files.length > 0 && <div className="tm-msg-files">{m.files.map(f => <FileChip key={f.id} file={f} />)}</div>}
        <time dateTime={m.created_at}>{fmtTime(m.created_at)}</time>
      </li>)}</ol>}
    {request.can.message ? <form className="tm-compose" onSubmit={send}>
      <textarea ref={chatBox} value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={2} placeholder="Write a message to your designer…" aria-label="Message" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} />
      <input ref={input} type="file" multiple hidden accept={TEAM_LIMITS.referenceTypes.map(a => `.${a}`).join(',')} onChange={e => { files.add(e.target.files); e.target.value = ''; }} />
      <button type="button" className="icon-button" aria-label="Attach files" onClick={() => input.current?.click()}><Paperclip size={18} /></button>
      <button className="button button-gradient" disabled={busy || (!body.trim() && !files.files.length)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} SEND</button>
      {files.files.length > 0 && <ul className="tm-picks tm-compose-files">{files.files.map((f, i) => <li key={`${f.name}${i}`}><FileText size={16} /><span>{f.name}<small>{sizeMb(f.size)}</small></span><button type="button" className="icon-button" aria-label={`Remove ${f.name}`} onClick={() => files.remove(i)}><X size={14} /></button></li>)}</ul>}
    </form> : <p className="muted">This conversation is closed.</p>}
    {(error || files.error) && <p className="error-message" role="alert">{error || files.error}</p>}
  </section>;
}

