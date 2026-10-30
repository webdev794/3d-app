import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, UserRound, UserRoundPen } from 'lucide-react';
import type { User } from '../api';
import '../../css/account-menu.css';

/**
 * The account menu (client 2026-10-26): the signed-in user's first letter in a circle in the header opens Dashboard,
 * My profile, Edit profile and Sign out (DASHBOARD left the top menu bar). It looks like the PROJECTS ▾ and ORDERS ▾
 * dropdowns (NavMenu.tsx, orders-menu.css) and works the same by keyboard: Enter, Space or the arrow keys on the
 * circle open it, the arrow keys, Home and End move through it, Escape shuts it and goes back to the circle, Tab out
 * or a click elsewhere shuts it. A click or tap on the circle opens and shuts it. The ☰ menu (tablets and phones)
 * lists the same four as an Account group (AccountGroup below).
 */
interface AccountItem { to: string; title: string; text: string; Icon: ComponentType }
const ITEMS: AccountItem[] = [
  { to: '/dashboard', title: 'Dashboard', text: 'Your kits, drafts and assets at a glance', Icon: LayoutDashboard },
  { to: '/profile', title: 'My profile', text: 'Your account details', Icon: UserRound },
  { to: '/profile/edit', title: 'Edit profile', text: 'Change your name, email or password', Icon: UserRoundPen },
];
const SIGN_OUT_TEXT = 'Sign out of 3DEEZI on this device';
/** The pages of this menu: the circle is lit on them. */
const isAccountPage = (pathname: string) => ITEMS.some(item => pathname === item.to);
export const initial = (user: User) => (user.name.trim() || user.email).slice(0, 1).toUpperCase();
/** The panel never runs past the screen's edge (16 px gutter). */
const GUTTER = 16;

export default function AccountMenu({ user, onSignOut, onOpen }: { user: User; onSignOut: () => void; onOpen?: () => void }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const circle = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const focusOnOpen = useRef<number | null>(null);
  const id = useId();
  const firstName = user.name.trim().split(/\s+/)[0] || user.email;

  const focusItem = (index: number) => {
    const list = items.current.filter((item): item is HTMLElement => !!item);
    list[(index + list.length) % list.length]?.focus();
  };
  const close = () => setOpen(false);
  const show = (focus: number | null) => {
    if (open) { if (focus !== null) focusItem(focus); return; }
    focusOnOpen.current = focus; setOpen(true); onOpen?.();
  };

  // A new page starts with the menu shut.
  useEffect(() => { setOpen(false); }, [pathname]);
  // Under the circle, inside the screen: the panel's place and its pointer (--tip) are measured on opening and when
  // the window changes size.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = root.current?.getBoundingClientRect(), dot = circle.current?.getBoundingClientRect(), el = panel.current;
      if (!box || !dot || !el) return;
      const width = el.offsetWidth, centre = dot.left + dot.width / 2;
      const left = Math.max(GUTTER, Math.min(centre + 34 - width, window.innerWidth - GUTTER - width));
      // 10 px under the header, as the other header dropdowns.
      const header = root.current?.closest('.site-header')?.getBoundingClientRect();
      el.style.top = `${Math.round((header ? header.bottom : box.bottom) - box.top + 10)}px`;
      el.style.left = `${Math.round(left - box.left)}px`;
      el.style.setProperty('--tip', `${Math.round(centre - left)}px`);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current !== null) { focusItem(focusOnOpen.current); focusOnOpen.current = null; }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const hadFocus = !!root.current?.contains(document.activeElement);
      close();
      if (hadFocus) button.current?.focus();
    };
    const onPointerDown = (e: globalThis.PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointerDown); };
  }, [open]);

  function onButtonClick(e: MouseEvent) {
    const byKey = e.detail === 0; // Enter or Space
    if (!open) show(byKey ? 0 : null);
    else if (byKey) focusItem(0);
    else close();
  }
  function onButtonKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    show(e.key === 'ArrowDown' ? 0 : -1);
  }
  function onMenuKeyDown(e: KeyboardEvent) {
    const index = items.current.indexOf(document.activeElement as HTMLElement);
    const go = (to: number) => { e.preventDefault(); focusItem(to); };
    if (e.key === 'ArrowDown') go(index + 1);
    else if (e.key === 'ArrowUp') go(index < 0 ? -1 : index - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === ' ' && index >= 0 && items.current[index]?.tagName === 'A') { e.preventDefault(); items.current[index]?.click(); }
  }
  function onBlur(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (open && next && !root.current?.contains(next)) close();
  }

  return <div ref={root} className={`account-menu${open ? ' is-open' : ''}`} onBlur={onBlur}>
    <button ref={button} type="button" className={`account-link${open ? ' is-open' : ''}${isAccountPage(pathname) ? ' is-active' : ''}`} aria-label={`Account menu: ${user.name || user.email}`} title={`${user.name || user.email} · account`} aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`} onClick={onButtonClick} onKeyDown={onButtonKeyDown}>
      <span ref={circle} className="avatar" aria-hidden="true">{initial(user)}</span><span aria-hidden="true">{firstName}</span>
    </button>
    <div ref={panel} className="account-menu-panel" id={`${id}-menu`} role="menu" aria-label="Account" onKeyDown={onMenuKeyDown}>
      <div className="account-menu-who" aria-hidden="true"><span className="avatar">{initial(user)}</span><span><strong>{user.name || user.email}</strong><small>{user.email}</small></span></div>
      {ITEMS.map(({ to, title, text, Icon }, index) => <Link key={to} ref={el => { items.current[index] = el; }} to={to} role="menuitem" className="account-menu-item" aria-current={pathname === to ? 'page' : undefined} onClick={close}>
        <Icon /><span><span className="account-menu-title">{title}</span><span className="account-menu-text">{text}</span></span>
      </Link>)}
      <button ref={el => { items.current[ITEMS.length] = el; }} type="button" role="menuitem" className="account-menu-item account-menu-signout" onClick={() => { close(); onSignOut(); }}>
        <LogOut /><span><span className="account-menu-title">Sign out</span><span className="account-menu-text">{SIGN_OUT_TEXT}</span></span>
      </button>
    </div>
  </div>;
}

/**
 * The same four in the ☰ menu (1160 px and narrower), as an Account group at the end of the menu, styled like the
 * folded PROJECTS and ORDERS groups (orders-menu.css). Hidden on wider screens, where the circle's dropdown does it.
 */
export function AccountGroup({ user, onSignOut, onNavigate }: { user: User; onSignOut: () => void; onNavigate: () => void }) {
  const { pathname } = useLocation();
  return <div className="nav-menu nav-account is-open is-folded account-group" role="group" aria-label="Account">
    <span className="nav-menu-trigger nav-account-trigger"><span className="avatar" aria-hidden="true">{initial(user)}</span>Account</span>
    <div className="nav-menu-panel nav-account-panel">
      {ITEMS.map(({ to, title, text, Icon }) => <Link key={to} to={to} className="nav-menu-item nav-account-item" aria-current={pathname === to ? 'page' : undefined} onClick={onNavigate}>
        <Icon /><span><span className="nav-menu-title">{title}</span><span className="nav-menu-text">{text}</span></span>
      </Link>)}
      <button type="button" className="nav-menu-item nav-account-item account-group-signout" onClick={() => { onNavigate(); onSignOut(); }}>
        <LogOut /><span><span className="nav-menu-title">Sign out</span><span className="nav-menu-text">{SIGN_OUT_TEXT}</span></span>
      </button>
    </div>
  </div>;
}
