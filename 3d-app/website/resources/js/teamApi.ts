/**
 * 3DEEZI TEAM (the human designer service): the customer API. The contract is T1's team-api.md (v1, 2026-10-21):
 * /api/v1/team/... Request statuses, allowance, the conversation, review, approval and the final design.
 */
import { api, fetchFile, saveBlob } from './api';

export type TeamStatus = 'awaiting_payment' | 'received' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'approved' | 'closed';
export type TeamRole = 'customer' | 'designer' | 'admin' | 'system';

/** The customer's progress steps (stage_index 0..4). */
export const TEAM_STEPS = ['Request received', 'Designer assigned', 'Design in progress', 'Ready for review', 'Approved'] as const;

export interface TeamFile {
  id: number; kind: string; name: string; extension: string; size: number; mime_type: string; is_image: boolean;
  thumb: string | null; version: number | null; url: string; created_at: string;
  uploaded_by?: { id: number; name: string; role: TeamRole } | null;
}
export interface TeamMessage { id: number; body: string | null; role: TeamRole; author: { id: number; name: string } | null; files: TeamFile[]; created_at: string }
export interface TeamDelivery { version: number; created_at: string; note: string | null; files: TeamFile[] }
export interface TeamInvoice { invoice_number: string | null; status?: string; label?: string; total?: string; amount_due?: string; pay_url?: string | null; can_pay?: boolean }
export interface TeamRequest {
  id: number; number: string; status: TeamStatus; status_label: string; stage_index: number;
  name: string; email: string; sport: string; sport_name?: string | null; garment: string; garment_name?: string | null; category?: string | null;
  description: string; colours: string[]; instructions: string | null;
  billing: 'included' | 'paid' | 'free'; price: string; currency: string; invoice: TeamInvoice | null;
  /** TEAM prices include GST (client 2026-10-21). */
  tax_included?: boolean;
  /** Extra revision rounds bought or given; a round waiting for its invoice; the refund mark (paid, cancelled before work started). */
  extra_revisions?: number; pending_revision?: { invoice: TeamInvoice | null } | null; refund_status?: 'due' | 'refunded' | null;
  extra_revision_price?: TeamPrice;
  designer: { id: number; name: string } | null; revisions_used: number; revisions_allowed: number; due_date: string | null;
  latest_version: number | null;
  files?: TeamFile[]; deliveries?: TeamDelivery[]; messages?: TeamMessage[];
  history?: { kind: string; from?: string | null; to?: string | null; text: string; by?: string | null; at: string }[];
  final: { version: number; files: TeamFile[]; assets: { id: number; name: string; url: string }[]; studio_asset_id: number | null; approved_at: string } | null;
  can: { message: boolean; approve: boolean; revise: boolean; cancel: boolean; pay: boolean; to_studio: boolean; order: boolean; extra_revision?: boolean; pay_revision?: boolean };
  unread: number; created_at: string; updated_at: string; approved_at: string | null;
}
export interface TeamPlan { id: string; name: string; included_per_month: number; price: string; revisions: number; max_open: number }
export interface TeamPrice { price: string; tax: string; currency: string; tax_included: boolean; tax_name: string }
export interface TeamTurnaround { first_draft_days: number; revision_days: number }
export interface TeamAllowance {
  plan: string; plan_name: string; period: string; included_per_month: number; used_this_month: number; bonus_remaining: number; unlimited: boolean;
  remaining_included: number;
  next_request: { billing: 'included' | 'paid' | 'free'; price: string; tax: string; total: string; currency: string; pay_first: boolean; tax_included?: boolean; tax_name?: string };
  extra_revision?: TeamPrice; turnaround?: TeamTurnaround;
  revisions_per_request: number; open_requests: number; max_open_requests: number; can_submit: boolean; blocked_reason: string | null;
  plans: TeamPlan[];
}
export interface TeamRequestFields {
  name: string; email: string; sport: string; garment: string; category?: string; description: string;
  colours: string[]; instructions?: string; logos: File[]; references: File[];
}

const post = (body: FormData | object) => ({ method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });

