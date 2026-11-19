import { AlertTriangle, ArrowRight, ArrowUp, Check, FileDown, FileSpreadsheet, Link2, LoaderCircle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { media, type User } from '../api';
import Loader from '../components/Loader';
import { orderApi, type AssistantFormDesign, type AssistantOrder } from '../orderApi';
import { ALL_SIZES } from '../orderSizes';
import '../../css/ai-designer.css';
import '../../css/order-form-maker.css';

const PICTURE = /\.(png|jpe?g|webp)$/i;
const SHEET = /\.(xlsx|xls|ods|csv|tsv|txt|pdf)$/i;
const MAX_PICTURES = 20;
const EXAMPLE = 'Make an order form using these sizes for each design: XS x 5, S x 5, M x 6, L x 6, XL x 8, 2XL x 8, 3XL x 5, 4XL x 5, 5XL x 5';

type Picked = { file: File; url: string };
type Draft = { key: string; name: string; colourway: string; sizes: Record<string, number> };
const sizeRank = (s: string) => { const i = ALL_SIZES.indexOf(s); return i < 0 ? 99 : i; };
const sum = (sizes: Record<string, number>) => Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0);
/** Sizes compared as the server keeps them (0 is no size, in the size order). */
const plainSizes = (sizes: Record<string, number>) => JSON.stringify(Object.entries(sizes).filter(([, n]) => Number(n) > 0).sort(([a], [b]) => sizeRank(a) - sizeRank(b)));

/**
 * THE ORDER FORM MAKER (client 2026-11-13: "it should be very easy, YOU should do the process yourself in chat gpt …
 * from one prompt it done it perfect"): /orders/assistant. One box: paste or drop the design pictures (front and back),
 * type one prompt ("these sizes for each design: XS x 5 …"), one button. 3DEEZI AI finds the garment, the team's brand,
 * each design's name and colourway and applies the sizes (OrderFormMaker); the summary below can be corrected in place
 * (names, colourways, sizes) and the PDF order form, the Excel and the share link come from it. An order sheet (Excel,
 * CSV, PDF) dropped in the same box is read as before (the Order Assistant's sheet reading).
 */
