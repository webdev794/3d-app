import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Design, Zone } from '../types';
import { patternNames, type LibraryAsset } from './StudioArtwork';
import { useOwnPatterns } from './OwnPatterns';

/** A pattern dragged onto the kit: a pattern name or a picture (data URL) of My patterns, and how it is called. */
export interface PatternDrop { pattern: string; label: string }
/** The Studio's side of a drag from the panel: the part under the pointer lights up; a release puts the pattern there. */
export interface PatternDragHost {
  hover: (clientX: number, clientY: number) => void;
  leave: () => void;
  drop: (drop: PatternDrop, clientX: number, clientY: number) => Promise<void>;
}

/** The style chips over the grid (the client's mockup, 19 Nov): the four panel styles. */
const STYLE_CHIPS = ['Velocity', 'Chevron', 'Stripes', 'Solid'];
/** 2 rows of 6 thumbnails a page; more pages swipe or scroll inside the panel. */
const PER_PAGE = 12;
/** A press held this long (finger or pen) picks the thumbnail up; a mouse picks it up once it moves this far. */
const HOLD_MS = 350, MOUSE_SLOP = 6, TOUCH_SLOP = 10;

/** The pattern's colour, or (too close to the kit's own, as a dark tee with a dark Secondary: client 653, blank
 *  thumbnails) cyan on a dark kit and near-black on a light one, so each pattern shows (as the app's visibleInk). */
