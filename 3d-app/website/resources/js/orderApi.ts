/**
 * 3DEEZI Orders: the API for the order pages (Create Order Form, Upload Your Order, My Orders) and the admin board.
 * The contract is in orders-api.md. Owned by the orders-server agent: ask before changing it.
 */
import { api, ApiError, baseUrl, fetchFile, getToken, saveBlob } from './api';

export type OrderStatus = 'pending' | 'confirmed' | 'in_production' | 'shipped' | 'delivered' | 'cancelled';
export type StageKey = 'received' | 'design' | 'production' | 'shipped' | 'delivered' | 'cancelled';
export type Tone = 'blue' | 'amber' | 'violet' | 'green' | 'red' | 'grey';
export type Approval = 'waiting' | 'review' | 'approved' | 'changes';
export type FileKind = 'order_form' | 'artwork' | 'proof' | 'photo' | 'invoice' | 'other';
export type DraftKind = 'form' | 'upload';

/** The five board stages (the existing order statuses), plus cancelled (off the board). */
export const STAGES: { key: StageKey; status: OrderStatus; label: string; tone: Tone }[] = [
  { key: 'received', status: 'pending', label: 'Order Received', tone: 'blue' },
  { key: 'design', status: 'confirmed', label: 'Design & Approval', tone: 'amber' },
  { key: 'production', status: 'in_production', label: 'Production', tone: 'violet' },
  { key: 'shipped', status: 'shipped', label: 'Shipped', tone: 'blue' },
  { key: 'delivered', status: 'delivered', label: 'Delivered', tone: 'green' },
];
export const stageOf = (status: string) => STAGES.find(s => s.status === status) ?? { key: 'cancelled' as StageKey, status: 'cancelled' as OrderStatus, label: 'Cancelled', tone: 'grey' as Tone };

