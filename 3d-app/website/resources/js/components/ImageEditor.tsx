import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Brush, ChevronLeft, ChevronRight, Crop, Download, Eraser, Expand, ImageMinus, LoaderCircle, MessageSquarePlus, PenLine, Scaling, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { api, saveBlob, type Catalog } from '../api';
import '../../css/image-editor.css';

/*
 * The image editor on every AI picture (concepts, the HD mockup, showcases, Convert, Assets), like
 * ChatGPT's: mark up, comment, erase, remove a plain background, resize, and describe edits for the
 * AI (POST /ai/image-edit). Every change makes a new version; the original always stays.
 */

type Tool = 'markup' | 'comment' | 'erase' | 'background' | 'resize';
type Point = { x: number; y: number };
/** Brush marks and notes, in fractions of the picture (0 to 1), so they fit every version. */
type Stroke = { kind: 'markup' | 'erase'; size: number; points: Point[] };
type Note = { kind: 'note'; x: number; y: number; text: string };
type Mark = Stroke | Note;
type Version = { id: number; canvas: HTMLCanvasElement; label: string; detail?: string; thumb: string; ai: boolean; clear: boolean; kept: boolean };
type Draft = { x: number; y: number; text: string; index?: number };

export const editRatios = [
    { id: '1:1', label: 'Square 1:1', w: 1, h: 1, size: '1024x1024' },
    { id: '2:3', label: 'Portrait 2:3', w: 2, h: 3, size: '1024x1536' },
    { id: '3:2', label: 'Landscape 3:2', w: 3, h: 2, size: '1536x1024' },
] as const;
type Ratio = typeof editRatios[number];

const tools: { id: Tool; label: string; icon: typeof Brush; hint: string }[] = [
    { id: 'markup', label: 'Markup', icon: Brush, hint: 'Draw on the picture or circle what to change, then describe the change below.' },
    { id: 'comment', label: 'Comment', icon: MessageSquarePlus, hint: 'Click a spot and type a short note. Notes are sent with your description.' },
    { id: 'erase', label: 'Erase', icon: Eraser, hint: 'Brush out a part. Make it see-through, or describe what goes there and edit with AI.' },
    { id: 'background', label: 'Remove BG', icon: ImageMinus, hint: 'Removes a plain background and makes it see-through.' },
    { id: 'resize', label: 'Resize', icon: Scaling, hint: 'Choose a shape. Crop keeps the part in the frame (drag it); Extend lets the AI add the missing edges.' },
];

const LARGEST = 2048;
const FOR_AI = 1536;
const MARK_COLOUR = 'rgba(255, 61, 110, .74)';
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function makeCanvas(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
}
const paper = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!;

/** A copy no larger than `largest` pixels on its long side. */
function scaled(source: CanvasImageSource & { width: number; height: number }, largest: number) {
    const scale = Math.min(1, largest / Math.max(source.width, source.height));
    const canvas = makeCanvas(source.width * scale, source.height * scale);
    const g = paper(canvas);
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

async function loadPicture(src: string) {
    const image = new Image();
    image.src = src;
    await image.decode();
    return scaled(Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight }), LARGEST);
}

function seeThrough(canvas: HTMLCanvasElement) {
    const data = paper(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
}

/** A see-through picture stays a PNG; any other goes as a smaller JPEG. */
const encode = (canvas: HTMLCanvasElement, clear: boolean) => clear ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
const blobOf = (canvas: HTMLCanvasElement, clear: boolean) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The picture could not be saved.')), clear ? 'image/png' : 'image/jpeg', 0.92));

function trace(g: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
    g.beginPath();
    stroke.points.forEach((p, i) => i ? g.lineTo(p.x * width, p.y * height) : g.moveTo(p.x * width, p.y * height));
}

function drawStroke(g: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number, colour: string, grow = 1) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = colour; g.fillStyle = colour;
    g.lineWidth = Math.max(1, stroke.size * width * grow);
    if (stroke.points.length === 1) {
        g.beginPath(); g.arc(stroke.points[0].x * width, stroke.points[0].y * height, g.lineWidth / 2, 0, Math.PI * 2); g.fill();
        return;
    }
    trace(g, stroke, width, height); g.stroke();
}

/** A markup stroke that comes back near where it started circles an area: the whole inside counts. */
function circles(stroke: Stroke, width: number, height: number) {
    if (stroke.points.length < 8) return false;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const p of stroke.points) { left = Math.min(left, p.x * width); right = Math.max(right, p.x * width); top = Math.min(top, p.y * height); bottom = Math.max(bottom, p.y * height); }
    const across = Math.hypot(right - left, bottom - top);
    const brush = stroke.size * width;
    const first = stroke.points[0], last = stroke.points[stroke.points.length - 1];
    return across > brush * 3 && Math.hypot((first.x - last.x) * width, (first.y - last.y) * height) < Math.max(brush * 2, across * 0.25);
}

