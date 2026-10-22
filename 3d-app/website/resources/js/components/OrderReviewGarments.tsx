/**
 * REVIEW & APPROVE ORDER, the multiple-garments layout (the client's "multiple garments will look like this"):
 * - the summary chip ("3 garment styles · 90 garments") and Download review PDF;
 * - one section per garment style ("01 — BASKETBALL SINGLET", Edit garment): FRONT and BACK mockups of that garment
 *   only (zoom, View full size), its picture, name, "colours · fit", a SIZE | QTY table with TOTAL and the players;
 * - the ORDER TOTALS card (garment styles, total garments, the price breakdown or "Pricing pending confirmation.").
 * The review page (OrderReviewApprove) shows this when reviewLayoutFor(order) is 'multi'; one matching kit uses its
 * combined layout. The mockups are drawn by the site's 3D viewer (KitViewer), one garment at a time, from the
 * garment's saved design; an upload-only garment shows the uploaded artwork, or "Mockup prepared by 3DEEZI".
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, FileText, LoaderCircle, Pencil, Shirt, X, ZoomIn, ZoomOut } from 'lucide-react';
import { KitViewer, type Design, type KitViewerHandle } from './KitViewer';
import GarmentIcon from './GarmentIcon';
import type { Quote } from './OrderPayment';
import { downloadReviewPdf, type ReviewPdfInput } from './orderReviewPdf';
import { artworkPicture, aud, garmentQty, mockupDesign, orderedSizes, projectPicture, rowGarmentOf, summaryText, type Mockup, type ReviewDelivery, type ReviewGarment } from './orderReviewData';
import '../../css/order-review-multi.css';

export * from './orderReviewData';
export { reviewPdf, downloadReviewPdf, type ReviewPdfInput } from './orderReviewPdf';

/* ================================================================================================ mockups */

/** Drawn pictures kept for this visit (Back to Edit and back again, or the payment page's PDF, don't draw them again). */
const drawn = new Map<string, { front: string; back: string }>();
const designKey = (d: Design) => JSON.stringify(d);

/**
 * Each garment's FRONT and BACK pictures (same order as `garments`), drawn one garment at a time by one hidden 3D
 * viewer: put `renderer` on the page (it is hidden). `enabled: false` draws nothing yet (the shots that need drawing
 * stay 'drawing'). `drawing`: some are still being drawn.
 */
export function useGarmentMockups(garments: ReviewGarment[], enabled = true) {
  const [, bump] = useState(0);
  // The 3D viewer shares the page's main thread while it starts: let the review paint and settle first.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled || idle) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let id = 0;
    const t = setTimeout(() => { id = w.requestIdleCallback ? w.requestIdleCallback(() => setIdle(true), { timeout: 1500 }) : (setIdle(true), 0); }, 400);
    return () => { clearTimeout(t); if (id) w.cancelIdleCallback?.(id); };
  }, [enabled, idle]);
  const failed = useRef(new Set<string>());
  const plans = useMemo(() => garments.map(g => {
    const design = g.mockups?.front || g.mockups?.back ? null : mockupDesign(g);
    return { g, design, key: design ? designKey(design) : null };
  }), [garments]);
  const jobs = plans.filter(p => p.key && !drawn.has(p.key) && !failed.current.has(p.key)).map(p => ({ key: p.key!, design: p.design! }));
  const uniqueJobs = jobs.filter((j, i) => jobs.findIndex(x => x.key === j.key) === i);
  const done = useCallback((key: string, shot: { front: string; back: string } | null) => {
    if (shot) drawn.set(key, shot); else failed.current.add(key);
    bump(n => n + 1);
  }, []);
  const giveUp = useCallback((keys: string[]) => { keys.forEach(k => failed.current.add(k)); bump(n => n + 1); }, []);
  const shots: Mockup[] = plans.map(({ g, key }) => {
    if (g.mockups?.front || g.mockups?.back) return { state: 'done', front: g.mockups.front ?? null, back: g.mockups.back ?? null, source: 'given' };
    if (key) {
      const shot = drawn.get(key);
      if (shot) return { state: 'done', ...shot, source: '3d' };
      if (!failed.current.has(key)) return { state: 'drawing' };
      // Could not be drawn here: the design's saved picture as the front, when it is of this garment.
      const own = rowGarmentOf(g.project!.garment) === g.garment ? projectPicture(g.project) : null;
      return own ? { state: 'done', front: own, back: null, source: 'picture' } : { state: 'failed' };
    }
    const own = g.project && rowGarmentOf(g.project.garment) === g.garment ? projectPicture(g.project) : null;
    if (own) return { state: 'done', front: own, back: null, source: 'picture' };
    const art = g.artwork?.map(artworkPicture).find(Boolean);
    return art ? { state: 'done', front: art, back: null, source: 'artwork' } : { state: 'none' };
  });
  const renderer = enabled && idle && uniqueJobs.length ? <MockupRenderer key="renderer" jobs={uniqueJobs} onDone={done} onGiveUp={giveUp} /> : null;
  return { shots, renderer, drawing: shots.some(m => m.state === 'drawing') };
}

