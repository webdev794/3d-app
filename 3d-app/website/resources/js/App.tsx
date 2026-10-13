import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, Check, ChevronRight, Cpu, FolderOpen, LoaderCircle, LogOut, Menu, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { api, getToken, media, setToken, type Catalog, type Project, type User } from './api';
import { defaultDesign, type Design } from './types';
import { AiDesigner, ConvertPage, GarmentSelection, SportSelection } from './pages/Create';
import PricingPage from './pages/Pricing';
import AdminPage from './pages/Admin';
import { MyOrdersPage } from './pages/Orders';
import Studio from './pages/Studio';
import { ProjectsPage, AssetsPage, DashboardPage, ProfilePage } from './pages/Library';

export interface Draft { id?: number; version?: number; name: string; sport: string; garment: string; mode: 'ai' | 'dyo'; design: Design; thumbnail?: string | null; /** AI pattern motif still to be generated for this design. */ patternMotif?: string }
export const newDraft = (): Draft => ({ name: 'Untitled kit', sport: 'rugby-league', garment: 'jersey', mode: 'dyo', design: { ...defaultDesign } });
function loadDraft(): Draft { try { const saved = sessionStorage.getItem('3deezi.draft'); return saved ? { ...newDraft(), ...JSON.parse(saved) } : newDraft(); } catch { return newDraft(); } }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(!!getToken());
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [notice, setNotice] = useState('');
  const afterAuth = useRef<(() => void) | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const loadCatalog = () => { setCatalogError(''); api<Catalog>('/catalog').then(setCatalog).catch(e => setCatalogError(e.message)); };
  useEffect(loadCatalog, []);
  // Warm the loader emblem so it shows the moment a generation starts.
  useEffect(() => { new Image().src = media('showroom/emblem-256.webp'); }, []);
  useEffect(() => {
    if (getToken()) api<User>('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setCheckingSession(false));
    const expire = () => { setToken(null); setUser(null); setNotice('Your session has expired. Sign in again to continue.'); setAuthOpen(true); };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  useEffect(() => { try { sessionStorage.setItem('3deezi.draft', JSON.stringify(draft)); } catch { /* Large image edits remain in memory. */ } }, [draft]);
  useEffect(() => { setMenuOpen(false); window.scrollTo({ top: 0 }); }, [location.pathname]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); } }, [notice]);

  function requireAuth(action?: () => void) { if (user) action?.(); else { afterAuth.current = action || null; setAuthOpen(true); } }
  function start(mode: 'ai' | 'dyo') { setDraft({ ...newDraft(), mode }); navigate(mode === 'ai' ? '/create/ai' : '/create/sport'); }
  function openProject(project: Project) { setDraft({ ...project, design: { ...defaultDesign, ...project.design } }); navigate('/studio'); }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear local credentials even when a session has already expired. */ }
    setToken(null); setUser(null); setDraft(newDraft()); navigate('/'); setNotice('You have signed out.');
  }
  function protectedPage(content: ReactNode) {
    if (checkingSession) return <div className="page-shell empty-state"><LoaderCircle className="spin" /><p>Restoring your workspace…</p></div>;
    return user ? content : <div className="page-shell"><div className="auth-gate panel"><ShieldCheck size={38} /><span className="eyebrow">YOUR PERSONAL WORKSPACE</span><h1>Make it yours.</h1><p>Sign in to save your kits, keep every version, and bring your assets together.</p><button className="button button-primary" onClick={() => requireAuth()}>Sign in or create an account <ArrowRight size={18} /></button></div></div>;
  }

  const studio = location.pathname.startsWith('/studio') || (location.pathname.startsWith('/admin') && !!user?.is_admin);
  return <>
    {!studio && <header className="site-header"><div className="header-inner">
      <Link to="/" className="brand" aria-label="3DEEZI home"><img src={media('images/brand.png')} alt="3DEEZI" /><span>AI SPORTSWEAR DESIGNER</span></Link>
      <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <NavLink to="/" end>Create</NavLink><NavLink to="/convert">Convert</NavLink><NavLink to="/projects">Projects</NavLink><NavLink to="/approved">Approved</NavLink><NavLink to="/assets">Assets</NavLink><NavLink to="/dashboard">Dashboard</NavLink><NavLink to="/pricing" className="nav-mobile-only">Pricing</NavLink>
      </nav>
      <div className="header-actions">{user?.is_admin && <Link className="button button-outline admin-link" to="/admin"><ShieldCheck size={15} /> Admin</Link>}{user ? <Link className="account-link" to="/profile"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name.split(' ')[0]}</span></Link> : <button className="button button-quiet" onClick={() => requireAuth()}>Sign in</button>}<button className="button button-primary header-cta" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('create-options')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>Start a kit <ArrowRight size={15} /></button><button className="icon-button mobile-toggle" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X /> : <Menu />}</button></div>
    </div></header>}
    {catalogError && <div className="server-banner" role="alert">{catalogError} <button onClick={loadCatalog}>Retry connection</button></div>}
    <main><Routes>
      <Route path="/" element={<Home onStart={start} onStudio={() => navigate('/studio')} />} />
      <Route path="/create/ai" element={<AiDesigner catalog={catalog} draft={draft} onChange={setDraft} requireAuth={requireAuth} onStudio={() => navigate('/studio')} />} />
      <Route path="/create/sport" element={<SportSelection catalog={catalog} selected={draft.sport} onSelect={sport => setDraft(d => ({ ...d, sport, mode: 'dyo' }))} onNext={() => navigate('/create/garment')} />} />
      <Route path="/create/garment" element={<GarmentSelection catalog={catalog} draft={draft} onSelect={garment => setDraft(d => ({ ...d, garment, design: { ...d.design, garment: garment as Design['garment'] } }))} onNext={() => navigate('/studio')} onBack={() => navigate('/create/sport')} />} />
      <Route path="/convert" element={<ConvertPage catalog={catalog} draft={draft} onChange={setDraft} requireAuth={requireAuth} onStudio={() => navigate('/studio')} />} />
      <Route path="/admin" element={protectedPage(user && (user.is_admin ? <AdminPage me={user} onNotice={setNotice} onLogout={logout} catalog={catalog} /> : <NotAdmin />))} />
      <Route path="/admin/:section" element={protectedPage(user && (user.is_admin ? <AdminPage me={user} onNotice={setNotice} onLogout={logout} catalog={catalog} /> : <NotAdmin />))} />
      <Route path="/orders" element={protectedPage(<MyOrdersPage />)} />
      <Route path="/pricing" element={<PricingPage onStart={() => start('dyo')} />} />
      <Route path="/studio" element={<Studio draft={draft} onChange={setDraft} catalog={catalog} requireAuth={requireAuth} onNotice={setNotice} user={user} />} />
      <Route path="/projects" element={protectedPage(<ProjectsPage onOpen={openProject} onCreate={() => start('dyo')} />)} />
      <Route path="/approved" element={protectedPage(<ProjectsPage approvedOnly onOpen={openProject} onCreate={() => start('dyo')} />)} />
      <Route path="/assets" element={protectedPage(<AssetsPage />)} />
      <Route path="/dashboard" element={protectedPage(<DashboardPage onOpen={openProject} onCreate={() => start('dyo')} />)} />
      <Route path="/profile" element={protectedPage(user && <ProfilePage user={user} onLogout={logout} />)} />
      <Route path="*" element={<div className="page-shell empty-state"><h1>Off the field?</h1><p>This page doesn’t exist. Your next kit starts here.</p><Link className="button button-primary" to="/">Back to create <ArrowRight size={18} /></Link></div>} />
    </Routes></main>
    {!studio && <footer className="site-footer"><Link to="/" className="footer-brand">3DEEZI<span>YOUR SPORT. <b>YOUR WAY.</b></span></Link><span>Designed for the next generation of teams.</span><Link to="/pricing" className="footer-link">Plans & pricing</Link><span>CREATE <i>·</i> DESIGN <i>·</i> PLAY</span></footer>}
    {authOpen && <AuthModal onClose={() => { setAuthOpen(false); afterAuth.current = null; }} onSuccess={(nextUser, token) => { setToken(token); setUser(nextUser); setAuthOpen(false); setNotice(`Welcome, ${nextUser.name.split(' ')[0]}. Your workspace is ready.`); const callback = afterAuth.current; afterAuth.current = null; callback?.(); }} />}
    {notice && <div className="toast" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </>;
}

