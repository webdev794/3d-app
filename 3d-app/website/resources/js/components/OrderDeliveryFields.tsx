import { Store, TriangleAlert, Truck } from 'lucide-react';
import { OrderField } from './OrderPageParts';
import '../../css/order-delivery.css';

/**
 * Section 1's Date required, Deliver / Pick up and the delivery address (client 2026-10-22), shared by Upload Your Order
 * (pages/OrderUpload.tsx) and Create Order Form (pages/OrderForm.tsx). The server checks the same rules
 * (App\Support\OrderDelivery) and keeps the address as the order's shipping_address text; the app has the same
 * (lib/screens/order_entry.dart). API keys: needed_by (YYYY-MM-DD), phone, delivery ('deliver' | 'pickup'),
 * address {street, suburb, state, postcode, country}.
 */
export interface DeliveryFields { needed_by: string; delivery: string; street: string; suburb: string; state: string; postcode: string; country: string }
export const ADDRESS_KEYS = ['street', 'suburb', 'state', 'postcode', 'country'] as const;
export type AddressKey = typeof ADDRESS_KEYS[number];
export type DeliveryErrors = Partial<Record<'needed_by' | 'delivery' | AddressKey, string>>;
export const EMPTY_DELIVERY: DeliveryFields = { needed_by: '', delivery: 'deliver', street: '', suburb: '', state: '', postcode: '', country: 'Australia' };
export const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
export const COUNTRIES = ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea', 'Samoa', 'Tonga', 'Cook Islands', 'United Kingdom', 'United States', 'Canada'];
export const MOBILE_MESSAGE = 'Enter a mobile number, e.g. 0412 345 678 or +61 412 345 678.';
/** The usual production and delivery time until GET /orders/options answers (Admin › Settings). */
export const DEFAULT_LEAD_WEEKS = 4;

/** Today in this browser, as YYYY-MM-DD (the date picker's earliest day). */
export const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plusDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const isAustralia = (country: string) => ['australia', 'au', 'aus'].includes(country.trim().toLowerCase());
/** As the server checks it: Australian (04xx…, 0x xxxx xxxx, +61…) or international (+ and 8 to 15 digits). */
export function validMobile(value: string) {
  const phone = value.trim();
  if (!phone || phone.length > 40 || !/^\+?[\d\s().-]+$/.test(phone)) return false;
  const plain = phone.replace(/[\s().-]/g, '');
  if (plain.startsWith('+61')) return /^\+610?\d{9}$/.test(plain);
  if (plain.startsWith('0')) return /^0\d{9}$/.test(plain);
  return /^\+?\d{8,15}$/.test(plain);
}
/** What is wrong with the mobile (undefined when fine). */
export const mobileError = (phone: string) => (!phone.trim() ? 'Add a mobile number so we can reach you.' : !validMobile(phone) ? MOBILE_MESSAGE : undefined);
/** "Fri 4 Dec 2026" */
export const dateText = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
/** The delivery address on one line, or the pick-up note. */
export const deliveryText = (f: DeliveryFields) => (f.delivery === 'pickup' ? 'Pick up from 3DEEZI'
  : [f.street, [f.suburb, f.state.toUpperCase(), f.postcode].map(v => v.trim()).filter(Boolean).join(' '), f.country].map(v => v.trim()).filter(Boolean).join(', '));
/** What is missing from a delivery address. */
export function addressErrors(f: DeliveryFields): DeliveryErrors {
  const e: DeliveryErrors = {};
  if (!f.street.trim()) e.street = 'Add the street address for delivery.';
  if (!f.suburb.trim()) e.suburb = 'Add the suburb or town.';
  if (!f.country.trim()) e.country = 'Add the country.';
  if (!f.country.trim() || isAustralia(f.country)) {
    if (!AU_STATES.includes(f.state.trim().toUpperCase())) e.state = 'Choose the state.';
    if (!/^\d{4}$/.test(f.postcode.trim())) e.postcode = 'Enter the 4-digit postcode.';
  } else if (f.postcode.trim() && !/^[A-Za-z0-9 -]{2,10}$/.test(f.postcode.trim())) e.postcode = 'Check the postcode.';
  return e;
}
/** The date required and delivery: what stops the order being sent (empty when fine). */
export function deliveryErrors(f: DeliveryFields): DeliveryErrors {
  const e: DeliveryErrors = {};
  if (!f.needed_by) e.needed_by = 'Choose the date you need the order by.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.needed_by)) e.needed_by = 'Choose the date from the calendar.';
  else if (f.needed_by < todayText()) e.needed_by = 'The date required can’t be in the past.';
  if (f.delivery !== 'deliver' && f.delivery !== 'pickup') e.delivery = 'Choose delivery or pick up.';
  else if (f.delivery === 'deliver') Object.assign(e, addressErrors(f));
  return e;
}
/** The gentle warning for a date required sooner than the usual lead time (the order can still be sent). */
export function leadWarning(neededBy: string, weeks: number): string | null {
  if (!weeks || !/^\d{4}-\d{2}-\d{2}$/.test(neededBy) || neededBy < todayText() || neededBy >= plusDays(weeks * 7)) return null;
  return `Usually ${weeks} week${weeks === 1 ? '' : 's'} for production and delivery; we’ll confirm if we can meet your date.`;
}
/** As the draft and the order send them. */
export const deliveryPayload = (f: DeliveryFields) => ({ needed_by: f.needed_by, delivery: f.delivery, address: Object.fromEntries(ADDRESS_KEYS.map(k => [k, f[k].trim()])) as Record<AddressKey, string> });
/** The saved fields from a draft (the address as an object) or this browser's copy (flat). */
export function pickDelivery(data?: object | null): Partial<DeliveryFields> {
  const given = (data ?? {}) as Record<string, unknown>;
  const source = { ...(given.address && typeof given.address === 'object' ? given.address as Record<string, unknown> : {}), ...given };
  return Object.fromEntries((['needed_by', 'delivery', ...ADDRESS_KEYS] as const).flatMap(k => (typeof source[k] === 'string' ? [[k, source[k] as string]] : []))) as Partial<DeliveryFields>;
}
/** Section 1's destination as the server takes it when none is chosen on the review (App\Support\OrderDelivery::destination). */
export const choiceDestination = (f: DeliveryFields) => (f.delivery === 'pickup' ? 'PICKUP' : f.delivery !== 'deliver' || !f.country.trim() ? undefined
  : isAustralia(f.country) ? 'AU' : /^(new zealand|nz|aotearoa)$/i.test(f.country.trim()) ? 'NZ' : 'INTL');

