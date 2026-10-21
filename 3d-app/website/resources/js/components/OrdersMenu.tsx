import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import '../../css/orders-menu.css';

/* The three cyan line icons of the client's menu design (2026-10-20). */
const line = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
/** A form with a sparkle: the order form 3DEEZI ASSIST fills in. */
const FormIcon = () => <svg {...line}><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2H12" /><path d="M19 13V7.5l-5-5" /><path d="M14 2.5V6a1.5 1.5 0 0 0 1.5 1.5H19" /><path d="M8 11h7M8 14.5h4.5" /><path d="M18 14.5q.6 2.9 3.5 3.5-2.9.6-3.5 3.5-.6-2.9-3.5-3.5 2.9-.6 3.5-3.5Z" fill="currentColor" strokeWidth={1} /></svg>;
/** An arrow up out of a tray: upload. */
const UploadIcon = () => <svg {...line}><path d="M4 14.5v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M12 15.5v-12M7.5 8 12 3.5 16.5 8" /></svg>;
/** A board with two columns: the orders and their progress. */
const BoardIcon = () => <svg {...line}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M12 8v8M5.5 9H9M5.5 12H9M15 9h3M15 12h2.5" /><path d="M5.5 15h2" opacity=".5" /></svg>;

const items = [
  { to: '/orders/new', title: 'Create Order Form', text: 'Build an order with 3DEEZI Assist', Icon: FormIcon },
  { to: '/orders/upload', title: 'Upload Your Order', text: 'Submit your form and artwork', Icon: UploadIcon },
  { to: '/orders', title: 'My Orders', text: 'View your orders and progress', Icon: BoardIcon },
];

/** At 1160 px and below the header folds its links into the menu button (app.css, orders-menu.css); there Orders opens as a group inside that menu. */
const FOLDED = '(max-width: 1160px)';
/** Hover delays, so passing over "Orders" does not flicker the menu open and shut. */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 260;

/**
 * "Orders" in the site header with its menu: Create Order Form, Upload Your Order and My Orders.
 * Desktop: a dropdown that opens on hover (after a short delay) or on click/tap and closes on an outside click,
 * Escape or a choice. Folded header (tablets and phones): an expandable group in the header menu.
 * Keyboard: Enter, Space or the arrow keys open it; Tab and the arrow keys move through the items; Enter opens one.
 */
export default function OrdersMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(() => window.matchMedia(FOLDED).matches);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const timer = useRef(0);
  /** Opened by a click, tap or key (not by hover): it stays open when the pointer leaves. */
  const pinned = useRef(false);
  const focusOnOpen = useRef<number | null>(null);
  const id = useId();
  const active = pathname === '/orders' || pathname.startsWith('/orders/');
  const isCurrent = (to: string) => to === '/orders'
    ? active && !items.some(item => item.to !== to && pathname.startsWith(item.to))
    : pathname === to || pathname.startsWith(`${to}/`);

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
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current !== null) { focusItem(focusOnOpen.current); focusOnOpen.current = null; }
    if (folded) root.current?.querySelector('.nav-orders-panel')?.scrollIntoView({ block: 'nearest' });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const hadFocus = !!root.current?.contains(document.activeElement);
      close();
      if (hadFocus) trigger.current?.focus();
    };
    // Inside the folded header menu the group stays open until Orders is pressed again.
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
  function onTriggerClick(e: MouseEvent) {
    const byKey = e.detail === 0; // Enter or Space
    if (!open) openPinned(byKey && !folded ? 0 : null);
    else if (!folded && !pinned.current) { if (byKey) openPinned(0); } // the hover opened it: a click keeps it open
    else close();
  }
  function onTriggerKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
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

  return <div ref={root} className={`nav-orders${open ? ' is-open' : ''}`} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onBlur={onBlur}>
    <button ref={trigger} type="button" id={`${id}-button`} className={`nav-orders-trigger${active ? ' is-active' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`} onClick={onTriggerClick} onKeyDown={onTriggerKeyDown}>
      Orders<ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
    </button>
    <div className="nav-orders-panel" id={`${id}-menu`} role="menu" aria-labelledby={`${id}-button`} onKeyDown={onMenuKeyDown}>
      {items.map(({ to, title, text, Icon }, index) => <Link key={to} ref={link => { links.current[index] = link; }} to={to} role="menuitem" className="nav-orders-item" aria-current={isCurrent(to) ? 'page' : undefined} aria-labelledby={`${id}-title-${index}`} aria-describedby={`${id}-text-${index}`} onClick={choose}>
        <Icon />
        <span><span className="nav-orders-title" id={`${id}-title-${index}`}>{title}</span><span className="nav-orders-text" id={`${id}-text-${index}`}>{text}</span></span>
      </Link>)}
    </div>
  </div>;
}
