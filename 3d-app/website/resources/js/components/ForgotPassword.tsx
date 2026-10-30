import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, LoaderCircle, LogIn, MailCheck } from 'lucide-react';
import { api, type User } from '../api';
import '../../css/auth-forgot.css';

/**
 * "Forgot password?" inside the sign-in window: the email address, "Send code" (a 6-digit code by email that works
 * for 15 minutes), then "Sign in with the code" or "Set a new password". The server answers the same for every
 * address, so the window never says whether an account exists.
 */
export default function ForgotPassword({ email: startEmail, onBack, onSuccess }: { email: string; onBack: () => void; onSuccess: (user: User, token: string) => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(startEmail);
  const [choice, setChoice] = useState<'code' | 'password'>('code');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function send(event?: FormEvent) {
    event?.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api<{ message: string }>('/auth/code', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(result.message); setStep('code'); setWait(60);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (choice === 'password' && values.password !== values.password_confirmation) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await api<{ user: User; token: string }>(choice === 'code' ? '/auth/code/login' : '/auth/code/reset', { method: 'POST', body: JSON.stringify({ ...values, email }) });
      onSuccess(result.user, result.token);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const back = <p className="auth-switch">Remembered it? <button type="button" onClick={onBack}>Back to sign in</button></p>;
  if (step === 'email') return <>
    <h2>Forgot your password?</h2>
    <p className="muted">Enter your email address. We will send you a 6-digit code to sign in or to set a new password.</p>
    <form key="email" onSubmit={send}>
      <label className="field">Email address<input type="email" name="email" autoComplete="email" required maxLength={254} autoFocus placeholder="you@yourclub.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="button button-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}SEND CODE<ArrowRight size={18} /></button>
    </form>
    {back}
  </>;

  return <>
    <h2>Check your email.</h2>
    <p className="muted forgot-sent"><MailCheck size={15} /><span>{sent.replace('6-digit', '6\u2011digit')} <button type="button" className="forgot-change" onClick={() => { setStep('email'); setError(''); }}>Change email</button></span></p>
    <form key="code" onSubmit={finish} className="forgot-form">
      <label className="field forgot-code">Code from the email<input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} pattern="\s*\d{3}\s?\d{3}\s*" title="The 6-digit code from the email" autoFocus placeholder="000000" /></label>
      <div className="forgot-choice" role="radiogroup" aria-label="What to do with the code">
        <button type="button" role="radio" aria-checked={choice === 'code'} onClick={() => { setChoice('code'); setError(''); }}><LogIn size={15} />Sign in with the code</button>
        <button type="button" role="radio" aria-checked={choice === 'password'} onClick={() => { setChoice('password'); setError(''); }}><KeyRound size={15} />Set a new password</button>
      </div>
      {choice === 'password' && <>
        <label className="field">New password<input type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={72} placeholder="At least 8 characters" /></label>
        <label className="field">Confirm new password<input type="password" name="password_confirmation" autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Re-enter your new password" /></label>
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="button button-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{choice === 'code' ? 'SIGN IN' : 'SAVE AND SIGN IN'}<ArrowRight size={18} /></button>
    </form>
    <p className="forgot-resend">No email? Check your spam folder, or <button type="button" disabled={busy || wait > 0} onClick={() => send()}>{wait > 0 ? `send a new code in ${wait}s` : 'send a new code'}</button>.</p>
    {back}
  </>;
}
