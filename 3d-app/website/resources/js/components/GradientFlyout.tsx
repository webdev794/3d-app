import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CirclePlus, Minus, Plus, X } from 'lucide-react';
import ColorWheel from './ColorWheel';
import presetList from '../gradientPresets.json';
import type { Design, Gradient, GradientStop } from './KitViewer';

/** The colour zones that take a gradient fill: the body (Primary), the trims (Secondary) and the pattern's ink. */
export type GradientSlot = 'main' | 'secondary' | 'patternColor';
export type GradientPreset = { id: string; name: string; stops: GradientStop[] };
/** The ready-made gradients (the same list as the app's, lib/gradient_presets.dart). */
export const gradientPresets = presetList as GradientPreset[];
export const gradientSlots: readonly string[] = ['main', 'secondary', 'patternColor'];
const MAX_STOPS = 6;

/** A zone's gradient: Primary keeps the original `design.gradient`, the others are in `design.gradients`. */
export function gradientOf(design: Design, slot: GradientSlot): Gradient | null {
  return (slot === 'main' ? design.gradient : design.gradients?.[slot]) ?? null;
}
/** The design change that gives a zone this gradient (null: back to its solid colour), leaving other zones alone. */
export function gradientPatch(design: Design, slot: GradientSlot, gradient: Gradient | null): Partial<Design> {
  if (slot === 'main') return { gradient };
  const others = { ...(design.gradients ?? {}) };
  if (gradient) others[slot] = gradient; else delete others[slot];
  return { gradients: Object.keys(others).length ? others : null };
}
/** All of a gradient's stops (a two-colour gradient from before stops has its from and to). */
export function stopsOf(gradient: Gradient): GradientStop[] {
  return gradient.stops && gradient.stops.length >= 2 ? [...gradient.stops].sort((a, b) => a.at - b.at) : [{ color: gradient.from, at: 0 }, { color: gradient.to, at: 1 }];
}
/** A gradient from stops; `from` and `to` stay the first and last colours (older readers use them). */
export function makeGradient(stops: GradientStop[], angle: number, preset: string | null = null): Gradient {
  const sorted = [...stops].sort((a, b) => a.at - b.at).map(s => ({ color: s.color.toLowerCase(), at: Math.round(s.at * 1000) / 1000 }));
  return { from: sorted[0].color, to: sorted[sorted.length - 1].color, angle, stops: sorted, preset };
}
/** CSS for a gradient's stops; `turn` is the CSS angle (180: top to bottom, as the kit's angle 0). */
export const cssGradient = (stops: GradientStop[], turn = 180) => `linear-gradient(${turn}deg, ${stops.map(s => `${s.color} ${Math.round(s.at * 100)}%`).join(', ')})`;
/** The kit's angle (0 = top to bottom, 90 = left to right) as a CSS gradient angle. */
export const cssTurn = (angle: number) => (((180 - angle) % 360) + 360) % 360;

