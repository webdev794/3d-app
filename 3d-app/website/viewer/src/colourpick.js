// Tap the kit to pick a colour (the Studio's Colours panel): which kit colour (Primary / Secondary / Accent / Pattern)
// or which garment area's own colour (hoodie, varsity and track jacket areas) a tapped point of the 3D kit shows.
import { varsityColour } from './varsity.js';

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** What each area follows while it has no colour of its own (as KitViewer.tsx lists them). */
const FOLLOWS = {
  hoodie: { hood: 'main', lining: 'secondary', rib: 'main', pocket: 'main', zip: 'secondary' },
  varsity: { body: 'main', sleeves: 'secondary', rib: 'main', ribStripe: 'secondary', snaps: 'main', pocketTrim: 'secondary', lining: 'secondary' },
  trackjacket: { body: 'main', shoulder: 'secondary', side: 'secondary', stripe: 'accent', collar: 'main', cuffs: 'main', zip: 'secondary' },
};
export const familyOf = (kind) => (kind === 'hoodie' || kind === 'ziphoodie' ? 'hoodie' : kind === 'varsity' || kind === 'trackjacket' ? kind : null);

const own = (design, key) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : null);
function trackColour(design, key) {
  const body = own(design, 'body') ?? design.main;
  return own(design, key) ?? { body, shoulder: design.secondary, side: design.secondary, stripe: design.accent, collar: body, cuffs: body, zip: design.secondary }[key];
}
const areaColour = (family, design, key) => (family === 'varsity' ? varsityColour(design, key) : family === 'trackjacket' ? trackColour(design, key) : own(design, key) ?? design[FOLLOWS.hoodie[key]]);

/** The zone's usual kit colour (plain garments), used when the print's pixel matches none of them. */
const ZONE_SLOT = { body: 'main', yoke: 'main', sleeves: 'main', pocket: 'main', hood: 'main', sides: 'secondary', hem: 'secondary' };

const mixRgb = (a, b, t) => rgb(a).map((x, i) => Math.round(x + (rgb(b)[i] - x) * t));
/**
 * The colours the pattern is painted in where `zone` is (texture.js): an area pattern in the pattern's own colour or
 * the Secondary; the whole-garment pattern in its own colour or a mix of the Primary and Secondary; an uploaded
 * pattern in Kit colours in the Pattern colour.
 */
function patternInks(design, zone) {
  const own = design.patternColorOwn && HEX.test(design.patternColor ?? '') ? design.patternColor : null;
  const inks = [];
  const area = zone ? design.zones?.[zone] : null;
  if (area && area !== 'None') inks.push(rgb(own ?? design.secondary));
  if (design.patternImage) { if (HEX.test(design.patternColor ?? design.secondary ?? '')) inks.push(rgb(design.patternColor ?? design.secondary)); }
  else if (design.pattern && !['Solid', 'None'].includes(design.pattern) && HEX.test(design.main ?? '') && HEX.test(design.secondary ?? '')) inks.push(own ? rgb(own) : mixRgb(design.main, design.secondary, 0.35));
  return { inks, onArea: !!(area && area !== 'None'), gradient: !!design.gradients?.patternColor };
}
/** How near the pixel is to the pattern's ink (Infinity when there is no pattern there). */
function patternDistance(design, zone, pixel) {
  if (!pixel) return Infinity;
  return Math.min(Infinity, ...patternInks(design, zone).inks.map((ink) => dist(pixel, ink)));
}

/** The colour slot nearest the printed pixel (ties go to `prefer`; on an area pattern, to the pattern). */
function nearestSlot(design, pixel, prefer, fullPrint, zone) {
  const { onArea, gradient } = patternInks(design, zone);
  // On a full-colour print only a flat kit colour painted over it (trims, bands, marks) is a kit colour.
  if (fullPrint) {
    const flat = ['main', 'secondary', 'accent'].find((slot) => HEX.test(design[slot] ?? '') && dist(pixel, rgb(design[slot])) < 10);
    return flat ?? 'pattern-image';
  }
  let best = { slot: 'pattern', d: patternDistance(design, zone, pixel) - (onArea ? 12 : 0) };
  for (const slot of ['main', 'secondary', 'accent']) {
    const hex = design[slot];
    if (!HEX.test(hex ?? '')) continue;
    const d = dist(pixel, rgb(hex)) - (slot === prefer ? 6 : 0);
    if (d < best.d) best = { slot, d };
  }
  if (best.d < 70) return best.slot;
  // A full-colour uploaded pattern's own colours: not a kit colour. A pattern in a gradient: the pattern.
  return fullPrint ? 'pattern-image' : gradient && patternInks(design, zone).inks.length ? 'pattern' : prefer;
}

/**
 * {kind, zone, pixel (printed rgb or null), area (an area known from the 3D part), fixed (a slot known from the part)}
 * -> {slot, area}.
 */
export function colourFor(design, { kind, zone, pixel, area, fixed, fullPrint = false }) {
  const family = familyOf(kind);
  if (fixed) return { slot: fixed, area: null };
  if (family && area) return { slot: FOLLOWS[family][area], area };
  if (family === 'hoodie') {
    if (zone === 'hood' || zone === 'pocket') return { slot: 'main', area: zone };
    return { slot: pixel ? nearestSlot(design, pixel, 'main', fullPrint, zone) : 'main', area: null };
  }
  if (family) {
    // On the pattern: the pattern's colour (a full-colour print: its tip).
    if (pixel) {
      const near = patternDistance(design, zone, pixel);
      const base = Math.min(...Object.keys(FOLLOWS[family]).map((key) => { const hex = areaColour(family, design, key); return HEX.test(hex ?? '') ? dist(pixel, rgb(hex)) : Infinity; }));
      if (near < 70 && near < base) return { slot: 'pattern', area: null };
      if (fullPrint && base >= 10) return { slot: 'pattern-image', area: null };
    }
    // The area whose colour the pixel shows; ties go to the one the zone suggests.
    const guess = family === 'trackjacket'
      ? { sleeves: 'shoulder', yoke: 'shoulder', sides: 'side', hood: 'collar', hem: 'cuffs' }[zone] ?? 'body'
      : zone === 'sleeves' ? 'sleeves' : 'body';
    let best = { key: guess, d: Infinity };
    if (pixel) for (const key of Object.keys(FOLLOWS[family])) {
      const hex = areaColour(family, design, key);
      if (!HEX.test(hex ?? '')) continue;
      const d = dist(pixel, rgb(hex)) - (key === guess ? 6 : 0);
      if (d < best.d) best = { key, d };
    }
    const key = best.d < 70 ? best.key : guess;
    return { slot: FOLLOWS[family][key], area: key };
  }
  const prefer = ZONE_SLOT[zone] ?? 'main';
  return { slot: pixel ? nearestSlot(design, pixel, prefer, fullPrint, zone) : prefer, area: null };
}