/** Date required (with the lead-time warning), Deliver / Pick up, and the address when delivering. */
export function DeliveryFieldsCard({ value, errors, onChange, leadWeeks = DEFAULT_LEAD_WEEKS }: {
  value: DeliveryFields; errors: DeliveryErrors; onChange: (next: Partial<DeliveryFields>) => void; leadWeeks?: number;
}) {
  const au = isAustralia(value.country);
  const warning = !errors.needed_by ? leadWarning(value.needed_by, leadWeeks) : null;
  return <div className="od-when-where">
    <div className="op-fields">
      <OrderField label="Date required" error={errors.needed_by} hint={warning ? <span className="od-lead-warning" role="status" data-testid="lead-warning"><TriangleAlert size={14} /> {warning}</span> : 'When you need the garments.'}>
        <input className="op-input" type="date" name="needed_by" min={todayText()} value={value.needed_by} onChange={e => onChange({ needed_by: e.target.value })} aria-invalid={!!errors.needed_by} aria-required />
      </OrderField>
      <fieldset className={`op-field od-delivery${errors.delivery ? ' has-error' : ''}`}>
        <legend className="op-label">Delivery</legend>
        <div className="od-choice">
          {([['deliver', 'Deliver', <Truck key="t" size={17} />], ['pickup', 'Pick up', <Store key="s" size={17} />]] as const).map(([method, label, icon]) =>
            <label key={method} className={`od-choice-pill${value.delivery === method ? ' is-on' : ''}`}>
              <input type="radio" name="delivery" value={method} checked={value.delivery === method} onChange={() => onChange({ delivery: method })} />{icon}{label}
            </label>)}
        </div>
        {errors.delivery ? <small className="op-error">{errors.delivery}</small> : value.delivery === 'pickup' ? <small className="op-hint">We’ll tell you when your order is ready to collect.</small> : null}
      </fieldset>
    </div>
    {value.delivery === 'deliver' && <div className="op-fields od-address" data-testid="delivery-address">
      <OrderField label="Street address" error={errors.street} className="od-wide">
        <input className="op-input" name="street" autoComplete="street-address" maxLength={200} placeholder="e.g. 12 Smith Street" value={value.street} onChange={e => onChange({ street: e.target.value })} aria-invalid={!!errors.street} aria-required />
      </OrderField>
      <OrderField label="Suburb / town" error={errors.suburb}>
        <input className="op-input" name="suburb" autoComplete="address-level2" maxLength={200} value={value.suburb} onChange={e => onChange({ suburb: e.target.value })} aria-invalid={!!errors.suburb} aria-required />
      </OrderField>
      <div className="od-address-row">
        <OrderField label={au ? 'State' : 'State / region (optional)'} error={errors.state}>
          {au
            ? <select className="op-input" name="state" autoComplete="address-level1" value={value.state.toUpperCase()} onChange={e => onChange({ state: e.target.value })} aria-invalid={!!errors.state} aria-required>
              <option value="">Choose…</option>{AU_STATES.map(st => <option key={st} value={st}>{st}</option>)}</select>
            : <input className="op-input" name="state" autoComplete="address-level1" maxLength={200} value={value.state} onChange={e => onChange({ state: e.target.value })} />}
        </OrderField>
        <OrderField label={au ? 'Postcode' : 'Postcode (if any)'} error={errors.postcode}>
          <input className="op-input" name="postcode" autoComplete="postal-code" inputMode={au ? 'numeric' : 'text'} maxLength={10} value={value.postcode} onChange={e => onChange({ postcode: e.target.value })} aria-invalid={!!errors.postcode} aria-required={au || undefined} />
        </OrderField>
      </div>
      <OrderField label="Country" error={errors.country}>
        <input className="op-input" name="country" autoComplete="country-name" list="od-countries" maxLength={200} value={value.country} onChange={e => onChange({ country: e.target.value })} aria-invalid={!!errors.country} aria-required />
        <datalist id="od-countries">{COUNTRIES.map(c => <option key={c} value={c} />)}</datalist>
      </OrderField>
    </div>}
  </div>;
}
