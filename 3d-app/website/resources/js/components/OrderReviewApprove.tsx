/**
 * REVIEW & APPROVE ORDER, the client's design (2026-10-22), shared by Upload Your Order (/orders/upload) and
 * Create Order Form (/orders/new). Presentational: each page keeps its own data, drafts, validation and submit, and
 * hands this its garments, files, delivery details and callbacks. Styles: resources/css/order-review.css.
 *
 *  - ReviewApproveHeader  Home / Orders / Review, REVIEW & APPROVE ORDER, its line, and the 3-step bar
 *                         (Upload files → Review & approve → Order sent).
 *  - OrderReviewApprove   the review. Under the title, the "N garment styles · M garments" chip and Download review
 *                         PDF (agent U4, components/OrderReviewGarments.tsx). layoutFor(rows) picks the body:
 *                         'kit' (one matching kit, review-approve-spec.md): FINAL MOCKUPS (front and back of the
 *                         whole kit, zoom, View full size, Uploaded files), SELECTED GARMENTS with SIZES & QUANTITIES
 *                         (size × garment, TOTAL, "N matching kits · M garments", players) and DELIVERY & NOTES;
 *                         'multi' (review-approve-multi-spec.md): U4's section per garment style, then DELIVERY & NOTES
 *                         beside U4's ORDER TOTALS. Both end with the confirm card (Back to Edit, Approve Order,
 *                         disabled until the box is ticked).
 *  - OrderSentPanel       step 3: the order number, View my order, Pay now, start another.
 *  - paymentPath          where Approve Order goes: agent U5's COMPLETE YOUR PAYMENT page (/orders/{number}/pay).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleAlert, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Images, LoaderCircle, Pencil, Shirt, Users, X, ZoomIn, ZoomOut } from 'lucide-react';
import { media, type Project } from '../api';
import { provideAssistContext } from '../assistBridge';
import type { OrderItem } from '../orderApi';
import { KitViewer, defaultDesign, type Design, type KitViewerHandle } from './KitViewer';
import type { Quote as PayQuote } from './OrderPayment';
import { DownloadReviewPdf, ReviewSummaryChip, reviewGarmentsFrom, reviewLayoutFor, useOrderReviewMulti, type ReviewDelivery as MultiDelivery, type ReviewGarment as MultiGarment } from './OrderReviewGarments';
import '../../css/order-review.css';

/* ================================================================================================ shapes */

export interface ReviewPlayer { name: string; number: string; size?: string | null }
/** One garment of the order, as the review shows it. */
export interface ReviewGarment {
  key: string;
  /** The garment id (jersey, singlet, shorts …): its picture, its column name and whether it is part of a kit. */
  garment: string;
  /** "Basketball singlet". */
  name: string;
  /** The column heading in SIZES & QUANTITIES ("SINGLETS"); made from the garment when not given. */
  column?: string;
  /** The line under the name ("Mens fit · Design: MANTIS 86"); the colours go in front of it. */
  sub?: string;
  /** The design's colours (hex), shown as swatches with their names ("Black / Cyan"). */
  colours?: (string | null | undefined)[];
  thumb?: string | null;
  sizes: Record<string, number>;
  players?: ReviewPlayer[] | null;
}
/** A file of the order (an OrderFile, or a row still on the page). */
export interface ReviewFile { id: number | string; name: string; kind?: string; extension?: string; size?: number; thumb?: string | null; preview?: string | null; download?: string }
export interface ReviewAddress { street?: string; suburb?: string; state?: string; postcode?: string; country?: string }
/** DELIVERY & NOTES (the delivery fields come from the upload draft, agent U1). */
export interface ReviewDelivery {
  contactName: string; team?: string; email?: string; phone?: string;
  neededBy?: string | null; method?: 'deliver' | 'pickup' | null; address?: ReviewAddress | string | null; notes?: string;
  /** The page's own wording of the date ("Fri 4 Dec 2026"); otherwise it is written here. */
  neededByText?: string;
  /** Shown under the mobile when the page's check finds it wrong. */
  phoneProblem?: string | null;
}
/** The saved design an order is made from: its front and back are drawn by the 3D viewer, as on the admin kit page. */
export interface ReviewDesign {
  /** Changes when the design does (project id and save time): the pictures are drawn again. */
  id: string;
  name?: string; garment: string; design: Partial<Design> & { renderFront?: string | null; renderBack?: string | null };
  thumbnail?: string | null;
  /** The first player's name and number, printed on the back of the mockup. */
  back?: { name?: string; number?: string } | null;
}
export type ReviewLayout = 'kit' | 'multi';

/** Where Approve Order goes once the order and invoice exist: agent U5's COMPLETE YOUR PAYMENT page. */
export const PAYMENT_PAGE_LIVE = true;
export const paymentPath = (order: { number: string; id: number }) => (PAYMENT_PAGE_LIVE ? `/orders/${encodeURIComponent(order.number || String(order.id))}/pay` : null);

/* ================================================================================================ helpers */

const WORDS: Record<string, string> = { jersey: 'Jerseys', shorts: 'Shorts', tee: 'Tees', singlet: 'Singlets', polo: 'Polos', hoodie: 'Hoodies', jacket: 'Jackets', warmup: 'Warm-up tops', pants: 'Track pants', socks: 'Socks', cap: 'Caps' };
/** Garments with a picture (public/media/showroom/garment-<id>.webp). */
const PICTURED = new Set(['jersey', 'shorts', 'tee', 'singlet', 'polo', 'socks', 'hoodie']);
export const garmentThumb = (garment: string) => (PICTURED.has(garment) ? media(`showroom/garment-${garment}.webp`) : null);
const TOPS = new Set(['jersey', 'singlet', 'tee', 'polo', 'hoodie', 'jacket', 'warmup', 'fullkit']);
const BOTTOMS = new Set(['shorts', 'pants']);
const SITE_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];
const NO_GARMENTS: MultiGarment[] = [];
const PICTURES = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const SHEETS = ['xlsx', 'xls', 'csv', 'ods'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const garmentTotal = (sizes: Record<string, number>) => Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0);
const extOf = (f: ReviewFile) => (f.extension || f.name.split('.').pop() || '').toLowerCase();
const isPicture = (src: unknown): src is string => typeof src === 'string' && /^(data:image\/|blob:|https?:\/\/|\/)/.test(src);

