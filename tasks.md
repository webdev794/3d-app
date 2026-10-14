# 3DEEZI — Development Tasks

**Target:** Working MVP by end of October 2026  
**Project:** AI Sportswear Designer — Full product completion

> **Status 2026-10-14:** working on branch `v2` (v1.7.3). Ticked = verified done on the original codebase (audit 2026-10-13). Everything else is open — verify each item against the current `v2` code before ticking.

---

## START HERE

**Branch:** work continues on `v3` = `v2` (v1.7.3, CorelDRAW-style Artboard built from `website/artboard/src`) + the 2026-10-14 work (old `v3` deleted and replaced 2026-10-14). `v2` itself is unchanged.

**Still to build in `v2` (batches, each tested before the next):**
- [x] Artboard effects and tools: Distort, Envelope, Extrude, Block Shadow, Mesh Fill, Table (5.24, 5.30–5.32, 5.34, 5.36)
- [ ] Pages and palette: multiple pages + page tabs, mm/cm/px/in units, bottom colour palette (5.4, 5.6, 5.7) — palette and units done 2026-10-14; multiple pages + page tabs next
- [ ] Menus and files: Bitmaps / Tools / Window menus, JPG export, PDF / AI import, transparency blend modes, Pen sharp corners (5.1, 5.57, 5.58, 5.74, 5.80)
- [ ] 3D Studio round-trip: project picker on Send to 3D Studio, editable vector kept on placed artwork, Edit in Artboard, update in place (5.59, 5.62, 5.63, 5.66–5.68)
- [ ] Studio PDF design-sheet export (3.12, 6.5)
- [x] Bug fixes: project save "Unexpected token '<'"; "selected garment is invalid" — done on v2 2026-10-14
- [x] CorelDRAW (.cdr) import route + server conversion — built on v2 2026-10-14 (hosting converter still needed, 5.69)

**Also:** check the remaining v1.7.3 items (5.2, 5.18, 5.23, 5.35, 5.50, 5.52, 5.85–5.98) in the browser and tick what works.

**Hosting (live demo) config needed:** `post_max_size=64M`, `upload_max_filesize=32M`, `display_errors=Off` (else large saves fail); a converter for CorelDRAW/PDF import (CloudConvert API key, or LibreOffice on a VPS).

**Open decisions for client:** converter choice above. (Left toolbar: all 25 tools fit at 1366×768 and up.)

