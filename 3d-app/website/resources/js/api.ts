import type { Design } from './types';

export interface User { id: number; name: string; email: string; is_admin?: boolean; /** 3DEEZI TEAM designer (team-api.md 1): sees /designer. */ is_designer?: boolean; designer_all?: boolean; created_at?: string }
export interface Project { id: number; name: string; sport: string; garment: string; mode: 'ai' | 'dyo'; status: 'draft' | 'approved'; design: Design; thumbnail?: string | null; version: number; created_at: string; updated_at: string }
export interface CatalogItem { id: string; name: string; description: string; /** Sports only: which DYO filter it sits under. */ group?: 'sports' | 'apparel'; /** Sports only: the garments offered, most likely first. */ garments?: string[]; /** Sports only: the image model's style hint. */ prompt?: string; /** Sports only: its own garment tiles (config/catalog.php), in order. */ tiles?: GarmentTile[]; /** Sports only: the name in the garment step's heading when it differs ("Rugby"). */ heading?: string; /** Sports only: false when the garment step shows no "More teamwear" (the client's Rugby lists). */ more?: boolean; /** Sports only: the garment step's subtitle when it differs from "Choose what you want to design for <name>." */ subtitle?: string; /** Sports only: a line between "Change sport" and "Continue to studio" (none by default). */ select_hint?: string; /** Sports only: false when the tiles show names only (the client's American Football list). */ descriptions?: boolean; /** Sports only: the garment step's background, media/showroom/<backdrop>.webp (default stadium-stage). */ backdrop?: string }
/**
 * A sport's garment tile (task 9.99): its own name and description on one of our 3D garments. fit 'exact': that garment;
 * 'nearest': no 3D model of its own yet, the 3D preview uses `garment`; 'soon': no 3D model yet (garment null, COMING SOON).
 * `future`: the 3D garment still to build; `image`: media/showroom/garment-<image>.webp; `design`: settings the tile starts with.
 */
export interface GarmentTile { name: string; description: string; garment: string | null; fit: 'exact' | 'nearest' | 'soon'; future?: string; image: string; design?: { trackStyle?: 'collar' | 'hood' } }
export interface Catalog { sports: CatalogItem[]; garments: CatalogItem[]; provider: {id: string; name: string; is_ai: boolean; available: boolean}; showcase_scenes?: string[] }
export interface Concept { id: string; name: string; description: string; design: Design; preview?: string | null; motif?: string }
export class ApiError extends Error {
  constructor(message: string, public status: number, public errors?: Record<string, string[]>) { super(message); }
}
export const baseUrl = (document.querySelector('meta[name="app-base"]')?.getAttribute('content') || '').replace(/\/$/, '');
export const media = (path: string) => `${baseUrl}/media/${path}`;
const tokenKey = '3deezi.session';
export const getToken = () => sessionStorage.getItem(tokenKey);
export const setToken = (token: string | null) => token ? sessionStorage.setItem(tokenKey, token) : sessionStorage.removeItem(tokenKey);

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers }); }
  catch { throw new ApiError('Could not reach the server. Check your connection and try again.', 0); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    const details = result.errors ? Object.values(result.errors).flat().join(' ') : result.message;
    throw new ApiError(details || 'Something went wrong. Please try again.', response.status, result.errors);
  }
  return response;
}
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // PHP silently drops requests over post_max_size, so catch oversized bodies with a clear message first.
  if (typeof init?.body === 'string' && init.body.length > 48 * 1024 * 1024) {
    throw new ApiError('This design is too large to save. Remove or shrink large images in your artwork and try again.', 413);
  }
  const response = await request(path, init);
  if (response.status === 204) return undefined as T;
  try { return (await response.json()).data as T; }
  catch { throw new ApiError('The server sent an unexpected reply. If your design contains large images, make them smaller and try again.', response.status); }
}
export async function fetchFile(path: string): Promise<Blob> { return (await request(path)).blob(); }
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Release the file a minute later: revoking it before a slow or busy browser has read it cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function downloadFile(path: string, filename: string) { saveBlob(await fetchFile(path), filename); }
