import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Info, Minus, TriangleAlert, X } from 'lucide-react';
import { api } from '../api';
import { assistContext, assistHandler } from '../assistBridge';
import '../../css/assist.css';

/**
 * 3DEEZI ASSIST: the help chat on every page. The launcher button (bottom right) shows and
 * hides the chat; answers come from the server (/assist), which knows the website, its
 * tools, plans and FAQs. The conversation is kept for the browser tab, across pages.
 */
interface Action { action: string; value: string }
/** A command's result: done (ok), not done, or left as it was because it already was (info). */
interface Done { ok: boolean; text: string; info?: boolean }
interface Message { role: 'user' | 'assistant'; content: string; error?: boolean; id?: number; done?: Done[]; refresh?: boolean }

const storeKey = '3deezi.assist';
const greeting = "Hi! I'm 3DEEZI ASSIST.\nWhat would you like help with?";
/** Pages a reply may link to (the server allows the same list). */
const pages = ['/', '/create/ai', '/create/sport', '/convert', '/projects', '/approved', '/assets', '/dashboard', '/downloads', '/orders', '/orders/new', '/orders/upload', '/pricing', '/studio', '/artboard', '/about', '/support', '/privacy', '/terms'];

const pageNames: Record<string, string> = { '/': 'the home page', '/create/ai': 'AI Powered Sportswear', '/create/sport': 'Design Your Own', '/convert': 'Convert', '/projects': 'Projects', '/approved': 'Approved', '/assets': 'Assets', '/dashboard': 'the Dashboard', '/downloads': 'Downloads', '/orders': 'My orders', '/orders/new': 'the Create Order Form', '/orders/upload': 'Upload Your Order', '/pricing': 'Plans', '/studio': 'the 3D Studio', '/artboard': 'the Artboard', '/about': 'About 3DEEZI', '/support': 'Support', '/privacy': 'the Privacy Policy', '/terms': 'the Terms of Use' };
/** Commands run on the Artboard (in its frame) or on the Studio page; the rest open a page. */
const artboardActions = ['grid', 'snap', 'rulers', 'snapTo', 'tool', 'select', 'arrange', 'align', 'mirror', 'group', 'duplicate', 'connect', 'varline', 'page', 'gradient', 'palette', 'textStyle', 'move', 'rotate', 'scale', 'size', 'fill', 'outline', 'menu', 'effect', 'add', 'zoom', 'pageSize', 'units', 'tab', 'help'];
const studioActions = ['view', 'panel', 'garment', 'board', 'export', 'design', 'studioAi'];
type ArtboardWindow = Window & { artboard?: { ready?: boolean; assist?: (action: string, value: string) => string } };
/** This page's script file (main-<hash>.js): the server asks for a refresh when the website has a newer one. */
const build = new URL(import.meta.url).pathname.split('/').pop() ?? '';
const artboardWindow = () => document.querySelector<HTMLIFrameElement>('iframe.artboard-frame')?.contentWindow as ArtboardWindow | null | undefined;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Waits (up to 20 s) for something to become available, e.g. the Artboard after opening it. */
async function waitFor<T>(get: () => T | undefined | null, what: string): Promise<T> {
  for (let i = 0; i < 200; i++) { const v = get(); if (v) return v; await sleep(100); }
  throw new Error(`${what} did not open in time. Please try again.`);
}

/** Quick questions for the page the visitor is on. */
function suggestionsFor(path: string) {
  if (path.startsWith('/artboard')) return ['Which tool makes a curved team name?', 'Explain the Contour tool', 'How do I send my design to 3D?'];
  if (path.startsWith('/studio')) return ['How do I add my logo?', 'How do I add names and numbers?', 'How do I download my design?'];
  if (path.startsWith('/pricing')) return ['Which plan suits my team?', 'What does an AI credit buy?', 'Is there a free plan?'];
  if (path.startsWith('/create') || path.startsWith('/convert')) return ['AI or Design Your Own: which should I use?', 'Can I turn a picture of a kit into 3D?', 'Can I design shorts or a full kit?'];
  return ['How do I start designing?', 'Show me the Artboard', 'Which plan suits my team?'];
}

