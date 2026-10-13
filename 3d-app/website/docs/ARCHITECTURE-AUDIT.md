# 3DEEZI — Architecture audit and implementation plan

Audit date: 7 October 2026. No application code was changed for this audit.

## Which codebase this covers

Four 3DEEZI codebases exist on this machine:

| Location | Stack | State | Role going forward |
|---|---|---|---|
| `3d-app/` (root) | Flutter mobile app + vanilla Three.js viewer (`viewer/`) | Most complete user flow (14 screens), OpenAI integrated client-side, procedural 3D garments | Mobile client; should call the Laravel API |
| `3d-app/website/` | Laravel 12 + React 19 (TypeScript, Vite) | Created 6–7 Oct; auth, projects, versions, assets, export; embeds a fork of the Flutter viewer | **Base for this plan** |
| `3d-sportswear/` | Laravel 12 + React 19 + React Three Fiber/Drei | 23 Sep – 5 Oct; richer customisation model, optional GLB loading, Claude-based concepts, orders/admin | Source of reusable ideas, not the base |
| `3deezi-sportswear/` | Laravel + React + R3F | 23 Sep; earlier version of the above | Archive |

`3d-app/website` is treated as "the existing React + Laravel application": it is the newest, it shares the mobile renderer, and its API is designed for both web and mobile. **None of the four directories is under version control** (no `.git`), which should be fixed before any restructuring.

---

## A. Current architecture (`3d-app/website`)

```
Browser ── React 19 SPA (resources/js) ──fetch──▶ Laravel 12 API (/api/v1, Sanctum tokens)
   │                                                   │
   └─ <iframe> /media/viewer/index.html                ├─ SQLite (default) / MySQL
        vanilla Three.js r186 bundle                   ├─ storage/app (private uploads)
        (fork of 3d-app/viewer, postMessage bridge)    └─ config/catalog.php (sports, garments, provider)
```

- **Routing:** `routes/web.php` serves the SPA for every non-API path; `routes/api.php` has 19 versioned routes under `/api/v1`.
- **Auth:** Laravel Sanctum personal access tokens; register, login, me, update profile, logout. Throttled auth, upload and concept routes.
- **Database** (`2026_10_06_000001_create_studio_tables.php`):
  - `users`
  - `personal_access_tokens`
  - `projects` (name, sport, garment, mode `ai|dyo`, status `draft|approved`, `design` JSON, version)
  - `project_versions` (snapshot per save)
  - `assets` (type `logo|pattern|artwork|reference`, private path, mime, size)
- **Design model** (validated in `ProjectRequest`): flat object of `garment, main, secondary, accent, pattern (Solid|Stripes|Chevron|Velocity), logoText, number, backName, patternImage, logoImage, patternColor, patternScale, patternBody, prompt`. Images are data URLs or same-origin URLs.
- **Frontend:** `App.tsx` (shell, auth modal, draft in sessionStorage), `pages/Create.tsx` (AI designer, sport, garment), `pages/Studio.tsx` (tools: colours, patterns, logos, text, garment; undo/redo; save; export), `pages/Library.tsx` (projects, assets, dashboard, profile), `components/KitViewer.tsx` (iframe + postMessage bridge, capture queue).
- **3D:** `website/viewer/src` is a modified fork of `3d-app/viewer/src`. It adds `studio.js` (reflective floor, soft shadows, fog, light rigs). Garments are **procedural**: front and back panels inflated from 2D outlines (jersey, tee, polo, singlet, shorts, full kit), with a painted canvas texture (front half / back half). **No GLB/GLTF loading.**
- **AI:** none. `ConceptController` is a deterministic keyword/palette generator that returns four presets. `config('catalog.provider')` honestly labels it "Procedural design preview, `is_ai: false`". Reference images are accepted but not analysed.
- **Showcase imagery:** one static hero generated offline (`public/media/campaign/jersey-cinematic.png`, prompt in `docs/VISUAL-ASSETS.md`).

## B. What is already implemented and working

Verified on 7 Oct: `php artisan test` gives **13 passing tests (103 assertions)**, and a frontend build exists (`public/build/manifest.json`).

