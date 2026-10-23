/**
 * My Orders (pages/OrdersBoard.tsx, components/OrderDetail.tsx): the order data as the page uses it, read from the
 * order API (orders-api.md §8–10) and tolerant of older replies, plus the small shared pieces: status and payment
 * pills, garment pictures, dates.
 */
import { useId, useState, type ReactNode } from 'react';
import { formatMoney } from '../money';

export type StageKey = 'received' | 'design' | 'production' | 'shipped' | 'delivered';
export type Tone = 'blue' | 'amber' | 'violet' | 'green' | 'red' | 'grey';
export type Approval = 'waiting' | 'review' | 'approved' | 'changes' | null;

/** The five board columns, in order (orders-api.md §0). */
export const STAGES: { key: StageKey; status: string; label: string; short: string; tone: Tone }[] = [
  { key: 'received', status: 'pending', label: 'Order received', short: 'Received', tone: 'blue' },
  { key: 'design', status: 'confirmed', label: 'Design & approval', short: 'Design', tone: 'amber' },
  { key: 'production', status: 'in_production', label: 'Production', short: 'Production', tone: 'violet' },
  { key: 'shipped', status: 'shipped', label: 'Shipped', short: 'Shipped', tone: 'blue' },
  { key: 'delivered', status: 'delivered', label: 'Delivered', short: 'Delivered', tone: 'green' },
];
const STAGE_OF: Record<string, StageKey | 'cancelled'> = { pending: 'received', confirmed: 'design', in_production: 'production', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' };

export interface SubStatus { key: string; label: string; tone: Tone }
export interface BoardGarment { garment: string; name: string; quantity: number; thumbnail: string | null }
export interface Tracking { carrier: string | null; number: string | null; url: string | null }
export interface LatestUpdate { kind: string; text: string; at: string }
/** The order's payment at a glance (payments-api.md §2): Quote required, Awaiting payment, Paid … and its invoice. */
export interface PaymentSummary {
  status: string; label: string; tone: Tone; payable: boolean;
  invoiceNumber: string | null; currency: string; total: string | null; amountPaid: string | null; amountDue: string | null; depositDue: string | null;
  issuedAt: string | null; dueAt: string | null; paidAt: string | null; payUrl: string | null; pdf: string | null;
  lastAttempt: { status: string; message: string | null; at: string | null } | null; reasons: string[];
  /** The summary as the server sent it, for the payments agent's components. */
  raw: Record<string, unknown>;
}
export interface BoardOrder {
  id: number; number: string; name: string; source: string; status: string; stage: StageKey | 'cancelled'; sub_status: SubStatus; approval: Approval;
  quantity: number; garments: BoardGarment[]; submitted_at: string; updated_at: string; latest_update: LatestUpdate | null;
  tracking: Tracking | null; action: 'review_design' | 'track_delivery' | null; completed: boolean; payment: PaymentSummary | null;
  /** The first artwork or proof picture: shown when no garment has a design picture. */
  cover: string | null;
  /** The date required (YYYY-MM-DD), when the customer gave one. */
  needed_by?: string | null;
}
export interface OrderFile {
  id: number; kind: string; name: string; extension: string; mime_type: string; size: number | null; thumb: string | null; download: string; created_at: string | null;
  /** Design proofs: the version (1, 2 …) and the customer's response to it. */
  version: number | null; review_status: string | null; reviewed_at: string | null; review_note: string | null;
}
export interface OrderUpdate { id: number | string; kind: string; text: string; message: string | null; author: string; file: OrderFile | null; approval: string | null; created_at: string }
export interface Player { name: string; number: string; size?: string | null }
export interface OrderItem { garment: string; name: string; fit: string | null; sport: string | null; sizes: Record<string, number>; quantity: number; players: Player[]; thumbnail: string | null }
export interface OrderDetail extends BoardOrder {
  team_name: string | null; contact_name: string | null; contact_email: string | null; phone: string | null; shipping_address: string | null; needed_by: string | null; notes: string | null;
  items: OrderItem[]; sizes: Record<string, number>; names: string | null; players: Player[];
  total: string | null; currency: string; files: OrderFile[]; proof: OrderFile | null; proofs: OrderFile[];
  stages_reached: Partial<Record<StageKey | 'cancelled', string>>; updates: OrderUpdate[];
}
export interface DraftSummary { id: number; kind: string; title: string | null; updated_at: string }
export interface BoardData { view: 'current' | 'completed'; columns: Record<StageKey, BoardOrder[]>; cancelled: BoardOrder[]; drafts: DraftSummary[]; counts: { current: number; completed: number } | null }

/* ------------------------------------------------------------------------------------------- reading the API */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown, fallback = 0): number => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : fallback; };
const TONES: Tone[] = ['blue', 'amber', 'violet', 'green', 'red', 'grey'];
const toneOf = (v: unknown, fallback: Tone): Tone => {
  const t = str(v).toLowerCase();
  if ((TONES as string[]).includes(t)) return t as Tone;
  return ({ orange: 'amber', yellow: 'amber', purple: 'violet', cyan: 'blue', gray: 'grey' } as Record<string, Tone>)[t] ?? fallback;
};
/** Never show what staff marked internal, even if a reply carried it. */
const isCustomerFacing = (v: Raw) => !['internal', 'staff', 'private'].includes(str(v.visibility).toLowerCase()) && v.internal !== true;

