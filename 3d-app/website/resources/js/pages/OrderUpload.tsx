import { useEffect, useReducer, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck, CircleHelp, CreditCard, Download, FileImage, FileSpreadsheet, FileText, FileUp, Info, LoaderCircle, LogIn, Paperclip, Pencil, Replace, RotateCcw, X } from 'lucide-react';
import { api, ApiError, getToken, type User } from '../api';
import { askAssist, provideAssistContext } from '../assistBridge';
import { AssistCard, AssistSparkle, ContactDetailsCard, OrderBottomBar, OrderField, OrderPageHeader, OrderPageLayout, OrderSection, OrderSummaryCard, fileExtension, formatBytes, type ContactDetails } from '../components/OrderPageParts';
import { clearIdempotencyKey, idempotencyKey, orderApi, uploadOrderFile, type OrderDetail, type OrderFields, type OrderFile, type OrderItem, type OrderOptions, type Payment, type Suggested } from '../orderApi';
import { PriceBreakdown, PricingChoices, type PricingChoice, type Quote as PayQuote } from '../components/OrderPayment';
import '../../css/order-upload.css';

/** The two kinds of file this page uploads. */
type UploadKind = 'order_form' | 'artwork';
type FileRule = OrderOptions['files']['order_form'];
type FileRules = OrderOptions['files'];
export interface UploadFields extends ContactDetails { notes: string }
/** What the page keeps in the draft: the order fields, with the rows read from the order form once they are checked. */
type DraftData = OrderFields & Record<string, unknown>;

/* TEMPORARY, until the payments agent's components/OrderPayment.tsx (useQuote, PriceBreakdown) lands: POST /pricing/quote
   as in payments-api.md section 3. */
interface QuoteLine { key?: string; name: string; quantity: number; unit_price?: string | null; total: string | null; priced?: boolean }
export interface Quote {
  status: 'priced' | 'quote_required'; currency: string; lines: QuoteLine[]; extras?: QuoteLine[];
  shipping?: { name?: string; amount: string | null; priced?: boolean } | null; discounts?: { name: string; amount: string }[];
  subtotal: string | null; tax?: { name: string; amount: string | null; included?: boolean; applies?: boolean } | null; total: string | null;
  reasons?: { code: string; message: string }[];
}
const quoteFor = (items: OrderItem[], pricing: PricingChoice) => api<Quote>('/pricing/quote', { method: 'POST', body: JSON.stringify({ items, pricing }) });
/** Only the price choices given (an empty choice is the server's defaults). */
const cleanPricing = (p: PricingChoice): PricingChoice | undefined => {
  const kept = Object.fromEntries(Object.entries(p).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)));
  return Object.keys(kept).length ? kept as PricingChoice : undefined;
};
/** Payments are paused for the 2026-10-20 checkpoint: no prices are asked for; the review says 3DEEZI confirms the price.
    Set to true once /pricing is live, to quote the confirmed rows. ("Pay now" shows only if a submit reply has an invoice.) */
const PRICES_LIVE = true;
/** The order's invoice can be paid now (payments-api.md section 2), with where to pay it. */
const payable = (p?: Payment | null): boolean => !!p && p.can_pay && !!(p.invoice_number || p.pay_url);

/** The contract's limits, used until GET /orders/options answers. */
const DEFAULT_RULES: FileRules = {
  order_form: { extensions: ['pdf', 'xlsx', 'xls', 'csv', 'ods', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'heic'], max_kb: 25600 },
  artwork: { extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'cdr', 'psd', 'tif', 'tiff', 'heic'], max_kb: 25600 },
  max_files: 15,
};
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];

const EMPTY: UploadFields = { contact_name: '', contact_email: '', phone: '', team_name: '', notes: '' };
const FIELD_NAMES = Object.keys(EMPTY) as (keyof UploadFields)[];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PICTURES = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'tif', 'tiff'];
const PREVIEWABLE = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const SHEETS = ['xlsx', 'xls', 'csv', 'ods'];
/** Friendly names for the allowed extensions, in the order customers think of them. */
const TYPE_GROUPS: [string, string[]][] = [['PDF', ['pdf']], ['Excel', ['xlsx', 'xls', 'ods']], ['CSV', ['csv']], ['Word', ['doc', 'docx']], ['text', ['txt']], ['photo', PICTURES], ['SVG', ['svg']], ['Illustrator', ['ai']], ['EPS', ['eps']], ['CorelDRAW', ['cdr']], ['Photoshop', ['psd']]];
const listText = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0] ?? '');
const typesText = (extensions: string[]) => listText(TYPE_GROUPS.filter(([, list]) => list.some(e => extensions.includes(e))).map(([name]) => name));
const mbText = (kb: number) => `${Math.round(kb / 1024)} MB`;
const pct = (v: number) => `${Math.min(100, Math.round(v * 100))}%`;
const timeText = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const garmentName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');
const itemTotal = (item: OrderItem) => Object.values(item.sizes).reduce((a, b) => a + (Number(b) || 0), 0);
/** "AUD $1,870.00", as the payment components show it. */
const money = (v: string | number | null | undefined, currency = 'AUD') => (v === null || v === undefined || v === '' ? '—' : `${currency} ${new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(Number(v))}`);

/** What is wrong with the contact details (empty when they are fine). Team and email are needed to make the order. */
function contactErrors(f: UploadFields) {
  const e: Partial<Record<keyof UploadFields, string>> = {};
  const name = f.contact_name.trim(), email = f.contact_email.trim(), team = f.team_name.trim(), phone = f.phone.trim();
  if (!name) e.contact_name = 'Add the contact name.';
  else if (name.length > 120) e.contact_name = 'The name can be up to 120 characters.';
  if (!email) e.contact_email = 'Add an email address so we can reach you.';
  else if (email.length > 190 || !EMAIL.test(email)) e.contact_email = 'Check the email address (for example name@club.com).';
  if (!team) e.team_name = 'Add your team or organisation name.';
  else if (team.length > 120) e.team_name = 'The team name can be up to 120 characters.';
  const digits = phone.replace(/\D/g, '');
  if (phone && (!/^[\d\s()+\-.]+$/.test(phone) || digits.length < 6 || digits.length > 20 || phone.length > 40)) e.phone = 'Check the phone number: digits, spaces and + ( ) - only.';
  if (f.notes.length > 4000) e.notes = 'Instructions can be up to 4000 characters.';
  return e;
}

/* --- This browser's copy of the draft (localStorage), so nothing is lost before or after it reaches the server. --- */
interface LocalDraft { v: 1; id?: number; data: UploadFields; files: OrderFile[]; items?: OrderItem[] | null; at: number }
const localKey = (owner: string) => `3deezi.orderUpload.${owner}`;
function readLocal(owner: string): LocalDraft | null {
  try { const saved = JSON.parse(localStorage.getItem(localKey(owner)) || 'null'); return saved?.v === 1 ? saved : null; } catch { return null; }
}
function writeLocal(owner: string, draft: LocalDraft) { try { localStorage.setItem(localKey(owner), JSON.stringify(draft)); } catch { /* full or private: the server copy still works */ } }
function dropLocal(owner: string) { try { localStorage.removeItem(localKey(owner)); } catch { /* nothing kept */ } }
/** The team and phone used last time (the account itself only knows the name and email). */
const lastContactKey = (userId: number) => `3deezi.orderContact.u${userId}`;
function readLastContact(userId: number): Partial<UploadFields> { try { return JSON.parse(localStorage.getItem(lastContactKey(userId)) || '{}'); } catch { return {}; } }
const pickFields = (data?: object | null): Partial<UploadFields> => {
  const source = (data ?? {}) as Record<string, unknown>;
  return Object.fromEntries(FIELD_NAMES.flatMap(k => (typeof source[k] === 'string' ? [[k, source[k] as string]] : []))) as Partial<UploadFields>;
};
const filled = (f: Partial<UploadFields>) => Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === 'string' && v.trim())) as Partial<UploadFields>;