/** A youth size as order forms write them: 8, Y10, 12Y, Youth 14, Kids 6, Age 8, 10 yrs. */
export const isYouthSize = (s: string) => /^(y|yth|youth|k|kid|kids|age|size)?\s*-?\s*\d{1,2}\s*(y|yr|yrs|years?|k)?$/i.test(s.trim());

/**
 * The sizes ordered, in the site's order (XS … 4XL, Kids), then any other size the order form had: youth sizes
 * (Y8, 10, Youth 12 …) by number, then the rest alphabetically. Only sizes with a quantity.
 */
export function reviewSizes(garments: Pick<ReviewGarment, 'sizes'>[], siteOrder: readonly string[] = SITE_SIZES): string[] {
  const used = new Set<string>();
  for (const g of garments) for (const [s, n] of Object.entries(g.sizes)) if ((Number(n) || 0) > 0) used.add(s);
  const known = siteOrder.filter(s => used.has(s));
  const youth = isYouthSize;
  const num = (s: string) => Number(s.match(/\d+/)?.[0] ?? 0);
  const rest = [...used].filter(s => !siteOrder.includes(s)).sort((a, b) => {
    const ya = youth(a), yb = youth(b);
    if (ya !== yb) return ya ? -1 : 1;
    return ya ? num(a) - num(b) : a.localeCompare(b);
  });
  return [...known, ...rest];
}

/**
 * The Kids count split into the youth sizes the order form wrote ("10Y" 3, "12Y" 2), when those add up to it; otherwise
 * the sizes as they are. Only for showing: the order keeps its sizes (XS … 4XL, Kids).
 */
export function youthSplit(sizes: Record<string, number>, formSizes?: Record<string, number> | null): Record<string, number> {
  const kids = Number(sizes.Kids) || 0;
  if (!kids || !formSizes) return sizes;
  const youth = Object.entries(formSizes).filter(([s, n]) => isYouthSize(s) && (Number(n) || 0) > 0);
  if (!youth.length || youth.reduce((a, [, n]) => a + Number(n), 0) !== kids) return sizes;
  const { Kids: _kids, ...rest } = sizes;
  return { ...rest, ...Object.fromEntries(youth.map(([s, n]) => [s.trim().toUpperCase(), Number(n)])) };
}

/**
 * Kits: when the garments make a kit (at least one top and one bottom: a singlet with shorts, a jersey with shorts),
 * the number of kits is the smallest garment total among them (each kit needs one of each); "matching" when every
 * one of them has the same sizes. Socks, caps and the like count as garments, not as kit parts. Otherwise null.
 */
export function kitCount(garments: Pick<ReviewGarment, 'garment' | 'sizes'>[]): { kits: number; matching: boolean } | null {
  const parts = garments.filter(g => TOPS.has(g.garment) || BOTTOMS.has(g.garment));
  if (!parts.some(g => TOPS.has(g.garment)) || !parts.some(g => BOTTOMS.has(g.garment))) return null;
  const kits = Math.min(...parts.map(g => garmentTotal(g.sizes)));
  const key = (s: Record<string, number>) => JSON.stringify(Object.keys(s).filter(k => (Number(s[k]) || 0) > 0).sort().map(k => [k, Number(s[k])]));
  return { kits, matching: parts.every(g => key(g.sizes) === key(parts[0].sizes)) };
}
/** The order rows as the review takes them (OrderItem, with the form's row key and its artwork's file ids). */
export type ReviewRow = OrderItem & { key?: string; file_ids?: (number | string)[] };
/**
 * Which layout the review uses: U4's rule (reviewLayoutFor: 'kit' for a top and shorts from ONE saved design with the
 * same sizes), refined here (U3) for the upload path: a top and shorts with the same sizes and no saved design on
 * either is one kit too (the client's single-kit picture is an upload), and no rows at all (nothing read from the
 * order form yet) shows the kit layout's empty state with the files. Everything else is 'multi'.
 */
export function layoutFor(rows: ReviewRow[] | null | undefined): ReviewLayout {
  const sent = (rows ?? []).filter(r => garmentTotal(r.sizes) > 0);
  if (!sent.length) return 'kit';
  if (reviewLayoutFor({ items: sent }) === 'kit') return 'kit';
  if (sent.length !== 2 || sent.some(r => r.project_id)) return 'multi';
  const top = sent.find(r => ['jersey', 'tee', 'singlet', 'polo'].includes(r.garment)), shorts = sent.find(r => r.garment === 'shorts');
  return top && shorts && kitCount(sent)?.matching ? 'kit' : 'multi';
}

/** "30 matching kits · 60 garments", "12 kits · 26 garments" or "18 garments". */
export function kitLine(garments: Pick<ReviewGarment, 'garment' | 'sizes'>[]): string {
  const total = garments.reduce((n, g) => n + garmentTotal(g.sizes), 0), kit = kitCount(garments);
  const all = plural(total, 'garment');
  return kit && kit.kits > 0 ? `${plural(kit.kits, kit.matching ? 'matching kit' : 'kit')} · ${all}` : all;
}

