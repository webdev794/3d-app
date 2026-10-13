import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = fs.existsSync(path.join(folder, 'index.html')) ? folder : path.resolve(folder, '../build/web');
const port = Number(process.env.PORT || 8088);
// Keep the usual desktop preview local; --lan enables phone testing on Wi-Fi.
const lan = process.argv.includes('--lan');
const host = lan ? '0.0.0.0' : '127.0.0.1';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf','.css':'text/css'};
if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('Web preview missing. Run flutter build web first.'); process.exit(1); }
http.createServer((req, res) => {
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  const target = path.resolve(root, '.' + requested, requested.endsWith('/') ? 'index.html' : '');
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    fs.createReadStream(target).pipe(res);
  });
}).listen(port, host, () => {
  console.log(`3DEEZI preview: http://localhost:${port}`);
  if (lan) {
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) {
          console.log(`Phone preview: http://${address.address}:${port}`);
        }
      }
    }
    console.log('Connect your phone to the same local network and open a Phone preview URL in Safari.');
  }
  console.log('Press Ctrl+C to stop.');
}).on('error', error => { console.error(error.message); process.exit(1); });
