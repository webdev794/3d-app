import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowRight, CheckCircle2, Clock3, FileImage, FileText, FolderOpen, History, ImagePlus, Layers3, LoaderCircle, LogOut, PenLine, Plus, Search, ShieldCheck, Sparkles, Trash2, UploadCloud, UserRound, X } from 'lucide-react';
import { api, downloadFile, fetchFile } from '../api';
import type { Project, User } from '../api';
import type { Design } from '../types';
import ImageEditor, { keepInAssets } from '../components/ImageEditor';
import './library.css';

type PageActions = { onOpen: (project: Project) => void; onCreate: () => void };
type Asset = { id: number; name: string; type: 'logo' | 'pattern' | 'artwork' | 'reference' | 'layout'; mime_type: string; size: number; url: string; created_at: string };
type ProjectVersion = { id: number; version: number; design: Project['design']; name: string; created_at: string };
type Dashboard = { projects: number; drafts: number; approved: number; assets: number; recent_projects: Project[] };

function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
/** The Studio's garment names ("Zip hoodie", "Polo with pocket"); others are title-cased ids. */
const GARMENT_NAMES: Record<string, string> = { fullkit: 'Full kit', tee: 'Training tee', pocketpolo: 'Polo with pocket', hoodie: 'Hoodie', ziphoodie: 'Zip hoodie' };
function title(value: string) { return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function date(value: string) { return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function bytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

function useRemote<T>(path: string) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true); setError('');
        try { setData(await api<T>(path)); } catch (err) { setError(message(err)); }
        finally { setLoading(false); }
    }, [path]);
    useEffect(() => { void load(); }, [load]);
    return { data, setData, loading, error, reload: load };
}

function Feedback({ error, loading, onRetry }: { error: string; loading: boolean; onRetry: () => void }) {
    if (loading) return <div className="lib-loading" role="status"><LoaderCircle className="lib-spin" size={25} />Loading your workspace…</div>;
    if (error) return <div className="lib-error" role="alert"><p>{error}</p><button className="button button-secondary" onClick={onRetry}>Try again</button></div>;
    return null;
}

