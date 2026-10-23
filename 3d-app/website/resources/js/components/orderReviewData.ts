/**
 * The data of the multiple-garments review (REVIEW & APPROVE ORDER) and its PDF, without React: the garments as the
 * sections show them, the sizes in the site's order, which layout an order uses, and helpers for a saved order.
 * Used by OrderReviewGarments.tsx (the sections), orderReviewPdf.ts (the PDF) and the pages that show them.
 */
import { media, type Project } from '../api';
import type { OrderDetail, OrderFile, OrderItem, OrderPlayer, Payment } from '../orderApi';
import { audMoney } from '../teamApi';
import { defaultDesign, type Design } from './KitViewer';
import { ALL_SIZES } from '../orderSizes';

/** One garment style of the review, as the sections and the PDF show it. */
export interface ReviewGarment {
  key: string;
  /** The order garment id (jersey, shorts, singlet, polo…). */
  garment: string;
  /** "Basketball singlet". */
  name: string;
  /** "Black / Cyan · Mens fit" (empty parts left out). */
  detail: string;
  sizes: Record<string, number>;
  players?: OrderPlayer[] | null;
  /** The saved design it is made from, if any (its mockups are drawn from it). */
  project?: Project | null;
  /** The garment's picture (the design's saved picture, or the garment's showroom picture); null = an icon. */
  thumbnail?: string | null;
  /** Uploaded artwork for a garment without a design: shown in place of a mockup (its `thumb`, else `preview`). */
  artwork?: ReviewArtwork[];
  /** Ready-made mockups (a 3DEEZI proof, say): used instead of drawing them. */
  mockups?: { front?: string | null; back?: string | null } | null;
}

/** An uploaded artwork file (an OrderFile, or the review page's ReviewFile). */
export interface ReviewArtwork { id?: number | string; name: string; thumb?: string | null; preview?: string | null }

/**
 * For the review PDF: who it is for, where it goes, and the notes. The review page's DELIVERY & NOTES data
 * (OrderReviewApprove's ReviewDelivery: contactName, method 'deliver' | 'pickup', address as text or parts) fits as is.
 */
export interface ReviewDelivery {
  team?: string | null; contact?: string | null; contactName?: string | null; email?: string | null; phone?: string | null;
  /** 'deliver' / 'pickup', or the words to print ("Delivery"). */
  method?: string | null;
  address?: string | { street?: string; suburb?: string; state?: string; postcode?: string; country?: string } | null;
  neededBy?: string | null; notes?: string | null;
  /** The uploaded files' names. */
  files?: string[];
}
/** The delivery address as one line. */
export function addressLine(a: ReviewDelivery['address']): string {
  if (!a) return '';
  if (typeof a === 'string') return a.trim();
  return [a.street, [a.suburb, a.state, a.postcode].filter(v => v && v.trim()).join(' '), a.country].map(v => (v ?? '').trim()).filter(Boolean).join(', ');
}
/** How it is delivered, in words. */
export const methodWords = (m: string | null | undefined) => (!m ? '' : m === 'deliver' ? 'Delivery' : m === 'pickup' ? 'Pick up' : m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' '));

