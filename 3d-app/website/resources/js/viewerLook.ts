/**
 * The 3D look preview (2026-10-23). The 3D viewer's step-2 look (cloth folds, a display mannequin, studio light) is
 * shown only on a device that asked for it: open any page of the website with ?look=2 (remembered on this device);
 * ?look=1 goes back to the default look. KitViewer passes the choice to the viewer as its own &look=. Without one the
 * viewer shows its default (LOOK_DEFAULT in website/viewer/src/main.js), which the apps always get.
 */
const KEY = '3deezi.look';
let chosen: string | null = null;

/** Keeps a ?look=1 or ?look=2 from the page's address for this device. */
export function rememberLook(search = window.location.search) {
    const look = new URLSearchParams(search).get('look');
    if (look !== '1' && look !== '2') return;
    chosen = look;
    try { localStorage.setItem(KEY, look); } catch { /* storage blocked: this visit only */ }
}

/** The viewer's look parameter for this device ('' = the viewer's own default). */
export function viewerLook(): string {
    let look = chosen;
    try { look = localStorage.getItem(KEY) ?? look; } catch { /* storage blocked: this visit only */ }
    return (look === '1' || look === '2' ? `&look=${look}` : '') + viewerHq();
}

/**
 * The "High quality" jersey preview (2026-10-26): open any page with ?hq=1 to see the jersey as the professional
 * garment model on this device (remembered), ?hq=0 to go back. KitViewer passes it to the viewer as &hq=1. The apps
 * never send it.
 */
const HQ_KEY = '3deezi.hq';
let hqChosen: string | null = null;

/** Keeps a ?hq=1 or ?hq=0 from the page's address for this device. */
export function rememberHq(search = window.location.search) {
    const hq = new URLSearchParams(search).get('hq');
    if (hq !== '0' && hq !== '1') return;
    hqChosen = hq;
    try { localStorage.setItem(HQ_KEY, hq); } catch { /* storage blocked: this visit only */ }
}

/** The viewer's HQ jersey parameter for this device ('' = the default jersey). */
function viewerHq(): string {
    let hq = hqChosen;
    try { hq = localStorage.getItem(HQ_KEY) ?? hq; } catch { /* storage blocked: this visit only */ }
    return hq === '1' ? '&hq=1' : '';
}

rememberLook();
rememberHq();
