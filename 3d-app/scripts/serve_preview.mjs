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
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf','.css':'text/css'};
if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('Web preview missing. Run flutter build web first.'); process.exit(1); }
const previewIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const compiledBase = previewIndex.match(/<base\s+href=["']([^"']+)["']/i)?.[1] || '/';
const backend = new URL(process.env.PREVIEW_API_URL || 'http://127.0.0.1:8000');
if (backend.protocol !== 'http:') throw new Error('Local preview API must use an HTTP address.');
http.createServer((req, res) => {
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (requested === '/__desktop_health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ app:'3deezi-flutter-preview', proxy:backend.origin })); return;
  }
  // Browser app and Laravel share one origin; no phone or CORS setup is needed.
  if (requested.startsWith('/api/v1/')) {
    const upstream = http.request(new URL(req.url, backend), {method:req.method,headers:{...req.headers,host:backend.host}}, incoming => {
      res.writeHead(incoming.statusCode || 502, incoming.headers); incoming.pipe(res);
    });
    upstream.setTimeout(180000,()=>upstream.destroy(new Error('API timed out.')));
    upstream.on('error',()=>{ if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'The local Laravel API is not running. Start scripts/Start-Desktop.cmd.'})); });
    req.pipe(upstream); return;
  }
  // A deployed build may contain /3deezi/. The local launcher works with both
  // that path and /, without rewriting files in a deployment build.
  if (compiledBase !== '/' && compiledBase.startsWith('/') && requested.startsWith(compiledBase)) requested = '/' + requested.slice(compiledBase.length);
  const target = path.resolve(root, '.' + requested, requested.endsWith('/') ? 'index.html' : '');
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options':'nosniff'});
    if (target === path.join(root,'index.html')) {
      res.end(previewIndex.replace(/<base\s+href=["'][^"']+["']\s*\/?\s*>/i,'<base href="/">')); return;
    }
    fs.createReadStream(target).pipe(res);
  });
}).listen(port, host, () => {
  console.log(`3DEEZI preview: http://localhost:${port}`);
  console.log(`Local account/project API: ${backend.origin} (proxied through this preview)`);
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