/* --- Files on the page: on the server (done), on their way, or refused. --- */
type RowStatus = 'waiting' | 'queued' | 'uploading' | 'done' | 'error';
interface Row {
  key: string; kind: UploadKind; name: string; size: number;
  status: RowStatus; progress: number; error?: string; retry?: boolean; tries?: number;
  remote?: OrderFile; preview?: string; removing?: boolean;
  /** A replacement on its way: the uploaded file stays until it has arrived. */
  swap?: { name: string; size: number; progress: number; error?: string };
}
const fromRemote = (f: OrderFile): Row => ({ key: `f${f.id}`, kind: f.kind === 'artwork' ? 'artwork' : 'order_form', name: f.name, size: f.size, status: 'done', progress: 1, remote: f, preview: f.thumb ?? undefined });
const release = (row: Row) => { if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview); };
const busyRow = (r: Row) => r.status === 'uploading' || r.status === 'queued' || (!!r.swap && !r.swap.error);
/** Why the files are not ready for review yet (null when they are): an order form is needed, and nothing still uploading. */
function filesProblem(list: Row[]) {
  const forms = list.filter(r => r.kind === 'order_form');
  if (!forms.some(r => r.status === 'done' && r.remote)) {
    return forms.some(busyRow) ? 'Wait for your order form to finish uploading.' : forms.some(r => r.status === 'waiting') ? 'Sign in to upload your order form.' : 'Add your order form: upload at least one file.';
  }
  return list.some(busyRow) ? 'Wait for your files to finish uploading.' : null;
}
const MAX_PARALLEL = 2;

function uploadMessage(err: ApiError) {
  if (err.status === 0) return 'Upload failed: check your connection, then try again.';
  if (err.status === 413) return 'This file is too large for the server.';
  if (err.status === 429) return 'Too many uploads in a minute. Wait a moment, then try again.';
  if (err.status >= 500) return 'The server had a problem with this file. Try again in a moment.';
  return err.errors?.file?.[0] ?? err.errors?.kind?.[0] ?? err.errors?.files?.[0] ?? err.message;
}
const retryable = (err: ApiError) => err.status === 0 || err.status === 429 || err.status >= 500;
function useLatest<T>(value: T) { const ref = useRef(value); ref.current = value; return ref; }

type Step = 'edit' | 'review' | 'sent';
interface SaveState { state: 'idle' | 'saving' | 'saved' | 'error'; at?: string; message?: string }
export interface OrderUploadProps { user: User | null; checking: boolean; requireAuth: (action?: () => void) => void; onNotice: (text: string) => void }

/**
 * Upload Your Order (/orders/upload): a team that already has its order form uploads it, with any artwork and notes,
 * checks everything on a review screen and confirms. Until then it is a draft (on the server once signed in, and in
 * this browser), never an order: confirming makes ONE order (idempotency key), shown with its 3DZ- reference.
 * Built from the shared order page parts (components/OrderPageParts.tsx); the upload boxes are this page's own.
 */
