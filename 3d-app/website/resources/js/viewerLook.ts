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
    return look === '1' || look === '2' ? `&look=${look}` : '';
}

rememberLook();
