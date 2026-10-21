import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, media, type CatalogItem } from '../api';

/** The longest brief the AI designer takes (the server allows the same). */
export const MAX_BRIEF = 4000;
export const formatCount = (n: number) => n.toLocaleString('en-AU');

/**
 * A server reply as a friendly sentence for the AI designer: validation messages ("The prompt field must not be
 * greater than …") and technical errors never reach the page as they are.
 */
export function friendlyError(error: unknown): string {
  const message = (error as Error)?.message || '';
  if (!(error instanceof ApiError)) return message || 'Something went wrong. Please try again.';
  const fields = Object.keys(error.errors ?? {});
  const has = (...names: string[]) => fields.some(f => names.some(n => f === n || f.startsWith(`${n}.`)));
  const raw = /^the [\w .-]+ (field|must|may|is)\b/i.test(message);
  if (error.status === 422 || fields.length || raw) {
    if (has('prompt', 'design.prompt') || /\bprompt\b/i.test(message)) return /greater|characters|long/i.test(message) ? `Your brief is too long: keep it to ${formatCount(MAX_BRIEF)} characters.` : 'Describe your design in a few more words (at least 10 characters).';
    if (has('file', 'image')) return /kilobytes|greater|size|large/i.test(message) ? 'That picture is too big: use one under 10 MB.' : 'That picture could not be used: use a PNG, JPG or WebP picture.';
    if (has('reference_ids')) return 'One of your pictures could not be used: remove it and attach it again.';
    if (has('sport')) return 'Choose a sport from the row and try again.';
    if (has('garment')) return 'Choose the garment and try again.';
    return 'Something in your brief could not be used. Check it and try again.';
  }
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (error.status === 413) return 'That is too large to send: use smaller pictures and try again.';
  if (error.status === 429) return 'Lots of designs are being made right now. Wait a moment and try again.';
  if (error.status >= 500 && (!message || /server error|exception|sqlstate|curl|http request|stack trace|json|undefined/i.test(message))) return 'The AI designer is busy or unavailable right now. Please try again in a minute.';
  return message;
}

/**
 * The AI designer's sports quick-pick row (client visual 2026-10-21). `sport` is the catalogue sport the AI gets;
 * categories without a catalogue sport (fight wear, fishing, workwear) design as Training apparel and name themselves
 * in the brief. `garments`: the garment chips offered when the brief names none, most likely first.
 */
export interface QuickSport { id: string; label: string; sport: string; brief?: string; garments: string[]; art?: string }
export const allGarments = ['jersey', 'fullkit', 'shorts', 'tee', 'singlet', 'polo'];
export const quickSports: QuickSport[] = [
  { id: 'rugby-league', label: 'Rugby League', sport: 'rugby-league', garments: allGarments },
  { id: 'rugby-union', label: 'Rugby Union', sport: 'rugby-union', garments: allGarments },
  { id: 'netball', label: 'Netball', sport: 'netball', garments: ['singlet', 'shorts', 'tee', 'polo'] },
  { id: 'football', label: 'Soccer', sport: 'football', garments: allGarments },
  { id: 'basketball', label: 'Basketball', sport: 'basketball', garments: ['singlet', 'fullkit', 'shorts', 'tee', 'polo'] },
  { id: 'fight-wear', label: 'Fight Wear', sport: 'training', brief: 'Fight wear', garments: ['tee', 'shorts', 'singlet'] },
  { id: 'fishing', label: 'Fishing', sport: 'training', brief: 'Fishing apparel', garments: ['jersey', 'polo', 'tee'] },
  { id: 'workwear', label: 'Workwear', sport: 'training', brief: 'Workwear', garments: ['polo', 'tee', 'jersey'] },
  { id: 'afl', label: 'AFL', sport: 'afl', garments: allGarments },
  { id: 'hockey', label: 'Hockey', sport: 'hockey', garments: allGarments },
  { id: 'training', label: 'Training', sport: 'training', garments: ['tee', 'singlet', 'shorts', 'polo', 'jersey'] },
];
export const garmentLabels: Record<string, string> = { jersey: 'Jersey', fullkit: 'Full kit', shorts: 'Shorts', tee: 'Training tee', singlet: 'Singlet', polo: 'Polo' };

/** The quick picks, then any catalogue sport they do not name yet (with its showroom kit as the picture). */
export function sportTiles(catalogSports: CatalogItem[] = []): QuickSport[] {
  return [...quickSports, ...catalogSports.filter(s => !quickSports.some(q => q.id === s.id)).map(s => ({ id: s.id, label: s.name, sport: s.id, garments: allGarments, art: media(`showroom/kit-${s.id}.webp`) }))];
}

