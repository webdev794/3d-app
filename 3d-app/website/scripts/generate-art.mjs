// Generates the website's showroom artwork with OpenAI (gpt-image-2): the
// stadium environment, the sport carousel kits and the garment tiles. Every
// garment is generated from the real 3DEEZI logo so it wears the brand.
//
//   node scripts/generate-art.mjs [only-these-names...]
//
// Reads the key from OPENAI_API_KEY or ../.tools/openai.key. Writes to
// public/media/showroom/. Existing files are kept unless named.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/media/showroom');
const key = (process.env.OPENAI_API_KEY || (await readFile(path.join(root, '../.tools/openai.key'), 'utf8'))).trim();
const logo = await readFile(path.join(root, '../assets/images/logo_full.png'));
const only = process.argv.slice(2);

const BRAND = 'The attached image is the 3DEEZI brand: a chrome-and-blue "3D" emblem with the "3DEEZI" wordmark. '
  + 'Put the 3DEEZI emblem as a small crest on the chest and the "3DEEZI" wordmark across the chest, exactly as in the attached logo. '
  + 'No other brands, sponsors or club logos.';
const KIT = 'Premium photoreal sportswear product shot on an invisible ghost mannequin, front view, centred, the whole garment visible with a little margin. '
  + 'Realistic sublimated fabric with fine knit texture, natural folds, flatlock stitching and subtle sheen, soft even studio lighting. '
  + 'Clean cut-out product image: fully transparent background around the garment with crisp edges, no glow, no halo, no backdrop, no floor, no shadow, no text other than the branding.';

// Branding for the small items is described in their own prompts.
const kits = {
  'kit-rugby-league': 'A rugby league jersey and matching shorts: black body with aggressive cyan and electric-blue tribal geometric panels on the shoulders and sides, V collar with cyan trim, black shorts with cyan side panel.',
  'kit-rugby-union': 'A rugby union jersey and shorts: classic navy and gold horizontal hoops, navy polo collar with gold placket, navy shorts.',
  'kit-football': 'A football (soccer) kit: royal blue and white vertical stripes, white crew collar, royal blue shorts with white trim.',
  'kit-basketball': 'A basketball singlet and long shorts: bright orange body with black side panels and a deep V neck, black shorts with orange stripes.',
  'kit-netball': 'A netball dress: purple and teal with dynamic diagonal panels, sleeveless, fitted with a flared skirt.',
  'kit-afl': 'An AFL guernsey (sleeveless) and shorts: black with a bold red V across the chest and back, white shorts.',
  'kit-hockey': 'An ice hockey jersey: white body with red and black horizontal stripes on the sleeves and hem, red lace-up collar, oversized fit.',
  'kit-training': 'A training hoodie: charcoal black zip-up with subtle cyan piping and a cyan zip, with matching black jogger pants.',
};
const garments = {
  'garment-fullkit': 'A full rugby kit set: black and cyan jersey with tribal geometric shoulder panels, matching black shorts and black socks with cyan bands, arranged together.',
  'garment-jersey': 'A black and cyan rugby jersey with tribal geometric shoulder panels and V collar.',
  'garment-shorts': 'ONLY a single pair of black rugby shorts, nothing else: no shirt, no top, no socks. Cyan side panels and a small 3DEEZI emblem on the left leg.',
  'garment-tee': 'A black training tee with subtle cyan raglan sleeves.',
  'garment-singlet': 'A black and cyan sports singlet with a scoop neck and geometric side panels.',
  'garment-polo': 'A black club polo shirt with cyan collar tipping and a half-zip.',
  'garment-socks': 'ONLY a pair of long black sports socks, nothing else: no shirt, no shorts, no shoes. Two cyan bands near the top and a small 3DEEZI emblem, standing upright side by side as if worn by invisible legs, filling the frame.',
  'garment-shoes': 'ONLY a pair of black football boots, nothing else: no clothing, no shirt, no shorts, no mannequin. Cyan details, cyan studs and a small 3DEEZI emblem on the side, three-quarter side view, filling the frame.',
};

const jobs = [
  {
    name: 'stadium-stage', size: '1536x1024', format: 'jpeg', withLogo: false,
    prompt: 'Cinematic empty futuristic stadium at night for a product showroom, wide shot from the pitch. Deep navy-black atmosphere, tall vertical cyan and blue LED light columns, distant floodlights with bokeh, rolling low fog, a glossy wet reflective floor, and a large circular glowing cyan platform in the centre foreground, empty. No people, no text, no logos, no garments. Ultra-detailed, premium, moody, high contrast.',
  },
  ...Object.entries(kits).map(([name, kit]) => ({ name, size: '1024x1536', format: 'png', transparent: true, withLogo: true, prompt: `${KIT} ${kit} ${BRAND}` })),
  ...Object.entries(garments).map(([name, item]) => ({ name, size: '1024x1024', format: 'png', transparent: true, withLogo: true, prompt: `${KIT} ${item} ${BRAND}` })),
];

async function generate(job) {
  const file = path.join(out, `${job.name}.${job.format === 'jpeg' ? 'jpg' : 'png'}`);
  if (!only.length && await access(file).then(() => true, () => false)) return `kept ${job.name}`;
  if (only.length && !only.includes(job.name)) return null;
  const started = Date.now();
  let res;
  // gpt-image-2 cannot draw transparent backgrounds; gpt-image-1.5 can.
  const common = { model: job.transparent ? 'gpt-image-1.5' : 'gpt-image-2', prompt: job.prompt, size: job.size, quality: 'medium', output_format: job.format };
  if (job.withLogo) {
    const form = new FormData();
    for (const [k, v] of Object.entries(common)) form.append(k, v);
    if (job.transparent) form.append('background', 'transparent');
    form.append('image[]', new Blob([logo], { type: 'image/png' }), 'logo.png');
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...common, ...(job.format === 'jpeg' ? { output_compression: 88 } : {}) }),
    });
  }
  const json = await res.json();
  if (!res.ok) throw new Error(`${job.name}: ${json.error?.message || res.status}`);
  await writeFile(file, Buffer.from(json.data[0].b64_json, 'base64'));
  return `made ${job.name} (${Math.round((Date.now() - started) / 1000)}s)`;
}

await mkdir(out, { recursive: true });
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try { const r = await generate(job); if (r) console.log(r); } catch (e) { console.log('FAILED', e.message); }
  }
}));
