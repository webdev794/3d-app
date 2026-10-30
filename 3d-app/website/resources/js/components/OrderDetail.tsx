/**
 * One order, opened from My Orders (pages/OrdersBoard.tsx): a panel from the right (full screen on phones) with the
 * order's stage, what it needs from the customer, delivery tracking, garments with sizes and names, the design proof
 * and its versions, files, the invoice and the updates. The design review (approve, or ask for changes with a note)
 * opens over it. Only customer-facing files and updates are shown (orderBoardModel drops anything internal).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, ClipboardList, Copy, CreditCard, Download, ExternalLink, FileText, Image as ImageIcon, LoaderCircle, MessageSquareText, Package, Palette, PenLine, Receipt, Shirt, Truck, TriangleAlert, Upload, X } from 'lucide-react';
import { ApiError, downloadFile, fetchFile } from '../api';
import { orderApi } from '../orderApi';
import { DetailSection, GarmentPicture, PaymentPill, STAGES, StatusPill, dateTime, displayRef, fileSize, garmentName, money, payPath, plural, readOrderDetail, safeLink, shortDate, type BoardOrder, type OrderDetail, type OrderFile, type OrderUpdate, type PaymentSummary, type Player } from './orderBoardModel';
import { ALL_SIZES, FIT_NAMES } from '../orderSizes';

export type DetailFocus = 'review' | 'track' | 'pay' | null;

/** Every size in order (Order::SIZES): Mens XS–8XL, Womens W8–W24, Kids 2Y–16Y, then the older Kids column. */
const SIZE_ORDER = ALL_SIZES;
const sizeEntries = (sizes: Record<string, number>) => Object.entries(sizes).filter(([, n]) => n > 0).sort(([a], [b]) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99));
const KIND_LABEL: Record<string, string> = { order_form: 'Order form', artwork: 'Artwork', proof: 'Design proof', photo: 'Photo', invoice: 'Invoice', other: 'File' };
const SOURCE_LABEL: Record<string, string> = { studio: 'Ordered from the Studio', form: 'Order form', upload: 'Uploaded order form', admin: 'Added by 3DEEZI' };
const isPicture = (f: OrderFile) => f.mime_type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(f.extension);
const isPdf = (f: OrderFile) => f.mime_type === 'application/pdf' || f.extension === 'pdf';

/** The customer's recorded answer to one proof version: from the proof itself, else from the order's history. */
export function responseTo(proof: OrderFile, order: OrderDetail): { decision: 'approved' | 'changes'; at: string; note: string | null } | null {
  const status = (proof.review_status ?? '').toLowerCase();
  if (proof.reviewed_at && (status.startsWith('approv') || status.startsWith('change'))) return { decision: status.startsWith('approv') ? 'approved' : 'changes', at: proof.reviewed_at, note: proof.review_note };
  const sent = proof.created_at ?? '';
  const next = order.proofs.filter(p => (p.version ?? 0) > (proof.version ?? 0)).map(p => p.created_at ?? '').sort()[0] ?? '9999';
  const answers = order.updates.filter(u => u.author === 'customer' && u.kind === 'approval' && (u.approval === 'approved' || u.approval === 'changes') && u.created_at >= sent && u.created_at < next);
  const answer = answers.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return answer ? { decision: answer.approval === 'approved' ? 'approved' : 'changes', at: answer.created_at, note: answer.message } : null;
}

/** A file kept behind sign-in, as a local address for <img> or <object> (released when no longer shown). */
function useFileUrl(path: string | null) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!path) return;
    let url: string | null = null, gone = false;
    setState({ url: null, failed: false });
    fetchFile(path).then(blob => { if (gone) return; url = URL.createObjectURL(blob); setState({ url, failed: false }); }).catch(() => { if (!gone) setState({ url: null, failed: true }); });
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [path]);
  return state;
}

/** Downloads, one at a time per file, with a message if one fails. */
function useDownloads() {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState('');
  const download = useCallback(async (key: string, path: string, name: string) => {
    const external = safeLink(path);
    if (external) { window.open(external, '_blank', 'noopener'); return; }
    setBusy(key); setFailed('');
    try { await downloadFile(path, name); } catch (e) { setFailed(`${name}: ${(e as Error).message}`); } finally { setBusy(null); }
  }, []);
  return { busy, failed, download, clear: () => setFailed('') };
}