/** The picture with the erase marks punched out (see-through). */
function erased(base: HTMLCanvasElement, marks: Mark[], out = makeCanvas(base.width, base.height)) {
    const g = paper(out);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, out.width, out.height);
    g.drawImage(base, 0, 0, out.width, out.height);
    g.globalCompositeOperation = 'destination-out';
    for (const mark of marks) if (mark.kind === 'erase') drawStroke(g, mark, out.width, out.height, '#000');
    g.globalCompositeOperation = 'source-over';
    return out;
}

/** The AI's mask: see-through where it may change the picture (brush marks, circled areas, round each note). */
function maskFor(width: number, height: number, marks: Mark[]) {
    if (!marks.some(mark => mark.kind !== 'note')) return null;
    const mask = makeCanvas(width, height);
    const g = paper(mask);
    g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
    g.globalCompositeOperation = 'destination-out';
    for (const mark of marks) {
        if (mark.kind === 'note') { g.beginPath(); g.arc(mark.x * width, mark.y * height, Math.max(width, height) * 0.07, 0, Math.PI * 2); g.fill(); continue; }
        drawStroke(g, mark, width, height, '#000', mark.kind === 'markup' ? 1.6 : 1.15);
        if (mark.kind === 'markup' && circles(mark, width, height)) { trace(g, mark, width, height); g.closePath(); g.fill(); }
    }
    return mask.toDataURL('image/png');
}

