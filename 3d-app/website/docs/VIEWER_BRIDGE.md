# Shared design board and viewer

`website/viewer/src` is the shared renderer source. Run `node viewer/build.mjs` from the repository root to build **both** `assets/viewer/index.html` (Flutter) and `website/public/media/viewer/index.html` (React). The stadium plate, font, scripts and sample print are embedded for offline operation. `assets/presets.json` is the shared preset catalogue; the build also copies it to the website, where `GET /api/v1/presets` returns `{data: [...]}`.

Hosts send JSON strings `{cmd, arg}` through iframe `postMessage` on the same origin or native `window.viewer.receive(...)`. Responses are JSON strings through the native `Viewer` channel or to the iframe parent, with `host` copied from the viewer URL. Check the source window and host identifier. Existing `ready`, `designApplied`, `capture`, `setDesign`, and `setView` behavior is retained.

| Command | Argument | Response |
| --- | --- | --- |
| `board` | boolean | `{type:'board',on}` |
| `select` | layer ID or null | `{type:'selection',id}` |
| `pick` | `{id,x,y}` with viewport coordinates from 0 to 1 | `{type:'pick',id,hit,part,kind,side,x,y,zone}`; only `hit:false` when missed |
| `processImage` | `{id,src,removeBg?,tolerance?,tint?,maxSize?}` | `{type:'image',id,data}` (PNG data URL) or `error` |
| `captureBoard` | `{id}` | `{type:'captureBoard',id,data}` (PNG) or `error` |

The board sends `{type:'layers',layers}` after a completed move, resize, rotation or deletion. Selection changes send `{type:'selection',id}`. Store these layers in the host's design/history and resend the complete design. `captureBoard` includes every front/back panel, omits selection handles, and does not alter the live view. It is a design-review image, not a manufacturing pattern.

Design additions (all optional so old projects remain valid):

```ts
gradient?: { from: string; to: string; angle?: number } | null;
zones?: Partial<Record<'body'|'yoke'|'sleeves'|'sides'|'hem', Pattern|'None'>>;
layers?: Array<{
  id: string; name?: string; type: 'image'|'text'|'shape';
  part?: 'top'|'shorts'; side: 'front'|'back'; x: number; y: number;
  w?: number; h?: number; rot?: number; opacity?: number;
  src?: string; text?: string; size?: number; color?: string;
  shape?: 'rectangle'|'ellipse'|'triangle';
}>;
```

`Pattern` is `Solid`, `Stripes`, `Chevron`, `Velocity`, `Hoops`, `Dots`, `Diagonal`, `Tribal` or `Camo`. Colours use six-digit hex. Layers use garment metres: hem is `y=0`, top is about `y=.75`, `x=0` is the centre. Top and shorts have their own coordinates. Back panels retain readable artwork. `rot` is clockwise degrees, `opacity` is 0–1. Image `w` keeps its aspect ratio; shapes use `w` and `h`; text uses `size`. Array order is drawing order. API maximum: 40 layers, 120 text characters, width/height 0.005–1 m, text size 0.005–0.4 m, x -1–1 m and y -0.5–1.5 m.

Images must be local/same-origin raster URLs or PNG/JPEG/WebP data URLs. Image processing limits its output to 2048 pixels. Background removal uses border-connected colour removal suited to logos on plain backgrounds; it is not AI subject segmentation. Tint changes visible pixels while retaining alpha. Gradient angle 0 runs top to bottom. Zones apply to both front and back; shorts support body, sides and hem.

Save/export the complete design, including `layers`, `gradient` and `zones`. Clear these explicitly (`[]`, `null`, `{}`) when switching to a preset or an older design, because `setDesign` accepts partial updates.