const NAMED: [string, number, number, number][] = [
  ['Black', 10, 10, 12], ['White', 250, 250, 250], ['Grey', 128, 132, 140], ['Silver', 196, 200, 206], ['Charcoal', 52, 58, 66],
  ['Navy', 16, 30, 90], ['Royal blue', 40, 80, 220], ['Sky blue', 120, 190, 240], ['Cyan', 0, 215, 235], ['Teal', 0, 128, 128],
  ['Green', 20, 140, 60], ['Lime', 150, 220, 40], ['Yellow', 250, 215, 20], ['Gold', 200, 160, 50], ['Orange', 250, 130, 20],
  ['Red', 215, 25, 40], ['Maroon', 120, 15, 35], ['Pink', 245, 110, 175], ['Purple', 110, 40, 150], ['Violet', 150, 80, 250], ['Brown', 120, 72, 36],
];
/** A colour's everyday name ("Black", "Cyan"), the nearest of a short list. */
export function colourName(hex: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  let best = NAMED[0], score = Infinity;
  for (const c of NAMED) { const d = 2 * (r - c[1]) ** 2 + 4 * (g - c[2]) ** 2 + 3 * (b - c[3]) ** 2; if (d < score) { score = d; best = c; } }
  return best[0];
}
const cleanColours = (list?: (string | null | undefined)[]) => [...new Set((list ?? []).filter((c): c is string => typeof c === 'string' && !!colourName(c)))].slice(0, 3);

function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
export function addressText(a?: ReviewAddress | string | null) {
  if (!a) return '';
  if (typeof a === 'string') return a.trim();
  return [a.street, [a.suburb, a.state, a.postcode].filter(v => v && v.trim()).join(' '), a.country].map(v => (v ?? '').trim()).filter(Boolean).join(', ');
}
const sizeText = (bytes?: number) => (!bytes ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The first page of a PDF as a picture (pdf.js, loaded only when needed; read on the page, no worker file). */
async function pdfFirstPage(blob: Blob, width = 1400): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // @ts-ignore: the worker build has no types; pdf.js runs it on the page when it is set as globalThis.pdfjsWorker.
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs');
  const g = globalThis as unknown as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, width / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { void task.destroy(); }
}

/* ================================================================================================ header */

const STEPS_UPLOAD = ['Upload files', 'Review & approve', 'Order sent'];

/** The 3-step bar: done steps show a check, the current one is cyan. `current` is 0-based; 3 = all done. */
export function ReviewStepBar({ current, steps = STEPS_UPLOAD }: { current: number; steps?: string[] }) {
  return <ol className="ora-steps" aria-label="Order steps">
    {steps.map((label, i) => {
      const done = i < current, now = i === current;
      return <li key={label} className={done ? 'is-done' : now ? 'is-current' : ''} aria-current={now ? 'step' : undefined}>
        <span className="ora-step-dot" aria-hidden="true">{done ? <Check size={17} strokeWidth={3} /> : i + 1}</span>
        <span className="ora-step-label">{label}<span className="op-sr">{done ? ' (done)' : now ? ' (current step)' : ''}</span></span>
      </li>;
    })}
  </ol>;
}

/** Home / Orders / Review, the title and its line beside the step bar, then the toolbar row (chip, Download review PDF). */
export function ReviewApproveHeader({ step, firstStep = 'Upload files', crumb, title, subtitle, toolbar, layout = 'kit' }: {
  step: 'review' | 'sent'; firstStep?: string; crumb?: string; title?: ReactNode; subtitle?: ReactNode; toolbar?: ReactNode; layout?: ReviewLayout;
}) {
  const sent = step === 'sent';
  return <header className="ora-head">
    <div className="ora-head-main">
      <div className="ora-head-text">
        <nav className="op-crumbs" aria-label="Breadcrumb"><ol>
          <li><Link to="/">Home</Link></li><li><Link to="/orders">Orders</Link></li><li aria-current="page">{crumb ?? (sent ? 'Order sent' : 'Review')}</li>
        </ol></nav>
        <h1>{title ?? (sent ? 'Order sent' : 'Review & approve order')}</h1>
        <p>{subtitle ?? (sent ? 'Your order is with 3DEEZI.' : layout === 'multi' ? 'Review every garment, size and final mockup before approving.' : 'Check your order details, mockups and quantities before submitting to 3DEEZI.')}</p>
      </div>
      <ReviewStepBar current={sent ? 3 : 1} steps={[firstStep, STEPS_UPLOAD[1], STEPS_UPLOAD[2]]} />
    </div>
    {toolbar && <div className="ora-toolbar">{toolbar}</div>}
  </header>;
}

/* ================================================================================================ mockups */

interface Shot { key: string; tab: string; alt: string; src: string | null; state: 'ready' | 'drawing' | 'empty'; full?: () => Promise<string | null> }

