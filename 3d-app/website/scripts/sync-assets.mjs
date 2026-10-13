import { cp, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const folder of ['images', 'fonts']) {
  await mkdir(path.join(root, 'public/media', folder), { recursive: true });
  await cp(path.join(root, '../assets', folder), path.join(root, 'public/media', folder), { recursive: true });
}
// The website has its own viewer build (cinematic stage, stadium backdrop,
// sponsor printing) in website/viewer; copying the mobile viewer here would
// replace it, so build it instead.
execFileSync(process.execPath, [path.join(root, 'viewer/build.mjs')], { stdio: 'inherit' });
console.log('Website artwork and fonts copied from the mobile project; website 3D viewer rebuilt.');
