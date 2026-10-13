# 3DEEZI — Development Tasks

**Target:** Working MVP by end of October 2026  
**Project:** AI Sportswear Designer — Full product completion

---

## STAGE 1 — Complete User Journey

- [ ] **1.1** Homepage with existing navigation (CREATE, CONVERT, PROJECTS, APPROVED, ASSETS, DASHBOARD, DOWNLOADS, SUBSCRIPTIONS)
- [ ] **1.2** Sign-up page (email, password, confirm password, terms)
- [ ] **1.3** Login page (email, password, forgot password)
- [ ] **1.4** Auth integration (session management, protected routes)
- [ ] **1.5** Projects page — list saved designs, reopen, rename, delete
- [ ] **1.6** Downloads page — access completed artwork, export options
- [ ] **1.7** Full navigation flow: Sign in → Choose Sport → Choose Garment → Design → Save → Download

---

## STAGE 2 — Interactive Sports Selection (3D Carousel)

- [ ] **2.1** Replace static sports grid with rotating 3D carousel
- [ ] **2.2** Show 3 large sports centred, 2 visible on sides, remaining behind
- [ ] **2.3** Carousel rotation on click/swipe (desktop and mobile)
- [ ] **2.4** Selected sport advances to garment selection
- [ ] **2.5** Mobile-responsive carousel (touch swipe support)

---

## STAGE 3 — Functional 3D Design Studio

- [ ] **3.1** Realistic 3D garment models (jersey, shorts, full kit) — not cartoon-style
- [ ] **3.2** Full 360° garment rotation
- [ ] **3.3** Jersey / shorts / full-kit selector
- [ ] **3.4** Working colour wheel with eyedropper tool
- [ ] **3.5** Add logos to garment (upload, position, scale, rotate)
- [ ] **3.6** Add patterns to garment
- [ ] **3.7** Add names and numbers to garment
- [ ] **3.8** Preset designs library (designs change automatically per garment)
- [ ] **3.9** Clicking a preset applies it to the actual 3D garment
- [ ] **3.10** Save design from Studio
- [ ] **3.11** Export/download from Studio (no page navigation required)
- [ ] **3.12** Confirm supported file formats: SVG, PNG, JPG, PDF, print-ready PDF

---

## STAGE 4 — AI Powered Sportswear

- [ ] **4.1** Text prompt input — describe a design
- [ ] **4.2** AI generates design variations from prompt
- [ ] **4.3** User selects a variation
- [ ] **4.4** Selected design loads into 3D Studio for editing
- [ ] **4.5** Confirm AI generation method (API, model, local vs cloud)
- [ ] **4.6** Document which AI features are operational for MVP vs later

---

## STAGE 5 — 3DEEZI Artboard (Professional Vector Editor)

### 5a — Layout & UI
- [ ] **5.1** Top navigation bar: logo, ARTBOARD label, File/Edit/View/Layout/Object/Text/Effects/Bitmaps/Tools/Window/Help menus, Undo/Redo, Save, Export, Send to 3D Studio
- [ ] **5.2** Top properties toolbar (context-sensitive): Fill colour, Outline colour, Outline thickness, Line style, X/Y position, W/H dimensions, Rotation, Alignment, Group/Ungroup, Duplicate, Zoom %
- [ ] **5.3** Left toolbar — all tools permanently visible with custom 3DEEZI icons + text labels
- [ ] **5.4** Central white artboard with dark surrounding workspace, rulers (mm/cm/px/in), adjustable page size, multiple pages
- [ ] **5.5** Right panel — 4 tabs: COLOUR | PROPERTIES | LAYERS | ASSETS
- [ ] **5.6** Bottom horizontal colour palette (click to fill, apply to outline, add/remove custom colours)
- [ ] **5.7** Bottom status bar: page tabs, zoom controls, snap toggle, document measurements

### 5b — Left Toolbar Tools (all permanently visible)
- [ ] **5.8** Pick / Select tool
- [ ] **5.9** Shape / Node editing tool
- [ ] **5.10** Crop tool
- [ ] **5.11** Zoom / Pan tool
- [ ] **5.12** Freehand draw tool
- [ ] **5.13** 2-Point Line tool
- [ ] **5.14** Bézier tool
- [ ] **5.15** Pen tool
- [ ] **5.16** B-Spline tool
- [ ] **5.17** Polyline tool
- [ ] **5.18** 3-Point Curve tool
- [ ] **5.19** Rectangle / Shape tool
- [ ] **5.20** Ellipse tool
- [ ] **5.21** Polygon tool
- [ ] **5.22** Text tool
- [ ] **5.23** Dimension tool
- [ ] **5.24** Table tool
- [ ] **5.25** Image Import tool
- [ ] **5.26** Fill tool
- [ ] **5.27** Transparency tool (own visible icon)
- [ ] **5.28** Contour tool (own visible icon)
- [ ] **5.29** Blend tool
- [ ] **5.30** Distort tool
- [ ] **5.31** Envelope tool
- [ ] **5.32** Extrude tool
- [ ] **5.33** Shadow / Drop Shadow tool
- [ ] **5.34** Block Shadow tool
- [ ] **5.35** Interactive Fill tool
- [ ] **5.36** Mesh Fill tool
- [ ] **5.37** Eyedropper tool

