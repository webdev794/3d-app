import { ArrowLeft, BarChart3, Check, CloudUpload, Copy, FileSpreadsheet, FileText, Image as ImageIcon, Keyboard, Link2, Mic, Paperclip, Pencil, Plus, Send, Sparkles, Users, X, Zap, Camera, FileDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, media, type User } from '../api';
import { orderApi, type AssistantOrder } from '../orderApi';
import '../../css/order-assistant.css';

const ORDER_TYPES = ['xlsx', 'xls', 'ods', 'csv', 'tsv', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic'];
const DESIGN_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase();
const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const KEY = '3deezi.order-assistant';

/**
 * THE ORDER ASSISTANT (client images 4 / 5, 2026-11-05; task TL-3): the default way to order, as in the app. Screen 1
 * "CREATE YOUR ORDER" (Start from scratch, Excel / order sheet, Handwritten notes, Upload artwork, 3DEEZI Team, one
 * prompt bar, Switch to Manual Form); then the chat; then the analysis: the things to check, the order summary with
 * its share page, the PDF and the Excel, the design pictures, Edit Order and Review & Approve. The server reads and
 * collates (POST /order-assistant). The order's token is kept in this browser so a reload reopens it.
 */
export default function OrderAssistantPage({ user, requireAuth }: { user: User | null; requireAuth: (action?: () => void) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const maker = params.get('maker');
  const [order, setOrder] = useState<AssistantOrder | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [designs, setDesigns] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ text: string; files: string[] } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const orderInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const designInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // A reload reopens the order this browser was collating (?order=… opens a given one).
  useEffect(() => {
    let token: string | null = params.get('order');
    if (!token) { try { token = sessionStorage.getItem(KEY); } catch { token = null; } }
    if (!token) return;
    orderApi.assistantOrder(token).then(setOrder).catch(() => { try { sessionStorage.removeItem(KEY); } catch { /* private window */ } });
  }, []);

  const analysis = order?.analysis ?? null;
  const garments = analysis?.totals.garments ?? 0;
  const started = !!order || !!pending;

  async function send(assign?: Record<string, string>) {
    const message = text.trim();
    if (busy) return;
    if (!message && !files.length && !designs.length && !assign) { setError('Type your order, or add your order sheet, notes or artwork first.'); return; }
    const form = new FormData();
    form.append('message', message);
    files.forEach(f => form.append('files[]', f));
    designs.forEach(f => form.append('designs[]', f));
    Object.entries(assign ?? {}).forEach(([name, group]) => form.append(`assign[${name}]`, group));
    if (!order && maker) {
      // "Make with Mantis": the maker's id from the order options (3DEEZI when not offered).
      try { const o = await orderApi.options() as unknown as { suppliers?: { id: number; name: string }[] }; const s = o?.suppliers?.find(x => x.name.toLowerCase() === maker.toLowerCase()); if (s) form.append('supplier_id', String(s.id)); } catch { /* 3DEEZI */ }
    }
    const sent = { text: message, files: [...files, ...designs] };
    setBusy(true); setError('');
    if (!assign) setPending({ text: message, files: sent.files.map(f => f.name) });
    setText(''); setFiles([]); setDesigns([]);
    try {
      const next = await orderApi.assistant(form, order?.token);
      setOrder(next); setPending(null);
      try { sessionStorage.setItem(KEY, next.token); } catch { /* private window */ }
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) {
      setPending(null);
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Your order could not be read. Try again.');
      if (!assign) { setText(message); setFiles(sent.files.filter(f => files.includes(f))); setDesigns(sent.files.filter(f => designs.includes(f))); }
    } finally { setBusy(false); }
  }

  function addFiles(list: FileList | null, kind: 'order' | 'design') {
    const picked = Array.from(list ?? []);
    const allowed = kind === 'order' ? ORDER_TYPES : DESIGN_TYPES;
    const bad = picked.find(f => !allowed.includes(ext(f.name)));
    if (bad) { setError(kind === 'order' ? 'Order files can be Excel, CSV, PDF or photos.' : 'Design pictures can be PNG, JPG, WebP or PDF.'); return; }
    const big = picked.find(f => f.size > (kind === 'order' ? 25 : 15) * 1048576);
    if (big) { setError(`${big.name} is larger than ${kind === 'order' ? 25 : 15} MB.`); return; }
    setError('');
    if (kind === 'order') setFiles(fs => [...fs, ...picked].slice(0, 6)); else setDesigns(ds => [...ds, ...picked].slice(0, 20));
  }

  function scratch() { if (!text.trim()) setText('I need '); setTimeout(() => textRef.current?.focus(), 0); }
  function toForm(review: boolean) {
    if (!order) return;
    const go = () => navigate(`/orders/new?assistant=${order.token}${review ? '&review=1' : ''}${maker ? `&maker=${encodeURIComponent(maker)}` : ''}`);
    if (!user) { requireAuth(go); return; }
    go();
  }
  async function copyLink() {
    if (!order) return;
    try { await navigator.clipboard.writeText(order.links.page); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Copy the link to the order summary:', order.links.page); }
  }
  function startOver() { setOrder(null); setPending(null); setError(''); try { sessionStorage.removeItem(KEY); } catch { /* */ } }

  const checks = (analysis?.checks ?? []).filter(c => c.type !== 'spelling');
  const messages = order?.messages ?? [];
  const lastAssistant = messages.map(m => m.role).lastIndexOf('assistant');

  const bar = <div className="oa-bar-wrap">
    {[...files.map(f => [f, 'order'] as const), ...designs.map(f => [f, 'design'] as const)].map(([f, kind]) =>
      <div key={kind + f.name} className="oa-chip">
        {kind === 'design' ? <ImageIcon size={18} /> : <FileText size={18} />}
        <span><b>{f.name}</b><small>{kind === 'design' ? 'Design picture' : 'Order file'} · {sizeText(f.size)}</small></span>
        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => kind === 'design' ? setDesigns(ds => ds.filter(d => d !== f)) : setFiles(fs => fs.filter(d => d !== f))}><X size={18} /></button>
      </div>)}
    <form className="oa-bar" onSubmit={e => { e.preventDefault(); void send(); }}>
      <Sparkles className="oa-bar-spark" size={22} aria-hidden />
      <textarea ref={textRef} aria-label="Your order" data-testid="assistant-text" rows={started ? 1 : 2} value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
        placeholder={started ? 'Ask 3DEEZI ORDER ASSISTANT…' : 'e.g. I need 9 polos: 3 × 4XL, 2 × 2XL and 4 × 5XL. Black with our club logo on the chest.'} />
      <div className="oa-bar-tools">
        <button type="button" className="oa-round" title="Add your order sheet or notes" aria-label="Add your order sheet or notes" onClick={() => orderInput.current?.click()}><Plus size={19} /></button>
        <button type="button" className="oa-round" title="Add design pictures" aria-label="Add design pictures" onClick={() => designInput.current?.click()}><ImageIcon size={18} /></button>
        <button type="button" className="oa-round" title="Add a file" aria-label="Add a file" onClick={() => orderInput.current?.click()}><Paperclip size={18} /></button>
        <button type="button" className="oa-round" title="Speak your order" aria-label="Speak your order" onClick={() => { textRef.current?.focus(); setError('Use your keyboard’s microphone (dictation) to speak your order.'); }}><Mic size={18} /></button>
        <button type="submit" className="oa-send" aria-label="Send" data-testid="assistant-send" disabled={busy}>{busy ? <span className="oa-spin" /> : <Send size={20} />}</button>
      </div>
    </form>
  </div>;

  return <main className={`oa-page${started ? ' is-chat' : ''}`}>
    <input ref={orderInput} type="file" hidden multiple accept={ORDER_TYPES.map(e => '.' + e).join(',')} onChange={e => { addFiles(e.target.files, 'order'); e.target.value = ''; }} />
    <input ref={photoInput} type="file" hidden accept="image/*" capture="environment" onChange={e => { addFiles(e.target.files, 'order'); e.target.value = ''; }} />
    <input ref={designInput} type="file" hidden multiple accept={DESIGN_TYPES.map(e => '.' + e).join(',')} onChange={e => { addFiles(e.target.files, 'design'); e.target.value = ''; }} />
    <header className="oa-head">
      <Link to="/order-now" className="oa-circle" aria-label="Back to Orders"><ArrowLeft size={20} /></Link>
      <div className="oa-brand"><img src={media('images/brand-final.png')} alt="3DEEZI" /><span className="oa-pill" data-testid="assistant-pill"><Sparkles size={15} /> ORDER ASSISTANT</span></div>
      {started ? <button type="button" className="oa-circle" onClick={startOver} title="Start a new order" aria-label="Start a new order"><Plus size={20} /></button> : <span className="oa-circle is-ghost" />}
    </header>

    {!started && <section className="oa-card" data-testid="assistant-welcome">
      <div className="oa-hero" aria-hidden>
        <div className="oa-ring" />
        <div className="oa-sheet"><b>ORDER<br />FORM</b>{[0, 1, 2, 3, 4].map(i => <i key={i}><em>{i < 2 ? <Check size={10} /> : null}</em><span /></i>)}</div>
        <img className="oa-jersey" src={media('images/art/bubble_jersey_dyo.webp')} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>
      <h1 className="oa-title">CREATE YOUR <span>ORDER</span></h1>
      <p className="oa-sub">Tell us what you need, upload your notes, images or existing files. I’ll build your complete order form for you.</p>
      <div className="oa-tiles">
        <button type="button" onClick={scratch} data-testid="assistant-scratch"><Sparkles size={30} /><span>START FROM<br />SCRATCH</span></button>
        <button type="button" onClick={() => orderInput.current?.click()} data-testid="assistant-sheet"><FileSpreadsheet size={30} /><span>EXCEL /<br />ORDER SHEET</span></button>
        <button type="button" onClick={() => photoInput.current?.click()} data-testid="assistant-notes"><Camera size={30} /><span>HANDWRITTEN<br />NOTES</span></button>
        <button type="button" onClick={() => designInput.current?.click()} data-testid="assistant-artwork"><CloudUpload size={30} /><span>UPLOAD<br />ARTWORK</span></button>
        <Link to="/team" data-testid="assistant-team"><em>REAL PEOPLE</em><Users size={30} /><span>3DEEZI<br />TEAM</span></Link>
      </div>
      {bar}
      <div className="oa-foot">
        <span className="oa-powered"><Zap size={16} /> Powered by <b>3DEEZI AI</b></span>
        <i aria-hidden />
        <Link to={`/orders/new${maker ? `?maker=${encodeURIComponent(maker)}` : ''}`} className="oa-manual" data-testid="assistant-manual"><Keyboard size={17} /> Switch to Manual Form</Link>
      </div>
      {error && <p className="oa-error" role="alert">{error}</p>}
    </section>}

    {started && <section className="oa-chat" aria-live="polite">
      {messages.map((m, i) => m.role === 'user'
        ? <div key={i} className="oa-msg is-user"><span className="oa-avatar is-user" aria-hidden>{(user?.name ?? 'You').slice(0, 1)}</span><div>
          {m.text && <p className="oa-bubble">{m.text}</p>}
          {(m.files ?? []).map(f => <p key={f.name} className="oa-bubble oa-file">{f.kind === 'design' ? <ImageIcon size={18} /> : <FileText size={18} />}{f.name}</p>)}
        </div></div>
        : i === lastAssistant && garments > 0 && !busy && analysis
          ? <div key={i} className="oa-msg" ref={answerRef}><span className="oa-avatar" aria-hidden><Sparkles size={18} /></span>
            <div className="oa-answer" data-testid="assistant-analysis">
              <h2>3DEEZI ORDER ASSISTANT</h2>
              <p>{checks.length ? 'I’ve analysed your order and highlighted a few things to check before production:' : 'I’ve analysed your order: nothing looks wrong. Check the summary, then review and approve.'}</p>
              {checks.length > 0 && <ul>{checks.slice(0, 8).map((c, n) => <li key={n}>{c.text}</li>)}</ul>}
              <div className="oa-summary">
                <h3><BarChart3 size={20} /> {(order?.title || 'Your order')} – Order Summary</h3>
                <p data-testid="assistant-summary">{order?.summary}</p>
                <div className="oa-groups">{analysis.groups.slice(0, 8).map(g => <span key={g.key}><i style={{ background: g.colour ?? '#2f6fd6' }} />{g.design} · {g.total}</span>)}{analysis.groups.length > 8 && <span><i />+{analysis.groups.length - 8} more on the page</span>}</div>
                <div className="oa-link-row">
                  <a href={`/orders/summary/${order!.token}`} target="_blank" rel="noreferrer" data-testid="assistant-page"><FileText size={24} /><span><b>{(order?.title || 'Your order')} – Order Summary</b><small>Page · share it with your team</small></span></a>
                  <button type="button" onClick={copyLink} title="Copy the link" aria-label="Copy the link">{copied ? <Check size={18} /> : <Link2 size={18} />}</button>
                </div>
                <div className="oa-downloads">
                  <a href={order!.links.pdf} data-testid="assistant-pdf"><FileDown size={17} /> PDF order form</a>
                  <a href={order!.links.xlsx} data-testid="assistant-xlsx"><FileSpreadsheet size={17} /> Excel (editable)</a>
                </div>
              </div>
              {order!.designs.length > 0 && <div className="oa-designs"><h4>Your designs</h4><div>{order!.designs.map(d => {
                const g = analysis.groups.find(x => x.key === d.group);
                return <div key={d.name} className="oa-design" style={{ borderColor: g?.colour ?? undefined }}>
                  {ext(d.name) === 'pdf' ? <FileText size={34} /> : <img src={d.url} alt={d.name} />}
                  <label><span className="sr-only">Design for {d.name}</span>
                    <select value={d.group ?? ''} disabled={busy} onChange={e => { setAssigning(d.name); void send({ [d.name]: e.target.value || 'none' }).finally(() => setAssigning(null)); }}>
                      <option value="">{assigning === d.name ? 'Saving…' : 'Not on this order'}</option>
                      {analysis.groups.map(x => <option key={x.key} value={x.key}>{x.design}</option>)}
                    </select></label>
                </div>;
              })}</div></div>}
            </div></div>
          : <div key={i} className="oa-msg"><span className="oa-avatar" aria-hidden><Sparkles size={18} /></span><p className="oa-bubble is-assistant">{m.text}</p></div>)}
      {pending && <div className="oa-msg is-user"><span className="oa-avatar is-user" aria-hidden>{(user?.name ?? 'You').slice(0, 1)}</span><div>
        {pending.text && <p className="oa-bubble">{pending.text}</p>}
        {pending.files.map(f => <p key={f} className="oa-bubble oa-file"><FileText size={18} />{f}</p>)}
      </div></div>}
      {busy && <div className="oa-typing" data-testid="assistant-typing"><span><i /><i /><i /></span> Reading your order…</div>}
      {error && <p className="oa-error" role="alert">{error}</p>}
      {garments > 0 && !busy && <div className="oa-actions">
        <button type="button" className="oa-edit" onClick={() => toForm(false)} data-testid="assistant-edit"><Pencil size={18} /> Edit Order</button>
        <button type="button" className="oa-review" onClick={() => toForm(true)} data-testid="assistant-review"><Check size={19} /> Review &amp; Approve</button>
      </div>}
      <div className="oa-chat-bar">{bar}</div>
      <p className="oa-chat-foot"><Link to="/orders/new"><Keyboard size={15} /> Switch to Manual Form</Link> · <button type="button" onClick={copyLink} disabled={!order}><Copy size={14} /> {copied ? 'Link copied' : 'Copy summary link'}</button></p>
    </section>}
  </main>;
}
