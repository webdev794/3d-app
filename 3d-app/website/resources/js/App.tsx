import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, Check, ChevronRight, Cpu, FolderOpen, LoaderCircle, LogOut, Menu, PenTool, Shirt, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { api, getToken, media, setToken, type Catalog, type Project, type User } from './api';
import { defaultDesign, type Design } from './types';
import { AiDesigner, ConvertPage, GarmentSelection, SportSelection } from './pages/Create';
import PricingPage from './pages/Pricing';
import AdminPage from './pages/Admin';
import OrdersBoardPage from './pages/OrdersBoard';
import OrderUploadPage from './pages/OrderUpload';
import OrderFormPage from './pages/OrderForm';
import OrdersLandingPage from './pages/OrdersLanding';
import InvoicePayPage from './pages/InvoicePay';
import OrderCheckoutPage from './pages/OrderCheckout';
import Studio from './pages/Studio';
import ArtboardPage from './pages/Artboard';
import { ProjectsPage, AssetsPage, DashboardPage, ProfilePage } from './pages/Library';
import Home, { DownloadsPage } from './pages/Home';
import Assist from './components/Assist';
import NotificationBell from './components/NotificationBell';
import { AboutPage, PrivacyPage, SupportPage, TermsPage } from './pages/InfoPages';
import '../css/site-footer.css';
import OrdersMenu from './components/OrdersMenu';
import { TeamPage, TeamRequestPage, TeamRequestsPage } from './pages/Team';
import '../css/team-header.css';
import { DesignerPage } from './pages/AdminTeam';

