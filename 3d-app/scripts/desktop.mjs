// Local browser launch for Laravel/React and the Flutter app, without a phone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const logs=path.join(root,'.tools','desktop');
fs.mkdirSync(logs,{recursive:true});
const web='http://127.0.0.1:8000', app='http://127.0.0.1:8088';
const stop=process.argv.includes('--stop');
const noBrowser=process.argv.includes('--no-browser');
async function probe(url) { try { const r=await fetch(url,{signal:AbortSignal.timeout(2000)}); return {ok:r.ok,data:await r.json().catch(()=>null)}; } catch { return null; } }
async function launch(name, executable, args, cwd, url, expected) {
  const existing=await probe(url);
  if(existing?.ok && expected(existing.data)) {console.log(`${name} is already running.`);return;}
  if(existing) throw new Error(`${url} is occupied by another service. Stop that service or choose another port.`);
  const log=fs.openSync(path.join(logs,`${name}.log`),'a');
  const child=spawn(executable,args,{cwd,windowsHide:true,detached:true,stdio:['ignore',log,log],env:process.env});
  fs.closeSync(log);
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
  child.unref();
  fs.writeFileSync(path.join(logs,`${name}.json`),JSON.stringify({pid:child.pid,url,started:new Date().toISOString()}));
  for(let retry=0;retry<35;retry++) {const check=await probe(url);if(check?.ok&&expected(check.data))return;await new Promise(r=>setTimeout(r,300));}
  throw new Error(`${name} did not start. See ${path.join(logs,`${name}.log`)}.`);
}
try {
  if(stop){
    // Only processes started by this launcher and still serving our endpoints.
    for(const [name,expected] of [['website',data=>Array.isArray(data?.data?.sports)],['app-preview',data=>data?.app==='3deezi-flutter-preview']]){
      const record=path.join(logs,`${name}.json`);if(!fs.existsSync(record))continue;
      const saved=JSON.parse(fs.readFileSync(record,'utf8'));
      const service=await probe(saved.url);
      if(service?.ok&&expected(service.data)&&Number.isSafeInteger(saved.pid)){
        // A saved PID may have been reused after a restart. Check its creation
        // time before stopping it, even when the endpoint belongs to this app.
        let sameProcess=false;
        try {
          const info=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`$p = Get-Process -Id ${saved.pid} -ErrorAction Stop; @{name=$p.ProcessName;started=$p.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','ignore']}));
          sameProcess=Math.abs(Date.parse(info.started)-Date.parse(saved.started))<10000&&info.name===(name==='website'?'php':'node');
        } catch { /* Missing or unrelated process: leave it alone. */ }
        if(sameProcess){try{process.kill(saved.pid);console.log(`Stopped ${name}.`);}catch(error){if(error.code!=='ESRCH')throw error;}}
        else console.log(`Left ${name} running: its process does not match this launcher's record.`);
      }
      fs.unlinkSync(record);
    }
  } else {
    for(const required of ['website/vendor/autoload.php','website/public/build/manifest.json','build/web/index.html']) {
      if(!fs.existsSync(path.join(root,required)))throw new Error(`${required} is missing. Run scripts/Build-Desktop.ps1 first.`);
    }
    await launch('website','php',['-d','upload_max_filesize=12M','-d','post_max_size=14M','-S','127.0.0.1:8000','../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'],path.join(root,'website/public'),`${web}/api/v1/catalog`,data=>Array.isArray(data?.data?.sports));
    await launch('app-preview',process.execPath,[path.join(root,'scripts/serve_preview.mjs')],root,`${app}/__desktop_health`,data=>data?.app==='3deezi-flutter-preview');
    console.log(`\nReact website: ${web}\nArtboard: ${web}/artboard\nFlutter app in browser: ${app}\nNo USB cable, phone or emulator is needed.\nStop both using scripts/Stop-Desktop.cmd.`);
    if(!noBrowser&&process.platform==='win32') {
      spawn('rundll32.exe',['url.dll,FileProtocolHandler',web],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
      spawn('rundll32.exe',['url.dll,FileProtocolHandler',app],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
    }
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