export interface SubStatus { key: string; label: string; tone: Tone }
export interface OrderPlayer { name: string; number: string; size?: string | null }
/** A garment row of the order form. */
export interface OrderItem {
  garment: string; sport?: string | null; fit?: string | null; label?: string | null; project_id?: number | null;
  /** Quantity per size, e.g. { S: 2, M: 4 }. */
  sizes: Record<string, number>; players?: OrderPlayer[] | null;
  /** Sent back by the server only. */
  name?: string; quantity?: number; thumbnail?: string | null; project_name?: string; project_version?: number;
}
/** The order fields; a draft's `data` uses the same names (plus anything the page keeps there). */
export interface OrderFields {
  contact_name?: string; contact_email?: string; phone?: string; team_name?: string; shipping_address?: string;
  needed_by?: string; notes?: string; items?: OrderItem[];
  /** The customer's pricing choices (payments-api.md R3). */
  pricing?: { destination?: string | null; extras?: string[] | null; discount_code?: string | null } | null;
}
export interface Suggested { items: OrderItem[]; players: number; unknown: string[]; rows: number; summary: string }
export interface OrderFile {
  id: number; kind: FileKind; name: string; extension: string; mime_type: string; size: number; thumb: string | null;
  /** The API path to download it: orderApi.download(file). */
  download: string; created_at: string;
  /** Design proofs: their version and the customer's answer. */
  version?: number | null; review_status?: 'pending' | 'approved' | 'changes' | 'superseded' | null; reviewed_at?: string | null; review_note?: string | null;
  /** Staff only. */
  visibility?: 'customer' | 'internal';
  /** An order form just uploaded (CSV or XLSX): the rows read from it, for the customer to check. */
  suggested?: Suggested | null;
}
export interface DraftSummary { id: number; kind: DraftKind; title: string | null; files_count: number; garments_count: number; link: string; created_at: string; updated_at: string }
export interface OrderDraft {
  id: number; kind: DraftKind; title: string | null; data: OrderFields & Record<string, unknown>; files: OrderFile[]; link: string;
  suggested: (Suggested & { file_id: number })[]; created_at: string; updated_at: string;
}
/** From the order's invoice (the payments feature, payments-api.md 2); null without one. */
export interface Payment {
  invoice_id: number; invoice_number: string | null;
  status: 'quote_required' | 'awaiting_payment' | 'part_paid' | 'paid' | 'refunded' | 'cancelled'; label: string; tone: string;
  currency: string; total: string | null; amount_paid: string | null; amount_due: string | null; deposit_due: string | null;
  issued_at: string | null; due_at: string | null; paid_at: string | null; pay_url: string | null; pdf: string | null;
  can_pay: boolean; last_attempt: { status: string; message: string | null; at: string } | null;
  reasons: { code: string; message: string; key?: string }[]; production_ready: boolean;
}
export interface BoardGarment { garment: string; name: string; quantity: number; thumbnail: string | null }
export interface LatestUpdate { kind: string; text: string; message: string | null; at: string | null }
export interface Tracking { carrier: string | null; number: string | null; url: string | null }
export interface BoardOrder {
  id: number; number: string; name: string; source: 'studio' | 'form' | 'upload' | 'admin';
  status: OrderStatus; stage: StageKey; stage_label: string; sub_status: SubStatus; step: string | null; approval: Approval | null;
  quantity: number; garments: BoardGarment[]; cover: string | null; submitted_at: string; updated_at: string;
  latest_update: LatestUpdate | null; tracking: Tracking | null; action: 'review_design' | 'track_delivery' | null;
  completed: boolean; needed_by: string | null; files_count: number; payment: Payment | null; link: string;
  /** Staff board only. */
  customer?: { id: number; name: string; email: string } | null; assigned_to?: number | null; assignee?: string | null;
  due_date?: string | null; quote_required?: boolean; unit_price?: string | null; total?: string | null; currency?: string; admin_link?: string;
}
export interface OrderUpdate {
  id: number; kind: 'submitted' | 'stage' | 'step' | 'approval' | 'tracking' | 'note' | 'file' | 'edit'; text: string; message: string | null;
  from_status: string | null; to_status: string | null; step: string | null; approval: string | null;
  author: 'staff' | 'customer' | 'system'; file: OrderFile | null; created_at: string;
  /** Staff only. */
  visibility?: 'customer' | 'internal'; user?: { id: number; name: string } | null; data?: Record<string, unknown> | null;
}
export interface OrderDetail extends BoardOrder {
  team_name: string | null; contact_name: string; contact_email: string | null; phone: string | null; shipping_address: string | null; notes: string | null;
  items: OrderItem[]; sizes: Record<string, number>; names: 'same' | 'list' | 'none' | null; players: OrderPlayer[] | null;
  unit_price: string | null; total: string | null; currency: string; project_id: number | null; project_version: number | null;
  project: { id: number; name: string; garment: string; sport: string; thumbnail?: string | null; version?: number } | null;
  files: OrderFile[]; proof: OrderFile | null; proofs: OrderFile[]; stages_reached: Partial<Record<StageKey, string>>; updates: OrderUpdate[];
  carrier: string | null; tracking_number: string | null; tracking_url: string | null; created_at: string;
  /** Submit responses: the invoice for "Pay now" (same as payment). */
  invoice?: Payment | null;
  /** Staff only. */
  admin_notes?: string | null; design_snapshot?: unknown; user?: { id: number; name: string; email: string } | null;
}
export interface BoardStage { key: StageKey; status: OrderStatus; label: string; tone: Tone; count: number; orders: BoardOrder[] }
export interface Board {
  view: 'current' | 'completed'; search: string; completed_after_days: number; updated_at: string;
  counts: { current: number; completed: number }; stages: BoardStage[]; cancelled: BoardOrder[];
  /** The customer's board only. */
  drafts?: DraftSummary[];
}
export interface OrderOptions {
  garments: { id: string; name: string }[]; sports: { id: string; name: string }[]; fits: { id: string; name: string }[]; sizes: string[];
  stages: { key: StageKey; status: OrderStatus; label: string; tone: Tone; steps: { key: string; label: string }[] }[];
  files: { order_form: { extensions: string[]; max_kb: number }; artwork: { extensions: string[]; max_kb: number }; max_files: number };
  completed_after_days: number;
}
export interface AssistResult { items: OrderItem[]; team_name: string | null; notes: string | null; unknown: string[]; summary: string; source: 'parser' | 'ai' }
export interface Notifications { unread: number; items: { id: string; type: string; data: { order_id: number; number: string; name: string; kind: string; text: string; message: string | null; link: string }; read_at: string | null; created_at: string }[] }
/** A staff stage move refused because the design is not approved (409): send again with confirm. */
export const approvalMissing = (e: unknown) => e instanceof StageBlocked && e.problems.some(p => p.code === 'approval_missing');

/** What stops a move into Production: approval_missing, payment_missing (needs a reason to override). */
export interface StageProblem { code: 'approval_missing' | 'payment_missing'; message: string; needs_reason?: boolean }
/** A staff stage move refused (409) until confirmed: see orderApi.moveStage. */
export class StageBlocked extends ApiError {
  constructor(message: string, public problems: StageProblem[]) { super(message, 409); }
}