| Area | Status |
|---|---|
| Account register / login / profile / logout (token) | Working, tested |
| Project CRUD, optimistic locking (`expected_version`), automatic version snapshots, version list | Working, tested |
| Ownership and access control on projects and assets | Working, tested |
| Private asset upload (PNG/JPEG/WebP, 10 MB, type-tagged), streamed download, delete | Working, tested |
| Export JSON spec and escaped SVG illustration | Working, tested |
| Catalog of 8 sports × 6 garments | Working |
| Studio: colours, 4 pattern presets, AI-style pattern tile, chest logo, wordmark, name, number, garment switch, undo/redo, front/back/side, PNG capture | Working, on procedural garments |
| Concept step (4 concepts) | Working, but **not AI** |

Also worth reusing:

- **`3d-app` (Flutter + viewer):**
  - OpenAI client code: concept specs with JSON schema, seamless black-and-white pattern tiles turned into stencils, photoreal renders and edits.
  - Live-tested prompt designs.
  - Texture compositor with stencil patterns, logo placement and text.
  - Export pack, social image composer and share sheet.
- **`3d-sportswear`:**
  - GLB loading by mesh name (`top`, `bottom`, `sock_*`) that keeps the model's normal, roughness and AO maps.
  - Richer design state: decals and sponsors with named positions, lettering fonts, collar and sleeve variants, fabric finish.
  - Capture-ready checks.
  - An artist brief (`public/models/README.md`).
  - Orders and admin, if needed later.

## C. What needs to be built

1. **Real garment pipeline:** load client GLB models; per-garment print-region definitions; texture compositing onto the model's actual UV layout; asset import, inspection and optimisation tooling.
2. **Design schema v2:** region-based colours and patterns, plus a list of decals (logos, sponsors, text, name, number) with anchors. Migrate the current flat design.
3. **OpenAI pipeline, server-side in Laravel:**
   - concept specs;
   - pattern tiles;
   - optional concept preview images;
   - showcase renders.
   - All run as queued jobs, with a generation record, cost and error tracking.
4. **Concept → garment binding:** the selected concept becomes design v2 on the selected garment model.
5. **Garment catalog in the database:** garments, model assets and print profiles, replacing `config/catalog.php` for garments.
6. **Exports and sharing:** store captures and showcase images server-side; share links.
7. **Studio UI for decals:** sponsor zones, multiple logos, font choice, placement nudging.
8. **Admin:** garment upload and print-profile calibration.
9. **Mobile alignment:** Flutter moves its AI calls behind the Laravel API, removing the client-side key, and loads the same garments.

## D. 3D asset requirements and import strategy

### What the client should deliver (per garment)

| Item | Requirement |
|---|---|
| Format | **GLB (glTF 2.0)** preferred; FBX/OBJ accepted and converted. CLO3D/Marvelous project (`.zprj`) strongly preferred as the master. |
| Garments | Rugby jersey, shorts, training tee, singlet, polo; Full Kit is jersey + shorts composed in the scene |
| Geometry | Ghost-mannequin pose, no avatar in the delivered mesh, Y-up, metres, front facing +Z. Under 60k triangles per garment after optimisation (Full Kit under 120k). |
| UVs | One UV set, **non-overlapping**, every printable surface unwrapped once (front, back, sleeves, collar, side panels, cuffs). The CLO3D "unified UV" export is ideal. |
| Materials | Separate materials, or at least separate mesh parts, for print fabric versus trims (collar rib, cuffs, buttons, labels). |
| Textures | Normal, roughness and AO maps at 2K. **No baked colour or graphics in the base colour map**, because the app paints colour at runtime. |
| Licence | Commercial use in a distributed app, and **no "NoAI" clause** if photoreal showcase from 3D captures is wanted (Sketchfab/Fab NoAI forbids use "as inputs to generative AI programs") |

### Import pipeline (to build)

```
client file (.glb/.fbx/.obj/.zprj export)
  └─▶ convert (Blender CLI / FBX2glTF) ─▶ normalise (scale, axes, origin, pose)
        └─▶ inspect report (gltf-transform + custom checks)
              • meshes, materials, triangle count, bounds
              • UV present? overlap %? islands? texel density
              • baked colour detected?
        └─▶ optimise (weld, simplify to budget, meshopt, KTX2/WebP textures)
        └─▶ UV layout PNG (islands outlined, used to author the print profile)
        └─▶ upload to Laravel (garment_assets) + print profile (see below)
```