export default function OrderDetailDrawer({ orderId, initial, focus, refreshedAt, onClose, onChanged, onNotice }: {
  orderId: number | null; initial: BoardOrder | null; focus: DetailFocus; refreshedAt: number | null;
  onClose: () => void; onChanged: (order: OrderDetail) => void; onNotice?: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  const files = useDownloads();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    document.documentElement.classList.add('ob-locked');
    return () => document.documentElement.classList.remove('ob-locked');
  }, []);

  const load = useCallback(async () => {
    if (orderId === null) { setError('We couldn’t find this order. Check the link, or search for it on the board.'); return; }
    try {
      const next = readOrderDetail(await orderApi.order(orderId));
      if (!next) throw new Error('This order could not be read. Please try again.');
      setDetail(next); setError('');
    } catch (e) { setError(e instanceof ApiError && e.status === 404 ? 'We couldn’t find this order. It may belong to another account.' : (e as Error).message); }
  }, [orderId]);
  useEffect(() => { load(); }, [load, refreshedAt]);

  // Opened for a reason (Review design, Track delivery, Pay now): go straight there once the order is in.
  const placed = useRef(false);
  useEffect(() => {
    if (!detail || placed.current) return;
    placed.current = true;
    if (focus === 'review' && detail.approval === 'review') setReviewing(true);
    else if (focus) show(focus === 'track' ? 'obd-delivery' : focus === 'pay' ? 'obd-invoice' : 'obd-proof');
  }, [detail, focus]);

  function show(id: string) {
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      const box = body.current;
      if (!target || !box) return;
      box.scrollTo({ top: box.scrollTop + target.getBoundingClientRect().top - box.getBoundingClientRect().top - 12, behavior: 'smooth' });
      setLit(id);
      window.setTimeout(() => setLit(l => (l === id ? null : l)), 1800);
      target.querySelector<HTMLElement>('.obd-primary, a, button')?.focus({ preventScroll: true });
    });
  }

  function recorded(next: OrderDetail, decision: 'approve' | 'changes') {
    setDetail(next);
    onChanged(next);
    onNotice?.(decision === 'approve' ? `Design approved for ${displayRef(next.number)}. Thank you!` : `Your changes for ${displayRef(next.number)} were sent to the design team.`);
  }

  const order: (BoardOrder & Partial<OrderDetail>) | null = detail ?? initial;
  const proof = detail?.proof ?? null;
  const tracking = order?.tracking ?? null;
  const shipped = order?.stage === 'shipped' || order?.stage === 'delivered';

  return <dialog ref={dialog} className="ob-drawer" aria-labelledby="obd-title" onCancel={e => { e.preventDefault(); if (!reviewing) onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="obd-shell">
      <header className="obd-head">
        <div>
          <p className="ob-ref">{order ? displayRef(order.number) : 'Order'}</p>
          <h2 id="obd-title">{order?.name ?? 'Loading the order…'}</h2>
        </div>
        <button type="button" className="obd-close" onClick={onClose} aria-label="Close the order"><X size={22} /></button>
      </header>
      <div className="obd-body" ref={body}>
        {order && <StageTrack order={order} />}
        {error && <div className="obd-note is-error" role="alert"><TriangleAlert size={18} /><span>{error}</span>{orderId !== null && <button type="button" className="ob-ghost" onClick={load}>Try again</button>}</div>}
        {!detail && !error && <div className="obd-loading" role="status"><LoaderCircle className="spin" size={22} /> Loading the order…</div>}
        {detail && <>
          {detail.approval === 'review' && <div className="obd-callout tone-amber">
            <PenLine size={22} aria-hidden="true" />
            <p><strong>Your design is ready to check.</strong> {proof ? `Proof version ${proof.version}` : 'The proof'} is waiting for your approval. Approve it, or tell us what to change.</p>
            <button type="button" className="ob-action obd-primary" onClick={() => setReviewing(true)}>Review design <ArrowRight size={17} /></button>
          </div>}
          {detail.payment?.payable && <div className="obd-callout tone-amber">
            <CreditCard size={22} aria-hidden="true" />
            <p><strong>Payment due.</strong> {detail.payment.invoiceNumber ? `Invoice ${detail.payment.invoiceNumber}` : 'Your invoice'}{money(detail.payment.amountDue, detail.payment.currency) ? ` for ${money(detail.payment.amountDue, detail.payment.currency)}` : ''} is waiting for payment.</p>
            <PayButton payment={detail.payment} />
          </div>}

          {shipped && tracking && <DeliverySection order={detail} lit={lit === 'obd-delivery'} />}
          <GarmentsSection order={detail} />
          <ProofSection order={detail} onReview={() => setReviewing(true)} files={files} />
          <FilesSection order={detail} files={files} />
          {detail.payment && <InvoiceSection order={detail} files={files} lit={lit === 'obd-invoice'} />}
          {!(shipped && tracking) && <DeliverySection order={detail} lit={lit === 'obd-delivery'} />}
          <UpdatesSection order={detail} />
          <DetailsSection order={detail} />
          {files.failed && <div className="obd-note is-error" role="alert"><TriangleAlert size={18} /><span>{files.failed}</span><button type="button" className="ob-ghost" onClick={files.clear}>OK</button></div>}
        </>}
      </div>
    </div>
    {reviewing && detail && <ReviewDesign order={detail} onClose={() => setReviewing(false)} onRecorded={recorded} onStale={load} />}
  </dialog>;
}

/** Where the order is: the five stages, the sub-status and the payment. */
function StageTrack({ order }: { order: BoardOrder & Partial<OrderDetail> }) {
  const at = STAGES.findIndex(s => s.key === order.stage);
  const reached = order.stages_reached ?? {};
  return <div className="obd-track">
    {order.stage === 'cancelled' ? <p className="obd-cancelled"><TriangleAlert size={16} /> This order was cancelled{reached.cancelled ? ` on ${shortDate(reached.cancelled)}` : ''}.</p>
      : <ol className="obd-steps" aria-label="Order progress">
        {STAGES.map((s, i) => <li key={s.key} className={`tone-${s.tone}${i < at ? ' is-done' : ''}${i === at ? ' is-now' : ''}`} aria-current={i === at ? 'step' : undefined}>
          <i className="ob-dot" aria-hidden="true">{i < at && <Check size={10} strokeWidth={3.5} />}</i>
          <span className="obd-step-name"><span className="is-long">{s.label}</span><span className="is-short">{s.short}</span></span>
          {reached[s.key] && <small>{shortDate(reached[s.key])}</small>}
        </li>)}
      </ol>}
    <div className="obd-now"><span>Status</span><StatusPill status={order.sub_status} />{order.payment && <PaymentPill payment={order.payment} />}</div>
  </div>;
}

function DeliverySection({ order, lit }: { order: OrderDetail; lit: boolean }) {
  const t = order.tracking;
  const [copied, setCopied] = useState(false);
  const reached = order.stages_reached;
  const carrierLink = t?.url ? safeLink(t.url) : null;
  async function copy() {
    if (!t?.number) return;
    try { await navigator.clipboard.writeText(t.number); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* The number stays on screen to copy by hand. */ }
  }
  return <DetailSection id="obd-delivery" title="Delivery" icon={<Truck size={18} />} className={lit ? 'is-lit' : ''}>
    {t ? <div className="obd-tracking">
      <dl className="obd-pairs">
        {t.carrier && <div><dt>Carrier</dt><dd>{t.carrier}</dd></div>}
        {t.number && <div><dt>Tracking number</dt><dd className="obd-copy"><code>{t.number}</code><button type="button" className="ob-mini" onClick={copy} aria-label="Copy the tracking number">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button></dd></div>}
        {reached.shipped && <div><dt>Shipped</dt><dd>{shortDate(reached.shipped)}</dd></div>}
        {reached.delivered && <div><dt>Delivered</dt><dd>{shortDate(reached.delivered)}</dd></div>}
      </dl>
      {carrierLink ? <a className="ob-action obd-primary" href={carrierLink} target="_blank" rel="noopener noreferrer">Track with {t.carrier || 'the carrier'} <ExternalLink size={16} /></a>
        : <p className="obd-quiet">Use the tracking number on {t.carrier ? `${t.carrier}’s` : 'the carrier’s'} website.</p>}
    </div> : <p className="obd-quiet">{order.stage === 'delivered' ? 'Delivered.' : 'Tracking appears here when your order ships.'}{order.needed_by ? ` Date required: ${shortDate(order.needed_by)}.` : ''}</p>}
    {order.shipping_address && <p className="obd-address"><strong>{/^pick up/i.test(order.shipping_address) ? 'Pick up' : 'Delivery address'}</strong>{order.shipping_address}</p>}
  </DetailSection>;
}

function Players({ players, title }: { players: Player[]; title: string }) {
  if (!players.length) return null;
  const table = <table className="obd-players"><thead><tr><th>#</th><th>Name</th><th>No.</th>{players.some(p => p.size) && <th>Size</th>}</tr></thead>
    <tbody>{players.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p.name || '—'}</td><td>{p.number || '—'}</td>{players.some(q => q.size) && <td>{p.size || '—'}</td>}</tr>)}</tbody></table>;
  return players.length > 6 ? <details className="obd-names"><summary>{title} ({players.length})</summary>{table}</details> : <div className="obd-names"><p className="obd-names-title">{title}</p>{table}</div>;
}