function defaultSubStatus(stage: StageKey | 'cancelled', approval: Approval): SubStatus {
  if (stage === 'design') {
    if (approval === 'review') return { key: 'approval_needed', label: 'Approval needed', tone: 'amber' };
    if (approval === 'changes') return { key: 'changes_requested', label: 'Changes requested', tone: 'violet' };
    if (approval === 'approved') return { key: 'design_approved', label: 'Design approved', tone: 'green' };
    return { key: 'design_in_progress', label: 'Design in progress', tone: 'violet' };
  }
  return ({
    received: { key: 'received', label: 'Order received', tone: 'blue' },
    production: { key: 'in_production', label: 'In production', tone: 'violet' },
    shipped: { key: 'in_transit', label: 'In transit', tone: 'blue' },
    delivered: { key: 'delivered', label: 'Delivered', tone: 'green' },
    cancelled: { key: 'cancelled', label: 'Cancelled', tone: 'grey' },
  } as Record<string, SubStatus>)[stage];
}

/** payments-api.md §1: the words and colours when a reply leaves them out. */
const PAYMENT_WORDS: Record<string, [string, Tone]> = {
  quote_required: ['Quote required', 'amber'], awaiting_payment: ['Awaiting payment', 'amber'], part_paid: ['Deposit paid', 'blue'],
  paid: ['Paid', 'green'], refunded: ['Refunded', 'grey'], cancelled: ['Cancelled', 'grey'],
};

/** The payment summary in an order (`payment`, payments-api.md §2); null when the order has no invoice yet. */
export function readPayment(order: Raw): PaymentSummary | null {
  const p = obj(order.payment);
  const status = str(p?.status).toLowerCase();
  if (!p || !status) return null;
  const [label, tone] = PAYMENT_WORDS[status] ?? [str(p.label, 'Payment'), 'grey' as Tone];
  const attempt = obj(p.last_attempt);
  return {
    status, label: str(p.label, label), tone: toneOf(p.tone, tone),
    payable: p.can_pay !== undefined ? p.can_pay === true : (status === 'awaiting_payment' || status === 'part_paid') && !!p.invoice_number,
    invoiceNumber: strOrNull(p.invoice_number), currency: str(p.currency, str(order.currency, 'AUD')),
    total: strOrNull(p.total), amountPaid: strOrNull(p.amount_paid), amountDue: strOrNull(p.amount_due), depositDue: strOrNull(p.deposit_due),
    issuedAt: strOrNull(p.issued_at), dueAt: strOrNull(p.due_at), paidAt: strOrNull(p.paid_at), payUrl: strOrNull(p.pay_url), pdf: strOrNull(p.pdf),
    lastAttempt: attempt && str(attempt.status) ? { status: str(attempt.status), message: strOrNull(attempt.message), at: strOrNull(attempt.at) } : null,
    reasons: arr(p.reasons).map(r => str(obj(r)?.message ?? r)).filter(Boolean),
    raw: p,
  };
}
/** The pay page for an invoice (the payments agent's Review & Pay page). */
export const payPath = (payment: PaymentSummary) => (payment.invoiceNumber ? `/invoices/${encodeURIComponent(payment.invoiceNumber)}` : null);

