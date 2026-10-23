/**
 * Create Order Form (/orders/new): an order built from scratch. ① contact and team, ② garments (type, fit, a saved
 * design or uploaded artwork, sizes and quantities, optional player names and numbers), ③ artwork and design
 * instructions; the order summary and 3DEEZI Assist beside them; Save draft and Review order along the bottom.
 * REVIEW & APPROVE ORDER (components/OrderReviewApprove.tsx) shows it read-only: mockups, garments, the size table, delivery
 * and the price; ticking the confirm box enables Approve Order, which makes ONE order (3DZ-…, idempotency key).
 *
 * Drafts: kept on this device as you type (localStorage, also signed out) and saved to the account with Save draft
 * (order drafts API, orders-api.md §3). Signed out, the page asks to sign in and carries on with the draft after.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, ClipboardPaste, CreditCard, Info, LoaderCircle, LogIn, Palette, Paperclip, Plus, Settings, Shirt, Trash2, TriangleAlert, X } from 'lucide-react';
import { api, ApiError, fetchFile, media, type Catalog, type Project, type User } from '../api';
import { clearIdempotencyKey, idempotencyKey, orderApi, uploadOrderFile, type OrderDetail, type OrderFile, type Payment } from '../orderApi';
import { AssistCard, ContactDetailsCard, FileDropBox, OrderBottomBar, OrderField, OrderPageHeader, OrderPageLayout, OrderSection, OrderSummaryCard, checkFiles, emptyContact, type ContactDetails, type SummaryRow, type UploadItem } from '../components/OrderPageParts';
import { PriceBreakdown, PricingChoices, type Quote as PayQuote } from '../components/OrderPayment';
import { OrderReviewApprove, OrderSentPanel, ReviewApproveHeader, layoutFor, paymentPath, type ReviewDesign, type ReviewFile, type ReviewGarment, type ReviewRow } from '../components/OrderReviewApprove';
import { DEFAULT_LEAD_WEEKS, DeliveryFieldsCard, EMPTY_DELIVERY, MOBILE_MESSAGE, choiceDestination, dateText, deliveryErrors, deliveryPayload, deliveryText, mobileError, pickDelivery, validMobile, type DeliveryErrors, type DeliveryFields } from '../components/OrderDeliveryFields';
import { ALL_SIZES, SET_NAMES, rareText, rowSizes, siteSize, sizeFit, sizeGroups } from '../orderSizes';
import '../../css/order-form.css';

/* ================================================================================================ API shapes */
// Orders: orderApi.ts (orders-api.md). Prices: payments-api.md §2–3 (shapes below until its components are in).

interface Option { id: string; name: string }
/** The parts of the order options (GET /orders/options) this form uses. */
interface FormOptions { garments: Option[]; sports: Option[]; fits: Option[]; sizes: string[]; files: { artwork: { extensions: string[]; max_kb: number }; max_files: number } }
interface Player { name: string; number: string; size?: string }
interface FormItem { garment: string; sport?: string; fit?: string; label?: string; project_id?: number; sizes: Record<string, number>; players?: Player[] }
interface PricingChoice { destination?: string; extras?: string[]; discount_code?: string }
/** The order fields (orders-api.md §2) with the customer's pricing choices (payments-api.md R3). */
interface FormFields { contact_name: string; contact_email: string; phone: string; team_name: string; notes: string; items: FormItem[]; pricing?: PricingChoice;
  /** The date required and Deliver / Pick up with the address (components/OrderDeliveryFields.tsx, 2026-10-22). */
  needed_by: string; delivery: string; address: Record<string, string> }
/** A garment read from "Help me add sizes" (the server's reader, or this page's own: it may have no garment yet). */
interface AssistItem { garment: string | null; sport?: string | null; fit?: string | null; sizes: Record<string, number>; stated?: number }
interface SizesReply { items: AssistItem[]; unknown?: string[] }
interface Money { name: string; code?: string | null; amount: string }
interface QuoteLine { key: string; name: string; quantity: number; unit_price: string | null; total: string | null; priced: boolean; unit?: string }
interface Quote {
  status: 'priced' | 'quote_required'; currency: string; quantity?: number; lines: QuoteLine[]; extras?: QuoteLine[];
  shipping?: { name: string; amount: string | null; priced: boolean } | null; discounts?: Money[]; subtotal: string | null;
  tax?: { name: string; rate: string; amount: string | null; included: boolean; applies: boolean } | null; total: string | null;
  reasons?: { code: string; message: string }[]; discount_code?: { code: string; valid: boolean; message: string | null } | null;
}
interface PricingOptions { currency: string; extras: { code: string; name: string; unit: string; unit_price: string; auto: boolean }[]; destinations: { code: string; name: string }[]; default_destination: string; discount_codes: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const DEFAULT_OPTIONS: FormOptions = {
  garments: [['jersey', 'Jersey'], ['shorts', 'Shorts'], ['tee', 'Training tee'], ['singlet', 'Singlet'], ['polo', 'Polo'], ['hoodie', 'Hoodie'], ['jacket', 'Jacket'], ['warmup', 'Warm-up top'], ['pants', 'Track pants'], ['socks', 'Socks'], ['cap', 'Cap'], ['other', 'Other']].map(([id, name]) => ({ id, name })),
  sports: [],
  fits: [['mens', 'Mens'], ['womens', 'Womens'], ['youth', 'Kids'], ['unisex', 'Unisex']].map(([id, name]) => ({ id, name })),
  sizes: ALL_SIZES,
  files: { artwork: { extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'cdr', 'psd', 'tif', 'tiff', 'heic'], max_kb: 25600 }, max_files: 15 },
};
const MAX_ROWS = 30, MAX_PLAYERS = 300, STORE = '3deezi.order-form';
/** Garments with a picture (public/media/showroom/garment-<id>.webp); the rest show a shirt icon. */
const ART = new Set(['jersey', 'shorts', 'tee', 'singlet', 'polo', 'socks', 'hoodie']);
const WORDS: Record<string, [string, string]> = { jersey: ['jersey', 'jerseys'], shorts: ['shorts', 'shorts'], tee: ['tee', 'tees'], singlet: ['singlet', 'singlets'], polo: ['polo', 'polos'], hoodie: ['hoodie', 'hoodies'], jacket: ['jacket', 'jackets'], warmup: ['warm-up top', 'warm-up tops'], pants: ['track pants', 'track pants'], socks: ['socks', 'socks'], cap: ['cap', 'caps'], other: ['item', 'items'] };

/* ================================================================================================ the form's data */

interface PlayerRow { key: string; name: string; number: string; size: string }
interface Row { key: string; garment: string; sport: string; fit: string; label: string; project_id: number | null; sizes: Record<string, number>; players: PlayerRow[]; open: boolean; more: boolean; file_ids: number[] }
interface FormState { contact: ContactDetails; rows: Row[]; notes: string; pricing: PricingChoice; delivery: DeliveryFields }

let seq = 0;
const makeKey = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
const newRow = (p: Partial<Row> = {}): Row => ({ key: makeKey('r'), garment: 'jersey', sport: '', fit: 'mens', label: '', project_id: null, sizes: {}, players: [], open: false, more: false, file_ids: [], ...p });
const freshForm = (sport: string): FormState => ({ contact: emptyContact(), rows: [newRow({ sport, open: true })], notes: '', pricing: {}, delivery: { ...EMPTY_DELIVERY } });
const sum = (sizes: Record<string, number>) => Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0);
const digits = (v: string, n = 3) => v.replace(/\D/g, '').slice(0, n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The order row for a saved design's garment: a full kit starts as its jersey, a zip hoodie is a hoodie, the pocket polo a polo. */
const PROJECT_ROWS: Record<string, string> = { fullkit: 'jersey', ziphoodie: 'hoodie', pocketpolo: 'polo', varsity: 'jacket', trackjacket: 'jacket' };
const orderGarment = (garment: string, o: { garments: Option[] }) => { const g = PROJECT_ROWS[garment] ?? garment; return o.garments.some(x => x.id === g) ? g : 'jersey'; };
/** A saved design's garment as the Studio names it ("Zip hoodie", "Full kit"). */
const DESIGN_GARMENTS: Record<string, string> = { fullkit: 'Full kit', tee: 'Training tee', pocketpolo: 'Polo with pocket', ziphoodie: 'Zip hoodie', varsity: 'Varsity jacket', trackjacket: 'Track jacket' };
const designGarment = (garment: string) => DESIGN_GARMENTS[garment] ?? capital(garment);
const word = (garment: string, n: number) => (WORDS[garment] ?? WORDS.other)[n === 1 ? 0 : 1];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v : '').slice(0, max);
function cleanSizes(value: unknown, allowed: string[]) {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value as Loose)) { const n = Math.floor(Number(v)); if (allowed.includes(k) && n > 0) out[k] = Math.min(10000, n); }
  return out;
}
const sizesText = (sizes: Record<string, number>, order: string[]) => order.filter(s => sizes[s]).map(s => `${sizes[s]} ${s}`).join(', ');

function rowName(r: Row, o: FormOptions, project?: Project | null) {
  if (r.garment === 'other') return r.label.trim() || 'Other garment';
  // A saved design made as one of its sport's garments ("Netball dress", task 9.99) is ordered by that name.
  const product = project && project.id === r.project_id ? project.design?.productName?.trim() : '';
  if (product) return product;
  const garment = o.garments.find(g => g.id === r.garment)?.name ?? capital(r.garment);
  const sport = o.sports.find(s => s.id === r.sport)?.name;
  return sport ? `${sport} ${garment}` : garment;
}
const typeLabel = (r: Row) => (r.garment === 'other' ? r.label.trim() || 'Other garments' : capital((WORDS[r.garment] ?? WORDS.other)[1]));
const isPicture = (src: unknown): src is string => typeof src === 'string' && /^(data:image\/|https?:\/\/|\/)/.test(src);
function projectPicture(p: Project | undefined | null): string | null {
  if (!p) return null;
  const front = (p.design as Loose | undefined)?.renderFront;
  return isPicture(p.thumbnail) ? p.thumbnail : isPicture(front) ? front : null;
}
const garmentPicture = (garment: string) => (ART.has(garment) ? media(`showroom/garment-${garment}.webp`) : null);