/** The site's sizes, in order (orders/options `sizes`: Mens XS–8XL, Womens W8–W24, Kids 2Y–16Y, the older Kids); other youth sizes sit with Kids, smallest first. */
export const SITE_SIZES = ALL_SIZES;
const LETTER_RANK = ['XXS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
const YOUTH = /^(?:y(?:outh)?\s*-?\s*|k(?:ids?)?\s*-?\s*|jr\s*-?\s*)(\d{1,2}|xxs|xs|s|m|l|xl)$|^(\d{1,2})\s*y?$/i;
/** Where a size goes: the site's order first; youth sizes (Y8, YXL, Kids 10, 12) where Kids is; others after. */
function sizeRank(size: string, order: string[]): number {
  const i = order.findIndex(s => s.toLowerCase() === size.toLowerCase());
  if (i >= 0) return i;
  const kids = order.findIndex(s => s.toLowerCase() === 'kids');
  const youth = size.trim().match(YOUTH);
  if (youth) {
    const part = (youth[1] ?? youth[2]).toUpperCase();
    // Numbered youth sizes (4–16) before the lettered ones, then Kids itself.
    const sub = /^\d+$/.test(part) ? Number(part) / 100 : 0.2 + LETTER_RANK.indexOf(part) / 100;
    return (kids >= 0 ? kids : order.length) - 0.5 + sub * 0.9;
  }
  const letter = LETTER_RANK.indexOf(size.toUpperCase());
  return letter >= 0 ? order.length + letter / 100 : order.length + 1;
}
/** The sizes ordered (with a quantity), in the site's order; youth sizes included. */
export function orderedSizes(sizes: Record<string, number>, order: string[] = SITE_SIZES): [string, number][] {
  return Object.entries(sizes)
    .map(([s, n]) => [s, Math.max(0, Math.round(Number(n) || 0))] as [string, number])
    .filter(([, n]) => n > 0)
    .map((e, at) => ({ e, at, rank: sizeRank(e[0], order) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map(x => x.e);
}
export const garmentQty = (sizes: Record<string, number> | null | undefined) => Object.values(sizes ?? {}).reduce((a, n) => a + Math.max(0, Math.round(Number(n) || 0)), 0);

const TOPS = new Set(['jersey', 'tee', 'singlet', 'polo']);
const sameSizes = (a: Record<string, number>, b: Record<string, number>) => {
  const x = orderedSizes(a), y = orderedSizes(b);
  return x.length === y.length && x.every(([s, n], i) => y[i][0].toLowerCase() === s.toLowerCase() && y[i][1] === n);
};
/**
 * Which review layout an order uses: 'kit' for ONE matching kit (a top and shorts from the same saved design, with the
 * same sizes), else 'multi' (several garment styles, different designs, different sizes, or no design).
 */
export function reviewLayoutFor(order: { items?: Pick<OrderItem, 'garment' | 'project_id' | 'sizes'>[] | null } | null | undefined): 'kit' | 'multi' {
  const items = (order?.items ?? []).filter(i => garmentQty(i.sizes) > 0);
  // A Studio kit ordered as one full-kit row is one matching kit too.
  if (items.length === 1 && items[0].garment === 'fullkit') return 'kit';
  if (items.length !== 2) return 'multi';
  const shorts = items.find(i => i.garment === 'shorts'), top = items.find(i => TOPS.has(i.garment));
  if (!shorts || !top || !top.project_id || top.project_id !== shorts.project_id) return 'multi';
  return sameSizes(top.sizes, shorts.sizes) ? 'kit' : 'multi';
}

/** Colour names for the "colours · fit" line. */
const NAMED: [string, number, number, number][] = [
  ['Black', 12, 14, 18], ['Charcoal', 54, 58, 64], ['Grey', 128, 132, 138], ['Silver', 192, 196, 202], ['White', 248, 248, 248],
  ['Navy', 16, 32, 76], ['Royal blue', 34, 76, 200], ['Blue', 30, 120, 230], ['Sky blue', 110, 180, 240], ['Cyan', 0, 210, 230], ['Teal', 0, 128, 128],
  ['Green', 30, 150, 60], ['Bottle green', 14, 74, 40], ['Lime', 160, 220, 40], ['Yellow', 250, 220, 30], ['Gold', 212, 165, 32], ['Orange', 245, 130, 20],
  ['Red', 215, 30, 40], ['Maroon', 110, 20, 36], ['Pink', 240, 110, 170], ['Purple', 112, 50, 170], ['Violet', 150, 90, 230], ['Brown', 110, 70, 40],
];
export function colourName(hex?: string | null): string | null {
  const m = (hex ?? '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  let best = NAMED[0], dist = Infinity;
  for (const c of NAMED) {
    const rm = (r + c[1]) / 2, dr = r - c[1], dg = g - c[2], db = b - c[3];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < dist) { dist = d; best = c; }
  }
  return best[0];
}

const FIT_NAMES: Record<string, string> = { mens: 'Mens fit', womens: 'Womens fit', youth: 'Kids fit', unisex: 'Unisex fit' };
const ART = new Set(['jersey', 'shorts', 'tee', 'singlet', 'polo', 'socks', 'hoodie']);
export const isPicture = (src: unknown): src is string => typeof src === 'string' && /^(data:image\/|blob:|https?:\/\/|\/)/.test(src);
/** An artwork file's picture (its thumbnail, or the page's preview of a file still uploading). */
export const artworkPicture = (f: ReviewArtwork | null | undefined) => (isPicture(f?.thumb) ? f!.thumb! : isPicture(f?.preview) ? f!.preview! : null);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The review's garments from the order rows (OrderFields.items, the Create Order Form's rows, or the rows read from
 * an upload). `projects`: the customer's saved designs (GET /projects), for the mockups; `artwork`: the artwork files,
 * shown for rows without a design (a form row with `file_ids` shows only its own); `options`: orders/options names.
 */
export function reviewGarmentsFrom({ items, projects, artwork, options }: {
  items: (OrderItem & { key?: string; file_ids?: (number | string)[] })[] | null | undefined; projects?: Project[] | null; artwork?: ReviewArtwork[] | null;
  options?: { garments?: { id: string; name: string }[]; sports?: { id: string; name: string }[]; fits?: { id: string; name: string }[] } | null;
}): ReviewGarment[] {
  const rows = (items ?? []).filter(i => garmentQty(i.sizes) > 0);
  const perRow = rows.some(r => r.file_ids?.length);
  const pictures = (artwork ?? []).filter(f => artworkPicture(f));
  return rows.map((item, i) => {
    const project = item.project_id ? projects?.find(p => p.id === item.project_id) ?? null : null;
    const sport = options?.sports?.find(s => s.id === item.sport)?.name;
    const garmentName = options?.garments?.find(g => g.id === item.garment)?.name ?? capital(item.garment);
    const d = project?.design;
    // A saved design made as one of its sport's garments ("Netball bibs", task 9.99) is ordered by that name, as the
    // order form's rows (OrderForm rowName) and the placed order (OrderSubmission) call it; a row's own label wins.
    const product = typeof d?.productName === 'string' ? d.productName.trim() : '';
    const name = item.label || item.name || product || [sport, sport ? garmentName.toLowerCase() : garmentName].filter(Boolean).join(' ') || 'Garment';
    const colours = [...new Set([colourName(d?.main), colourName(d?.secondary)].filter((c): c is string => !!c))].join(' / ');
    const fit = item.fit ? FIT_NAMES[item.fit] ?? `${options?.fits?.find(f => f.id === item.fit)?.name ?? capital(item.fit)} fit` : '';
    const own = projectPicture(project);
    return {
      key: item.key || `${i}-${item.garment}-${item.project_id ?? 'x'}`, garment: item.garment, name: capital(name), detail: [colours, fit].filter(Boolean).join(' · '),
      sizes: item.sizes, players: item.players?.filter(p => p && (p.name || p.number || p.size)) ?? null, project,
      thumbnail: (own && project && rowGarmentOf(project.garment) === item.garment ? own : null) ?? (isPicture(item.thumbnail) ? item.thumbnail : null) ?? garmentPicture(item.garment) ?? own,
      artwork: project ? undefined : perRow ? pictures.filter(f => f.id !== undefined && item.file_ids?.includes(f.id as number)) : pictures,
    };
  });
}
export function projectPicture(p: Project | null | undefined): string | null {
  if (!p) return null;
  const front = (p.design as Design & { renderFront?: string | null } | undefined)?.renderFront;
  return isPicture(p.thumbnail) ? p.thumbnail : isPicture(front) ? front : null;
}
const garmentPicture = (garment: string) => (ART.has(garment) ? media(`showroom/garment-${garment}.webp`) : null);
const PROJECT_ROWS: Record<string, string> = { fullkit: 'jersey', ziphoodie: 'hoodie', pocketpolo: 'polo', varsity: 'jacket', trackjacket: 'jacket' };
export const rowGarmentOf = (designGarment: string) => PROJECT_ROWS[designGarment] ?? designGarment;
const VIEWER_TOPS = new Set(['jersey', 'tee', 'polo', 'pocketpolo', 'singlet', 'hoodie', 'ziphoodie', 'varsity', 'trackjacket']);

/**
 * What the 3D viewer draws for a row: that garment ALONE in its design (a full kit's shorts row: the shorts only; its
 * singlet row: the top only). null when the site has no 3D model for it (socks, caps, track pants…).
 */
export function viewerGarmentFor(rowGarment: string, designGarment: string): Design['garment'] | null {
  if (rowGarment === 'fullkit') return designGarment === 'fullkit' ? 'fullkit' : null;
  if (rowGarment === 'shorts') return designGarment === 'fullkit' || designGarment === 'shorts' ? 'shorts' : null;
  if (designGarment === rowGarment || PROJECT_ROWS[designGarment] === rowGarment) return (designGarment === 'fullkit' ? 'jersey' : designGarment) as Design['garment'];
  // A full kit's top, or a top design used for another top row: the row's garment, in the design's colours and marks.
  if (['jersey', 'tee', 'singlet', 'polo', 'hoodie'].includes(rowGarment) && (designGarment === 'fullkit' || VIEWER_TOPS.has(designGarment))) return rowGarment as Design['garment'];
  return null;
}

/** The design the viewer draws for a garment, with the first player's name and number on the back. */
export function mockupDesign(g: ReviewGarment): Design | null {
  if (!g.project?.design) return null;
  const garment = viewerGarmentFor(g.garment, g.project.garment);
  if (!garment) return null;
  const first = g.players?.find(p => p.name || p.number);
  return { ...defaultDesign, ...g.project.design, garment, ...(first ? { backName: first.name || g.project.design.backName, number: first.number || g.project.design.number } : {}) };
}

/** A garment's FRONT and BACK pictures: drawn by the 3D viewer, given (a proof), the design's picture, or artwork. */
export type MockupState = 'drawing' | 'done' | 'failed' | 'none';
export interface Mockup { state: MockupState; front?: string | null; back?: string | null; source?: '3d' | 'given' | 'picture' | 'artwork' }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "3 garment styles · 90 garments". */
export const summaryText = (styles: number, garments: number) => `${plural(styles, 'garment style', 'garment styles')} · ${plural(garments, 'garment', 'garments')}`;

/* ------------------------------------------------------------------------------------------ a saved order */

/** A saved order's contact, delivery, notes and files, for the review PDF (OrderDetail from GET /orders/{id}). */
export function reviewDeliveryFromOrder(order: Pick<OrderDetail, 'team_name' | 'contact_name' | 'contact_email' | 'phone' | 'shipping_address' | 'needed_by' | 'notes' | 'files'> & Record<string, unknown>): ReviewDelivery {
  const method = typeof order.delivery === 'string' ? order.delivery : (order.delivery as { method?: string } | null | undefined)?.method;
  return {
    team: order.team_name, contact: order.contact_name, email: order.contact_email, phone: order.phone, method: method ?? null,
    address: order.shipping_address, neededBy: order.needed_by, notes: order.notes,
    files: (order.files ?? []).filter(f => f.kind === 'order_form' || f.kind === 'artwork').map(f => f.name),
  };
}
/** An uploaded order's artwork files (to show for the garments without a saved design). */
export const artworkOf = (files: OrderFile[] | null | undefined) => (files ?? []).filter(f => f.kind === 'artwork' && isPicture(f.thumb));

/** The invoice as the PDF's price rows: Invoice, Total, Paid and Amount due (in place of a quote). */
export function priceRowsFromPayment(payment: Payment | null | undefined): [string, string][] {
  if (!payment) return [];
  const m = (v: string | null) => aud(v, payment.currency);
  if (payment.status === 'quote_required') return [['Pricing', 'Quote required: 3DEEZI confirms the price, then emails your invoice.']];
  return [
    ...(payment.invoice_number ? [['Invoice', `${payment.invoice_number} · ${payment.label}`] as [string, string]] : [['Payment', payment.label] as [string, string]]),
    ['Total', m(payment.total)],
    ...(Number(payment.amount_paid) > 0 ? [['Paid', m(payment.amount_paid)] as [string, string]] : []),
    ...(payment.amount_due !== null && payment.amount_due !== undefined ? [['Amount due', m(payment.amount_due)] as [string, string]] : []),
  ];
}

/** "A$4,000.00" (the site's money, as TEAM and the payment page show it); "To be confirmed" without an amount. */
export function aud(amount: string | number | null | undefined, currency = 'AUD'): string {
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) return amount === null || amount === undefined || amount === '' ? 'To be confirmed' : String(amount);
  return audMoney(amount, currency);
}
