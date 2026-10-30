/**
 * 3DEEZI TEAM, the human designer service (client brief 2026-10-21; the client's new /team design 2026-10-22): the
 * landing page with the photo hero, HOW IT WORKS (seven steps), the request form and YOUR DESIGN REQUEST (/team),
 * My design requests (/team/requests) and one request with its progress, conversation, designs for review and the
 * final design (/team/requests/:id). Server: T1's team-api.md.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Box, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, CircleCheck, CreditCard, Download, FileText, ImageIcon, Info, LoaderCircle, MessageSquare, MessageSquareText, Palette, Paperclip, Pencil, Plus, RefreshCw, Send, Settings, ShieldCheck, Shirt, ShoppingBag, Truck, Upload, UserPen, Users, X } from 'lucide-react';
import { ApiError, media, type Catalog, type User } from '../api';
import { clearIdempotencyKey, idempotencyKey } from '../orderApi';
import { TEAM_DEFAULTS, TEAM_LIMITS, TEAM_REFUNDS, TEAM_STEPS, audMoney, extOf, inclGst, teamApi, type TeamAllowance, type TeamFile, type TeamRequest, type TeamStatus } from '../teamApi';
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

/** "Jersey, Shorts" (the garments asked for), or the one garment of an older request. */
const garmentsText = (r: Pick<TeamRequest, 'garment' | 'garment_name' | 'garment_names'>) => r.garment_names?.length ? r.garment_names.join(', ') : (r.garment_name || r.garment);

function RequestList({ requests, compact }: { requests: TeamRequest[]; compact?: boolean }) {
  if (!requests.length) return <p className="muted tm-empty">No design requests yet. Your requests and their progress appear here.</p>;
  return <ul className={`tm-list${compact ? ' is-compact' : ''}`}>{requests.map(r => <li key={r.id}><Link to={`/team/requests/${r.id}`} className="tm-row">
    <span className="tm-row-ref">{r.number}</span>
    <span className="tm-row-main"><strong>{garmentsText(r)} · {r.sport_name || r.sport}</strong><small>{r.name} · {fmtDate(r.created_at)}{r.preferred_date ? ` · wanted by ${fmtDate(r.preferred_date)}` : ''}</small></span>
    <StatusChip request={r} />
    {r.unread > 0 && <span className="tm-unread" aria-label={`${r.unread} new messages`}>{r.unread}</span>}
    <ArrowRight size={16} className="tm-row-go" />
  </Link></li>)}</ul>;
}

/** HOW IT WORKS: the client's seven steps (2026-10-22), a loop from the brief to delivery. */
export const TEAM_LOOP: { title: string; sub: string; icon: ReactNode }[] = [
  { title: 'Share your brief', sub: 'Ideas, colours & examples', icon: <FileText /> },
  { title: 'Designer creates', sub: 'Your first concept', icon: <Pencil /> },
  { title: 'Review & refine', sub: 'Share your feedback', icon: <MessageSquareText /> },
  { title: 'Approve your order', sub: 'Check artwork, sizes & quantities', icon: <CircleCheck /> },
  { title: 'Payment', sub: 'Complete secure checkout', icon: <CreditCard /> },
  { title: 'Production', sub: 'Your garments are made', icon: <Settings /> },
  { title: 'Delivery', sub: 'Track your order', icon: <Truck /> },
];

/** The two end arcs of the HOW IT WORKS loop as one SVG path, measured from the cards so they stay round at every
 *  desktop width: wide half-ovals from card 4 out to the right and back into card 5, and from card 7 out to the left
 *  and back into card 1 (the client's design, 2026-10-22). Exported for the regression check. */