function GarmentsSection({ order }: { order: OrderDetail }) {
  const total = order.items.reduce((a, i) => a + i.quantity, 0) || order.quantity;
  return <DetailSection id="obd-garments" title="Garments" icon={<Shirt size={18} />} aside={total > 0 ? <span className="obd-aside">{plural(total, 'garment')}</span> : undefined}>
    {order.items.length ? <ul className="obd-items">{order.items.map((item, n) => {
      // "Mens · Hoodie": the fit, and the garment when the row's name doesn't say it (e.g. a kit's own name).
      const kind = garmentName(item.garment);
      const sub = [item.fit && (FIT_NAMES[item.fit] ?? item.fit[0].toUpperCase() + item.fit.slice(1)), item.garment !== 'other' && !item.name.toLowerCase().includes(kind.toLowerCase()) ? kind : null].filter(Boolean).join(' · ');
      const sizes = sizeEntries(item.sizes);
      return <li key={n}>
        <GarmentPicture garment={item.garment} thumbnail={item.thumbnail} alt={item.name} />
        <div className="obd-item">
          <p className="obd-item-head"><strong>{item.name}</strong><b>{item.quantity}</b></p>
          {sub && <p className="obd-item-sub">{sub}</p>}
          {sizes.length > 0 ? <ul className="obd-sizes" aria-label={`${item.name} sizes`}>{sizes.map(([s, count]) => <li key={s}><span>{s}</span><b>{count}</b></li>)}</ul> : <p className="obd-quiet">Sizes to be confirmed.</p>}
          <Players players={item.players} title="Names and numbers" />
        </div>
      </li>;
    })}</ul> : <p className="obd-quiet">{order.source === 'upload' ? 'We’re reading your uploaded order form. The garments and sizes appear here once we’ve checked them.' : 'No garments on this order yet.'}</p>}
    {order.names === 'same' && order.players[0] && <p className="obd-backs"><strong>On every shirt:</strong> {[order.players[0].name, order.players[0].number && `#${order.players[0].number}`].filter(Boolean).join(' · ') || '—'}</p>}
    {order.names === 'list' && <Players players={order.players} title="Names and numbers" />}
    {order.names === 'none' && <p className="obd-backs">No names or numbers on the back.</p>}
  </DetailSection>;
}

