# Artboard: CorelDRAW 2026 tool comparison

The Artboard (`website/artboard`, built to `public/media/artboard/index.html`
and `assets/artboard/index.html` for the apps) follows the CorelDRAW 2026
toolbox. Everything drawn is vector: shapes and text convert to curves
(Ctrl+Q) and every curve has editable nodes with the Shape tool (F10).

Build: `cd website/artboard && npm install && node build.mjs`.

## Toolbox (same groups and order as CorelDRAW)

| CorelDRAW group | Artboard tools |
| --- | --- |
| Pick | Pick (V) |
| Shape edit | Shape (F10), Smooth, Roughen, Attract, Repel |
| Crop | Crop (vectors and images), Knife, Eraser (X) |
| Zoom | Zoom (Z), Pan (H) |
| Curve | Freehand (F5), 2-Point Line, Bézier, Pen, B-Spline, Polyline, 3-Point Curve |
| Smart | Smart Fill |
| Rectangle / Ellipse | Rectangle (F6, corner radius), Ellipse (F7) |
| Object | Polygon (Y), Star (S), Complex Star, Graph Paper (D), Spiral (A) |
| Basic shapes | Basic, Arrow, Banner and Callout shapes, plus Sport badges (shield, crest, seal, …) |
| Text | Text (F8): 19 embedded fonts, fit text to path, straighten text |
| Dimension | Parallel dimension, Horizontal/vertical dimension |
| Interactive | Blend, Contour, Drop Shadow, Transparency (uniform, linear fade) |
| Eyedropper | Color eyedropper (I), Attributes eyedropper |
| Fill | Interactive fill (G): uniform, linear and radial gradients |

## Shape tool (nodes)
Drag nodes, Bézier handles or segments; double-click a curve to add a node or
a node to delete it; marquee and Shift+click selection; arrow keys nudge.
Property bar: Add / Delete node, Join two nodes, Break curve, Extend curve to
close, Close curve, Convert to line / curve, Cusp / Smooth / Symmetrical,
Reverse direction, Extract subpath, Select all nodes.

## Object menu
Group / Ungroup (Ctrl+G / Ctrl+U), Combine (Ctrl+L), Break apart (Ctrl+K),
Convert to curves (Ctrl+Q), Convert outline to object (Ctrl+Shift+Q),
Shaping (Weld, Trim, Intersect, Simplify, Front minus back, Back minus front),
Align and distribute (L R T B E C P), Order (Shift/Ctrl + PgUp/PgDn),
PowerClip (place inside frame, extract contents), mirror, lock.

## Files
Import SVG as editable vectors (Ctrl+I), PNG/JPG as images. Export vector PDF
(Ctrl+E) and SVG with text as curves (print-ready, opens in CorelDRAW and
Illustrator), transparent PNG, or the page as a 300 DPI PNG.

## Not included (yet)
Table, connector lines, mesh fill, envelope, extrude, distort, artistic
media brushes, Smart Drawing, Virtual Segment Delete, Smear and Twirl,
PowerTRACE (bitmap to vector), native .CDR files (use PDF or SVG).
