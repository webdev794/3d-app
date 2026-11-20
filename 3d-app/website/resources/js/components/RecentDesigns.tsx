import { useEffect, useState } from 'react';
import { FolderOpen, History, LogIn } from 'lucide-react';
import { api, type Project } from '../api';
import '../../css/recent-designs.css';

/** A saved AI Designer brief in the list (GET /ai/sessions): the prompt and small copies of its designs. */
export type AiSessionSummary = { id: number; prompt: string; sport?: string | null; garment?: string | null; source?: string; count: number; names: (string | null)[]; thumbs: (string | null)[] | null; created_at: string; updated_at: string };
/** One design of a session, as reopened (GET /ai/sessions/{id}) or kept on this device. */
export type AiSessionOption = { name?: string | null; description?: string | null; quality?: 'high' | 'medium' | null; view?: 'presentation' | 'front' | null; motif?: string | null; direction?: Record<string, unknown> | null; design?: Record<string, unknown> | null; spec?: Record<string, unknown> | null; image: string | null };
export type AiSessionFull = Omit<AiSessionSummary, 'thumbs'> & { reference_ids?: number[]; options: AiSessionOption[] };
/** The last session kept in this browser (guests, and anyone signed out on this device). */
export type LocalAiSession = { prompt: string; sport?: string | null; garment?: string | null; at: string; options: AiSessionOption[] };

const LOCAL_KEY = '3deezi.ai.last';
export function readLocalSession(): LocalAiSession | null {
  try { const s = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') as LocalAiSession | null; return s?.options?.some(o => o.image) ? s : null; } catch { return null; }
}
/** Keeps the last session on this device: the pictures made smaller so it fits the browser's storage. */
export async function writeLocalSession(s: LocalAiSession) {
  try {
    const options = await Promise.all(s.options.map(async o => ({ ...o, image: o.image ? await shrink(o.image, 900) : null })));
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...s, options }));
  } catch {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...s, options: await Promise.all(s.options.slice(0, 1).map(async o => ({ ...o, image: o.image ? await shrink(o.image, 600) : null }))) })); } catch { /* storage full or blocked */ }
  }
}
/** A picture as a JPEG data URL no longer than `long` pixels (blob: and data: sources). */
export async function shrink(src: string, long: number, quality = .82): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, long / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0b1016'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function ago(when: string) {
  const s = Math.max(0, (Date.now() - new Date(when).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Recent designs on the AI Designer page (client 2026-10-30, like ChatGPT keeps your chats): the latest briefs with
 * their four designs, newest first, and the latest saved projects. A brief reopens YOUR DESIGNS with no new AI call;
 * a project opens in the Studio. Signed out: the last brief made on this device, and "Sign in to keep all your designs".
 */
export function RecentDesigns({ signedIn, checking, refresh = 0, onOpen, onOpenLocal, onOpenProject, onSignIn }: { signedIn: boolean; checking?: boolean; refresh?: number; onOpen: (id: number) => void; onOpenLocal: (s: LocalAiSession) => void; onOpenProject?: (p: Project) => void; onSignIn: () => void }) {
  const [list, setList] = useState<{ sessions: AiSessionSummary[]; projects: Project[] } | null>(null);
  const [local] = useState(readLocalSession);
  useEffect(() => {
    if (!signedIn) { setList(null); return; }
    let live = true;
    api<{ sessions: AiSessionSummary[]; projects: Project[] }>('/ai/sessions?limit=8').then(r => { if (live) setList(r); }, () => { if (live) setList({ sessions: [], projects: [] }); });
    return () => { live = false; };
  }, [signedIn, refresh]);
  if (checking) return null;
  const thumbs = (pics: (string | null)[], label: string) => <span className="rd-pics" aria-hidden="true">{[0, 1, 2, 3].map(i => pics[i] ? <img key={i} src={pics[i]!} alt="" loading="lazy" /> : <i key={i} />)}<span className="sr-only">{label}</span></span>;
  if (!signedIn) {
    return <div className="rd" aria-label="Recent designs">
      {local && <div className="rd-strip" role="list">
        <button type="button" role="listitem" className="rd-card" onClick={() => onOpenLocal(local)} title={local.prompt}>
          {thumbs(local.options.map(o => o.image), '')}
          <span className="rd-text"><b>{local.prompt}</b><small>Last design on this device · {ago(local.at)}</small></span>
        </button>
      </div>}
      <button type="button" className="rd-signin" onClick={onSignIn}><LogIn size={14} />Sign in to keep all your designs</button>
    </div>;
  }
  if (!list || (!list.sessions.length && !list.projects.length)) return null;
  return <div className="rd" aria-label="Recent designs">
    <span className="rd-label"><History size={14} aria-hidden="true" />Recent designs</span>
    <div className="rd-strip" role="list">
      {list.sessions.map(s => <button key={s.id} type="button" role="listitem" className="rd-card" onClick={() => onOpen(s.id)} title={`${s.prompt}\nReopen these ${s.count} designs (no new AI call)`}>
        {thumbs(s.thumbs ?? [], `${s.count} designs`)}
        <span className="rd-text"><b>{s.prompt}</b><small>{s.count} {s.count === 1 ? 'design' : 'designs'} · {ago(s.updated_at)}</small></span>
      </button>)}
      {onOpenProject && list.projects.map(p => <button key={`p${p.id}`} type="button" role="listitem" className="rd-card rd-project" onClick={() => onOpenProject(p)} title={`Open ${p.name} in the Studio`}>
        <span className="rd-pics rd-one" aria-hidden="true">{p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" /> : <FolderOpen size={22} />}</span>
        <span className="rd-text"><b>{p.name}</b><small>Project · {ago(p.updated_at)}</small></span>
      </button>)}
    </div>
  </div>;
}