type Downloads = ReturnType<typeof useDownloads>;

function FileRow({ file, files, extra }: { file: OrderFile; files: Downloads; extra?: ReactNode }) {
  const key = `f${file.id}`;
  return <li className="obd-file">
    {file.thumb ? <img src={file.thumb} alt="" draggable={false} /> : <span className="obd-file-icon" aria-hidden="true">{file.kind === 'artwork' ? <Palette size={18} /> : file.kind === 'order_form' ? <ClipboardList size={18} /> : <FileText size={18} />}<small>{file.extension.slice(0, 4)}</small></span>}
    <span className="obd-file-text"><strong title={file.name}>{file.name}</strong><small>{[KIND_LABEL[file.kind] ?? 'File', fileSize(file.size), file.created_at && shortDate(file.created_at)].filter(Boolean).join(' · ')}</small>{extra}</span>
    <button type="button" className="ob-mini" onClick={() => files.download(key, file.download, file.name)} disabled={files.busy === key} aria-label={`Download ${file.name}`}>{files.busy === key ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}<span>Download</span></button>
  </li>;
}

function ProofSection({ order, onReview, files }: { order: OrderDetail; onReview: () => void; files: Downloads }) {
  const latest = order.proof;
  const waiting = order.approval === 'review';
  const earlier = order.proofs.filter(p => p !== latest);
  const answer = latest ? responseTo(latest, order) : null;
  let state: ReactNode;
  if (latest && waiting) state = <p className="obd-state tone-amber"><PenLine size={15} /> Waiting for your approval.</p>;
  else if (answer?.decision === 'approved') state = <p className="obd-state tone-green"><CheckCircle2 size={15} /> You approved version {latest?.version} on {dateTime(answer.at)}.</p>;
  else if (answer?.decision === 'changes') state = <div className="obd-state tone-violet"><p><MessageSquareText size={15} /> You asked for changes to version {latest?.version} on {dateTime(answer.at)}.</p>{answer.note && <blockquote>{answer.note}</blockquote>}<p className="obd-quiet">Our designers are working on the next version.</p></div>;
  else if (order.approval === 'approved') state = <p className="obd-state tone-green"><CheckCircle2 size={15} /> {order.source === 'studio' ? 'You confirmed this design as final when you ordered it.' : 'Design approved.'}</p>;
  else if (order.approval === 'changes') state = <p className="obd-state tone-violet"><MessageSquareText size={15} /> You asked for changes. Our designers are working on the next version.</p>;
  else if (order.approval === 'waiting' || order.stage === 'received' || order.stage === 'design') state = <p className="obd-quiet">Our designers are preparing your design proof. We’ll let you know when it’s ready to approve.</p>;
  else state = <p className="obd-quiet">No design proof on this order.</p>;
  return <DetailSection id="obd-proof" title="Design proof" icon={<ImageIcon size={18} />} aside={latest ? <span className="obd-aside">Version {latest.version}</span> : undefined}>
    {latest && <div className={`obd-proof${waiting ? ' is-waiting' : ''}`}>
      <button type="button" className="obd-proof-pic" onClick={onReview} aria-label={`Open design proof version ${latest.version}`}>
        {latest.thumb ? <img src={latest.thumb} alt="" draggable={false} /> : <span className="obd-file-icon"><FileText size={26} /><small>{latest.extension}</small></span>}
      </button>
      <div className="obd-proof-text">
        <p><strong>Version {latest.version}</strong>{latest.created_at && <small>Sent {dateTime(latest.created_at)}</small>}</p>
        {state}
        <div className="obd-row">
          {waiting ? <button type="button" className="ob-action obd-primary" onClick={onReview}>Review design <ArrowRight size={17} /></button> : <button type="button" className="ob-mini" onClick={onReview}><ImageIcon size={14} /> View proof</button>}
          <button type="button" className="ob-mini" onClick={() => files.download(`p${latest.id}`, latest.download, latest.name)} disabled={files.busy === `p${latest.id}`}>{files.busy === `p${latest.id}` ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />} Download</button>
        </div>
      </div>
    </div>}
    {!latest && state}
    {earlier.length > 0 && <div className="obd-versions"><p className="obd-names-title">Earlier versions</p><ul className="obd-files">{earlier.map(p => {
      const a = responseTo(p, order);
      return <FileRow key={p.id} file={p} files={files} extra={<em className={`obd-answer tone-${a?.decision === 'approved' ? 'green' : a ? 'violet' : 'grey'}`}>Version {p.version}{a ? ` · ${a.decision === 'approved' ? 'approved' : 'changes requested'} ${dateTime(a.at)}` : ' · replaced by a newer version'}{a?.note ? ` · “${a.note}”` : ''}</em>} />;
    })}</ul></div>}
  </DetailSection>;
}

