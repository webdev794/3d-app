import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, UserRoundPen } from 'lucide-react';
import { api, ApiError, type User } from '../api';
import './library.css';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'password_confirmation' | 'current_password', string>>;

/**
 * Edit profile (client 2026-10-26, from the account menu and My profile): the name, the email address and the
 * password. A new email address or password needs the current password (PATCH /auth/me checks it). The app's
 * Profile › Edit profile uses the same address.
 */
export default function EditProfilePage({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // A refused save puts the cursor in the first field to fix.
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(); }, [errors]);
  // The saved (or could-not-save) message sits at the top of the form: bring it into view after Save at the bottom.
  useEffect(() => { if (saved || (error && !Object.keys(errors).length)) form.current?.querySelector('.edit-profile-saved, .error-message')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [saved, error, errors]);

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();
  const needsCurrent = emailChanged || password !== '';
  const nothingChanged = name.trim() === user.name && !needsCurrent;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setSaved('');
    const found: Errors = {};
    if (!name.trim()) found.name = 'Enter your name.';
    if (!email.trim()) found.email = 'Enter your email address.';
    if (password && password.length < 8) found.password = 'Use at least 8 characters.';
    if (password && confirm !== password) found.password_confirmation = 'The new passwords do not match.';
    if (needsCurrent && !current) found.current_password = 'Enter your current password to change your email address or password.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (emailChanged) body.email = email.trim();
      if (password) { body.password = password; body.password_confirmation = confirm; }
      if (needsCurrent) body.current_password = current;
      const next = await api<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) });
      onSaved(next);
      setName(next.name); setEmail(next.email);
      setPassword(''); setConfirm(''); setCurrent('');
      setSaved(password ? 'Your profile is saved. Use your new password from now on; your other devices were signed out.' : 'Your profile is saved.');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        const fields: Errors = {};
        for (const [key, list] of Object.entries(err.errors)) fields[key as keyof Errors] = list[0];
        setErrors(fields);
        setError('Nothing was changed. Check the fields marked below.');
      } else setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  const fieldError = (key: keyof Errors) => errors[key] ? <span className="edit-profile-error" id={`edit-${key}-error`}>{errors[key]}</span> : null;
  const describe = (key: keyof Errors) => errors[key] ? `edit-${key}-error` : undefined;

  return <main className="page-shell lib-page edit-profile-page">
    <div className="page-heading lib-heading"><div><h1>Edit profile</h1><p>Change your name, email address or password.</p></div><Link className="button button-outline" to="/profile"><ArrowLeft size={16} />My profile</Link></div>
    <form ref={form} className="lib-account-card lib-profile-account edit-profile-form" onSubmit={submit} noValidate>
      {saved && <p className="edit-profile-saved" role="status"><CheckCircle2 size={18} />{saved}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <h2><UserRoundPen size={20} />Your details</h2>
      <label className="field">Your name<input name="name" autoComplete="name" maxLength={100} required value={name} onChange={e => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={describe('name')} />{fieldError('name')}</label>
      <label className="field">Email address<input type="email" name="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={describe('email')} />{fieldError('email')}</label>
      <h2><KeyRound size={20} />Change password</h2>
      <p className="field-hint">Leave these empty to keep your password.</p>
      <div className="edit-profile-row">
        <label className="field">New password<input type="password" name="password" autoComplete="new-password" maxLength={72} placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={describe('password')} />{fieldError('password')}</label>
        <label className="field">Confirm new password<input type="password" name="password_confirmation" autoComplete="new-password" maxLength={72} placeholder="Type it again" value={confirm} onChange={e => setConfirm(e.target.value)} aria-invalid={!!errors.password_confirmation} aria-describedby={describe('password_confirmation')} />{fieldError('password_confirmation')}</label>
      </div>
      {needsCurrent && <div className="edit-profile-current">
        <label className="field">Current password<input type="password" name="current_password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} aria-invalid={!!errors.current_password} aria-describedby={describe('current_password') ?? 'edit-current-hint'} />
          <span className="field-hint" id="edit-current-hint">Needed to change your email address or password.</span>{fieldError('current_password')}</label>
      </div>}
      <div className="lib-account-footer"><Link className="button button-outline" to="/profile">Cancel</Link><button className="button button-primary" disabled={busy || nothingChanged}>{busy && <LoaderCircle className="spin" size={16} />}Save changes</button></div>
    </form>
  </main>;
}