export default function OrderUploadPage({ user, checking, requireAuth, onNotice }: OrderUploadProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const owner = checking ? null : user ? `u${user.id}` : 'guest';
  const userRef = useLatest(user);
  const [loaded, setLoaded] = useState(false);
  const [rules, setRules] = useState<FileRules>(DEFAULT_RULES);
  const rulesRef = useLatest(rules);
  const [fields, setFields] = useState<UploadFields>(EMPTY);
  const fieldsRef = useLatest(fields);
  /** Puts loaded details on the page at once: an upload starting in the same moment makes the draft from them. */
  const loadFields = (next: UploadFields) => { fieldsRef.current = next; setFields(next); };
  const [draftId, setDraftIdState] = useState<number>();
  const draftRef = useRef<number | undefined>(undefined);
  const setDraftId = (id?: number) => { draftRef.current = id; setDraftIdState(id); };
  // The files live in a ref (uploads read and change them between renders); `version` redraws the page.
  const rowsRef = useRef<Row[]>([]);
  const [version, redraw] = useReducer((n: number) => n + 1, 0);
  const rows = rowsRef.current;
  const commit = (next: Row[]) => { rowsRef.current = next; redraw(); };
  const patchRow = (key: string, patch: Partial<Row> | ((row: Row) => Partial<Row>)) => commit(rowsRef.current.map(r => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  const [step, setStep] = useState<Step>('edit');
  const stepRef = useLatest(step);
  const [tried, setTried] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactTried, setContactTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const itemsRef = useLatest(items);
  const [itemsFor, setItemsFor] = useState('');
  /** Lines of the order form the server could not read (shown in the review: 3DEEZI checks them). */
  const [unread, setUnread] = useState<string[]>([]);
  const [itemsConfirmed, setItemsConfirmed] = useState(false);
  const itemsConfirmedRef = useLatest(itemsConfirmed);
  const [confirmTried, setConfirmTried] = useState(false);
  const [quote, setQuote] = useState<{ state: 'required' | 'loading' | 'ready'; quote?: Quote }>({ state: 'required' });
  // The review's price choices: delivery destination, extras and a discount code (payments-api.md R3), sent with the order.
  const [pricing, setPricing] = useState<PricingChoice>({});
  const pricingRef = useRef(pricing);
  pricingRef.current = pricing;
  const [submitError, setSubmitError] = useState('');
  const [placed, setPlaced] = useState<OrderDetail | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [topic, setTopic] = useState<'files' | 'noform' | null>(null);

  const files = useRef(new Map<string, File>());     // row key -> the file still to upload
  const aborts = useRef(new Map<string, () => void>());
  const active = useRef(0);
  const seq = useRef(0);
  const newKey = () => `n${Date.now().toString(36)}${++seq.current}`;
  const creating = useRef<Promise<number> | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const saveAgain = useRef(false);
  const dirty = useRef(false);
  const submitting = useRef(false);
  /** What to do once the visitor has signed in (requireAuth runs our callback before the page has the new user). */
  const pending = useRef<'save' | 'review' | null>(null);
  const ownerRef = useRef<string | null>(null);
  /** The person whose page this is while their session has expired (kept on screen until they sign in again). */
  const held = useRef<string | null>(null);

  const withDefaults = (f: UploadFields): UploadFields => {
    const u = userRef.current;
    if (!u) return f;
    const last = readLastContact(u.id);
    return { ...f, contact_name: f.contact_name || u.name, contact_email: f.contact_email || u.email, team_name: f.team_name || last.team_name || '', phone: f.phone || last.phone || '' };
  };
  const payload = (): DraftData => {
    const f = fieldsRef.current, list = itemsRef.current;
    const data: DraftData = { contact_name: f.contact_name.trim(), contact_email: f.contact_email.trim(), phone: f.phone.trim(), team_name: f.team_name.trim(), notes: f.notes.trim() };
    if (list?.length) { data.items = list; data.items_confirmed = itemsConfirmedRef.current; }
    const chosen = cleanPricing(pricingRef.current);
    if (chosen) data.pricing = chosen;
    return data;
  };

  // The allowed file types and sizes come from the server (PUBLIC); the contract's values until then.
  useEffect(() => { orderApi.options().then(o => { if (o?.files?.order_form && o.files.artwork) setRules(o.files); }).catch(() => { /* keep the defaults */ }); }, []);

  /* --- Whose page this is: load their draft; a guest who signs in keeps what they typed. --- */
  useEffect(() => {
    if (!owner) return;
    const before = ownerRef.current;
    ownerRef.current = owner;
    if (before === owner) return;
    // Signed out while here (the session expired): keep the page as it is; the sign-in window is open.
    if (before && before !== 'guest' && owner === 'guest') { held.current = before; return; }
    if (held.current) { const same = held.current === owner; held.current = null; if (same) resume(); else void loadFor(owner); return; }
    if (before === 'guest') { adoptGuest(owner); return; }
    void loadFor(owner);
    // Opened signed out: ask to sign in now (what they type meanwhile is kept and comes with them).
    if (owner === 'guest') requireAuth();
  }, [owner]);

  async function loadFor(who: string) {
    for (const abort of aborts.current.values()) abort();
    aborts.current.clear(); files.current.clear();
    rowsRef.current.forEach(release);
    const saved = readLocal(who);
    const link = Number(new URLSearchParams(location.search).get('draft')) || undefined;
    const handed = (location.state as { contact?: Partial<UploadFields> } | null)?.contact;
    loadFields(withDefaults({ ...EMPTY, ...pickFields(saved?.data), ...filled(pickFields(handed)) }));
    setDraftId(saved?.id);
    commit((saved?.files ?? []).map(fromRemote));
    setItems(saved?.items ?? null); setItemsFor(''); setItemsConfirmed(false);
    setStep('edit'); setTried(false); setContactOpen(false); setContactTried(false); setServerErrors({}); setBanner(''); setPlaced(null);
    setSave({ state: 'idle' });
    dirty.current = false;
    setLoaded(true);
    if (who !== 'guest') await syncServer(link ?? saved?.id, saved?.at ?? 0, !!link);
  }
  /** The server's copy of the draft: its files are the truth; the newer of the two copies' details is kept. */
  async function syncServer(id: number | undefined, localAt: number, fromLink: boolean) {
    if (!id) return;
    try {
      const d = await orderApi.draft(id);
      if (d.kind !== 'upload') { setBanner('That draft is an order form: continue it in Create Order Form.'); return; }
      setDraftId(d.id);
      const serverAt = Date.parse(d.updated_at ?? '') || 0;
      if (fromLink || serverAt > localAt) {
        loadFields(withDefaults({ ...EMPTY, ...pickFields(d.data) }));
        if (d.data.items?.length) setItems(d.data.items);
      }
      commit([...d.files.filter(f => f.kind === 'order_form' || f.kind === 'artwork').map(fromRemote), ...rowsRef.current.filter(r => !r.remote)]);
      setSave({ state: 'saved', at: d.updated_at });
      if (fromLink) navigate(location.pathname, { replace: true });
    } catch (e) {
      if ((e as ApiError).status === 404) {
        setDraftId(undefined);
        commit(rowsRef.current.filter(r => !r.remote));
        setBanner('Your saved draft was already sent or deleted, so its files were cleared. Your details are kept.');
      } else setSave({ state: 'error', message: 'Could not load your saved draft. This is the copy kept on this device.' });
    }
  }
  /** A guest signed in: what they typed wins over the account's older copy; files waiting for sign-in now upload. */
  function adoptGuest(who: string) {
    const saved = readLocal(who);
    loadFields(withDefaults({ ...EMPTY, ...pickFields(saved?.data), ...filled(fieldsRef.current) }));
    setDraftId(saved?.id);
    commit([...(saved?.files ?? []).map(fromRemote), ...rowsRef.current.filter(r => !r.remote).map(r => (r.status === 'waiting' ? { ...r, status: 'queued' as const } : r))]);
    dropLocal('guest');
    void (async () => { if (saved?.id) await syncServer(saved.id, Date.now(), false); pump(); runPending(); })();
  }
  /** Signed in again after the session expired: carry on where they were. */
  function resume() { commit(rowsRef.current.map(r => (r.status === 'waiting' ? { ...r, status: 'queued' as const } : r))); pump(); runPending(); }
  function runPending() {
    const next = pending.current;
    pending.current = null;
    if (next === 'save') void saveNow(true);
    if (next === 'review') void goReview();
  }

  // This browser's copy, kept as they type (not while another person's page is held, nor after sending).
  useEffect(() => {
    if (!owner || !loaded || held.current || step === 'sent') return;
    const timer = setTimeout(() => writeLocal(owner, { v: 1, id: draftRef.current, data: fieldsRef.current, files: rowsRef.current.flatMap(r => (r.remote ? [r.remote] : [])), items: itemsRef.current, at: Date.now() }), 250);
    return () => clearTimeout(timer);
  }, [owner, loaded, fields, draftId, version, items, step]);
  // The server's copy follows the details once the draft exists there.
  useEffect(() => {
    if (!dirty.current || !draftRef.current || !getToken() || step !== 'edit') return;
    const timer = setTimeout(() => { void saveNow(false); }, 1500);
    return () => clearTimeout(timer);
  }, [fields]);

  // Never lose the draft to a file dropped beside the boxes (the browser would open it), or to leaving mid-upload.
  useEffect(() => {
    const stray = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const leaving = (e: BeforeUnloadEvent) => { if (rowsRef.current.some(busyRow)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('dragover', stray); window.addEventListener('drop', stray); window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); window.removeEventListener('beforeunload', leaving);
      for (const abort of aborts.current.values()) abort();
      rowsRef.current.forEach(release);
    };
  }, []);
  // What 3DEEZI ASSIST is told about this page with each question (data, not instructions), also while its card is closed.
  useEffect(() => provideAssistContext(() => {
    const r = rowsRef.current, f = fieldsRef.current, rule = rulesRef.current;
    const named = (kind: UploadKind) => r.filter(x => x.kind === kind && x.status === 'done').map(x => x.name);
    const forms = named('order_form'), art = named('artwork');
    return [`Upload Your Order page (/orders/upload), ${stepRef.current === 'review' ? 'review screen (Confirm order sends it)' : stepRef.current === 'sent' ? 'order sent' : 'filling it in'}.`,
      `Signed in: ${userRef.current ? 'yes' : 'no'}. Team: ${f.team_name.trim() || 'not added'}. Contact details complete: ${Object.keys(contactErrors(f)).length ? 'no' : 'yes'}.`,
      `Order form files uploaded: ${forms.length ? forms.join(', ') : 'none'}. Supporting artwork: ${art.length ? art.join(', ') : 'none'}. Files uploading: ${r.filter(busyRow).length}. Files refused: ${r.filter(x => x.status === 'error').length}.`,
      `Allowed order form files: ${rule.order_form.extensions.join(', ')} up to ${mbText(rule.order_form.max_kb)} each. Artwork: ${rule.artwork.extensions.join(', ')} up to ${mbText(rule.artwork.max_kb)}. Up to ${rule.max_files} files per order.`,
      'No order form? Create Order Form (/orders/new) builds one. Sizes, quantities and the price are confirmed by 3DEEZI after the order is sent.'].join(' ');
  }), []);

  /* --- Server draft and uploads --- */
  function ensureDraft(): Promise<number> {
    if (draftRef.current) return Promise.resolve(draftRef.current);
    creating.current ??= orderApi.createDraft('upload', payload())
      .then(d => { setDraftId(d.id); setSave({ state: 'saved', at: d.updated_at }); return d.id; })
      .finally(() => { creating.current = null; });
    return creating.current;
  }
  /** Saves the details to the server draft (making it when needed). One save at a time; changes meanwhile save next. */
  function saveNow(explicit: boolean): Promise<boolean> {
    if (!getToken()) {
      if (explicit) requireAuth(() => { pending.current = 'save'; });
      return Promise.resolve(false);
    }
    if (saving.current) { saveAgain.current = true; return saving.current; }
    const run = (async () => {
      setSave(s => ({ ...s, state: 'saving' }));
      try {
        let at: string | undefined;
        do {
          saveAgain.current = false; dirty.current = false;
          const id = await ensureDraft();
          at = (await orderApi.saveDraft(id, payload())).updated_at;
        } while (saveAgain.current);
        setSave({ state: 'saved', at });
        if (explicit) onNotice('Draft saved. It is not an order yet: it waits in My Orders under Drafts until you review and confirm it.');
        return true;
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 404) { lostDraft(); setSave({ state: 'error', message: 'This draft was already sent or deleted elsewhere. Save again to start a new draft.' }); }
        else setSave({ state: 'error', message: err.status === 401 ? 'Sign in again to save your draft.' : `Not saved: ${err.message}` });
        return false;
      } finally { saving.current = null; }
    })();
    saving.current = run;
    return run;
  }
  /** The server no longer has this draft: its files went with it. */
  function lostDraft() {
    setDraftId(undefined);
    commit(rowsRef.current.filter(r => !r.remote));
    setBanner('Your draft was already sent or deleted elsewhere, so its files were cleared. Add your files again to start a new draft.');
  }
  function pump() {
    for (const row of rowsRef.current) {
      if (active.current >= MAX_PARALLEL) return;
      if (row.status === 'queued') void upload(row.key);
    }
  }
  async function upload(key: string) {
    const row = rowsRef.current.find(r => r.key === key), file = files.current.get(key);
    if (!row || !file) return;
    active.current++;
    patchRow(key, { status: 'uploading', progress: 0, error: undefined, retry: false, tries: (row.tries ?? 0) + 1 });
    let id: number | undefined;
    const stop = new AbortController();
    aborts.current.set(key, () => stop.abort());
    try {
      id = await ensureDraft();
      if (stop.signal.aborted) return;
      let shown = 0;
      const remote = await uploadOrderFile(id, file, row.kind, p => { if (p - shown >= 0.01 || p >= 0.99) { shown = p; patchRow(key, { progress: p }); } }, stop.signal);
      files.current.delete(key);
      // Removed while it was arriving: take it off the draft again.
      if (!rowsRef.current.some(r => r.key === key)) { orderApi.removeDraftFile(id, remote.id).catch(() => {}); return; }
      patchRow(key, r => ({ status: 'done', progress: 1, remote, name: remote.name, size: remote.size, preview: remote.thumb ?? r.preview }));
    } catch (e) {
      const err = e as ApiError;
      if (stop.signal.aborted) return;   // removed (✕) while uploading: not an error
      if (err.status === 401) patchRow(key, { status: 'waiting', progress: 0 });
      else if (err.status === 404 && id !== undefined && draftRef.current === id && (row.tries ?? 0) < 1) { lostDraft(); patchRow(key, { status: 'queued', progress: 0 }); }
      else patchRow(key, { status: 'error', progress: 0, error: uploadMessage(err), retry: retryable(err) });
    } finally { aborts.current.delete(key); active.current--; pump(); }
  }
  function fileProblem(file: File, kind: UploadKind) {
    const rule = rulesRef.current[kind], ext = fileExtension(file.name);
    if (!rule.extensions.includes(ext)) return `${ext ? `.${ext.toUpperCase()} files` : 'Files without a type'} can’t be used ${kind === 'order_form' ? 'for the order form' : 'here'}. Choose ${typesText(rule.extensions)}.`;
    if (file.size > rule.max_kb * 1024) return `This file is ${formatBytes(file.size)}: files can be up to ${mbText(rule.max_kb)}.`;
    if (file.size === 0) return 'This file is empty.';
    return null;
  }
  function addFiles(kind: UploadKind, list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    setBanner('');
    const kept = rowsRef.current.filter(r => r.status !== 'error' || r.remote || files.current.has(r.key));
    const added: Row[] = [];
    for (const file of incoming) {
      const key = newKey(), counted = kept.length + added.filter(r => r.status !== 'error').length;
      const problem = fileProblem(file, kind) ?? (counted >= rulesRef.current.max_files ? `One order can have up to ${rulesRef.current.max_files} files. Remove one to add this.` : null);
      if (problem) { added.push({ key, kind, name: file.name, size: file.size, status: 'error', progress: 0, error: problem }); continue; }
      files.current.set(key, file);
      added.push({ key, kind, name: file.name, size: file.size, status: getToken() ? 'queued' : 'waiting', progress: 0, preview: PREVIEWABLE.includes(fileExtension(file.name)) ? URL.createObjectURL(file) : undefined });
    }
    // Earlier refusals make way for the new attempt.
    rowsRef.current.filter(r => !kept.includes(r)).forEach(release);
    commit([...kept, ...added]);
    if (added.some(r => r.status === 'waiting')) requireAuth();
    pump();
  }
  async function removeRow(key: string) {
    const row = rowsRef.current.find(r => r.key === key);
    if (!row) return;
    aborts.current.get(key)?.(); aborts.current.get(`swap:${key}`)?.();
    files.current.delete(key);
    if (row.remote && draftRef.current) {
      patchRow(key, { removing: true, error: undefined });
      try { await orderApi.removeDraftFile(draftRef.current, row.remote.id); }
      catch (e) {
        if ((e as ApiError).status !== 404) { patchRow(key, { removing: false, error: `Couldn’t remove it: ${(e as Error).message}` }); return; }
      }
    }
    release(row);
    commit(rowsRef.current.filter(r => r.key !== key));
  }
  function retryRow(key: string) {
    if (!files.current.has(key)) return;
    patchRow(key, { status: getToken() ? 'queued' : 'waiting', error: undefined, tries: 0 });
    if (!getToken()) requireAuth();
    pump();
  }
  /** Replace: the new file uploads first; the old one is removed only once it has arrived (if not, it stays). */
  function replaceRow(key: string, file: File) {
    const row = rowsRef.current.find(r => r.key === key);
    if (!row?.remote) return;
    const problem = fileProblem(file, row.kind);
    if (problem) { patchRow(key, { swap: { name: file.name, size: file.size, progress: 0, error: `${problem} ${row.name} is kept.` } }); return; }
    if (!getToken()) { requireAuth(); return; }
    const old = row.remote;
    patchRow(key, { swap: { name: file.name, size: file.size, progress: 0 }, error: undefined });
    const stop = new AbortController();
    aborts.current.set(`swap:${key}`, () => stop.abort());
    void (async () => {
      try {
        const id = await ensureDraft();
        if (stop.signal.aborted) return;
        const remote = await uploadOrderFile(id, file, row.kind, p => patchRow(key, r => ({ swap: r.swap && { ...r.swap, progress: p } })), stop.signal);
        if (!rowsRef.current.some(r => r.key === key)) { orderApi.removeDraftFile(id, remote.id).catch(() => {}); return; }
        const current = rowsRef.current.find(r => r.key === key);
        if (current) release(current);
        patchRow(key, { remote, name: remote.name, size: remote.size, preview: remote.thumb ?? (PREVIEWABLE.includes(fileExtension(file.name)) ? URL.createObjectURL(file) : undefined), swap: undefined, status: 'done' });
        try { await orderApi.removeDraftFile(id, old.id); }
        catch (e) { if ((e as ApiError).status !== 404) commit([...rowsRef.current, { ...fromRemote(old), error: 'Replaced, but this old copy could not be removed. Remove it here.' }]); }
      } catch (e) {
        const err = e as ApiError;
        if (stop.signal.aborted) return;
        patchRow(key, r => ({ swap: r.swap && { ...r.swap, error: `Couldn’t replace it: ${uploadMessage(err)} ${old.name} is kept.` } }));
      } finally { aborts.current.delete(`swap:${key}`); }
    })();
  }

  /* --- Details, review and confirm --- */
  function setContact(next: ContactDetails) {
    dirty.current = true;
    setFields(f => ({ ...f, ...next }));
    setServerErrors(errs => Object.fromEntries(Object.entries(errs).filter(([k]) => !(k in next) || next[k as keyof ContactDetails] === fieldsRef.current[k as keyof ContactDetails])));
  }
  function setNotes(notes: string) {
    dirty.current = true;
    setFields(f => ({ ...f, notes }));
    setServerErrors(({ notes: _gone, ...rest }) => rest);
  }
  const clientErrors = contactErrors(fields);
  const showContactErrors = tried || contactTried;
  const errorFor = (name: keyof UploadFields) => (showContactErrors ? clientErrors[name] : undefined) ?? serverErrors[name]?.[0];
  const contactErrorList = { contact_name: errorFor('contact_name'), contact_email: errorFor('contact_email'), team_name: errorFor('team_name'), phone: errorFor('phone') };
  const contactBad = Object.values(contactErrorList).some(Boolean);
  const forms = rows.filter(r => r.kind === 'order_form');
  const art = rows.filter(r => r.kind === 'artwork');
  const formsDone = forms.filter(r => r.status === 'done' && r.remote);
  const artDone = art.filter(r => r.status === 'done' && r.remote);
  const filesError = filesProblem(rows) ?? serverErrors.files?.[0] ?? null;

  function focusFirstError() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('.ou-page [aria-invalid="true"], .ou-page .ou-drop.is-invalid, .ou-page .ou-alert');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
    }));
  }
  async function goReview() {
    setTried(true); setSubmitError('');
    setServerErrors(({ files: _retry, ...rest }) => rest);
    if (!getToken()) { requireAuth(() => { pending.current = 'review'; }); return; }
    if (Object.keys(contactErrors(fieldsRef.current)).length) { setContactOpen(true); focusFirstError(); return; }
    if (filesProblem(rowsRef.current)) { focusFirstError(); return; }
    setBusy(true);
    // Saved first, then shown as the server holds it: the review is exactly what will be sent.
    const ok = await saveNow(false);
    const read = new Map<number, Suggested>();
    if (ok && draftRef.current) {
      try {
        const d = await orderApi.draft(draftRef.current);
        commit([...d.files.filter(f => f.kind === 'order_form' || f.kind === 'artwork').map(fromRemote), ...rowsRef.current.filter(r => !r.remote)]);
        for (const s of d.suggested ?? []) read.set(s.file_id, s);
      } catch { /* the rows on the page are the same files */ }
    }
    setBusy(false);
    if (!ok) return;
    const ready = rowsRef.current.filter(r => r.kind === 'order_form' && r.remote);
    if (!ready.length || filesProblem(rowsRef.current)) { focusFirstError(); return; }
    // The garment rows read from the order forms ("suggested"), unless these files' rows were already checked.
    const which = ready.map(r => r.remote!.id).join(',');
    if (which !== itemsFor) {
      const found = ready.map(r => r.remote!.suggested ?? read.get(r.remote!.id) ?? null);
      const rowsRead = found.flatMap(s => s?.items ?? []);
      setItems(rowsRead.length ? rowsRead.map(i => ({ ...i, sizes: { ...i.sizes } })) : null);
      setUnread(found.flatMap(s => s?.unknown ?? []).slice(0, 12));
      setItemsFor(which); setItemsConfirmed(false); setConfirmTried(false);
    }
    setStep('review');
    window.scrollTo({ top: 0 });
  }
  function editAgain(target: 'contact' | 'files' | 'notes' | 'top') {
    setStep('edit'); setSubmitError('');
    if (target === 'contact') setContactOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(target === 'contact' ? 'ou-contact' : target === 'files' ? 'ou-upload' : target === 'notes' ? 'ou-notes' : 'ou-top');
      el?.scrollIntoView({ behavior: 'smooth', block: target === 'notes' ? 'center' : 'start' });
      if (target === 'notes') (el as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
    }));
  }
  function setItem(index: number, size: string, value: string) {
    const n = Math.max(0, Math.min(10000, Math.floor(Number(value.replace(/\D/g, '')) || 0)));
    setItems(list => list && list.map((it, i) => (i === index ? { ...it, sizes: { ...it.sizes, [size]: n } } : it)));
    setItemsConfirmed(false);
  }
  function removeItem(index: number) { setItems(list => (list && list.length > 1 ? list.filter((_, i) => i !== index) : list)); setItemsConfirmed(false); }

  // The price: quoted from confirmed rows; otherwise 3DEEZI prices it after checking the order form.
  useEffect(() => {
    if (!PRICES_LIVE || step !== 'review' || !items?.length || !itemsConfirmed) { setQuote({ state: 'required' }); return; }
    let live = true;
    setQuote({ state: 'loading' });
    const timer = setTimeout(() => {
      quoteFor(items, cleanPricing(pricing) ?? {}).then(q => { if (live) setQuote(q?.status === 'priced' && q.total !== null ? { state: 'ready', quote: q } : { state: 'required', quote: q }); })
        .catch(() => { if (live) setQuote({ state: 'required' }); });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
    // Again whenever a price choice changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, items, itemsConfirmed, JSON.stringify(pricing)]);

  async function submit() {
    if (submitting.current || step !== 'review') return;
    if (items?.length && !itemsConfirmed) { setConfirmTried(true); focusFirstError(); return; }
    if (items?.some(it => itemTotal(it) < 1)) { setSubmitError('Each garment needs at least one size and quantity, or remove that row.'); focusFirstError(); return; }
    const id = draftRef.current;
    if (!id) { setSubmitError('Your draft is not saved yet. Press Edit, then Review order again.'); focusFirstError(); return; }
    submitting.current = true; setBusy(true); setSubmitError('');
    const scope = `order-upload-${id}`;
    try {
      const order = await orderApi.submitDraft(id, idempotencyKey(scope), payload());
      clearIdempotencyKey(scope);
      const f = fieldsRef.current, u = userRef.current;
      if (u) { try { localStorage.setItem(lastContactKey(u.id), JSON.stringify({ team_name: f.team_name.trim(), phone: f.phone.trim() })); } catch { /* only a convenience */ } }
      if (owner) dropLocal(owner);
      rowsRef.current.forEach(release);
      setPlaced(order); setDraftId(undefined); commit([]); setItems(null); setStep('sent');
      window.scrollTo({ top: 0 });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422 && err.errors) {
        setServerErrors(err.errors);
        if (Object.keys(err.errors).some(k => k.startsWith('items'))) { setSubmitError(err.message); focusFirstError(); }
        else {
          setStep('edit'); setTried(true);
          if (['contact_name', 'contact_email', 'phone', 'team_name'].some(k => err.errors![k])) setContactOpen(true);
          focusFirstError();
        }
      } else {
        setSubmitError(err.status === 404 ? 'This draft was already sent or deleted. Check My Orders before sending it again.'
          : `${err.message} Your order has not been sent yet. Press Confirm order again: it is only ever sent once.`);
        focusFirstError();
      }
    } finally { submitting.current = false; setBusy(false); }
  }
  function startOver() {
    setPlaced(null); setStep('edit'); setTried(false); setServerErrors({}); setItems(null); setItemsFor(''); setSave({ state: 'idle' }); setContactOpen(false);
    loadFields(withDefaults({ ...EMPTY }));
    window.scrollTo({ top: 0 });
  }
  /** "I don't have an order form": Create Order Form, with the contact details already typed. */
  function toOrderForm() {
    const f = fieldsRef.current;
    const contact = { contact_name: f.contact_name.trim(), contact_email: f.contact_email.trim(), phone: f.phone.trim(), team_name: f.team_name.trim() };
    try { sessionStorage.setItem('3deezi.orderContact', JSON.stringify(contact)); } catch { /* the router state still carries it */ }
    navigate('/orders/new', { state: { contact, from: 'upload' } });
  }
  async function download(file: OrderFile) {
    try { await orderApi.download(file); }
    catch (e) { onNotice(`Couldn’t download ${file.name}: ${(e as Error).message}`); }
  }
  const viewOrder = (order: OrderDetail, focus?: 'pay') => navigate(`/orders?order=${order.id}${focus ? `&focus=${focus}` : ''}`, { state: { order: order.id, number: order.number } });

  /* --- What the page shows --- */
  const header = (current: string, title: string, subtitle?: string) => <OrderPageHeader current={current} title={title} subtitle={subtitle} />;
  if (!owner || !loaded) return <OrderPageLayout className="ou-page" header={header('Upload Your Order', 'Upload your order')} main={<div className="ou-loading"><LoaderCircle className="spin" /> Restoring your order…</div>} />;

  // The submit reply's invoice (payments): "Pay now" when it can be paid; an upload is usually priced after review.
  const invoice = placed ? placed.invoice ?? placed.payment : null;
  if (step === 'sent' && placed) return <OrderPageLayout className="ou-page" header={header('Order sent', 'Order sent', 'Your order is with 3DEEZI.')} main={
    <section className="op-card ou-sent" aria-live="polite">
      <div className="ou-sent-icon"><Check size={38} strokeWidth={3} /></div>
      <h2>Thank you{user ? `, ${user.name.split(' ')[0]}` : ''}!</h2>
      <p>We have your order form. We’ll check it, then confirm sizes, quantities and the price with you before anything is made.</p>
      <div className="ou-ref"><small>Your order reference</small><strong data-testid="order-reference">{placed.number}</strong></div>
      <div className="ou-sent-actions">
        <button type="button" className="op-bar-primary ou-sent-main" onClick={() => viewOrder(placed)}>View my order <ArrowRight size={20} /></button>
        {invoice && payable(invoice) && <button type="button" className="ou-pill ou-pay" onClick={() => (invoice.invoice_number ? navigate(`/invoices/${encodeURIComponent(invoice.invoice_number)}`) : window.location.assign(String(invoice.pay_url)))}><CreditCard size={17} /> Pay now{invoice.amount_due ? ` · ${money(invoice.amount_due, invoice.currency ?? 'AUD')}` : ''}</button>}
      </div>
      {invoice && !payable(invoice) && invoice.status === 'quote_required' && <p className="ou-sent-price"><Info size={16} /> Price: Quote required. 3DEEZI confirms it after checking your order form, then sends your invoice.</p>}
      <p className="ou-sent-more"><button type="button" onClick={startOver}>Upload another order</button></p>
    </section>} />;

  const reviewing = step === 'review';
  const team = fields.team_name.trim();
  const accept = (kind: UploadKind) => rules[kind].extensions.map(e => `.${e}`).join(',');
  const fileList = (list: Row[], label: string) => list.length > 0 && <ul className="ou-files" aria-label={label}>
    {list.map(r => <FileRowView key={r.key} row={r} accept={accept(r.kind)} onRemove={() => void removeRow(r.key)} onRetry={() => retryRow(r.key)} onReplace={file => replaceRow(r.key, file)} onDismiss={() => patchRow(r.key, { swap: undefined, error: undefined })} />)}
  </ul>;
  const pendingText = (list: Row[]) => (list.some(busyRow) ? 'Uploading…' : list.some(r => r.status === 'waiting') ? 'Waiting for sign in' : 'Not added');
  const savedText = !user ? 'Kept on this device. Sign in to save it to your account.'
    : save.state === 'saving' ? 'Saving…'
    : save.state === 'error' ? save.message
    : draftId ? `Draft saved to your account${save.at ? ` at ${timeText(save.at)}` : ''}. Not sent until you confirm it.`
    : 'Not saved to your account yet.';
  const lastTeam = user ? readLastContact(user.id).team_name : undefined;

  const contactSection = contactOpen
    ? <div id="ou-contact" className="ou-contact-edit"><ContactDetailsCard value={fields} onChange={setContact} errors={contactErrorList}>
      <div className="ou-contact-actions"><span className="op-hint">Phone is optional.</span><button type="button" className="op-link" onClick={() => { setContactTried(true); if (!Object.keys(contactErrors(fieldsRef.current)).some(k => k !== 'notes')) setContactOpen(false); else focusFirstError(); }}><Check size={16} /> Done</button></div>
    </ContactDetailsCard></div>
    : <OrderSection number={1} id="ou-contact" title="Contact & team details" action={<button type="button" className="op-link" onClick={() => setContactOpen(true)}><Pencil size={15} /> Edit</button>}>
      <dl className="ou-contact">
        <div><dt>Contact name</dt><dd className={fields.contact_name.trim() ? '' : 'is-missing'}>{fields.contact_name.trim() || 'Not added'}</dd></div>
        <div><dt>Email</dt><dd className={fields.contact_email.trim() ? '' : 'is-missing'}>{fields.contact_email.trim() || 'Not added'}</dd></div>
        <div><dt>Team / organisation</dt><dd className={team ? '' : 'is-missing'}>{team || <button type="button" className="ou-add" onClick={() => { setContactOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.ou-page input[name="team_name"]')?.focus()); }}>Add your team</button>}</dd></div>
        <div><dt>Phone</dt><dd className={fields.phone.trim() ? '' : 'is-empty'}>{fields.phone.trim() || 'Not added'}</dd></div>
      </dl>
      {showContactErrors && contactBad ? <p className="ou-alert" role="alert"><CircleAlert size={15} /> {Object.values(contactErrorList).find(Boolean)} <button type="button" className="ou-add" onClick={() => setContactOpen(true)}>Edit</button></p>
        : user && <p className="ou-contact-note"><Info size={14} /> From your account{lastTeam ? ' and your last order' : ''}. Edit them for this order if they’re different.</p>}
    </OrderSection>;

  const main = !reviewing ? <>
    {contactSection}
    <OrderSection number={2} id="ou-upload" title="Upload order form">
      <DropArea kind="order_form" rule={rules.order_form} invalid={tried && !!filesError && !formsDone.length} onFiles={list => addFiles('order_form', list)} />
      {fileList(forms, 'Order form files')}
      {tried && filesError && <p className="ou-alert" role="alert"><CircleAlert size={15} /> {filesError}</p>}
    </OrderSection>
    <OrderSection number={3} id="ou-art" title="Artwork & notes">
      <div className="ou-art">
        <div className="ou-art-files">
          <span className="op-label">Add logos, artwork or references <span className="ou-optional">(Optional)</span></span>
          <DropArea kind="artwork" compact rule={rules.artwork} onFiles={list => addFiles('artwork', list)} />
          {fileList(art, 'Artwork files')}
        </div>
        <OrderField label="Additional instructions" error={errorFor('notes')}><textarea id="ou-notes" className="op-input ou-notes" rows={3} maxLength={4000} value={fields.notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else we should know about this order?" aria-invalid={!!errorFor('notes')} /></OrderField>
      </div>
    </OrderSection>
  </> : <>
    {submitError && <p className="ou-alert ou-submit-error" role="alert"><CircleAlert size={16} /> {submitError}</p>}
    <ReviewView fields={fields} forms={formsDone} art={artDone} items={items} unread={unread} confirmed={itemsConfirmed} confirmTried={confirmTried} quote={quote} pricing={pricing} onPricing={setPricing}
      onConfirm={v => { setItemsConfirmed(v); setConfirmTried(false); }} onItem={setItem} onRemoveItem={removeItem} onEdit={editAgain} onDownload={download} />
  </>;

  const side = <>
    <OrderSummaryCard title="Upload summary" name={team || <span className="ou-quiet">Your team</span>} badge="Draft"
      rows={[{ key: 'form', label: 'Order form', value: formsDone.length ? `${plural(formsDone.length, 'file')} uploaded` : undefined, pending: pendingText(forms) },
        { key: 'art', label: 'Supporting artwork', value: artDone.length ? plural(artDone.length, 'file') : undefined, pending: pendingText(art) }]}
      hint="Sizes and quantities will be confirmed during review."
      footer={<p className={`ou-saved ${save.state === 'error' ? 'is-error' : ''}`} data-testid="save-state">{savedText}</p>} />
    <AssistToggle open={assistOpen} onToggle={() => setAssistOpen(v => !v)}>
      <AssistCard title="3DEEZI Assist" heading="Need help with your upload?" placeholder="Ask for help..."
        actions={[
          { key: 'files', icon: <FileText size={24} strokeWidth={1.5} />, label: 'Which files should I upload?', open: topic === 'files', onClick: () => setTopic(t => (t === 'files' ? null : 'files')), panel: <div className="ou-answer">
            <p><b>Your order form</b>: the spreadsheet, PDF, Word file or a clear photo that lists each garment with its sizes and quantities (and players’ names and numbers if you have them). One file is enough.</p>
            <ul><li>Order form: {typesText(rules.order_form.extensions)}.</li><li>Artwork (optional): {typesText(rules.artwork.extensions)}.</li><li>Up to {mbText(rules.order_form.max_kb)} each, {rules.max_files} files per order.</li></ul>
            <button type="button" className="op-link" onClick={() => askAssist('Which files should I upload for my order, and what should my order form include?')}>Ask 3DEEZI Assist more <ArrowRight size={15} /></button>
          </div> },
          { key: 'noform', icon: <CircleHelp size={24} strokeWidth={1.5} />, label: 'I don’t have an order form', open: topic === 'noform', onClick: () => setTopic(t => (t === 'noform' ? null : 'noform')), panel: <div className="ou-answer">
            <p>No problem. <b>Create Order Form</b> builds one with you: choose garments, add sizes, names and numbers. Your contact details come with you.</p>
            <button type="button" className="ou-pill" onClick={toOrderForm}>Create order form <ArrowRight size={15} /></button>
          </div> },
        ]} />
    </AssistToggle>
  </>;

  const bar = !reviewing
    ? <OrderBottomBar secondary={{ label: 'Save draft', onClick: () => void saveNow(true), busy: save.state === 'saving' }}
        status={save.state === 'error' ? <span className="ou-bar-error">{save.message}</span> : save.state === 'saved' && draftId ? `Draft saved ${timeText(save.at)}` : !user ? 'Kept on this device' : ''}
        primary={{ label: 'Review order', onClick: () => void goReview(), busy }} note="Your order is only submitted after review." />
    : <OrderBottomBar secondary={{ label: 'Edit', icon: <ArrowLeft size={22} />, onClick: () => editAgain('top'), disabled: busy }}
        primary={{ label: busy ? 'Sending…' : 'Confirm order', icon: <Check size={20} />, onClick: () => void submit(), busy }} note="Sends one order. We confirm sizes, quantities and price with you." />;

  return <div id="ou-top"><OrderPageLayout className="ou-page" header={<>
    {header('Upload Your Order', reviewing ? 'Review your order' : 'Upload your order', reviewing ? 'Check everything below. Nothing is sent until you press Confirm order.' : 'Already have your order ready? Upload your form and artwork below.')}
    {!user && <div className="ou-signin" role="note"><LogIn size={20} /><p>Sign in to upload your files and send your order. Anything you type here is kept, and comes with you when you sign in.</p><button type="button" className="ou-pill" onClick={() => requireAuth()}>Sign in</button></div>}
    {banner && <div className="ou-banner" role="status"><Info size={16} /><span>{banner}</span><button type="button" className="op-icon-btn" aria-label="Dismiss" onClick={() => setBanner('')}><X size={16} /></button></div>}
  </>} main={main} side={side} bar={bar} /></div>;
}

/* ------------------------------------------------------------------------------------------------- this page's parts */

/**
 * An upload area with its own file picker; the allowed types and size show before anything is chosen. The order form
 * gets the large one from the design ("Drag your order form here … Browse files"), artwork the compact one.
 * (The shared FileDropBox has no large variant, Replace or "waiting for sign-in" yet: asked for in the report.)
 */
function DropArea({ kind, rule, compact, invalid, onFiles }: { kind: UploadKind; rule: FileRule; compact?: boolean; invalid?: boolean; onFiles: (files: FileList) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const pick = () => input.current?.click();
  const hasFiles = (e: ReactDragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const rules = <p className="ou-rules"><b>{typesText(rule.extensions)}</b> · up to {mbText(rule.max_kb)} each<small>{rule.extensions.map(e => `.${e}`).join(' ')}</small></p>;
  return <div className={`ou-drop ${compact ? 'is-compact' : ''} ${over ? 'is-over' : ''} ${invalid ? 'is-invalid' : ''}`} data-kind={kind}
    onClick={e => { if (!(e.target as HTMLElement).closest('button, input, a')) pick(); }}
    onDragEnter={e => { if (!hasFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); }}
    onDragOver={e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
    onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
    onDrop={e => { e.preventDefault(); depth.current = 0; setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}>
    <input ref={input} type="file" hidden multiple accept={rule.extensions.map(e => `.${e}`).join(',')} data-testid={`${kind}-input`} aria-label={kind === 'order_form' ? 'Choose your order form' : 'Choose logos, artwork or references'}
      onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
    {compact ? <>
      <Paperclip className="ou-drop-icon" size={30} strokeWidth={1.6} />
      <div className="ou-drop-copy"><strong>Add logos, artwork or references</strong><button type="button" className="ou-pill is-small" onClick={pick}>Choose files</button>{rules}</div>
    </> : <>
      <FileUp className="ou-drop-icon" size={52} strokeWidth={1.4} />
      <strong className="ou-drop-title"><span className="ou-mouse">Drag your order form here</span><span className="ou-touch">Add your order form</span></strong>
      <span className="ou-or ou-mouse">or</span>
      <button type="button" className="ou-pill" onClick={pick}>Browse files</button>
      {rules}
    </>}
    {invalid && <span className="op-sr" aria-invalid="true">Order form needed</span>}
  </div>;
}

function FileIcon({ name, size = 28 }: { name: string; size?: number }) {
  const ext = fileExtension(name);
  const Icon = SHEETS.includes(ext) ? FileSpreadsheet : PICTURES.includes(ext) ? FileImage : FileText;
  return <Icon size={size} strokeWidth={1.5} />;
}
const Progress = ({ value, label }: { value: number; label: string }) => <span className={`ou-progress ${value >= 0.99 ? 'is-busy' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: pct(value) }} /></span>;

/** One file: uploading (progress), uploaded (✓, Replace, ✕), waiting for sign-in, or refused (the reason in red). */
function FileRowView({ row, accept, onRemove, onRetry, onReplace, onDismiss }: { row: Row; accept: string; onRemove: () => void; onRetry: () => void; onReplace: (file: File) => void; onDismiss: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const swapping = !!row.swap && !row.swap.error;
  const name = swapping ? row.swap!.name : row.name;
  const status = swapping ? 'uploading' : row.status;
  return <li className={`ou-file ${row.status === 'error' ? 'is-error' : ''}`} data-status={status} data-name={name}>
    <span className="ou-file-icon">{row.preview && !swapping ? <img src={row.preview} alt="" /> : <FileIcon name={name} />}</span>
    <div className="ou-file-main">
      <span className="ou-file-name" title={name}>{name}</span>
      {swapping ? <><span className="ou-file-meta">Replacing {row.name} · {pct(row.swap!.progress)}</span><Progress value={row.swap!.progress} label={`Uploading ${name}`} /></>
        : row.status === 'uploading' ? <><span className="ou-file-meta">{row.progress >= 0.99 ? 'Checking the file…' : `Uploading… ${pct(row.progress)}`}</span><Progress value={row.progress} label={`Uploading ${name}`} /></>
        : row.status === 'queued' ? <span className="ou-file-meta">Waiting to upload…</span>
        : row.status === 'waiting' ? <span className="ou-file-meta is-waiting">Uploads when you sign in</span>
        : row.status === 'error' ? <span className="ou-file-error" role="alert">{row.error}</span>
        : <span className="ou-file-meta">{formatBytes(row.size)}{row.remote?.extension ? ` · ${row.remote.extension.toUpperCase()}` : ''}</span>}
      {row.status === 'done' && row.error && <span className="ou-file-error" role="alert">{row.error}</span>}
      {row.swap?.error && <span className="ou-file-error" role="alert">{row.swap.error} <button type="button" className="ou-add" onClick={onDismiss}>OK</button></span>}
    </div>
    <div className="ou-file-side">
      {row.status === 'done' && !swapping && <span className="ou-done"><CircleCheck size={21} /> Uploaded</span>}
      {row.status === 'done' && <>
        <input ref={picker} type="file" hidden accept={accept} aria-label={`Replace ${row.name}`} data-testid="replace-input" onChange={e => { const file = e.target.files?.[0]; if (file) onReplace(file); e.target.value = ''; }} />
        <button type="button" className="ou-text-button" disabled={swapping || row.removing} onClick={() => picker.current?.click()}><Replace size={14} /> Replace</button>
      </>}
      {row.status === 'error' && row.retry && <button type="button" className="ou-text-button" onClick={onRetry}><RotateCcw size={14} /> Try again</button>}
      <button type="button" className="ou-icon" aria-label={`Remove ${name}`} title={status === 'uploading' ? 'Cancel and remove' : 'Remove'} disabled={row.removing} onClick={onRemove}>{row.removing ? <LoaderCircle className="spin" size={18} /> : <X size={20} />}</button>
    </div>
  </li>;
}

/**
 * 3DEEZI ASSIST on this page starts as a compact "3DEEZI ASSIST ▾" bar (as on My Orders); it opens the Assist card
 * from the upload design, which ▴ closes again. (The shared AssistCard has no collapsed state yet: asked for.)
 */
function AssistToggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  const bar = useRef<HTMLButtonElement>(null), hide = useRef<HTMLButtonElement>(null), first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } (open ? hide : bar).current?.focus(); }, [open]);
  if (!open) return <button ref={bar} type="button" className="op-card ou-assist-bar" aria-expanded={false} onClick={onToggle}><AssistSparkle size={28} /><span>3DEEZI Assist</span><ChevronDown size={20} /></button>;
  return <div className="ou-assist">{children}<button ref={hide} type="button" className="ou-assist-hide" aria-expanded aria-label="Close 3DEEZI Assist" title="Close" onClick={onToggle}><ChevronUp size={20} /></button></div>;
}

/** The review: everything read only with Edit, the rows read from the order form to check, and the price. */
function ReviewView({ fields, forms, art, items, unread, confirmed, confirmTried, quote, pricing, onPricing, onConfirm, onItem, onRemoveItem, onEdit, onDownload }: {
  fields: UploadFields; forms: Row[]; art: Row[]; items: OrderItem[] | null; unread: string[]; confirmed: boolean; confirmTried: boolean; quote: { state: 'required' | 'loading' | 'ready'; quote?: Quote };
  pricing: PricingChoice; onPricing: (next: PricingChoice) => void;
  onConfirm: (value: boolean) => void; onItem: (index: number, size: string, value: string) => void; onRemoveItem: (index: number) => void; onEdit: (target: 'contact' | 'files' | 'notes') => void; onDownload: (file: OrderFile) => void;
}) {
  const edit = (target: 'contact' | 'files' | 'notes', what: string) => <button type="button" className="op-link" onClick={() => onEdit(target)} aria-label={`Edit ${what}`}><Pencil size={15} /> Edit</button>;
  const value = (v: string) => (v.trim() ? <dd>{v.trim()}</dd> : <dd className="is-empty">Not added</dd>);
  let n = 0;
  return <>
    <OrderSection number={++n} id="ou-review-contact" title="Contact & team details" action={edit('contact', 'contact details')} className="ou-review">
      <dl className="ou-pairs"><div><dt>Contact name</dt>{value(fields.contact_name)}</div><div><dt>Email</dt>{value(fields.contact_email)}</div><div><dt>Team / organisation</dt>{value(fields.team_name)}</div><div><dt>Phone</dt>{value(fields.phone)}</div></dl>
    </OrderSection>
    <OrderSection number={++n} id="ou-review-files" title="Order form" action={edit('files', 'files')} className="ou-review">
      <ul className="ou-files">{forms.map(r => <li key={r.key} className="ou-file" data-status="done" data-name={r.name}>
        <span className="ou-file-icon"><FileIcon name={r.name} /></span>
        <div className="ou-file-main"><span className="ou-file-name" title={r.name}>{r.name}</span><span className="ou-file-meta">{formatBytes(r.size)}{r.remote?.extension ? ` · ${r.remote.extension.toUpperCase()}` : ''}</span></div>
        <div className="ou-file-side"><span className="ou-done"><CircleCheck size={21} /> Uploaded</span>{r.remote && <button type="button" className="ou-icon" title="Download to check it" aria-label={`Download ${r.name}`} onClick={() => onDownload(r.remote!)}><Download size={18} /></button>}</div>
      </li>)}</ul>
    </OrderSection>
    {items && items.length > 0 && <OrderSection number={++n} id="ou-review-items" title="Details from your order form" className="ou-review">
      <p className="ou-lead">We read these garments and sizes from your order form. Check them and correct anything that is wrong.</p>
      <div className="ou-table"><table className="ou-rows"><thead><tr><th>Garment</th><th>Sizes</th><th>Total</th><th><span className="op-sr">Remove</span></th></tr></thead><tbody>
        {items.map((it, i) => { const name = it.name || it.label || garmentName(it.garment); return <tr key={i}>
          <td>{name}</td>
          <td><div className="ou-sizes">{SIZES.map(s => <label key={s}>{s}<input inputMode="numeric" value={it.sizes[s] ? String(it.sizes[s]) : ''} placeholder="0" onChange={e => onItem(i, s, e.target.value)} aria-label={`${name}, size ${s}`} /></label>)}</div></td>
          <td className="is-num">{itemTotal(it)}</td>
          <td>{items.length > 1 && <button type="button" className="ou-icon" aria-label={`Remove ${name}`} title="Remove this row" onClick={() => onRemoveItem(i)}><X size={18} /></button>}</td>
        </tr>; })}
      </tbody></table></div>
      {unread.length > 0 && <p className="ou-unread"><Info size={15} /><span>Some lines could not be read, so 3DEEZI checks them with you: {unread.join(' · ')}</span></p>}
      <label className={`ou-confirm ${confirmTried && !confirmed ? 'is-invalid' : ''}`}><input type="checkbox" checked={confirmed} aria-invalid={confirmTried && !confirmed} onChange={e => onConfirm(e.target.checked)} /><span><strong>These details are correct</strong><small>We make your order from them. Anything unclear in your order form is checked with you.</small></span></label>
      {confirmTried && !confirmed && <p className="ou-alert" role="alert"><CircleAlert size={15} /> Tick “These details are correct” (or correct them first) to confirm your order.</p>}
    </OrderSection>}
    <OrderSection number={++n} id="ou-review-art" title="Artwork & notes" action={edit('notes', 'artwork and notes')} className="ou-review">
      <dl className="ou-pairs">
        <div><dt>Supporting artwork</dt><dd className={art.length ? '' : 'is-empty'}>{art.length ? <ul className="ou-thumbs">{art.map(r => <li key={r.key}><span className="ou-file-icon">{r.preview ? <img src={r.preview} alt="" /> : <FileIcon name={r.name} size={24} />}</span><span title={r.name}>{r.name}</span></li>)}</ul> : 'Not added'}</dd></div>
        <div><dt>Additional instructions</dt>{value(fields.notes)}</div>
      </dl>
    </OrderSection>
    <OrderSection number={++n} id="ou-review-price" title="Price" className="ou-review">
      <PricingChoices value={pricing} onChange={onPricing} />
      <PriceBox quote={quote} waitingForTick={PRICES_LIVE && !!items?.length && !confirmed} />
    </OrderSection>
  </>;
}

/**
 * The price on the review: the quote for the confirmed rows, or "Quote Required" (an upload is priced by 3DEEZI once
 * its order form is checked). TEMPORARY: the payments agent's PriceBreakdown (components/OrderPayment.tsx) replaces
 * this when it lands.
 */
function PriceBox({ quote, waitingForTick }: { quote: { state: 'required' | 'loading' | 'ready'; quote?: Quote }; waitingForTick: boolean }) {
  if (quote.state === 'loading' && !quote.quote) return <p className="ou-quote-required"><LoaderCircle className="spin" size={18} /> Working out the price…</p>;
  const q = quote.quote;
  if (q) return <div data-testid={q.status === 'priced' ? 'quote' : 'quote-required'}><PriceBreakdown quote={q as unknown as PayQuote} loading={quote.state === 'loading'} /></div>;
  return <div className="ou-quote-required" data-testid="quote-required"><Info size={18} /><div>
    <p><b>Price confirmed by 3DEEZI after review (Quote Required).</b>{waitingForTick ? ' Tick “These details are correct” above to see a price now.' : ' You see the price before you pay anything.'}</p>
  </div></div>;
}
