// Artboard typefaces: open-licence Google Fonts trimmed to Latin, embedded by
// build.mjs and registered with the FontFace API. The same files feed
// opentype.js, so "Convert to curves" outlines match what the canvas draws.
// faces: [file, weight range]. Ranges cover 1-1000 so the browser never
// synthesises a fake bold. `bold`: has a real bold weight.
export const FONTS = [
  { family: 'Rajdhani', group: 'Sport & block', faces: [['Rajdhani-SemiBold.ttf', '1 650'], ['Rajdhani-Bold.ttf', '651 1000']] },
  { family: 'Bebas Neue', group: 'Sport & block', faces: [['BebasNeue-Regular.ttf']] },
  { family: 'Anton', group: 'Sport & block', faces: [['Anton-Regular.ttf']] },
  { family: 'Oswald', group: 'Sport & block', faces: [['Oswald-400.ttf', '1 550'], ['Oswald-700.ttf', '551 1000']] },
  { family: 'Teko', group: 'Sport & block', faces: [['Teko-400.ttf', '1 550'], ['Teko-700.ttf', '551 1000']] },
  { family: 'Staatliches', group: 'Sport & block', faces: [['Staatliches-Regular.ttf']] },
  { family: 'Jersey 10', group: 'Sport & block', faces: [['Jersey10-Regular.ttf']] },
  { family: 'Kanit Italic', group: 'Sport & block', faces: [['Kanit-BoldItalic.ttf']] },
  { family: 'Racing Sans One', group: 'Sport & block', faces: [['RacingSansOne-Regular.ttf']] },
  { family: 'Graduate', group: 'Varsity & slab', faces: [['Graduate-Regular.ttf']] },
  { family: 'Alfa Slab One', group: 'Varsity & slab', faces: [['AlfaSlabOne-Regular.ttf']] },
  { family: 'Black Ops One', group: 'Varsity & slab', faces: [['BlackOpsOne-Regular.ttf']] },
  { family: 'Bungee', group: 'Varsity & slab', faces: [['Bungee-Regular.ttf']] },
  { family: 'Russo One', group: 'Tech', faces: [['RussoOne-Regular.ttf']] },
  { family: 'Orbitron', group: 'Tech', faces: [['Orbitron-400.ttf', '1 550'], ['Orbitron-700.ttf', '551 800'], ['Orbitron-900.ttf', '801 1000']] },
  { family: 'Audiowide', group: 'Tech', faces: [['Audiowide-Regular.ttf']] },
  { family: 'Permanent Marker', group: 'Script & marker', faces: [['PermanentMarker-Regular.ttf']] },
  { family: 'Pacifico', group: 'Script & marker', faces: [['Pacifico-Regular.ttf']] },
  { family: 'Inter', group: 'Clean', faces: [['Inter-400.ttf', '1 550'], ['Inter-700.ttf', '551 1000']] },
];
for (const f of FONTS) f.bold = f.faces.length > 1;

/** The face file the browser uses for a weight (the ranges above never overlap). */
export function faceFor(family, weight = 400, style = 'normal') {
  const font = FONTS.find((f) => f.family === family);
  if (!font) return null;
  const w = Number(weight) || 400, list = style === 'italic' && font.italics?.length ? font.italics : font.faces;
  const hit = list.find(([, range = '1 1000']) => { const [a, b] = range.split(' ').map(Number); return w >= a && w <= b; });
  return (hit ?? list[0])[0];
}
/** Uploaded fonts can have real italic files (the built-in fonts slant their upright letters). */
export const hasItalicFace = (family) => !!FONTS.find((f) => f.family === family)?.italics?.length;
