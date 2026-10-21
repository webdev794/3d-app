import { useEffect, useState } from 'react';
import OrderNow, { type MiniCard, type MiniColumn } from '../components/OrderNow';
import { STAGES, readBoard, type BoardData, type BoardOrder } from '../components/orderBoardModel';
import { orderApi } from '../orderApi';
import { provideAssistContext } from '../assistBridge';
import type { User } from '../api';
import '../../css/orders-landing.css';

/** The chips are small: "3DZ-01101" shows as "#1101" (the full reference is on My Orders). */
export const shortRef = (number: string) => `#${number.replace(/^3DZ-0*/i, '') || number}`;
/** How far along each stage is, for the progress bars on the My Orders card. */
const PROGRESS: Record<string, number> = { received: 0.18, design: 0.5, production: 0.75 };
/** Garment ids the card pictures know; anything else is drawn as a jersey. */
const PICTURES = ['jersey', 'tee', 'polo', 'singlet', 'shorts', 'hoodie', 'jacket', 'warmup', 'cap', 'fullkit'];

/** The first three stages of the customer's own board, as the My Orders card shows them (null: no orders yet). */
export function miniBoard(board: BoardData): MiniColumn[] | null {
  const shown = STAGES.slice(0, 3);
  if (!shown.some(s => board.columns[s.key].length)) return null;
  return shown.map(stage => {
    const orders = board.columns[stage.key];
    return {
      name: stage.short, count: orders.length,
      cards: orders.slice(0, 3).map((order: BoardOrder): MiniCard => {
        const garment = order.garments[0]?.garment ?? 'jersey';
        return { key: order.id, name: order.name || 'Order', ref: shortRef(order.number), garment: PICTURES.includes(garment) ? garment : 'jersey', tone: 'dark', progress: PROGRESS[stage.key] ?? 0.2, hot: order.action === 'review_design' || order.approval === 'review' };
      }),
    };
  });
}

/**
 * The Orders page (/order-now; ORDERS in the header opens it, client design 2026-10-21): "ORDER NOW WITH 3DEEZI"
 * with the three ways to order, the same section as on the homepage, larger and on the studio background. Signed in,
 * the My Orders card shows the customer's own orders (the order board API); signed out, the sample board. The cards
 * open Create Order Form, Upload Your Order and My Orders, which ask signed-out visitors to sign in.
 */
export default function OrdersLandingPage({ user }: { user: User | null }) {
  const [board, setBoard] = useState<BoardData | null>(null);
  useEffect(() => {
    setBoard(null);
    if (!user) return;
    let live = true;
    orderApi.board('current').then(raw => { if (live) setBoard(readBoard(raw, 'current')); }).catch(() => { /* the sample board stays */ });
    return () => { live = false; };
  }, [user?.id]);

  // 3DEEZI ASSIST knows which page this is and, signed in, how many orders are at each stage.
  useEffect(() => provideAssistContext(() => {
    const lines = ['The Orders page (ORDERS in the top menu): three ways to order. Create Order Form (/orders/new) builds an order with 3DEEZI Assist; Upload Your Order (/orders/upload) takes a completed order form and artwork; My Orders (/orders) follows every order through its stages.'];
    if (!user) lines.push('The visitor is not signed in: each of the three asks them to sign in first.');
    else if (board) lines.push(`Their current orders: ${STAGES.map(s => `${s.label} ${board.columns[s.key].length}`).join(', ')}.${board.drafts.length ? ` Saved drafts: ${board.drafts.length}.` : ''}`);
    return lines.join('\n');
  }), [user, board]);

  return <div className="orders-landing">
    <OrderNow variant="page" board={board ? miniBoard(board) : null} />
  </div>;
}
