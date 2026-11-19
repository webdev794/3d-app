import { useLayoutEffect, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import '../../css/quick-pills.css';

/** The Artboard's quick-access icons (artboard/src/icons.js qaAi, qaTee, qaHome), drawn the same way. */
export function PillIcon({ kind }: { kind: 'ai' | 'dyo' | 'home' }) {
  return <svg className="qp-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g transform="matrix(1.2 0 0 1.2 -2.4 -2.4)">
    {kind === 'ai' && <><path d="M9.5 4.5C9.5 9.4 11.6 12 16.5 12C11.6 12 9.5 14.6 9.5 19.5C9.5 14.6 7.4 12 2.5 12C7.4 12 9.5 9.4 9.5 4.5Z" /><path d="M18 2.3C18 4.2 18.9 5.2 20.8 5.2C18.9 5.2 18 6.2 18 8.1C18 6.2 17.1 5.2 15.2 5.2C17.1 5.2 18 4.2 18 2.3Z" /><path d="M18 15.1C18 17 18.9 18 20.8 18C18.9 18 18 19 18 20.9C18 19 17.1 18 15.2 18C17.1 18 18 17 18 15.1Z" /></>}
    {kind === 'dyo' && <path d="M8.7 3.7L4.1 5.9L2.7 10.1L6.4 11.1V20.4H17.6V11.1L21.3 10.1L19.9 5.9L15.3 3.7C14.7 5.3 13.5 6.1 12 6.1C10.5 6.1 9.3 5.3 8.7 3.7Z" />}
    {kind === 'home' && <><path d="M2.4 11.6L12 3.6L21.6 11.6" strokeWidth="2.3" /><path fill="currentColor" stroke="none" d="M5.6 12.4L12 7.1L18.4 12.4V20.6H14.3V15.4H9.7V20.6H5.6Z" /></>}
  </g></svg>;
}

/** AI · DYO · HOME as on the Artboard's top bar (quick-pills.css). The words are pictures (masks), so each pill keeps
 *  its name for screen readers and for the icons-only sizes. */
export function QuickPills({ onStart }: { onStart: (mode: 'ai' | 'dyo') => void }) {
  return <span className="quick-tabs" role="group" aria-label="Quick access">
    <button type="button" className="quick-tab qp-ai" aria-label="AI" title="AI Powered Sportswear: describe your kit and AI designs it" onClick={() => onStart('ai')}><PillIcon kind="ai" /><span className="qp-word" aria-hidden="true">AI</span></button>
    <button type="button" className="quick-tab qp-dyo" aria-label="DYO" title="Design Your Own: choose a sport and garment, then design it in 3D" onClick={() => onStart('dyo')}><PillIcon kind="dyo" /><span className="qp-word" aria-hidden="true">DYO</span></button>
    <NavLink className="quick-tab qp-home" to="/" end aria-label="Home" title="Home: the 3DEEZI start page"><PillIcon kind="home" /><span className="qp-word" aria-hidden="true">HOME</span></NavLink>
  </span>;
}

const FITS = 5; // data-fit 0…5, see quick-pills.css
/** True when something in the header runs into its neighbour, past the header's edge, or onto a second line. */
function spills(header: HTMLElement): boolean {
  const inner = header.querySelector<HTMLElement>('.header-inner');
  if (!inner) return false;
  if (inner.scrollWidth > inner.clientWidth + 0.5) return true;
  const shown = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0;
  const nav = header.querySelector<HTMLElement>('.main-nav');
  const navInline = shown(nav) && getComputedStyle(nav).position !== 'absolute';
  const groups: HTMLElement[][] = [];
  const brand = header.querySelector('.brand'); if (shown(brand)) groups.push([brand]);
  if (navInline) groups.push([...nav.children].filter(shown).filter(el => !el.classList.contains('nav-quick')));
  const actions = header.querySelector('.header-actions');
  if (actions) groups.push([...actions.children].filter(shown).flatMap(el => el.classList.contains('quick-tabs') ? [...el.children].filter(shown) : [el]));
  const box = inner.getBoundingClientRect();
  const cs = getComputedStyle(inner);
  const minL = box.left + (parseFloat(cs.paddingLeft) || 0) - 0.5, maxR = box.right - (parseFloat(cs.paddingRight) || 0) + 0.5;
  const items = groups.flatMap((g, gi) => g.map(el => ({ el, gi, r: el.getBoundingClientRect() })));
  for (const it of items) {
    if (it.r.left < minL || it.r.right > maxR) return true;
    // A button or link on two lines (a word wrapped) is taller than it should be.
    if (it.el.matches('.button, .quick-tab, .account-link') && it.r.height > 56) return true;
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i].r, b = items[j].r;
    const room = items[i].gi === items[j].gi ? 2 : 10; // more air between the logo, the links and the buttons
    if (a.left < b.right + room && b.left < a.right + room && a.top < b.bottom && b.top < a.bottom) return true;
  }
  return false;
}

/** Shows as much of the pills as the header has room for: the first data-fit level that fits. */
export function fitHeader(header: HTMLElement | null) {
  if (!header) return;
  for (let level = 0; level <= FITS; level++) {
    header.dataset.fit = String(level);
    if (level === FITS || !spills(header)) break;
  }
}

/** Fits the header now (before it is painted), when the window or anything in the header changes size, and once the
 *  web fonts have loaded. `deps`: what changes the header's contents (the user, the page). */
export function useHeaderFit(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    let last = '';
    const key = () => { const inner = header.querySelector('.header-inner'); return `${window.innerWidth}|${inner ? [...inner.children].map(c => Math.round(c.getBoundingClientRect().width)).join(',') : ''}`; };
    const run = () => { fitHeader(header); last = key(); };
    run();
    // The bell, the account name and the fonts arrive later; refit only when a width really changed (no loop).
    const ro = new ResizeObserver(() => { if (key() !== last) run(); });
    ro.observe(header);
    header.querySelectorAll('.header-inner > *').forEach(el => ro.observe(el));
    const actions = header.querySelector('.header-actions'); if (actions) ro.observe(actions);
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) run(); });
    window.addEventListener('resize', run);
    return () => { alive = false; ro.disconnect(); window.removeEventListener('resize', run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
