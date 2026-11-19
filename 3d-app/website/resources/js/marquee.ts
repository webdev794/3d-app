// Signage & Marquees (client mockups 297 / 298, 2026-11-02): the marquee's design, as the Marquee Studio edits it and
// the 3D viewer (media/viewer/marquee.html, viewer/src/marquee.js) paints it. Saved in a project as design.marquee
// (garment 'marquee'). The app has the same model (lib/marquee.dart).

export type MarqueeSize = '3x3' | '3x6';
export type MarqueeWalls = 'none' | 'back' | 'full';
export type MarqueeZone = 'roof' | 'valanceFront' | 'valanceBack' | 'valanceLeft' | 'valanceRight' | 'wallLeft' | 'wallRight' | 'wallBack';
export type MarqueeView = 'Front' | 'Back' | 'Left' | 'Right' | '360°';

/** One artwork layer on a zone: a pattern over the whole panel, a picture or words. x, y: the centre (0..1 across and down). */
export interface MarqueeLayer {
  id: string;
  type: 'pattern' | 'image' | 'text';
  name?: string;
  visible?: boolean;
  /** pattern: its name in `name` (marquee.js PATTERNS), colours and size. */
  color?: string; accent?: string; scale?: number;
  x?: number; y?: number; rot?: number;
  /** image: its picture ('3deezi:logo', '3deezi:wordmark', a data URL or a local URL) and width (share of the panel's width). */
  src?: string; w?: number;
  /** text: the words, font ('Rajdhani' | 'JerseyBlock'), height (share of the panel's height) and outline colour. */
  text?: string; font?: string; size?: number; outline?: string | null;
}
export interface MarqueeZoneDesign { color: string; layers: MarqueeLayer[] }
export interface MarqueeDesign { size: MarqueeSize; walls: MarqueeWalls; halfWall: boolean; zones: Record<MarqueeZone, MarqueeZoneDesign> }

export const ZONES: MarqueeZone[] = ['roof', 'valanceFront', 'valanceBack', 'valanceLeft', 'valanceRight', 'wallLeft', 'wallRight', 'wallBack'];
export const ZONE_LABEL: Record<MarqueeZone, string> = {
  roof: 'Roof', valanceFront: 'Front valance', valanceBack: 'Back valance', valanceLeft: 'Left valance', valanceRight: 'Right valance',
  wallLeft: 'Left wall', wallRight: 'Right wall', wallBack: 'Back wall',
};
export const SIZE_LABEL: Record<MarqueeSize, string> = { '3x3': '3 × 3 m', '3x6': '3 × 6 m' };
export const WALLS_LABEL: Record<MarqueeWalls, string> = { none: 'Roof only', back: 'Back wall', full: 'Full walls' };
export const MARQUEE_PATTERNS = ['Solid', 'Blades', 'Velocity', 'Chevron', 'Stripes', 'Diagonal', 'Hoops', 'Dots', 'Camo', 'Tribal'];
/** The mockups' colours: black, cyan, royal blue and white. */
export const MARQUEE_SWATCHES = ['#05080c', '#00c8ff', '#1560ff', '#ffffff'];
export const BRAND_LOGOS = [{ src: '3deezi:logo', name: '3DEEZI emblem' }, { src: '3deezi:wordmark', name: '3DEEZI wordmark' }];

const EAVE = 2.1, VALANCE = 0.26, HALF = 1.0, OVERHANG = 0.035;
/** Which walls a design has (as the viewer's wallsOf): 'full', 'half' or null for each wall zone. */
export function wallsOf(d: Pick<MarqueeDesign, 'walls' | 'halfWall'>): Record<'wallBack' | 'wallLeft' | 'wallRight', 'full' | 'half' | null> {
  const full = d.walls === 'full';
  return { wallBack: d.walls !== 'none' ? 'full' : null, wallLeft: full ? 'full' : d.halfWall ? 'half' : null, wallRight: full ? 'full' : null };
}
/** A zone's print size in metres (null: this marquee has no such wall). */
export function zoneSize(zone: MarqueeZone, d: Pick<MarqueeDesign, 'size' | 'walls' | 'halfWall'>): { w: number; h: number } | null {
  const w = d.size === '3x6' ? 6 : 3, depth = 3;
  if (zone === 'roof') return { w: w + OVERHANG * 2, h: depth + OVERHANG * 2 };
  if (zone === 'valanceFront' || zone === 'valanceBack') return { w: w + OVERHANG * 2, h: VALANCE };
  if (zone === 'valanceLeft' || zone === 'valanceRight') return { w: depth + OVERHANG * 2, h: VALANCE };
  const kind = wallsOf(d)[zone];
  if (!kind) return null;
  return { w: zone === 'wallBack' ? w : depth, h: kind === 'half' ? HALF : EAVE - 0.06 };
}
/** The zones this marquee has. */
export const zonesOf = (d: MarqueeDesign) => ZONES.filter(z => zoneSize(z, d));
export const metres = (n: number) => `${Math.round(n * 100) / 100} m`;
export const zoneLabel = (zone: MarqueeZone, d: MarqueeDesign) => (zone === 'wallLeft' && wallsOf(d).wallLeft === 'half' ? 'Left half wall' : ZONE_LABEL[zone]);

