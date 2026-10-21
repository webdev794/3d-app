import { useId } from 'react';

/**
 * A garment drawn in the 3DEEZI kit style (SVG): navy with cyan and electric-blue flashes, or a light kit with blue
 * flashes. For order rows, board cards and the homepage order tiles. Garment ids as in the order options.
 */
type Tone = 'dark' | 'light';

const SHAPES: Record<string, { body: string; extra?: (accent: string) => React.ReactNode }> = {
  jersey: {
    body: 'M22 7 12 10.5 3 19.5 9.5 30 16 26.5V58H48V26.5L54.5 30 61 19.5 52 10.5 42 7C40.3 12.6 36.6 15.4 32 15.4S23.7 12.6 22 7Z',
    extra: a => <path d="M22 7C23.7 12.6 27.4 15.4 32 15.4S40.3 12.6 42 7" fill="none" stroke={a} strokeWidth="2.2" strokeLinejoin="round" />,
  },
  tee: {
    body: 'M22 7 12 10.5 4 18.5 10 28 16 25V58H48V25L54 28 60 18.5 52 10.5 42 7C40.6 11 36.8 13 32 13S23.4 11 22 7Z',
    extra: a => <path d="M22 7C23.4 11 27.2 13 32 13S40.6 11 42 7" fill="none" stroke={a} strokeWidth="2.2" />,
  },
  polo: {
    body: 'M22 7 12 10.5 4 18.5 10 28 16 25V58H48V25L54 28 60 18.5 52 10.5 42 7 32 12Z',
    extra: a => <><path d="M22 7 32 12 27 18Z M42 7 32 12 37 18Z" fill={a} opacity=".9" /><path d="M32 12V25" stroke={a} strokeWidth="1.6" /><circle cx="32" cy="17" r="1.2" fill="#e8f6ff" /><circle cx="32" cy="22" r="1.2" fill="#e8f6ff" /></>,
  },
  singlet: {
    body: 'M21 6C21.5 12 26 16.5 32 16.5S42.5 12 43 6H48.5C48.5 14 50.5 20 53 24V58H11V24C13.5 20 15.5 14 15.5 6Z',
    extra: a => <path d="M21 6C21.5 12 26 16.5 32 16.5S42.5 12 43 6" fill="none" stroke={a} strokeWidth="2.2" />,
  },
  shorts: {
    body: 'M11 9H53L57.5 50 37 54 32 29 27 54 6.5 50Z',
    extra: a => <><path d="M11 9H53L53.6 14.5H10.4Z" fill={a} opacity=".55" /><path d="M29.5 14.5 32 29" stroke="#ffffff40" strokeWidth="1.2" /></>,
  },
  hoodie: {
    body: 'M20 14 10 18 4 45 11.5 47 16 31V58H48V31L52.5 47 60 45 54 18 44 14C42 20 37.8 23 32 23S22 20 20 14Z',
    extra: a => <><path d="M20 14C20 6.5 25.5 3 32 3S44 6.5 44 14C42 20 37.8 23 32 23S22 20 20 14Z" fill="#050b16" stroke={a} strokeWidth="1.6" /><path d="M29 23V32M35 23V32" stroke="#e8f6ff" strokeWidth="1.3" strokeLinecap="round" /><path d="M23 44H41L43.5 54H20.5Z" fill="none" stroke="#ffffff38" strokeWidth="1.3" /></>,
  },
  jacket: {
    body: 'M21 9 10 13 4 45 11.5 47 16 30V58H48V30L52.5 47 60 45 54 13 43 9C41 11 37 12.5 32 12.5S23 11 21 9Z',
    extra: a => <><path d="M24 5H40L43 9C41 11.5 37 13 32 13S23 11.5 21 9Z" fill="#050b16" stroke={a} strokeWidth="1.6" /><path d="M32 13V58" stroke={a} strokeWidth="1.8" /></>,
  },
  warmup: {
    body: 'M21 8 10 12 4 45 11.5 47 16 30V58H48V30L52.5 47 60 45 54 12 43 8C41.4 12.5 37.2 15 32 15S22.6 12.5 21 8Z',
    extra: a => <path d="M21 8C22.6 12.5 26.8 15 32 15S41.4 12.5 43 8" fill="none" stroke={a} strokeWidth="2.2" />,
  },
  pants: {
    body: 'M18 5H46L50.5 59H37.5L32 22 26.5 59H13.5Z',
    extra: a => <path d="M18 5H46L46.4 10H17.6Z" fill={a} opacity=".55" />,
  },
  socks: {
    body: 'M23 4H39V34L50 45.5C54.5 50 52.5 59 44 59H29C24.8 59 23 56 23 51Z',
    extra: a => <><path d="M23 4H39V9H23Z" fill={a} opacity=".75" /><path d="M23 12H39" stroke={a} strokeWidth="1.6" /></>,
  },
  cap: {
    body: 'M8 39C8 21.5 19 12 32 12S56 21.5 56 39Z',
    extra: a => <><path d="M3 39C20 35 44 35 61 39 59 45 51 47.5 32 47.5S5 45 3 39Z" fill="#050b16" stroke={a} strokeWidth="1.6" /><circle cx="32" cy="12.5" r="2.2" fill={a} /><path d="M32 13V39" stroke="#ffffff30" strokeWidth="1.2" /></>,
  },
  other: {
    body: 'M10 14 30 6H54V30L34 58 6 30Z',
    extra: a => <circle cx="44" cy="16" r="4" fill="none" stroke={a} strokeWidth="2" />,
  },
};