/** The garment a brief names, if any ("navy polo" → polo; "jersey and shorts" → full kit). */
export function garmentInBrief(text: string): string | null {
  const t = text.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const top = has(/\bjerseys?\b|\bguernseys?\b|\bjumpers?\b|\bshirts?\b|\blong[- ]sleeves?\b/) && !has(/\bt-?shirts?\b|\bpolo shirts?\b/);
  const shorts = has(/\bshorts\b/);
  if (has(/\bfull[- ]?kits?\b|\bkits?\b|\buniforms?\b|\bstrips?\b/) || (top && shorts)) return 'fullkit';
  if (has(/\bpolos?\b/)) return 'polo';
  if (has(/\bsinglets?\b|\bvests?\b|\btank tops?\b|\bdress(es)?\b|\bbodysuits?\b/)) return 'singlet';
  if (has(/\bt-?shirts?\b|\btees?\b|\bhoodies?\b|\bjackets?\b|\bhi-?vis\b|\brash ?guards?\b/)) return 'tee';
  if (shorts) return 'shorts';
  if (top) return 'jersey';
  return null;
}

/** The sport a brief names, when no tile was picked ("soccer" → Soccer). */
export function sportInBrief(text: string, tiles: QuickSport[] = quickSports): QuickSport | undefined {
  const t = text.toLowerCase();
  const words: [RegExp, string][] = [[/rugby league|\bnrl\b/, 'rugby-league'], [/rugby union/, 'rugby-union'], [/\brugby\b/, 'rugby-league'], [/netball/, 'netball'], [/basketball/, 'basketball'], [/soccer|\bfootball\b|\bfc\b/, 'football'], [/\bafl\b|aussie rules|australian rules|guernsey/, 'afl'], [/hockey/, 'hockey'], [/boxing|\bmma\b|fight ?wear|martial arts|jiu.?jitsu|muay thai/, 'fight-wear'], [/fishing|angler/, 'fishing'], [/workwear|hi-?vis|tradie/, 'workwear'], [/training|\bgym\b/, 'training']];
  const hit = words.find(([re]) => re.test(t));
  return hit ? tiles.find(s => s.id === hit[1]) : undefined;
}

type SpeechResults = ArrayLike<ArrayLike<{ transcript: string }>>;
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: SpeechResults }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const speechApi = (): (new () => Recognition) | undefined => { const w = window as unknown as Record<string, unknown>; return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => Recognition) | undefined; };

/** Voice input where the browser has the Web Speech API: what is said joins the text typed so far. */
export function useVoice(text: string, setText: (value: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const supported = typeof window !== 'undefined' && !!speechApi();
  useEffect(() => () => recognition.current?.stop(), []);
  const stop = useCallback(() => recognition.current?.stop(), []);
  const toggle = () => {
    if (recognition.current) { recognition.current.stop(); return; }
    const Api = speechApi(); if (!Api) return;
    const r = new Api(), before = text ? `${text.trimEnd()} ` : '';
    r.lang = navigator.language || 'en-AU'; r.interimResults = true; r.continuous = false;
    r.onresult = e => { let said = ''; for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript; setText((before + said).slice(0, MAX_BRIEF)); };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError('Allow the microphone to speak your brief.'); };
    r.onend = () => { recognition.current = null; setListening(false); };
    recognition.current = r;
    try { r.start(); setListening(true); } catch { recognition.current = null; setListening(false); }
  };
  return { supported, listening, toggle, stop };
}

/** The sports row: a tile only sets the sport for the design (the page stays); the arrows page it, phones swipe. */
export function SportRow({ tiles, selected, onSelect }: { tiles: QuickSport[]; selected: string | null; onSelect: (id: string) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ prev: false, next: true });
  const measure = useCallback(() => { const el = strip.current; if (!el) return; const prev = el.scrollLeft > 2, next = el.scrollLeft + el.clientWidth < el.scrollWidth - 2; setMore(m => m.prev === prev && m.next === next ? m : { prev, next }); }, []);
  useEffect(() => { measure(); const el = strip.current; if (!el) return; const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect(); }, [measure, tiles.length]);
  const page = (dir: number) => { const el = strip.current; if (!el) return; const w = el.querySelector<HTMLElement>('.aid-tile')?.offsetWidth ?? 140; el.scrollBy({ left: dir * Math.max(el.clientWidth - w, w), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  return <div className={`aid-sports${more.prev || more.next ? '' : ' fits'}`}>
    <button type="button" className="aid-arrow" onClick={() => page(-1)} disabled={!more.prev} aria-label="Previous sports"><ChevronLeft size={22} /></button>
    <div ref={strip} className="aid-strip" onScroll={measure} role="group" aria-label="Choose a sport (optional)">
      {tiles.map((s, i) => <button key={s.id} type="button" className="aid-tile" aria-pressed={selected === s.id} onClick={() => onSelect(s.id)} title={selected === s.id ? `${s.label}: chosen (click again to clear)` : `Design for ${s.label}`}>
        <img src={s.art ?? media(`images/ai-designer/sport-${s.id}.webp`)} alt="" width={300} height={360} loading={i < 9 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
        <strong>{s.label}</strong><i aria-hidden="true" />
      </button>)}
    </div>
    <button type="button" className="aid-arrow" onClick={() => page(1)} disabled={!more.next} aria-label="More sports"><ChevronRight size={22} /></button>
  </div>;
}