function readGarments(o: Raw, project: Raw | null): BoardGarment[] {
  const list = arr(o.garments).length ? arr(o.garments) : arr(o.items);
  const garments = list.map(obj).filter((g): g is Raw => !!g).map(g => ({
    garment: str(g.garment, 'other'), name: str(g.name ?? g.label, garmentName(str(g.garment, 'other'))), quantity: num(g.quantity, Object.values(obj(g.sizes) ?? {}).reduce<number>((a, b) => a + num(b), 0)),
    thumbnail: strOrNull(g.thumbnail),
  }));
  if (garments.length || !project) return garments;
  // An older order of a Studio kit: the kit is the one garment.
  return [{ garment: str(project.garment, 'jersey'), name: str(project.name, 'Kit'), quantity: num(o.quantity), thumbnail: strOrNull(project.thumbnail) }];
}

/** One card's order, whatever the reply's age (a BoardOrder, or an older order row). */
export function readBoardOrder(raw: unknown): BoardOrder | null {
  const o = obj(raw);
  if (!o || o.id === undefined) return null;
  const status = str(o.status, 'pending');
  const given = str(o.stage);
  const stage = (STAGES.some(s => s.key === given) || given === 'cancelled' ? given : STAGE_OF[status] ?? 'received') as StageKey | 'cancelled';
  const approvalRaw = str(o.approval);
  const approval = (['waiting', 'review', 'approved', 'changes'].includes(approvalRaw) ? approvalRaw : null) as Approval;
  const sub = obj(o.sub_status);
  const fallback = defaultSubStatus(stage, approval);
  const project = obj(o.project);
  const number = str(o.number, `3DZ-${String(o.id).padStart(5, '0')}`);
  const latest = obj(o.latest_update);
  const track = obj(o.tracking);
  const tracking = track && (track.carrier || track.number || track.url) ? { carrier: strOrNull(track.carrier), number: strOrNull(track.number), url: safeLink(track.url) } : (o.carrier || o.tracking_number) ? { carrier: strOrNull(o.carrier), number: strOrNull(o.tracking_number), url: safeLink(o.tracking_url) } : null;
  const actionRaw = str(o.action);
  const action = actionRaw === 'review_design' || actionRaw === 'track_delivery' ? actionRaw
    : approval === 'review' && stage === 'design' ? 'review_design' : stage === 'shipped' && tracking ? 'track_delivery' : null;
  return {
    id: num(o.id), number, name: str(o.name) || str(o.team_name) || str(project?.name) || `Order ${number}`, source: str(o.source, project ? 'studio' : 'admin'),
    status, stage, sub_status: sub ? { key: str(sub.key, fallback.key), label: str(sub.label, fallback.label), tone: toneOf(sub.tone, fallback.tone) } : fallback, approval,
    quantity: num(o.quantity), garments: readGarments(o, project), submitted_at: str(o.submitted_at ?? o.created_at), updated_at: str(o.updated_at ?? o.created_at),
    latest_update: latest && str(latest.text) ? { kind: str(latest.kind), text: str(latest.text), at: str(latest.at ?? latest.created_at) } : null,
    tracking, action, completed: o.completed === true || stage === 'cancelled', payment: readPayment(o), cover: strOrNull(o.cover), needed_by: strOrNull(o.needed_by),
  };
}

function readFile(raw: unknown): OrderFile | null {
  const f = obj(raw);
  if (!f || f.id === undefined || !isCustomerFacing(f)) return null;
  const name = str(f.name, 'file');
  return {
    id: num(f.id), kind: str(f.kind, 'other'), name, extension: str(f.extension, name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''), mime_type: str(f.mime_type),
    size: f.size === null || f.size === undefined ? null : num(f.size), thumb: strOrNull(f.thumb), download: str(f.download, `/order-files/${f.id}`), created_at: strOrNull(f.created_at),
    version: f.version === null || f.version === undefined ? null : num(f.version), review_status: strOrNull(f.review_status), reviewed_at: strOrNull(f.reviewed_at), review_note: strOrNull(f.review_note),
  };
}
const readPlayers = (v: unknown): Player[] => arr(v).map(obj).filter((p): p is Raw => !!p).map(p => ({ name: str(p.name), number: str(p.number), size: strOrNull(p.size) }));
const readSizes = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(v) ?? {}).map(([k, n]) => [k, num(n)]).filter(([, n]) => (n as number) > 0));

