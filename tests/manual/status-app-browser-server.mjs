// Synthetic, local-only MCP Apps host fixture. Never reads user documents.
import http from 'node:http';
import fs from 'node:fs';
const card = fs.readFileSync(new URL('../../plugins/data-secure/server/status-app/status-card.html', import.meta.url), 'utf8');
const axe = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const harness = `<!doctype html><html lang="en"><meta charset="utf-8"><title>DataSecure synthetic status test</title><body><main><h1>Offline status-card test fixture</h1><button id="run">Run checks</button><button id="english">English</button><button id="zoom">400% text / narrow</button><button id="normal">Normal text</button><iframe title="Status card" id="card" style="width:320px;height:700px;border:1px solid" src="/card"></iframe><pre id="result">Waiting for SDK handshake</pre></main><script src="/fixture.js"></script></body></html>`;
const fixture = `
const frame = document.getElementById('card'); const output = document.getElementById('result');
const calls = []; let ready = false;
function send(message) { frame.contentWindow.postMessage({jsonrpc:'2.0',...message}, location.origin); }
addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
  const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
  if (m.method) calls.push(m.method);
  if (m.method === 'ui/initialize') send({id:m.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'Synthetic local test host',version:'1'},hostCapabilities:{},hostContext:{theme:'light',displayMode:'inline'}}});
  if (m.method === 'ui/notifications/initialized') {
    ready = true;
    send({method:'ui/notifications/tool-result',params:{content:[{type:'text',text:'NOT_FOR_RENDERING_CANARY'}],_meta:{'datasecure/status':{schema:'datasecure-status-card/v1',locale:'de',state:'local_start_confirmed',snapshot:true}}}});
    output.textContent = 'SDK handshake complete';
  }
});
document.getElementById('english').onclick = () => { const select=frame.contentDocument.getElementById('language'); select.value='en';select.dispatchEvent(new Event('change')); };
document.getElementById('zoom').onclick = () => { frame.contentDocument.documentElement.style.fontSize='400%'; };
document.getElementById('normal').onclick = () => { frame.contentDocument.documentElement.style.fontSize=''; };
document.getElementById('run').onclick = async () => {
  try {
    if (!ready) throw Error('No handshake');
    const doc=frame.contentDocument; const win=frame.contentWindow;
    const audit=await win.axe.run(doc,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
    const errors=[];
    if(audit.violations.length) errors.push(...audit.violations.map(x=>x.id));
    if(doc.documentElement.scrollWidth>win.innerWidth+1) errors.push('horizontal-overflow');
    if(doc.body.textContent.includes('NOT_FOR_RENDERING_CANARY')) errors.push('content-leak');
    if(!['Lokaler Start bestätigt.','Local start acknowledged.'].includes(doc.getElementById('state').textContent)) errors.push('wrong-state');
    if(calls.some(x=>!['ui/initialize','ui/notifications/initialized'].includes(x))) errors.push('unexpected-bridge-action');
    output.textContent=JSON.stringify({passed:errors.length===0,errors,axePasses:audit.passes.length,incomplete:audit.incomplete.map(x=>x.id),bridgeCalls:calls,language:doc.documentElement.lang,width:win.innerWidth,scrollWidth:doc.documentElement.scrollWidth,fontSize:win.getComputedStyle(doc.documentElement).fontSize},null,2);
  } catch(error){output.textContent='FAIL '+error.message;}
};
`;
const routes = new Map([['/', ['text/html', harness]], ['/card', ['text/html', card.replace('</head>', '<script src="/axe.js"></script></head>')]], ['/axe.js', ['text/javascript', axe]], ['/fixture.js', ['text/javascript', fixture]]]);
const server = http.createServer((req,res) => {
  const entry=routes.get(req.url);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'");
  res.writeHead(entry?200:404,{'Content-Type':entry?entry[0]+'; charset=utf-8':'text/plain'});res.end(entry?entry[1]:'Not found');
});
server.listen(0,'127.0.0.1',()=>console.log('Synthetic status fixture: http://127.0.0.1:'+server.address().port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