**Artboard libraries (in `website/artboard/package.json`):** paper.js (shapes and booleans), opentype.js (text to curves), jsPDF + svg2pdf (PDF), imagetracerjs (bitmap trace). Install on this machine needs the curl cache workaround (npm's own TLS fails here).

---

## STAGE 1 — Complete User Journey

- [x] **1.1** Homepage with existing navigation (CREATE, CONVERT, PROJECTS, APPROVED, ASSETS, DASHBOARD, DOWNLOADS, SUBSCRIPTIONS)
- [x] **1.2** Sign-up page (email, password, confirm password, terms)
- [x] **1.3** Login page (email, password, forgot password)
- [x] **1.4** Auth integration (session management, protected routes)
- [x] **1.5** Projects page — list saved designs, reopen, rename, delete
- [x] **1.6** Downloads page — access completed artwork, export options
- [x] **1.7** Full navigation flow: Sign in → Choose Sport → Choose Garment → Design → Save → Download

---

## STAGE 2 — Interactive Sports Selection (3D Carousel)

- [x] **2.1** Replace static sports grid with rotating 3D carousel
- [x] **2.2** Show 3 large sports centred, 2 visible on sides, remaining behind
- [x] **2.3** Carousel rotation on click/swipe (desktop and mobile)
- [x] **2.4** Selected sport advances to garment selection
- [x] **2.5** Mobile-responsive carousel (touch swipe support)

---

## STAGE 3 — Functional 3D Design Studio

- [x] **3.1** Realistic 3D garment models (jersey, shorts, full kit)
- [x] **3.2** Full 360° garment rotation
- [x] **3.3** Jersey / shorts / full-kit selector
- [x] **3.4** Working colour wheel with eyedropper tool
- [x] **3.5** Add logos to garment (upload, position, scale, rotate)
- [x] **3.6** Add patterns to garment
- [x] **3.7** Add names and numbers to garment
- [x] **3.8** Preset designs library (designs change automatically per garment)
- [x] **3.9** Clicking a preset applies it to the actual 3D garment
- [x] **3.10** Save design from Studio
- [x] **3.11** Export/download from Studio (no page navigation required)
- [ ] **3.12** Confirm supported file formats — PNG/JSON working; PDF pending

---

## STAGE 4 — AI Powered Sportswear

- [x] **4.1** Text prompt input — describe a design
- [x] **4.2** AI generates design variations from prompt
- [x] **4.3** User selects a variation
- [x] **4.4** Selected design loads into 3D Studio for editing
- [x] **4.5** Confirm AI generation method (API, model, local vs cloud)
- [x] **4.6** Document which AI features are operational for MVP vs later

---

## STAGE 5 — 3DEEZI Artboard (Professional Vector Editor)

### 5a — Layout & UI
- [ ] **5.1** Top navigation bar: File/Edit/View/Layout/Object/Text/Effects/Bitmaps/Tools/Window/Help menus, Undo/Redo, Save, Export, Send to 3D Studio
- [ ] **5.2** Top properties toolbar (context-sensitive)
- [x] **5.3** Left toolbar — all tools permanently visible with icons + text labels, in sections (Select / Draw / Shapes & text / Effects); fits without scrolling at 1366×768 and up — done on v2 2026-10-14; Table, Distort, Envelope, Extrude, Block Shadow, Mesh Fill buttons added (rows shrink to fit, all 25 tools visible)
- [x] **5.4a** Page sizes A2 / A3 / A4 (portrait + landscape) — verified on v2 2026-10-14
- [ ] **5.4** Central artboard — multiple pages, mm/cm/px/in units — units done on v2 2026-10-14 (status bar: mm / cm / inches / pixels at 300 DPI for rulers, X Y W H, page size, dimensions); multiple pages still to do
- [x] **5.5** Right panel — 4 tabs: COLOUR | PROPERTIES | LAYERS | ASSETS
- [x] **5.6** Bottom horizontal colour palette — done on v2 2026-10-14 (click fill, right-click outline, X none, drag onto objects, Document colours)
- [ ] **5.7** Bottom status bar: page tabs, zoom controls, snap toggle, document measurements

### 5b — Left Toolbar Tools
- [x] **5.8** Pick / Select tool
- [x] **5.9** Shape / Node editing tool
- [x] **5.10** Crop tool
- [x] **5.11** Zoom / Pan tool
- [x] **5.12** Freehand draw tool
- [x] **5.13** 2-Point Line tool
- [x] **5.14** Bézier tool
- [x] **5.15** Pen tool
- [x] **5.16** B-Spline tool — verified on v2 2026-10-14
- [x] **5.17** Polyline tool
- [ ] **5.18** 3-Point Curve tool
- [x] **5.19** Rectangle / Shape tool
- [x] **5.20** Ellipse tool
- [x] **5.21** Polygon tool
- [x] **5.22** Text tool
- [ ] **5.23** Dimension tool
- [x] **5.24** Table tool
- [x] **5.25** Image Import tool
- [x] **5.26** Fill tool
- [x] **5.27** Transparency tool (own visible icon) — verified on v2 2026-10-14
- [x] **5.28** Contour tool (own visible icon) — verified on v2 2026-10-14
- [ ] **5.29** Blend tool — own visible button on v2 2026-10-14; blend effect itself not yet browser-tested
- [x] **5.30** Distort tool
- [x] **5.31** Envelope tool
- [x] **5.32** Extrude tool
- [x] **5.33** Shadow / Drop Shadow tool — own visible button, applies a shadow — verified on v2 2026-10-14
- [x] **5.34** Block Shadow tool
- [ ] **5.35** Interactive Fill tool
- [x] **5.36** Mesh Fill tool
- [x] **5.37** Eyedropper tool

### 5c — Core Vector Functionality
- [x] **5.38** Freehand, Bézier and Pen tools create real editable vector paths
- [x] **5.39** Node editing (move nodes; Bézier handles)
- [x] **5.40** Shape drawing (rectangle, ellipse, polygon) with handles
- [x] **5.41** Text tool — editable text objects
- [x] **5.42** Fill — solid and gradient (pattern fills open: see 5.83)
- [x] **5.43** Outline / stroke settings (width, style, colour)
- [x] **5.44** Layers panel — create, delete, rename, lock, hide, reorder
- [x] **5.45** Object selection, move, resize, rotate with handles
- [x] **5.46** Undo / Redo history
- [x] **5.47** Grid + snap-to-grid (guidelines and object/node snapping: see 5.77)
- [x] **5.48** Zoom and pan

### 5d — Effects
- [ ] **5.49** Transparency effect (percentage, type, blend mode)
- [ ] **5.50** Contour effect (inside, outside, centre; steps, offset, colour; break apart)
- [x] **5.51** Drop Shadow / Shadow effect — applies from its toolbar button — verified on v2 2026-10-14
- [ ] **5.52** Blend between objects

### 5e — Right Panel Tabs
- [x] **5.53** COLOUR tab: picker, values, solids/gradients, recent colours
- [x] **5.54** PROPERTIES tab: context-sensitive settings per active tool
- [x] **5.55** LAYERS tab: full layer management UI
- [x] **5.56** ASSETS tab: user's uploaded logos/artwork loaded from library

### 5f — File Import / Export
- [ ] **5.57** Import: SVG, PNG, JPG, PDF (AI/EPS where possible)
- [ ] **5.58** Export: SVG, PNG, JPG, PDF, print-ready PDF
- [ ] **5.59** Preserve editable vector source end-to-end
- [ ] **5.60** Only advertise formats after import/export is tested and confirmed
- [ ] **5.69** CorelDRAW (.cdr) import — built on v2 2026-10-14 (File > Import → server converts → editable vectors; tested with a mocked converter). Still open: set up a converter on the hosting and test a real CorelDRAW 2026 file

### 5g — Send to 3D Studio Integration
- [x] **5.61** SEND TO 3D STUDIO button (top-right, prominent)
- [ ] **5.62** Save current artwork on click
- [ ] **5.63** User selects garment or existing project
- [x] **5.64** Artwork transferred into 3D Studio (added as artwork layer)
- [x] **5.65** User can position, scale, rotate artwork on garment (drag-to-kit)
- [ ] **5.66** Original editable vector preserved
- [ ] **5.67** Return to Artboard to make changes
- [ ] **5.68** Garment artwork updates after Artboard changes saved

### 5h — Additions from feature review
- [x] **5.70** Eraser tool — verified on v2 2026-10-14 (erases vectors)
- [x] **5.71** Image filters — brightness, contrast, saturation, blur, grayscale — built + verified on v2 2026-10-14
- [x] **5.72** Background removal inside the Artboard — built + verified on v2 2026-10-14
- [x] **5.73** Convert text to curves — verified on v2 2026-10-14
- [ ] **5.74** Pen sharp corner nodes

### 5i — CorelDRAW parity gaps
- [x] **5.75** Shaping: Weld / Trim / Intersect — verified on v2 2026-10-14
- [x] **5.76** PowerClip — verified on v2 2026-10-14
- [x] **5.77** Guidelines from rulers + snap to objects, nodes and guidelines — built + verified on v2 2026-10-14 (node-drag snapping built, not yet browser-tested)
- [x] **5.78** Distribute objects — verified on v2 2026-10-14
- [x] **5.79** Outline corner and cap settings — plus width, style, colour in the Outline pen card — verified on v2 2026-10-14
- [ ] **5.80** Transparency types: gradient transparency, direction, blend modes
- [x] **5.81** RGB and CMYK values in the Colour tab — built + verified on v2 2026-10-14 (CMYK is a plain conversion, no print profile)
- [x] **5.82** Bitmap trace (image → vector) — built + verified on v2 2026-10-14
- [x] **5.83** Pattern fills — built + verified on v2 2026-10-14

### 5j — Requirements from user testing 2026-10-13 (verify each on the v2 editor)
- [x] **5.84** Everything drawn on the Artboard is vector and node-editable — verified on v2 2026-10-14 (shapes convert to paths on Shape tool; curves are paths)
- [ ] **5.85** No two drawing tools behave the same — Pen (writes smooth strokes, can close shapes), Bézier (drag-out handles), B-Spline (curve follows control points), Polyline (straight)
- [ ] **5.86** 2-Point Line works by click start + click end (as well as drag)
- [ ] **5.87** Clicking another tool or menu button stops the previous tool (e.g. Pen must not keep drawing); clicking the active tool again returns to Select
- [ ] **5.88** Clicking an effect tool opens Properties scrolled to that tool's settings, even before an object is selected
- [ ] **5.89** Crop shows "works on images only" when there is no image; no need to pre-select the image
- [ ] **5.90** Zoom keeps the page centred when zoomed out; easy re-centre (Fit button); page never drifts off screen
- [ ] **5.91** Artboard logo returns to the 3DEEZI home page
- [ ] **5.92** Colour palette / colour panel recolour grouped and contoured objects (e.g. contoured text)
- [ ] **5.93** Effects re-apply cleanly (no stacked copies when changing contour offset); remove restores the original
- [ ] **5.94** SVG export contains only the artwork (no dark workspace background), centred
- [ ] **5.95** Blend stays between the two objects (no stray shapes outside the page)
- [ ] **5.96** Shapes stay selectable after reload (e.g. polygon)
- [ ] **5.97** Undo/redo state survives a reload
- [ ] **5.98** Transparency control shows transparency % (0% = solid), not opacity

---

## STAGE 6 — Save, Download and Export

- [x] **6.1** Save designs to user account (local + cloud sync with versioning)
- [x] **6.2** Reopen saved designs
- [x] **6.3** Download completed artwork — PNG mockups, front/back, hi-res, social image, design pack; PDF pending
- [x] **6.4** Export available directly within Studio and Artboard (no extra navigation)
- [ ] **6.5** Confirm supported MVP formats (final confirmation incl. PDF)

---

## STAGE 7 — Subscriptions and Accounts

- [ ] **7.1** Subscription plan definitions — proposed tier structure on Pricing page, awaiting approval
- [ ] **7.2** Payment integration (Stripe or equivalent)
- [ ] **7.3** User account with subscription status
- [ ] **7.4** Subscription management page (upgrade, cancel, billing history)
- [ ] **7.5** Feature gating based on subscription tier
- [x] **7.6** Mobile-responsive across all pages
- [ ] **7.7** iOS build (confirm App Store requirements and submission checklist)

---

## STAGE 8 — Design & Visual Identity

- [x] **8.1** 3DEEZI design system applied: near-black/dark navy frame, cyan highlights, gradients, silver/white typography
- [x] **8.2** Custom 3DEEZI tool icons for Artboard — every toolbar tool has an original icon (v2 icon set) — verified 2026-10-14
- [x] **8.3** Artboard drawing canvas: clean white, no heavy neon effects inside canvas
- [ ] **8.4** Professional UI polish review

---

## STATUS REPORT REQUIRED

- [x] Working demo link — https://testcaresortwork.co.in/3deez/ (admin: /admin)
- [x] List of features already completed and fully functional
- [x] List of features still in development
- [x] Development timeline with milestones through end of October 2026
- [x] MVP feature set confirmed (in scope) vs post-MVP (later)
- [x] Confirmation app supports real 3D editing (Three.js, not static images)
- [ ] Remaining payment milestones and deliverables per milestone — commercial, to be confirmed by project owner

---

## RULES

1. Do not remove or break existing 3DEEZI pages, navigation, projects or 3D Studio functionality.
2. Do not redesign approved sections without client discussion.
3. Build Artboard core tools first (selection, vector drawing, shapes, text, fills, outlines, layers, SVG save) before advanced effects.
4. Advanced Artboard effects (Blend, Distort, Envelope, Extrude, Mesh Fill) can follow in later stages.
5. Do not advertise import/export formats until they are tested.
6. Only tick a task after verifying it in the current branch's code.