function NotAdmin() {
  return <div className="page-shell"><div className="auth-gate panel"><ShieldCheck size={38} /><span className="eyebrow">ADMIN PANEL</span><h1>Administrators only.</h1><p>Your account doesn’t have administrator access. Ask an administrator to give it to you under Admin → Users.</p><Link className="button button-primary" to="/">Back to create <ArrowRight size={18} /></Link></div></div>;
}

function Home({ onStart, onStudio }: { onStart: (mode: 'ai' | 'dyo') => void; onStudio: () => void }) {
  return <div className="home">
    <section className="hero">
      <div className="hero-glow" /><div className="hero-image"><img src={media('campaign/hero-3deezi.webp')} alt="Realistic black and cyan jersey with woven fabric, stitched panels and sculpted folds, displayed above a lit podium in a futuristic stadium" fetchPriority="high" /></div>
      <div className="hero-inner"><div className="hero-copy"><div className="hero-kicker"><span /> PROMPT. DESIGN. PLAY.</div><h1>YOUR NEXT<br /><em>GAME CHANGER.</em><br />STARTS HERE.</h1><p>From the first spark to your team’s next kit.<br className="desktop-only" /> Create custom sportswear with AI and real-time 3D.</p><div className="hero-buttons"><button className="button button-gradient" onClick={() => document.getElementById('create-options')?.scrollIntoView({ behavior: 'smooth' })}>START A KIT <ArrowRight size={21} /></button><button className="button button-outline" onClick={onStudio}><Box size={18} /> OPEN KIT STUDIO</button></div><div className="hero-note"><span className="tiny-check"><Check size={11} /></span> YOUR VISION. NO DESIGN EXPERIENCE NEEDED.</div></div>
      <div className="hero-caption"><span className="live-dot" /> BUILT TO STAND OUT <span>01 / THE NEXT GENERATION</span></div></div>
      <div className="hero-coordinate">3D DESIGN / UNLIMITED POSSIBILITIES</div>
    </section>
    <section className="create-section page-shell" id="create-options"><div className="section-heading"><div><span className="eyebrow">ONE VISION. TWO WAYS TO CREATE.</span><h2>How do you want to <span>create?</span></h2></div><span className="section-index">01 — CHOOSE YOUR PATH</span></div>
      <div className="creation-grid">
        <button className="creation-card ai-card" onClick={() => onStart('ai')}><img src={media('images/art/home_ai.jpg')} alt="AI inspired black and cyan jersey" /><span className="card-topline"><span><Sparkles size={14} /> THE IDEA STARTER</span><span>01</span></span><div className="creation-card-copy"><span className="eyebrow">IMAGINE IT. CREATE IT.</span><h3>AI powered<span>sportswear.</span></h3><p>A few words. A whole new direction.</p><span className="button button-gradient">START WITH AI <ArrowRight size={20} /></span></div><span className="card-corner"><ChevronRight /></span></button>
        <button className="creation-card dyo-card" onClick={() => onStart('dyo')}><img src={media('images/art/home_dyo.jpg')} alt="Design your own custom sportswear in 3D" /><span className="card-topline"><span><Box size={14} /> THE CREATIVE CONTROL</span><span>02</span></span><div className="creation-card-copy"><span className="eyebrow">YOUR SPORT. YOUR RULES.</span><h3>Design<span>your own.</span></h3><p>Choose your sport. Make every detail yours.</p><span className="button button-outline">START DESIGNING <ArrowRight size={20} /></span></div><span className="card-corner"><ChevronRight /></span></button>
      </div>
    </section>
    <section className="benefit-strip page-shell">{[{icon:Cpu,title:'IDEAS INTO DESIGNS',text:'Start with a creative brief'},{icon:Box,title:'REAL-TIME 3D',text:'Every angle. Every detail.'},{icon:FolderOpen,title:'YOUR CREATIVE SPACE',text:'Save, refine, and export'},{icon:Users,title:'FOR EVERY TEAM',text:'Clubs · Schools · Brands'}].map(item => <div className="benefit" key={item.title}><span className="benefit-icon"><item.icon size={23} /></span><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</section>
    <section className="workflow-section page-shell"><div><span className="eyebrow">FROM A SPARK TO A KIT</span><h2>Your vision.<br /><span>Made to move.</span></h2></div><div className="workflow-steps">{[['01','Create your direction','Start with a prompt or choose your sport and garment.'],['02','Make it your own','Explore colors, patterns, logos, and player details in 3D.'],['03','Save. Share. Play.','Keep every version and download your design mockups.']].map(([n,title,body]) => <div key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></div>)}</div></section>
  </div>;
}

function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (user: User, token: string) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const result = await api<{user: User;token:string}>(register ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(values) }); onSuccess(result.user, result.token); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="modal auth-modal" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}><button className="icon-button modal-close" onClick={onClose} aria-label="Close sign in"><X /></button><div className="auth-art"><img src={media('images/art/onboarding.jpg')} alt="Custom 3DEEZI jersey" /><div><span className="eyebrow">YOUR SPORT. YOUR WAY.</span><h2>Dream it.<br />Design it.<br /><span>Wear it.</span></h2></div></div><div className="auth-form"><img className="auth-logo" src={media('images/brand.png')} alt="3DEEZI" /><h2>{register ? 'Join the next generation.' : 'Welcome to your studio.'}</h2><p className="muted">{register ? 'Create an account and bring your next kit to life.' : 'Sign in to pick up where you left off.'}</p><form onSubmit={submit}>{register && <label className="field">Your name<input name="name" autoComplete="name" required maxLength={100} placeholder="Alex Morgan" /></label>}<label className="field">Email address<input type="email" name="email" autoComplete="email" required placeholder="you@yourclub.com" /></label><label className="field">Password<input type="password" name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 1} placeholder={register ? 'At least 8 characters' : 'Enter your password'} /></label>{register && <label className="field">Confirm password<input type="password" name="password_confirmation" autoComplete="new-password" required minLength={8} placeholder="Re-enter your password" /></label>}{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{register ? 'CREATE ACCOUNT' : 'SIGN IN'}<ArrowRight size={18} /></button></form><p className="auth-switch">{register ? 'Already on the team?' : 'New to 3DEEZI?'} <button onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p><div className="auth-secure"><ShieldCheck size={14} /> Your designs. Your own workspace.</div></div></dialog>;
}
