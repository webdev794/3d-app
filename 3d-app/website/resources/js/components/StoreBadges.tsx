import { Link } from 'react-router-dom';

/**
 * App Store and Google Play badges in the stores' official style. Until the
 * apps are listed they open the Downloads page (Apple only allows its badge
 * to point at a live listing, so swap `to` for the store URLs at launch).
 */
export default function StoreBadges({ className = '', soon = false }: { className?: string; soon?: boolean }) {
  // `soon`: on the Downloads page itself the badges are labels, not links, until the listings are live.
  const Badge = ({ label, children }: { label: string; children: React.ReactNode }) => soon
    ? <div className="official-badge is-soon" role="img" aria-label={`${label}: coming soon`}>{children}<em>Coming soon</em></div>
    : <Link to="/downloads" className="official-badge" aria-label={label}>{children}</Link>;
  return <div className={`official-stores ${className}`}>
    <Badge label="Download on the App Store">
      <svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
      <span><small>Download on the</small><strong>App Store</strong></span>
    </Badge>
    <Badge label="Get it on Google Play">
      <svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#00d7fe" d="M48 59.5v393c0 6.9 4 12.9 9.8 15.7L284.7 256 57.8 43.8C52 46.6 48 52.6 48 59.5z"/><path fill="#ffce00" d="M370.7 170.6 284.7 256l86 85.4 97.4-55.4c12.5-7.1 12.5-25 0-32z"/><path fill="#ff3a44" d="M57.8 468.2c5.3 2.6 11.7 2.6 17.4-.6l295.5-126.2-86-85.4z"/><path fill="#00f076" d="M75.2 44.4c-5.7-3.2-12.1-3.2-17.4-.6L284.7 256l86-85.4z"/></svg>
      <span><small>GET IT ON</small><strong>Google Play</strong></span>
    </Badge>
  </div>;
}