/** PATCH a stage move, keeping the 409's problems (api() keeps only the message). */
async function stageRequest(path: string, body: Record<string, unknown>): Promise<BoardOrder> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try { response = await fetch(`${baseUrl}/api/v1${path}`, { method: 'PATCH', headers, body: json(body) }); }
  catch { throw new ApiError('Could not reach the server. Check your connection and try again.', 0); }
  const result = await response.json().catch(() => ({}));
  if (response.status === 409 && Array.isArray(result.problems)) throw new StageBlocked(result.message, result.problems);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError((result.errors ? Object.values(result.errors).flat().join(' ') : result.message) || 'Something went wrong. Please try again.', response.status, result.errors);
  }
  return result.data as BoardOrder;
}

const json = (body: unknown) => JSON.stringify(body);
const post = (body: unknown, headers?: Record<string, string>): RequestInit => ({ method: 'POST', body: json(body), headers });

export const orderApi = {
  /** PUBLIC: the forms' choices. */
  options: () => api<OrderOptions>('/orders/options'),
  /** PUBLIC: "Help me add sizes" (garment rows read from a description). */
  assist: (text: string) => api<AssistResult>('/orders/assist', post({ text })),

  board: (view: 'current' | 'completed' = 'current', search = '') => api<Board>(`/orders/board?${new URLSearchParams({ view, ...(search ? { search } : {}) })}`),
  list: () => api<BoardOrder[]>('/orders'),
  order: (id: number) => api<OrderDetail>(`/orders/${id}`),
  /** The customer's answer to the waiting design proof (its id): approve, or changes with a note. */
  answerProof: (orderId: number, decision: 'approve' | 'changes', proofId?: number | null, message?: string) =>
    api<OrderDetail>(`/orders/${orderId}/approval`, post({ decision, proof_id: proofId ?? null, message: message || null })),

  drafts: () => api<DraftSummary[]>('/order-drafts'),
  draft: (id: number) => api<OrderDraft>(`/order-drafts/${id}`),
  createDraft: (kind: DraftKind, data: OrderFields & Record<string, unknown>) => api<OrderDraft>('/order-drafts', post({ kind, data })),
  saveDraft: (id: number, data: OrderFields & Record<string, unknown>) => api<OrderDraft>(`/order-drafts/${id}`, { method: 'PATCH', body: json({ data }) }),
  deleteDraft: (id: number) => api(`/order-drafts/${id}`, { method: 'DELETE' }),
  removeDraftFile: (draftId: number, fileId: number) => api(`/order-drafts/${draftId}/files/${fileId}`, { method: 'DELETE' }),
  /** Submits a saved draft once; `fields` replace the draft's saved ones. Reuse the same key for retries. */
  submitDraft: (draftId: number, key: string, fields: OrderFields = {}) => api<OrderDetail>(`/order-drafts/${draftId}/submit`, post(fields, { 'Idempotency-Key': key })),
  /** Submits without a draft (no files). */
  submit: (fields: OrderFields & { source: DraftKind; draft_id?: number }, key: string) => api<OrderDetail>('/orders', post(fields, { 'Idempotency-Key': key })),
  /** Saves a file (order form, artwork, proof...) to the computer. */
  download: async (file: Pick<OrderFile, 'download' | 'name'>) => saveBlob(await fetchFile(file.download), file.name),

  notifications: () => api<Notifications>('/notifications'),
  readNotifications: (ids?: string[]) => api<{ unread: number }>('/notifications/read', post(ids ? { ids } : {})),

  // ---- staff (admin accounts only)
  adminBoard: (view: 'current' | 'completed' = 'current', search = '') => api<Board>(`/admin/orders/board?${new URLSearchParams({ view, ...(search ? { search } : {}) })}`),
  adminOrder: (id: number) => api<OrderDetail>(`/admin/orders/${id}`),
  staff: () => api<{ id: number; name: string; email: string }[]>('/admin/orders/staff'),
  /**
   * Moves an order to a stage. Into Production without approval or full payment it throws StageBlocked (the
   * problems): ask, then send again with confirmApproval and/or confirmUnpaid + reason.
   */
  moveStage: (id: number, status: OrderStatus, extra: { step?: string | null; message?: string; visibility?: 'customer' | 'internal'; confirmApproval?: boolean; confirmUnpaid?: boolean; reason?: string } = {}) =>
    stageRequest(`/admin/orders/${id}/stage`, { status, step: extra.step, message: extra.message || null, visibility: extra.visibility,
      confirm_without_approval: extra.confirmApproval || undefined, confirm_unpaid: extra.confirmUnpaid || undefined, override_reason: extra.reason || undefined }),
  postUpdate: (id: number, body: { message?: string; visibility?: 'customer' | 'internal'; step?: string | null; approval?: Approval; carrier?: string | null; tracking_number?: string | null; tracking_url?: string | null; assigned_to?: number | null; due_date?: string | null }) =>
    api<OrderDetail>(`/admin/orders/${id}/updates`, post(body)),
  removeOrderFile: (orderId: number, fileId: number) => api<OrderDetail>(`/admin/orders/${orderId}/files/${fileId}`, { method: 'DELETE' }),
};