export function visibleInk(ink: string, base: string) {
  const lum = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const a = lum(ink), b = lum(base);
  if (a === null || b === null || Math.abs(a - b) >= 0.18) return ink;
  return b < 0.5 ? '#16b4f0' : '#0b1016';
}
/** A small drawing of a built-in pattern (as the app's swatches, drag_tray.dart): `ink` on `base`. */
export function PatternSwatch({ name, base, ink: own }: { name: string; base: string; ink: string }) {
  const ink = visibleInk(own, base);
  const line = { stroke: ink, strokeWidth: 4, fill: 'none' } as const;
  const range = (from: number, to: number, step: number) => { const out: number[] = []; for (let v = from; v < to; v += step) out.push(v); return out; };
  let body: ReactNode = null;
  switch (name) {
    case 'None': body = <line x1="12" y1="46" x2="46" y2="12" stroke={ink} strokeWidth="3" strokeLinecap="round" opacity=".85" />; break;
    case 'Solid': body = <rect width="58" height="58" fill={ink} />; break;
    case 'Stripes': body = range(6, 58, 12).map(x => <line key={x} x1={x} y1="0" x2={x} y2="58" {...line} />); break;
    case 'Hoops': body = range(6, 58, 14).map(y => <rect key={y} x="0" y={y} width="58" height="6" fill={ink} />); break;
    case 'Chevron': body = range(6, 68, 13).map(y => <polyline key={y} points={`0,${y} 29,${y - 9} 58,${y}`} {...line} />); break;
    case 'Diagonal': body = range(-58, 58, 12).map(x => <line key={x} x1={x} y1="58" x2={x + 58} y2="0" {...line} />); break;
    case 'Dots': body = range(6, 58, 11).flatMap(y => range(6, 58, 11).map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill={ink} />)); break;
    case 'Velocity': body = [0, 1, 2, 3].map(i => <polygon key={i} points={`58,${8 + i * 12} 17.4,${14 + i * 12} 58,${18 + i * 12}`} fill={ink} />); break;
    case 'Swirl': body = range(8, 58, 16).flatMap(y => range(8, 58, 16).map(x => {
      const pts: string[] = []; for (let t = 0; t <= 10; t += 0.3) { const r = 1 + t * 0.6; pts.push(`${(x + r * Math.cos(t)).toFixed(1)},${(y + r * Math.sin(t)).toFixed(1)}`); }
      return <polyline key={`${x}-${y}`} points={pts.join(' ')} stroke={ink} strokeWidth="2.5" fill="none" />;
    })); break;
    case 'Blades': body = [-1, 1].flatMap(s => [0, 1, 2].map(i => {
      const x0 = 29 + s * 58 * (0.46 - i * 0.06), tip = 29 + s * 58 * (0.14 + i * 0.08);
      return <path key={`${s}-${i}`} d={`M${x0} 58 Q${29 + s * 58 * 0.18} ${58 * 0.7} ${tip} ${58 * (0.15 + i * 0.2)} Q${29 + s * 58 * 0.3} ${58 * 0.7} ${x0 + s * 4} 58Z`} fill={ink} />;
    })); break;
    case 'Tribal': body = range(8, 58, 18).flatMap(y => range(0, 58, 12).map(x => <polygon key={`${x}-${y}`} points={`${x},${y} ${x + 6},${y + 9} ${x + 12},${y}`} fill={ink} />)); break;
    case 'Camo': body = [[12, 14, 9], [38, 10, 7], [24, 34, 10], [48, 40, 8], [8, 48, 6]].map(([x, y, r]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r * 1.2} ry={r * 0.8} fill={ink} />); break;
    // CLIENT25 2026-11-25 (more patterns), as the viewer draws them (texture.js patternTile).
    case 'Sash': body = <g stroke={ink}><line x1="62" y1="-4" x2="-4" y2="62" strokeWidth="12" />{[-10, 10].map(o => <line key={o} x1={62 + o} y1={-4 + o} x2={-4 + o} y2={62 + o} strokeWidth="2" />)}</g>; break;
    case 'Fade': { const id = `fade-${ink.replace(/[^0-9a-z]/gi, '')}`; body = <><defs><linearGradient id={id} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={ink} /><stop offset=".35" stopColor={ink} stopOpacity=".7" /><stop offset="1" stopColor={ink} stopOpacity="0" /></linearGradient></defs><rect width="58" height="58" fill={`url(#${id})`} /></>; break; }
    case 'Halftone': body = range(0, 10, 1).flatMap(row => { const y = 55 - row * 6, r = 2.9 * Math.pow(y / 58, 0.85); return r < 0.5 ? [] : range(row % 2 ? 3 : 0, 61, 6).map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r={r.toFixed(2)} fill={ink} />); }); break;
    case 'Prism': {
      let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const pts = range(0, 5, 1).map(j => range(0, 5, 1).map(i => [14.5 * i + (i > 0 && i < 4 ? (rnd() - 0.5) * 8.7 : 0), 14.5 * j + (j > 0 && j < 4 ? (rnd() - 0.5) * 8.7 : 0)]));
      const tris: ReactNode[] = [];
      const tri = (key: string, ...p: number[][]) => { const k = rnd(); if (k >= 0.3) tris.push(<polygon key={key} points={p.map(q => q.join(',')).join(' ')} fill={ink} opacity={(0.2 + ((k - 0.3) / 0.7) * 0.75).toFixed(2)} />); };
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i], d = pts[j + 1][i + 1]; if ((i + j) % 2) { tri(`${i}-${j}a`, a, b, d); tri(`${i}-${j}b`, a, d, c); } else { tri(`${i}-${j}a`, a, b, c); tri(`${i}-${j}b`, b, d, c); } }
      body = tris; break;
    }
    case 'Brush': {
      let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      body = [[-2, 20, 60, 12, 12], [6, 32, 60, 28, 7], [-2, 50, 44, 42, 10]].flatMap(([x0, y0, x1, y1, bw], s) => range(0, 9, 1).map(b => {
        const off = (rnd() - 0.5) * bw, st = rnd() * 0.1, en = 1 - rnd() * 0.15;
        return <line key={`${s}-${b}`} x1={x0 + (x1 - x0) * st} y1={y0 + off + (y1 - y0) * st} x2={x0 + (x1 - x0) * en} y2={y0 + off + (y1 - y0) * en} stroke={ink} strokeOpacity={(0.5 + rnd() * 0.5).toFixed(2)} strokeWidth={(0.8 + rnd() * 1.8).toFixed(2)} strokeLinecap="round" />;
      })); break;
    }
    case 'Waves': body = range(4, 62, 8).map(x => <polyline key={x} points={range(0, 60, 2).map(y => `${(x + 2.5 * Math.sin(y * 0.28 + x * 0.1)).toFixed(1)},${y}`).join(' ')} stroke={ink} strokeWidth="2" fill="none" />); break;
    default: body = <line x1="0" y1="0" x2="58" y2="58" {...line} />;
  }
  return <svg viewBox="0 0 58 58" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="58" height="58" fill={base} />{body}</svg>;
}

type Tile = { key: string; label: string; name?: string; item?: LibraryAsset };

type Props = {
  design: Design;
  /** The garment area a tap applies to ('all': the whole garment), and the garment's areas. */
  area: Zone | 'all';
  areas: { key: Zone; label: string }[];
  onArea: (area: Zone | 'all') => void;
  /** Tap-to-apply: a built-in pattern on the chosen area. */
  applyPattern: (name: string) => void;
  /** The pattern's colour on the kit (Studio patternInkOf), for the thumbnails. */
  ink: string;
  signedIn: boolean;
  requireAuth: (action?: () => void) => void;
  edit: (patch: Partial<Design>) => void;
  onNotice: (text: string) => void;
  onClose: () => void;
  drag: PatternDragHost;
  /** A drag is on: the Studio shields the 3D frame so the pointer stays with the page. */
  onDragging: (on: boolean) => void;
  /** The rest of the Patterns tools (size, coverage, AI print), under More. */
  more?: ReactNode;
};