/** A small copy of the picture with the markup and numbered pins drawn on, so the AI sees where. */
function markedCopy(picture: HTMLCanvasElement, marks: Mark[]) {
    if (!marks.some(mark => mark.kind !== 'erase')) return null;
    const out = makeCanvas(picture.width, picture.height);
    const copy = scaled(picture, 1024);
    out.width = copy.width; out.height = copy.height;
    const g = paper(out);
    g.fillStyle = '#808080'; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(copy, 0, 0);
    for (const mark of marks) if (mark.kind === 'markup') drawStroke(g, mark, out.width, out.height, '#ff2d63');
    const radius = Math.max(11, Math.round(Math.max(out.width, out.height) * 0.02));
    let number = 0;
    for (const mark of marks) {
        if (mark.kind !== 'note') continue;
        number += 1;
        const x = mark.x * out.width, y = mark.y * out.height;
        g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.fillStyle = '#00d9ed'; g.fill();
        g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.stroke();
        g.fillStyle = '#031423'; g.font = `800 ${Math.round(radius * 1.15)}px Inter, Arial, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), x, y + 1);
    }
    return out.toDataURL('image/jpeg', 0.85);
}

/**
 * Removes a plain background: the most common colour round the edge, grown inwards (smooth shading
 * too), with soft edges cleaned of the old background colour. `strength` runs from 0 to 100.
 */
export function removeBackground(source: HTMLCanvasElement, strength: number) {
    const width = source.width, height = source.height;
    const picture = paper(source).getImageData(0, 0, width, height);
    const d = picture.data;
    const edge: number[] = [];
    for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
    for (let y = 1; y < height - 1; y++) edge.push(y * width, y * width + width - 1);
    const counts = new Map<number, number[]>();
    for (const i of edge) {
        const o = i * 4;
        if (d[o + 3] < 16) continue;
        const key = (d[o] >> 4) << 8 | (d[o + 1] >> 4) << 4 | d[o + 2] >> 4;
        const count = counts.get(key);
        if (count) { count[0] += 1; count[1] += d[o]; count[2] += d[o + 1]; count[3] += d[o + 2]; } else counts.set(key, [1, d[o], d[o + 1], d[o + 2]]);
    }
    let best: number[] | undefined;
    counts.forEach(count => { if (!best || count[0] > best[0]) best = count; });
    if (!best) throw new Error('The background is already see-through.');
    const [n, red, green, blue] = best;
    const r = red / n, gr = green / n, b = blue / n;
    const limit = 12 + strength * 0.9;
    const near = limit * limit;
    const distance = (o: number) => { const dr = d[o] - r, dg = d[o + 1] - gr, db = d[o + 2] - b; return dr * dr + dg * dg + db * db; };
    const plain = edge.filter(i => d[i * 4 + 3] < 16 || distance(i * 4) <= near).length;
    if (plain < edge.length * 0.45) throw new Error('The edge of this picture is not one plain colour, so its background cannot be removed here. Describe it instead, for example “make the background plain white”.');

    const gone = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;
    for (const i of edge) if (!gone[i] && (d[i * 4 + 3] < 16 || distance(i * 4) <= near)) { gone[i] = 1; queue[tail++] = i; }
    const far = near * 2.6;
    const grow = (j: number, o: number) => {
        if (gone[j]) return;
        const p = j * 4;
        const along = (d[p] - d[o]) ** 2 + (d[p + 1] - d[o + 1]) ** 2 + (d[p + 2] - d[o + 2]) ** 2;
        // Close to the background, or a smooth step of its shading.
        if (d[p + 3] < 16 || distance(p) <= near || (along <= 30 && distance(p) <= far)) { gone[j] = 1; queue[tail++] = j; }
    };
    while (head < tail) {
        const i = queue[head++];
        const x = i % width, o = i * 4;
        if (x > 0) grow(i - 1, o);
        if (x < width - 1) grow(i + 1, o);
        if (i >= width) grow(i - width, o);
        if (i + width < gone.length) grow(i + width, o);
    }
    if (tail < gone.length * 0.02) throw new Error('Nothing to remove: the background is too close to the picture itself. Try more strength.');
    if (tail > gone.length * 0.98) throw new Error('That would remove almost everything. Try less strength.');

    const out = new ImageData(new Uint8ClampedArray(d), width, height);
    const o2 = out.data;
    for (let i = 0; i < gone.length; i++) {
        const o = i * 4;
        if (gone[i]) { o2[o + 3] = 0; continue; }
        const x = i % width;
        if (!((x > 0 && gone[i - 1]) || (x < width - 1 && gone[i + 1]) || (i >= width && gone[i - width]) || (i + width < gone.length && gone[i + width]))) continue;
        // An edge pixel is part background: keep only its own share and colour.
        const alpha = clamp(Math.sqrt(distance(o)) / (limit * 2.5), 0.35, 1);
        o2[o] = clamp(r + (d[o] - r) / alpha, 0, 255);
        o2[o + 1] = clamp(gr + (d[o + 1] - gr) / alpha, 0, 255);
        o2[o + 2] = clamp(b + (d[o + 2] - b) / alpha, 0, 255);
        o2[o + 3] = Math.round(d[o + 3] * alpha);
    }
    const result = makeCanvas(width, height);
    paper(result).putImageData(out, 0, 0);
    return result;
}

/** The largest frame of the ratio inside the picture; `shift` (0 to 1) slides it along the free side. */
function frameOf(width: number, height: number, ratio: Ratio, shift: number) {
    const r = ratio.w / ratio.h;
    if (width / height > r) { const w = height * r; return { x: (width - w) * shift, y: 0, w, h: height }; }
    const h = width / r;
    return { x: 0, y: (height - h) * shift, w: width, h };
}
const sameShape = (width: number, height: number, ratio: Ratio) => Math.abs(width / height - ratio.w / ratio.h) < 0.01 * (ratio.w / ratio.h);

/** Moves marks onto a new picture: `map` takes old picture pixels to new ones. */
function moveMarks(marks: Mark[], from: { w: number; h: number }, to: { w: number; h: number }, map: (x: number, y: number) => [number, number]): Mark[] {
    const point = (p: Point) => { const [x, y] = map(p.x * from.w, p.y * from.h); return { x: x / to.w, y: y / to.h }; };
    return marks.flatMap((mark): Mark[] => {
        if (mark.kind === 'note') { const p = point(mark); return p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ? [] : [{ ...mark, ...p }]; }
        return [{ ...mark, size: mark.size * from.w / to.w, points: mark.points.map(point) }];
    });
}

type AssetType = 'logo' | 'pattern' | 'artwork' | 'reference';

/** Keeps a picture (data URL) in the user's Assets; answers the new asset. */
export async function keepInAssets<T = { id: number; name: string }>(image: string, name: string, type: AssetType = 'artwork') {
    const blob = await (await fetch(image)).blob();
    const body = new FormData();
    body.append('file', blob, `${name.replace(/[^\w\- ]+/g, '').trim() || 'image'}.${blob.type === 'image/png' ? 'png' : 'jpg'}`);
    body.append('name', name.slice(0, 120));
    body.append('type', type);
    return api<T>('/assets', { method: 'POST', body });
}

let aiOnServer: Promise<boolean> | null = null;
/** Whether AI is connected on the server, when the page does not say. */
function useAi(known?: boolean) {
    const [ai, setAi] = useState(known ?? false);
    useEffect(() => {
        if (known !== undefined) { setAi(known); return; }
        let gone = false;
        aiOnServer ??= api<Catalog>('/catalog').then(catalog => !!catalog.provider?.is_ai).catch(() => { aiOnServer = null; return false; });
        void aiOnServer.then(on => { if (!gone) setAi(on); });
        return () => { gone = true; };
    }, [known]);
    return ai;
}

export type ImageEditorProps = {
    /** The picture: a data, blob or same-site URL. */
    src: string;
    /** Shown in the header, e.g. "Concept 01". */
    title?: string;
    /** Download names: "<fileName>-v2.jpg". */
    fileName?: string;
    /** AI is connected on the server (Describe edits and Extend); asked from the server when not given. */
    ai?: boolean;
    /** Signs in first when needed, then runs the action. */
    requireAuth?: (action?: () => void) => void;
    /** Puts the chosen version back where the picture came from. */
    onUse?: (image: string) => void | Promise<void>;
    useLabel?: string;
    /** Use also keeps the version in Assets under this name (the picture's original is there too). */
    keepAs?: string;
    onClose: () => void;
};

export default function ImageEditor({ src, title, fileName = '3deezi-image', ai: aiKnown, requireAuth, onUse, useLabel = 'Use this version', keepAs, onClose }: ImageEditorProps) {
    const ai = useAi(aiKnown);
    const dialog = useRef<HTMLDialogElement>(null);
    const fieldId = useId();
    const stage = useRef<HTMLDivElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const view = useRef<HTMLCanvasElement>(null);
    const work = useRef<HTMLCanvasElement | null>(null);
    const brush = useRef<HTMLDivElement>(null);
    const nextId = useRef(1);
    const abort = useRef<AbortController | null>(null);
    const pointer = useRef<{ id: number; start: Point; moved: boolean; stroke?: Stroke; shift?: number } | null>(null);
    const frame = useRef(0);
    const [versions, setVersions] = useState<Version[]>([]);
    const [currentId, setCurrentId] = useState(0);
    const [marks, setMarks] = useState<Mark[]>([]);
    const [tool, setTool] = useState<Tool>('markup');
    const [brushSize, setBrushSize] = useState({ markup: 16, erase: 30 });
    const [strength, setStrength] = useState(40);
    const [ratio, setRatio] = useState<Ratio | null>(null);
    const [shift, setShift] = useState(0.5);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [instruction, setInstruction] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    const index = Math.max(0, versions.findIndex(v => v.id === currentId));
    const version = versions[index] as Version | undefined;
    const notes = marks.filter((mark): mark is Note => mark.kind === 'note');
    const erasing = marks.some(mark => mark.kind === 'erase');
    const unsaved = versions.some(v => v.ai && !v.kept);

    const add = useCallback((canvas: HTMLCanvasElement, label: string, extra: { ai?: boolean; detail?: string } = {}) => {
        const thumb = scaled(canvas, 160).toDataURL('image/png');
        const id = nextId.current++;
        setVersions(list => [...list, { id, canvas, label, thumb, detail: extra.detail, ai: !!extra.ai, clear: seeThrough(canvas), kept: false }]);
        setCurrentId(id);
    }, []);

    // Open as a full-screen dialog on top of any other (the Studio's showcase is one).
    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        return () => { element?.close(); abort.current?.abort(); };
    }, []);

    useEffect(() => {
        let gone = false;
        setLoadFailed(false);
        loadPicture(src)
            .then(canvas => { if (!gone) { nextId.current = 1; setVersions([]); add(canvas, 'Original'); } })
            .catch(() => { if (!gone) setLoadFailed(true); });
        return () => { gone = true; };
    }, [src, add]);

    useLayoutEffect(() => {
        const element = stage.current;
        if (!element) return;
        const measure = () => setStageSize({ w: element.clientWidth, h: element.clientHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // The picture fits the stage; the canvas draws at screen resolution.
    const fit = version ? Math.min((stageSize.w - 16) / version.canvas.width, (stageSize.h - 16) / version.canvas.height) : 0;
    const shown = version && fit > 0 ? { w: Math.max(1, Math.floor(version.canvas.width * fit)), h: Math.max(1, Math.floor(version.canvas.height * fit)) } : null;

    const paint = useCallback(() => {
        const canvas = view.current;
        if (!version || !canvas || !shown) return;
        const ratioPx = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.min(version.canvas.width, Math.round(shown.w * ratioPx)), height = Math.round(width * version.canvas.height / version.canvas.width);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const live = pointer.current?.stroke;
        const all = live ? [...marks, live] : marks;
        const g = paper(canvas);
        g.clearRect(0, 0, width, height);
        g.imageSmoothingQuality = 'high';
        if (all.some(mark => mark.kind === 'erase')) {
            if (!work.current || work.current.width !== width || work.current.height !== height) work.current = makeCanvas(width, height);
            g.drawImage(erased(version.canvas, all, work.current), 0, 0);
        } else g.drawImage(version.canvas, 0, 0, width, height);
        for (const mark of all) if (mark.kind === 'markup') drawStroke(g, mark, width, height, MARK_COLOUR);
    }, [version, shown?.w, shown?.h, marks]); // eslint-disable-line react-hooks/exhaustive-deps
    const paintLater = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(paint); };
    useEffect(() => { paint(); }, [paint]);
    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    /** Close or Esc: nothing changes where the picture came from. AI versions not yet used or downloaded are confirmed first. */
    function requestClose(escape = false) {
        if (escape && draft) { setDraft(null); return; }
        abort.current?.abort();
        if (unsaved && !confirmLeave) { setConfirmLeave(true); return; }
        onClose();
    }

    function at(event: { clientX: number; clientY: number }) {
        const rect = box.current!.getBoundingClientRect();
        return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
    }

    function moveBrush(event: ReactPointerEvent) {
        const ring = brush.current;
        if (!ring) return;
        const drawing = tool === 'markup' || tool === 'erase';
        ring.style.display = drawing && event.pointerType === 'mouse' ? 'block' : 'none';
        if (!drawing) return;
        const rect = box.current!.getBoundingClientRect();
        const size = brushSize[tool];
        Object.assign(ring.style, { left: `${event.clientX - rect.left}px`, top: `${event.clientY - rect.top}px`, width: `${size}px`, height: `${size}px` });
    }

    function down(event: ReactPointerEvent<HTMLDivElement>) {
        if (busy || !version || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (draft) { saveDraft(); return; }
        const p = at(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        const width = box.current!.getBoundingClientRect().width;
        if (tool === 'markup' || tool === 'erase') pointer.current = { id: event.pointerId, start: p, moved: false, stroke: { kind: tool, size: brushSize[tool] / width, points: [p] } };
        else if (tool === 'resize' && ratio) pointer.current = { id: event.pointerId, start: p, moved: false, shift };
        else pointer.current = { id: event.pointerId, start: p, moved: false };
        if (pointer.current.stroke) paintLater();
    }

    function move(event: ReactPointerEvent<HTMLDivElement>) {
        moveBrush(event);
        const active = pointer.current;
        if (!active || active.id !== event.pointerId || !version) return;
        const p = at(event);
        const rect = box.current!.getBoundingClientRect();
        if (Math.hypot((p.x - active.start.x) * rect.width, (p.y - active.start.y) * rect.height) > 6) active.moved = true;
        if (active.stroke) {
            const last = active.stroke.points[active.stroke.points.length - 1];
            if (Math.hypot((p.x - last.x) * rect.width, (p.y - last.y) * rect.height) >= 1.5) { active.stroke.points.push(p); paintLater(); }
        } else if (active.shift !== undefined && ratio) {
            const f = frameOf(version.canvas.width, version.canvas.height, ratio, 0);
            const spare = version.canvas.width - f.w > 1 ? (version.canvas.width - f.w) / version.canvas.width : (version.canvas.height - f.h) / version.canvas.height;
            const delta = version.canvas.width - f.w > 1 ? p.x - active.start.x : p.y - active.start.y;
            if (spare > 0) setShift(clamp(active.shift + delta / spare));
        }
    }

    function up(event: ReactPointerEvent<HTMLDivElement>) {
        const active = pointer.current;
        if (!active || active.id !== event.pointerId) return;
        pointer.current = null;
        if (active.stroke) { const stroke = active.stroke; setMarks(list => [...list, stroke]); setError(''); }
        else if (tool === 'comment' && !active.moved && event.type === 'pointerup') setDraft({ ...active.start, text: '' });
    }

    function saveDraft() {
        if (!draft) return;
        const text = draft.text.trim();
        if (draft.index !== undefined) setMarks(list => text ? list.map((mark, i) => i === draft.index ? { ...mark, text } as Note : mark) : list.filter((_, i) => i !== draft.index));
        else if (text) setMarks(list => [...list, { kind: 'note', x: draft.x, y: draft.y, text }]);
        setDraft(null);
    }
    const openNote = (note: Note) => setDraft({ x: note.x, y: note.y, text: note.text, index: marks.indexOf(note) });
    const removeNote = (note: Note) => { setMarks(list => list.filter(mark => mark !== note)); setDraft(null); };
    const undo = () => { setDraft(null); setMarks(list => list.slice(0, -1)); };

    function step(by: number) {
        const next = versions[index + by];
        if (next) { setCurrentId(next.id); setError(''); }
    }

    function makeSeeThrough() {
        if (!version) return;
        add(erased(version.canvas, marks), 'Erased');
        setMarks(list => list.filter(mark => mark.kind !== 'erase'));
    }

    function removeBg() {
        if (!version) return;
        setError(''); setBusy('Removing the background…');
        // Let the busy note paint before the work starts.
        setTimeout(() => {
            try { add(removeBackground(version.canvas, strength), 'No background'); }
            catch (e) { setError(message(e)); }
            finally { setBusy(''); }
        }, 30);
    }

    function crop() {
        if (!version || !ratio) return;
        const f = frameOf(version.canvas.width, version.canvas.height, ratio, shift);
        const out = makeCanvas(f.w, f.h);
        paper(out).drawImage(version.canvas, f.x, f.y, f.w, f.h, 0, 0, out.width, out.height);
        setMarks(list => moveMarks(list, { w: version.canvas.width, h: version.canvas.height }, { w: out.width, h: out.height }, (x, y) => [(x - f.x) * out.width / f.w, (y - f.y) * out.height / f.h]));
        add(out, `Cropped ${ratio.id}`);
    }

    async function send(body: Record<string, unknown>, label: string, detail: string, after?: () => void) {
        const controller = new AbortController();
        abort.current = controller;
        setError(''); setBusy(label === 'AI edit' ? 'Editing your picture… about a minute' : 'Extending your picture… about a minute');
        try {
            const result = await api<{ image: string }>('/ai/image-edit', { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
            const canvas = await loadPicture(result.image);
            if (controller.signal.aborted) return;
            add(canvas, label, { ai: true, detail });
            after?.();
        } catch (e) {
            if (!controller.signal.aborted) setError(message(e));
        } finally {
            if (abort.current === controller) abort.current = null;
            setBusy('');
        }
    }

    function signedIn(action: () => void) {
        if (!ai) { setError('AI edits need AI to be connected on the server.'); return; }
        if (requireAuth) requireAuth(action); else action();
    }

    function describe() {
        if (!version || busy) return;
        const text = instruction.trim();
        if (!text && !notes.length) { setError('Describe the change you want, or add a note on the picture.'); return; }
        signedIn(() => {
            const picture = scaled(erasing ? erased(version.canvas, marks) : version.canvas, FOR_AI);
            const clear = erasing || version.clear;
            const mask = maskFor(picture.width, picture.height, marks);
            const marked = markedCopy(picture, marks);
            const body = {
                image: encode(picture, clear),
                instruction: text || null,
                notes: notes.map(note => ({ text: note.text, x: Number(note.x.toFixed(4)), y: Number(note.y.toFixed(4)) })),
                ...(mask ? { mask } : {}),
                ...(marked ? { marked } : {}),
            };
            void send(body, 'AI edit', text || notes.map(note => note.text).join(' · '), () => { setMarks([]); setInstruction(''); });
        });
    }

    function extend() {
        if (!version || !ratio || busy) return;
        signedIn(() => {
            const base = scaled(version.canvas, FOR_AI);
            const r = ratio.w / ratio.h;
            const width = base.width / base.height < r ? Math.round(base.height * r) : base.width;
            const height = base.width / base.height < r ? base.height : Math.round(base.width / r);
            const padded = makeCanvas(width, height);
            const left = Math.round((width - base.width) / 2), top = Math.round((height - base.height) / 2);
            paper(padded).drawImage(base, left, top);
            const mask = makeCanvas(width, height);
            const g = paper(mask);
            g.fillStyle = '#000'; g.fillRect(left, top, base.width, base.height);
            const extra = instruction.trim();
            void send({
                image: padded.toDataURL('image/png'),
                mask: mask.toDataURL('image/png'),
                size: ratio.size,
                instruction: `Extend the picture into the empty see-through edges so it becomes ${ratio.label.toLowerCase()}. Continue the background, floor and lighting naturally, and keep the picture itself exactly the same.${extra ? ` Also: ${extra}` : ''}`,
            }, `Extended ${ratio.id}`, `Extended to ${ratio.label.toLowerCase()}`, () => {
                setMarks(list => moveMarks(list, { w: version.canvas.width, h: version.canvas.height }, { w: width, h: height }, (x, y) => [x * base.width / version.canvas.width + left, y * base.height / version.canvas.height + top]));
                if (extra) setInstruction('');
            });
        });
    }

    async function download() {
        if (!version) return;
        try {
            saveBlob(await blobOf(version.canvas, version.clear), `${fileName}-v${index + 1}.${version.clear ? 'png' : 'jpg'}`);
            setVersions(list => list.map(v => v.id === version.id ? { ...v, kept: true } : v));
        } catch (e) { setError(message(e)); }
    }

    async function use() {
        if (!version || !onUse || index === 0) return;
        setBusy('Saving…'); setError('');
        try {
            const image = encode(version.canvas, version.clear);
            if (keepAs) await keepInAssets(image, keepAs);
            setVersions(list => list.map(v => v.id === version.id ? { ...v, kept: true } : v));
            await onUse(image);
        } catch (e) { setError(message(e)); }
        finally { setBusy(''); }
    }

    function keys(event: ReactKeyboardEvent) {
        const typing = (event.target as HTMLElement).matches('input, textarea');
        // Keep shortcuts here: the Studio has its own undo on Ctrl+Z.
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.stopPropagation();
            if (!typing) { event.preventDefault(); undo(); }
        }
    }

    const notePlace = (d: Draft): CSSProperties => {
        if (!shown) return {};
        const width = Math.min(260, shown.w - 12);
        const x = d.x * shown.w, y = d.y * shown.h;
        const below = y < shown.h - 130;
        return { width, left: clamp(x - width / 2, 6, Math.max(6, shown.w - width - 6)), top: below ? y + 20 : undefined, bottom: below ? undefined : shown.h - y + 20 };
    };
    const cropFrame = version && ratio && tool === 'resize' ? frameOf(version.canvas.width, version.canvas.height, ratio, shift) : null;
    const tooFew = !instruction.trim() && !notes.length;
    const strokes = marks.length - notes.length;
    const active = tools.find(t => t.id === tool)!;

    return createPortal(<dialog ref={dialog} className="ie-dialog" aria-label="Edit image" onKeyDown={keys}
        onCancel={event => { event.preventDefault(); event.stopPropagation(); requestClose(true); }}
        onClose={event => { event.stopPropagation(); if (!dialog.current?.open) onClose(); }}>
        <header className="ie-head">
            <button className="icon-button" onClick={() => requestClose()} aria-label="Close the editor" title="Close (Esc)"><X size={20} /></button>
            <div className="ie-title"><strong>Edit image</strong><span>{title ? `${title} · ` : ''}{version ? `Version ${index + 1}: ${version.label}` : 'Opening…'}</span></div>
            <div className="ie-nav" role="group" aria-label="Versions">
                <button className="icon-button" disabled={index === 0 || !!busy} onClick={() => step(-1)} aria-label="Previous version" title="Previous version"><ChevronLeft size={18} /></button>
                <span aria-live="polite">{versions.length ? `${index + 1} / ${versions.length}` : ''}</span>
                <button className="icon-button" disabled={index >= versions.length - 1 || !!busy} onClick={() => step(1)} aria-label="Next version" title="Next version"><ChevronRight size={18} /></button>
            </div>
            <button className="button button-secondary ie-download" disabled={!version || !!busy} onClick={download} title="Download this version"><Download size={16} /><span>Download</span></button>
            {onUse && <button className="button button-gradient ie-use" disabled={!version || index === 0 || !!busy} onClick={use} title={index === 0 ? 'Make a change first' : useLabel}>{useLabel}</button>}
        </header>
        {confirmLeave && <div className="ie-confirm" role="alert"><span>Leave without your AI edits? They are not saved anywhere yet.</span><button className="button button-secondary" onClick={() => setConfirmLeave(false)}>Keep editing</button><button className="button ie-leave" onClick={onClose}>Leave</button></div>}
        <div className="ie-tools" role="toolbar" aria-label="Edit tools">
            {tools.map(({ id, label, icon: Icon }) => <button key={id} className="ie-tool" aria-pressed={tool === id} disabled={!!busy} onClick={() => { setTool(id); setDraft(null); setError(''); }}><Icon size={18} /><span>{label}</span></button>)}
            <span className="ie-tools-gap" />
            <button className="ie-tool ie-tool-quiet" disabled={!marks.length || !!busy} onClick={undo} title="Undo the last mark (Ctrl+Z)"><Undo2 size={18} /><span>Undo</span></button>
            <button className="ie-tool ie-tool-quiet" disabled={!marks.length || !!busy} onClick={() => { setMarks([]); setDraft(null); }} title="Remove all marks and notes"><Trash2 size={18} /><span>Clear</span></button>
        </div>
        <div className="ie-options">
            <p className="ie-hint">{active.hint}</p>
            {(tool === 'markup' || tool === 'erase') && <label className="ie-range">Brush<input type="range" min={4} max={tool === 'erase' ? 90 : 60} value={brushSize[tool]} onChange={e => setBrushSize(size => ({ ...size, [tool]: Number(e.target.value) }))} aria-label="Brush size" /><span>{brushSize[tool]} px</span></label>}
            {tool === 'erase' && <button className="button button-secondary" disabled={!erasing || !!busy} onClick={makeSeeThrough}><Eraser size={15} /> Make see-through</button>}
            {tool === 'background' && <><label className="ie-range">Strength<input type="range" min={0} max={100} value={strength} onChange={e => setStrength(Number(e.target.value))} aria-label="How much to remove" /><span>{strength}</span></label><button className="button button-secondary" disabled={!version || !!busy} onClick={removeBg}><ImageMinus size={15} /> Remove background</button></>}
            {tool === 'resize' && <><div className="ie-ratios" role="group" aria-label="Shape">{editRatios.map(r => <button key={r.id} className={ratio?.id === r.id ? 'selected' : ''} aria-pressed={ratio?.id === r.id} onClick={() => { setRatio(r); setShift(0.5); }}><i style={{ aspectRatio: `${r.w} / ${r.h}` }} />{r.label}</button>)}</div>
                {ratio && version && (sameShape(version.canvas.width, version.canvas.height, ratio) ? <span className="ie-size">Already {ratio.label.toLowerCase()}.</span> : <>
                    <button className="button button-secondary" disabled={!!busy} onClick={crop} title="Keep the part inside the frame"><Crop size={15} /> Crop <small>{Math.round(cropFrame?.w ?? 0)} × {Math.round(cropFrame?.h ?? 0)}</small></button>
                    <button className="button button-secondary" disabled={!!busy || !ai} onClick={extend} title={ai ? 'The AI adds the missing edges' : 'Needs AI on the server'}><Expand size={15} /> Extend with AI <small>{ratio.size.replace('x', ' × ')}</small></button>
                </>)}</>}
        </div>
        <div className="ie-stage" ref={stage}>
            {loadFailed ? <p className="error-message">This picture could not be opened.</p> : !shown ? <LoaderCircle className="spin" size={26} /> : <div ref={box} className={`ie-box is-${tool}`} style={{ width: shown.w, height: shown.h }}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => { if (brush.current) brush.current.style.display = 'none'; }}
                aria-label={`Picture. ${active.hint}`}>
                <canvas ref={view} />
                {notes.map((note, i) => <button key={i} className="ie-pin" style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }} onPointerDown={e => e.stopPropagation()} onClick={() => openNote(note)} aria-label={`Note ${i + 1}: ${note.text}`} title={note.text}>{i + 1}</button>)}
                {draft && <div className="ie-note" style={notePlace(draft)} onPointerDown={e => e.stopPropagation()}>
                    <input autoFocus value={draft.text} maxLength={300} placeholder="Type a short note" aria-label="Note" onChange={e => setDraft({ ...draft, text: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveDraft(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(null); } }} />
                    <div>{draft.index !== undefined && <button className="ie-link danger" onClick={() => removeNote(marks[draft.index!] as Note)}>Delete</button>}<button className="ie-link" onClick={() => setDraft(null)}>Cancel</button><button className="button button-primary" onClick={saveDraft}>{draft.index !== undefined ? 'Save' : 'Add note'}</button></div>
                </div>}
                {cropFrame && version && <div className="ie-crop-clip"><div className="ie-crop" style={{ left: `${cropFrame.x / version.canvas.width * 100}%`, top: `${cropFrame.y / version.canvas.height * 100}%`, width: `${cropFrame.w / version.canvas.width * 100}%`, height: `${cropFrame.h / version.canvas.height * 100}%` }} /></div>}
                <div ref={brush} className={`ie-brush ${tool === 'erase' ? 'is-erase' : ''}`} />
            </div>}
            {busy && <div className="ie-busy" role="status"><span><LoaderCircle className="spin" size={22} />{busy}</span>{abort.current && <button className="button button-secondary" onClick={() => abort.current?.abort()}>Cancel</button>}</div>}
        </div>
        {notes.length > 0 && <ol className="ie-notes" aria-label="Notes">{notes.map((note, i) => <li key={i}><button onClick={() => { setTool('comment'); openNote(note); }}><b>{i + 1}</b>{note.text}</button><button className="icon-button" onClick={() => removeNote(note)} aria-label={`Delete note ${i + 1}`}><X size={13} /></button></li>)}</ol>}
        {error && <p className="error-message ie-error" role="alert">{error}</p>}
        <form className="ie-describe" onSubmit={e => { e.preventDefault(); describe(); }}>
            <div className="ie-describe-field"><label htmlFor={fieldId}>Describe edits</label>
                <textarea id={fieldId} aria-describedby={`${fieldId}-hint`} value={instruction} onChange={e => setInstruction(e.target.value)} maxLength={1000} rows={2} disabled={!!busy}
                    placeholder={ai ? 'For example: make the collar gold and the number white' : 'AI edits need AI to be connected on the server.'}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); describe(); } }} />
                <small id={`${fieldId}-hint`}>{strokes || notes.length ? `Sent with it: ${[strokes ? `${strokes} ${strokes === 1 ? 'mark' : 'marks'}` : '', notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : ''].filter(Boolean).join(' and ')}.` : 'Tip: mark up, comment or erase first to show where.'} {instruction.length}/1000</small>
            </div>
            <button className="button button-gradient" disabled={!version || !!busy || !ai || tooFew}><Sparkles size={17} /><span>Edit with AI</span></button>
        </form>
        <div className="ie-strip" role="list" aria-label="Versions">{versions.map((v, i) => <button role="listitem" key={v.id} className={v.id === currentId ? 'is-current' : ''} disabled={!!busy} onClick={() => setCurrentId(v.id)} title={v.detail || v.label} aria-current={v.id === currentId}><img src={v.thumb} alt="" /><span>{i + 1} · {v.label}</span></button>)}</div>
    </dialog>, document.body);
}

/** The "Edit image" button: opens the editor on `src` and closes it after Use. */
export function EditImageButton({ label = 'Edit image', className = 'button button-secondary', iconSize = 16, disabled, ...editor }: Omit<ImageEditorProps, 'onClose'> & { label?: string; className?: string; iconSize?: number; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className={className} disabled={disabled || !editor.src} onClick={event => { event.stopPropagation(); setOpen(true); }}
            title="Edit this image: mark up, comment, erase, remove the background, resize or describe a change" aria-label={editor.title ? `Edit image: ${editor.title}` : 'Edit image'}>
            <PenLine size={iconSize} />{label && <span>{label}</span>}
        </button>
        {open && <ImageEditor {...editor} onClose={() => setOpen(false)} onUse={editor.onUse && (async image => { await editor.onUse!(image); setOpen(false); })} />}
    </>;
}