let counter = 0;
export const newLayerId = (zone: string, what: string) => `${zone}-${what}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The mockups' marquee: black panels with cyan and royal blue blades and the 3DEEZI logo (as viewer marquee.js). */
export function defaultMarquee(): MarqueeDesign {
  const blades = (id: string): MarqueeLayer => ({ id, type: 'pattern', name: 'Blades', color: '#00c8ff', accent: '#1560ff', scale: 1 });
  const logo = (id: string, x: number, y: number, w: number): MarqueeLayer => ({ id, type: 'image', name: 'Logo', src: '3deezi:logo', x, y, w });
  // (Branding, BR1 2026-11-02: the "3" emblem and the wordmark everywhere, from the brand pictures, not typed text.)
  const word = (id: string, x: number, y: number, w: number): MarqueeLayer => ({ id, type: 'image', name: 'Wordmark', src: '3deezi:wordmark', x, y, w });
  const valance = (z: string): MarqueeZoneDesign => ({ color: '#05080c', layers: [blades(`${z}-pattern`), logo(`${z}-logo`, 0.25, 0.5, 0.09), word(`${z}-word`, 0.53, 0.5, 0.36)] });
  return {
    size: '3x3', walls: 'back', halfWall: true,
    zones: {
      roof: { color: '#05080c', layers: [blades('roof-pattern'), logo('roof-logo', 0.5, 0.66, 0.2), word('roof-word', 0.5, 0.79, 0.3)] },
      valanceFront: valance('valanceFront'), valanceBack: valance('valanceBack'), valanceLeft: valance('valanceLeft'), valanceRight: valance('valanceRight'),
      wallBack: { color: '#05080c', layers: [blades('wallBack-pattern'), logo('wallBack-logo', 0.5, 0.42, 0.24), word('wallBack-word', 0.5, 0.66, 0.5)] },
      wallLeft: { color: '#05080c', layers: [blades('wallLeft-pattern'), logo('wallLeft-logo', 0.5, 0.33, 0.2), word('wallLeft-word', 0.5, 0.74, 0.5)] },
      wallRight: { color: '#05080c', layers: [blades('wallRight-pattern'), logo('wallRight-logo', 0.5, 0.42, 0.24), word('wallRight-word', 0.5, 0.66, 0.5)] },
    },
  };
}

/** A saved or stored design made whole (unknown keys dropped, missing zones from the default). */
export function normalizeMarquee(raw: unknown): MarqueeDesign {
  const base = defaultMarquee();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<MarqueeDesign>;
  const zones = { ...base.zones };
  for (const z of ZONES) {
    const zd = r.zones?.[z];
    if (zd && typeof zd === 'object' && Array.isArray(zd.layers)) zones[z] = { color: /^#[0-9a-f]{6}$/i.test(zd.color ?? '') ? zd.color : base.zones[z].color, layers: zd.layers.filter(l => l && typeof l === 'object' && typeof l.id === 'string') };
  }
  return { size: r.size === '3x6' ? '3x6' : '3x3', walls: r.walls === 'none' || r.walls === 'full' ? r.walls : 'back', halfWall: r.halfWall !== false, zones };
}

/** The product's name on projects and orders: "Custom marquee 3 × 3 m". */
export const marqueeProductName = (d: MarqueeDesign) => `Custom marquee ${SIZE_LABEL[d.size]}`;