/** Front and back of the saved design, drawn by the 3D viewer off screen (as the admin kit page does). */
function useDesignShots(source: ReviewDesign | null | undefined) {
  const viewer = useRef<KitViewerHandle>(null);
  const [cap, setCap] = useState<{ id?: string; front?: string; back?: string; state: 'drawing' | 'done' | 'failed' }>({ state: 'drawing' });
  const busy = useRef(false);
  const id = source?.id;
  useEffect(() => {
    busy.current = false;
    setCap({ id, state: 'drawing' });
    if (!id) return;
    // No viewer (no WebGL, blocked): the saved pictures after a while.
    const t = setTimeout(() => setCap(c => (c.id === id && c.state === 'drawing' ? { id, state: 'failed' } : c)), 40000);
    return () => clearTimeout(t);
  }, [id]);
  const design = useMemo<Design | null>(() => {
    if (!source) return null;
    const d = source.design ?? {}, back = source.back;
    const printed: Partial<Design> = back && (back.name || back.number) ? { ...(back.name ? { backName: back.name } : {}), ...(back.number ? { number: back.number } : {}) } : {};
    return { ...defaultDesign, ...d, garment: source.garment as Design['garment'], ...printed } as Design;
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function draw() {
    if (busy.current || !viewer.current) return;
    busy.current = true;
    try {
      const front = await viewer.current.capture('front');
      const back = await viewer.current.capture('back');
      setCap({ id, front, back, state: 'done' });
    } catch { setCap({ id, state: 'failed' }); }
  }
  const saved = source?.design ?? {};
  const fallbackFront = [saved.renderFront, source?.thumbnail].find(isPicture) ?? null;
  const fallbackBack = isPicture(saved.renderBack) ? saved.renderBack : null;
  const drawing = !!source && cap.state === 'drawing';
  const shots: Shot[] = source ? [
    { key: 'front', tab: 'Front', alt: `Front of ${source.name ?? 'your kit'}`, src: cap.front ?? (cap.state === 'failed' ? fallbackFront : null), state: drawing ? 'drawing' : cap.front || (cap.state === 'failed' && fallbackFront) ? 'ready' : 'empty' },
    { key: 'back', tab: 'Back', alt: `Back of ${source.name ?? 'your kit'}`, src: cap.back ?? (cap.state === 'failed' ? fallbackBack : null), state: drawing ? 'drawing' : cap.back || (cap.state === 'failed' && fallbackBack) ? 'ready' : 'empty' },
  ] : [];
  const drawer = drawing && design ? <div className="kit-capture" aria-hidden><KitViewer ref={viewer} design={design} onReady={() => void draw()} /></div> : null;
  return { shots, drawer };
}

/** Up to two uploaded artwork pictures (PNG / JPG / WebP / GIF, or a PDF's first page) as the mockup tiles. */
function useArtworkShots(files: ReviewFile[], fetchFull?: (f: ReviewFile) => Promise<Blob>) {
  const usable = files.filter(f => PICTURES.includes(extOf(f)) || (extOf(f) === 'pdf' && (isPicture(f.thumb) || !!fetchFull))).slice(0, 2);
  const [pages, setPages] = useState<Record<string, string | 'failed'>>({});
  const ids = usable.map(f => String(f.id)).join(',');
  useEffect(() => {
    let live = true;
    for (const f of usable) {
      if (extOf(f) !== 'pdf' || isPicture(f.thumb) || !fetchFull || pages[String(f.id)]) continue;
      fetchFull(f).then(b => pdfFirstPage(b)).then(src => { if (live) setPages(p => ({ ...p, [String(f.id)]: src })); })
        .catch(() => { if (live) setPages(p => ({ ...p, [String(f.id)]: 'failed' })); });
    }
    return () => { live = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const shots: Shot[] = usable.flatMap(f => {
    const page = pages[String(f.id)];
    const src = extOf(f) === 'pdf' ? (page && page !== 'failed' ? page : isPicture(f.thumb) ? f.thumb : null) : [f.preview, f.thumb].find(isPicture) ?? null;
    if (extOf(f) === 'pdf' && page === 'failed' && !src) return [];
    const full = fetchFull && f.download && extOf(f) !== 'pdf' ? () => fetchFull(f).then(b => URL.createObjectURL(b)).catch(() => src) : undefined;
    return [{ key: `f${f.id}`, tab: 'Artwork', alt: f.name, src, state: src ? 'ready' as const : 'drawing' as const, full }];
  });
  return shots;
}

/** One tile: the picture, a zoom button in the corner, its tab label and "View full size". */
function MockupTile({ shot, title, onOpen }: { shot: Shot; title: string; onOpen: (zoom: boolean) => void }) {
  return <figure className={`ora-tile${shot.state === 'ready' ? '' : ' is-waiting'}`}>
    <div className="ora-tile-pic">
      {shot.src ? <button type="button" className="ora-tile-open" onClick={() => onOpen(false)} aria-label={`View the ${title.toLowerCase()} full size`}><img src={shot.src} alt={shot.alt} /></button>
        : shot.state === 'drawing' ? <span className="ora-tile-wait"><LoaderCircle className="spin" size={22} /> Drawing the {title.toLowerCase()}…</span>
        : <span className="ora-tile-wait">The {title.toLowerCase()} mockup is prepared by 3DEEZI after you approve.</span>}
      {shot.src && <button type="button" className="ora-zoom" onClick={() => onOpen(true)} aria-label={`Zoom into the ${title.toLowerCase()}`} title="Zoom"><ZoomIn size={18} /></button>}
    </div>
    <figcaption className="ora-tile-foot">
      <span className="ora-tab" title={shot.tab === 'Artwork' ? shot.alt : undefined}>{title}</span>
      {shot.src && <button type="button" className="ora-full" onClick={() => onOpen(false)}>View full size <ExternalLink size={14} /></button>}
    </figcaption>
  </figure>;
}

/** The large viewer: one picture at a time, Fit / Zoom, ← → between pictures, Esc closes. */
function MockupViewer({ shots, start, zoomed, onClose }: { shots: Shot[]; start: number; zoomed: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(zoomed);
  const [full, setFull] = useState<Record<string, string | null>>({});
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const shot = shots[index];
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowRight' && shots.length > 1) setIndex(i => (i + 1) % shots.length);
      if (e.key === 'ArrowLeft' && shots.length > 1) setIndex(i => (i - 1 + shots.length) % shots.length);
    };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; before?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shot?.full || shot.key in full) return;
    let live = true;
    shot.full().then(src => { if (live) setFull(f => ({ ...f, [shot.key]: src })); });
    return () => { live = false; };
  }, [shot?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const src of Object.values(full)) if (src?.startsWith('blob:')) URL.revokeObjectURL(src); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shot) return null;
  const src = full[shot.key] ?? shot.src;
  const label = shot.tab === 'Artwork' ? shot.alt : shot.tab;
  return <div className="ora-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="ora-viewer-bar">
      <strong id={titleId}>{label}</strong>
      {shots.length > 1 && <span className="ora-viewer-count">{index + 1} / {shots.length}</span>}
      <button type="button" className="ora-viewer-btn" onClick={() => setZoom(z => !z)} aria-pressed={zoom}>{zoom ? <><ZoomOut size={17} /> Fit</> : <><ZoomIn size={17} /> Zoom</>}</button>
      <button ref={close} type="button" className="ora-viewer-btn is-close" onClick={onClose} aria-label="Close the large view"><X size={20} /></button>
    </div>
    <div className={`ora-viewer-stage${zoom ? ' is-zoomed' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {src ? <img src={src} alt={shot.alt} onClick={() => setZoom(z => !z)} /> : <span className="ora-tile-wait"><LoaderCircle className="spin" /> Loading…</span>}
    </div>
    {shots.length > 1 && <>
      <button type="button" className="ora-viewer-nav is-prev" onClick={() => setIndex(i => (i - 1 + shots.length) % shots.length)} aria-label="Previous picture"><ChevronLeft size={26} /></button>
      <button type="button" className="ora-viewer-nav is-next" onClick={() => setIndex(i => (i + 1) % shots.length)} aria-label="Next picture"><ChevronRight size={26} /></button>
    </>}
  </div>;
}

function FileGlyph({ file, size = 22 }: { file: ReviewFile; size?: number }) {
  const ext = extOf(file);
  const Icon = SHEETS.includes(ext) ? FileSpreadsheet : PICTURES.includes(ext) ? FileImage : FileText;
  return <Icon size={size} strokeWidth={1.6} />;
}

/** "View files": every file of the order, with a picture where there is one and Download. */
function FilesDialog({ files, onDownload, onClose }: { files: ReviewFile[]; onDownload?: (f: ReviewFile) => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); before?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const kindName = (k?: string) => (k === 'order_form' ? 'Order form' : k === 'artwork' ? 'Artwork' : 'File');
  return <div className="ora-viewer is-files" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="op-card ora-files-card">
      <header><h2 id={titleId}>Uploaded files</h2><button ref={close} type="button" className="ora-viewer-btn is-close" onClick={onClose} aria-label="Close the file list"><X size={20} /></button></header>
      <ul>{files.map(f => <li key={f.id}>
        <span className="ora-file-pic">{[f.preview, f.thumb].find(isPicture) ? <img src={[f.preview, f.thumb].find(isPicture)!} alt="" /> : <FileGlyph file={f} />}</span>
        <span className="ora-file-text"><b title={f.name}>{f.name}</b><small>{[kindName(f.kind), extOf(f).toUpperCase(), sizeText(f.size)].filter(Boolean).join(' · ')}</small></span>
        {onDownload && f.download && <button type="button" className="ora-viewer-btn" onClick={() => onDownload(f)} aria-label={`Download ${f.name}`}><Download size={17} /> Download</button>}
      </li>)}</ul>
    </section>
  </div>;
}

/* ================================================================================================ the review */

export interface OrderReviewApproveProps {
  garments: ReviewGarment[];
  /** The site's size order (GET /orders/options sizes). */
  sizeOrder?: readonly string[];
  /** The saved design the order is made from: FINAL MOCKUPS draws its front and back. */
  design?: ReviewDesign | null;
  /** Uploaded artwork: the mockup tiles when there is no saved design. */
  artwork?: ReviewFile[];
  /** Every file of the order, for the Uploaded files row. */
  files: ReviewFile[];
  filesLabel?: string;
  onDownload?: (f: ReviewFile) => void;
  /** The file itself (signed in), for View full size and a PDF's first page. */
  fetchFile?: (f: ReviewFile) => Promise<Blob>;
  delivery: ReviewDelivery;
  /** Back to the delivery details (none: 3DEEZI confirms delivery with the customer). */
  onEditDelivery?: () => void;
  onEditGarments: () => void;
  /** The editable garments, sizes and players (Upload: the rows read from the order form): shown by Edit sizes & garments. */
  garmentEditor?: ReactNode;
  /** A line under the sizes table (e.g. rows without sizes that 3DEEZI confirms). */
  garmentsNote?: ReactNode;
  /** The price breakdown, when the order is priced. */
  price?: ReactNode;
  /** A line under "Pricing pending confirmation." (e.g. tick the box to see the price now). */
  priceNote?: ReactNode;
  /** Delivery region, extras and a discount code. */
  priceOptions?: ReactNode;
  /** 'kit' (one matching kit: the combined layout) or 'multi' (U4's per-garment sections); layoutFor(rows) when not given. */
  layout?: ReviewLayout;
  /** The order rows: the layout rule, U4's sections, the chip and the review PDF. */
  rows?: ReviewRow[] | null;
  /** The customer's saved designs (GET /projects): U4 draws each garment's own mockups from them. */
  projects?: Project[] | null;
  /** orders/options garment, sport and fit names. */
  options?: { garments?: { id: string; name: string }[]; sports?: { id: string; name: string }[]; fits?: { id: string; name: string }[] } | null;
  /** The price quote, for ORDER TOTALS and the review PDF. */
  quote?: PayQuote | null; quoteLoading?: boolean; quoteError?: string;
  /** "Edit garment" on a section (layout 'multi'), with its index among the rows with sizes; else the garment editor or onEditGarments. */
  onEditGarment?: (index: number) => void;
  /** Shown above the review (an error from the server, lines that could not be read). */
  notice?: ReactNode;
  agreed: boolean; onAgree: (value: boolean) => void;
  busy?: boolean; error?: string;
  onBack: () => void; onApprove: () => void;
  /** What 3DEEZI ASSIST is told about the page; given, the review registers it with its own summary added while it is shown
      (a page that keeps its own context registered all the time leaves this out). */
  assistContext?: () => string;
}

export function OrderReviewApprove(p: OrderReviewApproveProps) {
  const { garments, files, delivery } = p;
  const layout: ReviewLayout = p.layout ?? layoutFor(p.rows);
  const sizes = reviewSizes(garments, p.sizeOrder ?? SITE_SIZES);
  const total = garments.reduce((n, g) => n + garmentTotal(g.sizes), 0);
  const designShots = useDesignShots(p.design);
  const artShots = useArtworkShots(p.design ? [] : p.artwork ?? [], p.fetchFile);
  const shots = p.design ? designShots.shots : artShots;
  const [viewer, setViewer] = useState<{ index: number; zoom: boolean } | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tried, setTried] = useState(false);
  const checkId = useId();
  const latest = useRef(p); latest.current = p;

  // 3DEEZI ASSIST knows what is on the review (and the page's own description), while it is shown.
  useEffect(() => (!latest.current.assistContext ? undefined : provideAssistContext(() => {
    const q = latest.current, g = q.garments, s = reviewSizes(g, q.sizeOrder ?? SITE_SIZES);
    return [q.assistContext?.() ?? '',
      `REVIEW & APPROVE ORDER step: ${g.length} garment${g.length === 1 ? '' : 's'} (${g.map(x => `${x.name}: ${s.filter(z => x.sizes[z]).map(z => `${x.sizes[z]} ${z}`).join(', ') || 'no sizes'}`).join('; ')}). ${kitLine(g)}.`,
      `Mockups: ${q.design ? 'drawn from the saved design' : (q.artwork ?? []).length ? 'from the uploaded artwork' : 'prepared by 3DEEZI after approval'}. Files: ${q.files.length}. Delivery: ${q.delivery.method === 'pickup' ? 'pick up' : addressText(q.delivery.address) ? 'to the address given' : 'not given'}; date required ${q.delivery.neededBy || 'not given'}.`,
      `Confirm box ticked: ${q.agreed ? 'yes' : 'no'}. Approve Order sends the order to 3DEEZI (it stays disabled until the box is ticked); Back to Edit returns to the form; Edit sizes & garments changes the garments and sizes.`,
    ].filter(Boolean).join(' ').slice(0, 2900);
  })), []);

  const editGarments = () => { if (p.garmentEditor) setEditing(true); else p.onEditGarments(); };
  const approve = () => { setTried(true); if (p.agreed && !p.busy) p.onApprove(); };

  // Agent U4's parts: the chip and Download review PDF (both layouts), the per-garment sections and ORDER TOTALS ('multi').
  const multiGarments = useMemo(() => reviewGarmentsFrom({ items: p.rows, projects: p.projects, artwork: p.artwork, options: p.options }), [p.rows, p.projects, p.artwork, p.options]);
  const pdfDelivery: MultiDelivery = { ...delivery, files: files.map(f => f.name) };
  const sizeList = p.sizeOrder ? [...p.sizeOrder] : undefined;
  const multi = useOrderReviewMulti({ garments: layout === 'multi' ? multiGarments : NO_GARMENTS, delivery: pdfDelivery, quote: p.quote, quoteLoading: p.quoteLoading, quoteError: p.quoteError, sizeOrder: p.sizeOrder,
    onEditGarment: i => (p.onEditGarment ? p.onEditGarment(i) : editGarments()) });
  const toolbar = multiGarments.length === 0 ? null : layout === 'multi' ? multi.toolbar
    : <div className="orm-summary"><ReviewSummaryChip garments={multiGarments} /><DownloadReviewPdf garments={multiGarments} delivery={pdfDelivery} quote={p.quote} sizeOrder={sizeList} /></div>;

  const filesRow = <div className="ora-files-row">
    <span className="ora-files-icon"><FileText size={22} strokeWidth={1.6} /></span>
    <span className="ora-files-text"><b>Uploaded files</b><small>{files.length ? `${p.filesLabel ?? 'Order form & artwork'} · ${plural(files.length, 'file')}` : 'No files uploaded'}</small></span>
    {files.length > 0 && <button type="button" className="op-link" onClick={() => setFilesOpen(true)}>View files <ArrowRight size={16} /></button>}
  </div>;

  const mockups = <section className="op-card ora-card ora-mockups" aria-labelledby={`${checkId}-m`}>
    <header className="ora-card-head"><h2 id={`${checkId}-m`}>Final mockups</h2></header>
    {shots.length ? <div className={`ora-tiles${shots.length === 1 ? ' is-single' : ''}`}>
      {shots.map((s, i) => <MockupTile key={s.key} shot={s} title={s.tab === 'Artwork' ? (shots.length > 1 ? `Artwork ${i + 1}` : 'Artwork') : s.tab} onOpen={zoom => setViewer({ index: i, zoom })} />)}
    </div> : <div className="ora-placeholder"><Images size={34} strokeWidth={1.4} /><p><b>Mockups are prepared by 3DEEZI after you approve.</b><span>We draw the front and back of your kit from your files and send them to you to check before anything is made.</span></p></div>}
    {!p.design && shots.length > 0 && <p className="ora-note">Your artwork is shown. 3DEEZI prepares the final mockups from it after you approve.</p>}
    {filesRow}
  </section>;

  const players = garments.flatMap(g => (g.players ?? []).filter(x => x.name?.trim() || x.number).map(x => ({ ...x, garment: g.name })));
  const playerGarments = new Set(players.map(x => x.garment)).size;
  const columnNames = (() => {
    const names = garments.map(g => (g.column ?? WORDS[g.garment] ?? g.name).toUpperCase());
    return names.map((n, i) => (names.filter(x => x === n).length > 1 ? `${n} ${names.slice(0, i + 1).filter(x => x === n).length}` : n));
  })();

  const garmentsCard = <section className="op-card ora-card ora-garments" aria-labelledby={`${checkId}-g`} id="ora-garments">
    <header className="ora-card-head"><h2 id={`${checkId}-g`}>Selected garments</h2>
      <button type="button" className="op-link" onClick={editGarments} aria-haspopup={p.garmentEditor ? 'dialog' : undefined} data-testid="edit-garments"><Pencil size={15} /> Edit sizes &amp; garments</button>
    </header>
    {garments.length ? <ul className="ora-garment-list">{garments.map(g => {
        const colours = cleanColours(g.colours), pic = g.thumb ?? garmentThumb(g.garment);
        const names = colours.map(c => colourName(c)).filter((v, i, a) => v && a.indexOf(v) === i).join(' / ');
        return <li key={g.key}>
          <span className="ora-garment-pic">{pic ? <img src={pic} alt="" loading="lazy" /> : <Shirt size={26} strokeWidth={1.5} />}</span>
          <span className="ora-garment-text"><b>{g.name}</b><small>{colours.length > 0 && <span className="ora-swatches" aria-hidden="true">{colours.map(c => <i key={c} style={{ background: c }} />)}</span>}{[names, g.sub].filter(Boolean).join(' · ') || plural(garmentTotal(g.sizes), 'garment')}</small></span>
          <span className="ora-garment-qty">{garmentTotal(g.sizes)}</span>
        </li>;
      })}</ul> : <p className="ora-empty">No garments read yet. 3DEEZI reads them from your order form and checks them with you.</p>}
      {garments.length > 0 && <>
        <h3 className="ora-sub">Sizes &amp; quantities</h3>
        {sizes.length ? <div className="ora-table-wrap"><table className="ora-sizes">
          <thead><tr><th scope="col">Size</th>{garments.map((g, i) => <th key={g.key} scope="col" title={g.name}>{columnNames[i]}</th>)}</tr></thead>
          <tbody>{sizes.map(s => <tr key={s}><th scope="row">{s}</th>{garments.map(g => <td key={g.key}>{Number(g.sizes[s]) > 0 ? g.sizes[s] : '–'}</td>)}</tr>)}</tbody>
          <tfoot><tr><th scope="row">Total</th>{garments.map(g => <td key={g.key}>{garmentTotal(g.sizes)}</td>)}</tr></tfoot>
        </table></div> : <p className="ora-empty">No sizes yet: 3DEEZI confirms the sizes with you.</p>}
        <p className="ora-kits" data-testid="kit-line">{kitLine(garments)}</p>
        {players.length > 0 && <details className="ora-players">
          <summary><Users size={16} /> Players · {plural(players.length, 'name')} &amp; {players.length === 1 ? 'number' : 'numbers'}</summary>
          <div className="ora-table-wrap"><table><thead><tr><th>Name</th><th>No.</th><th>Size</th>{playerGarments > 1 && <th>Garment</th>}</tr></thead>
            <tbody>{players.map((x, i) => <tr key={i}><td>{x.name?.trim() || '—'}</td><td>{x.number || '—'}</td><td>{x.size || '—'}</td>{playerGarments > 1 && <td>{x.garment}</td>}</tr>)}</tbody></table></div>
        </details>}
      </>}
      {p.garmentsNote}
  </section>;

  const address = addressText(delivery.address);
  const deliveryLink = p.onEditDelivery && <button type="button" className="op-link ora-inline-link" onClick={p.onEditDelivery}>{delivery.method === 'pickup' || address ? 'Review delivery details' : 'Add delivery details'} <ArrowRight size={15} /></button>;
  const priced = !!p.price;
  const deliveryCard = <section className="op-card ora-card ora-delivery" aria-labelledby={`${checkId}-d`}>
    <header className="ora-card-head"><h2 id={`${checkId}-d`}>Delivery &amp; notes</h2></header>
    <dl className="ora-facts">
      <div><dt>Contact</dt><dd>{[delivery.contactName.trim(), delivery.team?.trim()].filter(Boolean).join(' · ') || 'Not added'}{delivery.email?.trim() && <small>{delivery.email.trim()}</small>}</dd></div>
      <div><dt>Mobile</dt><dd className={delivery.phone?.trim() ? '' : 'is-empty'}>{delivery.phone?.trim() || 'Not added'}{delivery.phoneProblem && <small className="ora-warn">{delivery.phoneProblem}</small>}</dd></div>
      <div><dt>Date required</dt><dd className={delivery.neededBy ? '' : 'is-empty'}>{delivery.neededBy ? delivery.neededByText || formatDate(delivery.neededBy) : 'Not given'}</dd></div>
      <div><dt>{delivery.method === 'pickup' ? 'Delivery' : 'Delivery address'}</dt><dd>
        {delivery.method === 'pickup' ? <span>Pick up from 3DEEZI</span> : address ? <span>{address}</span> : !p.onEditDelivery ? <span className="is-empty">Confirmed with you by 3DEEZI before dispatch.</span> : null}
        {deliveryLink}
      </dd></div>
      <div><dt>Instructions</dt><dd className={delivery.notes?.trim() ? 'ora-notes' : 'is-empty'}>{delivery.notes?.trim() || 'None'}</dd></div>
      {layout === 'multi' && <div><dt>Uploaded files</dt><dd>{files.length ? <>{p.filesLabel ?? 'Order form & artwork'} · {plural(files.length, 'file')} <button type="button" className="op-link ora-inline-link" onClick={() => setFilesOpen(true)}>View files <ArrowRight size={15} /></button></> : <span className="is-empty">No files uploaded</span>}</dd></div>}
      {layout === 'kit' && <div className={`ora-price-row${priced ? ' is-priced' : ''}`}><dt>Pricing</dt><dd>{priced ? <div className="ora-price" data-testid="review-price">{p.price}</div> : <><span data-testid="pricing-pending">Pricing pending confirmation.</span>{p.priceNote && <small>{p.priceNote}</small>}</>}</dd></div>}
    </dl>
    {p.priceOptions && <details className="ora-price-options"><summary>Delivery region, extras &amp; discount code</summary><div>{p.priceOptions}</div></details>}
  </section>;

  const invalid = tried && !p.agreed;
  const confirm = <section className="op-card ora-confirm" aria-label="Approve your order">
    <div className="ora-confirm-text">
      <label className={`ora-check${invalid ? ' is-invalid' : ''}`} htmlFor={checkId}>
        <input id={checkId} type="checkbox" checked={p.agreed} onChange={e => { p.onAgree(e.target.checked); if (e.target.checked) setTried(false); }} aria-invalid={invalid} data-testid="approve-check" />
        <span className="ora-check-box" aria-hidden="true"><Check size={16} strokeWidth={3.2} /></span>
        <span><strong>{layout === 'multi' ? 'I confirm all garments, sizes, quantities and final mockups are correct.' : 'I confirm the selected garments, sizes, quantities and final mockups are correct.'}</strong><small>Submit your order to 3DEEZI for review.</small></span>
      </label>
      {p.error && <p className="ora-alert" role="alert"><CircleAlert size={16} /> {p.error}</p>}
    </div>
    <div className="ora-actions">
      <button type="button" className="ora-btn is-outline" onClick={p.onBack} disabled={p.busy}><ArrowLeft size={19} /> Back to Edit</button>
      <span className="ora-approve-wrap" onClick={() => { if (!p.agreed) setTried(true); }}>
        <button type="button" className="ora-btn is-primary" onClick={approve} disabled={!p.agreed || p.busy} aria-describedby={!p.agreed ? `${checkId}-why` : undefined} data-testid="approve-order">
          {p.busy ? <><LoaderCircle className="spin" size={19} /> Sending…</> : <>Approve Order <ArrowRight size={19} /></>}
        </button>
        {!p.agreed && <small id={`${checkId}-why`} className={invalid ? 'is-invalid' : ''}>Tick the box to approve.</small>}
      </span>
    </div>
  </section>;

  return <div className={`ora ora-${layout}`} data-layout={layout}>
    {toolbar && <div className="ora-toolbar ora-summary-row">{toolbar}</div>}
    {p.notice}
    {layout === 'kit' ? <div className="ora-kit-grid">
      {mockups}
      <div className="ora-col">{garmentsCard}{deliveryCard}</div>
    </div> : <>
      {p.garmentsNote && <div className="ora-multi-note">{p.garmentsNote}</div>}
      {multi.sections}
      <div className="ora-bottom-grid">{deliveryCard}{multi.totals}</div>
    </>}
    {confirm}
    {designShots.drawer}
    {viewer && <MockupViewer shots={shots.filter(s => s.src)} start={Math.max(0, shots.filter(s => s.src).indexOf(shots[viewer.index]))} zoomed={viewer.zoom} onClose={() => setViewer(null)} />}
    {filesOpen && <FilesDialog files={files} onDownload={p.onDownload} onClose={() => setFilesOpen(false)} />}
    {editing && p.garmentEditor && <EditorDialog onClose={() => setEditing(false)}>{p.garmentEditor}</EditorDialog>}
    <span className="op-sr" aria-live="polite">{total ? `${plural(total, 'garment')} to review` : ''}</span>
  </div>;
}

/** "Edit sizes & garments": the page's editable garments, sizes and players in a large dialog; the review follows every change. */
function EditorDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; before?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="ora-viewer is-files" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="garment-editor">
    <section className="op-card ora-files-card ora-editor-card">
      <header><h2 id={titleId}>Edit sizes &amp; garments</h2><button ref={close} type="button" className="ora-viewer-btn is-close" onClick={onClose} aria-label="Close and go back to the review"><X size={20} /></button></header>
      <div className="ora-editor">{children}</div>
      <footer><button type="button" className="ora-btn is-primary ora-editor-done" onClick={onClose}><Check size={18} /> Done</button></footer>
    </section>
  </div>;
}

/* ================================================================================================ order sent */

/** Step 3, Order sent: the reference, View my order, Pay now (when the invoice can be paid) and start another. */
export function OrderSentPanel({ number, name, message, onView, pay, note, another }: {
  number: string; name?: string; message: ReactNode; onView: () => void;
  pay?: { label: ReactNode; onClick: () => void } | null; note?: ReactNode; another: { label: string; onClick: () => void };
}) {
  return <section className="op-card ora-sent" aria-live="polite" aria-labelledby="ora-sent-title">
    <span className="ora-sent-mark" aria-hidden="true"><Check size={36} strokeWidth={3} /></span>
    <h2 id="ora-sent-title">Thank you{name ? `, ${name}` : ''}! Your order is sent.</h2>
    <p className="ora-sent-line">{message}</p>
    <div className="ora-ref"><small>Your order number</small><strong data-testid="order-reference">{number}</strong></div>
    {note}
    <div className="ora-sent-actions">
      <button type="button" className="ora-btn is-primary" onClick={onView}>View my order <ArrowRight size={19} /></button>
      {pay && <button type="button" className="ora-btn is-outline is-pay" onClick={pay.onClick}>{pay.label}</button>}
    </div>
    <p className="ora-sent-more"><button type="button" className="op-link" onClick={another.onClick}>{another.label}</button> · <Link className="op-link" to="/orders">My Orders</Link></p>
  </section>;
}
