/**
 * Preferred suppliers (task 9.118): the page's list, "Become a preferred supplier" with its listing invoice, the order
 * form's "Made by" choice and Admin › Suppliers. Server: SupplierController, Admin\SupplierAdminController.
 */
import { api } from './api';
import type { Payment } from './orderApi';

/** A maker as the page, the order form and the app show it. 3DEEZI (default) and Mantis are the owner's own. */
export interface Supplier {
  id: number; slug: string | null; name: string; owner: boolean; summary: string | null; makes: string | null; location: string | null;
  /** With its https:// */ website: string | null; logo_url: string | null; /** 3DEEZI, the default maker. */ default: boolean;
}
export interface ListingPrices { currency: string; monthly: string; yearly: string; monthly_text: string; yearly_text: string; tax_included: boolean; tax_name: string }
export type Plan = 'monthly' | 'yearly';
export type SupplierStatus = 'applied' | 'approved' | 'hidden';
/** My listing (the applicant's own view). */
export interface MyListing extends Supplier {
  status: SupplierStatus; listed: boolean; reference: string; contact_name: string | null; email: string | null; phone: string | null;
  plan: Plan | null; paid_until: string | null; invoice: Payment | null; /** The website's pay page for an unpaid listing invoice. */ pay_path: string | null;
  created_at: string; message?: string;
}
/** Admin › Suppliers' row. */
export interface AdminSupplier extends Supplier {
  status: SupplierStatus; listed: boolean; expired: boolean; contact_name: string | null; email: string | null; phone: string | null; website_text: string | null;
  message: string | null; plan: Plan | null; paid_until: string | null; invoice: Payment | null; account: { id: number; name: string; email: string } | null;
  sort: number; approved_at: string | null; created_at: string | null; orders_count: number;
}
/** What GET /orders/options adds for the order form. */
export interface MadeByOptions { suppliers?: Supplier[]; default_supplier_id?: number | null }

export const supplierApi = {
  /** PUBLIC: the page (Mantis and the approved suppliers) and the listing prices. */
  page: () => api<{ suppliers: Supplier[]; prices: ListingPrices; ready: boolean }>('/suppliers'),
  mine: () => api<MyListing | null>('/suppliers/mine'),
  /** Multipart: company, contact_name, email, phone, website, makes, location, summary, message, plan, logo. */
  apply: (form: FormData) => api<MyListing & { message: string }>('/suppliers/apply', { method: 'POST', body: form }),
  renew: (plan: Plan) => api<MyListing>('/suppliers/mine/renew', { method: 'POST', body: JSON.stringify({ plan }) }),
};

export const adminSupplierApi = {
  list: (query: Record<string, string>) => api<{ suppliers: AdminSupplier[]; counts: Record<SupplierStatus, number>; prices: ListingPrices }>(`/admin/suppliers?${new URLSearchParams(query)}`),
  create: (form: FormData) => api<AdminSupplier>('/admin/suppliers', { method: 'POST', body: form }),
  update: (id: number, body: Partial<Record<string, unknown>>) => api<AdminSupplier>(`/admin/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  logo: (id: number, file: File) => { const form = new FormData(); form.append('logo', file); return api<AdminSupplier>(`/admin/suppliers/${id}/logo`, { method: 'POST', body: form }); },
  removeLogo: (id: number) => api<AdminSupplier>(`/admin/suppliers/${id}/logo`, { method: 'DELETE' }),
  remove: (id: number) => api<{ message: string }>(`/admin/suppliers/${id}`, { method: 'DELETE' }),
  prices: () => api<ListingPrices>('/admin/suppliers/prices'),
  savePrices: (monthly: string, yearly: string) => api<ListingPrices>('/admin/suppliers/prices', { method: 'PUT', body: JSON.stringify({ monthly, yearly }) }),
};

/** "Paid until 26 Nov 2026". */
export const dayText = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
/** Two letters for a supplier without a logo. */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
