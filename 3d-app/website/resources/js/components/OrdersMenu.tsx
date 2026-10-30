import NavMenu, { type NavMenuItem } from './NavMenu';

/* The three cyan line icons of the client's menu design (2026-10-20). */
const line = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
/** A form with a sparkle: the order form 3DEEZI ASSIST fills in. */
const FormIcon = () => <svg {...line}><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2H12" /><path d="M19 13V7.5l-5-5" /><path d="M14 2.5V6a1.5 1.5 0 0 0 1.5 1.5H19" /><path d="M8 11h7M8 14.5h4.5" /><path d="M18 14.5q.6 2.9 3.5 3.5-2.9.6-3.5 3.5-.6-2.9-3.5-3.5 2.9-.6 3.5-3.5Z" fill="currentColor" strokeWidth={1} /></svg>;
/** An arrow up out of a tray: upload. */
const UploadIcon = () => <svg {...line}><path d="M4 14.5v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M12 15.5v-12M7.5 8 12 3.5 16.5 8" /></svg>;
/** A board with two columns: the orders and their progress. */
const BoardIcon = () => <svg {...line}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M12 8v8M5.5 9H9M5.5 12H9M15 9h3M15 12h2.5" /><path d="M5.5 15h2" opacity=".5" /></svg>;

const items: NavMenuItem[] = [
  { to: '/orders/new', title: 'Create Order Form', text: 'Build an order with 3DEEZI Assist', Icon: FormIcon },
  { to: '/orders/upload', title: 'Upload Your Order', text: 'Submit your form and artwork', Icon: UploadIcon },
  { to: '/orders', title: 'My Orders', text: 'View your orders and progress', Icon: BoardIcon },
];

/** The Orders page (client design 2026-10-21): "ORDER NOW WITH 3DEEZI" with the three ways to order. */
export const ORDERS_PAGE = '/order-now';

const isActive = (pathname: string) => pathname === ORDERS_PAGE || pathname === '/orders' || pathname.startsWith('/orders/');
/** My Orders is lit on every order page except the order form and the upload page (they have their own items). */
const isCurrent = (to: string, pathname: string) => to === '/orders'
  ? isActive(pathname) && !items.some(item => item.to !== to && pathname.startsWith(item.to))
  : pathname === to || pathname.startsWith(`${to}/`);

/**
 * "Orders" in the site header with its menu (NavMenu.tsx): Create Order Form, Upload Your Order and My Orders.
 * The word "Orders" opens the Orders page (/order-now, client 2026-10-21); hovering it or its small chevron opens the
 * dropdown. Folded header (tablets and phones): Orders is a row of the header menu with the three links listed under it.
 */
export default function OrdersMenu({ onNavigate }: { onNavigate?: () => void }) {
  return <NavMenu kind="orders" label="Orders" page={ORDERS_PAGE} items={items} isActive={isActive} isCurrent={isCurrent} onNavigate={onNavigate} />;
}