/** The order detail (orders-api.md §9). Internal files and updates are dropped here. */
export function readOrderDetail(raw: unknown): OrderDetail | null {
  const base = readBoardOrder(raw);
  const o = obj(raw);
  if (!base || !o) return null;
  const files = arr(o.files).map(readFile).filter((f): f is OrderFile => !!f);
  // Proof versions (orders-api.md §10: `proofs` newest first, `proof` the newest), with any proof among the files;
  // newest version first (files without a number are counted in upload order).
  const proofFiles = files.filter(f => f.kind === 'proof');
  for (const extra of [...arr(o.proofs), o.proof].map(readFile)) if (extra && !proofFiles.some(f => f.id === extra.id)) proofFiles.push(extra);
  const ordered = [...proofFiles].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id - b.id);
  ordered.forEach((f, i) => { if (f.version === null) f.version = i + 1; });
  const proofs = ordered.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const items = arr(o.items).map(obj).filter((i): i is Raw => !!i).map(i => {
    const sizes = readSizes(i.sizes);
    return { garment: str(i.garment, 'other'), name: str(i.name ?? i.label, garmentName(str(i.garment, 'other'))), fit: strOrNull(i.fit), sport: strOrNull(i.sport), sizes, quantity: num(i.quantity, Object.values(sizes).reduce((a, b) => a + b, 0)), players: readPlayers(i.players), thumbnail: strOrNull(i.thumbnail) };
  });
  const project = obj(o.project);
  const sizes = readSizes(o.sizes);
  // An "Order this kit" order has no rows: the kit, with the order's sizes, is the one row.
  if (!items.length && (project || Object.keys(sizes).length)) {
    const g = base.garments[0];
    items.push({ garment: g?.garment ?? str(project?.garment, 'jersey'), name: g?.name ?? str(project?.name, 'Kit'), fit: null, sport: strOrNull(project?.sport), sizes, quantity: base.quantity, players: [], thumbnail: g?.thumbnail ?? strOrNull(project?.thumbnail) });
  }
  const reached = obj(o.stages_reached) ?? {};
  return {
    ...base,
    team_name: strOrNull(o.team_name), contact_name: strOrNull(o.contact_name), contact_email: strOrNull(o.contact_email), phone: strOrNull(o.phone),
    shipping_address: strOrNull(o.shipping_address), needed_by: strOrNull(o.needed_by), notes: strOrNull(o.notes),
    items, sizes, names: strOrNull(o.names), players: readPlayers(o.players),
    total: strOrNull(o.total), currency: str(o.currency, 'AUD'), files, proof: proofs[0] ?? null, proofs,
    stages_reached: Object.fromEntries(Object.entries(reached).filter(([, v]) => typeof v === 'string')) as OrderDetail['stages_reached'],
    updates: arr(o.updates).map(obj).filter((u): u is Raw => !!u && isCustomerFacing(u)).map(u => ({
      id: (u.id as number | string | undefined) ?? `${str(u.kind)}-${str(u.created_at)}`, kind: str(u.kind, 'note'), text: str(u.text ?? u.message), message: strOrNull(u.message) === strOrNull(u.text) ? null : strOrNull(u.message),
      author: str(u.author, 'system'), file: readFile(u.file), approval: strOrNull(u.approval), created_at: str(u.created_at ?? u.at),
    })).filter(u => u.text),
  };
}

const emptyColumns = (): Record<StageKey, BoardOrder[]> => ({ received: [], design: [], production: [], shipped: [], delivered: [] });
const readOrders = (list: unknown): BoardOrder[] => arr(list).map(readBoardOrder).filter((o): o is BoardOrder => !!o);

/** The board reply (orders-api.md §8). */
export function readBoard(raw: unknown, view: 'current' | 'completed'): BoardData {
  const b = obj(raw) ?? {};
  const columns = emptyColumns();
  for (const s of arr(b.stages).map(obj)) {
    const key = str(s?.key) as StageKey;
    if (s && key in columns) columns[key] = readOrders(s.orders);
  }
  const counts = obj(b.counts);
  return {
    view, columns, cancelled: readOrders(b.cancelled),
    drafts: arr(b.drafts).map(obj).filter((d): d is Raw => !!d && d.id !== undefined).map(d => ({ id: num(d.id), kind: str(d.kind, 'form'), title: strOrNull(d.title), updated_at: str(d.updated_at) })),
    counts: counts ? { current: num(counts.current), completed: num(counts.completed) } : null,
  };
}