export interface Draft { id?: number; version?: number; name: string; sport: string; garment: string; mode: 'ai' | 'dyo'; design: Design; thumbnail?: string | null; /** AI pattern motif still to be generated for this design. */ patternMotif?: string; /** A design picture (a saved asset) the Studio puts on the 3D kit when it opens (checked on screen first). */ pendingDrawing?: { asset: number; name: string; /** The garment is the one asked for (a 3DEEZI TEAM request): the check screen opens on it, not on a guess from the picture. */ known?: boolean } }
export const newDraft = (): Draft => ({ name: 'Untitled kit', sport: 'rugby-league', garment: 'jersey', mode: 'dyo', design: { ...defaultDesign } });
const garmentIds: Record<string, Design['garment']> = { jersey: 'jersey', shorts: 'shorts', tee: 'tee', 'training tee': 'tee', singlet: 'singlet', polo: 'polo', pocketpolo: 'pocketpolo', 'polo with pocket': 'pocketpolo', hoodie: 'hoodie', ziphoodie: 'ziphoodie', 'zip hoodie': 'ziphoodie', varsity: 'varsity', 'varsity jacket': 'varsity', trackjacket: 'trackjacket', 'track jacket': 'trackjacket', 'track suit jacket': 'trackjacket', 'tracksuit jacket': 'trackjacket', fullkit: 'fullkit', 'full kit': 'fullkit' };
/** Seeded projects can store a null garment and older AI concepts a display name ("Jersey"); every draft gets a valid id so it stays saveable. */
function normalizeDraft(draft: Draft): Draft {
  const pick = (g?: string | null) => (g ? garmentIds[String(g).toLowerCase()] : undefined);
  const garment = pick(draft.design?.garment) || pick(draft.garment) || defaultDesign.garment;
  if (draft.garment === garment && draft.design?.garment === garment) return draft;
  return { ...draft, garment, design: { ...defaultDesign, ...draft.design, garment } };
}
function loadDraft(): Draft {
  try {
    const saved = sessionStorage.getItem('3deezi.draft');
    return saved ? normalizeDraft({ ...newDraft(), ...JSON.parse(saved) }) : newDraft();
  } catch { return newDraft(); }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(!!getToken());
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [draft, setDraftRaw] = useState<Draft>(loadDraft);
  const setDraft = useCallback((next: Draft | ((prev: Draft) => Draft)) => setDraftRaw(prev => normalizeDraft(typeof next === 'function' ? next(prev) : next)), []);
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
  // Design Your Own opened by its address or a plain link starts a new kit: a saved project, an AI design or a design
  // picture left in the draft must not come back on the new garment (and a save must not overwrite that project).
  // "Change sport" in the Studio and the garment step's back button pass { keep: true } to change the current kit's sport.
  useEffect(() => {
    if (location.pathname !== '/create/sport' || (location.state as { keep?: boolean } | null)?.keep) return;
    setDraft(d => (d.id || d.mode !== 'dyo' || d.pendingDrawing || d.design.layout) ? { ...newDraft(), mode: 'dyo' } : d);
  }, [location.pathname, location.state]);
  function openProject(project: Project) { setDraft({ ...project, design: { ...defaultDesign, ...project.design } }); navigate('/studio'); }
  /** A 3DEEZI TEAM design picture (a saved asset) onto the 3D kit: the Studio checks it on the garment the request names (a design picture fits a singlet, jersey, tee or polo, with or without the pocket), then puts it on as drawn (as the AI designer's "MAKE IT 3D"). */
  function openDesignPicture(picture: { asset: number; name: string; garment: string; sport: string }) {
    const base = newDraft();
    // Like the AI designer's MAKE IT 3D: a hoodie takes the design's colours and logo (no design picture on hoodies yet).
    // The track jacket too: it lands on itself, never on a singlet.
    if (picture.garment === 'hoodie' || picture.garment === 'ziphoodie' || picture.garment === 'trackjacket') {
      const hoodie = picture.garment as Design['garment'];
      setDraft({ ...base, name: picture.name || 'My design', sport: picture.sport || base.sport, garment: hoodie, mode: 'dyo', design: { ...base.design, garment: hoodie, layout: null } });
      navigate('/studio');
      setNotice(hoodie === 'trackjacket' ? 'The track jacket takes your design’s colours and logo; full print designs on it are coming. Your design picture is in your Assets.' : 'Hoodies take your design’s colours and logo; full print designs on hoodies are coming. Your design picture is in your Assets.');
      return;
    }
    const known = ['singlet', 'jersey', 'tee', 'polo', 'pocketpolo'].includes(picture.garment);
    const top = (known ? picture.garment : 'singlet') as Design['garment'];
    setDraft({ ...base, name: picture.name || 'My design', sport: picture.sport || base.sport, garment: top, mode: 'dyo', design: { ...base.design, garment: top, layout: null }, pendingDrawing: { asset: picture.asset, name: picture.name, known } });
    navigate('/studio');
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear local credentials even when a session has already expired. */ }
    setToken(null); setUser(null); setDraft(newDraft()); navigate('/'); setNotice('You have signed out.');
  }
  function protectedPage(content: ReactNode) {
    if (checkingSession) return <div className="page-shell empty-state"><LoaderCircle className="spin" /><p>Restoring your workspace…</p></div>;
    return user ? content : <div className="page-shell"><div className="auth-gate panel"><ShieldCheck size={38} /><span className="eyebrow">YOUR PERSONAL WORKSPACE</span><h1>Make it yours.</h1><p>Sign in to save your kits, keep every version, and bring your assets together.</p><button className="button button-primary" onClick={() => requireAuth()}>Sign in or create an account <ArrowRight size={18} /></button></div></div>;
  }

  const studio = location.pathname.startsWith('/studio') || location.pathname.startsWith('/artboard') || (location.pathname.startsWith('/admin') && !!user?.is_admin);
  return <>
    {!studio && <header className={`site-header ${location.pathname === '/' ? 'is-home' : ''}`}><div className="header-inner">
      <Link to="/" className="brand" aria-label="3DEEZI home"><img src={media('images/brand-final.png')} alt="3DEEZI" /><span>AI SPORTSWEAR DESIGNER</span></Link>
      <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <NavLink to="/" end>Create</NavLink><NavLink to="/convert">Convert</NavLink><NavLink to="/projects">Projects</NavLink><NavLink to="/approved">Approved</NavLink><NavLink to="/assets">Assets</NavLink><OrdersMenu onNavigate={() => setMenuOpen(false)} /><NavLink to="/team" className="nav-team">3DEEZI Team</NavLink><NavLink to="/dashboard">Dashboard</NavLink><NavLink to="/downloads">Downloads</NavLink><NavLink to="/pricing">Subscriptions</NavLink>{user?.is_admin && <NavLink className="nav-admin" to="/admin"><ShieldCheck size={15} /> Admin</NavLink>}{user?.is_designer && !user.is_admin && <NavLink className="nav-admin" to="/designer"><PenTool size={15} /> Designer</NavLink>}
        <button className="nav-quick" onClick={() => { setMenuOpen(false); start('ai'); }}><Sparkles size={15} /> AI Powered Sportswear</button><button className="nav-quick" onClick={() => { setMenuOpen(false); start('dyo'); }}><Shirt size={15} /> Design Your Own</button>
      </nav>
      <div className="header-actions">{user?.is_admin && <Link className="button button-outline admin-link" to="/admin" title="Admin"><ShieldCheck size={15} /><span className="admin-text">Admin</span></Link>}{user?.is_designer && !user.is_admin && <Link className="button button-outline admin-link designer-link" to="/designer" title="3DEEZI TEAM designer: my design requests"><PenTool size={15} /><span className="admin-text">Designer</span></Link>}<NotificationBell signedIn={!!user} />{user ? <Link className="account-link" to="/profile"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name.split(' ')[0]}</span></Link> : <button className="button button-quiet" onClick={() => requireAuth()}>Sign in</button>}<button className="button button-primary header-cta" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('create-options')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>Start a kit <ArrowRight size={15} /></button><span className="quick-tabs" role="group" aria-label="Quick start"><button className="quick-tab is-ai" title="AI Powered Sportswear: describe your kit and AI designs it" onClick={() => start('ai')}><Sparkles size={13} /> AI</button><button className="quick-tab" title="Design Your Own: choose a sport and garment, then design it in 3D" onClick={() => start('dyo')}><Shirt size={13} /> DYO</button></span><button className="icon-button mobile-toggle" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X /> : <Menu />}</button></div>
    </div></header>}
    {catalogError && <div className="server-banner" role="alert">{catalogError} <button onClick={loadCatalog}>Retry connection</button></div>}
    <main><Routes>
      <Route path="/" element={<Home onStart={start} />} />
      <Route path="/create/ai" element={<AiDesigner catalog={catalog} draft={draft} onChange={setDraft} requireAuth={requireAuth} onStudio={() => navigate('/studio')} onNotice={setNotice} />} />
      <Route path="/create/sport" element={<SportSelection catalog={catalog} selected={draft.sport} onSelect={sport => setDraft(d => ({ ...d, sport, mode: 'dyo' }))} onNext={() => navigate('/create/garment')} />} />
      <Route path="/create/garment" element={<GarmentSelection catalog={catalog} draft={draft} onSelect={garment => setDraft(d => ({ ...d, garment, design: { ...d.design, garment: garment as Design['garment'] } }))} onNext={() => navigate('/studio')} onBack={() => navigate('/create/sport', { state: { keep: true } })} />} />
      <Route path="/convert" element={<ConvertPage catalog={catalog} draft={draft} onChange={setDraft} requireAuth={requireAuth} onStudio={() => navigate('/studio')} />} />
      <Route path="/admin" element={protectedPage(user && (user.is_admin ? <AdminPage me={user} onNotice={setNotice} onLogout={logout} catalog={catalog} /> : <NotAdmin />))} />
      <Route path="/admin/:section" element={protectedPage(user && (user.is_admin ? <AdminPage me={user} onNotice={setNotice} onLogout={logout} catalog={catalog} /> : <NotAdmin />))} />
      <Route path="/admin/:section/:itemId" element={protectedPage(user && (user.is_admin ? <AdminPage me={user} onNotice={setNotice} onLogout={logout} catalog={catalog} /> : <NotAdmin />))} />
      {/* 3DEEZI TEAM designers (non-admins): the requests assigned to them (AdminTeam.tsx). */}
      <Route path="/designer" element={protectedPage(user && <DesignerPage user={user} onNotice={setNotice} />)} />
      <Route path="/designer/:itemId" element={protectedPage(user && <DesignerPage user={user} onNotice={setNotice} />)} />
      {/* ORDERS in the header opens the Orders page (OrdersMenu.tsx ORDERS_PAGE); /orders stays My Orders. */}
      <Route path="/order-now" element={<OrdersLandingPage user={user} />} />
      <Route path="/orders" element={protectedPage(<OrdersBoardPage onNotice={setNotice} />)} />
      <Route path="/orders/:orderId" element={protectedPage(<OrdersBoardPage onNotice={setNotice} />)} />
      <Route path="/orders/upload" element={<OrderUploadPage user={user} checking={checkingSession} requireAuth={requireAuth} onNotice={setNotice} />} />
      <Route path="/orders/new" element={<OrderFormPage user={user} restoring={checkingSession} requireAuth={requireAuth} catalog={catalog} onNotice={setNotice} />} />
      <Route path="/invoices/:number" element={<InvoicePayPage user={user} checking={checkingSession} requireAuth={requireAuth} />} />
      {/* COMPLETE YOUR PAYMENT and its Confirmation: after REVIEW & APPROVE ORDER (the app's pay link works here too). */}
      <Route path="/orders/:ref/pay" element={<OrderCheckoutPage user={user} checking={checkingSession} requireAuth={requireAuth} step="pay" />} />
      <Route path="/orders/:ref/confirmation" element={<OrderCheckoutPage user={user} checking={checkingSession} requireAuth={requireAuth} step="confirmation" />} />
      {/* 3DEEZI TEAM (human designers): the page and form, My design requests, one request. */}
      <Route path="/team" element={<TeamPage user={user} requireAuth={requireAuth} catalog={catalog} />} />
      <Route path="/team/requests" element={protectedPage(<TeamRequestsPage />)} />
      <Route path="/team/requests/:requestId" element={protectedPage(<TeamRequestPage onNotice={setNotice} onStudio={openDesignPicture} />)} />
      <Route path="/pricing" element={<PricingPage onStart={() => start('dyo')} />} />
      <Route path="/downloads" element={<DownloadsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/support" element={<SupportPage user={user} />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/artboard" element={<ArtboardPage draft={draft} onChange={setDraft} user={user} onNotice={setNotice} requireAuth={requireAuth} onStart={mode => mode === 'home' ? navigate('/') : start(mode)} />} />
      <Route path="/studio" element={<Studio draft={draft} onChange={setDraft} catalog={catalog} requireAuth={requireAuth} onNotice={setNotice} user={user} />} />
      <Route path="/projects" element={protectedPage(<ProjectsPage onOpen={openProject} onCreate={() => start('dyo')} />)} />
      <Route path="/approved" element={protectedPage(<ProjectsPage approvedOnly onOpen={openProject} onCreate={() => start('dyo')} />)} />
      <Route path="/assets" element={protectedPage(<AssetsPage />)} />
      <Route path="/dashboard" element={protectedPage(<DashboardPage onOpen={openProject} onCreate={() => start('dyo')} />)} />
      <Route path="/profile" element={protectedPage(user && <ProfilePage user={user} onLogout={logout} />)} />
      <Route path="*" element={<div className="page-shell empty-state"><h1>Off the field?</h1><p>This page doesn’t exist. Your next kit starts here.</p><Link className="button button-primary" to="/">Back to create <ArrowRight size={18} /></Link></div>} />
    </Routes></main>
    <Assist />
    {/* The footer (client design 2026-10-20): 3DEEZI ASSIST's button settles into .footer-assist while it is on screen (Assist.tsx). */}
    {!studio && <footer className="site-footer"><div className="footer-inner">
      <Link to="/" className="foot-brand" aria-label="3DEEZI home"><img src={media('images/brand-final.png')} alt="3DEEZI" width={1712} height={272} loading="lazy" decoding="async" /></Link>
      <nav className="foot-links" aria-label="About 3DEEZI"><NavLink to="/about">About</NavLink><NavLink to="/support">Support</NavLink><NavLink to="/privacy">Privacy</NavLink><NavLink to="/terms">Terms</NavLink></nav>
      <span className="foot-rule" aria-hidden="true" />
      <div className="footer-assist" data-assist-dock="" />
    </div></footer>}
    {authOpen && <AuthModal onClose={() => { setAuthOpen(false); afterAuth.current = null; }} onSuccess={(nextUser, token) => { setToken(token); setUser(nextUser); setAuthOpen(false); setNotice(`Welcome, ${nextUser.name.split(' ')[0]}. Your workspace is ready.`); const callback = afterAuth.current; afterAuth.current = null; callback?.(); }} />}
    {notice && <div className="toast" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </>;
}

function NotAdmin() {
  return <div className="page-shell"><div className="auth-gate panel"><ShieldCheck size={38} /><span className="eyebrow">ADMIN PANEL</span><h1>Administrators only.</h1><p>Your account doesn’t have administrator access. Ask an administrator to give it to you under Admin → Users.</p><Link className="button button-primary" to="/">Back to create <ArrowRight size={18} /></Link></div></div>;
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
  return <dialog ref={dialog} className="modal auth-modal" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}><button className="icon-button modal-close" onClick={onClose} aria-label="Close sign in"><X /></button><div className="auth-art"><img src={media('images/art/onboarding.jpg')} alt="Custom 3DEEZI jersey" /><div><span className="eyebrow">YOUR SPORT. YOUR WAY.</span><h2>Dream it.<br />Design it.<br /><span>Wear it.</span></h2></div></div><div className="auth-form"><img className="auth-logo" src={media('images/brand-final.png')} alt="3DEEZI" /><h2>{register ? 'Join the next generation.' : 'Welcome to your studio.'}</h2><p className="muted">{register ? 'Create an account and bring your next kit to life.' : 'Sign in to pick up where you left off.'}</p><form onSubmit={submit}>{register && <label className="field">Your name<input name="name" autoComplete="name" required maxLength={100} placeholder="Alex Morgan" /></label>}<label className="field">Email address<input type="email" name="email" autoComplete="email" required placeholder="you@yourclub.com" /></label><label className="field">Password<input type="password" name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 1} placeholder={register ? 'At least 8 characters' : 'Enter your password'} /></label>{register && <label className="field">Confirm password<input type="password" name="password_confirmation" autoComplete="new-password" required minLength={8} placeholder="Re-enter your password" /></label>}{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{register ? 'CREATE ACCOUNT' : 'SIGN IN'}<ArrowRight size={18} /></button></form><p className="auth-switch">{register ? 'Already on the team?' : 'New to 3DEEZI?'} <button onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p><div className="auth-secure"><ShieldCheck size={14} /> Your designs. Your own workspace.</div></div></dialog>;
}
