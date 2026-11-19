import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
// The emblem travels inside the bundle: the loader never waits for it while long AI requests keep a server busy
// (the local PHP server answers one request at a time and sends no cache headers).
import emblemSrc from '../../images/emblem-256.webp?inline';

/**
 * "Creating your design…": the 3DEEZI emblem spins inside glowing orbit
 * rings while the steps tick off. Progress is an estimate from `seconds` and
 * holds at 94% until the work finishes.
 */
export default function Loader({ title = 'Creating your design…', subtitle = 'Analysing your request and generating concepts.', steps = ['Understanding your brief', 'Analysing references', 'Creating design concepts', 'Preparing 3D garment'], seconds = 25, overlay = true }: { title?: string; subtitle?: string; steps?: string[]; seconds?: number; overlay?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = setInterval(() => setElapsed(e => e + 0.25), 250); return () => clearInterval(timer); }, []);
  const progress = Math.min(0.94, 1 - Math.exp(-elapsed / (seconds * 0.6)));
  const current = Math.min(steps.length - 1, Math.floor(progress * steps.length * 1.05));
  return <div className={overlay ? 'loader-overlay' : 'loader-inline'} role="status" aria-live="polite">
    <div className="loader-card">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <div className="loader-emblem" aria-hidden="true">
        <span className="orbit orbit-1" /><span className="orbit orbit-2" /><span className="orbit orbit-3" />
        <span className="loader-spark s1" /><span className="loader-spark s2" /><span className="loader-spark s3" />
        <img src={emblemSrc} alt="" />
      </div>
      <div className="loader-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <ul className="loader-steps">{steps.map((step, i) => <li key={step} className={i < current ? 'done' : i === current ? 'active' : ''}><span>{i < current ? <Check size={13} /> : null}</span>{step}</li>)}</ul>
    </div>
  </div>;
}
