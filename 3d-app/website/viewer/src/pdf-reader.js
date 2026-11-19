// pdf.js for reading print layouts, built into its own file (pdf-reader.js beside the viewer) and loaded only
// when a PDF is opened. The PDF is read on the page itself (no separate worker file), so it works the same in
// the website and in the apps. A plain script (not a module), so it also loads where the viewer is a local
// file (the apps' WebViews), and hands pdf.js over as globalThis.pdfjsReader.
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import * as worker from 'pdfjs-dist/build/pdf.worker.mjs';

globalThis.pdfjsWorker = worker;
globalThis.pdfjsReader = pdfjs;