/**
 * Patterns (client 19 Nov, 607 + mockup): a floating, see-through glass panel over the 3D view (the kit keeps its size
 * and place). Style chips; a compact grid of thumbnails, 2 rows of 6 a page, swiped or scrolled inside the panel; tap
 * to put one on the chosen area, or press and hold (a finger) / click and drag (a mouse) to drop it on a part of the
 * garment: the panel steps aside while dragging, the part under the pointer lights up, a release outside the garment
 * changes nothing. The bottom row: the garment area, Full colour / Kit colours, Upload pattern.
 */
export function PatternsFloat({ design, area, areas, onArea, applyPattern, ink, signedIn, requireAuth, edit, onNotice, onClose, drag, onDragging, more }: Props) {
  const areaLabel = areas.find(a => a.key === area)?.label ?? 'Whole garment';
  const own = useOwnPatterns({ design, area, areaLabel, signedIn, edit, onNotice });
  const [showMore, setShowMore] = useState(false);
  const [page, setPage] = useState(0);
  const [held, setHeld] = useState<{ x: number; y: number; tile: Tile; touch: boolean } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const suppressClick = useRef(false);

  // The Front / Back / Side buttons sit just above the panel (the stage reads --float-h).
  useEffect(() => {
    const el = panel.current, stage = el?.parentElement;
    if (!el || !stage) return;
    const ro = new ResizeObserver(() => stage.style.setProperty('--float-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); stage.style.removeProperty('--float-h'); };
  }, []);

  const current = area === 'all' ? (design.patternImage ? null : design.pattern) : design.zones?.[area];
  const tiles: Tile[] = [
    ...patternNames.map(name => ({ key: `p-${name}`, label: name, name })),
    ...(own.items ?? []).map(item => ({ key: `o-${item.id}`, label: item.name || 'My pattern', item })),
  ];
  const groups: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += PER_PAGE) groups.push(tiles.slice(i, i + PER_PAGE));
  const isOn = (t: Tile) => t.name ? current === t.name : own.isOn(t.item!);
  const swatch = (t: Tile) => t.name ? <PatternSwatch name={t.name} base={design.main} ink={ink} /> : t.item?.src ? <img src={t.item.src} alt="" draggable={false} /> : <span className="pf-empty" />;
  const tap = (t: Tile) => { if (suppressClick.current) { suppressClick.current = false; return; } if (t.name) applyPattern(t.name); else void own.apply(t.item!); };

  // ---------- drag: press and hold (finger, pen) or click and drag (mouse)
  const press = useRef<{ id: number; x: number; y: number; touch: boolean; tile: Tile; timer?: number; started: boolean; moved: boolean; payload?: Promise<PatternDrop>; off: () => void } | null>(null);
  useEffect(() => () => press.current?.off(), []);
  function payloadOf(t: Tile): Promise<PatternDrop> {
    return t.name ? Promise.resolve({ pattern: t.name, label: t.name }) : own.prepared(t.item!).then(src => ({ pattern: src, label: t.item!.name || 'Your pattern' }));
  }
  function begin(x: number, y: number) {
    const p = press.current;
    if (!p || p.started) return;
    p.started = true;
    p.payload = payloadOf(p.tile);
    p.payload.catch(() => undefined);
    suppressClick.current = true;
    navigator.vibrate?.(12);
    setHeld({ x, y, tile: p.tile, touch: p.touch });
    onDragging(true);
  }
  function end() {
    const p = press.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    p.off();
    press.current = null;
    if (p.started) { setHeld(null); onDragging(false); drag.leave(); }
  }
  function onPointerDown(e: React.PointerEvent, t: Tile) {
    suppressClick.current = false;
    if (e.button !== 0 || press.current) return;
    const touch = e.pointerType !== 'mouse';
    // (A mouse press selects no text while it drags.)
    if (!touch) e.preventDefault();
    const move = (ev: PointerEvent) => {
      const p = press.current;
      if (!p || ev.pointerId !== p.id) return;
      const far = Math.hypot(ev.clientX - p.x, ev.clientY - p.y);
      if (!p.started) {
        // A finger that moves before the hold is up is scrolling: no drag.
        if (p.touch) { if (far > TOUCH_SLOP) end(); return; }
        if (far <= MOUSE_SLOP) return;
        begin(ev.clientX, ev.clientY);
      }
      if (far > TOUCH_SLOP) p.moved = true;
      setHeld(h => h && { ...h, x: ev.clientX, y: ev.clientY });
      drag.hover(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      const p = press.current;
      if (!p || ev.pointerId !== p.id) return;
      const { started, moved, payload } = p;
      end();
      if (!started) return;
      // Held and let go without moving: nothing is put on.
      if (!moved) { onNotice('Drag the pattern onto the garment to put it there.'); return; }
      void payload!.then(d => drag.drop(d, ev.clientX, ev.clientY), err => onNotice((err as Error).message));
    };
    const cancel = (ev: PointerEvent) => { if (press.current && ev.pointerId === press.current.id) end(); };
    // While dragging, a finger moves the pattern, never the page.
    const still = (ev: TouchEvent) => { if (press.current?.started && ev.cancelable) ev.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', still, { passive: false });
    const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('touchmove', still); };
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, touch, tile: t, started: false, moved: false, off };
    if (touch) press.current.timer = window.setTimeout(() => begin(e.clientX, e.clientY), HOLD_MS);
  }

  const goPage = (i: number) => { const el = pages.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }); };
  const modeLabel = (m: 'full' | 'kit') => m === 'full' ? 'Full colour' : 'Kit colours';

  return <>
    <section ref={panel} className={`patterns-float ${held ? 'is-dragging' : ''}`} aria-label="Patterns">
      {held ? <p className="pf-dropbar">Drop <b>{held.tile.label}</b> on a part of the garment · outside cancels</p> : <>
        <header className="pf-head">
          <h2>PATTERNS</h2>
          <span className="pf-hint">Tap, or {window.matchMedia?.('(pointer: coarse)').matches ? 'hold and drag' : 'drag'} onto the garment</span>
          <button type="button" className={`pf-icon ${showMore ? 'on' : ''}`} onClick={() => setShowMore(m => !m)} aria-expanded={showMore} aria-label="More pattern options" title="Pattern size, coverage and more"><SlidersHorizontal size={16} /></button>
          <button type="button" className="pf-icon" onClick={onClose} aria-label="Close patterns"><X size={18} /></button>
        </header>
        <div className="pf-chips" role="group" aria-label="Pattern style">{STYLE_CHIPS.map(name => <button key={name} type="button" className={current === name ? 'selected' : ''} aria-pressed={current === name} onClick={() => applyPattern(name)}>{name}</button>)}</div>
      </>}
      <div className={`pf-grid-wrap ${held ? 'pf-hidden' : ''}`}>
        <div className="pf-pages" ref={pages} onScroll={e => { const el = e.currentTarget; setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
          {groups.map((group, g) => <div className="pf-page" key={g}>{group.map(t => <button key={t.key} type="button" className={`pf-tile ${isOn(t) ? 'selected' : ''}`} aria-pressed={isOn(t)} title={t.label}
            onPointerDown={e => onPointerDown(e, t)} onClick={() => tap(t)} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}>
            <span className="pf-swatch">{swatch(t)}</span><span className="pf-name">{t.label}</span>
            {t.item && <i role="button" tabIndex={0} aria-label={`Delete ${t.label}`} className="pf-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void own.remove(t.item!); }}><Trash2 size={10} /></i>}
          </button>)}</div>)}
        </div>
        {groups.length > 1 && <div className="pf-dots">{groups.map((_, i) => <button key={i} type="button" className={i === page ? 'on' : ''} aria-label={`Page ${i + 1} of ${groups.length}`} onClick={() => goPage(i)} />)}</div>}
        <div className="pf-row">
          <label className="pf-area"><select value={area} onChange={e => onArea(e.target.value as Zone | 'all')} aria-label="Garment area">
            <option value="all">Whole garment</option>{areas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select></label>
          {(['full', 'kit'] as const).map(m => <button key={m} type="button" className={`pf-mode ${own.mode === m ? 'selected' : ''}`} aria-pressed={own.mode === m} disabled={!own.mode || own.switching} title={own.tip} onClick={() => own.switchMode(m)}>{own.switching && own.mode !== m && <LoaderCircle className="spin" size={11} />}{modeLabel(m)}</button>)}
          <button type="button" className="pf-upload" disabled={own.busy} onClick={() => { if (!signedIn) { requireAuth(); return; } upload.current?.click(); }}>{own.busy ? <LoaderCircle className="spin" size={13} /> : <Plus size={14} />}Upload pattern</button>
          <input ref={upload} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void own.upload(f); }} />
        </div>
        {own.error && <p className="error-message pf-error" role="alert">{own.error}</p>}
        {showMore && <div className="pf-more">
          <p className="field-hint">{own.tip}</p>
          <p className="field-hint">{signedIn ? 'Your own patterns: PNG, JPG or WebP up to 5 MB, saved to your account (in the app too).' : 'Sign in to upload your own pattern.'}</p>
          {own.picture && <button type="button" className="button button-secondary full-width" onClick={own.removePicture}><X size={14} /> Remove my pattern here</button>}
          {more}
        </div>}
      </div>
    </section>
    {held && <div className={`pf-ghost ${held.touch ? 'touch' : ''}`} style={{ left: held.x, top: held.y }} aria-hidden="true"><span className="pf-swatch">{swatch(held.tile)}</span></div>}
  </>;
}