type CardBox = { left: number; right: number; top: number; bottom: number };
export function loopArcs(box: { w: number }, c1: CardBox, c4: CardBox, c5: CardBox, c7: CardBox) {
  const k = 0.5523, reach = (edge: number) => Math.min(150, Math.max(70, edge));
  const yT = (c1.top + c1.bottom) / 2, yB = (c7.top + c7.bottom) / 2, yM = (yT + yB) / 2;
  const yT4 = (c4.top + c4.bottom) / 2, yB5 = (c5.top + c5.bottom) / 2;
  // The arcs bulge out to the section edge (at most 150 px past the top row, at least 70 px).
  const xL = Math.max(6, c1.left - reach(c1.left - 6)), xR = Math.min(box.w - 6, c4.right + reach(box.w - 6 - c4.right));
  const f = (n: number) => n.toFixed(1);
  const left = `M${f(c7.left)} ${f(yB)}C${f(c7.left - k * (c7.left - xL))} ${f(yB)} ${f(xL)} ${f(yM + k * (yB - yM))} ${f(xL)} ${f(yM)}`
    + `C${f(xL)} ${f(yM - k * (yM - yT))} ${f(c1.left - k * (c1.left - xL))} ${f(yT)} ${f(c1.left)} ${f(yT)}`;
  const right = `M${f(c4.right)} ${f(yT4)}C${f(c4.right + k * (xR - c4.right))} ${f(yT4)} ${f(xR)} ${f(yM - k * (yM - yT4))} ${f(xR)} ${f(yM)}`
    + `C${f(xR)} ${f(yM + k * (yB5 - yM))} ${f(c5.right + k * (xR - c5.right))} ${f(yB5)} ${f(c5.right)} ${f(yB5)}`;
  // Arrow heads in the direction of travel: on the left arc just after card 7 (heading out and up), and into card 5.
  const bez = (p: number[][], t: number) => {
    const u = 1 - t;
    const pt = [0, 1].map(i => u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i]);
    const d = [0, 1].map(i => 3 * u * u * (p[1][i] - p[0][i]) + 6 * u * t * (p[2][i] - p[1][i]) + 3 * t * t * (p[3][i] - p[2][i]));
    return { x: pt[0], y: pt[1], a: Math.atan2(d[1], d[0]) * 180 / Math.PI };
  };
  const headL = bez([[c7.left, yB], [c7.left - k * (c7.left - xL), yB], [xL, yM + k * (yB - yM)], [xL, yM]], 0.42);
  const headR = { x: c5.right + 16, y: yB5, a: 180 };
  return { d: `${left}${right}`, heads: [headL, headR], xL, xR };
}