/** The order fields to send (orders-api.md §2): no screen-only keys, nothing empty. */
function toOrderFields(f: FormState, sizes: string[]): FormFields {
  const pricing = Object.fromEntries(Object.entries(f.pricing).filter(([, v]) => (Array.isArray(v) ? v.length : !!v))) as PricingChoice;
  return {
    contact_name: f.contact.contact_name.trim(), contact_email: f.contact.contact_email.trim(), phone: f.contact.phone.trim(), team_name: f.contact.team_name.trim(), notes: f.notes.trim(),
    items: f.rows.map(r => {
      const players = r.players.filter(p => p.name.trim() || p.number).map(p => ({ name: p.name.trim(), number: p.number, ...(p.size ? { size: p.size } : {}) }));
      return { garment: r.garment, ...(r.sport ? { sport: r.sport } : {}), ...(r.fit ? { fit: r.fit } : {}), ...(r.garment === 'other' && r.label.trim() ? { label: r.label.trim() } : {}), ...(r.project_id ? { project_id: r.project_id } : {}), sizes: cleanSizes(r.sizes, sizes), ...(players.length ? { players } : {}) };
    }),
    ...(Object.keys(pricing).length ? { pricing } : {}),
    ...deliveryPayload(f.delivery),
  };
}
/** A draft keeps the order fields plus the screen's own keys (row ids, open rows, artwork per garment, blank player rows). */
function toDraftData(f: FormState, sizes: string[]) {
  const fields = toOrderFields(f, sizes);
  return { ...fields, notes: f.notes, items: f.rows.map((r, i) => ({ ...fields.items[i], players: r.players.map(p => ({ name: p.name, number: p.number, size: p.size })), key: r.key, open: r.open, more: r.more, file_ids: r.file_ids })) };
}
function fromData(d: Loose | null | undefined, sizes: string[]): FormState {
  const items: Loose[] = Array.isArray(d?.items) ? d!.items : [];
  return {
    contact: { contact_name: str(d?.contact_name, 120), contact_email: str(d?.contact_email, 190), team_name: str(d?.team_name, 120), phone: str(d?.phone, 40) },
    notes: str(d?.notes, 4000),
    pricing: d?.pricing && typeof d.pricing === 'object' ? (d.pricing as PricingChoice) : {},
    // An older draft has none of these: Deliver, in Australia, until chosen.
    delivery: { ...EMPTY_DELIVERY, ...pickDelivery(d) },
    rows: items.slice(0, MAX_ROWS).map(it => {
      const s = cleanSizes(it?.sizes, sizes), project = Number(it?.project_id) || null;
      const players: Loose[] = Array.isArray(it?.players) ? it.players : [];
      return newRow({
        ...(typeof it?.key === 'string' && it.key ? { key: it.key } : {}),
        garment: str(it?.garment, 30) || 'jersey', sport: str(it?.sport, 40), fit: str(it?.fit, 20), label: str(it?.label, 60), project_id: project, sizes: s,
        players: players.slice(0, MAX_PLAYERS).map(p => ({ key: makeKey('p'), name: str(p?.name, 40), number: digits(String(p?.number ?? '')), size: str(p?.size, 10) })),
        open: typeof it?.open === 'boolean' ? it.open : sum(s) > 0 || !!project, more: !!it?.more,
        file_ids: Array.isArray(it?.file_ids) ? it.file_ids.filter((n: unknown) => Number.isInteger(n)) : [],
      });
    }),
  };
}

/** Problems that stop the review, by field (the API's error keys, orders-api.md §6). */
function validate(f: FormState, o: FormOptions): Record<string, string> {
  const p: Record<string, string> = {};
  if (!f.contact.contact_name.trim()) p.contact_name = 'Add the contact name.';
  if (f.contact.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact.contact_email.trim())) p.contact_email = 'Check the email address.';
  if (!f.contact.team_name.trim()) p.team_name = 'Add your team or organisation.';
  // Mobile, date required and delivery, as on Upload Your Order (the server checks the same).
  const mobile = mobileError(f.contact.phone);
  if (mobile) p.phone = mobile;
  Object.assign(p, deliveryErrors(f.delivery));
  if (!f.rows.length) p.items = 'Add at least one garment.';
  f.rows.forEach((r, i) => {
    if (!sum(r.sizes)) p[`items.${i}.sizes`] = `Add sizes and quantities for ${rowName(r, o)}.`;
    if (r.players.length > MAX_PLAYERS) p[`items.${i}.players`] = `A garment can have up to ${MAX_PLAYERS} player names.`;
  });
  return p;
}
/** The server's 422 errors on the same keys: a garment's other problems show under its row. */
function serverProblems(e: ApiError): Record<string, string> {
  const p: Record<string, string> = {};
  for (const [key, messages] of Object.entries(e.errors ?? {})) {
    const row = key.match(/^items\.(\d+)\.(sizes|players)?/);
    const at = row ? `items.${row[1]}.${row[2] ?? 'sizes'}` : ['contact_name', 'contact_email', 'team_name', 'phone', 'notes', 'items', 'needed_by', 'delivery'].includes(key) ? key
      : key.startsWith('address.') ? key.slice(8) : key === 'address' ? 'delivery' : 'general';
    p[at] = p[at] ? `${p[at]} ${messages[0]}` : messages[0];
  }
  if (!Object.keys(p).length) p.general = e.message;
  return p;
}

/* ================================================================================================ this device's copy */

interface Stored { v: 1; draftId: number | null; savedAt: string | null; saved: string; changedAt: string; data: Loose; files: OrderFile[] }
const storeKey = (owner: number | null) => `${STORE}.${owner ?? 'guest'}`;
function readStore(owner: number | null): Stored | null {
  try { const s = JSON.parse(localStorage.getItem(storeKey(owner)) || 'null'); return s && s.v === 1 && s.data ? s : null; } catch { return null; }
}
function writeStore(owner: number | null, s: Stored | null) {
  try { if (s) localStorage.setItem(storeKey(owner), JSON.stringify(s)); else localStorage.removeItem(storeKey(owner)); } catch { /* full or blocked: the form still works */ }
}

/* ================================================================================================ "Help me add sizes" */

/** The server's reader (orders-api.md §7); this page's own when that can't be reached. */
async function readSizes(text: string, o: FormOptions): Promise<SizesReply> {
  try { return await orderApi.assist(text); }
  catch (e) { const status = (e as ApiError).status; if (!status || status === 404 || status === 405 || status >= 500) return readSizesHere(text, o); throw e; }
}

const GARMENT_ALIASES: [RegExp, string][] = [[/^(jerseys?|guernseys?|jumpers?)$/, 'jersey'], [/^shorts?$/, 'shorts'], [/^(tees?|tshirts?|t-shirts?|shirts?)$/, 'tee'], [/^singlets?$/, 'singlet'], [/^polos?$/, 'polo'], [/^(hoodies?|hoodys?)$/, 'hoodie'], [/^jackets?$/, 'jacket'], [/^(warmups?|warm-ups?)$/, 'warmup'], [/^(pants|trackpants|trackies)$/, 'pants'], [/^socks?$/, 'socks'], [/^(caps?|hats?)$/, 'cap']];
const FIT_ALIASES: Record<string, string> = { men: 'mens', mens: 'mens', male: 'mens', women: 'womens', womens: 'womens', ladies: 'womens', female: 'womens', youth: 'youth', junior: 'youth', juniors: 'youth', kids: 'youth', unisex: 'unisex' };
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
type Tok = { t: 'n'; v: number } | { t: 's' | 'g' | 'fit'; v: string } | { t: 'sep' };

