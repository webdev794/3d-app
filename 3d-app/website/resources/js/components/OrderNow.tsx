import { ArrowRight, Box, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import GarmentIcon from './GarmentIcon';
import { Sparkle } from './Assist';
import '../../css/order-now.css';

/**
 * The homepage's "ORDER NOW WITH 3DEEZI" (client design 2026-10-20), under the three ways to create: the order form
 * with 3DEEZI Assist, uploading a ready order, and My Orders. The pictures on the tiles are drawn here (HTML, CSS and
 * SVG), not images, so they stay sharp and fit every screen.
 */
export default function OrderNow() {
  // On computers it lines up with the creation cards, clear of 3DEEZI ASSIST's column (see order-now.css).
  return <section className="order-now" id="order-now" aria-labelledby="order-now-title">
    <div className="on-haze" aria-hidden="true" />
    <div className="on-inner">
      <h2 id="order-now-title" className="on-title">ORDER NOW WITH <span className="on-wordmark-glow" aria-hidden="true"><span className="on-wordmark" /></span><span className="on-sr">3DEEZI</span></h2>
      <p className="on-sub">Start an order. Upload your details. Follow its progress.</p>
      <div className="on-tiles">
        <Link to="/orders/new" className="on-tile on-tile-form" aria-label="Create order form: let 3DEEZI Assist help build your order form">
          <div className="on-head"><h3>NEED HELP ORDERING?<span>CREATE ORDER FORM</span></h3><span className="on-icon"><Sparkle size={34} /></span></div>
          <p>Let 3DEEZI Assist help build your order form.</p>
          <FormVisual />
          <span className="on-button">CREATE ORDER FORM <ArrowRight /></span>
        </Link>
        <Link to="/orders/upload" className="on-tile on-tile-upload" aria-label="Upload your order: upload your completed order form and artwork">
          <div className="on-head"><h3>ORDER READY TO GO?<span>UPLOAD YOUR ORDER</span></h3></div>
          <p>Upload your completed order form and artwork.</p>
          <UploadVisual />
          <span className="on-button">UPLOAD YOUR ORDER <ArrowRight /></span>
        </Link>
        <Link to="/orders" className="on-tile on-tile-board" aria-label="My orders: view your current orders and follow their progress">
          <div className="on-head"><h3>MY ORDERS<span>YOUR ORDERS. ONE PLACE.</span></h3><span className="on-icon"><Box /></span></div>
          <p>View your current orders and follow their progress.</p>
          <BoardVisual />
          <span className="on-button">VIEW MY ORDERS <ArrowRight /></span>
        </Link>
      </div>
      <p className="on-foot">Your designs. Your orders. All in 3DEEZI.</p>
    </div>
  </section>;
}

/** A tablet showing a digital order form: garments, sizes and quantities. */
function FormVisual() {
  const rows: [string, string, string, number, 'dark' | 'light'][] = [['jersey', 'Jersey', 'M', 12, 'dark'], ['shorts', 'Shorts', 'L', 12, 'dark'], ['hoodie', 'Hoodie', 'XL', 6, 'light']];
  return <div className="on-visual on-visual-form" aria-hidden="true">
    <div className="on-tablet">
      <div className="on-tablet-grid">
        <div className="on-tablet-head"><span>Item</span><span>Size</span><span>Quantity</span></div>
        {rows.map(([garment, name, size, qty, tone]) => <div key={garment} className="on-tablet-row">
          <span className="on-item"><span className="on-thumb"><GarmentIcon garment={garment} tone={tone} /></span><span>{name}</span></span>
          <span className="on-field">{size}<ChevronDown /></span>
          <span className="on-field on-qty">{qty}<i /></span>
        </div>)}
      </div>
    </div>
  </div>;
}

/** An upload tray with an order form and a garment's artwork going in. */
function UploadVisual() {
  return <div className="on-visual on-visual-upload" aria-hidden="true">
    <div className="on-paper">
      <b>ORDER FORM</b>
      <div className="on-paper-grid">{Array.from({ length: 24 }, (_, i) => <i key={i} />)}</div>
    </div>
    <div className="on-art"><GarmentIcon garment="jersey" /><span>3DEEZI</span></div>
    <div className="on-tray">
      <svg viewBox="0 0 80 56"><path d="M40 6V36M26 19 40 6 54 19" /><path d="M14 30V46H66V30" /></svg>
    </div>
    <div className="on-floor" />
  </div>;
}

/** A preview of the order board: orders as cards under their stage. */
function BoardVisual() {
  const columns: { name: string; cards: [string, number, string, 'dark' | 'light', number, boolean?][] }[] = [
    { name: 'Received', cards: [['Club Hoodies', 1001, 'hoodie', 'dark', 0.18], ['Training Tees', 1002, 'tee', 'light', 0.18], ['Caps', 1003, 'cap', 'dark', 0.1]] },
    { name: 'Design', cards: [['Team kit', 1004, 'jersey', 'dark', 0.62, true], ['Warm Up Tops', 1005, 'warmup', 'dark', 0.36]] },
    { name: 'Production', cards: [['Game Shorts', 1006, 'shorts', 'dark', 0.42], ['Jackets', 1007, 'jacket', 'dark', 0.3]] },
  ];
  return <div className="on-visual on-visual-board" aria-hidden="true">
    {columns.map(column => <div key={column.name} className="on-col">
      <div className="on-col-head"><span>{column.name}</span><b>{column.cards.length}</b></div>
      {column.cards.map(([name, id, garment, tone, progress, hot]) => <div key={id} className={`on-card${hot ? ' is-hot' : ''}`}>
        <div className="on-card-text"><strong>{name}</strong><small>#{id}</small><i><em style={{ width: `${progress * 100}%` }} /></i></div>
        <GarmentIcon garment={garment} tone={tone} />
      </div>)}
    </div>)}
  </div>;
}