export default function GarmentIcon({ garment, tone = 'dark', className, title }: { garment: string; tone?: Tone; className?: string; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shape = SHAPES[garment === 'fullkit' ? 'jersey' : garment] ?? SHAPES.other;
  const light = tone === 'light';
  const accent = light ? '#1f6fff' : '#12e1f0';
  return <svg className={className} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
    <defs>
      <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
        {light ? <><stop offset="0" stopColor="#fbfdff" /><stop offset="1" stopColor="#c9d7e6" /></> : <><stop offset="0" stopColor="#173a63" /><stop offset=".55" stopColor="#0a1a30" /><stop offset="1" stopColor="#040a14" /></>}
      </linearGradient>
      <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={light ? '#2f8cff' : '#12e1f0'} /><stop offset="1" stopColor={light ? '#0b3fd6' : '#2a6bff'} />
      </linearGradient>
      <clipPath id={`${id}c`}><path d={shape.body} /></clipPath>
    </defs>
    <path d={shape.body} fill={`url(#${id}b)`} stroke={light ? '#9fb6cf' : '#2b5f8c'} strokeWidth="1" strokeLinejoin="round" />
    {/* The 3DEEZI flashes: two diagonal bands across the garment. */}
    <g clipPath={`url(#${id}c)`} opacity={light ? 0.95 : 0.9}>
      <path d="M44 14 58 14 30 62 16 62Z" fill={`url(#${id}f)`} />
      <path d="M58 22 64 22 40 62 34 62Z" fill={`url(#${id}f)`} opacity=".7" />
      <path d="M4 36 10 33 4 60 0 60Z" fill={`url(#${id}f)`} opacity=".55" />
    </g>
    {shape.extra?.(accent)}
  </svg>;
}

/**
 * The DYO quick-access symbols: plain 2D outlines on a 48-unit grid, all drawn with one stroke width so the tiles
 * match. Sports are their ball or posts; apparel is its garment. The app draws the same paths
 * (lib/widgets/category_icon.dart): change both together.
 */
const CATEGORY_OUTLINES: Record<string, string> = {
  rugby: 'M8.5 39.5A26.02 26.02 0 0 1 39.5 8.5A26.02 26.02 0 0 1 8.5 39.5ZM15 33L33 15M18.14 25.34L22.66 29.86M21.74 21.74L26.26 26.26M25.34 18.14L29.86 22.66',
  "rugby-posts": 'M11 44L11 5M37 44L37 5M11 30L37 30M17.5 22.5A10.73 10.73 0 0 1 30.5 9.5A10.73 10.73 0 0 1 17.5 22.5ZM22.44 14.44L25.56 17.56',
  football: 'M4.5 24A19.5 19.5 0 1 0 43.5 24A19.5 19.5 0 1 0 4.5 24ZM24 17.4L30.28 21.96L27.88 29.34L20.12 29.34L17.72 21.96ZM24 17.4L24 11.2M24 11.2L15.15 6.63M24 11.2L32.85 6.63M30.28 21.96L36.17 20.04M36.17 20.04L37.79 10.21M36.17 20.04L43.26 27.05M27.88 29.34L31.52 34.36M31.52 34.36L41.37 32.85M31.52 34.36L27.05 43.26M20.12 29.34L16.48 34.36M16.48 34.36L20.95 43.26M16.48 34.36L6.63 32.85M17.72 21.96L11.83 20.04M11.83 20.04L4.74 27.05M11.83 20.04L10.21 10.21',
  basketball: 'M4.5 24A19.5 19.5 0 1 0 43.5 24A19.5 19.5 0 1 0 4.5 24ZM24 4.5L24 43.5M4.5 24L43.5 24M10.21 10.21Q21.5 24 10.21 37.79M37.79 10.21Q26.5 24 37.79 37.79',
  netball: 'M7 10.5A9.5 2.8 0 1 0 26 10.5A9.5 2.8 0 1 0 7 10.5ZM26 10.5L34 10.5M34 5L34 44M28 44L40 44M7.5 12L10.5 23.5M25.5 12L22.5 23.5M10.5 23.5L22.5 23.5M11 13L19 23.5M22 13L14 23.5M8.4 36A6.6 6.6 0 1 0 21.6 36A6.6 6.6 0 1 0 8.4 36ZM8.6 34.4Q15 37.5 21.4 34.4M13.4 29.6Q11.5 36 14.6 42.6',
  afl: 'M12 44L12 5M36 44L36 5M4 44L4 19M44 44L44 19M19.5 35A18.36 18.36 0 0 1 28.5 9A18.36 18.36 0 0 1 19.5 35ZM21.5 29.2L26.5 14.8M20.33 25.24L24.87 26.82M21.73 21.21L26.27 22.79M23.13 17.18L27.67 18.76',
  hockey: 'M9 5L29.5 32Q31.2 34.6 34.2 34.6H42.5M39 5L18.5 32Q16.8 34.6 13.8 34.6H5.5M18.4 41.5A5.6 2.5 0 1 0 29.6 41.5A5.6 2.5 0 1 0 18.4 41.5Z',
  tee: 'M17 7L9 10.5L4 19L10 23.5L13 21.5V43H35V21.5L38 23.5L44 19L39 10.5L31 7Q28.5 11.5 24 11.5Q19.5 11.5 17 7Z',
  polo: 'M17 7L9 10.5L4 19L10 23.5L13 21.5V43H35V21.5L38 23.5L44 19L39 10.5L31 7L24 12ZM17 7L20.5 14.5L24 12L27.5 14.5L31 7M24 12L24 20M13 29L35 29M13 35L35 35',
  hoodie: 'M16.5 12L9.5 15Q6.6 16.4 6.4 20L5 40H11.2L12.5 24V43H35.5V24L36.8 40H43L41.6 20Q41.4 16.4 38.5 15L31.5 12M16.5 12Q16 4 24 4Q32 4 31.5 12Q28.5 17 24 17Q19.5 17 16.5 12ZM24 17L24 43M21 16.5L21 22M27 16.5L27 22M15.5 32L19 37.5M32.5 32L29 37.5',
  jacket: 'M16.5 10L9.5 13Q6.6 14.4 6.4 18L5 40H11.2L12.5 24V43H35.5V24L36.8 40H43L41.6 18Q41.4 14.4 38.5 13L31.5 10M16.5 10L17.5 4.5H30.5L31.5 10M24 4.5L24 43M15.5 30L19.5 35.5M32.5 30L28.5 35.5',
  singlet: 'M15.5 5Q16.5 15 24 15Q31.5 15 32.5 5H36.5Q36.5 14 40 18.5V43H8V18.5Q11.5 14 11.5 5Z',
  shirt: 'M16.5 8L9.5 11Q6.6 12.4 6.4 16L5 40H11.2L12.5 24V43H35.5V24L36.8 40H43L41.6 16Q41.4 12.4 38.5 11L31.5 8M16.5 8L20.5 15L24 11L27.5 15L31.5 8M24 11L24 43M27.5 21H32.5V27H27.5Z',
};

/** Which outline each catalogue category uses; a new category falls back to the tee. */
const CATEGORY_SYMBOL: Record<string, string> = {
  'rugby-league': 'rugby', 'rugby-union': 'rugby-posts', football: 'football', soccer: 'football', basketball: 'basketball',
  netball: 'netball', afl: 'afl', hockey: 'hockey', training: 'hoodie', hoodies: 'hoodie', jackets: 'jacket',
  gymwear: 'singlet', 'hi-vis': 'polo', workwear: 'shirt',
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const d = CATEGORY_OUTLINES[CATEGORY_SYMBOL[category] ?? category] ?? CATEGORY_OUTLINES.tee;
  return <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}