/** A lightweight preview reflects each saved design without starting a 3D canvas. */
export function ProjectThumbnail({ project }: { project: { design: Partial<Design>; garment: string; name: string } }) {
    const id = useId().replaceAll(':', '');
    const design = project.design;
    const main = design.main || '#101c2f';
    const secondary = design.secondary || '#00dcf0';
    const accent = design.accent || '#ffffff';
    const pattern = (design.pattern || 'none').toLowerCase();
    const shorts = project.garment === 'shorts';
    const singlet = project.garment === 'singlet';
    const fullkit = project.garment === 'fullkit';
    const polo = project.garment === 'polo' || project.garment === 'pocketpolo';
    const hoodie = project.garment === 'hoodie' || project.garment === 'ziphoodie';
    const crewNeck = project.garment === 'tee' || polo || hoodie;
    const zones = (design.zoneColors ?? {}) as Partial<Record<'hood' | 'lining' | 'rib' | 'pocket' | 'zip', string>>;
    // A hoodie has long sleeves to the wrist.
    const outline = shorts ? 'M99 71H221L230 229H169L160 158L151 229H90Z' : singlet ? 'M117 55L139 48Q160 75 181 48L203 55L195 108L207 242H113L125 108Z' : hoodie ? 'M107 67L138 49Q160 70 182 49L213 67L246 196L222 203L204 125L209 242H111L116 125L98 203L74 196Z' : 'M107 67L138 49Q160 70 182 49L213 67L256 119L221 144L204 125L209 242H111L116 125L99 144L64 119Z';
    return <svg className="lib-kit-svg" viewBox={fullkit ? '0 0 320 420' : '0 0 320 280'} role="img" aria-label={`${project.name} front design illustration`}>
        <defs>
            <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="white" stopOpacity=".2" /><stop offset=".4" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="black" stopOpacity=".42" /></linearGradient>
            <radialGradient id={`${id}-glow`}><stop stopColor={secondary} stopOpacity=".2" /><stop offset="1" stopColor={secondary} stopOpacity="0" /></radialGradient>
            <clipPath id={`${id}-clip`}><path d={outline} /></clipPath>
            <pattern id={`${id}-pattern`} width="320" height="26" patternUnits="userSpaceOnUse"><path d="M60 0L160 25L260 0" fill="none" stroke={secondary} strokeWidth="3" opacity=".45" /></pattern>
            <pattern id={`${id}-velocity`} width="320" height="32" patternUnits="userSpaceOnUse"><path d="M60 0L130 22L130 28L60 8M260 0L190 22L190 28L260 8" fill={secondary} opacity=".45" /></pattern>
        </defs>
        <ellipse cx="160" cy="145" rx="146" ry="134" fill={`url(#${id}-glow)`} />
        <ellipse cx="160" cy={fullkit ? 403 : 256} rx="83" ry="7" fill="black" opacity=".45" />
        <ellipse cx="160" cy={fullkit ? 405 : 258} rx="78" ry="3" fill={secondary} opacity=".24" />
        {hoodie && <path d="M128 56Q124 18 160 14Q196 18 192 56Q176 44 160 44Q144 44 128 56Z" fill={zones.hood || main} stroke={secondary} strokeOpacity=".55" strokeWidth="1.5" />}
        <path d={outline} fill={main} stroke={secondary} strokeOpacity=".55" strokeWidth="1.5" />
        <g clipPath={`url(#${id}-clip)`}>
            {pattern === 'stripes' && <g stroke={secondary} strokeWidth="2" opacity=".45"><path d="M106 50V245M124 50V245M142 50V245M160 50V245M178 50V245M196 50V245M214 50V245" /></g>}
            {['chevron', 'velocity'].includes(pattern) && <rect x="62" y="46" width="198" height="202" fill={`url(#${id}-${pattern === 'velocity' ? 'velocity' : 'pattern'})`} />}
            {design.patternImage?.startsWith('data:image/') && <image href={design.patternImage} x="113" y="110" width="94" height="130" opacity={design.patternBody ?? 0.1} preserveAspectRatio="xMidYMid slice" />}
            {!shorts && <><path d="M79 89L113 77L130 241H112L116 125L100 145Z" fill={secondary} opacity=".72" /><path d="M241 89L207 77L190 241H208L204 125L220 145Z" fill={secondary} opacity=".72" /></>}
            <path d={outline} fill={`url(#${id}-shine)`} />
        </g>
        {!shorts && <><path d={crewNeck ? 'M136 49Q160 82 184 49L179 46Q160 70 141 46Z' : 'M136 49L160 78L184 49L179 46L160 67L141 46Z'} fill={secondary} />{polo && <><path d="M155 62H165V104H155Z" fill={secondary} /><circle cx="160" cy="79" r="1.5" fill={accent} /><circle cx="160" cy="89" r="1.5" fill={accent} /><circle cx="160" cy="99" r="1.5" fill={accent} /></>}{design.logoImage?.startsWith('data:image/') ? <image href={design.logoImage} x="177" y="95" width="20" height="22" preserveAspectRatio="xMidYMid meet" /> : <><path d="M186 96L196 101L194 113L186 117L178 113L176 101Z" fill={accent} /><text x="186" y="109" fill={main} fontSize="7" textAnchor="middle" fontWeight="800">3D</text></>}<text x="160" y="147" fill={accent} textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Rajdhani, Inter, sans-serif" fontStyle="italic">{(design.logoText ?? '3DEEZI').toUpperCase().slice(0, 16)}</text></>}
        {hoodie && <><path d="M138 49Q160 30 182 49Q160 62 138 49Z" fill={zones.lining || secondary} /><path d="M111 232H209M98 197L74 190M222 197L246 190" stroke={zones.rib || secondary} strokeWidth="6" />
            {project.garment === 'ziphoodie' ? <><path d="M160 58V236" stroke={zones.zip || secondary} strokeWidth="3" /><path d="M122 178L146 172V214H118ZM198 178L174 172V214H202Z" fill={zones.pocket || main} stroke={secondary} strokeOpacity=".6" /></> : <path d="M126 176H194L204 214H116Z" fill={zones.pocket || main} stroke={secondary} strokeOpacity=".6" />}</>}
        {project.garment === 'pocketpolo' && <path d="M171 121H201V146Q186 151 171 146Z" fill={zones.pocket || main} stroke={accent} strokeOpacity=".8" strokeWidth="1.5" />}
        {shorts && <><path d="M99 75H221" stroke={secondary} strokeWidth="9" /><text x="126" y="182" fill={accent} textAnchor="middle" fontSize="23" fontWeight="800">{design.number ?? ''}</text></>}
        <path d={shorts ? 'M100 230H149M171 230H220' : 'M112 238H209'} stroke={secondary} strokeWidth="3" />
        {fullkit && <><path d="M111 258H209L216 388H169L160 327L151 388H104Z" fill={main} stroke={secondary} strokeOpacity=".6" /><path d="M111 263H209" stroke={secondary} strokeWidth="8" /><path d="M111 268L104 388H115L121 268M209 268L216 388H205L199 268" fill={secondary} /><text x="134" y="345" fill={accent} fontWeight="800" textAnchor="middle" fontSize="20">{design.number ?? ''}</text></>}
    </svg>;
}

export function DesignThumbnail({ design }: { design: Partial<Design> }) {
    return <div className="lib-design-thumbnail"><ProjectThumbnail project={{ name: 'Your kit', garment: design.garment || 'jersey', design }} /><span className="lib-illustration-caption">Design illustration</span></div>;
}

function ProjectCard({ project, onOpen, onDelete, onApprove, onHistory, busy, hideStatus = false }: { project: Project; onOpen: (project: Project) => void; onDelete?: (project: Project) => void; onApprove?: (project: Project) => void; onHistory?: (project: Project) => void; busy?: boolean; hideStatus?: boolean }) {
    const thumbnail = (project as Project & { thumbnail?: string | null }).thumbnail;
    const [failedThumbnail, setFailedThumbnail] = useState('');
    const hasCapture = !!thumbnail && failedThumbnail !== thumbnail;
    return <article className="lib-project-card">
        <button className={`lib-project-preview${hasCapture ? ' has-capture' : ''}`} onClick={() => onOpen(project)} aria-label={`Open ${project.name} in the design studio`}>
            <div className="lib-preview-badges">{!hideStatus && <span className={`lib-status ${project.status === 'approved' ? 'is-approved' : ''}`}>{project.status === 'approved' ? <CheckCircle2 size={11} /> : <span className="lib-status-dot" />}{title(project.status)}</span>}<span className="lib-mode">{project.mode === 'ai' ? <Sparkles size={11} /> : <Layers3 size={11} />}{project.mode === 'ai' ? 'AI DESIGN' : 'DYO'}</span></div>
            {hasCapture ? <img className="lib-captured-preview" src={thumbnail!} alt={`${project.name} 3D preview`} loading="lazy" onError={() => setFailedThumbnail(thumbnail!)} /> : <><ProjectThumbnail project={project} /><span className="lib-illustration-caption">Design illustration</span></>}
            <span className="lib-open-overlay">Open in studio <ArrowRight size={16} /></span>
        </button>
        <div className="lib-project-info"><h3 className="lib-project-title"><button className="lib-title-link" onClick={() => onOpen(project)}>{project.name}</button></h3><p>{title(project.sport)} <span>·</span> {GARMENT_NAMES[project.garment] ?? title(project.garment)}</p>
            <div className="lib-project-footer"><span>V{project.version} <span>·</span> {date(project.updated_at)}</span><div className="lib-card-actions">
                {onApprove && <button className={`lib-small-button ${project.status === 'approved' ? 'is-approved' : ''}`} disabled={busy} onClick={() => onApprove(project)} title={project.status === 'approved' ? 'Return to draft' : 'Approve design'} aria-label={`${project.status === 'approved' ? 'Return to draft' : 'Approve'} ${project.name}`}><ShieldCheck size={15} /></button>}
                {onHistory && <button className="lib-small-button" onClick={() => onHistory(project)} title="Version history" aria-label={`Version history for ${project.name}`}><History size={15} /></button>}
                {onDelete && <button className="lib-small-button lib-delete-button" disabled={busy} onClick={() => onDelete(project)} title="Delete project" aria-label={`Delete ${project.name}`}><Trash2 size={14} /></button>}
            </div></div>
        </div>
    </article>;
}

function Dialog({ title: heading, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const titleId = useId();
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
    return <dialog ref={dialog} className="lib-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="lib-dialog-content"><div className="lib-dialog-heading"><h2 id={titleId}>{heading}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}</div></dialog>;
}

function VersionHistory({ project, onClose }: { project: Project; onClose: () => void }) {
    const { data, loading, error, reload } = useRemote<ProjectVersion[]>(`/projects/${project.id}/versions`);
    return <Dialog title="Version history" onClose={onClose}><p className="muted">{project.name}</p><Feedback loading={loading} error={error} onRetry={reload} />{!loading && !error && <div className="lib-versions">{data?.length ? data.map((version) => <div className="lib-version" key={version.id}><span className="lib-version-symbol"><History size={18} /></span><div><strong>Version {version.version}</strong><p>{version.name}</p><span>{date(version.created_at)}</span></div>{version.version === project.version && <span className="lib-status is-approved">Current</span>}</div>) : <p className="muted">No saved versions yet.</p>}</div>}</Dialog>;
}

export function ProjectsPage({ onOpen, onCreate, approvedOnly = false }: PageActions & { approvedOnly?: boolean }) {
    const { data, setData, loading, error, reload } = useRemote<Project[]>('/projects');
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [deleting, setDeleting] = useState<Project | null>(null);
    const [history, setHistory] = useState<Project | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const [actionError, setActionError] = useState('');
    const available = (data || []).filter((project) => !approvedOnly || project.status === 'approved');
    const projects = available.filter((project) => (filter === 'all' || (filter === 'draft' ? project.status === 'draft' : project.mode === filter)) && `${project.name} ${project.sport} ${project.garment} ${GARMENT_NAMES[project.garment] ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    async function deleteProject() {
        if (!deleting) return;
        setBusy(deleting.id); setActionError('');
        try { await api(`/projects/${deleting.id}`, { method: 'DELETE' }); setData((previous) => previous?.filter((project) => project.id !== deleting.id) || []); setDeleting(null); }
        catch (err) { setActionError(message(err)); } finally { setBusy(null); }
    }
    async function approveProject(project: Project) {
        setBusy(project.id); setActionError('');
        try { const updated = await api<Project>(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ status: project.status === 'approved' ? 'draft' : 'approved' }) }); setData((previous) => previous?.map((item) => item.id === updated.id ? updated : item) || []); }
        catch (err) { setActionError(message(err)); } finally { setBusy(null); }
    }
    return <main className="page-shell lib-page">
        <div className="page-heading lib-heading"><h1>{approvedOnly ? 'Approved designs' : 'My projects'}</h1><button className="button button-primary" onClick={onCreate}><Plus size={17} /> New kit</button></div>
        {available.length > 0 && <div className="lib-toolbar"><div className="lib-tabs" aria-label="Filter projects">{[['all', 'All'], ['ai', 'AI designs'], ['dyo', 'My designs'], ...(!approvedOnly ? [['draft', 'Drafts']] : [])].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="lib-search"><Search size={17} /><input type="search" placeholder="Search projects…" aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>}
        {actionError && !deleting && <div className="lib-error lib-inline-error" role="alert">{actionError}<button onClick={() => setActionError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        <Feedback loading={loading} error={error} onRetry={reload} />
        {!loading && !error && (projects.length ? <><div className="lib-results-label"><span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span><span>Open a project to explore it in 3D</span></div><div className="lib-project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpen} onApprove={approveProject} onDelete={(item) => { setActionError(''); setDeleting(item); }} onHistory={setHistory} busy={busy === project.id} hideStatus={approvedOnly} />)}</div></> : <div className="empty-state lib-empty"><span className="lib-empty-icon"><FolderOpen size={32} /></span><h2>{search || filter !== 'all' ? 'No matching projects' : approvedOnly ? 'No approved designs yet' : 'No projects yet'}</h2><p>{search || filter !== 'all' ? 'Try a different search or clear the filters.' : approvedOnly ? 'Approve a saved design from My projects to add it here.' : 'Create a new kit and save it in the studio to add it here.'}</p>{(search || filter !== 'all') && <button className="button button-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button>}</div>)}
        {deleting && <Dialog title="Delete this project?" onClose={() => { if (busy === null) setDeleting(null); }}><p className="muted">“{deleting.name}” and its saved versions will be permanently deleted.</p>{actionError && <p className="lib-form-error" role="alert">{actionError}</p>}<div className="lib-dialog-actions"><button className="button button-secondary" disabled={busy !== null} onClick={() => setDeleting(null)}>Keep project</button><button className="button lib-danger-button" disabled={busy !== null} onClick={deleteProject}>{busy !== null ? <LoaderCircle className="lib-spin" size={16} /> : <Trash2 size={16} />}Delete project</button></div></Dialog>}
        {history && <VersionHistory project={history} onClose={() => setHistory(null)} />}
    </main>;
}

function AssetPreview({ asset }: { asset: Asset }) {
    const [url, setUrl] = useState('');
    const [failed, setFailed] = useState(false);
    const pdf = asset.mime_type === 'application/pdf';
    useEffect(() => {
        let disposed = false;
        let objectUrl = '';
        setFailed(false);
        if (pdf) return;
        fetchFile(`/assets/${asset.id}/file`).then((blob) => { if (disposed) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => { if (!disposed) setFailed(true); });
        return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [asset.id, pdf]);
    if (pdf) return <div className="lib-asset-preview"><div className="lib-asset-fallback"><FileText size={30} /><span>{asset.type === 'layout' ? 'Print layout · PDF' : 'PDF'}</span></div></div>;
    return <div className={`lib-asset-preview ${asset.type === 'pattern' ? 'is-pattern' : ''}`}>{url && !failed ? <img src={url} alt={asset.name} onError={() => setFailed(true)} /> : failed ? <div className="lib-asset-fallback"><FileImage size={30} /><span>Preview unavailable</span></div> : <LoaderCircle className="lib-spin" size={23} />}</div>;
}

export function AssetsPage() {
    const { data, setData, loading, error, reload } = useRemote<Asset[]>('/assets');
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [uploading, setUploading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState('');
    const [type, setType] = useState<Asset['type']>('logo');
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState<Asset | null>(null);
    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState('');
    const [editing, setEditing] = useState<{ asset: Asset; src: string } | null>(null);
    const assets = (data || []).filter((asset) => (filter === 'all' || asset.type === filter) && asset.name.toLowerCase().includes(search.toLowerCase()));
    function openUpload() { setFile(null); setName(''); setType('logo'); setActionError(''); setUploading(true); }
    async function upload(event: FormEvent) {
        event.preventDefault();
        if (!file) { setActionError('Choose an image to upload.'); return; }
        if (file.size > 10 * 1024 * 1024) { setActionError('Choose an image smaller than 10 MB.'); return; }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setActionError('Choose a PNG, JPG or WebP image.'); return; }
        setBusy(true); setActionError('');
        const body = new FormData(); body.append('file', file); body.append('name', name.trim()); body.append('type', type);
        try { const asset = await api<Asset>('/assets', { method: 'POST', body }); setData((previous) => [asset, ...(previous || [])]); setUploading(false); setNotice('Your asset has been added to the library.'); }
        catch (err) { setActionError(message(err)); } finally { setBusy(false); }
    }
    async function deleteAsset() {
        if (!deleting) return;
        setBusy(true); setActionError('');
        try { await api(`/assets/${deleting.id}`, { method: 'DELETE' }); setData((previous) => previous?.filter((asset) => asset.id !== deleting.id) || []); setDeleting(null); setNotice('Asset deleted.'); }
        catch (err) { setActionError(message(err)); } finally { setBusy(false); }
    }
    /** Opens a picture in the image editor; Save keeps the chosen version as a new asset. */
    async function edit(asset: Asset) {
        setActionError('');
        try { setEditing({ asset, src: URL.createObjectURL(await fetchFile(`/assets/${asset.id}/file`)) }); }
        catch (err) { setActionError(message(err)); }
    }
    function closeEditor() { if (editing) URL.revokeObjectURL(editing.src); setEditing(null); }
    async function saveEdited(image: string) {
        if (!editing) return;
        const kind = (['logo', 'pattern', 'artwork', 'reference'] as const).find((value) => value === editing.asset.type) ?? 'artwork';
        const asset = await keepInAssets<Asset>(image, `${editing.asset.name.slice(0, 110)} (edited)`, kind);
        setData((previous) => [asset, ...(previous || [])]);
        closeEditor();
        setNotice('Your edited image has been saved as a new asset.');
    }
    async function download(asset: Asset) {
        setActionError('');
        try { const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' } as Record<string, string>)[asset.mime_type] || 'png'; await downloadFile(`/assets/${asset.id}/file`, `${asset.name}.${extension}`); }
        catch (err) { setActionError(message(err)); }
    }
    return <main className="page-shell lib-page">
        <div className="page-heading lib-heading"><h1>Asset library</h1><button className="button button-primary" onClick={openUpload}><UploadCloud size={18} /> Upload asset</button></div>
        {!!data?.length && <div className="lib-toolbar"><div className="lib-tabs" aria-label="Filter assets">{[['all', 'All'], ['logo', 'Logos'], ['pattern', 'Patterns'], ['artwork', 'Artwork'], ['reference', 'References'], ['layout', 'Print layouts']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="lib-search"><Search size={17} /><input type="search" placeholder="Search assets…" aria-label="Search assets" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>}
        {notice && <div className="lib-notice" role="status"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
        {actionError && !uploading && !deleting && <div className="lib-error lib-inline-error" role="alert">{actionError}</div>}
        <Feedback loading={loading} error={error} onRetry={reload} />
        {!loading && !error && (assets.length ? <div className="lib-assets-grid">{assets.map((asset) => <article className="lib-asset-card" key={asset.id}><AssetPreview asset={asset} /><div className="lib-asset-info">{filter === 'all' && <span className="lib-asset-type">{asset.type === 'layout' ? 'print layout' : asset.type}</span>}<h3 title={asset.name}>{asset.name}</h3><div className="lib-project-footer"><span>{bytes(asset.size)} <span>·</span> {date(asset.created_at)}</span><div className="lib-card-actions">{['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type) && <button className="lib-small-button" onClick={() => edit(asset)} title="Edit image" aria-label={`Edit ${asset.name}`}><PenLine size={15} /></button>}<button className="lib-small-button" onClick={() => download(asset)} title="Download asset" aria-label={`Download ${asset.name}`}><ArrowDownToLine size={15} /></button><button className="lib-small-button lib-delete-button" onClick={() => { setActionError(''); setDeleting(asset); }} title="Delete asset" aria-label={`Delete ${asset.name}`}><Trash2 size={14} /></button></div></div></div></article>)}</div> : <div className="empty-state lib-empty"><span className="lib-empty-icon"><ImagePlus size={32} /></span><h2>{search || filter !== 'all' ? 'No matching assets' : 'No assets yet'}</h2><p>{search || filter !== 'all' ? 'Try another search or clear the filters.' : 'Upload logos, patterns or reference images to use in your designs.'}</p>{(search || filter !== 'all') && <button className="button button-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button>}</div>)}
        {uploading && <Dialog title="Add to your library" onClose={() => { if (!busy) setUploading(false); }}><form onSubmit={upload}><label className="lib-upload-zone"><input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); if (next && !name) setName(next.name.replace(/\.[^.]+$/, '')); }} /><UploadCloud size={30} /><strong>{file ? file.name : 'Choose an image'}</strong><span>{file ? bytes(file.size) : 'PNG, JPG or WebP · up to 10 MB'}</span></label><label className="field lib-field">Asset name<input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Club crest" maxLength={150} required /></label><label className="field lib-field">Category<select className="input" value={type} onChange={(event) => setType(event.target.value as Asset['type'])}><option value="logo">Logo</option><option value="pattern">Pattern</option><option value="artwork">Artwork</option><option value="reference">Reference image</option></select></label>{actionError && <p className="lib-form-error" role="alert">{actionError}</p>}<div className="lib-dialog-actions"><button type="button" className="button button-secondary" onClick={() => setUploading(false)} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="lib-spin" /> : <UploadCloud size={17} />}{busy ? 'Uploading…' : 'Upload asset'}</button></div></form></Dialog>}
        {editing && <ImageEditor src={editing.src} title={editing.asset.name} fileName={editing.asset.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()} useLabel="Save as new asset" onUse={saveEdited} onClose={closeEditor} />}
        {deleting && <Dialog title="Delete this asset?" onClose={() => { if (!busy) setDeleting(null); }}><p className="muted">“{deleting.name}” will be permanently removed from your asset library.{deleting.type === 'layout' && ' Kits that use this print layout are shown without it until it is uploaded again.'}</p>{actionError && <p className="lib-form-error" role="alert">{actionError}</p>}<div className="lib-dialog-actions"><button className="button button-secondary" disabled={busy} onClick={() => setDeleting(null)}>Keep asset</button><button className="button lib-danger-button" disabled={busy} onClick={deleteAsset}>{busy ? <LoaderCircle size={16} className="lib-spin" /> : <Trash2 size={16} />}Delete asset</button></div></Dialog>}
    </main>;
}

export function DashboardPage({ onOpen, onCreate }: PageActions) {
    const { data, loading, error, reload } = useRemote<Dashboard>('/dashboard');
    return <main className="page-shell lib-page">
        <div className="page-heading lib-heading"><h1>Dashboard</h1><button className="button button-primary" onClick={onCreate}><Plus size={17} /> New kit</button></div>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {!loading && !error && data && <><div className="lib-stat-grid">{[{ label: 'Projects', value: data.projects, icon: FolderOpen, color: 'cyan' }, { label: 'Drafts', value: data.drafts, icon: Clock3, color: 'purple' }, { label: 'Approved', value: data.approved, icon: ShieldCheck, color: 'green' }, { label: 'Assets', value: data.assets, icon: Layers3, color: 'blue' }].map(({ label, value, icon: Icon, color }) => <div className={`lib-stat-card ${color}`} key={label}><div className="lib-stat-top"><span>{label}</span><Icon size={19} /></div><strong>{value}</strong></div>)}</div>
            <div className="lib-section-heading"><h2>Recent projects</h2>{data.recent_projects.length > 0 && <span className="muted">Open a project to explore it in 3D</span>}</div>
            {data.recent_projects.length ? <div className="lib-project-grid">{data.recent_projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpen} />)}</div> : <div className="lib-dashboard-empty panel"><FolderOpen size={28} /><div><h3>No projects yet</h3><p className="muted">Create a new kit and save it in the studio to add it here.</p></div></div>}</>}
    </main>;
}

export function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
    const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    return <main className="page-shell lib-page">
        <div className="page-heading lib-heading"><h1>Profile</h1></div>
        <section className="lib-account-card lib-profile-account"><div className="lib-account-title"><div className="lib-avatar">{initials || <UserRound size={35} />}</div><h2>{user.name}</h2></div><dl className="lib-account-details"><div><dt>Email address</dt><dd>{user.email}</dd></div>{user.created_at && <div><dt>Member since</dt><dd>{date(user.created_at)}</dd></div>}</dl><div className="lib-account-footer"><Link className="button button-outline" to="/orders">My orders</Link>{user.is_admin && <Link className="button button-outline" to="/admin">Admin panel</Link>}<button className="button button-secondary" onClick={onLogout}><LogOut size={16} />Sign out</button></div></section>
    </main>;
}