export default function OrderFormMakerPage({ user, requireAuth }: { user: User | null; requireAuth: (action?: () => void) => void }) {
  const [params, setParams] = useSearchParams();
  const token = params.get('form');
  const [order, setOrder] = useState<AssistantOrder | null>(null);
  const [pictures, setPictures] = useState<Picked[]>([]);
  const [sheets, setSheets] = useState<File[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  // A form made earlier (?form={token}, kept in the address so a reload or a shared tab opens it again).
  useEffect(() => {
    if (!token || order?.token === token) return;
    orderApi.assistantOrder(token).then(setOrder).catch(() => { setParams({}, { replace: true }); });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pictures.forEach(p => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function add(files: File[]) {
    const pics = files.filter(f => f.type.startsWith('image/') || PICTURE.test(f.name));
    const other = files.filter(f => !pics.includes(f) && SHEET.test(f.name));
    const skipped = files.length - pics.length - other.length;
    // A pasted screenshot is "image.png": each gets its own name so none replaces another.
    const named = pics.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `design-${Date.now().toString(36)}-${i + 1}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type })));
    setPictures(p => [...p, ...named.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PICTURES));
    setSheets(s => [...s, ...other].slice(0, 6));
    setError(skipped ? 'Some files were left out: pictures can be PNG, JPG or WebP; order sheets Excel, CSV or PDF.' : null);
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files)); }
  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    add(files);
  }
  function removePicture(i: number) { setPictures(p => { URL.revokeObjectURL(p[i].url); return p.filter((_, j) => j !== i); }); }

  async function send() {
    if (busy) return;
    const message = prompt.trim();
    if (!message && !pictures.length && !sheets.length) { setError('Add your design pictures and type what you need (for example the sizes for each design).'); return; }
    // 3DEEZI AI reads pictures for signed-in customers: sign in first, then it goes on.
    if (!user && pictures.length) { requireAuth(); return; }
    const form = new FormData();
    if (message) form.append('message', message);
    pictures.forEach(p => form.append('designs[]', p.file));
    sheets.forEach(f => form.append('files[]', f));
    setBusy(true); setError(null);
    try {
      const result = await orderApi.assistant(form, order?.token ?? null);
      setOrder(result);
      pictures.forEach(p => URL.revokeObjectURL(p.url));
      setPictures([]); setSheets([]); setPrompt('');
      if (result.token !== token) setParams({ form: result.token }, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }
  function startOver() {
    setOrder(null); setParams({}, { replace: true }); setPrompt(''); setError(null);
  }

  // The bar grows with the text (as the AI designer's bar), about seven lines, then it scrolls.
  useEffect(() => { const el = field.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 196)}px`; }, [prompt, order]);

  const reply = order?.messages.filter(m => m.role === 'assistant').at(-1)?.text ?? '';
  const ext = (name: string) => (name.split('.').pop() ?? '').toUpperCase();
  // The AI designer's look (client 2026-11-16: "so it looks like the AI section"): its background, logo, prompt bar,
  // attached-file chips, notes and loader; the order form below in the same dark glass.
  return <section className={`aid-stage glass-ui ofm-stage${over ? ' dropping' : ''}${order ? ' has-result' : ''}`} data-testid="order-form-maker" aria-labelledby="ofm-title"
    onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }} onDrop={onDrop} onPaste={onPaste}>
    <picture className="aid-bg" aria-hidden="true">
      <source media="(max-aspect-ratio: 4/5)" type="image/webp" srcSet={`${media('images/ai-designer/bg-tall-640.webp')} 640w, ${media('images/ai-designer/bg-tall-1024.webp')} 1024w`} sizes="100vw" />
      <img src={media('images/ai-designer/bg-1440.webp')} srcSet={`${media('images/ai-designer/bg-960.webp')} 960w, ${media('images/ai-designer/bg-1440.webp')} 1440w, ${media('images/ai-designer/bg-2048.webp')} 2048w`} sizes="100vw" alt="" fetchPriority="high" decoding="async" />
    </picture>
    <div className="aid-inner">
      <img className="aid-logo" src={media('images/brand-final.png')} alt="3DEEZI" width={1712} height={272} />
      <p className="aid-tagline">ORDER FORM MAKER</p>
      <h1 id="ofm-title" className="aid-heading">Drop your designs. Say what you need.</h1>

      <form className={`aid-prompt${pictures.length || sheets.length ? ' has-files' : ''}`} aria-label="Your designs and your prompt" onSubmit={e => { e.preventDefault(); send(); }}>
        {(pictures.length > 0 || sheets.length > 0) && <ul className="aid-files" aria-label="Attached files">
          {pictures.map((p, i) => <li key={p.url} title={p.file.name}><img src={p.url} alt="" /><span className="aid-file-text"><b>{p.file.name}</b><small>{ext(p.file.name)}</small></span>
            <button type="button" aria-label={`Remove ${p.file.name}`} onClick={() => removePicture(i)}><X size={12} /></button></li>)}
          {sheets.map((f, i) => <li key={`${f.name}-${i}`} title={f.name}><span className="ofm-sheet-icon" aria-hidden="true"><FileSpreadsheet size={22} /></span><span className="aid-file-text"><b>{f.name}</b><small>{ext(f.name)}</small></span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setSheets(s => s.filter((_, j) => j !== i))}><X size={12} /></button></li>)}
        </ul>}
        <div className="aid-row">
          <button type="button" className="aid-plus" onClick={() => fileInput.current?.click()} aria-label="Add pictures" title="Add pictures, or drop / paste them here (front and back, any number)"><Plus size={22} /></button>
          <label className="aid-field"><span className="sr-only">Your prompt</span>
            <textarea ref={field} rows={1} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={8000} className={order ? undefined : 'is-example'}
              placeholder={order ? 'Ask for a change, e.g. “Samoa: 10 x M instead”, or add more designs' : EXAMPLE}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
          </label>
          <button type="submit" className="aid-go" disabled={busy} aria-label={order ? 'Update my order form' : 'Make my order form'} title={order ? 'Update my order form' : 'Make my order form'}>
            {busy ? <LoaderCircle size={23} className="ofm-spin" /> : <ArrowUp size={23} strokeWidth={2.4} />}
          </button>
        </div>
        <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,.xlsx,.xls,.ods,.csv,.pdf" onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </form>
      {error && <p className="aid-error" role="alert">{error}</p>}
      {!user && <p className="aid-info">3DEEZI AI reads your pictures once you are signed in.</p>}
      <div className="aid-options"><span className="aid-note">3DEEZI AI names each design from the artwork, applies your sizes and makes the order form PDF. Add pictures or drop / paste them here (front and back, any number).</span></div>

      {busy && <div className="ofm-busy"><Loader overlay={false} title="Reading your designs…" subtitle="3DEEZI AI names each design from the artwork, applies your sizes and makes the order form PDF." steps={['Reading your designs', 'Naming each design', 'Applying your sizes', 'Making the order form']} seconds={30} /></div>}
      {order && !busy && <section className="ofm-result" aria-live="polite">
        {reply && <p className="ofm-reply">{reply}</p>}
        {order.analysis?.form ? <FormEditor order={order} onSaved={setOrder} /> : <PlainSummary order={order} />}
        <p className="ofm-again"><button type="button" onClick={startOver}><RotateCcw size={15} /> Start a new order form</button></p>
      </section>}
    </div>
  </section>;
}