/**
 * The viewer's opening turn (the kit swings in over 1.4 s of animation time) has to finish before the first picture, or
 * the front comes out turned. Its animation clock slows down when frames are slow (more than 0.5 s apart counts as one
 * 33 ms step), so count that clock in the viewer's own frames from when it is ready, rather than wall time.
 */
function waitTurnSettled(host: HTMLElement | null, signal: { live: boolean }): Promise<void> {
  return new Promise(resolve => {
    const started = Date.now();
    let win: Window | null = null, last = 0, clock = 0;
    // Whatever happens to the viewer's frames (a reload, a hidden tab), go on after 20 s.
    setTimeout(resolve, 20000);
    const frame = (now: number) => {
      if (!signal.live) return resolve();
      if (last) { const gap = now - last; clock += gap > 500 ? 33 : gap; }
      last = now;
      if (clock >= 1600 || Date.now() - started > 15000) resolve(); else win!.requestAnimationFrame(frame);
    };
    const look = () => {
      if (!signal.live) return resolve();
      try {
        const iframe = host?.querySelector('iframe');
        if (iframe?.contentDocument?.body?.classList.contains('ready')) { win = iframe.contentWindow; win!.requestAnimationFrame(frame); return; }
      } catch { /* not readable: fall back to a fixed wait */ setTimeout(resolve, 1600); return; }
      if (Date.now() - started > 90000) resolve(); else setTimeout(look, 100);
    };
    look();
  });
}

