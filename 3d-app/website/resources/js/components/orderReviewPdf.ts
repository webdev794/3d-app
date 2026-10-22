// The review PDF of a multiple-garments order (REVIEW & APPROVE ORDER, Download review PDF): one section per garment
// style with its FRONT and BACK mockups, name, colours · fit, the SIZE | QTY table and players, then delivery, notes
// and the order totals. jsPDF (MIT, public/media/vendor) as designSheet.ts uses it, loaded only when someone downloads.
import { media } from '../api';
import type { Quote } from './OrderPayment';
import { addressLine, aud, garmentQty, methodWords, orderedSizes, summaryText, type Mockup, type ReviewDelivery, type ReviewGarment } from './orderReviewData';

interface Pdf {
  setFont(name: string, style?: string): void;
  setFontSize(size: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setFillColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setLineWidth(width: number): void;
  text(text: string | string[], x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  splitTextToSize(text: string, width: number): string[];
  addPage(): void;
  setPage(n: number): void;
  getNumberOfPages(): number;
  output(type: 'blob'): Blob;
}
type PdfConstructor = new (options: { orientation: string; unit: string; format: string }) => Pdf;
/** The same jsPDF as the Studio's design sheet (window.jspdf once loaded). */
const loaded = () => (window as unknown as { jspdf?: { jsPDF: PdfConstructor } }).jspdf?.jsPDF;
async function loadJsPdf(): Promise<PdfConstructor> {
  if (!loaded()) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = media('vendor/jspdf.umd.min.js');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the PDF tool. Please try again.'));
      document.head.append(script);
    });
  }
  const JsPdf = loaded();
  if (!JsPdf) throw new Error('Could not load the PDF tool. Please try again.');
  return JsPdf;
}

/** PDF standard fonts only cover Western characters: replace the rest. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^ -ÿ–—•€]/g, '?');
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
type Shot = { data: string; w: number; h: number };
/** A picture on the light panel colour, as a JPEG (much smaller than PNG); null when it can't be read. */
async function picture(src: string | null | undefined, maxPx = 900): Promise<Shot | null> {
  if (!src) return null;
  try {
    const img = await loadImage(src), k = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * k)); canvas.height = Math.max(1, Math.round(img.height * k));
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#EEF2F6'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.88), w: canvas.width, h: canvas.height };
  } catch { return null; }
}

export interface ReviewPdfInput {
  garments: ReviewGarment[];
  /** Each garment's pictures (same order); missing ones print "Mockup prepared by 3DEEZI after you approve". */
  mockups?: Mockup[];
  delivery?: ReviewDelivery;
  /** The review's quote (useQuote); or `priceRows` (label, value), e.g. priceRowsFromPayment(order.payment). */
  quote?: Quote | null;
  priceRows?: [string, string][];
  /** orders/options `sizes`. */
  sizeOrder?: string[];
  /** The header word: 'ORDER REVIEW' (default), or e.g. 'APPROVED ORDER'. */
  title?: string;
  /** The order number (3DZ-…), in the header. */
  reference?: string | null;
}

/** "22 Oct 2026"; a date-only value ("2026-11-20") as that day. */
function day(value?: string | Date | null) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-AU', { weekday: value instanceof Date ? undefined : 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const amount = (value: string | null | undefined, currency: string) => aud(value, currency);

