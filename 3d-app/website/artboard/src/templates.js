// Built-in starter templates (File > New from template): simple kit layouts to start a design from. Each is an
// Artboard design (page size in mm, objects as the Artboard saves them); everything in it stays editable.
const MM = 2; // world units per millimetre, as in main.js
const mm = (v) => Math.round(v * MM * 100) / 100;
const INK = '#0B1520', CYAN = '#12E1F0', BLUE = '#1E7BFF', WHITE = '#FFFFFF';

/** Text centred on (x, y) mm, `size` mm high. */
const text = (t, x, y, size, o = {}) => ({
  type: 'IText', text: t, left: mm(x), top: mm(y), originX: 'center', originY: 'center',
  fontFamily: 'Rajdhani', fontWeight: 700, fontStyle: 'normal', fontSize: mm(size), fill: INK, textAlign: 'center',
  toolName: 'Text', ...o,
});
/** A closed curve through points in mm: [[x, y], …], or path commands with numbers in mm. */
const curve = (cmds, o = {}) => ({
  type: 'Path', path: cmds.map(([c, ...n]) => [c, ...n.map(mm)]), fill: INK, stroke: null, strokeWidth: 0,
  strokeUniform: true, toolName: 'Curve', ...o,
});
const poly = (pts, o) => curve([...pts.map(([x, y], i) => [i ? 'L' : 'M', x, y]), ['Z']], o);
/** An ellipse centred on (x, y) mm. */
const ellipse = (x, y, r, o = {}) => ({
  type: 'Ellipse', left: mm(x), top: mm(y), originX: 'center', originY: 'center', rx: mm(r), ry: mm(r),
  fill: INK, stroke: null, strokeWidth: 0, strokeUniform: true, toolName: 'Ellipse', ...o,
});
/** A five-point star centred on (x, y) mm. */
function star(x, y, outer, inner, o) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? inner : outer;
    pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
  }
  return poly(pts, { toolName: 'Star', ...o });
}

export const TEMPLATES = [
  {
    id: 'crest', name: 'Front chest crest', note: 'Shield with the club name · 120 x 120 mm', page: [120, 120],
    objects: [
      curve([['M', 14, 8], ['L', 106, 8], ['L', 106, 54], ['C', 106, 84, 84, 102, 60, 114], ['C', 36, 102, 14, 84, 14, 54], ['Z']], { name: 'Shield' }),
      curve([['M', 20, 14], ['L', 100, 14], ['L', 100, 54], ['C', 100, 80, 81, 96, 60, 107], ['C', 39, 96, 20, 80, 20, 54], ['Z']], { fill: BLUE, name: 'Shield inside' }),
      text('EST. 2026', 60, 25, 6, { fontFamily: 'Inter', fill: WHITE, charSpacing: 250, name: 'Year' }),
      text('LIONS', 60, 50, 30, { fontFamily: 'Bebas Neue', fontWeight: 400, fill: WHITE, charSpacing: 40, name: 'Club name' }),
      text('FC', 60, 80, 22, { fontFamily: 'Anton', fontWeight: 400, fill: CYAN, name: 'Club initials' }),
    ],
  },
  {
    id: 'back', name: 'Back name and number', note: 'Player name over a big outlined number · 300 x 360 mm', page: [300, 360],
    objects: [
      text('SMITH', 150, 58, 46, { fontFamily: 'Oswald', fontWeight: 700, charSpacing: 120, name: 'Player name' }),
      // Two outlines behind the number (white next to it, dark around that): it stays editable text.
      text('23', 150, 212, 220, {
        fontFamily: 'Bebas Neue', fontWeight: 400, fill: BLUE, name: 'Player number',
        textOutlines: [{ w: 3, c: WHITE }, { w: 4, c: INK }], stroke: null, strokeWidth: 2 * 7 * MM, strokeUniform: false,
      }),
    ],
  },
  {
    id: 'sponsor', name: 'Sponsor band', note: 'A slanted band with the sponsor name · 300 x 90 mm', page: [300, 90],
    objects: [
      poly([[16, 12], [296, 12], [284, 72], [4, 72]], { name: 'Band' }),
      poly([[10, 78], [290, 78], [288.6, 84], [8.6, 84]], { fill: CYAN, name: 'Accent stripe' }),
      text('YOUR SPONSOR', 150, 42, 26, { fontFamily: 'Russo One', fontWeight: 400, fill: WHITE, charSpacing: 60, name: 'Sponsor' }),
    ],
  },
  {
    id: 'badge', name: 'Round sleeve badge', note: 'A round badge with a star, the team and the year · 100 x 100 mm', page: [100, 100],
    objects: [
      ellipse(50, 50, 46, { name: 'Badge' }),
      ellipse(50, 50, 39, { fill: null, stroke: CYAN, strokeWidth: mm(2), name: 'Ring' }),
      star(50, 30, 8, 3.4, { fill: CYAN, name: 'Star' }),
      text('TEAM', 50, 54, 20, { fill: WHITE, charSpacing: 80, name: 'Team name' }),
      text('2026', 50, 71, 7, { fontFamily: 'Inter', fill: CYAN, charSpacing: 300, name: 'Year' }),
    ],
  },
];

/** A template as an Artboard design (the JSON the Artboard opens). */
export const templateJson = (t) => JSON.stringify({ page: t.page, guides: [], objects: t.objects });