/** Reads "12 jerseys: 2 S, 4 M, 6 L", "18 jerseys M", "jerseys 2xS 4xM", "M x 12 jerseys", "12 jerseys M, 12 shorts L". */
function readSizesHere(text: string, o: FormOptions): SizesReply {
  // "M", "xxl", "5xl", "10y", "w12", "kids" (orderSizes.ts siteSize): only sizes the site has.
  const sizeOf = (w: string) => { const found = siteSize(w); return found && o.sizes.includes(found) ? found : null; };
  const garmentOf = (w: string) => GARMENT_ALIASES.find(([re]) => re.test(w))?.[1] ?? null;
  const toks: Tok[] = [];
  for (const m of text.toLowerCase().replace(/['’]/g, '').matchAll(/[a-z0-9]+(?:-[a-z0-9]+)*|[;\n]/g)) {
    const w = m[0];
    if (w === ';' || w === '\n') { toks.push({ t: 'sep' }); continue; }
    if (/^\d+$/.test(w)) { toks.push({ t: 'n', v: Math.min(10000, Number(w)) }); continue; }
    if (NUMBER_WORDS[w]) { toks.push({ t: 'n', v: NUMBER_WORDS[w] }); continue; }
    const size = sizeOf(w), garment = garmentOf(w), fit = FIT_ALIASES[w];
    if (size) toks.push({ t: 's', v: size });
    else if (garment) toks.push({ t: 'g', v: garment });
    else if (fit) toks.push({ t: 'fit', v: fit });
    else {
      const times = w.match(/^(\d+)x([a-z0-9]+)$/), glued = w.match(/^(\d+)([a-z][a-z-]*)$/);
      const part = times?.[2] ?? glued?.[2];
      const n = Number(times?.[1] ?? glued?.[1]);
      if (part && sizeOf(part)) toks.push({ t: 'n', v: n }, { t: 's', v: sizeOf(part)! });
      else if (glued && garmentOf(part!)) toks.push({ t: 'n', v: n }, { t: 'g', v: garmentOf(part!)! });
    }
  }
  const items: (AssistItem & { stated: number })[] = [];
  let cur: (AssistItem & { stated: number }) | null = null, num: number | null = null, size: string | null = null, fit: string | null = null;
  const push = (garment: string | null) => { const item = { garment, sport: null, fit, sizes: {} as Record<string, number>, stated: 0 }; fit = null; items.push(item); return item; };
  const put = (s: string, n: number) => { cur ??= push(null); cur.sizes[s] = Math.min(10000, (cur.sizes[s] ?? 0) + n); };
  // A size waiting for its number gets the garment's stated quantity ("18 jerseys M").
  const settle = () => { if (cur && size && cur.stated && !sum(cur.sizes)) { cur.sizes[size] = cur.stated; size = null; } };
  toks.forEach((tok, i) => {
    const next = toks[i + 1], after = toks[i + 2];
    if (tok.t === 'sep') { settle(); cur = null; num = null; size = null; return; }
    if (tok.t === 'fit') { if (cur && !cur.fit && !num) cur.fit = tok.v; else fit = tok.v; return; }
    if (tok.t === 'n') {
      if (next?.t === 'g' || (next?.t === 'fit' && after?.t === 'g')) { settle(); num = tok.v; return; }   // "12 jerseys": the garment's quantity
      if (size) { put(size, tok.v); size = null; return; }                                                 // "M 4", "M x 12"
      num = tok.v; return;
    }
    if (tok.t === 's') {
      if (num !== null) { put(tok.v, num); num = null; return; }                                           // "4 M"
      if (cur && cur.stated && !sum(cur.sizes) && next?.t !== 'n') { cur.sizes[tok.v] = cur.stated; return; } // "18 jerseys M"
      size = tok.v; return;
    }
    if (cur && !cur.garment && sum(cur.sizes) && num === null) { cur.garment = tok.v; return; }           // "2 S, 4 M jerseys"
    settle();
    cur = push(tok.v);
    cur.stated = num ?? 0; num = null;
    if (size && cur.stated) { cur.sizes[size] = cur.stated; size = null; }                                  // "M x 12 jerseys"
  });
  settle();
  return { items };
}

/* ================================================================================================ the page */

interface Props { user: User | null; restoring: boolean; requireAuth: (action?: () => void) => void; catalog: Catalog | null; onNotice: (text: string) => void }

export default function OrderFormPage(props: Props) {
  if (props.restoring) return <div className="page-shell empty-state"><LoaderCircle className="spin" /><p>Restoring your workspace…</p></div>;
  return <OrderForm {...props} />;
}

type Step = 'form' | 'review' | 'done';
type Upload = UploadItem & { rowKey?: string };
type Pending = 'save' | 'review' | 'upload';

function OrderForm({ user, requireAuth, catalog, onNotice }: Props) {
  const [params, setParams] = useSearchParams();
  const firstSport = catalog?.sports[0]?.id ?? 'rugby-league';
  // This device's copy: the account's, or the one filled in signed out (it becomes the account's when its owner signs in).
  const [initial] = useState(() => {
    const own = user ? readStore(user.id) : null, guest = readStore(null);
    const fromGuest = !!guest && (!user || !own || guest.changedAt > own.changedAt);
    const s = fromGuest ? guest : own;
    return { s, fromGuest: fromGuest && !!user };
  });
  const [options, setOptions] = useState<FormOptions>(() => ({ ...DEFAULT_OPTIONS, sports: catalog?.sports.map(({ id, name }) => ({ id, name })) ?? [] }));
  const [form, setFormState] = useState<FormState>(() => (initial.s ? fromData(initial.s.data, DEFAULT_OPTIONS.sizes) : freshForm(firstSport)));
  const [draftId, setDraftId] = useState<number | null>(initial.fromGuest ? null : initial.s?.draftId ?? null);
  const [files, setFiles] = useState<OrderFile[]>(initial.fromGuest ? [] : initial.s?.files ?? []);
  const [saved, setSaved] = useState<{ at: string | null; snapshot: string }>(() => (initial.fromGuest || !initial.s ? { at: null, snapshot: '' } : { at: initial.s.savedAt, snapshot: initial.s.saved }));
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [assistOpen, setAssistOpen] = useState<'sizes' | 'designs' | null>(null);
  const [playersOpen, setPlayersOpen] = useState(() => form.rows.some(r => r.players.length > 0));
  const [playersFor, setPlayersFor] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ row: Row; index: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [quote, setQuote] = useState<{ data: Quote | null; loading: boolean; error: string }>({ data: null, loading: false, error: '' });
  const [pricingOptions, setPricingOptions] = useState<PricingOptions | null | undefined>(undefined);
  /** REVIEW & APPROVE ORDER's box: "I confirm the selected garments, sizes, quantities and final mockups are correct". */
  const [approved, setApproved] = useState(false);
  const navigate = useNavigate();

  // The latest values for requests that finish later and for handlers registered once.
  const formRef = useRef(form); formRef.current = form;
  const userRef = useRef(user); userRef.current = user;
  const draftRef = useRef(draftId); draftRef.current = draftId;
  const authRef = useRef(requireAuth); authRef.current = requireAuth;
  const touched = useRef(!!initial.s);
  const changedAt = useRef(initial.s?.changedAt ?? new Date().toISOString());
  const guestAdopted = useRef(initial.fromGuest);
  const pending = useRef<Pending | null>(null);
  const pendingFiles = useRef<{ files: File[]; rowKey?: string } | null>(null);
  const savePromise = useRef<Promise<number | null> | null>(null);
  const submitLock = useRef(false);
  const transfers = useRef(new Map<string, { file: File; rowKey?: string; cancel?: AbortController }>());
  const previews = useRef(new Map<number, string>());

  /** A change made by the customer (kept on this device straight away). */
  function setForm(next: FormState | ((f: FormState) => FormState)) {
    touched.current = true;
    changedAt.current = new Date().toISOString();
    setFormState(prev => { const value = typeof next === 'function' ? next(prev) : next; formRef.current = value; return value; });
  }
  const updateRow = (key: string, patch: Partial<Row>) => setForm(f => ({ ...f, rows: f.rows.map(r => (r.key === key ? { ...r, ...patch } : r)) }));

  /* ------------------------------------------------------------------------------ loading */
  /** The usual production and delivery time (Admin › Settings): a sooner date required gets a gentle warning. */
  const [leadWeeks, setLeadWeeks] = useState(DEFAULT_LEAD_WEEKS);
  useEffect(() => {
    let live = true;
    orderApi.options().then(o => {
      if (!live || !o) return;
      if (typeof o.lead_time_weeks === 'number') setLeadWeeks(o.lead_time_weeks);
      setOptions(prev => ({
        garments: o.garments?.length ? o.garments : prev.garments, sports: o.sports?.length ? o.sports : prev.sports, fits: o.fits?.length ? o.fits : prev.fits, sizes: o.sizes?.length ? o.sizes : prev.sizes,
        files: { artwork: { ...prev.files.artwork, ...(o.files?.artwork ?? {}) }, max_files: o.files?.max_files ?? prev.files.max_files },
      }));
    }).catch(() => { /* not on this server yet: the usual garments, fits and sizes, and the catalog's sports */ });
    return () => { live = false; };
  }, []);
  useEffect(() => { if (catalog?.sports.length) setOptions(prev => (prev.sports.length ? prev : { ...prev, sports: catalog.sports.map(({ id, name }) => ({ id, name })) })); }, [catalog]);

  // Signed out: ask to sign in straight away (the form stays, and carries on after signing in).
  useEffect(() => { if (!userRef.current) authRef.current(); }, []);

  // Signed in (on opening, or after signing in here): the account's details, its saved designs, the saved draft,
  // then whatever was waiting for the sign-in (Save draft, Review order, files).
  useEffect(() => {
    if (!user) { setProjects(null); return; }
    let live = true;
    const f = formRef.current;
    const contact = { ...f.contact, contact_name: f.contact.contact_name || user.name, contact_email: f.contact.contact_email || user.email };
    if (contact.contact_name !== f.contact.contact_name || contact.contact_email !== f.contact.contact_email) { formRef.current = { ...f, contact }; setFormState(formRef.current); }
    if (readStore(null) && touched.current && !draftRef.current) guestAdopted.current = true;
    api<Project[]>('/projects').then(p => live && setProjects(p)).catch(() => live && setProjects([]));

    const wanted = Number(params.get('draft')) || null;
    const id = wanted ?? draftRef.current;
    if (id) {
      orderApi.draft(id).then(d => {
        if (!live) return;
        const serverNewer = !!d.updated_at && d.updated_at > changedAt.current;
        if (id !== draftRef.current || serverNewer) {
          const next = fromData(d.data as Loose, options.sizes);
          formRef.current = next; setFormState(next); touched.current = true;
          setSaved({ at: d.updated_at ?? null, snapshot: JSON.stringify(toDraftData(next, options.sizes)) });
          setPlayersOpen(next.rows.some(r => r.players.length > 0));
        }
        draftRef.current = d.id; setDraftId(d.id);
        if (Array.isArray(d.files)) setFiles(d.files);
      }).catch(e => {
        if (!live || (e as ApiError).status !== 404) return;
        if (wanted && wanted !== draftRef.current) onNotice('That draft can’t be found: it may have been sent or deleted.');
        else { draftRef.current = null; setDraftId(null); setFiles([]); setSaved({ at: null, snapshot: '' }); onNotice('Your saved draft is no longer in your account (it may have been sent). What you entered is still here.'); }
      });
      if (wanted) setParams(p => { p.delete('draft'); return p; }, { replace: true });
    }

    const waiting = pending.current;
    pending.current = null;
    if (waiting === 'save') void saveDraft();
    else if (waiting === 'review') void review();
    else if (waiting === 'upload' && pendingFiles.current) { const p = pendingFiles.current; pendingFiles.current = null; void addFiles(p.files, p.rowKey); }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ------------------------------------------------------------------------------ this device's copy */
  const snapshot = useMemo(() => JSON.stringify(toDraftData(form, options.sizes)), [form, options.sizes]);
  const dirty = snapshot !== saved.snapshot;
  const persist = useRef(() => {});
  persist.current = () => {
    if (!touched.current && !draftRef.current) return;
    const owner = userRef.current?.id ?? null;
    writeStore(owner, { v: 1, draftId: draftRef.current, savedAt: saved.at, saved: saved.snapshot, changedAt: changedAt.current, data: toDraftData(formRef.current, options.sizes), files });
    if (owner !== null && guestAdopted.current) { writeStore(null, null); guestAdopted.current = false; }
  };
  useEffect(() => { if (step === 'done') return; const t = setTimeout(() => persist.current(), 250); return () => clearTimeout(t); }, [form, draftId, files, saved, user?.id, step]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (step !== 'done') persist.current();
      if ([...transfers.current.values()].some(t => t.cancel)) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [step]);

  /* ------------------------------------------------------------------------------ sign-in, saving */
  /** Opens the sign-in; what was asked for carries on once signed in (see the effect on user above). */
  function needSignIn(kind: Pending) { authRef.current(() => { pending.current = kind; }); }

  function saveDraft(quiet = false): Promise<number | null> {
    if (!userRef.current) { needSignIn('save'); return Promise.resolve(null); }
    const run = (savePromise.current ?? Promise.resolve(null)).catch(() => null).then(() => sendDraft(quiet));
    savePromise.current = run;
    void run.finally(() => { if (savePromise.current === run) savePromise.current = null; });
    return run;
  }
  async function sendDraft(quiet: boolean): Promise<number | null> {
    setSaving(true); setSaveError('');
    const data = toDraftData(formRef.current, options.sizes), sent = JSON.stringify(data);
    const create = () => orderApi.createDraft('form', data);
    try {
      let draft: { id: number; updated_at?: string };
      if (draftRef.current) {
        try { draft = await orderApi.saveDraft(draftRef.current, data); }
        catch (e) {
          if ((e as ApiError).status !== 404) throw e;
          draft = await create();
          setFiles([]);
          onNotice('Your earlier draft was no longer in your account, so this was saved as a new draft. Add your files again.');
        }
      } else draft = await create();
      draftRef.current = draft.id; setDraftId(draft.id);
      setSaved({ at: draft.updated_at ?? new Date().toISOString(), snapshot: sent });
      if (!quiet) onNotice('Draft saved. It stays in your account until you send it.');
      return draft.id;
    } catch (e) {
      const message = (e as Error).message;
      setSaveError(message);
      if (!quiet) onNotice(`The draft wasn’t saved: ${message}`);
      return null;
    } finally { setSaving(false); }
  }
  async function ensureDraft() {
    if (savePromise.current) await savePromise.current.catch(() => null);
    return draftRef.current ?? (await saveDraft(true));
  }

  /* ------------------------------------------------------------------------------ files */
  const busyUploads = uploads.filter(u => u.status === 'uploading').length;
  async function addFiles(list: File[], rowKey?: string) {
    const { ok, refused } = checkFiles(list, { extensions: options.files.artwork.extensions, maxKb: options.files.artwork.max_kb, maxFiles: options.files.max_files, already: files.length + busyUploads });
    if (refused.length) onNotice(refused.join(' '));
    if (!ok.length) return;
    if (!userRef.current) { pendingFiles.current = { files: ok, rowKey }; needSignIn('upload'); return; }
    const id = await ensureDraft();
    if (id) ok.forEach(file => startUpload(id, file, rowKey));
  }
  function startUpload(draft: number, file: File, rowKey?: string, key = makeKey('u')) {
    const preview = /^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type) ? URL.createObjectURL(file) : null;
    const item: Upload = { id: key, name: file.name, size: file.size, status: 'uploading', progress: 0, preview, rowKey };
    setUploads(u => [...u.filter(x => x.id !== key), item]);
    const cancel = new AbortController();
    transfers.current.set(key, { file, rowKey, cancel });
    uploadOrderFile(draft, file, 'artwork', fraction => setUploads(u => u.map(x => (x.id === key ? { ...x, progress: fraction * 100 } : x))), cancel.signal).then(done => {
      transfers.current.delete(key);
      if (preview) previews.current.set(done.id, preview);
      setFiles(fs => [...fs.filter(f => f.id !== done.id), done]);
      setUploads(u => u.filter(x => x.id !== key));
      if (rowKey) setForm(f => ({ ...f, rows: f.rows.map(r => (r.key === rowKey ? { ...r, file_ids: [...r.file_ids, done.id] } : r)) }));
    }).catch((e: ApiError) => {
      if (cancel.signal.aborted) { transfers.current.delete(key); if (preview) URL.revokeObjectURL(preview); setUploads(u => u.filter(x => x.id !== key)); return; }
      transfers.current.set(key, { file, rowKey });
      setUploads(u => u.map(x => (x.id === key ? { ...x, status: 'error', error: e.message } : x)));
    });
  }
  function retryUpload(item: UploadItem) {
    const t = transfers.current.get(item.id);
    if (t && draftRef.current) startUpload(draftRef.current, t.file, t.rowKey, item.id);
  }
  function dropUpload(item: UploadItem) {
    const t = transfers.current.get(item.id);
    if (t?.cancel) { t.cancel.abort(); return; }
    transfers.current.delete(item.id);
    if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
    setUploads(u => u.filter(x => x.id !== item.id));
  }
  async function removeFile(fileId: number) {
    const file = files.find(f => f.id === fileId), id = draftRef.current;
    if (!file || !id) return;
    const rowsWith = formRef.current.rows.filter(r => r.file_ids.includes(fileId)).map(r => r.key);
    setFiles(fs => fs.filter(f => f.id !== fileId));
    setForm(f => ({ ...f, rows: f.rows.map(r => ({ ...r, file_ids: r.file_ids.filter(n => n !== fileId) })) }));
    try { await orderApi.removeDraftFile(id, fileId); }
    catch (e) {
      if ((e as ApiError).status === 404) return;
      setFiles(fs => [...fs, file]);
      setForm(f => ({ ...f, rows: f.rows.map(r => (rowsWith.includes(r.key) ? { ...r, file_ids: [...r.file_ids, fileId] } : r)) }));
      onNotice(`${file.name} wasn’t removed: ${(e as Error).message}`);
    }
  }

  /* ------------------------------------------------------------------------------ garments */
  function addRow() {
    const rows = formRef.current.rows;
    if (rows.length >= MAX_ROWS) return;
    const last = rows.at(-1), sport = last?.sport ?? firstSport;
    const used = new Set(rows.filter(r => r.sport === sport).map(r => r.garment));
    const garment = ['jersey', 'shorts', 'socks', 'tee', 'polo', 'singlet', 'hoodie', 'jacket', 'warmup', 'pants', 'cap'].find(g => !used.has(g) && options.garments.some(o => o.id === g)) ?? 'jersey';
    const row = newRow({ garment, sport, fit: last?.fit || 'mens', open: !rows.length });
    setForm(f => ({ ...f, rows: [...f.rows, row] }));
    setFocusKey(row.key);
  }
  /** "+ Womens sizes" / "+ Kids sizes": the same garment (sport, design) again, just after it, in that fit. */
  function addFitRow(key: string, fit: string) {
    const rows = formRef.current.rows, at = rows.findIndex(r => r.key === key);
    if (at < 0 || rows.length >= MAX_ROWS) return;
    const from = rows[at];
    const row = newRow({ garment: from.garment, sport: from.sport, label: from.label, project_id: from.project_id, fit, open: true });
    setForm(f => { const next = [...f.rows]; next.splice(next.findIndex(r => r.key === key) + 1, 0, row); return { ...f, rows: next }; });
    setFocusKey(row.key);
  }
  function removeRow(key: string) {
    const index = formRef.current.rows.findIndex(r => r.key === key);
    if (index < 0) return;
    setRemoved({ row: formRef.current.rows[index], index });
    setForm(f => ({ ...f, rows: f.rows.filter(r => r.key !== key) }));
  }
  function undoRemove() {
    if (!removed) return;
    setForm(f => { const rows = [...f.rows]; rows.splice(Math.min(removed.index, rows.length), 0, removed.row); return { ...f, rows }; });
    setRemoved(null);
  }
  useEffect(() => { if (!removed) return; const t = setTimeout(() => setRemoved(null), 9000); return () => clearTimeout(t); }, [removed]);

  /** "Help me add sizes": replaces the sizes of the matching garment (or the one chosen), else adds a garment. */
  function applySizes(items: AssistItem[], target: string) {
    const rows = [...formRef.current.rows], filled: string[] = [], missing: string[] = [];
    items.forEach((read, n) => {
      let item = read;
      const sizes = cleanSizes(item.sizes, options.sizes);
      // Only womens or only kids sizes: that fit, so the row shows that size set.
      const sets = new Set(Object.keys(sizes).map(sizeFit));
      if (!item.fit && sets.size === 1 && !sets.has('mens')) item = { ...item, fit: [...sets][0] };
      const noun = item.garment ? word(item.garment, 2) : 'garments';
      if (!sum(sizes)) { missing.push(item.stated ? `${item.stated} ${noun}` : noun); return; }
      const fits = (r: Row) => r.garment === item.garment && (!item.sport || r.sport === item.sport) && (!item.fit || r.fit === item.fit);
      let i = target !== 'auto' && n === 0 ? rows.findIndex(r => r.key === target) : -1;
      if (i < 0 && item.garment) { i = rows.findIndex(r => fits(r) && !sum(r.sizes)); if (i < 0) i = rows.findIndex(fits); }
      if (i < 0 && !item.garment) { i = rows.findIndex(r => !sum(r.sizes)); if (i < 0 && rows.length) i = 0; }
      if (i < 0) {
        if (rows.length >= MAX_ROWS) return;
        const last = rows.at(-1);
        rows.push(newRow({ garment: item.garment ?? 'jersey', sport: item.sport ?? last?.sport ?? firstSport, fit: item.fit ?? (sets.size === 1 ? 'mens' : last?.fit ?? 'mens'), sizes, open: true }));
        i = rows.length - 1;
      } else rows[i] = { ...rows[i], sizes, open: true, ...(item.fit && !rows[i].fit ? { fit: item.fit } : {}) };
      const counted = sum(sizes);
      filled.push(`${rowName(rows[i], options)}: ${sizesText(sizes, options.sizes)} (${counted})${item.stated && item.stated !== counted ? `. You said ${item.stated}, the sizes add up to ${counted}` : ''}`);
    });
    if (filled.length) setForm(f => ({ ...f, rows }));
    return { ok: filled.length > 0, text: [filled.length ? `Filled ${filled.join('; ')}.` : '', missing.length ? `Which sizes for the ${missing.join(' and the ')}? For example “18 jerseys M” or “12 shorts: 6 M, 6 L”.` : ''].filter(Boolean).join(' ') || 'No sizes found. Try “12 jerseys: 2 S, 4 M, 6 L”.' };
  }
  /** "Use one of my saved designs": on the chosen garment, else the matching one, else a new garment. */
  function applyDesign(p: Project, target: string) {
    const rows = [...formRef.current.rows];
    const garment = orderGarment(p.garment, options);
    let i = target === 'new' ? -1 : target !== 'auto' ? rows.findIndex(r => r.key === target) : rows.findIndex(r => r.garment === garment && !r.project_id);
    if (i < 0 && target === 'auto') i = rows.findIndex(r => r.garment === garment);
    if (i < 0 && target === 'auto') i = rows.findIndex(r => !r.project_id);
    if (i < 0) {
      if (rows.length >= MAX_ROWS) return `A form can have up to ${MAX_ROWS} garments.`;
      rows.push(newRow({ garment, sport: options.sports.some(s => s.id === p.sport) ? p.sport : rows.at(-1)?.sport ?? firstSport, project_id: p.id, open: true }));
      i = rows.length - 1;
    } else rows[i] = { ...rows[i], project_id: p.id, open: true };
    setForm(f => ({ ...f, rows }));
    return `${rowName(rows[i], options)} now uses “${p.name}”.`;
  }

  /* ------------------------------------------------------------------------------ review and confirm */
  async function review() {
    const problems = validate(formRef.current, options);
    setTried(true); setErrors(problems);
    if (Object.keys(problems).length) {
      setTimeout(() => { const first = document.querySelector<HTMLElement>('.op-page [aria-invalid="true"], .op-page .has-error'); first?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (first?.matches('input,select,textarea') ? first : first?.querySelector<HTMLElement>('input,select,button'))?.focus({ preventScroll: true }); }, 30);
      return;
    }
    if (!userRef.current) { needSignIn('review'); return; }
    if (busyUploads) { onNotice('Wait for your files to finish uploading, then review the order.'); return; }
    setSubmitError('');
    setApproved(false);
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    void saveDraft(true);
  }
  async function confirm() {
    if (submitLock.current) return;
    const problems = validate(formRef.current, options);
    if (Object.keys(problems).length) { setErrors(problems); setTried(true); setStep('form'); return; }
    if (!userRef.current) { needSignIn('review'); return; }
    submitLock.current = true; setSubmitting(true); setSubmitError('');
    try {
      if (savePromise.current) await savePromise.current.catch(() => null);
      // ONE key for this submission (orderApi keeps it for the tab): a retry or a second click gets the same order back.
      const scope = `form-${draftRef.current ?? 'new'}`, key = idempotencyKey(scope);
      const fields = toOrderFields(formRef.current, options.sizes);
      const placed = draftRef.current ? await orderApi.submitDraft(draftRef.current, key, fields) : await orderApi.submit({ source: 'form', ...fields }, key);
      clearIdempotencyKey(scope);
      writeStore(userRef.current?.id ?? null, null);
      touched.current = false;
      setDraftId(null); draftRef.current = null; setFiles([]); setUploads([]);
      setOrder(placed); setStep('done');
      // Approve Order made the order and its invoice: on to COMPLETE YOUR PAYMENT once that page is live (else Order sent).
      const payPage = paymentPath(placed);
      if (payPage) { navigate(payPage); return; }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422) { setErrors(serverProblems(err)); setTried(true); setStep('form'); onNotice('Please check the details marked in red.'); }
      else if (err.status === 404 && draftRef.current) setSubmitError('This draft was already sent or deleted. Check My Orders before sending it again.');
      else setSubmitError(err.message);
    } finally { submitLock.current = false; setSubmitting(false); }
  }
  function startAnother() {
    const next = freshForm(firstSport);
    if (user) next.contact = { ...next.contact, contact_name: user.name, contact_email: user.email };
    formRef.current = next; setFormState(next); touched.current = false;
    setSaved({ at: null, snapshot: '' }); setOrder(null); setTried(false); setErrors({}); setStep('form'); setQuote({ data: null, loading: false, error: '' });
    window.scrollTo({ top: 0 });
  }

  // The price for the review step (payments-api.md §3), again when the delivery, extras or discount code change.
  // Only where prices are switched on (GET /pricing/options answers); otherwise the review says 3DEEZI confirms it.
  const pricingKey = JSON.stringify(form.pricing);
  useEffect(() => {
    if (step !== 'review' || !pricingOptions) { setQuote({ data: null, loading: pricingOptions === undefined && step === 'review', error: '' }); return; }
    let live = true;
    const fields = toOrderFields(formRef.current, options.sizes);
    // Rows using a design made as a sport's garment are priced under that name ("Netball bibs"), as the order will be.
    const items = fields.items.map((item, i) => {
      const r = formRef.current.rows[i];
      const product = r && r.garment !== 'other' && r.project_id ? projects?.find(p => p.id === r.project_id)?.design?.productName?.trim() : '';
      return product && !item.label ? { ...item, label: product.slice(0, 60) } : item;
    });
    // As the order will be priced: the review's destination, else Deliver / Pick up and the country (as the server does).
    const choice = choiceDestination(formRef.current.delivery);
    const withChoice = (p: PricingChoice) => (p.destination || !choice ? p : { ...p, destination: choice });
    setQuote(q => ({ ...q, loading: true, error: '' }));
    const t = setTimeout(() => {
      api<Quote>('/pricing/quote', { method: 'POST', body: JSON.stringify({ items, pricing: withChoice(fields.pricing ?? {}) }) })
        .then(q => { if (live) setQuote({ data: q, loading: false, error: '' }); })
        .catch(e => { if (live) setQuote({ data: null, loading: false, error: [0, 404, 405].includes((e as ApiError).status) ? '' : (e as Error).message }); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pricingKey, pricingOptions, projects]);
  useEffect(() => { if (step === 'review' && pricingOptions === undefined) api<PricingOptions>('/pricing/options').then(setPricingOptions).catch(() => setPricingOptions(null)); }, [step, pricingOptions]);

  /* ------------------------------------------------------------------------------ what the side shows */
  const totalQty = form.rows.reduce((n, r) => n + sum(r.sizes), 0);
  const summaryRows: SummaryRow[] = useMemo(() => {
    const groups = new Map<string, { label: string; qty: number; missing: number }>();
    for (const r of form.rows) {
      const key = r.garment === 'other' ? `other:${r.label.trim().toLowerCase()}` : r.garment;
      const g = groups.get(key) ?? { label: typeLabel(r), qty: 0, missing: 0 };
      const n = sum(r.sizes);
      g.qty += n; if (!n) g.missing++;
      groups.set(key, g);
    }
    return [...groups.entries()].map(([key, g]) => ({ key, label: g.label, ...(g.qty && !g.missing ? { value: g.qty } : {}), pending: g.qty ? `${g.qty} · sizes needed` : 'Sizes needed' }));
  }, [form.rows]);
  const problems = useMemo(() => validate(form, options), [form, options]);
  const hint = !form.rows.length ? 'Add a garment to start your order.'
    : form.rows.some(r => !sum(r.sizes)) ? 'Complete garment quantities before review.'
    : problems.contact_name || problems.team_name || problems.contact_email || problems.phone ? 'Add your contact and team details before review.'
    : problems.needed_by || problems.delivery || problems.street || problems.suburb || problems.state || problems.postcode || problems.country ? 'Add the date required and the delivery address (or Pick up) before review.'
    : `Ready to review: ${totalQty} ${totalQty === 1 ? 'garment' : 'garments'}.`;
  const hintTone = Object.keys(problems).length ? 'info' : 'ok';
  // Section 1 follows what is typed now (a fixed field loses its message at once); the rest as last checked.
  const shownErrors: Record<string, string | undefined> = tried ? { ...errors, ...Object.fromEntries(['contact_name', 'contact_email', 'team_name', 'phone'].map(k => [k, problems[k]])) } : {};
  const describe = () => {
    const f = formRef.current, names = (r: Row) => projects?.find(p => p.id === r.project_id)?.name;
    return [
      `ORDER FORM (/orders/new, the customer's Create Order Form; not the Artboard). Step: ${step === 'review' ? 'REVIEW & APPROVE ORDER (final mockups, garments, sizes table, delivery & notes; ticking the confirm box enables Approve Order, which places the order; Back to Edit returns to the form)' : step === 'done' ? 'order sent' : 'filling it in'}.`,
      `Team / organisation: ${f.contact.team_name.trim() || '(empty)'}. Contact name ${f.contact.contact_name.trim() ? 'filled' : 'empty'}, email ${f.contact.contact_email.trim() ? 'filled' : 'empty'}, phone ${f.contact.phone.trim() ? 'filled' : 'empty'}.`,
      `Garments (${f.rows.length}):`,
      ...f.rows.map((r, i) => `${i + 1}. ${rowName(r, options)}, ${options.fits.find(x => x.id === r.fit)?.name ?? 'no fit'}, ${r.project_id ? `saved design "${names(r) ?? r.project_id}"` : 'no saved design'}, sizes: ${sizesText(r.sizes, options.sizes) || 'not filled yet'}${r.players.length ? `, ${r.players.length} player names` : ''}.`),
      `Artwork files: ${files.length}. Design instructions: ${f.notes.trim() ? 'written' : 'empty'}. Draft ${draftRef.current ? 'saved in the account' : 'not saved to the account yet'}.`,
      'On this page: + ADD GARMENT adds a garment; "Add sizes" opens its size boxes, chosen by the Fit (Mens and Unisex XS to 4XL, "+ 5XL–8XL" for more; Womens W8 to W20, "+ W22, W24"; Kids 6Y to 16Y, "+ 2Y, 4Y"); "+ Womens sizes" / "+ Kids sizes" under a garment adds the same garment in that fit; the 3DEEZI Assist card has "Help me add sizes" (type e.g. "12 jerseys: 2 S, 4 M, 6 L") and "Use one of my saved designs"; "+ Add player names & numbers" takes a list (Paste from Excel); section 3 takes logos and artwork and the design instructions; Save draft keeps it in the account; REVIEW ORDER opens REVIEW & APPROVE ORDER with the mockups, sizes and price, then the confirm box and Approve Order place it and give a 3DZ- reference.',
    ].join('\n').slice(0, 2900);
  };

  const statusText = saving ? 'Saving…' : !user ? (touched.current ? 'Kept on this device · sign in to save it to your account' : '')
    : saveError ? `Not saved: ${saveError}` : saved.at ? (dirty ? 'Unsaved changes · kept on this device' : `Draft saved ${new Date(saved.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`)
    : touched.current ? 'Not saved to your account yet · kept on this device' : '';

  const dropItems: UploadItem[] = [
    ...files.map(f => { const row = form.rows.find(r => r.file_ids.includes(f.id)); return { id: `f${f.id}`, name: f.name, size: f.size, status: 'done' as const, preview: f.thumb ?? previews.current.get(f.id) ?? null, ...(row ? { note: `for ${rowName(row, options)}` } : {}) }; }),
    ...uploads.map(u => { const row = u.rowKey ? form.rows.find(r => r.key === u.rowKey) : null; return { ...u, ...(row ? { note: `for ${rowName(row, options)}` } : {}) }; }),
  ];
  const playersRow = form.rows.find(r => r.key === playersFor) ?? form.rows.find(r => ['jersey', 'tee', 'singlet', 'polo', 'hoodie'].includes(r.garment)) ?? form.rows[0];
  const playerCount = form.rows.reduce((n, r) => n + r.players.length, 0);

  /* ------------------------------------------------------------------------------ the screen */
  if (step === 'done' && order) {
    // The invoice made for the order (payments-api.md §2): "Pay now" only while one can be paid (none while payments are off).
    const pay: Payment | null = order.invoice ?? order.payment ?? null;
    const payable = !!pay?.invoice_number && !!pay.can_pay;
    return <OrderPageLayout className="of-page is-done"
      header={<ReviewApproveHeader step="sent" firstStep="Order details" subtitle="Thank you. Your order is with the 3DEEZI team." />}
      main={<OrderSentPanel number={order.number} name={user?.name.split(' ')[0]} message="We’ll check your order and send you the design to approve. You can follow every step in My Orders."
        onView={() => navigate(`/orders?order=${order.id}`, { state: { order: order.id, number: order.number } })}
        pay={payable ? { label: <><CreditCard size={18} /> Pay now{pay!.amount_due != null ? ` · ${money(String(pay!.amount_due), pay!.currency || 'AUD')}` : ''}</>, onClick: () => navigate(`/invoices/${encodeURIComponent(pay!.invoice_number!)}`) } : null}
        note={pay?.status === 'quote_required' ? <p className="ora-sent-note"><Info size={16} /> We’re confirming your price and will send your invoice when it’s ready.</p> : null}
        another={{ label: 'Start another order', onClick: startAnother }} />} />;
  }

  const reviewing = step === 'review';
  // REVIEW & APPROVE ORDER (client design 2026-10-22, components/OrderReviewApprove.tsx): read only; Back to Edit returns to the form.
  if (reviewing) {
    const c = form.contact;
    const designRow = form.rows.find(r => r.project_id && projects?.some(p => p.id === r.project_id));
    const designProject = designRow ? projects?.find(p => p.id === designRow.project_id) ?? null : null;
    const back = designRow?.players.find(p => p.name.trim() || p.number);
    const reviewDesign: ReviewDesign | null = designProject ? { id: `${designProject.id}:${designProject.updated_at}`, name: designProject.name, garment: designProject.garment, design: designProject.design as ReviewDesign['design'], thumbnail: designProject.thumbnail, back: back ? { name: back.name.trim(), number: back.number } : null } : null;
    const garments: ReviewGarment[] = form.rows.map(r => {
      const project = projects?.find(p => p.id === r.project_id), d = project?.design as Loose | undefined;
      const fit = options.fits.find(f => f.id === r.fit)?.name, own = files.some(f => r.file_ids.includes(f.id));
      return {
        key: r.key, garment: r.garment, name: rowName(r, options, project), column: typeLabel(r),
        sub: [fit ? `${fit} fit` : '', project ? `Design: ${project.name}` : r.project_id ? 'Saved design' : own ? 'Your artwork' : ''].filter(Boolean).join(' · '),
        colours: project ? [d?.main, d?.secondary] : [],
        // A full kit's rows (jersey, shorts) show their own garment; a single-garment design shows its saved picture.
        thumb: (project && project.garment !== 'fullkit' ? projectPicture(project) : null) ?? garmentPicture(r.garment) ?? projectPicture(project),
        sizes: cleanSizes(r.sizes, options.sizes),
        players: r.players.filter(p => p.name.trim() || p.number).map(p => ({ name: p.name.trim(), number: p.number, size: p.size })),
      };
    });
    const reviewFiles: ReviewFile[] = files.map(f => ({ id: f.id, name: f.name, kind: f.kind, extension: f.extension, size: f.size, thumb: f.thumb, preview: previews.current.get(f.id) ?? null, download: f.download }));
    // The rows as the order takes them (with the row key and its artwork), for the layout rule and the per-garment sections.
    const reviewRows: ReviewRow[] = form.rows.map(r => ({ key: r.key, garment: r.garment, sport: r.sport || null, fit: r.fit || null, label: r.garment === 'other' ? r.label.trim() || null : null, project_id: r.project_id,
      sizes: cleanSizes(r.sizes, options.sizes), players: r.players.filter(p => p.name.trim() || p.number).map(p => ({ name: p.name.trim(), number: p.number, size: p.size || null })), file_ids: r.file_ids }));
    const layout = layoutFor(reviewRows);
    const priced = quote.data?.status === 'priced';
    const toForm = (id?: string) => {
      setStep('form');
      requestAnimationFrame(() => requestAnimationFrame(() => (id ? document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : window.scrollTo({ top: 0, behavior: 'smooth' }))));
    };
    return <OrderPageLayout className="of-page is-review"
      header={<ReviewApproveHeader step="review" firstStep="Order details" layout={layout} />}
      main={<OrderReviewApprove garments={garments} sizeOrder={options.sizes} design={reviewDesign} artwork={reviewFiles} files={reviewFiles} filesLabel="Artwork"
        layout={layout} rows={reviewRows} projects={projects} options={options} quote={quote.data as unknown as PayQuote | null} quoteLoading={quote.loading} quoteError={quote.error}
        onEditGarment={i => { const row = form.rows.filter(r => sum(r.sizes) > 0)[i]; if (row) updateRow(row.key, { open: true }); toForm('of-garments'); }}
        onDownload={f => { const file = files.find(x => x.id === f.id); if (file) orderApi.download(file).catch(e => onNotice(`Couldn’t download ${file.name}: ${(e as Error).message}`)); }}
        fetchFile={f => fetchFile(String(f.download))}
        delivery={{ contactName: c.contact_name, team: c.team_name, email: c.contact_email, phone: c.phone, phoneProblem: c.phone.trim() && !validMobile(c.phone) ? MOBILE_MESSAGE : null,
          neededBy: form.delivery.needed_by, neededByText: form.delivery.needed_by ? dateText(form.delivery.needed_by) : '', method: form.delivery.delivery === 'pickup' ? 'pickup' : 'deliver',
          address: form.delivery.delivery === 'pickup' ? null : deliveryText(form.delivery), notes: form.notes }}
        onEditDelivery={() => toForm('of-contact')}
        onEditGarments={() => toForm('of-garments')}
        price={priced || (quote.loading && !quote.data) ? <PriceBreakdown quote={quote.data as unknown as PayQuote | null} loading={quote.loading} error={quote.error} /> : undefined}
        priceNote={quote.error ? `The price couldn’t be worked out (${quote.error}). 3DEEZI confirms it after review.` : quote.data?.reasons?.map(r => r.message).join(' ') || '3DEEZI confirms the price after review, before you pay anything.'}
        priceOptions={pricingOptions ? <PricingChoices value={form.pricing} onChange={pricing => setForm(f => ({ ...f, pricing }))} /> : undefined}
        agreed={approved} onAgree={setApproved} busy={submitting} error={submitError}
        onBack={() => toForm()} onApprove={() => void confirm()} assistContext={describe} />} />;
  }
  const side = <>
    <OrderSummaryCard name={form.contact.team_name.trim() || 'Your team'} rows={summaryRows} empty="No garments added yet." hint={hint} tone={hintTone} />
    <AssistCard context={describe} actions={[
      { key: 'sizes', icon: <Shirt size={26} strokeWidth={1.6} />, label: 'Help me add sizes', open: assistOpen === 'sizes', onClick: () => setAssistOpen(o => (o === 'sizes' ? null : 'sizes')), panel: <SizesHelper rows={form.rows} options={options} onApply={applySizes} /> },
      { key: 'designs', icon: <Palette size={26} strokeWidth={1.6} />, label: 'Use one of my saved designs', open: assistOpen === 'designs', onClick: () => setAssistOpen(o => (o === 'designs' ? null : 'designs')), panel: <DesignsHelper rows={form.rows} options={options} projects={projects} signedIn={!!user} onSignIn={() => authRef.current()} onPick={applyDesign} /> },
    ]} />
  </>;

  const main = <>
      {!user && <div className="of-signin" role="note"><LogIn size={20} /><p><strong>Sign in to save and send your order.</strong> What you enter here is kept on this device.</p><button type="button" className="of-btn is-primary" onClick={() => authRef.current()}>Sign in</button></div>}
      {tried && shownErrors.general && <p className="of-general-error" role="alert"><TriangleAlert size={16} /> {shownErrors.general}</p>}
      <div id="of-contact"><ContactDetailsCard value={form.contact} onChange={contact => setForm(f => ({ ...f, contact }))} errors={shownErrors} phone={{ label: 'Mobile', placeholder: 'e.g. 0412 345 678', required: true }}>
        <DeliveryFieldsCard value={form.delivery} errors={(tried ? problems : {}) as DeliveryErrors} leadWeeks={leadWeeks} onChange={next => setForm(f => ({ ...f, delivery: { ...f.delivery, ...next } }))} />
      </ContactDetailsCard></div>
      <OrderSection number={2} title="Garments & sizes" id="of-garments" className={shownErrors.items ? 'has-error' : ''}
        action={<button type="button" className="op-link caps" onClick={addRow} disabled={form.rows.length >= MAX_ROWS}><Plus size={18} /> Add garment</button>}>
        {form.rows.length ? <ul className="of-rows">{form.rows.map((r, i) => <GarmentRow key={r.key} row={r} index={i} options={options} projects={projects} signedIn={!!user} focus={r.key === focusKey}
          files={files.filter(f => r.file_ids.includes(f.id))} uploading={uploads.filter(u => u.rowKey === r.key && u.status === 'uploading').length}
          error={shownErrors[`items.${i}.sizes`] ?? shownErrors[`items.${i}.players`]}
          onChange={patch => updateRow(r.key, patch)} onAddFit={fit => addFitRow(r.key, fit)} canAdd={form.rows.length < MAX_ROWS} onRemove={() => removeRow(r.key)} onFiles={list => addFiles(list, r.key)} onSignIn={() => authRef.current()}
          onDetach={id => updateRow(r.key, { file_ids: r.file_ids.filter(n => n !== id) })} />)}</ul>
          : <p className="of-empty">No garments yet. Use <b>+ Add garment</b> to add a jersey, shorts or anything else for your team.</p>}
        {shownErrors.items && <p className="of-row-error" role="alert"><TriangleAlert size={14} /> {shownErrors.items}</p>}
        {removed && <p className="of-undo" role="status">{rowName(removed.row, options)} removed. <button type="button" className="op-link" onClick={undoRemove}>Undo</button></p>}
        <div className="of-players-wrap">
          <button type="button" className="op-link of-players-toggle" onClick={() => setPlayersOpen(o => !o)} aria-expanded={playersOpen} disabled={!form.rows.length}>
            <Plus size={20} /> {playerCount ? `Player names & numbers (${playerCount})` : 'Add player names & numbers'} <span className="quiet">(optional)</span><ChevronDown size={18} className={`of-caret${playersOpen ? ' is-up' : ''}`} />
          </button>
          {playersOpen && playersRow && <PlayersPanel rows={form.rows} row={playersRow} options={options} onRow={setPlayersFor}
            onChange={players => updateRow(playersRow.key, { players })} onSizes={sizes => updateRow(playersRow.key, { sizes, open: true })} />}
        </div>
      </OrderSection>
      <OrderSection number={3} title="Artwork & instructions" id="of-artwork">
        <div className="of-artwork">
          <FileDropBox items={dropItems} onFiles={list => void addFiles(list)} onRemove={item => (item.id.startsWith('f') && item.status === 'done' ? void removeFile(Number(item.id.slice(1))) : dropUpload(item))} onRetry={retryUpload}
            extensions={options.files.artwork.extensions} maxKb={options.files.artwork.max_kb} maxFiles={options.files.max_files} label="Upload logos, artwork or a reference"
            hint={`PNG, JPG, SVG, PDF, AI or EPS · up to ${Math.round(options.files.artwork.max_kb / 1024)} MB each`} />
          <OrderField label="Design instructions" error={shownErrors.notes}>
            <textarea className="op-input" rows={3} maxLength={4000} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Tell us about colours, logo placement and any special requests..." />
          </OrderField>
        </div>
      </OrderSection>
    </>;

  return <OrderPageLayout className="of-page"
    header={<OrderPageHeader current="Create Order Form" title="Create order form" subtitle="Add your team details and garments. Review everything before submitting." />}
    main={main} side={side}
    bar={<OrderBottomBar secondary={{ label: 'Save draft', onClick: () => void saveDraft(), busy: saving }} primary={{ label: 'Review order', onClick: () => void review() }} note="Reviewing does not submit your order." status={statusText} />} />;
}

/* ================================================================================================ a garment */

function GarmentRow({ row, index, options, projects, signedIn, focus, files, uploading, error, canAdd, onChange, onAddFit, onRemove, onFiles, onSignIn, onDetach }: {
  row: Row; index: number; options: FormOptions; projects: Project[] | null; signedIn: boolean; focus: boolean; files: OrderFile[]; uploading: number; error?: string; canAdd: boolean;
  onChange: (patch: Partial<Row>) => void; onAddFit: (fit: string) => void; onRemove: () => void; onFiles: (files: File[]) => void; onSignIn: () => void; onDetach: (fileId: number) => void;
}) {
  const id = useId();
  const name = rowName(row, options, projects?.find(p => p.id === row.project_id));
  const qty = sum(row.sizes);
  const fileInput = useRef<HTMLInputElement>(null);
  const firstSize = useRef<HTMLInputElement>(null);
  const [focusSizes, setFocusSizes] = useState(false);
  useEffect(() => { if (focusSizes && row.open) { firstSize.current?.focus(); setFocusSizes(false); } }, [focusSizes, row.open]);
  const project = projects?.find(p => p.id === row.project_id);
  const picture = projectPicture(project) ?? files.find(f => f.thumb)?.thumb ?? garmentPicture(row.garment);
  // The fit's size set (Mens XS–8XL, Womens W8–W24, Kids 2Y–16Y), its rare sizes with "More sizes", and any other size with a quantity (an older "Kids").
  const { shown, rare } = rowSizes(row.fit, row.sizes, row.more, options.sizes);
  const set = row.fit === 'womens' || row.fit === 'youth' ? row.fit : 'mens';
  const otherFits = (['mens', 'womens', 'youth'] as const).filter(f => f !== set && options.fits.some(o => o.id === f));
  const value = `${row.sport}|${row.garment}`;
  const listed = (!row.sport || options.sports.some(s => s.id === row.sport)) && options.garments.some(g => g.id === row.garment);
  function setSize(size: string, text: string) {
    const n = Math.min(10000, Number(digits(text, 5)) || 0), sizes = { ...row.sizes };
    if (n) sizes[size] = n; else delete sizes[size];
    onChange({ sizes });
  }
  return <li className={`of-row${row.open ? '' : ' is-compact'}${error ? ' has-error' : ''}`}>
    <div className="of-thumb">{picture ? <img src={picture} alt={project ? `${project.name}` : name} className={picture === garmentPicture(row.garment) ? 'is-art' : undefined} /> : <Shirt size={44} strokeWidth={1.3} aria-hidden="true" />}</div>
    <p className="of-row-title" aria-hidden="true">{name}<small>{qty ? `${qty} ${word(row.garment, qty)}` : 'Sizes needed'}</small></p>
    <div className="of-row-main">
      <div className="of-row-fields">
        <OrderField label="Garment" className="of-garment">
          <select className="op-input" value={value} autoFocus={focus} aria-label={`Garment ${index + 1}`} onChange={e => { const [sport, garment] = e.target.value.split('|'); onChange({ sport, garment }); }}>
            {!listed && <option value={value}>{name}</option>}
            {options.sports.map(s => <optgroup key={s.id} label={s.name}>{options.garments.map(g => <option key={g.id} value={`${s.id}|${g.id}`}>{g.id === 'other' ? `${s.name}: other garment` : `${s.name} ${g.name}`}</option>)}</optgroup>)}
            <optgroup label={options.sports.length ? 'Any sport' : 'Garments'}>{options.garments.map(g => <option key={g.id} value={`|${g.id}`}>{g.id === 'other' ? 'Other garment' : g.name}</option>)}</optgroup>
          </select>
        </OrderField>
        <OrderField label="Fit" className="of-fit">
          <select className="op-input" value={row.fit} aria-label={`Fit for garment ${index + 1}`} onChange={e => onChange({ fit: e.target.value })}>
            {!row.fit && <option value="">Choose</option>}
            {options.fits.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </OrderField>
        {row.open
          ? <div className="op-field of-design"><span className="op-label" id={`${id}d`}>Design</span><DesignPicker labelledBy={`${id}d`} value={row.project_id} projects={projects} options={options} signedIn={signedIn} onPick={project_id => onChange({ project_id })} onUpload={() => fileInput.current?.click()} onSignIn={onSignIn} /></div>
          : <button type="button" className="op-link of-add-sizes" onClick={() => { onChange({ open: true }); setFocusSizes(true); }}><Settings size={21} /> Add sizes</button>}
      </div>
      {row.garment === 'other' && <OrderField label="What is it?" className="of-other"><input className="op-input" maxLength={60} value={row.label} placeholder="e.g. Long-sleeve compression top" onChange={e => onChange({ label: e.target.value })} /></OrderField>}
      {row.open && <div className="of-sizes">
        <div className="of-sizes-head">
          <span className="of-sizes-label" id={`${id}s`}>Sizes &amp; quantities</span>
          {rare.length > 0 && <button type="button" className="of-more" aria-expanded={row.more} onClick={() => onChange({ more: !row.more })} title={row.more ? undefined : `More sizes: ${rare.join(', ')}`}>{row.more ? 'Fewer sizes' : `+ ${rareText(rare)}`}</button>}
        </div>
        <div className="of-size-boxes" role="group" aria-labelledby={`${id}s`}>
          {shown.map((s, i) => <label key={s} className="of-size"><span>{s}</span><input ref={i === 0 ? firstSize : undefined} className="op-input" inputMode="numeric" autoComplete="off" maxLength={5} value={row.sizes[s] ? String(row.sizes[s]) : ''} placeholder="0" aria-label={`${name}, size ${s}`} onChange={e => setSize(s, e.target.value)} onFocus={e => e.currentTarget.select()} /></label>)}
        </div>
        <div className="of-subtotal" aria-live="polite"><span>Subtotal</span><strong>{qty}</strong><span>{word(row.garment, qty)}</span></div>
        {canAdd && otherFits.length > 0 && <p className="of-fit-add"><span>Same garment, also in</span>{otherFits.map(f => <button key={f} type="button" className="op-link" onClick={() => onAddFit(f)} aria-label={`Add ${name} in ${SET_NAMES[f]} sizes`}><Plus size={14} /> {SET_NAMES[f]} sizes</button>)}</p>}
      </div>}
      {(files.length > 0 || uploading > 0) && <ul className="of-row-files" aria-label={`Artwork for ${name}`}>
        {files.map(f => <li key={f.id}><Paperclip size={13} /><span>{f.name}</span><button type="button" onClick={() => onDetach(f.id)} aria-label={`Don’t use ${f.name} for ${name}`} title="Not for this garment"><X size={12} /></button></li>)}
        {uploading > 0 && <li><LoaderCircle className="spin" size={13} /> Uploading {uploading} file{uploading === 1 ? '' : 's'}…</li>}
      </ul>}
      {error && <p className="of-row-error" role="alert"><TriangleAlert size={14} /> {error}</p>}
    </div>
    <button type="button" className="op-icon-btn of-bin" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove garment"><Trash2 size={21} /></button>
    <input ref={fileInput} type="file" hidden multiple accept={options.files.artwork.extensions.map(e => `.${e}`).join(',')} aria-label={`Upload artwork for ${name}`} onChange={e => { const list = Array.from(e.target.files ?? []); e.target.value = ''; if (list.length) onFiles(list); }} />
  </li>;
}

/** The Design field: a list of the customer's saved designs with their pictures, or artwork to upload for this garment. */
function DesignPicker({ labelledBy, value, projects, options, signedIn, onPick, onUpload, onSignIn }: {
  labelledBy: string; value: number | null; projects: Project[] | null; options: FormOptions; signedIn: boolean; onPick: (id: number | null) => void; onUpload: () => void; onSignIn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const chosen = projects?.find(p => p.id === value) ?? null;
  const items: { key: string; label: string; sub?: string; picture?: string | null; run: () => void }[] = [
    ...(value ? [{ key: 'none', label: 'No saved design', sub: 'We design it with you', run: () => onPick(null) }] : []),
    ...(projects ?? []).map(p => ({ key: `p${p.id}`, label: p.name, sub: [options.sports.find(s => s.id === p.sport)?.name, designGarment(p.garment)].filter(Boolean).join(' · '), picture: projectPicture(p) ?? garmentPicture(PROJECT_ROWS[p.garment] ?? p.garment), run: () => onPick(p.id) })),
    { key: 'upload', label: 'Upload artwork for this garment…', sub: 'Logos, a mock-up or a reference picture', run: onUpload },
  ];
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, items.findIndex(i => i.key === `p${value}`)));
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${listId}-${items[active]?.key}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(i: number) { setOpen(false); items[i]?.run(); }
  function key(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(a => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  }
  const picture = projectPicture(chosen) ?? (chosen ? garmentPicture(chosen.garment) : null);
  return <div className="of-picker" ref={root}>
    <button type="button" className="op-input of-picker-button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${labelledBy} ${listId}-v`} aria-controls={open ? listId : undefined} aria-activedescendant={open && items[active] ? `${listId}-${items[active].key}` : undefined} onClick={() => setOpen(o => !o)} onKeyDown={key}>
      {picture && <img src={picture} alt="" />}<span id={`${listId}-v`}>{chosen ? chosen.name : value ? 'Saved design' : 'Choose saved design'}</span><ChevronDown size={16} />
    </button>
    {open && <div className="of-picker-pop">
      {!signedIn ? <p className="of-picker-note">Your saved designs show here when you’re signed in. <button type="button" className="op-link" onClick={() => { setOpen(false); onSignIn(); }}>Sign in</button></p>
        : projects === null ? <p className="of-picker-note"><LoaderCircle className="spin" size={14} /> Loading your designs…</p>
        : projects.length === 0 ? <p className="of-picker-note">No saved designs yet. Design a kit in the Studio and save it to choose it here.</p> : null}
      <ul role="listbox" id={listId} aria-label="Saved designs">
        {items.map((item, i) => <li key={item.key} id={`${listId}-${item.key}`} role="option" aria-selected={item.key === `p${value}`} className={`${i === active ? 'is-active' : ''}${item.key === 'upload' ? ' is-upload' : ''}`} onPointerEnter={() => setActive(i)} onPointerDown={e => e.preventDefault()} onClick={() => choose(i)}>
          {item.key === 'upload' ? <span className="of-picker-icon"><Paperclip size={18} /></span> : item.key === 'none' ? <span className="of-picker-icon"><X size={18} /></span> : item.picture ? <img src={item.picture} alt="" /> : <span className="of-picker-icon"><Shirt size={18} /></span>}
          <span className="of-picker-text"><b>{item.label}</b>{item.sub && <small>{item.sub}</small>}</span>
          {item.key === `p${value}` && <Check size={16} className="of-picker-tick" />}
        </li>)}
      </ul>
    </div>}
  </div>;
}

/* ================================================================================================ names and numbers */

/** Players pasted from Excel: one a line, cells split by tabs (or commas, semicolons); size and number (up to 3 digits) in any column. */
function parsePlayerLines(text: string, sizes: string[]): Player[] {
  const sizeOf = (cell: string) => { const found = siteSize(cell); return found && sizes.includes(found) ? found : null; };
  const out: Player[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(line.includes('\t') ? '\t' : /[,;]/).map(c => c.trim().replace(/^"(.*)"$/, '$1').trim()).filter(Boolean);
    if (!cells.length) continue;
    let sizeAt = -1, numberAt = -1;
    cells.forEach((c, i) => { if (sizeOf(c)) sizeAt = i; });
    cells.forEach((c, i) => { if (i !== sizeAt && /^#?\d{1,3}$/.test(c)) numberAt = i; });
    const name = cells.filter((_, i) => i !== sizeAt && i !== numberAt).join(' ').slice(0, 40);
    if (sizeAt < 0 && numberAt < 0 && /\b(names?|numbers?|no|sizes?|players?)\b/i.test(name)) continue;
    out.push({ name, number: numberAt < 0 ? '' : cells[numberAt].replace('#', ''), size: sizeAt < 0 ? '' : sizeOf(cells[sizeAt])! });
  }
  return out;
}

function PlayersPanel({ rows, row, options, onRow, onChange, onSizes }: { rows: Row[]; row: Row; options: FormOptions; onRow: (key: string) => void; onChange: (players: PlayerRow[]) => void; onSizes: (sizes: Record<string, number>) => void }) {
  const [paste, setPaste] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const name = rowName(row, options), players = row.players;
  const counted: Record<string, number> = {};
  for (const p of players) if (p.size && (p.name.trim() || p.number)) counted[p.size] = (counted[p.size] ?? 0) + 1;
  const countedTotal = sum(counted), ordered = sum(row.sizes);
  const same = countedTotal === ordered && Object.keys(counted).every(s => counted[s] === row.sizes[s]);
  const set = (key: string, patch: Partial<PlayerRow>) => onChange(players.map(p => (p.key === key ? { ...p, ...patch } : p)));
  function add() { const p = { key: makeKey('p'), name: '', number: '', size: players.at(-1)?.size ?? '' }; onChange([...players, p]); setFocusKey(p.key); }
  function addPasted() {
    const found = parsePlayerLines(paste ?? '', options.sizes);
    if (!found.length) { setMessage('No players found. Put one player on each line: name, number, size.'); return; }
    const kept = players.filter(p => p.name.trim() || p.number);
    const added = found.slice(0, Math.max(0, MAX_PLAYERS - kept.length));
    onChange([...kept, ...added.map(p => ({ key: makeKey('p'), name: p.name, number: p.number, size: p.size ?? '' }))]);
    setPaste(null);
    const noSize = added.filter(p => !p.size).length, left = found.length - added.length;
    setMessage(`Added ${added.length} player${added.length === 1 ? '' : 's'}.${noSize ? ` Choose a size for ${noSize} of them.` : ''}${left ? ` The list is full at ${MAX_PLAYERS}: ${left} not added.` : ''}`);
  }
  return <div className="of-players" id="of-players">
    {rows.length > 1 && <OrderField label="Names and numbers for" className="of-players-for">
      <select className="op-input" value={row.key} onChange={e => { onRow(e.target.value); setMessage(''); }}>{rows.map((r, i) => <option key={r.key} value={r.key}>{`${i + 1}. ${rowName(r, options)}${r.players.length ? ` (${r.players.length})` : ''}`}</option>)}</select>
    </OrderField>}
    {players.length > 0 && <div className="of-player is-head" aria-hidden="true"><span>#</span><span>Name</span><span>Number</span><span>Size</span><span /></div>}
    {players.map((p, i) => <div key={p.key} className="of-player">
      <span className="of-player-no">{i + 1}</span>
      <input className="op-input" aria-label={`Player ${i + 1} name`} maxLength={40} value={p.name} placeholder="Name" autoFocus={p.key === focusKey} onChange={e => set(p.key, { name: e.target.value })} />
      <input className="op-input" aria-label={`Player ${i + 1} number`} inputMode="numeric" maxLength={3} value={p.number} placeholder="No." onChange={e => set(p.key, { number: digits(e.target.value) })} />
      <select className="op-input" aria-label={`Player ${i + 1} size`} value={p.size} onChange={e => set(p.key, { size: e.target.value })}><option value="">Size</option>{p.size && !options.sizes.includes(p.size) && <option value={p.size}>{p.size}</option>}{sizeGroups(options.sizes, row.fit).map(g => <optgroup key={g.fit} label={`${g.name} sizes`}>{g.sizes.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>)}</select>
      <button type="button" className="op-icon-btn" onClick={() => onChange(players.filter(x => x.key !== p.key))} aria-label={`Remove player ${i + 1}`} title="Remove"><Trash2 size={16} /></button>
    </div>)}
    <div className="of-player-actions">
      <button type="button" className="of-btn" onClick={add} disabled={players.length >= MAX_PLAYERS}><Plus size={15} /> Add a player</button>
      <button type="button" className="of-btn" onClick={() => { setPaste(''); setMessage(''); }}><ClipboardPaste size={15} /> Paste from Excel</button>
    </div>
    {paste !== null && <div className="of-paste">
      <textarea className="op-input" rows={5} autoFocus value={paste} onChange={e => setPaste(e.target.value)} placeholder={'SMITH\t7\tM\nJONES\t10\tL'} aria-label="Players to paste" />
      <p className="op-hint">Copy the name, number and size columns in Excel and paste them here: one player on each line.</p>
      <div className="of-player-actions"><button type="button" className="of-btn is-primary" onClick={addPasted} disabled={!paste.trim()}>Add these players</button><button type="button" className="of-btn" onClick={() => setPaste(null)}>Cancel</button></div>
    </div>}
    {message && <p className="op-hint" role="status">{message}</p>}
    <p className="of-players-count">{players.length} player{players.length === 1 ? '' : 's'} for {name} · {ordered} ordered
      {countedTotal > 0 && !same && <> · <button type="button" className="op-link" onClick={() => onSizes(counted)}>Use the players’ sizes ({countedTotal})</button></>}
    </p>
  </div>;
}

/* ================================================================================================ 3DEEZI Assist panels */

function TargetSelect({ rows, options, value, onChange, extra }: { rows: Row[]; options: FormOptions; value: string; onChange: (v: string) => void; extra?: ReactNode }) {
  return <OrderField label="For" className="of-target">
    <select className="op-input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="auto">The garment it names (or a new one)</option>
      {rows.map((r, i) => <option key={r.key} value={r.key}>{`${i + 1}. ${rowName(r, options)}`}</option>)}
      {extra}
    </select>
  </OrderField>;
}

function SizesHelper({ rows, options, onApply }: { rows: Row[]; options: FormOptions; onApply: (items: AssistItem[], target: string) => { ok: boolean; text: string } }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function fill(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setResult(null);
    try {
      const reply = await readSizes(text.trim(), options);
      const done = onApply(reply.items ?? [], target);
      setResult(reply.unknown?.length ? { ...done, text: `${done.text} I couldn’t read: ${reply.unknown.join(', ')}.` } : done);
      if (done.ok) setText('');
    } catch (err) {
      setResult({ ok: false, text: (err as ApiError).status === 429 ? 'You’re asking quickly. Wait a moment and try again.' : (err as Error).message });
    } finally { setBusy(false); }
  }
  return <form className="of-helper" onSubmit={fill}>
    <p>Tell me the sizes in your own words, and I’ll fill them in.</p>
    <div className="of-helper-row">
      <input className="op-input" value={text} onChange={e => setText(e.target.value)} maxLength={1500} placeholder="e.g. 12 jerseys: 2 S, 4 M, 6 L" aria-label="Sizes in your own words" />
      <button type="submit" className="of-btn is-primary" disabled={busy || !text.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : null}Fill sizes</button>
    </div>
    <div className="of-chips">{['18 jerseys M', '12 jerseys: 2 S, 4 M, 6 L', '12 shorts: 6 M, 6 L'].map(x => <button type="button" key={x} onClick={() => setText(x)}>{x}</button>)}</div>
    {rows.length > 1 && <TargetSelect rows={rows} options={options} value={target} onChange={setTarget} />}
    {result && <p className={`of-helper-result${result.ok ? ' is-ok' : ''}`} role="status">{result.ok ? <Check size={15} /> : <Info size={15} />}<span>{result.text}</span></p>}
  </form>;
}

function DesignsHelper({ rows, options, projects, signedIn, onSignIn, onPick }: { rows: Row[]; options: FormOptions; projects: Project[] | null; signedIn: boolean; onSignIn: () => void; onPick: (p: Project, target: string) => string }) {
  const [target, setTarget] = useState('auto');
  const [result, setResult] = useState('');
  if (!signedIn) return <div className="of-helper"><p>Sign in to see the designs you’ve saved in the Studio.</p><button type="button" className="of-btn is-primary" onClick={onSignIn}><LogIn size={15} /> Sign in</button></div>;
  if (projects === null) return <div className="of-helper"><p><LoaderCircle className="spin" size={15} /> Loading your designs…</p></div>;
  if (!projects.length) return <div className="of-helper"><p>No saved designs yet. Design a kit, save it, and it shows here.</p><Link className="of-btn" to="/create/sport">Design a kit <ArrowRight size={15} /></Link></div>;
  return <div className="of-helper">
    <TargetSelect rows={rows} options={options} value={target} onChange={setTarget} extra={<option value="new">A new garment</option>} />
    <ul className="of-designs">{projects.slice(0, 24).map(p => { const pic = projectPicture(p) ?? garmentPicture(PROJECT_ROWS[p.garment] ?? p.garment); return <li key={p.id}><button type="button" onClick={() => setResult(onPick(p, target))} aria-label={`Use ${p.name}`}>
      <span className="of-design-pic">{pic ? <img src={pic} alt="" loading="lazy" /> : <Shirt size={26} />}</span><b>{p.name}</b><small>{[options.sports.find(s => s.id === p.sport)?.name, designGarment(p.garment)].filter(Boolean).join(' · ')}</small>
    </button></li>; })}</ul>
    {result && <p className="of-helper-result is-ok" role="status"><Check size={15} /><span>{result}</span></p>}
  </div>;
}

/* ================================================================================================ money */

const money = (v: string | null | undefined, currency: string) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(Number(v)));

