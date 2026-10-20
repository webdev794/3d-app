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