/** The form found, corrected in place: brand, garment, and per design its name, colourway and sizes. */
function FormEditor({ order, onSaved }: { order: AssistantOrder; onSaved: (o: AssistantOrder) => void }) {
  const form = order.analysis!.form!;
  const fromForm = () => ({ brand: form.brand, garment: form.garment, designs: form.designs.map((d): Draft => ({ key: d.key, name: d.name, colourway: d.colourway, sizes: { ...d.sizes } })) });
  const [draft, setDraft] = useState(fromForm);
  const [extra, setExtra] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(fromForm()); setExtra([]); }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changed from the saved form? (A size cleared to 0 is the same as no size; sizes in their order.)
  const plain = (f: ReturnType<typeof fromForm>) => JSON.stringify({ ...f, designs: f.designs.map(d => ({ ...d,
    sizes: plainSizes(d.sizes) })) });
  const dirty = plain(draft) !== plain(fromForm());
  const columns = useMemo(() => [...new Set([...draft.designs.flatMap(d => Object.keys(d.sizes)), ...extra])].sort((a, b) => sizeRank(a) - sizeRank(b)), [draft, extra]);
  const grand = draft.designs.reduce((n, d) => n + sum(d.sizes), 0);
  const byKey = Object.fromEntries(form.designs.map(d => [d.key, d])) as Record<string, AssistantFormDesign>;
  const pictureUrl = (name: string) => order.designs.find(d => d.name === name)?.url;
  const set = (i: number, patch: Partial<Draft>) => setDraft(f => ({ ...f, designs: f.designs.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  async function save(): Promise<AssistantOrder | null> {
    setSaving(true); setProblem(null);
    try {
      const saved = await orderApi.assistantForm(order.token, { brand: draft.brand, garment: draft.garment,
        designs: draft.designs.map(d => ({ ...d, sizes: Object.fromEntries(Object.entries(d.sizes).filter(([, n]) => Number(n) > 0)) })) });
      onSaved(saved);
      return saved;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Your changes could not be saved. Please try again.');
      return null;
    } finally { setSaving(false); }
  }
  /** The PDF or Excel of the form as shown: unsaved changes are saved first. */
  async function download(kind: 'pdf' | 'xlsx') {
    const o = dirty ? await save() : order;
    if (o) window.location.href = o.links[kind];
  }
  async function copy() { try { await navigator.clipboard.writeText(order.links.page); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } }
  const checks = order.analysis!.checks;

  return <div className="ofm-form">
    <div className="ofm-top">
      <label><span>Team / brand</span><input value={draft.brand} maxLength={40} onChange={e => setDraft(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. MANTIS" /></label>
      <label><span>Garment</span><input value={draft.garment} maxLength={60} onChange={e => setDraft(f => ({ ...f, garment: e.target.value }))} /></label>
      <div className="ofm-grand"><span>Grand total</span><b>{grand}</b><small>{draft.designs.length} design{draft.designs.length === 1 ? '' : 's'}</small></div>
    </div>

    <ol className="ofm-designs">
      {draft.designs.map((d, i) => {
        const shown = byKey[d.key];
        return <li key={d.key} style={{ '--d': shown?.colour ?? '#1f2937' } as React.CSSProperties}>
          <div className="ofm-pics">{shown?.pictures.length ? shown.pictures.map(p => { const url = pictureUrl(p.name); return url ? <img key={p.name} src={url} alt={`${d.name} ${p.view === 'front_back' ? 'front and back' : p.view}`} /> : null; }) : <span>No picture</span>}</div>
          <div className="ofm-fields">
            <div className="ofm-name"><b>{String(i + 1).padStart(2, '0')}</b>
              <input value={d.name} maxLength={60} onChange={e => set(i, { name: e.target.value })} aria-label={`Design ${i + 1} name`} placeholder="Name" />
              <input value={d.colourway} maxLength={40} onChange={e => set(i, { colourway: e.target.value })} aria-label={`Design ${i + 1} colourway`} placeholder="Colourway" />
              <button type="button" className="ofm-icon" title="Take this design off the form" aria-label={`Take design ${i + 1} off the form`} onClick={() => setDraft(f => ({ ...f, designs: f.designs.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>
            </div>
            <div className="ofm-sizes" role="group" aria-label={`Design ${i + 1} sizes`}>
              {columns.map(s => <label key={s}><span>{s}</span><input type="number" min={0} max={10000} inputMode="numeric" value={d.sizes[s] || ''} placeholder="0"
                onChange={e => set(i, { sizes: { ...d.sizes, [s]: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) } })} /></label>)}
              <label className="is-total"><span>Total</span><output>{sum(d.sizes)}</output></label>
            </div>
            {draft.designs.some(x => plainSizes(x.sizes) !== plainSizes(d.sizes)) && <button type="button" className="ofm-link" onClick={() => setDraft(f => ({ ...f, designs: f.designs.map(x => ({ ...x, sizes: { ...d.sizes } })) }))}>Use these sizes for every design</button>}
          </div>
        </li>;
      })}
    </ol>
    <div className="ofm-row">
      <AddSize used={columns} onAdd={s => setExtra(x => [...x, s])} />
      {dirty && <button type="button" className="ofm-save" onClick={save} disabled={saving}>{saving ? <LoaderCircle size={16} className="ofm-spin" /> : <Check size={16} />} Save changes</button>}
      {dirty && <button type="button" className="ofm-link" onClick={() => setDraft(fromForm())}>Undo changes</button>}
    </div>
    {problem && <p className="ofm-error" role="alert">{problem}</p>}
    {checks.length > 0 && <ul className="ofm-checks">{checks.map((c, i) => <li key={i}><AlertTriangle size={15} /> {c.text}</li>)}</ul>}

    <div className="ofm-actions">
      <button type="button" className="ofm-primary" onClick={() => download('pdf')} disabled={saving}><FileDown size={18} /> PDF order form</button>
      <button type="button" onClick={() => download('xlsx')} disabled={saving}><FileSpreadsheet size={18} /> Excel</button>
      <button type="button" onClick={copy}>{copied ? <Check size={18} /> : <Link2 size={18} />} {copied ? 'Link copied' : 'Copy share link'}</button>
      <Link to={`/orders/new?assistant=${order.token}`}>Continue to order <ArrowRight size={18} /></Link>
    </div>
  </div>;
}

function AddSize({ used, onAdd }: { used: string[]; onAdd: (size: string) => void }) {
  const left = ALL_SIZES.filter(s => s !== 'Kids' && !used.includes(s));
  if (!left.length) return null;
  return <label className="ofm-addsize"><Plus size={15} /><select value="" onChange={e => e.target.value && onAdd(e.target.value)} aria-label="Add a size">
    <option value="">Add a size</option>{left.map(s => <option key={s} value={s}>{s}</option>)}</select></label>;
}

/** An order read from an order sheet (no design form): its summary, groups and the downloads. */
function PlainSummary({ order }: { order: AssistantOrder }) {
  const a = order.analysis;
  return <div className="ofm-form">
    {a && <>
      <p className="ofm-summary">{order.summary}</p>
      <ul className="ofm-groups">{a.groups.map(g => <li key={g.key}><i style={{ background: g.colour ?? '#8d9daa' }} />{g.design}<b>{g.total}</b></li>)}</ul>
      {a.checks.length > 0 && <ul className="ofm-checks">{a.checks.map((c, i) => <li key={i}><AlertTriangle size={15} /> {c.text}</li>)}</ul>}
    </>}
    <div className="ofm-actions">
      <a className="ofm-primary" href={order.links.pdf}><FileDown size={18} /> PDF order form</a>
      <a href={order.links.xlsx}><FileSpreadsheet size={18} /> Excel</a>
      <Link to={`/orders/summary/${order.token}`}><Link2 size={18} /> Summary page</Link>
      <Link to={`/orders/new?assistant=${order.token}`}>Continue to order <ArrowRight size={18} /></Link>
    </div>
  </div>;
}
