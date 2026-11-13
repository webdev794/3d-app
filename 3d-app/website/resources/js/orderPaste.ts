/**
 * "Paste your order here" on the order form (ORDERPASTE, client 2026-11-13) and "Help me add sizes": what the customer
 * pasted is read on the server (POST /orders/fill: 3DEEZI AI when signed in, the built-in reading otherwise) and, when
 * the server can't be reached, here (readSizesHere: size lists such as "XS x 3, S x 5" or "12 jerseys: 2 S, 4 M").
 * Tests: tests/js/orderPaste.test.ts.
 */
import { api, ApiError } from './api';
import type { OrderItem, SuggestedForm } from './orderApi';
import { siteSize } from './orderSizes';

/** A garment read from a description (the server's reader, or this file's own: it may have no garment yet). */
export interface AssistItem { garment: string | null; sport?: string | null; fit?: string | null; sizes: Record<string, number>; stated?: number;
  /** Players read with their sizes ("John Smith 7 M"): one garment each, counted in `sizes`. */
  players?: { name?: string | null; number?: string | null; size?: string | null }[] | null }
export interface SizesReply { items: AssistItem[]; unknown?: string[] }

/** POST /orders/fill's answer (OrderFillController). */
export interface FillReply {
  items: (OrderItem & { label?: string | null })[];
  /** Lines that could not be read, or are to check. */
  unknown: string[];
  /** Garments read with no sizes ("5 hoodies"; the built-in reading only). */
  unsized?: { garment?: string; sport?: string | null; fit?: string | null; label?: string; qty?: number; size?: string; text?: string; name?: string }[];
  /** 'ai' 3DEEZI AI; 'notes' / 'reader' the built-in reading (notes / pasted cells); 'here' this page's own reading. */
  source: 'ai' | 'notes' | 'reader' | 'here';
  /** used | failed | off (no key) | sign_in (a visitor) | here (the server could not be reached). */
  ai: 'used' | 'failed' | 'off' | 'sign_in' | 'here';
  /** The text names a garment: when not ("XS x 3, S x 5"), the sizes go on the garment already on the form. */
  garment_named: boolean;
  total: number;
  /** Team, contact, date and delivery as written (3DEEZI AI only). */
  form?: SuggestedForm;
}

/** The pasted text read on the server; this page's own reading of a size list when the server can't be reached. */
export async function fillOrder(text: string, sizes: string[]): Promise<FillReply> {
  try { return await api<FillReply>('/orders/fill', { method: 'POST', body: JSON.stringify({ text }) }); }
  catch (e) {
    const status = (e as ApiError).status;
    if (status && status !== 404 && status !== 405 && status < 500) throw e;
    const read = readSizesHere(text, sizes);
    const items = read.items.filter(i => total(i.sizes) > 0).map(i => ({ garment: i.garment ?? 'jersey', sport: i.sport ?? undefined, fit: i.fit ?? undefined, sizes: i.sizes }));
    return { items, unknown: read.unknown ?? [], source: 'here', ai: 'here', garment_named: read.items.some(i => !!i.garment), total: items.reduce((n, i) => n + total(i.sizes), 0) };
  }
}

const total = (sizes: Record<string, number>) => Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0);

const GARMENT_ALIASES: [RegExp, string][] = [[/^(jerseys?|guernseys?|jumpers?)$/, 'jersey'], [/^shorts?$/, 'shorts'], [/^(tees?|tshirts?|t-shirts?|shirts?)$/, 'tee'], [/^singlets?$/, 'singlet'], [/^polos?$/, 'polo'], [/^(hoodies?|hoodys?)$/, 'hoodie'], [/^jackets?$/, 'jacket'], [/^(warmups?|warm-ups?)$/, 'warmup'], [/^(pants|trackpants|trackies)$/, 'pants'], [/^socks?$/, 'socks'], [/^(caps?|hats?)$/, 'cap']];
const FIT_ALIASES: Record<string, string> = { men: 'mens', mens: 'mens', male: 'mens', women: 'womens', womens: 'womens', ladies: 'womens', female: 'womens', youth: 'youth', junior: 'youth', juniors: 'youth', kids: 'youth', unisex: 'unisex' };
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
type Tok = { t: 'n'; v: number } | { t: 's' | 'g' | 'fit'; v: string } | { t: 'sep' } | { t: 'w'; name: boolean };
/** Words before a number that are never a player's name ("Need 3 M"). */
const NOT_NAMES = new Set(['need', 'needs', 'want', 'get', 'order', 'have', 'please', 'and', 'plus', 'with', 'also', 'add', 'make', 'for', 'size', 'sizes', 'qty', 'total', 'another', 'extra']);

/** "3 XL x 5", "2 XL - 4" (a space inside the size, a quantity after it) as "3XL x 5"; "3 XL, 5 L" stays three XL (OrderFormReader::joinSpacedSizes). */
export const joinSpacedSizes = (text: string) => text.replace(/(?<![\w.])([2-8])[ \t]+(xl)(?=[ \t]*(?:[x×:=\-–][ \t]*\d{1,4}(?!\w)|\d{1,4}[ \t]*(?:[,;.]|$)))/gim, '$1$2');

/**
 * Reads "12 jerseys: 2 S, 4 M, 6 L", "18 jerseys M", "jerseys 2xS 4xM", "M x 12 jerseys", "12 jerseys M, 12 shorts L", "XS x 3 , S x 5",
 * "3 XL x 5"; a name, a number and a size ("Smith 7 M") is one garment for that player. Numbers or sizes it can't place are not
 * dropped quietly: `unknown` asks to check them (LINKTEST 2026-11-13).
 */