export async function reviewPdf({ garments, mockups = [], delivery = {}, quote, priceRows, sizeOrder, title = 'ORDER REVIEW', reference }: ReviewPdfInput): Promise<Blob> {
  const JsPdf = await loadJsPdf();
  const pdf = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 12, bottom = H - 14;
  const total = garments.reduce((a, g) => a + garmentQty(g.sizes), 0);
  const contact = delivery.contact || delivery.contactName || '';
  const team = delivery.team || contact || 'Your order';

  // Header band
  pdf.setFillColor(11, 21, 32); pdf.rect(0, 0, W, 24, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(18, 225, 240); pdf.text('3DEEZI', M, 15);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(255, 255, 255); pdf.text(safe(`${title.toUpperCase()}${reference ? `  ·  ${reference}` : ''}`), M + 34, 15);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(safe(team).slice(0, 60), W - M, 11.5, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(185, 200, 214);
  pdf.text(safe(`${summaryText(garments.length, total)} · ${day(new Date())}`), W - M, 18.5, { align: 'right' });

  let y = 32;
  const newPage = () => { pdf.addPage(); y = 16; };
  const room = (h: number) => { if (y + h > bottom) newPage(); };

  const tile = (label: string, shot: Shot | null, x: number, top: number, w: number, h: number) => {
    pdf.setFillColor(238, 242, 246); pdf.roundedRect(x, top, w, h, 2.5, 2.5, 'F');
    if (shot) {
      const k = Math.min((w - 4) / shot.w, (h - 10) / shot.h), iw = shot.w * k, ih = shot.h * k;
      pdf.addImage(shot.data, 'JPEG', x + (w - iw) / 2, top + 2 + (h - 10 - ih) / 2, iw, ih);
    } else {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(110, 124, 140);
      pdf.text(pdf.splitTextToSize('Mockup prepared by 3DEEZI after you approve', w - 10), x + w / 2, top + h / 2 - 3, { align: 'center' });
    }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(93, 107, 123); pdf.text(label, x + w / 2, top + h - 3, { align: 'center' });
  };

  for (let i = 0; i < garments.length; i++) {
    const g = garments[i], m = mockups[i] ?? { state: 'none' };
    const rows = orderedSizes(g.sizes, sizeOrder), qty = rows.reduce((a, [, n]) => a + n, 0);
    const players = g.players ?? [];
    const tableH = 6 + 5 * rows.length + 6;
    const tilesH = 66, playerLines = Math.min(12, Math.ceil(players.length / 3));
    const bodyH = Math.max(tilesH, 16 + tableH) + (players.length ? 9 + 4.2 * playerLines + (players.length > 36 ? 4 : 0) : 0);
    room(11 + bodyH + 6);

    // Section header: "01 — BASKETBALL SINGLET"
    pdf.setFillColor(13, 42, 71); pdf.roundedRect(M, y, W - 2 * M, 9, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(255, 255, 255);
    pdf.text(safe(`${String(i + 1).padStart(2, '0')} — ${g.name.toUpperCase()}`), M + 4, y + 6.1);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(140, 220, 240);
    pdf.text(`${qty} ${qty === 1 ? 'garment' : 'garments'}`, W - M - 4, y + 6.1, { align: 'right' });
    const top = y + 12;

    // FRONT and BACK
    const [front, back] = await Promise.all([picture(m.front), picture(m.back)]);
    const tileW = 46;
    tile(m.source === 'artwork' ? 'ARTWORK' : 'FRONT', front, M, top, tileW, tilesH);
    tile('BACK', back, M + tileW + 4, top, tileW, tilesH);

    // Name, colours · fit, then SIZE | QTY with TOTAL
    const x0 = M + 2 * tileW + 12, colW = W - M - x0;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(20, 30, 40); pdf.text(safe(g.name).slice(0, 60), x0, top + 4);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(93, 107, 123); pdf.text(safe(g.detail || '—').slice(0, 80), x0, top + 9);
    let ty = top + 14;
    pdf.setFillColor(11, 21, 32); pdf.rect(x0, ty, colW, 6, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(255, 255, 255);
    pdf.text('SIZE', x0 + 3, ty + 4.2); pdf.text('QTY', x0 + colW - 3, ty + 4.2, { align: 'right' });
    ty += 6;
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 40, 52); pdf.setDrawColor(214, 222, 230); pdf.setLineWidth(0.2);
    for (const [s, n] of rows) {
      pdf.text(safe(s), x0 + 3, ty + 3.6); pdf.text(String(n), x0 + colW - 3, ty + 3.6, { align: 'right' });
      ty += 5; pdf.line(x0, ty, x0 + colW, ty);
    }
    pdf.setFillColor(214, 247, 252); pdf.rect(x0, ty, colW, 6, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(10, 90, 110);
    pdf.text('TOTAL', x0 + 3, ty + 4.2); pdf.text(String(qty), x0 + colW - 3, ty + 4.2, { align: 'right' });

    // Players, three columns
    let py = top + Math.max(tilesH, 16 + tableH) + 5;
    if (players.length) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(30, 123, 255); pdf.text(`PLAYERS (${players.length}) · NAME / NUMBER / SIZE`, M, py); py += 4.6;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.8); pdf.setTextColor(40, 52, 66);
      const colX = (W - 2 * M) / 3, shown = players.slice(0, 36);
      shown.forEach((p, k) => {
        const c = Math.floor(k / playerLines), r = k % playerLines;
        pdf.text(safe(`${p.name || '—'} · ${p.number || '—'} · ${p.size || '—'}`).slice(0, 44), M + c * colX, py + r * 4.2);
      });
      py += playerLines * 4.2;
      if (players.length > shown.length) { pdf.setTextColor(93, 107, 123); pdf.text(`and ${players.length - shown.length} more (see the order)`, M, py); py += 4; }
    }
    y = Math.max(py, top + bodyH) + 6;
  }

  // DELIVERY & NOTES, then ORDER TOTALS
  const heading = (t: string) => { room(14); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(30, 123, 255); pdf.text(t, M, y + 4); y += 10.5; };
  const row = (label: string, value: string | null | undefined) => {
    const lines = pdf.splitTextToSize(safe(value || '—'), W - 2 * M - 42).slice(0, 6);
    room(4.6 * lines.length + 1);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(20, 30, 40); pdf.text(label, M, y);
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 72, 86); pdf.text(lines, M + 42, y);
    y += 4.6 * lines.length + 1;
  };
  heading('DELIVERY & NOTES');
  row('Contact', [contact, delivery.team].filter(Boolean).join(' · '));
  if (delivery.email || delivery.phone) row('Email / phone', [delivery.email, delivery.phone].filter(Boolean).join(' · '));
  if (delivery.method) row('Delivery', delivery.method === 'deliver' ? 'Delivered to the address below' : delivery.method === 'pickup' ? 'Pick up from 3DEEZI' : methodWords(delivery.method));
  if (delivery.method !== 'pickup') row('Delivery address', addressLine(delivery.address));
  if (delivery.neededBy) row('Needed by', day(delivery.neededBy));
  row('Instructions', delivery.notes);
  if (delivery.files?.length) row('Uploaded files', `${delivery.files.length} ${delivery.files.length === 1 ? 'file' : 'files'}: ${delivery.files.join(', ')}`);
  y += 3;
  heading('ORDER TOTALS');
  row('Garment styles', String(garments.length));
  row('Total garments', String(total));
  if (priceRows?.length) for (const [label, value] of priceRows) row(safe(label).slice(0, 40), value);
  else if (quote && quote.status === 'priced') {
    for (const l of [...quote.lines, ...quote.extras]) row(safe(l.name).slice(0, 40), `${l.quantity} × ${l.priced ? amount(l.unit_price, quote.currency) : 'To be confirmed'} = ${l.priced ? amount(l.total, quote.currency) : 'To be confirmed'}`);
    if (quote.shipping) row('Shipping', quote.shipping.priced ? amount(quote.shipping.amount, quote.currency) : 'To be confirmed');
    for (const d of quote.discounts) row(safe(d.name).slice(0, 40), `-${amount(d.amount, quote.currency)}`);
    row('Subtotal', amount(quote.subtotal, quote.currency));
    row(`${quote.tax.name}${quote.tax.applies ? ` (${quote.tax.rate}%${quote.tax.included ? ', included' : ''})` : ' (not applicable)'}`, amount(quote.tax.amount, quote.currency));
    row('TOTAL', amount(quote.total, quote.currency));
  } else row('Pricing', quote?.status === 'quote_required' ? 'Quote required: 3DEEZI confirms the price, then emails your invoice.' : 'Pricing pending confirmation.');

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(127, 147, 166);
    pdf.text('Order review from 3DEEZI · check every garment, size and mockup before approving', M, H - 7);
    pdf.text(`Page ${p} of ${pages}`, W - M, H - 7, { align: 'right' });
  }
  return pdf.output('blob');
}

/** Makes the review PDF and saves it ("3DEEZI-<order number or team>-review.pdf" unless named). */
export async function downloadReviewPdf(input: ReviewPdfInput, filename?: string): Promise<void> {
  const blob = await reviewPdf(input);
  const base = (input.reference || input.delivery?.team || 'order').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'order';
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename ?? `3DEEZI-${base}-review.pdf`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