/* ------------------------------------------------------------------------------------------- words and dates */

const GARMENT_NAMES: Record<string, string> = { jersey: 'Jersey', shorts: 'Shorts', tee: 'Training tee', singlet: 'Singlet', polo: 'Polo', pocketpolo: 'Polo with pocket', hoodie: 'Hoodie', ziphoodie: 'Zip hoodie', varsity: 'Varsity jacket', trackjacket: 'Track jacket', jacket: 'Jacket', warmup: 'Warm-up top', pants: 'Track pants', socks: 'Socks', cap: 'Cap', fullkit: 'Full kit', other: 'Garment' };
export const garmentName = (id: string) => GARMENT_NAMES[id] ?? (id ? id[0].toUpperCase() + id.slice(1) : 'Garment');
/** "#3DZ-01048": the reference exactly as staff, emails and the admin board show it. */
export const displayRef = (number: string) => `#${number}`;
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const valid = (iso: string | null | undefined) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
/** "20 Oct" (this year) or "20 Oct 2025". */
export function shortDate(iso: string | null | undefined) {
  const d = valid(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
/** "20 Oct 2026 at 3:42 pm": a recorded response, with its date and time. */
export function dateTime(iso: string | null | undefined) {
  const d = valid(iso);
  if (!d) return '';
  return `${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP]M)$/i, (_, m: string) => ` ${m.toLowerCase()}`)}`;
}
/** "A$1,870.00", the site's one price style (money.ts); null without an amount. */
export const money = (amount: string | null, currency = 'AUD') => amount === null || amount === '' || Number.isNaN(Number(amount)) ? null : formatMoney(amount, currency);
export function fileSize(bytes: number | null) {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/** Only web links open from an order (a carrier's tracking page, a payment page). */
export function safeLink(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

/** The card's line under the pills: when it was submitted, its latest news, or when it last changed. */
export function cardLine(order: BoardOrder): { text: string; title?: string } {
  const latest = order.latest_update;
  if (order.stage === 'received' && (!latest || latest.kind === 'submitted' || latest.kind === 'stage')) return { text: `Submitted ${shortDate(order.submitted_at)}` };
  if (order.stage === 'delivered' && (!latest || ['stage', 'step', 'tracking'].includes(latest.kind))) return { text: `Delivered ${shortDate(latest?.at || order.updated_at)}` };
  // News the pill doesn't already say ("Sewing underway", "Out for delivery today"), else the date it changed.
  if (latest && !['submitted', 'stage', 'approval', 'proof'].includes(latest.kind) && latest.text.toLowerCase() !== order.sub_status.label.toLowerCase()) return { text: `Latest update: ${latest.text}`, title: `${latest.text} · ${dateTime(latest.at)}` };
  return { text: `Updated ${shortDate(latest?.at || order.updated_at)}`, title: latest ? `${latest.text} · ${dateTime(latest.at)}` : undefined };
}

/* ------------------------------------------------------------------------------------------- shared pieces */

export const toneClass = (tone: Tone) => `tone-${tone}`;

/** A rounded status with a coloured dot: "Approval needed", "Sewing", "In transit" … */
export function StatusPill({ status, className = '' }: { status: SubStatus; className?: string }) {
  return <span className={`ob-pill ${toneClass(status.tone)} ${className}`} data-status={status.key}><i aria-hidden="true" />{status.label}</span>;
}
/** The payment beside the status: "Awaiting payment", "Paid", "Quote required". */
export function PaymentPill({ payment }: { payment: PaymentSummary }) {
  return <span className={`ob-pill is-payment ${toneClass(payment.tone)}`} data-payment={payment.status}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="13" height="9" rx="2" /><path d="M1.5 6.5h13" /></svg>{payment.label}</span>;
}

/* Garment pictures: the saved design's picture when the order has one, else a drawn garment (orders-api.md §8). */
const SHAPES: Record<string, { body: string; lines?: string }> = {
  tee: { body: 'M40 16Q60 31 80 16L103 25 116 50 97 60 90 51V108H30V51L23 60 4 50 17 25Z', lines: 'M40 16Q60 31 80 16' },
  polo: { body: 'M40 15Q60 22 80 15L103 25 116 50 97 60 90 51V108H30V51L23 60 4 50 17 25Z', lines: 'M47 16 55 33 60 25 65 33 73 16M60 25V45' },
  singlet: { body: 'M41 11Q44 35 60 36 76 35 79 11L90 13Q87 39 95 52V108H25V52Q33 39 30 13Z', lines: 'M41 11Q44 35 60 36 76 35 79 11' },
  hoodie: { body: 'M43 22Q42 5 60 5 78 5 77 22L101 30 113 92 99 96 91 57V108H29V57L21 96 7 92 19 30Z', lines: 'M47 23Q60 39 73 23M55 31V47M65 31V47M42 82H78L75 100H45Z' },
  jacket: { body: 'M42 13Q60 24 78 13L100 23 113 92 99 96 91 55V108H29V55L21 96 7 92 20 23Z', lines: 'M60 21V108M42 13 52 30M78 13 68 30' },
  shorts: { body: 'M24 20H96L106 98 66 101 60 60 54 101 14 98Z', lines: 'M24 31H96M60 31V58' },
  pants: { body: 'M33 8H87L93 112H69L60 42 51 112H27Z', lines: 'M33 17H87M60 17V40' },
  socks: { body: 'M45 8H71V64L93 80Q102 90 94 102 87 111 74 104L45 86Z', lines: 'M45 18H71M45 25H71' },
  cap: { body: 'M17 72Q17 30 60 28 103 30 103 72Z', lines: 'M17 72H112Q110 82 95 82H17M60 28V34' },
  other: { body: 'M28 30 60 14 92 30V92L60 108 28 92Z', lines: 'M28 30 60 46 92 30M60 46V108' },
  form: { body: 'M30 8H74L94 28V112H30Z', lines: 'M74 8V28H94M42 50H82M42 64H82M42 78H70M42 92H62' },
};
const SHAPE_OF: Record<string, string> = { jersey: 'tee', tee: 'tee', training: 'tee', fullkit: 'tee', polo: 'polo', pocketpolo: 'polo', singlet: 'singlet', hoodie: 'hoodie', ziphoodie: 'hoodie', varsity: 'jacket', trackjacket: 'jacket', jacket: 'jacket', warmup: 'jacket', shorts: 'shorts', pants: 'pants', socks: 'socks', cap: 'cap', form: 'form' };

/** A drawn garment in the 3DEEZI colours, for an order row without a saved design picture. */
export function GarmentIcon({ garment }: { garment: string }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const shape = SHAPES[SHAPE_OF[garment] ?? 'other'];
  return <svg className="ob-garment-svg" viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#163a5a" /><stop offset="1" stopColor="#0a1a2d" /></linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#00d9ed" stopOpacity=".85" /><stop offset="1" stopColor="#4f6bff" stopOpacity=".55" /></linearGradient>
      <clipPath id={`${id}c`}><path d={shape.body} /></clipPath>
    </defs>
    <path d={shape.body} fill={`url(#${id}f)`} />
    <g clipPath={`url(#${id}c)`}><path d="M18 120 70 0H86L34 120Z" fill={`url(#${id}s)`} opacity=".55" /><path d="M48 120 100 0H106L54 120Z" fill="#7fe9ff" opacity=".35" /></g>
    <path d={shape.body} fill="none" stroke="#5fd3f5" strokeWidth="2.2" strokeLinejoin="round" />
    {shape.lines && <path d={shape.lines} fill="none" stroke="#5fd3f5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />}
  </svg>;
}

/** One garment's picture: the design's own picture, or the drawn garment if there is none (or it fails to load). */
export function GarmentPicture({ garment, thumbnail, alt }: { garment: string; thumbnail: string | null; alt: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = thumbnail && failed !== thumbnail ? thumbnail : null;
  return <span className={`ob-garment${shown ? ' has-picture' : ''}`} data-garment={garment}>
    {shown ? <img src={shown} alt={alt} draggable={false} loading="lazy" onError={() => setFailed(shown)} />
      : <span className="ob-garment-icon" role="img" aria-label={alt}><GarmentIcon garment={garment} /></span>}
  </span>;
}

/** A section heading inside the order detail. */
export function DetailSection({ id, title, icon, children, className = '', aside }: { id: string; title: string; icon?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return <section className={`obd-section ${className}`} id={id} aria-labelledby={`${id}-h`}>
    <header className="obd-section-head"><h3 id={`${id}-h`}>{icon}{title}</h3>{aside}</header>
    {children}
  </section>;
}
