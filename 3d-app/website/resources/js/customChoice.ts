/**
 * "Custom…" in the Sport and Garment pickers (client 2026-11-02, images/293.jpg: artwork for caps could only be put on
 * the listed garments). The typed name is kept as the sport's or the product's name; the 3D kit uses our nearest garment.
 * The apps do the same (lib/custom_choice.dart).
 */
export const CUSTOM = '__custom';
export const CUSTOM_MAX = 40;
export const CUSTOM_PLACEHOLDER = 'e.g. Cap, Lacrosse, Bowling shirt';

/** What may be typed: plain text, no tags or control characters, up to 40 characters (the server checks the same). */
export const typedName = (text: string) => text.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '').slice(0, CUSTOM_MAX);
/** The typed name as it is kept (trimmed). */
export const customName = (text: string | null | undefined) => typedName(text ?? '').trim();

/** A typed garment's nearest 3D garment, by its words (first match wins); null when no word matches. */
const NEAREST: [RegExp, string][] = [
  [/\bbucket/, 'bucket-hat'],
  [/\b(caps?|hats?|beanies?|snapbacks?|visors?|truckers?)\b/, 'cap'],
  [/\bsocks?\b/, 'socks'],
  [/\b(skirts?|skorts?)\b/, 'skirt'],
  [/\bdress(es)?\b/, 'netball-dress'],
  [/\bpolos?\b/, 'polo'],
  [/\bhood/, 'hoodie'],
  [/\bjackets?\b/, 'trackjacket'],
  [/\b(singlets?|vests?|tanks?)\b/, 'singlet'],
  [/\b(tees?|t-?shirts?)\b/, 'tee'],
  [/\bshorts?\b/, 'shorts'],
];
export function garmentInText(text: string): string | null {
  const t = text.toLowerCase();
  return NEAREST.find(([re]) => re.test(t))?.[1] ?? null;
}
/** The 3D garment for a typed garment name: the nearest one we have (of `allowed`, when given), else the jersey. */
export function nearestGarment(text: string, allowed?: string[]): string {
  const id = garmentInText(text);
  return id && (!allowed || allowed.includes(id)) ? id : 'jersey';
}
/** The order form's row for a typed garment (Order::GARMENTS): its nearest garment there, else "Other". */
export function nearestOrderGarment(text: string): string {
  const id = garmentInText(text);
  return ({ trackjacket: 'jacket', cap: 'cap', socks: 'socks', polo: 'polo', hoodie: 'hoodie', singlet: 'singlet', tee: 'tee', shorts: 'shorts' } as Record<string, string>)[id ?? ''] ?? 'other';
}
/** The sport a typed sport is saved under (projects keep a catalogue id): Training, else the first sport. */
export const customSportId = (sports: { id: string }[]) => (sports.some(s => s.id === 'training') ? 'training' : sports[0]?.id ?? 'training');