/** One key per submission (kept for this tab), reused by every retry of it; clear it after a success. */
export function idempotencyKey(scope: string): string {
  const name = `3deezi.orderKey.${scope}`;
  try {
    const kept = sessionStorage.getItem(name);
    if (kept) return kept;
  } catch { /* private mode: a fresh key */ }
  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  try { sessionStorage.setItem(name, key); } catch { /* kept in memory by the caller */ }
  return key;
}
export function clearIdempotencyKey(scope: string) { try { sessionStorage.removeItem(`3deezi.orderKey.${scope}`); } catch { /* nothing kept */ } }

/** The same checks as the server, before uploading: null when the file can be sent. */
export function fileProblem(file: File, kind: FileKind, options?: Pick<OrderOptions, 'files'>): string | null {
  const types: Partial<Record<FileKind, string[]>> = {
    order_form: options?.files.order_form.extensions ?? ['pdf', 'xlsx', 'xls', 'csv', 'ods', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'heic'],
    artwork: options?.files.artwork.extensions ?? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'cdr', 'psd', 'tif', 'tiff', 'heic'],
    proof: ['png', 'jpg', 'jpeg', 'webp', 'pdf'],
  };
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = types[kind];
  if (allowed && !allowed.includes(extension)) return `${file.name}: choose a ${allowed.map(e => e.toUpperCase()).join(', ')} file.`;
  const maxKb = (kind === 'artwork' ? options?.files.artwork.max_kb : options?.files.order_form.max_kb) ?? 25600;
  if (file.size > maxKb * 1024) return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB: files can be up to ${Math.round(maxKb / 1024)} MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** POSTs a form with upload progress (fetch can't report it); resolves with `data`, rejects with ApiError. */
function upload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/api/v1${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.min(0.99, e.loaded / e.total)); };
    xhr.onload = () => {
      let body: { data?: T; message?: string; errors?: Record<string, string[]> } | null = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body) { onProgress?.(1); resolve(body.data as T); return; }
      if (xhr.status === 401) window.dispatchEvent(new Event('session-expired'));
      const details = body?.errors ? Object.values(body.errors).flat().join(' ') : body?.message;
      reject(new ApiError(details || (xhr.status === 413 ? 'This file is too large to upload (25 MB at most).' : xhr.status === 429 ? 'Too many uploads at once. Wait a minute and try again.' : 'The upload failed. Please try again.'), xhr.status, body?.errors));
    };
    xhr.onerror = () => reject(new ApiError('Could not reach the server. Check your connection and try again.', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Uploads an order form or artwork file to a draft, with progress (0..1). An order form may come back with `suggested` rows. */
export function uploadOrderFile(draftId: number, file: File, kind: 'order_form' | 'artwork', onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  return upload<OrderFile>(`/order-drafts/${draftId}/files`, form, onProgress, signal);
}

/** Staff: adds a file to an order (a customer-visible proof asks the customer for approval). */
export function uploadAdminFile(orderId: number, file: File, kind: FileKind, visibility: 'customer' | 'internal', message?: string, onProgress?: (fraction: number) => void) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('visibility', visibility);
  form.append('file', file);
  if (message) form.append('message', message);
  return upload<OrderDetail>(`/admin/orders/${orderId}/files`, form, onProgress);
}

/** "Rugby League Jersey" for a row, with the options' names (the server sends `name` on rows it returns). */
export function itemName(item: OrderItem, options?: Pick<OrderOptions, 'garments' | 'sports'> | null) {
  if (item.label) return item.label;
  if (item.name) return item.name;
  const sport = options?.sports.find(s => s.id === item.sport)?.name;
  const garment = options?.garments.find(g => g.id === item.garment)?.name ?? item.garment;
  return [sport, garment].filter(Boolean).join(' ');
}