function mixHex(a: string, b: string) {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map(i => Math.round((n(a, i) + n(b, i)) / 2).toString(16).padStart(2, '0')).join('')}`;
}

type Props = {
  slot: GradientSlot;
  slotLabel: string;
  gradient: Gradient | null;
  /** The zone's solid colour and a second colour: a custom gradient starts from these. */
  base: string;
  fallback: string;
  /** One undo step. */
  apply: (gradient: Gradient | null) => void;
  /** Live while dragging; `commit` makes it one undo step. */
  preview: (gradient: Gradient) => void;
  commit: () => void;
  onClose: () => void;
  /** The Colours panel (the flyout opens beside it) and the button that opened it (a click on it is not "outside"). */
  anchor: React.RefObject<HTMLElement | null>;
  opener: React.RefObject<HTMLElement | null>;
};

/** GRADIENT PRESETS: a floating panel beside the Colours panel (a bottom sheet on phones). */
export default function GradientFlyout({ slot, slotLabel, gradient, base, fallback, apply, preview, commit, onClose, anchor, opener }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const [custom, setCustom] = useState(false);
  const [stop, setStop] = useState(0);
  const stops = gradient ? stopsOf(gradient) : null;
  const selectedStop = stops ? Math.min(stop, stops.length - 1) : 0;

  // Beside the Colours panel, over the 3D view (the workspace keeps its size).
  useLayoutEffect(() => {
    const measure = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const top = Math.max(8, r.top);
      setPlace({ left: r.right + 12, top, maxHeight: window.innerHeight - top - 12 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchor]);
  // Phones: a bottom sheet; the 3D kit scrolls up above it so each preset shows on the garment.
  useEffect(() => { if (window.matchMedia('(max-width: 900px)').matches) document.querySelector('.dyo-stage')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, []);
  // Close: Escape, or a click outside it and the Colours panel (the 3D view is a frame: clicking it takes the focus from
  // this page).
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !opener.current?.contains(t) && !anchor.current?.contains(t)) onClose(); };
    const blur = () => setTimeout(() => { if (document.activeElement?.tagName === 'IFRAME') onClose(); }, 0);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('blur', blur);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down, true); window.removeEventListener('blur', blur); };
  }, [onClose, opener, anchor]);

  const angle = gradient?.angle ?? 0;
  function startCustom() {
    setCustom(true); setStop(0);
    if (!gradient) apply(makeGradient([{ color: base, at: 0 }, { color: fallback, at: 1 }], 0));
  }
  function setStops(next: GradientStop[], live = false) {
    const g = makeGradient(next, angle, null);
    if (live) preview(g); else apply(g);
  }
  function addStop() {
    if (!stops || stops.length >= MAX_STOPS) return;
    let at = 0;
    for (let i = 1; i < stops.length; i++) if (stops[i].at - stops[i - 1].at > stops[at + 1].at - stops[at].at) at = i - 1;
    const next = [...stops];
    next.splice(at + 1, 0, { color: mixHex(stops[at].color, stops[at + 1].color), at: (stops[at].at + stops[at + 1].at) / 2 });
    setStops(next); setStop(at + 1);
  }
  function removeStop() {
    if (!stops || stops.length <= 2) return;
    setStops(stops.filter((_, i) => i !== selectedStop)); setStop(Math.max(0, selectedStop - 1));
  }
  function moveStop(percent: number) {
    if (!stops) return;
    const lo = selectedStop > 0 ? stops[selectedStop - 1].at + 0.01 : 0, hi = selectedStop < stops.length - 1 ? stops[selectedStop + 1].at - 0.01 : 1;
    setStops(stops.map((s, i) => i === selectedStop ? { ...s, at: Math.min(hi, Math.max(lo, percent / 100)) } : s), true);
  }

  return createPortal(<div ref={box} className={`gradient-flyout ${custom ? 'is-custom' : ''}`} role="dialog" aria-label="Gradient presets" style={place ? { left: place.left, top: place.top, maxHeight: place.maxHeight } : undefined}>
    <div className="gf-head">
      <div><h3>GRADIENT PRESETS</h3><p>Apply to selected colour zone <b>{slotLabel}</b></p></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Close gradient presets"><X size={17} /></button>
    </div>
    <div className="gf-grid">{gradientPresets.map(p => {
      const on = gradient?.preset === p.id;
      return <button type="button" key={p.id} className={on ? 'selected' : ''} aria-pressed={on} onClick={() => { setCustom(false); apply(makeGradient(p.stops, angle, p.id)); }}>
        <span className="gf-swatch" style={{ background: cssGradient(p.stops, 90) }}>{on && <i className="gf-check"><Check size={11} strokeWidth={3.5} /></i>}</span>
        <span className="gf-name">{p.name}</span>
      </button>;
    })}</div>
    {custom && stops && <div className="gf-custom">
      <h4>CUSTOM GRADIENT</h4>
      <div className="gf-bar" style={{ background: cssGradient(stops, 90) }}>{stops.map((s, i) => <button type="button" key={i} className={i === selectedStop ? 'active' : ''} style={{ left: `${s.at * 100}%`, background: s.color }} onClick={() => setStop(i)} aria-label={`Colour stop ${i + 1}: ${s.color.toUpperCase()}`} aria-pressed={i === selectedStop} />)}</div>
      <div className="gf-stop-row">
        <span>Stop {selectedStop + 1} of {stops.length}</span>
        <button type="button" className="gf-mini" onClick={addStop} disabled={stops.length >= MAX_STOPS}><Plus size={13} /> Add stop</button>
        <button type="button" className="gf-mini" onClick={removeStop} disabled={stops.length <= 2}><Minus size={13} /> Remove</button>
      </div>
      <label className="field">Position · {Math.round(stops[selectedStop].at * 100)}%<input type="range" min={0} max={100} step={1} value={Math.round(stops[selectedStop].at * 100)} onChange={e => moveStop(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} aria-label="Stop position" /></label>
      <ColorWheel value={stops[selectedStop].color} onChange={hex => setStops(stops.map((s, i) => i === selectedStop ? { ...s, color: hex } : s), true)} onCommit={commit} />
    </div>}
    <div className="gf-foot">
      <button type="button" className="gf-create" onClick={() => custom ? setCustom(false) : startCustom()}><CirclePlus size={16} /> {custom ? 'DONE EDITING' : 'CREATE CUSTOM GRADIENT'}</button>
      {gradient && <button type="button" className="gf-off" onClick={() => { setCustom(false); apply(null); }}>Turn gradient off · solid colour</button>}
      <p>Select a preset to preview on your garment</p>
    </div>
  </div>, document.body);
}