function load(): { open: boolean; messages: Message[] } {
  try { return { open: false, messages: [], ...JSON.parse(sessionStorage.getItem(storeKey) || '{}') }; }
  catch { return { open: false, messages: [] }; }
}

/** The homepage design shows the chat open (2026-10-15): it opens by itself there on computer screens. */
const opensOn = (page: string) => page === '/' && window.matchMedia('(min-width: 1200px)').matches;

/** Opens the chat from a page's own button (e.g. the Support page's "Open 3DEEZI ASSIST"). */
export const openAssist = () => { window.dispatchEvent(new Event('assist-open')); };

/** The 3DEEZI four-point sparkle. */
export function Sparkle({ size = 24 }: { size?: number }) {
  return <svg className="assist-sparkle" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5Z" />
  </svg>;
}

export default function Assist() {
  const location = useLocation();
  const navigate = useNavigate();
  // Opened by itself on the homepage and not used yet: it leaves the keyboard focus on the page, and
  // closes again when the visitor goes to another page.
  const auto = useRef(false);
  const [state, setState] = useState(() => {
    const saved = load();
    if (saved.open || !opensOn(location.pathname)) return saved;
    auto.current = true;
    return { ...saved, open: true };
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { open, messages } = state;
  const tool = /^\/(studio|artboard|admin)/.test(location.pathname);
  // Phones: on the homepage's first screen the button waits until the visitor scrolls (it would cover
  // the jersey, as in the mobile design); it is there from the first scroll on.
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (location.pathname !== '/') { setWaiting(false); return; }
    const phone = window.matchMedia('(max-width: 759px)');
    const check = () => setWaiting(phone.matches && window.scrollY < window.innerHeight * 0.2);
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [location.pathname]);
  const path = useRef(location.pathname);
  path.current = location.pathname;
  // Never over the footer, or a page's own bar along the bottom (the order pages' Save draft / Review order): as they
  // scroll into view the button (and the open chat) rise with them, so they sit just above (--assist-lift, used in
  // assist.css). Once the footer's 3DEEZI ASSIST place ([data-assist-dock]) is wholly on screen, the button settles
  // into it (drawn there with a portal, so it scrolls with the page) and the open chat stays above the footer.
  const root = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const docked = useRef<HTMLElement | null>(null);
  /** Where the button was before it moved between the corner and the footer (it glides from there). */
  const from = useRef<DOMRect | null>(null);
  const isOpen = useRef(open);
  isOpen.current = open;
  // Homepage: when "ORDER NOW WITH 3DEEZI" ([data-assist-fold]) scrolls into view with the chat open, the chat folds into
  // its button so it doesn't cover those sections, and on computers it opens again by itself back at the top, where the
  // creation cards keep its column. Opened there by the visitor, it stays open (no more folding this visit); closed by
  // the visitor, it stays closed and the cards use the full width (data-assist-closed on <html>, see home.css).
  const fold = useRef({ below: false, folded: false, keep: false });
  const [folded, setFolded] = useState(false);
  /** Opened by itself again: the keyboard focus stays on the page. */
  const quiet = useRef(false);
  useEffect(() => {
    let frame = 0;
    fold.current = { below: false, folded: false, keep: false };
    setFolded(false);
    const update = () => {
      frame = 0;
      const h = window.innerHeight;
      const footer = document.querySelector('.site-footer');
      const liftOf = (el: Element | null) => (el ? Math.max(0, Math.round(h - el.getBoundingClientRect().top)) : 0);
      root.current?.style.setProperty('--assist-lift', `${Math.max(liftOf(document.querySelector('[data-assist-above]')), liftOf(footer))}px`);
      const place = footer?.querySelector<HTMLElement>('[data-assist-dock]') ?? null;
      const box = place?.getBoundingClientRect();
      const next = place && box && box.width > 0 && box.top >= 0 && box.bottom <= h ? place : null;
      if (next !== docked.current) {
        from.current = launcher.current?.getBoundingClientRect() ?? null;
        docked.current = next;
        setDock(next);
      }
      const section = document.querySelector('[data-assist-fold]');
      const sectionTop = section ? section.getBoundingClientRect().top : Infinity, f = fold.current;
      // The very top of the page always counts as "back at the top": on some windows ORDER NOW already shows there
      // (e.g. 1440 x 900, 2560 x 1440), and its top could never pass h - 40 again, so the chat stayed folded.
      const atTop = window.scrollY < 4;
      if (!f.below && !atTop && sectionTop < h - 120) {
        f.below = true;
        if (isOpen.current && !f.keep) { f.folded = true; setFolded(true); setState(s => ({ ...s, open: false })); }
      } else if (f.below && (atTop || sectionTop > h - 40)) {
        f.below = false;
        if (f.folded) {
          f.folded = false;
          setFolded(false);
          if (!isOpen.current && window.matchMedia('(min-width: 1200px)').matches) { quiet.current = true; setState(s => ({ ...s, open: true })); }
        }
      }
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    // Again whenever the page's size changes (the new page rendering, fonts and pictures arriving), not only on
    // scroll: a page that fits the window is never scrolled.
    const grow = new ResizeObserver(soon);
    grow.observe(document.body);
    document.fonts?.ready.then(soon).catch(() => {});
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    return () => { window.removeEventListener('scroll', soon); window.removeEventListener('resize', soon); grow.disconnect(); cancelAnimationFrame(frame); };
  }, [location.pathname]);

  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify({ open: open && !auto.current, messages: messages.slice(-40) })); } catch { /* Private mode: the chat still works. */ } }, [open, messages]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy, open]);
  useEffect(() => { if (open && !auto.current && !quiet.current) input.current?.focus({ preventScroll: true }); quiet.current = false; }, [open]);
  // The homepage keeps a column for the chat beside its creation cards unless the visitor closed it (home.css).
  useLayoutEffect(() => { document.documentElement.toggleAttribute('data-assist-closed', !open && !folded); }, [open, folded]);
  // Every visit to the homepage opens the chat; leaving it closes a chat that opened by itself, unused. (Before the
  // page is painted, so the homepage's cards appear with the chat's column straight away.)
  useLayoutEffect(() => {
    if (opensOn(location.pathname)) {
      if (!state.open) { auto.current = true; setState(s => ({ ...s, open: true })); }
    } else if (auto.current) {
      auto.current = false;
      setState(s => ({ ...s, open: false }));
    }
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') show(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...messages.filter(m => !m.error), { role: 'user' as const, content: q }];
    auto.current = false;
    setState(s => ({ ...s, open: true, messages: [...s.messages, { role: 'user', content: q }] }));
    setText(''); setBusy(true);
    try {
      // On the Artboard: what is on the page and selected, so the answer fits it ("it already has a shadow").
      let context: string | undefined;
      try { context = artboardWindow()?.artboard?.assist?.('describe', '')?.slice(0, 3000); } catch { /* not ready */ }
      // Elsewhere: what the page itself reports (e.g. the order form's garments and sizes).
      context ??= assistContext()?.slice(0, 3000);
      const r = await api<{ reply: string; actions?: Action[]; outdated?: boolean }>('/assist', { method: 'POST', body: JSON.stringify({ messages: history.slice(-12).map(({ role, content }) => ({ role, content })), page: location.pathname, can: ['commands'], build, context }) });
      const id = Date.now();
      setState(s => ({ ...s, messages: [...s.messages, { role: 'assistant', content: r.reply, id, refresh: r.outdated }] }));
      if (r.actions?.length) {
        const done = await run(r.actions);
        // The reply was written before the commands ran ("Done: …"): when nothing worked say so instead,
        // and when only part worked say that first.
        // "Already there" (info) is not a failure: the object was left as it was.
        const failed = done.every(d => !d.ok && !d.info), partly = !failed && done.some(d => !d.ok && !d.info), already = done.some(d => d.info);
        const content = (m: Message) => (failed ? "I couldn't do that:"
          : partly ? `**Part of this didn't work (see below).**\n${m.content}`
          : already ? "That's already there, so I left it as it is:" : m.content);
        setState(s => ({ ...s, messages: s.messages.map(m => (m.id === id ? { ...m, done, content: content(m) } : m)) }));
        // On small screens the chat covers the page: get out of the way to show what changed.
        if (window.innerWidth < 900 && done.some(d => d.ok)) minimise();
      }
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Never show a raw server error: only the messages written for visitors (wait, refresh, sign in …).
      const content = status === 429 ? "You're asking quickly. Please wait a moment and try again."
        : !status || status >= 500 ? '3DEEZI ASSIST had a problem answering. Please try again in a moment.'
        : (e as Error).message;
      setState(s => ({ ...s, messages: [...s.messages, { role: 'assistant', content, error: true }] }));
    } finally { setBusy(false); }
  }
  /** Runs the assistant's commands in order, opening the Artboard or the Studio first when needed. */
  async function run(actions: Action[]) {
    const done: Done[] = [];
    const go = async (page: string) => { if (path.current !== page) { navigate(page); await waitFor(() => path.current === page || undefined, 'The page'); } };
    let unselected = false;
    for (const { action, value } of actions) {
      // The rest were planned for objects that could not be selected: don't apply them to whatever is selected now.
      if (unselected) { done.push({ ok: false, text: 'Skipped: those objects could not be selected.' }); continue; }
      try {
        if (action === 'open') {
          if (!pages.includes(value.split('#')[0] || '/')) throw new Error('That page is not available.');
          follow(value);
          done.push({ ok: true, text: `Opened ${pageNames[value.split('#')[0] || '/'] ?? 'the page'}` });
        } else if (artboardActions.includes(action)) {
          await go('/artboard');
          const board = await waitFor(() => { const w = artboardWindow(); return w?.artboard?.ready && w.artboard.assist ? w.artboard : undefined; }, 'The Artboard');
          done.push({ ok: true, text: board.assist!(action, value) });
        } else if (studioActions.includes(action)) {
          await go('/studio');
          const handler = await waitFor(() => assistHandler('studio'), 'The Studio');
          done.push({ ok: true, text: await handler(action, value) });
        } else throw new Error('I can’t do that here.');
      } catch (e) {
        // "ALREADY: …": the object already had it and was left as it was (not a failure).
        const text = (e as Error).message, already = text.startsWith('ALREADY: ');
        done.push({ ok: false, info: already, text: already ? text.slice(9) : text });
        unselected = action === 'select';
      }
    }
    return done;
  }
  /** Opened or closed by the visitor (not by itself). Opened beside the homepage's order sections, it stays open there. */
  function show(value: boolean) {
    auto.current = false;
    if (value && fold.current.below) fold.current.keep = true;
    fold.current.folded = false;
    setFolded(false);
    setState(s => ({ ...s, open: value }));
  }
  // The button glides between the corner and the footer instead of jumping (no movement when motion is reduced).
  useLayoutEffect(() => {
    const el = launcher.current, start = from.current;
    from.current = null;
    if (!el || !start || !start.width || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const end = el.getBoundingClientRect(), k = end.width / (el.offsetWidth || end.width) || 1;
    const dx = (start.left - end.left) / k, dy = (start.top - end.top) / k;
    if (Math.abs(dx) + Math.abs(dy) > 2) el.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, [dock]);
  const toggle = () => show(!open);
  const minimise = () => show(false);
  const endChat = () => { auto.current = false; setState({ open: false, messages: [] }); setText(''); };
  /**
   * A question from the page itself (askAssist(), e.g. the order form's "Ask for help" box): opens the chat and asks
   * it; while an answer is still coming, it waits in the chat's box to be sent.
   */
  function askFromPage(question: string) { if (!question) show(true); else if (busy) { setText(question); show(true); } else ask(question); }
  const fromPage = useRef(askFromPage);
  fromPage.current = askFromPage;
  useEffect(() => {
    const listen = (e: Event) => { const q = String((e as CustomEvent<string>).detail ?? '').trim().slice(0, 600); if (q) fromPage.current(q); };
    const opened = () => fromPage.current('');
    window.addEventListener('assist-ask', listen);
    window.addEventListener('assist-open', opened);
    return () => { window.removeEventListener('assist-ask', listen); window.removeEventListener('assist-open', opened); };
  }, []);
  /**
   * Follows a link from a reply: opens the page and scrolls to the section after a # (e.g.
   * /#create-options); a link to the page already open scrolls to its top. The chat stays open on
   * computer screens; on small screens, where it covers the page, it minimises.
   */
  function follow(target: string) {
    const [path, hash] = target.split('#'), page = path || '/';
    if (window.innerWidth < 900) minimise();
    const scroll = () => { const section = hash && document.getElementById(hash); if (section) section.scrollIntoView({ behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' }); };
    if (page === location.pathname) { scroll(); return; }
    navigate(page);
    if (hash) setTimeout(scroll, 400);   // after the new page has rendered (and the app's scroll to top)
  }

  const artboard = location.pathname.startsWith('/artboard');
  const studio = location.pathname.startsWith('/studio');
  const button = <button ref={launcher} className="assist-launcher" onClick={toggle} aria-expanded={open} aria-controls="assist-panel" title={open ? 'Hide 3DEEZI ASSIST' : 'Ask 3DEEZI ASSIST'}>
    <Sparkle size={tool ? 24 : 26} /><span>3DEEZI ASSIST</span>
  </button>;
  return <div ref={root} className={`assist ${tool ? 'assist-tool' : ''} ${artboard ? 'assist-artboard' : ''} ${studio ? 'assist-studio' : ''} ${open ? 'is-open' : ''} ${dock ? 'is-docked' : ''} ${waiting && !open && !dock ? 'is-waiting' : ''}`}>
    {open && <section className="assist-panel" id="assist-panel" role="dialog" aria-label="3DEEZI ASSIST help chat">
      <header className="assist-head">
        <Sparkle size={30} />
        <div><h2>3DEEZI ASSIST</h2><p>AI help assistant</p></div>
        <button className="assist-icon" onClick={minimise} aria-label="Minimise chat" title="Minimise"><Minus size={18} /></button>
        <button className="assist-icon" onClick={endChat} aria-label="End chat and clear it" title="End chat"><X size={18} /></button>
      </header>
      <div className="assist-messages" ref={list} aria-live="polite">
        <div className="assist-row bot"><span className="assist-avatar"><Sparkle size={18} /></span><div className="assist-bubble">{greeting.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div></div>
        <div className="assist-chips">{suggestionsFor(location.pathname).map(s => <button key={s} onClick={() => ask(s)} disabled={busy}><span>{s}</span><ChevronRight size={16} /></button>)}</div>
        {messages.map((m, i) => m.role === 'user'
          ? <div key={i} className="assist-row me"><div className="assist-bubble">{m.content}</div></div>
          : <div key={i} className="assist-row bot"><span className="assist-avatar"><Sparkle size={18} /></span><div className={`assist-bubble ${m.error ? 'error' : ''}`}><Rich text={m.content} onLink={follow} />{m.refresh && <button className="assist-refresh" onClick={() => window.location.reload()}>Refresh now</button>}{m.done && <ul className="assist-done">{m.done.map((d, j) => <li key={j} className={d.ok ? 'ok' : d.info ? 'info' : 'failed'}>{d.ok ? <Check size={13} /> : d.info ? <Info size={13} /> : <TriangleAlert size={13} />}{d.text}</li>)}</ul>}</div></div>)}
        {busy && <div className="assist-row bot"><span className="assist-avatar"><Sparkle size={18} /></span><div className="assist-bubble assist-typing" aria-label="3DEEZI ASSIST is typing"><i /><i /><i /></div></div>}
      </div>
      <form className="assist-input" onSubmit={e => { e.preventDefault(); ask(text); }}>
        <input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder="Ask 3DEEZI ASSIST..." maxLength={600} aria-label="Ask 3DEEZI ASSIST" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3.5 21 12 4 20.5l3-8.5-3-8.5Z" /></svg></button>
      </form>
    </section>}
    {/* In the footer's 3DEEZI ASSIST place while it is on screen, otherwise in the bottom-right corner. */}
    {dock ? createPortal(button, dock) : button}
  </div>;
}

/** Light Markdown from the assistant: paragraphs, "- " lists, **bold** and links to this site's pages. */
function Rich({ text, onLink }: { text: string; onLink: (to: string) => void }) {
  const inline = (line: string): ReactNode[] => line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const path = link[2].replace(/^https?:\/\/[^/]+/i, '');
      return pages.includes(path.split(/[?#]/)[0]) ? <Link key={i} to={path} onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); onLink(path); }}>{link[1]}<ChevronRight size={13} /></Link> : <Fragment key={i}>{link[1]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => { if (items.length) blocks.push(<ul key={blocks.length}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>); items = []; };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) { items.push(item[1]); continue; }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>);
  }
  flush();
  return <>{blocks}</>;
}
