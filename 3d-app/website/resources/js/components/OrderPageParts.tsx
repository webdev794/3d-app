/**
 * Shared pieces of the order pages: Create Order Form (/orders/new, pages/OrderForm.tsx) and Upload Your Order
 * (/orders/upload). Dark navy cards with thin cyan borders, white headings, cyan actions and the cyan → violet
 * gradient button, as in the client's designs. Styles: resources/css/order-pages.css (imported below).
 *
 * READY TO USE (2026-10-20). Owned by the order form agent: other pages import these and do not edit them;
 * ask for changes through the coordinator. Every text is a prop; the defaults are the order form's words.
 *
 *  - OrderPageLayout   the page: header, two columns (sections | side cards; one column below 1100 px, the side
 *                      cards after the sections) and the bottom bar.
 *  - OrderPageHeader   breadcrumb (Home / Orders / <current>), "Back to Orders" on the right, title and subtitle.
 *  - OrderSection      a numbered section card (1, 2, 3 …): title, an optional action on the right, its body.
 *  - OrderField        a label over an input (class "op-input" on inputs, selects and textareas), with an error or hint.
 *  - ContactDetailsCard  section "Contact & team details": contact name, email, team / organisation, phone
 *                      (field names as in orders-api.md: contact_name, contact_email, team_name, phone).
 *  - OrderSummaryCard  "Order summary": the team name with the DRAFT badge, rows (a value, or "Sizes needed"), a hint.
 *  - AssistCard        the 3DEEZI Assist card: action rows (each can open a panel under it) and the "Ask for help…"
 *                      box, which opens the site's 3DEEZI ASSIST chat with the question; `context` describes the
 *                      page to the chat while the card is shown.
 *  - OrderBottomBar    the bar at the bottom of the screen: "Save draft" on the left, the gradient
 *                      "Review order →" on the right with a small line under it, and an optional status text.
 *  - FileDropBox       the upload box: Choose files, drag and drop, type / size / count checks, previews, progress,
 *                      errors with Retry, Remove. It shows `items`; the page uploads (orderApi.ts uploadOrderFile).
 *  - checkFiles        the box's type / size / count checks, for other file inputs (e.g. artwork for one garment).
 *  - formatBytes, fileExtension  small helpers.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, CircleCheck, FileText, Info, LoaderCircle, Paperclip, RotateCcw, Send, TriangleAlert, X } from 'lucide-react';
import { askAssist, provideAssistContext } from '../assistBridge';
import '../../css/order-pages.css';

/* ------------------------------------------------------------------------------------------------ layout */

/** The page: header, the sections (main) beside the side cards, then the bottom bar (sticks to the screen's bottom). */
export function OrderPageLayout({ header, main, side, bar, className = '' }: { header: ReactNode; main: ReactNode; side?: ReactNode; bar?: ReactNode; className?: string }) {
  return <div className={`op-page ${className}`}>
    <div className="op-shell">
      {header}
      <div className={`op-grid${side ? '' : ' no-side'}`}>
        <div className="op-main">{main}</div>
        {side && <aside className="op-side" aria-label="Summary and help">{side}</aside>}
      </div>
    </div>
    {bar}
  </div>;
}

export interface Crumb { label: string; to?: string }
const ORDER_TRAIL: Crumb[] = [{ label: 'Home', to: '/' }, { label: 'Orders', to: '/orders' }];

/** Breadcrumb with "Back to Orders" on the right, then the page title (shown in capitals) and its line. */
export function OrderPageHeader({ current, title, subtitle, trail = ORDER_TRAIL, back = { label: 'Back to Orders', to: '/orders' } }: {
  current: string; title: ReactNode; subtitle?: ReactNode; trail?: Crumb[]; back?: { label: string; to: string } | null;
}) {
  return <header className="op-head">
    <div className="op-head-bar">
      <nav className="op-crumbs" aria-label="Breadcrumb"><ol>
        {trail.map(c => <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>)}
        <li aria-current="page">{current}</li>
      </ol></nav>
      {back && <Link className="op-back" to={back.to}><ArrowLeft size={16} /> {back.label}</Link>}
    </div>
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </header>;
}

