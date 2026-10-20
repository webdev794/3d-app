import { media } from '../api';
import '../../css/rewards.css';

/** 3DEEZI Rewards, coming soon: the banner at the bottom of the homepage (client design 2026-10-20). A glowing gift,
 *  the 3DEEZI wordmark with REWARDS and a line under it, and a COMING SOON pill that is not a link yet. */
export default function RewardsBanner() {
  return <section className="rewards" aria-label="3DEEZI Rewards: coming soon">
    <div className="rewards-card">
      <RewardsWaves />
      <GiftIcon />
      <span className="rewards-rule" aria-hidden="true" />
      <div className="rewards-copy">
        <h2 className="rewards-title"><img src={media('images/brand-final.png')} alt="3DEEZI" width={1712} height={272} loading="lazy" decoding="async" /><i aria-hidden="true" /><span>REWARDS</span></h2>
        <p>Something rewarding is on the way.</p>
      </div>
      <button type="button" className="rewards-soon" aria-disabled="true" tabIndex={-1}>COMING SOON</button>
    </div>
  </section>;
}

/** A 4-point sparkle centred on (x, y). */
const sparkle = (x: number, y: number, r: number) => {
  const k = r * .16;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
};

/** The gift as in the design: a neon outline box (front, side and lid) with a ribbon and bow, three sparkles around it.
 *  Parts are drawn back to front; the stroke runs cyan to violet (bottom right) and the whole gift glows. */
const giftParts: [d: string, fill: string][] = [
  ['M124 70L142 61V114L124 123Z', 'url(#rw-side)'],
  ['M131 66.5L135 64.5V118.5L131 120.5Z', '#11306a'],
  ['M44 70H124V120Q124 124 120 124H48Q44 124 44 120Z', 'url(#rw-front)'],
  ['M70 70H82V124H70Z', '#0d4566'],
  ['M128 54L146 45V61L128 70Z', '#101b40'],
  ['M135 50.5L139 48.5V64.5L135 66.5Z', '#143a74'],
  ['M40 54L58 45H146L128 54Z', '#0d2f50'],
  ['M47 50.5H135L139 48.5H51Z', '#16557c'],
  ['M70 54L88 45H100L82 54Z', '#16557c'],
  ['M40 54H128V67Q128 70 125 70H43Q40 70 40 67Z', '#0a2341'],
  ['M70 54H82V70H70Z', '#0e4a6c'],
  ['M84 47C76 42 58 35 56 23C54 12 66 8 74 16C80 23 83 36 84 47Z', '#0a2848'],
  ['M86 47C94 42 113 33 117 21C120 10 107 6 99 14C92 22 87 36 86 47Z', '#0a2848'],
  ['M77 41C70 35 64 28 62 22M93 41C101 34 108 27 110 20', 'none'],
];

function GiftIcon() {
  return <svg className="rewards-gift" viewBox="0 0 186 130" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="rw-line" gradientUnits="userSpaceOnUse" x1="40" y1="8" x2="146" y2="124">
        <stop offset="0" stopColor="#9ef9ff" /><stop offset=".38" stopColor="#2fd3ff" /><stop offset=".72" stopColor="#3b7bff" /><stop offset="1" stopColor="#a65cff" />
      </linearGradient>
      <linearGradient id="rw-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b2747" /><stop offset="1" stopColor="#050c1d" /></linearGradient>
      <linearGradient id="rw-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d1838" /><stop offset="1" stopColor="#24104f" /></linearGradient>
      <filter id="rw-glow" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
        <feBlend in="SourceGraphic" in2="blur" mode="screen" />
      </filter>
    </defs>
    <g filter="url(#rw-glow)">
      <g stroke="url(#rw-line)" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
        {giftParts.map(([d, fill]) => <path key={d} d={d} fill={fill} />)}
        <ellipse cx="85" cy="47.5" rx="6.5" ry="4.6" fill="#3fdcff" />
      </g>
      <path d={`${sparkle(14, 32, 13)}${sparkle(172, 31, 8)}${sparkle(172, 83, 7.5)}`} fill="#b4f9ff" />
    </g>
  </svg>;
}

/** The faint light waves along the bottom of the banner (the stars are in rewards.css). */
function RewardsWaves() {
  const left = ['M-10 136C80 118 160 134 240 124C320 114 380 92 500 96', 'M-10 150C90 128 170 150 260 140C350 130 420 104 560 112', 'M-10 164C110 140 200 166 300 156C400 146 470 124 600 128'];
  const right = ['M900 186C1080 184 1250 128 1402 70', 'M980 186C1100 180 1220 150 1402 96', 'M1040 186C1160 176 1270 146 1402 116'];
  return <svg className="rewards-waves" viewBox="0 0 1392 178" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="rw-wave-l" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0"><stop offset="0" stopColor="#2f8dff" stopOpacity=".85" /><stop offset=".5" stopColor="#2a7bff" stopOpacity=".35" /><stop offset="1" stopColor="#2a7bff" stopOpacity="0" /></linearGradient>
      <linearGradient id="rw-wave-r" gradientUnits="userSpaceOnUse" x1="900" y1="0" x2="1392" y2="0"><stop offset="0" stopColor="#3a8dff" stopOpacity="0" /><stop offset=".5" stopColor="#3aa0ff" stopOpacity=".4" /><stop offset="1" stopColor="#59c8ff" stopOpacity=".9" /></linearGradient>
    </defs>
    <g fill="none">
      {left.map(d => <path key={d} d={d} stroke="url(#rw-wave-l)" vectorEffect="non-scaling-stroke" />)}
      {right.map(d => <path key={d} d={d} stroke="url(#rw-wave-r)" vectorEffect="non-scaling-stroke" />)}
    </g>
  </svg>;
}
