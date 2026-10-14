// One-page PDF design sheet for the Studio's Export menu: front and back views,
// colours (HEX / RGB / CMYK), pattern, text, number and artwork. jsPDF (MIT) is
// loaded from media/vendor only when someone downloads a sheet.
import { media } from './api';
import type { Design } from './types';

interface Pdf {
    setFont(name: string, style?: string): void;
    setFontSize(size: number): void;
    setTextColor(r: number, g: number, b: number): void;
    setFillColor(r: number, g: number, b: number): void;
    setDrawColor(r: number, g: number, b: number): void;
    setLineWidth(width: number): void;
    text(text: string | string[], x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }): void;
    rect(x: number, y: number, w: number, h: number, style?: string): void;
    roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): void;
    addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
    splitTextToSize(text: string, width: number): string[];
    output(type: 'blob'): Blob;
}
type PdfConstructor = new (options: { orientation: string; unit: string; format: string }) => Pdf;
declare global { interface Window { jspdf?: { jsPDF: PdfConstructor } } }

async function loadJsPdf(): Promise<PdfConstructor> {
    if (!window.jspdf) {
        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = media('vendor/jspdf.umd.min.js');
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Could not load the PDF tool. Please try again.'));
            document.head.append(script);
        });
    }
    if (!window.jspdf) throw new Error('Could not load the PDF tool. Please try again.');
    return window.jspdf.jsPDF;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
const rgbOf = (hex: string): [number, number, number] => { const n = parseInt((hex || '#000000').replace('#', '').slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Plain RGB to CMYK (no print profile), as on the Artboard. */
const cmykOf = ([r, g, b]: [number, number, number]) => { const k = 1 - Math.max(r, g, b) / 255; return k >= 1 ? [0, 0, 0, 100] : [...[r, g, b].map(v => Math.round(((1 - v / 255 - k) / (1 - k)) * 100)), Math.round(k * 100)]; };
/** PDF standard fonts only cover Western characters: replace the rest. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^ -ÿ–—•€]/g, '?');

/** A 3D capture on a light panel, as a JPEG (much smaller than PNG). */
async function viewImage(src: string, maxPx = 1400) {
    const img = await loadImage(src), k = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('PDF export is unavailable in this browser.');
    g.fillStyle = '#EEF2F6'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height };
}

/** `panels`: the flat front / back print panels, shown under the 3D views when available. */
export interface SheetInfo { name: string; sport: string; garment: string; version: number; design: Design; front: string; back: string; panels?: string | null }
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function designSheetPdf(info: SheetInfo): Promise<Blob> {
    const JsPdf = await loadJsPdf();
    const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210, M = 12, d = info.design;

    // Header band
    pdf.setFillColor(11, 21, 32); pdf.rect(0, 0, W, 24, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(18, 225, 240); pdf.text('3DEEZI', M, 15);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(255, 255, 255); pdf.text('DESIGN SHEET', M + 34, 15);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text(safe(info.name || 'Untitled kit'), W - M, 11.5, { align: 'right' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(185, 200, 214);
    pdf.text(safe(`${info.sport} · ${info.garment} · Version ${info.version} · ${new Date().toLocaleDateString()}`), W - M, 18.5, { align: 'right' });

    // Front and back views (panels sized to the captures), then the print panels underneath
    const top = 32, boxW = 91, gap = 6, bottom = H - 14;
    type Shot = Awaited<ReturnType<typeof viewImage>>;
    const panel = (label: string, im: Shot, x: number, y: number, w: number, h: number) => {
        pdf.setFillColor(238, 242, 246); pdf.roundedRect(x, y, w, h, 3, 3, 'F');
        const k = Math.min((w - 6) / im.w, (h - 12) / im.h), iw = im.w * k, ih = im.h * k;
        pdf.addImage(im.data, 'JPEG', x + (w - iw) / 2, y + 3 + (h - 12 - ih) / 2, iw, ih);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(93, 107, 123); pdf.text(label, x + w / 2, y + h - 3.5, { align: 'center' });
    };
    const front = await viewImage(info.front), back = await viewImage(info.back);
    const boxH = Math.min(boxW * (front.h / front.w), 120) + 12;
    panel('FRONT', front, M, top, boxW, boxH);
    panel('BACK', back, M + boxW + gap, top, boxW, boxH);
    if (info.panels && bottom - (top + boxH + gap) > 30) panel('PRINT PANELS', await viewImage(info.panels, 1800), M, top + boxH + gap, 2 * boxW + gap, bottom - (top + boxH + gap));

    // Details column
    const x0 = M + 2 * (boxW + gap) + 2, colW = W - M - x0;
    let y = top + 4;
    const heading = (t: string) => { if (y > bottom) return; y += 1.5; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(30, 123, 255); pdf.text(t, x0, y); y += 5; };
    const row = (label: string, value: string) => {
        if (y > bottom) return;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(20, 30, 40); pdf.text(label, x0, y);
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 72, 86);
        const lines = pdf.splitTextToSize(safe(value || '—'), colW - 27).slice(0, 3);
        pdf.text(lines, x0 + 27, y); y += 4.4 * lines.length;
    };
    heading('COLOURS');
    const colours: [string, string][] = [['Primary', d.main], ['Secondary', d.secondary], ['Accent', d.accent], ['Pattern', d.patternColor || d.secondary]];
    for (const [label, hex] of colours) {
        const rgb = rgbOf(hex);
        pdf.setFillColor(...rgb); pdf.setDrawColor(200, 208, 216); pdf.setLineWidth(0.2); pdf.roundedRect(x0, y - 3.8, 9, 9, 1.2, 1.2, 'FD');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(20, 30, 40); pdf.text(`${label}  ${(hex || '').toUpperCase()}`, x0 + 12, y);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(93, 107, 123); pdf.text(`RGB ${rgb.join(', ')}   CMYK ${cmykOf(rgb).join(', ')}`, x0 + 12, y + 3.8);
        y += 11;
    }
    if (d.gradient) row('Gradient', `${d.gradient.from.toUpperCase()} to ${d.gradient.to.toUpperCase()}, ${d.gradient.angle}°`);
    heading('PATTERN');
    row('Style', d.pattern);
    if (d.patternScale) row('Size', `${Math.round(d.patternScale * 100)}%`);
    if (d.patternImage) row('Custom', 'Pattern image');
    // Patterns set on single areas of the garment (body, yoke, sleeves, sides, hem).
    for (const [zone, pattern] of Object.entries(d.zones ?? {})) if (pattern) row(title(zone), title(String(pattern)));
    heading('TEXT AND NUMBER');
    row('Front text', d.logoText);
    row('Back name', d.backName ?? '');
    row('Number', d.number);
    heading('ARTWORK');
    row('Logo', d.logoImage ? 'Yes' : 'None');
    row('Sponsor', d.sponsorImage ? 'Yes' : 'None');
    if (d.layers?.length) row('Layers', d.layers.map(l => l.name || l.text || l.type).join(', '));

    // Footer
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(127, 147, 166);
    pdf.text('Design review sheet from 3DEEZI · not a production tech pack', M, H - 7);
    pdf.text(safe(`Generated ${new Date().toLocaleString()}`), W - M, H - 7, { align: 'right' });
    return pdf.output('blob');
}