function LoopArcs({ loop }: { loop: React.RefObject<HTMLDivElement | null> }) {
  const svg = useRef<SVGSVGElement>(null);
  const [shape, setShape] = useState<{ w: number; h: number; d: string; heads: { x: number; y: number; a: number }[] } | null>(null);
  useLayoutEffect(() => {
    const el = loop.current, box = svg.current;
    if (!el || !box) return;
    const measure = () => {
      const b = box.getBoundingClientRect();
      const r = (sel: string) => { const n = el.querySelector(`${sel} .tm-step`); const q = n?.getBoundingClientRect(); return q && q.width ? { left: q.left - b.left, right: q.right - b.left, top: q.top - b.top, bottom: q.bottom - b.top } : null; };
      const c1 = r('.s1'), c4 = r('.s4'), c5 = r('.s5'), c7 = r('.s7');
      if (!b.width || !c1 || !c4 || !c5 || !c7) { setShape(null); return; }
      const { d, heads } = loopArcs({ w: b.width }, c1, c4, c5, c7);
      setShape({ w: b.width, h: b.height, d, heads });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box); ro.observe(el);
    el.querySelectorAll('.tm-step').forEach(n => ro.observe(n));
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [loop]);
  return <svg ref={svg} className="tm-loop-arcs" aria-hidden="true" viewBox={shape ? `0 0 ${shape.w} ${shape.h}` : undefined} data-testid="team-loop-arcs">
    {shape && <>
      <path className="tm-arc-glow" d={shape.d} />
      <path className="tm-arc" d={shape.d} />
      {shape.heads.map((h, i) => <path key={i} className="tm-arc-head" d="M0 0L-12 -6.5L-12 6.5Z" transform={`translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) rotate(${h.a.toFixed(1)})`} />)}
    </>}
  </svg>;
}

function HowItWorks() {
  const loop = useRef<HTMLDivElement>(null);
  const card = (step: (typeof TEAM_LOOP)[number], i: number) => <div className="tm-step">
    <span className="tm-step-num">{i + 1}</span>
    <span className="tm-step-icon" aria-hidden="true">{step.icon}</span>
    <span className="tm-step-text"><b>{step.title}</b><small>{step.sub}</small></span>
  </div>;
  return <section className="tm-how" aria-labelledby="tm-how-h">
    <h2 id="tm-how-h">HOW IT <span>WORKS</span></h2>
    <div className="tm-loop" ref={loop}>
      <ol className="tm-loop-row is-top">{TEAM_LOOP.slice(0, 4).map((step, i) => <li key={step.title} className={`s${i + 1}`}>{card(step, i)}{i < 3 && <span className="tm-arrow" aria-hidden="true" />}</li>)}</ol>
      <p className="tm-loop-center">FROM IDEA TO <span>TEAMWEAR</span></p>
      <ol className="tm-loop-row is-bottom" start={5}>{TEAM_LOOP.slice(4).map((step, k) => <li key={step.title} className={`s${k + 5}`}>{card(step, k + 4)}{k < 2 && <span className="tm-arrow" aria-hidden="true" />}</li>)}</ol>
    </div>
    {/* After the rows, so their ref is set when the arcs measure them. */}
    <LoopArcs loop={loop} />
  </section>;
}

/** /team: the photo hero, HOW IT WORKS, the request form and YOUR DESIGN REQUEST (the client's design, 2026-10-22). */
export function TeamPage({ user, requireAuth, catalog }: { user: User | null; requireAuth: RequireAuth; catalog: Catalog | null }) {
  const navigate = useNavigate();
  const [allowance, setAllowance] = useState<TeamAllowance | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sent, setSent] = useState<TeamRequest | null>(null);
  const [progress, setProgress] = useState<BriefProgress>({ garments: false, inspiration: false, logos: false, date: false });
  const load = useCallback(() => {
    if (!user) { setAllowance(null); return; }
    setLoadError('');
    teamApi.allowance().then(setAllowance).catch(e => setLoadError((e as Error).message));
  }, [user]);
  useEffect(load, [load]);
  const toForm = () => document.getElementById('tm-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const myRequests = () => requireAuth(() => navigate('/team/requests'));
  return <div className="tm-page">
    <section className="tm-hero" style={{ ['--tm-hero' as string]: `url(${media('images/art/team_hero.webp')})` }}>
      <div className="tm-hero-inner">
        <span className="tm-kicker"><Users size={15} /> HUMAN DESIGN SERVICE</span>
        <h1 className="tm-title"><img className="tm-wordmark" src={media('images/brand-wordmark.png')} alt="3DEEZI" width={1628} height={233} decoding="async" /> <span>DESIGN TEAM</span></h1>
        <p className="tm-sub">REAL DESIGNERS. REAL RESULTS.</p>
        <p className="tm-lead">Share your ideas, logos and examples.<br />Our design team will bring your kit to life.</p>
        <div className="tm-hero-actions">
          <button className="button button-gradient tm-cta" onClick={toForm}>REQUEST A DESIGNER <ArrowRight size={18} /></button>
          <button className="button button-outline tm-mine-cta" onClick={myRequests}><FileText size={16} /> VIEW MY REQUESTS</button>
        </div>
        <ul className="tm-perks">
          <li><Users size={17} /> Personal design support</li>
          <li><Shirt size={17} /> Custom sportswear expertise</li>
          <li><ShieldCheck size={17} /> Review before you approve</li>
        </ul>
      </div>
      <p className="tm-hero-words" aria-hidden="true">{['SPORTSWEAR', 'BRANDS', 'TEAMS', 'PEOPLE', 'BETTER', 'TOGETHER'].map(w => <span key={w}>{w}</span>)}</p>
    </section>
    <div className="page-shell tm-shell">
      <HowItWorks />
      <div className="tm-columns" id="tm-request">
        <section className="tm-form-wrap" aria-labelledby="tm-form-h">
          {sent ? <Confirmation request={sent} onAnother={() => { setSent(null); load(); }} onPay={url => navigate(url)} />
            : <RequestForm user={user} catalog={catalog} allowance={allowance} loadError={loadError} requireAuth={requireAuth} onProgress={setProgress} onSent={r => { setSent(r); load(); setTimeout(() => document.getElementById('tm-request')?.scrollIntoView({ block: 'start' }), 30); }} />}
          <GoodToKnow allowance={allowance} />
        </section>
        <RequestChecklist progress={sent ? { garments: true, inspiration: true, logos: progress.logos, date: progress.date } : progress} />
      </div>
    </div>
  </div>;
}

type BriefProgress = { garments: boolean; inspiration: boolean; logos: boolean; date: boolean };

/** YOUR DESIGN REQUEST: what a good brief has; each row is ticked as the form gets it. */
function RequestChecklist({ progress }: { progress: BriefProgress }) {
  const rows: { key: keyof BriefProgress; icon: ReactNode; title: string; sub: string }[] = [
    { key: 'garments', icon: <Shirt size={19} />, title: 'Garment types & quantities', sub: 'Tell us what you need' },
    { key: 'inspiration', icon: <Palette size={19} />, title: 'Colours & inspiration', sub: 'Share references or examples' },
    { key: 'logos', icon: <ImageIcon size={19} />, title: 'Logos & sponsor artwork', sub: 'Upload your files' },
    { key: 'date', icon: <CalendarDays size={19} />, title: 'Preferred delivery date', sub: 'Let us know if you have a target date' },
  ];
  return <aside className="tm-check panel" aria-labelledby="tm-check-h">
    <h2 id="tm-check-h">YOUR DESIGN REQUEST</h2>
    <ul>{rows.map(r => <li key={r.key} className={progress[r.key] ? 'is-done' : ''}>
      <span className="tm-check-icon" aria-hidden="true">{r.icon}</span>
      <span className="tm-check-text"><b>{r.title}</b><small>{r.sub}</small></span>
      {progress[r.key] && <span className="tm-check-tick" title="Added"><Check size={13} /><span className="tm-sr">(added)</span></span>}
    </li>)}</ul>
    <p className="tm-fees" data-testid="team-fees"><span className="tm-i" aria-hidden="true">i</span> Design service availability and any fees are confirmed before work begins.</p>
    <Link className="tm-subs" to="/pricing">View subscription options <ArrowRight size={15} /></Link>
  </aside>;
}

/** Turnaround, revisions and the refund policy (client answers 2026-10-21): small and folded, without prices. */
function GoodToKnow({ allowance }: { allowance: TeamAllowance | null }) {
  const turnaround = allowance?.turnaround ?? TEAM_DEFAULTS.turnaround;
  return <details className="tm-good">
    <summary><Info size={15} /> Good to know: turnaround, revisions and refunds <ChevronDown size={15} className="tm-good-caret" /></summary>
    <dl>
      <div><dt><CalendarClock size={15} /> Turnaround</dt><dd data-testid="team-promise">First design within {turnaround.first_draft_days} business day{turnaround.first_draft_days === 1 ? '' : 's'}; each revision within {turnaround.revision_days} business day{turnaround.revision_days === 1 ? '' : 's'} (Monday to Friday). A request with a fee starts once it is paid.</dd></div>
      <div><dt><RefreshCw size={15} /> Revisions</dt><dd>{allowance ? `Your plan includes ${allowance.revisions_per_request} revision${allowance.revisions_per_request === 1 ? '' : 's'} per request.` : 'Every request includes revisions.'} Need more? Ask your designer for an extra round; any fee is shown before it starts.</dd></div>
      <div><dt><ShieldCheck size={15} /> Refunds</dt><dd data-testid="team-refunds">{TEAM_REFUNDS.join(' ')}</dd></div>
    </dl>
  </details>;
}

/** The line by SEND DESIGN REQUEST: what this request costs, from the allowance API (nothing hard-coded). */
function CostLine({ user, allowance, loadError }: { user: User | null; allowance: TeamAllowance | null; loadError: string }) {
  if (!user) return <p className="tm-cost" data-testid="team-cost"><Info size={15} /> You sign in when you send; you see any fee before work begins.</p>;
  if (loadError) return <p className="tm-cost is-warn" data-testid="team-cost" role="alert"><Info size={15} /> Your plan could not be checked: {loadError}</p>;
  if (!allowance) return <p className="tm-cost" data-testid="team-cost"><LoaderCircle className="spin" size={15} /> Checking your plan…</p>;
  const next = allowance.next_request;
  if (next.billing === 'paid') return <p className="tm-cost is-paid" data-testid="team-cost"><CreditCard size={15} /> <span>This request: <b>{inclGst(next.total, next.currency, next.tax_name || 'GST')} design fee</b>{next.pay_first ? ', paid before work begins.' : '. An invoice is issued when you send.'}</span></p>;
  return <p className="tm-cost is-included" data-testid="team-cost"><Check size={15} /> <span>{next.billing === 'free' ? 'No design fee on your plan.' : <>Included in your plan <b>({allowance.plan_name})</b>{allowance.remaining_included != null ? `: ${allowance.remaining_included} left this month.` : '.'}</>}</span></p>;
}

function Confirmation({ request, onAnother, onPay }: { request: TeamRequest; onAnother: () => void; onPay: (url: string) => void }) {
  const mustPay = request.status === 'awaiting_payment' || (request.billing === 'paid' && request.invoice?.can_pay);
  const fee = request.billing === 'paid' ? `${inclGst(request.invoice?.total || request.price, request.currency)} design fee` : request.billing === 'free' ? 'No design fee' : 'Included in your plan';
  return <div className="tm-confirm panel" role="status">
    <CheckCircle2 size={44} />
    <span className="tm-kicker">SENT TO 3DEEZI DESIGN TEAM</span>
    <h2>Your reference: <span data-testid="team-ref">{request.number}</span></h2>
    <p className={`tm-confirm-fee ${request.billing === 'paid' ? 'is-paid' : 'is-included'}`} data-testid="team-fee">{request.billing === 'paid' ? <CreditCard size={16} /> : <Check size={16} />} {fee}</p>
    {mustPay && request.invoice
      ? <><p>Pay invoice {request.invoice.invoice_number} and your designer starts straight away.</p><div className="tm-confirm-actions">{payPath(request.invoice) && <button className="button button-gradient" onClick={() => onPay(payPath(request.invoice)!)}><CreditCard size={16} /> REVIEW &amp; PAY</button>}<Link className="button button-outline" to={`/team/requests/${request.id}`}>VIEW REQUEST</Link></div></>
      : <><p>We have your brief. A designer will be assigned shortly; you will get a notification at each step.</p><div className="tm-confirm-actions"><Link className="button button-gradient" to={`/team/requests/${request.id}`}>VIEW REQUEST <ArrowRight size={16} /></Link><button className="button button-outline" onClick={onAnother}>SEND ANOTHER REQUEST</button></div></>}
  </div>;
}

/** "Garments needed": several garments from the catalogue (this sport's first), or anything else typed in. */
function GarmentPicker({ options, value, onChange, invalid }: { options: { id: string; name: string }[]; value: string[]; onChange: (next: string[]) => void; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const nameOf = (id: string) => options.find(o => o.id === id)?.name ?? id;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : value.length >= 12 ? value : [...value, id]);
  const addOther = () => { const v = other.trim().slice(0, 60); if (v && !value.includes(v) && value.length < 12) onChange([...value, v]); setOther(''); };
  const custom = value.filter(v => !options.some(o => o.id === v));
  return <div className={`tm-multi${open ? ' is-open' : ''}`} ref={box}>
    <button type="button" id="tm-garments" className={`tm-multi-btn${invalid ? ' is-invalid' : ''}`} aria-haspopup="true" aria-expanded={open} aria-labelledby="tm-garments-l tm-garments" onClick={() => setOpen(o => !o)}>
      {value.length ? <span className="tm-multi-value">{value.map(nameOf).join(', ')}</span> : <span className="tm-multi-ph">e.g. Jerseys, Shorts, Tracksuits…</span>}<ChevronDown size={16} />
    </button>
    {open && <div className="tm-multi-pop" role="group" aria-label="Garments needed">
      <div className="tm-multi-list">{[...options, ...custom.map(id => ({ id, name: id }))].map(o => <label key={o.id} className={value.includes(o.id) ? 'is-on' : ''}><input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} /><span>{o.name}</span></label>)}</div>
      <div className="tm-multi-other"><input value={other} onChange={e => setOther(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} maxLength={60} placeholder="Something else, e.g. Socks" aria-label="Another garment" /><button type="button" className="button button-outline" onClick={addOther} disabled={!other.trim()}><Plus size={14} /> Add</button></div>
      <button type="button" className="button button-quiet tm-multi-done" onClick={() => setOpen(false)}>Done</button>
    </div>}
  </div>;
}

type BriefPick = { file: File; kind: 'logo' | 'reference' };
/** Logos and sponsor artwork, or pictures, documents and examples: a first guess from the name and type, changeable. */
const guessKind = (file: File, logos: number): BriefPick['kind'] => {
  const ext = extOf(file.name);
  const logoish = /logo|crest|badge|emblem|sponsor/i.test(file.name) || ['svg', 'ai', 'eps'].includes(ext);
  return logoish && logos < TEAM_LIMITS.logos && TEAM_LIMITS.logoTypes.includes(ext) ? 'logo' : 'reference';
};

/** "Upload logos, artwork & inspiration": one box for logos (logos[], up to 5) and examples (references[], up to 10). */
function BriefFiles({ picks, onChange }: { picks: BriefPick[]; onChange: (next: BriefPick[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const previews = useMemo(() => picks.map(p => p.file.type.startsWith('image/') && !p.file.type.includes('svg') ? URL.createObjectURL(p.file) : ''), [picks]);
  useEffect(() => () => previews.forEach(u => u && URL.revokeObjectURL(u)), [previews]);
  const count = (kind: BriefPick['kind'], list = picks) => list.filter(p => p.kind === kind).length;
  const add = (list: FileList | null) => {
    if (!list) return; setError('');
    const next = [...picks];
    for (const file of [...list]) {
      const ext = extOf(file.name);
      if (!TEAM_LIMITS.referenceTypes.includes(ext)) { setError(`${file.name}: this file type is not accepted.`); continue; }
      if (file.size > TEAM_LIMITS.fileMb * 1048576) { setError(`${file.name} is over ${TEAM_LIMITS.fileMb} MB.`); continue; }
      let kind = guessKind(file, count('logo', next));
      if (kind === 'reference' && count('reference', next) >= TEAM_LIMITS.references) kind = 'logo';
      if (kind === 'logo' && (count('logo', next) >= TEAM_LIMITS.logos || !TEAM_LIMITS.logoTypes.includes(ext))) { setError(`Up to ${TEAM_LIMITS.logos} logos and ${TEAM_LIMITS.references} other files per request.`); continue; }
      next.push({ file, kind });
    }
    onChange(next);
  };
  const setKind = (i: number, kind: BriefPick['kind']) => {
    if (kind === 'logo' && count('logo') >= TEAM_LIMITS.logos) { setError(`Up to ${TEAM_LIMITS.logos} logos per request.`); return; }
    if (kind === 'reference' && count('reference') >= TEAM_LIMITS.references) { setError(`Up to ${TEAM_LIMITS.references} artwork and inspiration files per request.`); return; }
    setError(''); onChange(picks.map((p, k) => k === i ? { ...p, kind } : p));
  };
  return <div className="tm-field">
    <div className={`tm-drop${over ? ' is-over' : ''}`} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
      <Upload size={28} aria-hidden="true" />
      <span className="tm-drop-text"><strong id="tm-files-l">Upload logos, artwork &amp; inspiration</strong><span>Drag and drop files here or click to browse</span></span>
      <button type="button" className="button button-outline tm-add-files" onClick={e => { e.stopPropagation(); input.current?.click(); }} aria-describedby="tm-files-l"><Paperclip size={15} /> Add files</button>
      <input ref={input} id="tm-files" type="file" multiple hidden accept={TEAM_LIMITS.referenceTypes.map(a => `.${a}`).join(',')} onChange={(e: ChangeEvent<HTMLInputElement>) => { add(e.target.files); e.target.value = ''; }} />
    </div>
    <small className="tm-drop-hint">Up to {TEAM_LIMITS.logos} logos (PNG, JPG, SVG, PDF, AI, EPS) and {TEAM_LIMITS.references} other files (pictures, PDF, Word, PowerPoint, ZIP), {TEAM_LIMITS.fileMb} MB each.</small>
    {picks.length > 0 && <ul className="tm-picks">{picks.map((p, i) => <li key={`${p.file.name}${i}`}>{previews[i] ? <img src={previews[i]} alt="" /> : <FileText size={18} />}<span>{p.file.name}<small>{sizeMb(p.file.size)}</small></span>
      <select className="tm-kind" value={p.kind} aria-label={`${p.file.name}: logo or inspiration`} onChange={e => setKind(i, e.target.value as BriefPick['kind'])}>{TEAM_LIMITS.logoTypes.includes(extOf(p.file.name)) && <option value="logo">Logo</option>}<option value="reference">Inspiration</option></select>
      <button type="button" className="icon-button" aria-label={`Remove ${p.file.name}`} onClick={() => onChange(picks.filter((_, k) => k !== i))}><X size={14} /></button></li>)}</ul>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function RequestForm({ user, catalog, allowance, loadError, requireAuth, onSent, onProgress }: { user: User | null; catalog: Catalog | null; allowance: TeamAllowance | null; loadError: string; requireAuth: RequireAuth; onSent: (r: TeamRequest) => void; onProgress: (p: BriefProgress) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [sport, setSport] = useState(''); const [garments, setGarments] = useState<string[]>([]);
  const [description, setDescription] = useState(''); const [instructions, setInstructions] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [colours, setColours] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [picks, setPicks] = useState<BriefPick[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  useEffect(() => { if (user) { setName(n => n || user.name); setEmail(e => e || user.email); } }, [user]);
  const sports = catalog?.sports ?? [];
  const chosenSport = sports.find(s => s.id === sport);
  const garmentOptions = useMemo(() => {
    const all = (catalog?.garments ?? []).map(g => ({ id: g.id, name: g.name }));
    const wanted = chosenSport?.garments;
    return wanted?.length ? [...wanted.map(id => all.find(g => g.id === id)).filter((g): g is NonNullable<typeof g> => !!g), ...all.filter(g => !wanted.includes(g.id))] : all;
  }, [catalog, chosenSport]);
  const groups = [{ key: 'sports', label: 'Sports' }, { key: 'apparel', label: 'Apparel' }];
  const logos = picks.filter(p => p.kind === 'logo').map(p => p.file);
  const references = picks.filter(p => p.kind === 'reference').map(p => p.file);
  const totalMb = picks.reduce((t, p) => t + p.file.size, 0) / 1048576;
  const blocked = !!allowance && !allowance.can_submit;
  useEffect(() => onProgress({ garments: garments.length > 0, inspiration: references.length > 0 || colours.length > 0 || description.trim().length >= 10, logos: logos.length > 0, date: !!preferredDate }),
    [garments.length, references.length, colours.length, description, logos.length, preferredDate, onProgress]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setFieldErrors({});
    if (!garments.length) { setFieldErrors({ garment: ['Choose at least one garment.'] }); document.getElementById('tm-garments')?.focus(); return; }
    if (!user) { requireAuth(); return; }
    if (totalMb > TEAM_LIMITS.totalMb) { setError(`Your files add up to ${totalMb.toFixed(0)} MB: the limit is ${TEAM_LIMITS.totalMb} MB per request.`); return; }
    setBusy(true);
    const key = idempotencyKey('team-request');
    try {
      const request = await teamApi.create({ name, email, sport, garment: garments[0], garments, preferred_date: preferredDate || undefined, category: chosenSport?.group === 'apparel' ? 'Apparel' : chosenSport ? 'Sports' : undefined, description, colours, instructions, logos, references }, key);
      clearIdempotencyKey('team-request');
      setPicks([]); setDescription(''); setInstructions(''); setColours([]); setPreferredDate('');
      onSent(request);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      setError((err as Error).message);
    } finally { setBusy(false); }
  }
  const fe = (...keys: string[]) => { const k = keys.find(x => fieldErrors[x]?.[0]); return k ? <small className="tm-field-error">{fieldErrors[k][0]}</small> : null; };
  return <form className="tm-form panel" onSubmit={submit}>
    <span className="tm-kicker"><UserPen size={14} /> REQUEST A DESIGNER</span>
    <h2 id="tm-form-h">Tell us what you need</h2>
    {!user && <p className="tm-signin-note">You can fill in your brief now; you sign in when you send it.</p>}
    <div className="tm-grid2">
      <label className="field">Company / team name<input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoComplete="organization" placeholder="e.g. Your Club, School or Business" />{fe('name')}</label>
      <label className="field">Contact email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={190} autoComplete="email" placeholder="you@yourdomain.com" />{fe('email')}</label>
      <label className="field">Sport / activity<select value={sport} onChange={e => setSport(e.target.value)} required>
        <option value="" disabled>{catalog ? 'Select a sport' : 'Loading the catalogue…'}</option>
        {groups.map(g => { const items = sports.filter(s => (s.group ?? 'sports') === g.key); return items.length ? <optgroup key={g.key} label={g.label}>{items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup> : null; })}
      </select>{fe('sport')}</label>
      <div className="field tm-garments-field"><span id="tm-garments-l">Garments needed</span><GarmentPicker options={garmentOptions} value={garments} onChange={next => { setGarments(next); if (next.length) setFieldErrors(f => { const { garment: _g, garments: _gs, ...rest } = f; return rest; }); }} invalid={!!fieldErrors.garment || !!fieldErrors.garments} />{fe('garment', 'garments', 'garments.0')}</div>
    </div>
    <label className="field">Design brief<textarea value={description} onChange={e => setDescription(e.target.value)} required minLength={10} maxLength={4000} rows={3} placeholder="Tell us about your colours, style, logos and ideas…" />{fe('description')}</label>
    <BriefFiles picks={picks} onChange={setPicks} />
    {fe('logos', 'references', 'logos.0', 'references.0')}
    <div className="tm-grid2 tm-extra-row">
      <label className="field tm-date"><span>Preferred delivery date <small className="muted">(optional)</small></span><input type="date" value={preferredDate} min={todayIso()} onChange={e => setPreferredDate(e.target.value)} />{fe('preferred_date')}</label>
      <button type="button" className="tm-more-toggle" aria-expanded={more} aria-controls="tm-more" onClick={() => setMore(m => !m)}>{more ? <ChevronUp size={15} /> : <Plus size={15} />}<span>Add brand colours or extra instructions <small>(optional)</small></span></button>
    </div>
    {more && <div className="tm-more" id="tm-more">
      <ColourPicker value={colours} onChange={setColours} />
      {fe('colours')}
      <label className="field">Extra instructions<textarea value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={4000} rows={3} placeholder="Quantities and sizes, sponsors, names and numbers, anything else" /></label>
    </div>}
    {blocked && <p className="error-message" role="alert">{allowance?.blocked_reason}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="tm-send-row">
      <button className="button button-gradient tm-send" disabled={busy || blocked}>{busy ? <LoaderCircle className="spin" size={18} /> : null} SEND DESIGN REQUEST <ArrowRight size={18} /></button>
      <CostLine user={user} allowance={allowance} loadError={loadError} />
    </div>
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
    <div className="tm-page-head"><div><span className="tm-kicker"><Users size={15} /> 3DEEZI TEAM · {request.number}</span><h1>{garmentsText(request)} <span>· {request.sport_name || request.sport}</span></h1><p className="muted">{request.name} · sent {fmtDate(request.created_at)}{request.designer ? ` · designer ${request.designer.name}` : ''}</p>{request.due_date && ['received', 'assigned', 'in_progress', 'revision'].includes(request.status) && <p className="tm-due" data-testid="team-due"><CalendarClock size={16} /> {request.status === 'revision' ? 'Revision' : request.latest_version ? 'Next design' : 'First design'} due by <b>{fmtDate(request.due_date)}</b></p>}</div><StatusChip request={request} /></div>
    <TeamSteps request={request} />
    {actionError && <p className="error-message" role="alert">{actionError}</p>}
    {request.can.pay && request.invoice && payPath(request.invoice) && <div className="tm-banner panel"><CreditCard size={20} /><span>Invoice {request.invoice.invoice_number}: {audMoney(request.invoice.amount_due || request.invoice.total || request.price, request.currency)} incl. GST to pay before your designer starts.</span><button className="button button-gradient" onClick={() => navigate(payPath(request.invoice)!)}>REVIEW &amp; PAY</button></div>}
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
              ? <button className="button button-outline" disabled={!!busy} onClick={() => setRevising(v => v === 'extra' ? false : 'extra')} data-testid="team-extra-revision"><RefreshCw size={16} /> EXTRA REVISION {extraPrice ? audMoney(extraPrice.price, extraPrice.currency) : ''}</button>
              : <button className="button button-outline" disabled={!!busy || !request.can.revise || left <= 0} onClick={() => setRevising(v => v ? false : 'included')}><RefreshCw size={16} /> REQUEST REVISIONS</button>}
            <button className="button button-quiet" onClick={() => chatBox.current?.focus()}><MessageSquare size={16} /> MESSAGE</button>
            <small className="muted">{left > 0 ? `${left} of ${request.revisions_allowed} revision${request.revisions_allowed === 1 ? '' : 's'} left` : revisionInvoice ? 'Extra revision waiting for payment.' : request.can.extra_revision ? `Your included revisions are used: an extra round is ${extraText}.` : 'No revisions left: message your designer or approve the design.'}</small>
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
          <dl className="tm-facts">{request.preferred_date && <div data-testid="team-preferred"><dt>Wanted by</dt><dd>{fmtDate(request.preferred_date)}</dd></div>}<div><dt>Billing</dt><dd>{request.billing === 'paid' ? inclGst(request.price, request.currency) : request.billing === 'free' ? 'Free' : 'Included in your plan'}</dd></div><div><dt>Revisions</dt><dd>{request.revisions_used} of {request.revisions_allowed} used{request.extra_revisions ? ` (${request.extra_revisions} extra)` : ''}</dd></div>{request.due_date && <div><dt>Due</dt><dd>{fmtDate(request.due_date)}</dd></div>}{request.invoice?.invoice_number && <div><dt>Invoice</dt><dd><Link to={payPath(request.invoice)!}>{request.invoice.invoice_number}</Link> {request.invoice.label ? `· ${request.invoice.label}` : ''}</dd></div>}</dl>
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