/** A numbered section card: ① TITLE … [action]. */
export function OrderSection({ number, title, action, children, id, className = '' }: {
  number?: number | string; title: ReactNode; action?: ReactNode; children: ReactNode; id?: string; className?: string;
}) {
  const headingId = useId();
  return <section id={id} className={`op-card op-section ${className}`} aria-labelledby={headingId}>
    <header className="op-section-head">
      {number !== undefined && <b className="op-num" aria-hidden="true">{number}</b>}
      <h2 id={headingId}>{title}</h2>
      {action && <div className="op-section-action">{action}</div>}
    </header>
    <div className="op-section-body">{children}</div>
  </section>;
}

/** A label over its input, with an error (red) or a hint under it. Give inputs, selects and textareas class "op-input". */
export function OrderField({ label, error, hint, children, className = '' }: { label: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={`op-field${error ? ' has-error' : ''} ${className}`}>
    <span className="op-label">{label}</span>
    {children}
    {error ? <small className="op-error">{error}</small> : hint ? <small className="op-hint">{hint}</small> : null}
  </label>;
}

/* ------------------------------------------------------------------------------------------------ contact */

/** The contact fields, named as the order API names them (orders-api.md §2). */
export interface ContactDetails { contact_name: string; contact_email: string; team_name: string; phone: string }
export const emptyContact = (): ContactDetails => ({ contact_name: '', contact_email: '', team_name: '', phone: '' });

/** Section "Contact & team details": contact name, email, team / organisation and phone, two by two (one column on phones). */
export function ContactDetailsCard({ number = 1, title = 'Contact & team details', value, onChange, errors = {}, disabled = false, children }: {
  number?: number | string; title?: ReactNode; value: ContactDetails; onChange: (next: ContactDetails) => void;
  errors?: Partial<Record<keyof ContactDetails, string>>; disabled?: boolean; children?: ReactNode;
}) {
  const set = (key: keyof ContactDetails) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return <OrderSection number={number} title={title} className="op-contact">
    <div className="op-fields">
      <OrderField label="Contact name" error={errors.contact_name}><input className="op-input" name="contact_name" autoComplete="name" maxLength={120} placeholder="Your name" value={value.contact_name} onChange={set('contact_name')} aria-invalid={!!errors.contact_name} disabled={disabled} /></OrderField>
      <OrderField label="Email" error={errors.contact_email}><input className="op-input" type="email" name="contact_email" autoComplete="email" maxLength={190} placeholder="Your email address" value={value.contact_email} onChange={set('contact_email')} aria-invalid={!!errors.contact_email} disabled={disabled} /></OrderField>
      <OrderField label="Team / organisation" error={errors.team_name}><input className="op-input" name="team_name" autoComplete="organization" maxLength={120} placeholder="Your team or club" value={value.team_name} onChange={set('team_name')} aria-invalid={!!errors.team_name} disabled={disabled} /></OrderField>
      <OrderField label="Phone" error={errors.phone}><input className="op-input" type="tel" name="phone" autoComplete="tel" maxLength={40} placeholder="Your phone number" value={value.phone} onChange={set('phone')} aria-invalid={!!errors.phone} disabled={disabled} /></OrderField>
    </div>
    {children}
  </OrderSection>;
}

/* ------------------------------------------------------------------------------------------------ summary */

/** One summary line: a value (e.g. 18), or `pending` text in the quieter style (e.g. "Sizes needed"). */
export interface SummaryRow { key: string; label: ReactNode; value?: ReactNode; pending?: ReactNode }

/** "Order summary": the team name with the DRAFT badge, a line per row, and a hint (info, ok or warn) under them. */
export function OrderSummaryCard({ title = 'Order summary', name, badge = 'Draft', rows, empty = 'Nothing added yet.', hint, tone = 'info', footer }: {
  title?: ReactNode; name: ReactNode; badge?: ReactNode | null; rows: SummaryRow[]; empty?: ReactNode; hint?: ReactNode; tone?: 'info' | 'ok' | 'warn'; footer?: ReactNode;
}) {
  const headingId = useId();
  return <section className="op-card op-summary" aria-labelledby={headingId}>
    <h2 className="op-card-title" id={headingId}>{title}</h2>
    <div className="op-summary-name"><strong>{name}</strong>{badge && <b className="op-badge"><FileText size={15} />{badge}</b>}</div>
    {rows.length ? <dl className="op-summary-rows">{rows.map(r => <div key={r.key}><dt>{r.label}</dt><dd className={r.value === undefined || r.value === null ? 'pending' : ''}>{r.value ?? r.pending}</dd></div>)}</dl>
      : <p className="op-summary-empty">{empty}</p>}
    {hint && <p className={`op-summary-hint tone-${tone}`} aria-live="polite">{tone === 'ok' ? <CircleCheck size={18} /> : tone === 'warn' ? <TriangleAlert size={18} /> : <Info size={18} />}<span>{hint}</span></p>}
    {footer}
  </section>;
}

/* ------------------------------------------------------------------------------------------------ assist */

/** An action row in the Assist card; with `panel`, the row opens it underneath while `open`. */
export interface AssistAction { key: string; icon: ReactNode; label: string; onClick: () => void; open?: boolean; panel?: ReactNode }

/** The 3DEEZI two-star sparkle in the Assist card's title. */
export function AssistSparkle({ size = 34 }: { size?: number }) {
  const id = `opg${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <svg className="op-sparkle" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#8a5cff" /><stop offset=".55" stopColor="#4f8bff" /><stop offset="1" stopColor="#8be9ff" /></linearGradient></defs>
    <path fill={`url(#${id})`} d="M13 6.5c.9 6.1 4.6 9.8 10.7 10.7C17.6 18.1 13.9 21.8 13 28c-.9-6.2-4.6-9.9-10.7-10.8C8.4 16.3 12.1 12.6 13 6.5Z" />
    <path fill={`url(#${id})`} d="M26 2.5c.4 2.7 2 4.3 4.7 4.7-2.7.4-4.3 2-4.7 4.7-.4-2.7-2-4.3-4.7-4.7 2.7-.4 4.3-2 4.7-4.7Z" />
  </svg>;
}

/**
 * The 3DEEZI Assist card. The "Ask for help…" box opens the site's 3DEEZI ASSIST chat (bottom right) and asks
 * the question there (`onAsk` replaces that). While the card is shown, `context` tells the chat about the page
 * (e.g. the order so far), so its answers fit what the customer is doing.
 */
export function AssistCard({ title = '3DEEZI Assist', heading = 'Need help building your order?', line = 'Get instant guidance from 3DEEZI Assist.', actions = [], context, onAsk, placeholder = 'Ask for help…' }: {
  title?: ReactNode; heading?: ReactNode; line?: ReactNode; actions?: AssistAction[]; context?: () => string; onAsk?: (question: string) => void; placeholder?: string;
}) {
  const [text, setText] = useState('');
  const id = useId();
  const describe = useRef(context);
  describe.current = context;
  const hasContext = !!context;
  useEffect(() => (hasContext ? provideAssistContext(() => describe.current?.() ?? '') : undefined), [hasContext]);
  function ask(e: FormEvent) {
    e.preventDefault();
    const question = text.trim();
    if (!question) return;
    (onAsk ?? askAssist)(question);
    setText('');
  }
  return <section className="op-card op-assist" aria-labelledby={`${id}t`}>
    <header className="op-assist-head"><AssistSparkle /><h2 id={`${id}t`}>{title}</h2></header>
    <div className="op-assist-body">
      <h3>{heading}</h3>
      <p>{line}</p>
      {actions.length > 0 && <ul className="op-assist-actions">{actions.map(a => <li key={a.key} className={a.open ? 'is-open' : ''}>
        <button type="button" className="op-assist-action" onClick={a.onClick} aria-expanded={a.panel !== undefined ? !!a.open : undefined} aria-controls={a.open && a.panel ? `${id}${a.key}` : undefined}>
          <span className="op-assist-icon">{a.icon}</span><span className="op-assist-label">{a.label}</span><ChevronRight size={20} className="op-chev" />
        </button>
        {a.open && a.panel && <div className="op-assist-panel" id={`${id}${a.key}`}>{a.panel}</div>}
      </li>)}</ul>}
      <form className="op-ask" onSubmit={ask}>
        <input className="op-input" value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} maxLength={600} aria-label="Ask 3DEEZI Assist for help" />
        <button type="submit" disabled={!text.trim()} aria-label="Send to 3DEEZI Assist" title="Send to 3DEEZI Assist"><Send size={20} /></button>
      </form>
    </div>
  </section>;
}

/* ------------------------------------------------------------------------------------------------ bottom bar */

export interface BarButton { label: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; icon?: ReactNode }

/**
 * The bar along the bottom of the screen: the secondary button on the left (default icon: a page, for "Save draft"),
 * an optional status text, and the gradient primary button on the right (default icon: →) with `note` under it.
 * 3DEEZI ASSIST's button sits above the bar (data-assist-above).
 */
export function OrderBottomBar({ secondary, primary, note, status }: { secondary?: BarButton; primary: BarButton; note?: ReactNode; status?: ReactNode }) {
  return <div className="op-bar" data-assist-above="">
    <div className="op-bar-inner">
      {secondary && <button type="button" className="op-bar-secondary" onClick={secondary.onClick} disabled={secondary.disabled || secondary.busy} aria-busy={secondary.busy || undefined}>
        {secondary.busy ? <LoaderCircle className="spin" size={22} /> : secondary.icon ?? <FileText size={22} />}<span>{secondary.label}</span>
      </button>}
      <p className="op-bar-status" aria-live="polite">{status}</p>
      <div className="op-bar-primary-wrap">
        <button type="button" className="op-bar-primary" onClick={primary.onClick} disabled={primary.disabled || primary.busy} aria-busy={primary.busy || undefined}>
          {primary.busy && <LoaderCircle className="spin" size={18} />}<span>{primary.label}</span>{!primary.busy && (primary.icon ?? <ArrowRight size={20} />)}
        </button>
        {note && <small>{note}</small>}
      </div>
    </div>
  </div>;
}

/* ------------------------------------------------------------------------------------------------ uploads */

/** A file in the upload box: uploading (with progress 0–100), done, or failed (with the reason). */
export interface UploadItem { id: string; name: string; size: number; status: 'uploading' | 'done' | 'error'; progress?: number; error?: string; preview?: string | null; note?: ReactNode }

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
export const fileExtension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/**
 * Splits chosen files into those that may be uploaded and a message for each of the rest: another type (by
 * extension), larger than `maxKb`, empty, or beyond `maxFiles` (`already` = files already added).
 */
export function checkFiles(files: File[], { extensions, maxKb, maxFiles, already = 0 }: { extensions?: string[]; maxKb?: number; maxFiles?: number; already?: number }) {
  const ok: File[] = [], refused: string[] = [];
  for (const file of files) {
    if (extensions?.length && !extensions.includes(fileExtension(file.name))) refused.push(`${file.name}: this type of file can't be added. Use ${extensions.slice(0, 8).map(e => e.toUpperCase()).join(', ')}${extensions.length > 8 ? ' …' : ''}.`);
    else if (maxKb && file.size > maxKb * 1024) refused.push(`${file.name} is ${formatBytes(file.size)}: the most is ${formatBytes(maxKb * 1024)} a file.`);
    else if (file.size === 0) refused.push(`${file.name} is empty.`);
    else if (maxFiles !== undefined && already + ok.length >= maxFiles) refused.push(`${file.name}: up to ${maxFiles} files can be added.`);
    else ok.push(file);
  }
  return { ok, refused };
}

/**
 * The upload box: "Choose files" or drag and drop. Files of another type (by extension), larger than `maxKb` or
 * beyond `maxFiles` (counting the files already in `items`) are refused with a message here; the rest go to
 * `onFiles`, which uploads them and shows them in `items` (progress, Retry, Remove).
 */
export function FileDropBox({ items, onFiles, onRemove, onRetry, extensions, maxKb, maxFiles, title = 'Upload logos, artwork or a reference', hint, buttonLabel = 'Choose files', disabled = false, multiple = true, label = 'Upload files' }: {
  items: UploadItem[]; onFiles: (files: File[]) => void; onRemove?: (item: UploadItem) => void; onRetry?: (item: UploadItem) => void;
  extensions?: string[]; maxKb?: number; maxFiles?: number; title?: ReactNode; hint?: ReactNode; buttonLabel?: string; disabled?: boolean; multiple?: boolean; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  const accept = extensions?.length ? extensions.map(e => `.${e}`).join(',') : undefined;

  function take(list: FileList | null) {
    if (!list || disabled) return;
    const { ok, refused: wrong } = checkFiles(Array.from(list), { extensions, maxKb, maxFiles, already: items.filter(i => i.status !== 'error').length });
    setRefused(wrong);
    if (ok.length) onFiles(ok);
  }
  const drag = (e: DragEvent, on: boolean) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setOver(on); };

  return <div className="op-upload">
    <div className={`op-drop${over ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={e => drag(e, true)} onDragOver={e => drag(e, true)}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) drag(e, false); }}
      onDrop={e => { drag(e, false); take(e.dataTransfer.files); }}>
      <Paperclip className="op-drop-icon" size={30} aria-hidden="true" />
      <div className="op-drop-text">
        <strong>{title}</strong>
        <button type="button" className="op-choose" onClick={() => input.current?.click()} disabled={disabled}>{buttonLabel}</button>
        {hint && <small>{hint}</small>}
      </div>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} aria-label={label} onChange={e => { take(e.target.files); e.target.value = ''; }} />
    </div>
    {refused.length > 0 && <div className="op-drop-alert" role="alert"><TriangleAlert size={16} /><div>{refused.map(r => <p key={r}>{r}</p>)}</div><button type="button" className="op-icon-btn" onClick={() => setRefused([])} aria-label="Dismiss"><X size={14} /></button></div>}
    {items.length > 0 && <ul className="op-files">{items.map(item => <li key={item.id} className={`op-file is-${item.status}`}>
      {item.preview ? <img className="op-file-thumb" src={item.preview} alt="" /> : <span className="op-file-thumb" aria-hidden="true">{fileExtension(item.name).slice(0, 4) || 'file'}</span>}
      <div className="op-file-info">
        <span className="op-file-name" title={item.name}>{item.name}</span>
        <span className="op-file-meta">{formatBytes(item.size)}{item.status === 'uploading' && ` · uploading ${Math.round(item.progress ?? 0)}%`}{item.status === 'done' && ' · uploaded'}{item.note && <> · {item.note}</>}</span>
        {item.status === 'uploading' && <span className="op-progress" role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress ?? 0)}><i style={{ width: `${Math.max(3, item.progress ?? 0)}%` }} /></span>}
        {item.status === 'error' && <span className="op-file-error" role="alert">{item.error || 'The upload failed.'}</span>}
      </div>
      <div className="op-file-actions">
        {item.status === 'error' && onRetry && <button type="button" className="op-icon-btn" onClick={() => onRetry(item)} aria-label={`Try ${item.name} again`} title="Try again"><RotateCcw size={16} /></button>}
        {onRemove && <button type="button" className="op-icon-btn" onClick={() => onRemove(item)} aria-label={`Remove ${item.name}`} title={item.status === 'uploading' ? 'Cancel' : 'Remove'}><X size={17} /></button>}
      </div>
    </li>)}</ul>}
  </div>;
}