Checks to answer before implementation, per delivered model:

1. Format and conversion needed?
2. UVs present and non-overlapping?
3. Materials and meshes logically separated?
4. Texture coordinates usable at 2K without visible stretching?
5. Can logos, text and numbers be placed (front chest, back, sleeves, shorts leg)?
6. Are front, back and sleeves separate islands or materials?
7. Optimisation needed (triangles, texture size)?
8. Real-time suitable (mobile frame rate test)?
9. How AI design layers map onto it (the print profile)?

These are produced by the **inspection report** rather than assumed.

### Garment print profile (the key new artifact)

Purchased or artist models will **not** share one UV convention: each CLO3D pattern layout differs. So we do **not** force artists into a fixed layout (the `3d-sportswear` convention). Each model ships with a small JSON profile, authored once with a calibration tool:

```jsonc
{
  "garment": "rugby-jersey", "model": "rugby-jersey@3.glb", "profileVersion": 1,
  "textureSize": 2048,
  "regions": {                       // UV-space polygons (0–1), per printable area
    "front":   { "uv": [[0.02,0.05],[0.48,0.05],...], "up": [0,1] },
    "back":    { "uv": [...], "up": [0,1] },
    "sleeveL": { "uv": [...], "up": [0.2,0.98] },
    "sleeveR": { "uv": [...] }, "collar": { "uv": [...] }, "sidePanels": { "uv": [...] }
  },
  "anchors": {                       // where decals go, in UV + local 3D for previews
    "chestCentre": { "region": "front", "uv": [0.25,0.62], "maxWidth": 0.16 },
    "chestLeft":   { "region": "front", "uv": [0.33,0.70], "maxWidth": 0.05 },
    "backName":    { "region": "back",  "uv": [0.75,0.72], "maxWidth": 0.18 },
    "backNumber":  { "region": "back",  "uv": [0.75,0.55], "maxWidth": 0.16 },
    "sleeveL":     { "region": "sleeveL", "uv": [...] }, "sponsorFront": { ... }
  },
  "trims": ["collar_rib", "cuff_rib"]  // material names coloured, not printed
}
```

The calibration tool is an admin page: show the model, click the surface (raycast to UV) and draw or confirm the region and anchor positions.

## E. AI pipeline (recommended approach: D, hybrid)

| Approach | Verdict |
|---|---|
| A. AI generates a full UV texture | Rejected. An image model cannot respect an arbitrary UV layout, seams or text accuracy, so results are not editable. |
| B. AI artwork composited onto a known UV template | Partly. Good for **pattern tiles**, not whole garments. |
| C. Predefined regions with AI-chosen elements | Yes, as the deterministic layer. |
| **D. Hybrid** | **Recommended:** AI decides the design (structured spec plus artwork tiles); the deterministic compositor places it on the real garment via the print profile. |

```
prompt + references + chosen sport/garment (optional)
  └─▶ Laravel AiDesignJob ─▶ OpenAI text model (JSON schema, strict)
        returns N concept specs:
          palette, per-region colour assignment, panel style,
          pattern motif (text), typography, wordmark, number style,
          suggested decal anchors
  └─▶ per concept: OpenAI image model → seamless black-on-white pattern tile
        (stencil; the app recolours it per region)
  └─▶ concept previews = the spec rendered on the REAL garment by the engine
        (deterministic: what you pick is what you get)
        + optional AI "mood" render from the 3D capture, clearly labelled
  └─▶ user selects ─▶ project.design (v2) = spec + tile asset ids
  └─▶ studio: every change is deterministic and editable
  └─▶ Showcase (later): 3D captures → OpenAI image edit → photoreal marketing image
```

Notes:

- AI never generates geometry. AI text placement is never trusted; names, numbers and logos are rendered by the compositor.
- The OpenAI key lives **only in Laravel** (`config/services.php`, `.env`), with per-user quotas and a generation log. The key bundled in the current Flutter test builds is invalid now and must not return to client builds.
- Proven prompts and schemas from `3d-app/lib/ai_service.dart` port directly to a PHP `OpenAiDesignProvider`. Keep the existing procedural provider as the fallback and test double.

## F. Backend / API plan

New endpoints, versioned `/api/v1`; existing ones kept:

| Method | Path | Purpose |
|---|---|---|
| GET | `/garments?sport=` | Garment catalog with model URL, profile, thumbnails |
| GET | `/garments/{id}` | One garment plus its active model asset and print profile |
| POST | `/ai/concepts` | Queue concept generation; returns `generation_id` (202) |
| GET | `/ai/generations/{id}` | Status, concepts, errors (poll; SSE later) |
| POST | `/ai/concepts/{id}/select` | Create or update a project from a concept |
| POST | `/ai/patterns` | Queue a new pattern tile for a project |
| POST | `/projects/{id}/captures` | Upload front/back/side PNG captures (thumbnail, exports) |
| POST | `/projects/{id}/showcase` | Queue a photoreal showcase from captures |
| GET/POST | `/projects/{id}/exports` | List and create export files (PNG, ZIP pack, spec JSON) |
| POST/DELETE | `/projects/{id}/share` | Create or revoke a share link |
| GET | `/share/{token}` | Public read-only design (viewer + images) |
| Admin | `/admin/garments`, `/admin/garments/{id}/assets`, `/admin/garments/{id}/profile` | Upload models, run inspection, save print profile |

Services:

- `GarmentImportService`: store, inspect, record the report.
- `AiDesignProvider` interface with `OpenAiDesignProvider` and `ProceduralDesignProvider`.
- `AiDesignJob`, `PatternTileJob`, `ShowcaseJob` on the queue (database driver to start).
- `DesignSchema` validator for v2, plus a v1 to v2 migrator.

## G. Frontend / 3D architecture

Keep **one renderer for web and mobile**. Turn the current vanilla viewer into a framework-agnostic **`garment-engine`** package. React and the Flutter WebView both use it, so 3D work is done once. React Three Fiber is not required: the engine is imperative (texture compositing, capture, profiles), and the mobile app cannot use React. `3d-sportswear`'s R3F code is a source of techniques (GLB material swap, capture readiness), not code to adopt wholesale.

```
packages/garment-engine/            (from 3d-app/viewer + website/viewer)
  engine.ts      createEngine(canvas) → { loadGarment(glbUrl, profile), applyDesign(designV2),
                                          setView(front|back|side|turntable), capture(opts), dispose }
  loader.ts      GLTFLoader + meshopt/KTX2, material split (print vs trims), fallback to procedural
  compositor.ts  per-region fill, panel styles, stencil pattern tiles, decals (logo/sponsor/text/number)
                 drawn into the profile's UV regions → CanvasTexture (2K; 4K desktop)
  stage.ts       studio lighting/HDRI, shadows, reflective floor (from website/viewer/studio.js)
  controls.ts    orbit, zoom, limited pan, view snaps (GSAP)
  bridges/       iframe/WebView postMessage bridge (Flutter), direct import (React)

resources/js/
  features/create/   AiDesigner, ConceptPicker (live engine previews), SportPicker, GarmentPicker
  features/studio/   Studio, ToolPanels (Colours, Patterns, Logos & Sponsors, Text & Numbers, Garment),
                     DecalInspector, ViewBar, UndoRedo (command stack over designV2)
  features/library/  Projects, Versions, Assets, Exports, Share
  state/             designStore (reducer + history), api client, generation polling hook
  components/GarmentCanvas.tsx   mounts garment-engine directly (no iframe on web)
```

## H. Database changes

New tables:

- `garments`: id, slug, name, type (`top|bottom|set`), sports (json), sort, status
- `garment_assets`: garment_id, kind (`model|uv_layout|thumbnail|normal|roughness|ao`), path, checksum, triangles, bytes, inspection (json), version, active
- `garment_profiles`: garment_asset_id, version, regions (json), anchors (json), trims (json), created_by
- `ai_generations`: user_id, project_id?, kind (`concepts|pattern|showcase|brief`), provider, model, prompt, inputs (json: refs, sport, garment), status (`queued|running|done|failed`), error, cost_cents, started_at, finished_at
- `ai_concepts`: ai_generation_id, position, name, summary, spec (json), pattern_asset_id?, preview_asset_id?
- `exports`: project_id, version, format, asset_id
- `project_shares`: project_id, token (unique), expires_at, revoked_at

Changes:

- `projects`: + garment_id, + selected_concept_id, + thumbnail_asset_id, + design_schema (int, default 1)
- `assets`: type adds `sponsor|pattern_tile|capture|showcase|export`; + source (`upload|ai|capture`), width, height
- Data migration: v1 `design` to v2 (main → front/back fill, secondary → side panels/trims, accent → text colour, logoImage → `decals[chestLeft]`, number/backName → `decals[backNumber|backName]`)

## I. Implementation phases

| Phase | Scope | Exit criterion |
|---|---|---|
| **0. Foundations** (1 day) | Put all codebases under git; choose `website` as base; agree design v2 and profile formats; send the asset brief (section D) to the client | Repo plus agreed specs |
| **1. Asset intake** (2–3 days) | Import, inspect and optimise tooling; `garments`, `garment_assets`, `garment_profiles`; `GET /garments`; engine loads GLB + profile; colours applied by region | Client jersey renders in the studio with correct front/back/sleeve colours on desktop and phone |
| **2. Compositor and decals** (3–4 days) | Pattern tiles per region; logos, sponsors, name, number, text at anchors; studio tool panels; undo/redo over v2; v1 → v2 migration | All customisations visible on the real model; save and reopen identical |
| **3. AI concepts** (3 days) | `OpenAiDesignProvider` (spec + tiles), queued jobs, generation log, concept picker rendering specs on the real garment, select → project | Prompt → 4 concepts on the real jersey in about 30 s; selection opens in studio |
| **4. Garment range** (2–4 days, depends on assets) | Shorts, tee, singlet, polo, full kit; admin upload + calibration page | All six garments with profiles |
| **5. Export and share** (2 days) | Server-stored captures, export pack, social image, share links | Shareable read-only design page |
| **6. Showcase and render polish** (2–3 days) | HDRI, AO, shadows; `ShowcaseJob` (3D captures → OpenAI edit) | Photoreal showcase of the user's exact design |
| **7. Mobile alignment** (3–4 days) | Flutter uses Laravel auth, projects and AI endpoints and the same engine; remove client-side key | One account and projects across web and mobile |

## J. Risks and blockers

1. **Blocker: no garment models yet.** Every 3D decision depends on the delivered UVs. Mitigation: inspection tooling first; test with a sample CC0 or purchased GLB.
2. **UV quality varies.** Overlapping or mirrored UVs make printing impossible without re-unwrapping (artist work). The inspection report catches this before integration.
3. **Licence "NoAI" clauses** on marketplace models would block photoreal showcase from captures.
4. **OpenAI key invalid.** All current AI features are down. A new key must be stored server-side only.
5. **Codebase divergence.** Four 3DEEZI codebases and two diverging viewer forks, none under git. Consolidate into one engine package and one backend.
6. **Mobile performance.** High-poly CLO3D exports (95–190k triangles seen on marketplaces) must be decimated; texture memory at 4K is too heavy for phones (use 2K plus KTX2).
7. **AI expectations.** Concept "mood" images from AI may differ from what the garment can show. Mitigation: concepts are rendered on the real garment; AI images are labelled.
8. **Cost and abuse.** Queue plus per-user quotas and a generation log are needed before public use.
9. **Environment.** This PC has 8 GB RAM and a small D: drive (builds already moved to E:). CI or a larger dev machine is advisable.

## K. The exact first development task

**Build the garment asset intake and inspection pipeline, and validate it on one sample jersey GLB.**

Deliverables:

1. `website/tools/garments/inspect.mjs` (Node, `@gltf-transform/core` + functions). Input: GLB/glTF (FBX/OBJ via Blender CLI if installed). Output:
   - `report.json` (meshes, materials, triangles, bounds, axis/scale, UV presence, **UV overlap %**, island count, texture maps present, baked-colour detection);
   - `uv-layout.png` (islands drawn);
   - an optimised GLB (weld, simplify to budget, meshopt).
2. Migration and models: `garments`, `garment_assets`, `garment_profiles`, seeded from the current catalog (procedural fallback = no asset).
3. `GET /api/v1/garments` and `GET /api/v1/garments/{id}`, with feature tests.
4. Engine spike: `loadGarment(glb, profile)` in the viewer, with a hand-written profile for the sample model, applying the current colours per region on desktop and phone. Procedural garments remain the fallback.

This task is independent of AI and of the client's final files. It answers the critical asset questions the moment the real jersey arrives, and it is the foundation for every later phase. **In parallel, send the client the asset brief in section D.**