/** One hidden KitViewer: draws the first job's front and back, then the next (the design changes in place). */
function MockupRenderer({ jobs, onDone, onGiveUp }: { jobs: { key: string; design: Design }[]; onDone: (key: string, shot: { front: string; back: string } | null) => void; onGiveUp: (keys: string[]) => void }) {
  const viewer = useRef<KitViewerHandle>(null);
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const job = jobs[0];
  const all = useRef(jobs); all.current = jobs;
  // The viewer never came up (no WebGL, say): show the fallbacks instead of waiting for ever.
  useEffect(() => { if (ready) return; const t = setTimeout(() => onGiveUp(all.current.map(j => j.key)), 75000); return () => clearTimeout(t); }, [ready, onGiveUp]);
  useEffect(() => { const signal = { live: true }; void waitTurnSettled(host.current, signal).then(() => { if (signal.live) setSettled(true); }); return () => { signal.live = false; }; }, []);
  useEffect(() => {
    if (!ready || !settled || !job) return;
    let live = true;
    (async () => {
      try {
        const front = await viewer.current!.capture('front'), back = await viewer.current!.capture('back');
        if (live) onDone(job.key, { front, back });
      } catch { if (live) onDone(job.key, null); }
    })();
    return () => { live = false; };
  }, [ready, settled, job?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!job) return null;
  // `inert`: hidden from screen readers and never focused (it only draws the pictures).
  return <div ref={host} className="orm-capture" aria-hidden inert><KitViewer ref={viewer} design={job.design} onReady={() => setReady(true)} /></div>;
}

/* ================================================================================================ the large viewer */

interface View { label: string; src: string | null }
/** "View full size": the garment's FRONT and BACK large, with zoom; Escape or X closes it. */
export function MockupLightbox({ title, views, start = 0, zoomed = false, staff = false, onClose }: { title: string; views: View[]; start?: number; zoomed?: boolean; /** Staff wording for a missing picture. */ staff?: boolean; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const [zoom, setZoom] = useState(zoomed);
  const close = useRef<HTMLButtonElement>(null);
  const closing = useRef(onClose); closing.current = onClose;
  const count = views.length;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closing.current();
      if (e.key === 'ArrowRight') setAt(a => Math.min(count - 1, a + 1));
      if (e.key === 'ArrowLeft') setAt(a => Math.max(0, a - 1));
    };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; before?.focus?.(); };
  }, [count]);
  const view = views[at];
  return <div className="orm-lightbox" role="dialog" aria-modal="true" aria-label={`${title}: ${view?.label ?? ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="orm-lightbox-card">
      <div className="orm-lightbox-head">
        <strong>{title}</strong>
        <div className="orm-lightbox-tabs" role="tablist">{views.map((v, i) => <button key={v.label} type="button" role="tab" aria-selected={i === at} className={i === at ? 'is-on' : ''} onClick={() => setAt(i)}>{v.label}</button>)}</div>
        <button type="button" className="orm-icon" onClick={() => setZoom(z => !z)} aria-label={zoom ? 'Zoom out' : 'Zoom in'} title={zoom ? 'Zoom out' : 'Zoom in'}>{zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}</button>
        <button ref={close} type="button" className="orm-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className={`orm-lightbox-body${zoom ? ' is-zoomed' : ''}`}>
        {view?.src ? <img src={view.src} alt={`${title}, ${view.label.toLowerCase()}`} onClick={() => setZoom(z => !z)} /> : <Placeholder big staff={staff} />}
      </div>
    </div>
  </div>;
}

/** Staff (the admin order page) see what to do instead of the customer's promise. */
const STAFF_PLACEHOLDER = 'No mockup yet: prepare it from the artwork';
function Placeholder({ big = false, drawing = false, staff = false }: { big?: boolean; drawing?: boolean; staff?: boolean }) {
  return <div className={`orm-placeholder${big ? ' is-big' : ''}`}>
    {drawing ? <><LoaderCircle className="spin" size={22} /><span>Drawing the mockup…</span></> : <><Shirt size={big ? 54 : 34} strokeWidth={1.3} /><span>{staff ? STAFF_PLACEHOLDER : 'Mockup prepared by 3DEEZI after you approve'}</span></>}
  </div>;
}

/** A FRONT or BACK tile: the picture, a zoom button, the tab and "View full size ↗". */
function MockupTile({ label, src, drawing, artwork, garment, staff = false, onOpen }: { label: string; src: string | null | undefined; drawing: boolean; artwork?: boolean; garment: string; staff?: boolean; onOpen: (zoom: boolean) => void }) {
  return <figure className={`orm-tile${src ? '' : ' is-empty'}`}>
    <div className="orm-tile-pic">
      {src ? <img src={src} alt={`${garment}, ${label.toLowerCase()}`} loading="lazy" className={artwork ? 'is-art' : undefined} /> : <Placeholder drawing={drawing} staff={staff} />}
      {src && <button type="button" className="orm-icon orm-tile-zoom" onClick={() => onOpen(true)} aria-label={`Zoom into the ${label.toLowerCase()} of ${garment}`} title="Zoom"><ZoomIn size={17} /></button>}
    </div>
    <figcaption>
      <span className="orm-tab">{label}</span>
      {src && <button type="button" className="orm-full" onClick={() => onOpen(false)}>View full size <ArrowUpRight size={14} /></button>}
    </figcaption>
  </figure>;
}

/* ================================================================================================ the pieces */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The chip under the title: "3 garment styles · 90 garments". */
export function ReviewSummaryChip({ garments }: { garments: ReviewGarment[] }) {
  const total = garments.reduce((a, g) => a + garmentQty(g.sizes), 0);
  return <span className="orm-chip" data-testid="review-summary"><Shirt size={17} aria-hidden="true" />{summaryText(garments.length, total)}</span>;
}

/** One garment style: header with Edit garment, FRONT / BACK mockups, picture, name, colours · fit, sizes, players. */
export function GarmentReviewSection({ garment: g, index, mockup, sizeOrder, onEdit, staff = false }: { garment: ReviewGarment; index: number; mockup: Mockup; sizeOrder?: string[]; onEdit?: () => void; /** The admin order page: staff wording for missing mockups. */ staff?: boolean }) {
  const [open, setOpen] = useState<{ at: number; zoom: boolean } | null>(null);
  const rows = orderedSizes(g.sizes, sizeOrder);
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const players = g.players ?? [];
  const number = String(index + 1).padStart(2, '0');
  const artwork = mockup.source === 'artwork';
  const views: View[] = [{ label: artwork ? 'ARTWORK' : 'FRONT', src: mockup.front ?? null }, { label: 'BACK', src: mockup.back ?? null }];
  const drawing = mockup.state === 'drawing';
  // The garment in its own design (the drawn front, zoomed in) when there is one; else its picture.
  const shot = (mockup.source === '3d' || mockup.source === 'given') && mockup.front ? mockup.front : null;
  return <section className="orm-section" aria-labelledby={`orm-h-${g.key}`} data-testid="garment-section">
    <header className="orm-section-head">
      <h3 id={`orm-h-${g.key}`}><span className="orm-num">{number}</span><span className="orm-dash" aria-hidden="true">—</span>{g.name}</h3>
      {onEdit && <button type="button" className="orm-link" onClick={onEdit}><Pencil size={15} /> Edit garment</button>}
    </header>
    <div className="orm-section-body">
      <div className="orm-tiles">
        {views.map((v, i) => <MockupTile key={v.label} label={v.label} src={v.src} drawing={drawing} artwork={artwork && i === 0} garment={g.name} staff={staff} onOpen={zoom => setOpen({ at: i, zoom })} />)}
      </div>
      <div className="orm-info">
        <div className="orm-garment">
          <span className="orm-thumb">{shot ? <img src={shot} alt="" className="is-shot" /> : g.thumbnail ? <img src={g.thumbnail} alt="" /> : <GarmentIcon garment={g.garment} />}</span>
          <span className="orm-garment-text"><strong>{g.name}</strong>{g.detail && <small>{g.detail}</small>}</span>
        </div>
        {(mockup.source === 'artwork' || mockup.state === 'none' || mockup.state === 'failed') && <p className="orm-note">{staff ? `${artwork ? "The customer's uploaded artwork. " : ''}${STAFF_PLACEHOLDER}.` : `${artwork ? 'Your uploaded artwork. ' : ''}3DEEZI prepares the final mockups after you approve.`}</p>}
        <table className="orm-sizes">
          <thead><tr><th scope="col">Size</th><th scope="col">Qty</th></tr></thead>
          <tbody>{rows.map(([s, n]) => <tr key={s}><td>{s}</td><td>{n}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td data-testid="garment-total">{total}</td></tr></tfoot>
        </table>
        {players.length > 0 && <details className="orm-players">
          <summary><ChevronDown size={15} aria-hidden="true" /> {plural(players.length, 'player', 'players')} · names &amp; numbers</summary>
          <div className="orm-players-wrap"><table>
            <thead><tr><th scope="col">Name</th><th scope="col">Number</th><th scope="col">Size</th></tr></thead>
            <tbody>{players.map((p, i) => <tr key={i}><td>{p.name || '—'}</td><td>{p.number || '—'}</td><td>{p.size || '—'}</td></tr>)}</tbody>
          </table></div>
        </details>}
      </div>
    </div>
    {open && <MockupLightbox title={`${number} — ${g.name}`} views={views} start={open.at} zoomed={open.zoom} staff={staff} onClose={() => setOpen(null)} />}
  </section>;
}

/** ORDER TOTALS: garment styles, total garments, and the price (the breakdown when known, in A$). */
export function OrderTotalsCard({ garments, quote, quoteLoading = false, quoteError = '' }: { garments: ReviewGarment[]; quote?: Quote | null; quoteLoading?: boolean; quoteError?: string }) {
  const total = garments.reduce((a, g) => a + garmentQty(g.sizes), 0);
  const breakdown = !!quote && quote.status === 'priced';
  return <section className="orm-card orm-totals" aria-labelledby="orm-totals-h">
    <h3 id="orm-totals-h" className="orm-card-title">Order totals</h3>
    <dl className="orm-dl">
      <div><dt>Garment styles</dt><dd data-testid="total-styles">{garments.length}</dd></div>
      <div><dt>Total garments</dt><dd data-testid="total-garments">{total}</dd></div>
      <div className={`orm-pricing${breakdown ? ' is-priced' : ''}`}><dt>Pricing</dt><dd data-testid="order-pricing">
        {quoteError ? <span className="orm-error">The price couldn’t be worked out ({quoteError}). 3DEEZI confirms it after review.</span>
          : quote ? <QuoteBreakdown quote={quote} updating={quoteLoading} />
          : quoteLoading ? <span className="orm-wait"><LoaderCircle className="spin" size={15} /> Working out your price…</span>
          : 'Pricing pending confirmation.'}
      </dd></div>
    </dl>
  </section>;
}

/** The quote's lines, shipping, discounts, subtotal, tax and TOTAL; or "Quote required" with the reasons. */
function QuoteBreakdown({ quote, updating }: { quote: Quote; updating: boolean }) {
  const c = quote.currency;
  if (quote.status === 'quote_required') return <div className="orm-quote is-required"><strong>Quote required</strong>
    {quote.reasons.length > 0 && <ul>{quote.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>}
    <span>Approve your order and 3DEEZI confirms the price, then emails your invoice.</span></div>;
  return <div className={`orm-quote${updating ? ' is-updating' : ''}`} aria-busy={updating}>
    <ul className="orm-quote-lines">{[...quote.lines, ...quote.extras].map(r => <li key={r.key}>
      <span>{r.name}<small>{r.quantity} × {r.priced ? aud(r.unit_price, c) : 'price to be confirmed'}</small></span><b>{r.priced ? aud(r.total, c) : 'To be confirmed'}</b>
    </li>)}</ul>
    <ul className="orm-quote-sums">
      {quote.shipping && <li><span>Shipping{quote.shipping.name ? ` · ${quote.shipping.name}` : ''}</span><b>{quote.shipping.priced ? aud(quote.shipping.amount, c) : 'To be confirmed'}</b></li>}
      {quote.discounts.map(d => <li key={d.name + d.code} className="is-discount"><span>{d.name}{d.code ? ` (${d.code})` : ''}</span><b>-{aud(d.amount, c)}</b></li>)}
      <li><span>Subtotal</span><b>{aud(quote.subtotal, c)}</b></li>
      <li><span>{quote.tax.name} {quote.tax.applies ? `(${Number(quote.tax.rate)}%${quote.tax.included ? ', included' : ''})` : '(not applicable)'}</span><b>{aud(quote.tax.amount, c)}</b></li>
    </ul>
    <div className="orm-quote-total"><span>Total</span><b data-testid="order-total">{aud(quote.total, c)}</b></div>
    {quote.discount_code && !quote.discount_code.valid && quote.discount_code.message && <p className="orm-error">{quote.discount_code.message}</p>}
  </div>;
}

/**
 * "Download review PDF": every garment with its mockups, sizes and players, then delivery, notes and totals.
 * Without `mockups` it draws them itself when pressed (a saved order's page); with them (the review page's) it waits
 * for the ones still drawing. `title` / `reference` / `priceRows`: e.g. 'APPROVED ORDER', the order number, the invoice.
 */
export function DownloadReviewPdf({ mockups, filename, label = 'Download review PDF', className = '', ...input }: Omit<ReviewPdfInput, 'mockups'> & { mockups?: Mockup[]; filename?: string; label?: string; className?: string }) {
  const [wanted, setWanted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = useGarmentMockups(input.garments, !mockups && wanted);
  const shots = mockups ?? own.shots;
  const drawing = shots.some(m => m.state === 'drawing');
  const latest = useRef({ input, shots, filename });
  latest.current = { input, shots, filename };
  useEffect(() => {
    if (!wanted || drawing) return;
    setWanted(false); setBusy(true);
    const { input: data, shots: pictures, filename: name } = latest.current;
    downloadReviewPdf({ ...data, mockups: pictures }, name)
      .catch(e => setError((e as Error).message || 'The PDF could not be made. Please try again.'))
      .finally(() => setBusy(false));
  }, [wanted, drawing]);
  const working = busy || wanted;
  return <span className={`orm-pdf ${className}`}>
    <button type="button" className="orm-outline" onClick={() => { setError(''); setWanted(true); }} disabled={working} aria-busy={working}>
      {working ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />} {wanted && drawing ? 'Preparing mockups…' : busy ? 'Making the PDF…' : label}
    </button>
    {error && <span className="orm-error" role="alert">{error}</span>}
    {own.renderer}
  </span>;
}

/* ================================================================================================ the whole layout */

export interface OrderReviewMultiProps {
  garments: ReviewGarment[];
  /** Edit garment (its index in `garments`); no button without it. */
  onEditGarment?: (index: number, garment: ReviewGarment) => void;
  /** The price (useQuote / the page's quote); none = "Pricing pending confirmation.". */
  quote?: Quote | null; quoteLoading?: boolean; quoteError?: string;
  /** For the review PDF: contact, delivery, notes and the files' names. */
  delivery?: ReviewDelivery;
  /** orders/options `sizes` (the site's size order). */
  sizeOrder?: readonly string[];
}

/**
 * The multiple-garments review in three pieces, for the review page's slots: `toolbar` (the chip and Download review
 * PDF, under the title), `sections` (one per garment style, with the hidden 3D viewer that draws the mockups) and
 * `totals` (ORDER TOTALS, beside the page's DELIVERY & NOTES). They share one set of mockups.
 */
export function useOrderReviewMulti({ garments, onEditGarment, quote, quoteLoading, quoteError, delivery, sizeOrder }: OrderReviewMultiProps) {
  const { shots, renderer, drawing } = useGarmentMockups(garments);
  const order = sizeOrder ? [...sizeOrder] : undefined;
  const toolbar = <div className="orm-summary">
    <ReviewSummaryChip garments={garments} />
    <DownloadReviewPdf garments={garments} mockups={shots} delivery={delivery} quote={quote} sizeOrder={order} />
  </div>;
  const sections = <div className="orm" data-testid="order-review-multi">
    <div className="orm-sections">
      {garments.map((g, i) => <GarmentReviewSection key={g.key} garment={g} index={i} mockup={shots[i]} sizeOrder={order} onEdit={onEditGarment ? () => onEditGarment(i, g) : undefined} />)}
      {!garments.length && <p className="orm-empty">No garments yet. Use Back to Edit to add them.</p>}
    </div>
    {renderer}
  </div>;
  const totals = <OrderTotalsCard garments={garments} quote={quote} quoteLoading={quoteLoading} quoteError={quoteError} />;
  return { toolbar, sections, totals, mockups: shots, drawing };
}

/** All of it in one place: the chip and PDF button, the sections, then `deliveryCard` (if any) beside ORDER TOTALS. */
export function OrderReviewMulti({ deliveryCard, ...props }: OrderReviewMultiProps & { deliveryCard?: ReactNode }) {
  const { toolbar, sections, totals } = useOrderReviewMulti(props);
  return <div className="orm-all">
    {toolbar}
    {sections}
    <div className={`orm-bottom${deliveryCard ? '' : ' is-single'}`}>{deliveryCard}{totals}</div>
  </div>;
}
