/**
 * The site's sizes (Order::SIZES, client price list 2026-10-22, tasks.md 9.12), one set per fit:
 *   Mens (and Unisex): XS S M L XL 2XL 3XL 4XL 5XL 6XL 7XL 8XL
 *   Womens:            W8 W10 W12 W14 W16 W18 W20 W22 W24
 *   Kids (fit youth):  2Y 4Y 6Y 8Y 10Y 12Y 14Y 16Y
 * plus "Kids", the one youth column of older orders and drafts (still shown and kept, never offered for new rows).
 * The rarer sizes of each set open with "More sizes". The app has the same lists in lib/order_sizes.dart.
 */
export const MENS_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
export const WOMENS_SIZES = ['W8', 'W10', 'W12', 'W14', 'W16', 'W18', 'W20', 'W22', 'W24'];
export const KIDS_SIZES = ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y', '16Y'];
/** The youth column of orders before 2026-10-22. */
export const OLD_KIDS = 'Kids';
/** Every size, in order (as orders/options `sizes`). */
export const ALL_SIZES = [...MENS_SIZES, ...WOMENS_SIZES, ...KIDS_SIZES, OLD_KIDS];
/** Sizes behind "More sizes" (rarely ordered). */
export const RARE_SIZES = ['5XL', '6XL', '7XL', '8XL', 'W22', 'W24', '2Y', '4Y'];

/** The size set a fit orders in: womens, youth (Kids), else mens (also unisex and no fit). */
export function fitSizes(fit: string | null | undefined): string[] {
  return fit === 'womens' ? WOMENS_SIZES : fit === 'youth' ? KIDS_SIZES : MENS_SIZES;
}
/** The fit a size belongs to ("W10" womens, "10Y" or "Kids" youth, else mens). */
export function sizeFit(size: string): 'mens' | 'womens' | 'youth' {
  return WOMENS_SIZES.includes(size) ? 'womens' : KIDS_SIZES.includes(size) || size === OLD_KIDS ? 'youth' : 'mens';
}
/** The fits as the order shows them (Order::FITS): "youth" is the Kids fit. */
export const FIT_NAMES: Record<string, string> = { mens: 'Mens', womens: 'Womens', youth: 'Kids', unisex: 'Unisex' };
/** The fits' names as the size groups are headed. */
export const SET_NAMES: Record<'mens' | 'womens' | 'youth', string> = { mens: 'Mens', womens: 'Womens', youth: 'Kids' };

/**
 * The size boxes for a garment row: its fit's sizes (the rare ones only with "More sizes"), plus any other size the
 * row already has a quantity in (an older "Kids", or sizes kept from before the fit changed), in the site's order.
 * `rare` lists the fit's sizes that "More sizes" adds.
 */
export function rowSizes(fit: string | null | undefined, sizes: Record<string, number>, more: boolean, order: readonly string[] = ALL_SIZES): { shown: string[]; rare: string[] } {
  const set = fitSizes(fit);
  const rare = set.filter(s => RARE_SIZES.includes(s) && order.includes(s));
  const has = (s: string) => (Number(sizes[s]) || 0) > 0;
  const shown = order.filter(s => (set.includes(s) && (more || !RARE_SIZES.includes(s))) || has(s));
  // A size on the row that the site's list doesn't have (never sent) still shows, so nothing is hidden.
  for (const s of Object.keys(sizes)) if (has(s) && !shown.includes(s)) shown.push(s);
  return { shown, rare };
}
/** "5XL–8XL", "W22, W24", "2Y, 4Y": the rare sizes as the "More sizes" button names them. */
export const rareText = (rare: string[]) => (rare.length > 2 ? `${rare[0]}–${rare[rare.length - 1]}` : rare.join(', '));

/** The sizes grouped by fit for a size list (<optgroup>): the given fit's group first. */
export function sizeGroups(order: readonly string[] = ALL_SIZES, first?: string | null): { fit: 'mens' | 'womens' | 'youth'; name: string; sizes: string[] }[] {
  const groups = (['mens', 'womens', 'youth'] as const).map(fit => ({ fit, name: SET_NAMES[fit], sizes: order.filter(s => sizeFit(s) === fit) })).filter(g => g.sizes.length);
  const lead = first === 'womens' ? 'womens' : first === 'youth' ? 'youth' : 'mens';
  return [...groups.filter(g => g.fit === lead), ...groups.filter(g => g.fit !== lead)];
}

const WORDS: Record<string, string> = {
  XXS: 'XS', XSMALL: 'XS', EXTRASMALL: 'XS', SMALL: 'S', SML: 'S', SM: 'S', MEDIUM: 'M', MED: 'M', MD: 'M', LARGE: 'L', LRG: 'L', LG: 'L',
  XLARGE: 'XL', EXTRALARGE: 'XL', XXLARGE: '2XL', KID: OLD_KIDS, KIDS: OLD_KIDS, CHILD: OLD_KIDS, CHILDREN: OLD_KIDS, CHILDRENS: OLD_KIDS, YOUTH: OLD_KIDS, JUNIOR: OLD_KIDS, JUNIORS: OLD_KIDS,
};
/**
 * The site's size for a size as people write it (Order::siteSize on the server): "xxl" 2XL, "XXXXXL" 5XL, "10y",
 * "Y10", "Youth 10", "Kids 10" 10Y, "w12", "Womens 12", "Ladies 12", "12W" W12, "kids" / "youth" / "YM" Kids.
 * Null when it isn't one (a plain "10" may be a womens or a youth size).
 */
export function siteSize(written: string): string | null {
  const s = written.toUpperCase().replace(/[\s.\-_'’]+/g, '');
  if (!s) return null;
  const direct = ALL_SIZES.find(x => x.toUpperCase() === s);
  if (direct) return direct;
  const xs = s.match(/^(X{2,8})L$/);
  if (xs) { const n = xs[1].length; return n <= 8 ? `${n}XL` : null; }
  const big = s.match(/^([2-8])X(?:L|LARGE)$/);
  if (big) return `${big[1]}XL`;
  const youth = s.match(/^(\d{1,2})(?:Y|YR|YRS|YEAR|YEARS|YO)$/) ?? s.match(/^(?:Y|YTH|YOUTH|K|KID|KIDS|C|CH|CHILD|JR|JNR|JUNIOR|AGE|BOYS|GIRLS)(\d{1,2})$/);
  if (youth) { const n = Number(youth[1]); return KIDS_SIZES.includes(`${n}Y`) ? `${n}Y` : OLD_KIDS; }
  if (/^(?:Y|YOUTH|KIDS?)(?:XS|S|M|L|XL|SMALL|MEDIUM|LARGE)$/.test(s)) return OLD_KIDS;
  const womens = s.match(/^(?:W|WMN|WOMENS|WOMEN|WOMANS|WOMAN|LADIES|LADY|LDS)(\d{1,2})$/) ?? s.match(/^(\d{1,2})W$/);
  if (womens) { const w = `W${Number(womens[1])}`; return WOMENS_SIZES.includes(w) ? w : null; }
  if (WORDS[s]) return WORDS[s];
  for (const prefix of ['ADULT', 'MENS', 'MEN', 'UNISEX', 'WOMENS', 'WOMEN', 'LADIES']) {
    if (s.startsWith(prefix) && s.length > prefix.length) { const rest = siteSize(s.slice(prefix.length)); if (rest && sizeFit(rest) === 'mens') return rest; }
  }
  return null;
}