export const teamApi = {
  allowance: () => api<TeamAllowance>('/team/allowance'),
  list: () => api<TeamRequest[]>('/team/requests'),
  get: (id: number | string) => api<TeamRequest>(`/team/requests/${id}`),
  create: (fields: TeamRequestFields, key: string) => {
    const form = new FormData();
    (['name', 'email', 'sport', 'garment', 'category', 'description', 'instructions'] as const).forEach(k => { const v = fields[k]; if (v) form.append(k, v); });
    fields.colours.forEach(c => form.append('colours[]', c));
    fields.logos.forEach(f => form.append('logos[]', f));
    fields.references.forEach(f => form.append('references[]', f));
    form.append('idempotency_key', key);
    return api<TeamRequest>('/team/requests', post(form));
  },
  message: (id: number, body: string, files: File[] = []) => {
    const form = new FormData(); if (body) form.append('body', body); files.forEach(f => form.append('files[]', f));
    return api<TeamMessage>(`/team/requests/${id}/messages`, post(form));
  },
  approve: (id: number, version?: number | null) => api<TeamRequest>(`/team/requests/${id}/approve`, post(version ? { version } : {})),
  /** extra: the included revisions are used up, so an extra round is invoiced (it starts once paid). */
  revise: (id: number, message: string, files: File[] = [], extra = false) => {
    const form = new FormData(); form.append('message', message); files.forEach(f => form.append('files[]', f)); if (extra) form.append('extra', '1');
    return api<TeamRequest>(`/team/requests/${id}/revisions`, post(form));
  },
  cancel: (id: number) => api<TeamRequest>(`/team/requests/${id}/cancel`, post({})),
  toStudio: (id: number) => api<{ asset_id: number; name: string; garment: string; sport: string; url: string }>(`/team/requests/${id}/to-studio`, post({})),
  orderDraft: (id: number) => api<{ draft_id: number; link: string }>(`/team/requests/${id}/order-draft`, post({})),
  /** File urls are API paths ("/api/v1/team/files/9"): fetched with the sign-in token. */
  fileBlob: (file: Pick<TeamFile, 'url'>) => fetchFile(file.url.replace(/^.*\/api\/v1/, '')),
  download: async (file: Pick<TeamFile, 'url' | 'name'>) => saveBlob(await fetchFile(file.url.replace(/^.*\/api\/v1/, '')), file.name),
};

/** Upload limits from the contract (team-api.md 3). */
export const TEAM_LIMITS = {
  logos: 5, references: 10, messageFiles: 5, fileMb: 20, totalMb: 100,
  logoTypes: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps'],
  referenceTypes: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'zip'],
};
/**
 * The client's answers (2026-10-21), shown before the plan loads (signed out): prices incl. GST, included requests a
 * month, revisions per request, the extra revision round, the turnaround and the refund policy. The server's values
 * (Admin > 3DEEZI TEAM) replace them once loaded.
 */
export const TEAM_DEFAULTS = {
  plans: [
    { id: 'free', name: 'Free', included_per_month: 0, price: '99.00', revisions: 2, max_open: 1 },
    { id: 'pro', name: 'Pro', included_per_month: 0, price: '79.00', revisions: 3, max_open: 2 },
    { id: 'premium', name: 'Premium', included_per_month: 2, price: '69.00', revisions: 3, max_open: 3 },
    { id: 'business', name: 'Business', included_per_month: 6, price: '49.00', revisions: 5, max_open: 10 },
  ] as TeamPlan[],
  extraRevision: '25.00',
  turnaround: { first_draft_days: 3, revision_days: 2 } as TeamTurnaround,
};
export const TEAM_REFUNDS = [
  'Full refund if you cancel before your designer starts.',
  'No refund once the first draft is delivered, though 3DEEZI may give an account credit where fair.',
  'Full refund if 3DEEZI can’t deliver as promised.',
];
/** "A$99.00 incl. GST". */
export const audMoney = (amount: string | number, currency = 'AUD') => currency === 'AUD' ? `A$${Number(amount).toFixed(2)}` : money(amount, currency);
export const inclGst = (amount: string | number, currency = 'AUD', taxName = 'GST') => `${audMoney(amount, currency)} incl. ${taxName}`;
export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();
export const money = (amount: string | number, currency = 'AUD') => {
  const n = Number(amount);
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; }
};