### 5c — Core Vector Functionality
- [ ] **5.38** Freehand, Bézier and Pen tools create real editable vector paths
- [ ] **5.39** Node editing (add, delete, move nodes; Bézier handles)
- [ ] **5.40** Shape drawing (rectangle, ellipse, polygon) with handles
- [ ] **5.41** Text tool — editable text objects
- [ ] **5.42** Fill (solid, gradient, pattern)
- [ ] **5.43** Outline / stroke settings (width, style, colour, caps, corners)
- [ ] **5.44** Layers panel — create, delete, rename, lock, hide, reorder
- [ ] **5.45** Object selection, move, resize, rotate with handles
- [ ] **5.46** Undo / Redo history
- [ ] **5.47** Grid, guidelines, snap to objects/nodes/guidelines
- [ ] **5.48** Zoom and pan

### 5d — Effects (core set for MVP)
- [ ] **5.49** Transparency effect (percentage, type, blend mode)
- [ ] **5.50** Contour effect (inside, outside, centre; steps, offset, colour)
- [ ] **5.51** Drop Shadow / Shadow effect
- [ ] **5.52** Blend between objects

### 5e — Right Panel Tabs
- [ ] **5.53** COLOUR tab: colour wheel/picker, RGB/HEX/CMYK, solid/gradient/pattern, recent colours, saved palettes, eyedropper
- [ ] **5.54** PROPERTIES tab: context-sensitive settings per active tool (Transparency, Contour, Outline details)
- [ ] **5.55** LAYERS tab: full layer management UI
- [ ] **5.56** ASSETS tab: uploaded logos, saved artwork, templates, pattern library, AI-generated artwork

### 5f — File Import / Export
- [ ] **5.57** Import: SVG, PNG, JPG, PDF
- [ ] **5.58** Export: SVG, PNG, JPG, PDF, print-ready PDF
- [ ] **5.59** Preserve vector paths on import/export (do not flatten to raster)
- [ ] **5.60** Only advertise formats after import/export is tested and confirmed

### 5g — Send to 3D Studio Integration
- [ ] **5.61** SEND TO 3D STUDIO button (top-right, prominent)
- [ ] **5.62** Save current artwork on click
- [ ] **5.63** User selects garment or existing project
- [ ] **5.64** Artwork transferred into 3D Studio
- [ ] **5.65** User can position, scale, rotate artwork on garment
- [ ] **5.66** Original editable vector preserved
- [ ] **5.67** Return to Artboard to make changes
- [ ] **5.68** Garment artwork updates after Artboard changes saved

---

## STAGE 6 — Save, Download and Export

- [ ] **6.1** Save designs to user account (cloud persistence)
- [ ] **6.2** Reopen saved designs
- [ ] **6.3** Download completed artwork (PNG, SVG, PDF, print-ready PDF)
- [ ] **6.4** Export available directly within Studio and Artboard (no extra navigation)
- [ ] **6.5** Confirm supported MVP formats

---

## STAGE 7 — Subscriptions and Accounts

- [ ] **7.1** Subscription plan definitions (tiers, features per tier)
- [ ] **7.2** Payment integration (Stripe or equivalent)
- [ ] **7.3** User account with subscription status
- [ ] **7.4** Subscription management page (upgrade, cancel, billing history)
- [ ] **7.5** Feature gating based on subscription tier
- [ ] **7.6** Mobile-responsive across all pages
- [ ] **7.7** iOS build (confirm App Store requirements and submission checklist)

---

## STAGE 8 — Design & Visual Identity

- [ ] **8.1** Apply 3DEEZI design system throughout: near-black/dark navy frame, cyan highlights, blue-to-purple gradients, silver/white typography
- [ ] **8.2** Custom 3DEEZI tool icons for Artboard (do not copy CorelDRAW icons)
- [ ] **8.3** Artboard drawing canvas: clean white, no heavy neon effects inside canvas
- [ ] **8.4** Professional UI feel — no oversized buttons, no unnecessary animation, no cluttered panels

---

## STATUS REPORT REQUIRED

Before proceeding, confirm:

- [ ] Working demo link for current app
- [ ] List of features already completed and fully functional
- [ ] List of features still in development
- [ ] Development timeline with milestones through end of October 2026
- [ ] MVP feature set confirmed (in scope) vs post-MVP (later)
- [ ] Confirmation app supports real 3D editing (not static garment images)
- [ ] Remaining payment milestones and deliverables per milestone

---

## RULES

1. Do not remove or break existing 3DEEZI pages, navigation, projects or 3D Studio functionality.
2. Do not redesign approved sections without client discussion.
3. Build Artboard core tools first (selection, vector drawing, shapes, text, fills, outlines, layers, SVG save) before advanced effects.
4. Advanced Artboard effects (Blend, Distort, Envelope, Extrude, Mesh Fill) can follow in later stages.
5. Do not advertise import/export formats until they are tested.