export function readSizesHere(text: string, sizes: string[]): SizesReply {
  // "M", "xxl", "5xl", "10y", "w12", "kids" (orderSizes.ts siteSize): only sizes the site has.
  const sizeOf = (w: string) => { const found = siteSize(w); return found && sizes.includes(found) ? found : null; };
  const garmentOf = (w: string) => GARMENT_ALIASES.find(([re]) => re.test(w))?.[1] ?? null;
  const toks: Tok[] = [];
  for (const m of joinSpacedSizes(text).replace(/['’]/g, '').matchAll(/[a-z0-9]+(?:-[a-z0-9]+)*|[;\n]/gi)) {
    const raw = m[0], w = raw.toLowerCase();
    if (w === ';' || w === '\n') { toks.push({ t: 'sep' }); continue; }
    if (/^\d+$/.test(w)) { toks.push({ t: 'n', v: Math.min(10000, Number(w)) }); continue; }
    if (NUMBER_WORDS[w]) { toks.push({ t: 'n', v: NUMBER_WORDS[w] }); continue; }
    const size = sizeOf(w), garment = garmentOf(w), fit = FIT_ALIASES[w];
    if (size) toks.push({ t: 's', v: size });
    else if (garment) toks.push({ t: 'g', v: garment });
    else if (fit) toks.push({ t: 'fit', v: fit });
    else {
      // "xs-3", "m-5": a size and its number joined by a dash.
      const dashed = w.match(/^([a-z0-9]+)-(\d{1,4})$/);
      if (dashed && sizeOf(dashed[1])) { toks.push({ t: 's', v: sizeOf(dashed[1])! }, { t: 'n', v: Number(dashed[2]) }); continue; }
      const times = w.match(/^(\d+)x([a-z0-9]+)$/), glued = w.match(/^(\d+)([a-z][a-z-]*)$/);
      const part = times?.[2] ?? glued?.[2];
      const n = Number(times?.[1] ?? glued?.[1]);
      if (part && sizeOf(part)) toks.push({ t: 'n', v: n }, { t: 's', v: sizeOf(part)! });
      else if (glued && garmentOf(part!)) toks.push({ t: 'n', v: n }, { t: 'g', v: garmentOf(part!)! });
      else if (/^[a-z]{2,}$/.test(w)) toks.push({ t: 'w', name: /^[A-Z][a-z]/.test(raw) && !NOT_NAMES.has(w) });   // another word ("Smith", "need")
    }
  }
  const items: (AssistItem & { stated: number })[] = [];
  let cur: (AssistItem & { stated: number }) | null = null, num: number | null = null, size: string | null = null, fit: string | null = null;
  /** The garment of the line before: a line of sizes only ("Polo" then "3 x 4XL", "XS x 3" then "S x 5") adds to it. */
  let last: (AssistItem & { stated: number }) | null = null;
  /** Numbers or sizes it could not place. */
  let lost = 0, skip = -1;
  const push = (garment: string | null) => { const item = { garment, sport: null, fit, sizes: {} as Record<string, number>, stated: 0 }; fit = null; items.push(item); return item; };
  const put = (s: string, n: number) => { cur ??= last && !fit ? last : push(null); cur.sizes[s] = Math.min(10000, (cur.sizes[s] ?? 0) + n); };
  // A size waiting for its number gets the garment's stated quantity ("18 jerseys M").
  const settle = () => { if (cur && size && cur.stated && !total(cur.sizes)) { cur.sizes[size] = cur.stated; size = null; } };
  const drop = () => { if (num !== null) lost++; if (size !== null) lost++; num = null; size = null; };
  toks.forEach((tok, i) => {
    if (i === skip) return;
    const prev = toks[i - 1], next = toks[i + 1], after = toks[i + 2];
    if (tok.t === 'w') return;
    if (tok.t === 'sep') { settle(); drop(); last = cur ?? last; cur = null; return; }
    if (tok.t === 'fit') { if (cur && !cur.fit && !num) cur.fit = tok.v; else fit = tok.v; return; }
    if (tok.t === 'n') {
      // "Smith 7 M": a name, the shirt number and a size is one garment for that player (never 7 in M).
      if (prev?.t === 'w' && prev.name && next?.t === 's' && num === null && !size) { put(next.v, 1); skip = i + 1; return; }
      if (next?.t === 'g' || (next?.t === 'fit' && after?.t === 'g')) { settle(); if (num !== null) lost++; num = tok.v; return; }   // "12 jerseys": the garment's quantity
      if (size) { put(size, tok.v); size = null; return; }                                                 // "M 4", "M x 12"
      if (num !== null) lost++;
      num = tok.v; return;
    }
    if (tok.t === 's') {
      if (num !== null) { put(tok.v, num); num = null; return; }                                           // "4 M"
      if (cur && cur.stated && !total(cur.sizes) && next?.t !== 'n') { cur.sizes[tok.v] = cur.stated; return; } // "18 jerseys M"
      if (size !== null) lost++;
      size = tok.v; return;
    }
    if (cur && !cur.garment && total(cur.sizes) && num === null) { cur.garment = tok.v; return; }         // "2 S, 4 M jerseys"
    settle();
    cur = push(tok.v);
    cur.stated = num ?? 0; num = null;
    if (size && cur.stated) { cur.sizes[size] = cur.stated; size = null; }                                  // "M x 12 jerseys"
  });
  settle();
  drop();
  return { items, unknown: lost ? ['Part of your text was not read: please check the sizes.'] : [] };
}
