import { useEffect, useId, useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import '../../css/orders-menu.css';

/** One link in a header menu: where it goes, its name, a short line about it and its cyan line icon. */
export interface NavMenuItem { to: string; title: string; text: string; Icon: ComponentType }

/** At 1160 px and below the header folds its links into the menu button (app.css, orders-menu.css); there a menu opens as a group inside that menu. */
const FOLDED = '(max-width: 1160px)';
/** Hover delays, so passing over a menu's word does not flicker the menu open and shut. */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 260;
/** The header menus on the page: opening one shuts the others at once, so two never show together. */
const menus = new Set<(kind: string) => void>();

/**
 * A word in the site header with its menu: ORDERS (OrdersMenu.tsx) and PROJECTS (ProjectsMenu.tsx). The word opens
 * `page`. Desktop: the dropdown opens on hover (after a short delay) or with the small chevron next to the word, and
 * closes on an outside click, Escape or a choice. Folded header (tablets and phones): the word is a row of the header
 * menu with its links always listed under it. Keyboard: the arrow keys on the word, or Enter/Space on the chevron,
 * open the dropdown; Tab and the arrow keys move through the items; Enter opens one.
 * Every part has two classes: `nav-menu-…` for the look (orders-menu.css) and `nav-<kind>-…` to tell the menus apart
 * (ORDERS keeps its `nav-orders-…` names).
 */
export default function NavMenu({ kind, label, page, items, isActive, isCurrent, onNavigate }: {
  kind: string;
  label: string;
  page: string;
  items: NavMenuItem[];
  /** True on the pages of this menu: the word is lit. */
  isActive: (pathname: string) => boolean;
  /** True for the item of the page showing (default: its address or one under it). */
  isCurrent?: (to: string, pathname: string) => boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(() => window.matchMedia(FOLDED).matches);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const timer = useRef(0);
  /** Opened by a click, tap or key (not by hover): it stays open when the pointer leaves. */
  const pinned = useRef(false);
  const focusOnOpen = useRef<number | null>(null);
  const id = useId();
  const active = isActive(pathname);
  const current = (to: string) => isCurrent ? isCurrent(to, pathname) : pathname === to || pathname.startsWith(`${to}/`);
  const cls = (part = '') => `nav-menu${part} nav-${kind}${part}`;

  const clearTimer = () => window.clearTimeout(timer.current);
  const close = () => { clearTimer(); pinned.current = false; setOpen(false); };
  /** Focuses item `index` (wrapping, so -1 is the last). */
  const focusItem = (index: number) => {
    const list = links.current.filter((link): link is HTMLAnchorElement => !!link);
    list[(index + list.length) % list.length]?.focus();
  };
  const openPinned = (focus: number | null) => {
    clearTimer(); pinned.current = true;
    if (open) { if (focus !== null) focusItem(focus); return; }
    focusOnOpen.current = focus; setOpen(true);
  };

  useEffect(() => {
    const query = window.matchMedia(FOLDED);
    const update = () => setFolded(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  // A new page, or the header folding or unfolding, starts with the menu shut.
  useEffect(() => { clearTimer(); pinned.current = false; setOpen(false); }, [pathname, folded]);
  useEffect(() => () => clearTimer(), []);
  // Another header menu opening shuts this one at once (e.g. the pointer moving from PROJECTS to ORDERS).
  useEffect(() => {
    const shut = (other: string) => { if (other !== kind) { clearTimer(); pinned.current = false; setOpen(false); } };
    menus.add(shut);
    return () => { menus.delete(shut); };
  }, [kind]);
  useEffect(() => { if (open) menus.forEach(shut => shut(kind)); }, [open, kind]);
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current !== null) { focusItem(focusOnOpen.current); focusOnOpen.current = null; }
    if (folded) root.current?.querySelector('.nav-menu-panel')?.scrollIntoView({ block: 'nearest' });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const hadFocus = !!root.current?.contains(document.activeElement);
      close();
      if (hadFocus) (toggle.current ?? trigger.current)?.focus();
    };
    const onPointerDown = (e: globalThis.PointerEvent) => { if (!folded && !root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointerDown); };
  }, [open, folded]);

  function onPointerEnter(e: PointerEvent) {
    if (folded || e.pointerType !== 'mouse') return;
    clearTimer();
    if (!open) timer.current = window.setTimeout(() => { pinned.current = false; setOpen(true); }, OPEN_DELAY);
  }
  function onPointerLeave(e: PointerEvent) {
    if (folded || e.pointerType !== 'mouse') return;
    clearTimer();
    if (open && !pinned.current) timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
  }
  /** The chevron (desktop): opens or shuts the dropdown. */
  function onToggleClick(e: MouseEvent) {
    const byKey = e.detail === 0; // Enter or Space
    if (!open) openPinned(byKey ? 0 : null);
    else if (!pinned.current) { if (byKey) openPinned(0); } // the hover opened it: a click keeps it open
    else close();
  }
  function onTriggerKeyDown(e: KeyboardEvent) {
    if (folded || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    openPinned(e.key === 'ArrowDown' ? 0 : -1);
  }
  function onMenuKeyDown(e: KeyboardEvent) {
    const index = links.current.indexOf(document.activeElement as HTMLAnchorElement);
    const go = (to: number) => { e.preventDefault(); focusItem(to); };
    if (e.key === 'ArrowDown') go(index + 1);
    else if (e.key === 'ArrowUp') go(index < 0 ? -1 : index - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === ' ' && index >= 0) { e.preventDefault(); links.current[index]?.click(); }
  }
  function onBlur(e: FocusEvent) {
    // Tabbing out of the dropdown closes it (a click elsewhere is handled by the pointer listener).
    const next = e.relatedTarget as Node | null;
    if (open && !folded && next && !root.current?.contains(next)) close();
  }
  function choose() { close(); onNavigate?.(); }

  // Folded (tablets and phones) the links are always listed under the word, as a plain list.
  const menu = !folded;
  return <div ref={root} className={`${cls()}${open || folded ? ' is-open' : ''}${folded ? ' is-folded' : ''}`} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onBlur={onBlur}>
    <Link ref={trigger} to={page} id={`${id}-button`} className={`${cls('-trigger')}${active ? ' is-active' : ''}${open ? ' is-open' : ''}`} aria-current={pathname === page ? 'page' : undefined} onClick={choose} onKeyDown={onTriggerKeyDown}>{label}</Link>
    {menu && <button ref={toggle} type="button" className={`${cls('-toggle')}${open ? ' is-open' : ''}`} aria-label={`${label} menu`} aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`} onClick={onToggleClick} onKeyDown={onTriggerKeyDown}>
      <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
    </button>}
    <div className={cls('-panel')} id={`${id}-menu`} role={menu ? 'menu' : undefined} aria-label={label} onKeyDown={menu ? onMenuKeyDown : undefined}>
      {items.map(({ to, title, text, Icon }, index) => <Link key={to} ref={link => { links.current[index] = link; }} to={to} role={menu ? 'menuitem' : undefined} className={cls('-item')} aria-current={current(to) ? 'page' : undefined} aria-labelledby={`${id}-title-${index}`} aria-describedby={`${id}-text-${index}`} onClick={choose}>
        <Icon />
        <span><span className={cls('-title')} id={`${id}-title-${index}`}>{title}</span><span className={cls('-text')} id={`${id}-text-${index}`}>{text}</span></span>
      </Link>)}
    </div>
  </div>;
}