function FilesSection({ order, files }: { order: OrderDetail; files: Downloads }) {
  const list = order.files.filter(f => f.kind !== 'proof' && f.kind !== 'invoice');
  return <DetailSection id="obd-files" title="Artwork & files" icon={<Upload size={18} />} aside={list.length ? <span className="obd-aside">{plural(list.length, 'file')}</span> : undefined}>
    {list.length ? <ul className="obd-files">{list.map(f => <FileRow key={f.id} file={f} files={files} />)}</ul> : <p className="obd-quiet">No files on this order.</p>}
  </DetailSection>;
}

/** Pay now: the invoice's Review & Pay page (payments-api.md §5). */
function PayButton({ payment, primary = false }: { payment: PaymentSummary; primary?: boolean }) {
  const path = payPath(payment);
  const external = !path && payment.payUrl ? safeLink(payment.payUrl) : null;
  const label = <><CreditCard size={16} /> Pay now <ArrowRight size={17} /></>;
  if (path) return <Link className={`ob-action is-pay${primary ? ' obd-primary' : ''}`} to={path}>{label}</Link>;
  if (external) return <a className={`ob-action is-pay${primary ? ' obd-primary' : ''}`} href={external}>{label}</a>;
  return null;
}

/** The invoice: number, amount, status, Pay now and Download invoice; a quote still being priced says so. */
function InvoiceSection({ order, files, lit }: { order: OrderDetail; files: Downloads; lit: boolean }) {
  const payment = order.payment!;
  const total = money(payment.total, payment.currency);
  const due = money(payment.amountDue, payment.currency);
  const paid = money(payment.amountPaid, payment.currency);
  const quote = payment.status === 'quote_required';
  return <DetailSection id="obd-invoice" title="Invoice & payment" icon={<Receipt size={18} />} className={lit ? 'is-lit' : ''} aside={<PaymentPill payment={payment} />}>
    {quote ? <>
      <p className="obd-quiet">We’re confirming your price. The invoice appears here when it’s ready, and we’ll email you.</p>
      {payment.reasons.length > 0 && <ul className="obd-reasons">{payment.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    </> : <>
      <dl className="obd-pairs">
        <div><dt>Invoice</dt><dd>{payment.invoiceNumber ?? '—'}</dd></div>
        {total && <div><dt>Total</dt><dd className="obd-amount">{total}</dd></div>}
        {payment.payable && due && due !== total && <div><dt>Still to pay</dt><dd className="obd-amount">{due}</dd></div>}
        {paid && Number(payment.amountPaid) > 0 && payment.status !== 'paid' && <div><dt>Paid so far</dt><dd>{paid}</dd></div>}
        {payment.paidAt ? <div><dt>Paid</dt><dd>{dateTime(payment.paidAt)}</dd></div> : payment.dueAt && <div><dt>Due</dt><dd>{shortDate(payment.dueAt)}</dd></div>}
      </dl>
      {payment.lastAttempt && ['failed', 'cancelled'].includes(payment.lastAttempt.status) && payment.payable && <p className="obd-state tone-red"><TriangleAlert size={15} /> {payment.lastAttempt.message || 'Your last payment didn’t go through.'} You can try again.</p>}
      <div className="obd-row">
        {payment.payable && <PayButton payment={payment} primary />}
        {payment.pdf && <button type="button" className="ob-mini" onClick={() => files.download('invoice', payment.pdf!, `${payment.invoiceNumber || 'invoice'}.pdf`)} disabled={files.busy === 'invoice'}>{files.busy === 'invoice' ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />} Download invoice</button>}
      </div>
    </>}
  </DetailSection>;
}

const UPDATE_ICON: Record<string, ReactNode> = { submitted: <Package size={15} />, stage: <ArrowRight size={15} />, step: <Shirt size={15} />, approval: <PenLine size={15} />, proof: <ImageIcon size={15} />, tracking: <Truck size={15} />, note: <MessageSquareText size={15} />, file: <FileText size={15} />, payment: <CreditCard size={15} />, invoice: <Receipt size={15} /> };

function UpdatesSection({ order }: { order: OrderDetail }) {
  const [all, setAll] = useState(false);
  const list = [...order.updates].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const shown = all ? list : list.slice(0, 6);
  const who = (u: OrderUpdate) => (u.author === 'customer' ? 'You' : u.author === 'staff' ? '3DEEZI team' : '3DEEZI');
  return <DetailSection id="obd-updates" title="Updates" icon={<MessageSquareText size={18} />}>
    {list.length ? <ol className="obd-timeline">{shown.map(u => <li key={u.id} className={`kind-${u.kind}${u.author === 'customer' ? ' by-you' : ''}`}>
      <span className="obd-tl-icon" aria-hidden="true">{UPDATE_ICON[u.kind] ?? <MessageSquareText size={15} />}</span>
      <div><p className="obd-tl-text">{u.text}</p>{u.message && <blockquote>{u.message}</blockquote>}<small>{who(u)} · <time dateTime={u.created_at}>{dateTime(u.created_at)}</time></small></div>
    </li>)}</ol> : <p className="obd-quiet">Updates from our team appear here.</p>}
    {list.length > shown.length && <button type="button" className="ob-ghost obd-more" onClick={() => setAll(true)}>Show all {list.length} updates</button>}
  </DetailSection>;
}

function DetailsSection({ order }: { order: OrderDetail }) {
  const total = money(order.total, order.currency);
  const rows: [string, ReactNode][] = [
    ['Reference', displayRef(order.number)],
    ['Placed', dateTime(order.submitted_at)],
    ['Sent as', SOURCE_LABEL[order.source] ?? 'Order'],
    ['Team', order.team_name],
    ['Contact', order.contact_name],
    ['Email', order.contact_email],
    ['Phone', order.phone],
    ['Date required', order.needed_by && shortDate(order.needed_by)],
    ['Total', total ?? (order.payment ? null : 'Quote pending')],
  ];
  return <DetailSection id="obd-info" title="Order details" icon={<ClipboardList size={18} />}>
    <dl className="obd-pairs is-list">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {order.notes && <div className="obd-notes"><p className="obd-names-title">Your notes</p><p>{order.notes}</p></div>}
  </DetailSection>;
}

/**
 * Review design: the proof large, with Approve design and Request changes (a note is needed). The customer answers
 * this exact version; once recorded, the answer shows with its date and time. A proof already answered (or replaced)
 * opens to look at only.
 */
function ReviewDesign({ order, onClose, onRecorded, onStale }: { order: OrderDetail; onClose: () => void; onRecorded: (o: OrderDetail, decision: 'approve' | 'changes') => void; onStale: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // The version on screen stays put while the order refreshes; a newer one that arrives meanwhile is offered.
  const [proof, setProof] = useState(order.proof);
  const newer = order.proof && proof && order.proof.id !== proof.id && (order.proof.version ?? 0) > (proof.version ?? 0) ? order.proof : null;
  const [step, setStep] = useState<'choose' | 'approve' | 'changes'>('choose');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ decision: 'approve' | 'changes'; at: string; version: number | null; note: string | null } | null>(null);
  const picture = proof && isPicture(proof);
  const full = useFileUrl(proof && (picture || isPdf(proof)) ? proof.download : null);
  const files = useDownloads();
  const waiting = order.approval === 'review' && !!proof && !newer && !done;
  const answer = proof && !done ? responseTo(proof, order) : null;

  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  useEffect(() => { if (step === 'changes') document.getElementById('obr-note')?.focus(); }, [step]);

  async function send(decision: 'approve' | 'changes') {
    if (decision === 'changes' && !note.trim()) { setError('Tell us what to change.'); return; }
    setBusy(true); setError('');
    try {
      // The proof on screen is named (orders-api.md §10), so an answer never lands on a newer version than the one seen.
      const next = readOrderDetail(await orderApi.answerProof(order.id, decision, proof?.id ?? null, decision === 'changes' ? note.trim() : undefined));
      if (!next) throw new Error('The reply could not be read. Refresh the page to see your answer.');
      const mine = next.proofs.find(p => p.id === proof?.id) ?? next.proof;
      const recordedAnswer = mine ? responseTo(mine, next) : null;
      setDone({ decision, at: recordedAnswer?.at ?? new Date().toISOString(), version: proof?.version ?? null, note: decision === 'changes' ? note.trim() : null });
      onRecorded(next, decision);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setError('This proof is no longer waiting for your approval: it may have been answered or replaced by a newer version. The order has been refreshed.'); onStale(); }
      else setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return <dialog ref={ref} className="ob-review" aria-labelledby="obr-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} onClick={e => { if (e.target === ref.current && !busy) onClose(); }}>
    <header className="obr-head">
      <div><p className="ob-ref">{displayRef(order.number)} · {order.name}</p><h2 id="obr-title">{waiting ? 'Review design' : 'Design proof'}</h2>{proof && <p className="obr-sub">Version {proof.version}{proof.created_at ? ` · sent ${dateTime(proof.created_at)}` : ''}</p>}</div>
      <button type="button" className="obd-close" onClick={onClose} disabled={busy} aria-label="Close the design review"><X size={22} /></button>
    </header>
    <div className="obr-body">
      <div className="obr-proof">
        {!proof ? <p className="obd-quiet">There is no design proof on this order yet.</p>
          : picture ? (full.url ? <img src={full.url} alt={`Design proof version ${proof.version}`} draggable={false} /> : proof.thumb ? <img src={proof.thumb} alt={`Design proof version ${proof.version}`} draggable={false} className={full.failed ? '' : 'is-loading'} /> : <span className="obd-loading">{full.failed ? 'The proof couldn’t be shown. Download it to look at it.' : <><LoaderCircle className="spin" size={22} /> Loading the proof…</>}</span>)
          : isPdf(proof) && full.url ? <object data={full.url} type="application/pdf" aria-label={`Design proof version ${proof.version}`}><p className="obd-quiet">This proof is a PDF. <a href={full.url} target="_blank" rel="noopener noreferrer">Open it</a> or download it.</p></object>
          : <span className="obd-loading">{isPdf(proof) && !full.failed ? <><LoaderCircle className="spin" size={22} /> Loading the proof…</> : 'Download the proof to look at it.'}</span>}
        {proof && <div className="obd-row">
          {full.url && <a className="ob-mini" href={full.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open full size</a>}
          <button type="button" className="ob-mini" onClick={() => files.download('proof', proof.download, proof.name)} disabled={files.busy === 'proof'}>{files.busy === 'proof' ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />} Download</button>
        </div>}
        {files.failed && <p className="ob-error" role="alert">{files.failed}</p>}
      </div>
      <div className="obr-side">
        {newer && !done && <div className="obd-callout tone-amber" role="status"><ImageIcon size={20} aria-hidden="true" /><p><strong>Version {newer.version} has just arrived.</strong> Look at it before you answer.</p><button type="button" className="ob-action" onClick={() => { setProof(newer); setStep('choose'); setError(''); }}>Show version {newer.version}</button></div>}
        {done ? <div className={`obr-done tone-${done.decision === 'approve' ? 'green' : 'violet'}`} role="status">
          {done.decision === 'approve' ? <CheckCircle2 size={30} /> : <MessageSquareText size={30} />}
          <h3>{done.decision === 'approve' ? 'Design approved' : 'Changes requested'}</h3>
          <p>{done.decision === 'approve' ? `You approved version ${done.version} on ${dateTime(done.at)}. We’ll make your order with this design.` : `You asked for changes to version ${done.version} on ${dateTime(done.at)}. Our designers will send a new version to approve.`}</p>
          {done.note && <blockquote>{done.note}</blockquote>}
          <button type="button" className="ob-action obd-primary" onClick={onClose}>Done</button>
        </div>
          : waiting ? <>
            {(() => { const sent = order.updates.find(u => u.file?.id === proof?.id && u.message); return sent ? <div className="obr-message"><p className="obd-names-title">Message from the design team</p><blockquote>{sent.message}</blockquote></div> : null; })()}
            <div className="obr-check"><p className="obd-names-title">Before you approve, check</p><ul><li>Names, numbers and spelling</li><li>Colours, logos and sponsors</li><li>Garments and where everything sits</li></ul></div>
            {step === 'choose' && <div className="obr-actions">
              <button type="button" className="obr-approve" onClick={() => { setStep('approve'); setError(''); }}><Check size={18} /> Approve design</button>
              <button type="button" className="ob-action" onClick={() => { setStep('changes'); setError(''); }}><PenLine size={16} /> Request changes</button>
            </div>}
            {step === 'approve' && <div className="obr-confirm">
              <p><strong>Approve version {proof?.version}?</strong> We’ll make your order with this design.</p>
              <div className="obr-actions">
                <button type="button" className="obr-approve" onClick={() => send('approve')} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} Yes, approve version {proof?.version}</button>
                <button type="button" className="ob-ghost" onClick={() => setStep('choose')} disabled={busy}>Back</button>
              </div>
            </div>}
            {step === 'changes' && <form className="obr-confirm" onSubmit={e => { e.preventDefault(); send('changes'); }}>
              <label htmlFor="obr-note"><strong>What should we change?</strong> <small>Your note goes to the design team with version {proof?.version}.</small></label>
              <textarea id="obr-note" rows={5} maxLength={2000} value={note} onChange={e => { setNote(e.target.value); if (error) setError(''); }} placeholder="For example: make the sponsor logo bigger and change the number colour to gold." aria-invalid={!!error && !note.trim()} />
              <small className="obr-count">{note.length} / 2000</small>
              <div className="obr-actions">
                <button type="submit" className="ob-action obd-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <MessageSquareText size={16} />} Send changes</button>
                <button type="button" className="ob-ghost" onClick={() => setStep('choose')} disabled={busy}>Back</button>
              </div>
            </form>}
            {error && <p className="ob-error" role="alert">{error}</p>}
          </>
          : <div className="obr-message">
            {answer ? <p className={`obd-state tone-${answer.decision === 'approved' ? 'green' : 'violet'}`}>{answer.decision === 'approved' ? <CheckCircle2 size={15} /> : <MessageSquareText size={15} />} You {answer.decision === 'approved' ? 'approved' : 'asked for changes to'} version {proof?.version} on {dateTime(answer.at)}.</p>
              : <p className="obd-quiet">{order.approval === 'approved' ? 'This design is approved.' : 'This proof is not waiting for your approval.'}</p>}
            {answer?.note && <blockquote>{answer.note}</blockquote>}
            {error && <p className="ob-error" role="alert">{error}</p>}
            <button type="button" className="ob-ghost" onClick={onClose}>Close</button>
          </div>}
      </div>
    </div>
  </dialog>;
}
