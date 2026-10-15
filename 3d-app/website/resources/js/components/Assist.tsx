import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Minus, X } from 'lucide-react';
import { api } from '../api';
import '../../css/assist.css';

/**
 * 3DEEZI ASSIST: the help chat on every page. The launcher button (bottom right) shows and
 * hides the chat; answers come from the server (/assist), which knows the website, its
 * tools, plans and FAQs. The conversation is kept for the browser tab, across pages.
 */
interface Message { role: 'user' | 'assistant'; content: string; error?: boolean }

const storeKey = '3deezi.assist';
const greeting = "Hi! I'm 3DEEZI ASSIST.\nWhat would you like help with?";
/** Pages a reply may link to (the server allows the same list). */
const pages = ['/', '/create/ai', '/create/sport', '/convert', '/projects', '/approved', '/assets', '/dashboard', '/downloads', '/pricing', '/studio', '/artboard'];

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

/** The 3DEEZI four-point sparkle. */
export function Sparkle({ size = 24 }: { size?: number }) {
  return <svg className="assist-sparkle" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5Z" />
  </svg>;
}

export default function Assist() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { open, messages } = state;
  const tool = /^\/(studio|artboard|admin)/.test(location.pathname);

  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify({ open, messages: messages.slice(-40) })); } catch { /* Private mode: the chat still works. */ } }, [open, messages]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy, open]);
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setState(s => ({ ...s, open: false })); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...messages.filter(m => !m.error), { role: 'user' as const, content: q }];
    setState(s => ({ ...s, open: true, messages: [...s.messages, { role: 'user', content: q }] }));
    setText(''); setBusy(true);
    try {
      const r = await api<{ reply: string }>('/assist', { method: 'POST', body: JSON.stringify({ messages: history.slice(-12).map(({ role, content }) => ({ role, content })), page: location.pathname }) });
      setState(s => ({ ...s, messages: [...s.messages, { role: 'assistant', content: r.reply }] }));
    } catch (e) {
      const status = (e as { status?: number }).status;
      const content = status === 429 ? "You're asking quickly. Please wait a moment and try again." : (e as Error).message;
      setState(s => ({ ...s, messages: [...s.messages, { role: 'assistant', content, error: true }] }));
    } finally { setBusy(false); }
  }
  const toggle = () => setState(s => ({ ...s, open: !s.open }));
  const minimise = () => setState(s => ({ ...s, open: false }));
  const endChat = () => { setState({ open: false, messages: [] }); setText(''); };
  /**
   * Follows a link from a reply: minimises the chat so the page shows, opens the page and scrolls to
   * the section after a # (e.g. /#create-options); a link to the page already open scrolls to its top.
   */
  function follow(target: string) {
    const [path, hash] = target.split('#'), page = path || '/';
    minimise();
    const scroll = () => { const section = hash && document.getElementById(hash); if (section) section.scrollIntoView({ behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' }); };
    if (page === location.pathname) { scroll(); return; }
    navigate(page);
    if (hash) setTimeout(scroll, 400);   // after the new page has rendered (and the app's scroll to top)
  }

  const artboard = location.pathname.startsWith('/artboard');
  return <div className={`assist ${tool ? 'assist-tool' : ''} ${artboard ? 'assist-artboard' : ''} ${open ? 'is-open' : ''}`}>
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
          : <div key={i} className="assist-row bot"><span className="assist-avatar"><Sparkle size={18} /></span><div className={`assist-bubble ${m.error ? 'error' : ''}`}><Rich text={m.content} onLink={follow} /></div></div>)}
        {busy && <div className="assist-row bot"><span className="assist-avatar"><Sparkle size={18} /></span><div className="assist-bubble assist-typing" aria-label="3DEEZI ASSIST is typing"><i /><i /><i /></div></div>}
      </div>
      <form className="assist-input" onSubmit={e => { e.preventDefault(); ask(text); }}>
        <input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder="Ask 3DEEZI ASSIST..." maxLength={600} aria-label="Ask 3DEEZI ASSIST" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3.5 21 12 4 20.5l3-8.5-3-8.5Z" /></svg></button>
      </form>
    </section>}
    <button className="assist-launcher" onClick={toggle} aria-expanded={open} aria-controls="assist-panel" title={open ? 'Hide 3DEEZI ASSIST' : 'Ask 3DEEZI ASSIST'}>
      <Sparkle size={tool ? 24 : 26} /><span>3DEEZI ASSIST</span>
    </button>
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
