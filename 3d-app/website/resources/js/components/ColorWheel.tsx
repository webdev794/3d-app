import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Pipette, Plus } from 'lucide-react';

type Hsv = { h: number; s: number; v: number };

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const store = { get: (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }, set: (key: string, value: string[]) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode. */ } } };

/**
 * Hue ring around a saturation/brightness disc, a brightness slider, an eye
 * dropper (where the browser has one), hex entry, saved and recent colours.
 * `onChange` fires while dragging; `onCommit` once a pick is finished.
 */
export default function ColorWheel({ value, onChange, onCommit }: { value: string; onChange: (hex: string) => void; onCommit?: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hex, setHex] = useState(value.toUpperCase());
  const [saved, setSaved] = useState(() => store.get('3deezi.colours.saved'));
  const [recent, setRecent] = useState(() => store.get('3deezi.colours.recent'));
  const wheel = useRef<HTMLDivElement>(null);
  const drag = useRef<'ring' | 'disc' | null>(null);
  const live = useRef(value);

  // Follow outside changes (undo, AI edits, another colour slot).
  useEffect(() => { if (value.toUpperCase() !== live.current.toUpperCase()) { live.current = value; setHsv(hexToHsv(value)); } setHex(value.toUpperCase()); }, [value]);

  const emit = useCallback((next: Hsv) => { setHsv(next); const out = hsvToHex(next); live.current = out; setHex(out); onChange(out); }, [onChange]);
  const remember = useCallback((out: string) => { setRecent(old => { const next = [out, ...old.filter(c => c !== out)].slice(0, 6); store.set('3deezi.colours.recent', next); return next; }); onCommit?.(out); }, [onCommit]);

  function pick(event: React.PointerEvent | PointerEvent, mode = drag.current) {
    const box = wheel.current?.getBoundingClientRect();
    if (!box || !mode) return;
    const x = event.clientX - box.left - box.width / 2, y = event.clientY - box.top - box.height / 2;
    if (mode === 'ring') { emit({ ...hsv, h: (Math.atan2(y, x) * 180 / Math.PI + 450) % 360 }); return; }
    // The disc: saturation left to right, brightness bottom to top.
    const r = box.width * 0.33;
    emit({ ...hsv, s: Math.min(1, Math.max(0, (x + r) / (2 * r))), v: Math.min(1, Math.max(0, 1 - (y + r) / (2 * r))) });
  }
  function start(event: React.PointerEvent) {
    const box = wheel.current!.getBoundingClientRect();
    const dist = Math.hypot(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2) / (box.width / 2);
    drag.current = dist > 0.78 ? 'ring' : 'disc';
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pick(event, drag.current);
  }
  function end() { if (drag.current) { drag.current = null; remember(live.current); } }
  async function eyeDropper() {
    const Dropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!Dropper) return;
    try { const { sRGBHex } = await new Dropper().open(); const next = hexToHsv(sRGBHex); emit(next); remember(hsvToHex(next)); } catch { /* Cancelled. */ }
  }
  function typed(text: string) {
    setHex(text.toUpperCase());
    const clean = text.trim().replace(/^#?/, '#');
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) { const next = hexToHsv(clean); setHsv(next); live.current = clean.toUpperCase(); onChange(clean.toUpperCase()); }
  }
  const choose = (c: string) => { const next = hexToHsv(c); emit(next); remember(c); };
  const disc = { left: `${17 + hsv.s * 66}%`, top: `${17 + (1 - hsv.v) * 66}%` };
  const ring = { left: `${50 + 44.5 * Math.sin(hsv.h * Math.PI / 180)}%`, top: `${50 - 44.5 * Math.cos(hsv.h * Math.PI / 180)}%` };

  return <div className="color-wheel">
    <div className="wheel-row">
      <button type="button" className="icon-button dropper" onClick={eyeDropper} title="Pick a colour from the screen" aria-label="Eye dropper" disabled={!('EyeDropper' in window)}><Pipette size={18} /></button>
      <div className="wheel" ref={wheel} onPointerDown={start} onPointerMove={e => drag.current && pick(e)} onPointerUp={end} onPointerCancel={end} role="slider" aria-label="Colour wheel" aria-valuetext={hex} tabIndex={0}>
        <div className="wheel-disc" style={{ '--hue': `${hsv.h}` } as React.CSSProperties} />
        <span className="wheel-handle ring-handle" style={{ ...ring, background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }} />
        <span className="wheel-handle disc-handle" style={{ ...disc, background: hex }} />
      </div>
      <input className="brightness" type="range" min={0} max={1} step={0.01} value={hsv.v} aria-label="Brightness" onChange={e => emit({ ...hsv, v: Number(e.target.value) })} onPointerUp={end} onKeyUp={() => remember(live.current)} style={{ '--top': hsvToHex({ ...hsv, v: 1 }) } as React.CSSProperties} />
    </div>
    <div className="hex-row">
      <span className="swatch" style={{ background: hex }} />
      <label className="hex-field"><span>HEX</span><input value={hex} maxLength={7} onChange={e => typed(e.target.value)} onBlur={() => remember(live.current)} aria-label="Hex colour" /><button type="button" className="icon-button" aria-label="Copy hex" onClick={() => navigator.clipboard?.writeText(hex)}><Copy size={14} /></button></label>
      <button type="button" className="button button-secondary save-colour" onClick={() => setSaved(old => { const next = [hex, ...old.filter(c => c !== hex)].slice(0, 12); store.set('3deezi.colours.saved', next); return next; })}><Plus size={14} /> Save colour</button>
    </div>
    {recent.length > 0 && <><h4>RECENT COLOURS</h4><div className="colour-dots">{recent.map(c => <button key={c} type="button" style={{ background: c }} aria-label={`Use ${c}`} onClick={() => choose(c)} />)}</div></>}
    {saved.length > 0 && <><h4>SAVED COLOURS</h4><div className="colour-dots">{saved.map(c => <button key={c} type="button" style={{ background: c }} aria-label={`Use saved ${c}`} onClick={() => choose(c)} />)}</div></>}
  </div>;
}
