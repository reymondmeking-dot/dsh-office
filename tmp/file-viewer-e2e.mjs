// File-preview evidence: hidden WebContentsView, no credentials, no extra engine.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
const root='D:\\dsh-office',base=path.join(root,'tmp','file-viewer-'+Date.now()),profile=path.join(base,'profile'),workspace=path.join(base,'workspace'),out=path.join(root,'tmp','ui-shots','after'),port=9478,inspector=9479
for(const p of [profile,workspace,out,path.join(base,'dsh-home'),path.join(base,'codex-home')])fs.mkdirSync(p,{recursive:true})
fs.copyFileSync(path.join(root,'app','icon.png'),path.join(workspace,'preview.png'))
const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];const stream='BT /F1 24 Tf 56 710 Td (DSH Office - PDF preview) Tj 0 -46 Td /F1 13 Tf (Built-in Chromium PDF viewer. No extra browser engine.) Tj ET';objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objs.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;fs.writeFileSync(path.join(workspace,'preview.pdf'),pdf)
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({workspace,dshRoot:'D:\\deepseek-harness',models:[],providers:{},cliResources:{}}))
const child=spawn(path.join(root,'dist','DSH Office','DSH Office.exe'),[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,`--inspect=${inspector}`],{windowsHide:true,stdio:'ignore',env:{...process.env,DSH_OFFICE_HEADLESS:'1',DSH_OFFICE_BROWSER_DEBUG:'1',DSH_HOME:path.join(base,'dsh-home'),CODEX_HOME:path.join(base,'codex-home')}})
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),sockets=[],results=[];let serial=0
async function connect(port,filter){let t;for(let i=0;i<70&&!t;i++){try{t=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(filter)}catch{}if(!t)await sleep(300)}assert.ok(t,'CDP target '+port);const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));sockets.push(ws);return ws}
function call(ws,method,params={},timeout=12000){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{ws.removeEventListener('message',h);reject(Error(method+' timeout'))},timeout),h=e=>{const m=JSON.parse(e.data);if(m.id===id){clearTimeout(timer);ws.removeEventListener('message',h);m.error?reject(Error(m.error.message)):resolve(m.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id,method,params}))})}
async function ev(ws,expression,timeout){const r=await call(ws,'Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}
try{
 const app=await connect(port,t=>t.url.endsWith('/renderer/index.html')),main=await connect(inspector,t=>t.type==='node');await sleep(1000)
 assert.equal(await ev(app,'(async()=> (await office.init()).settings.workspace)()'),workspace)
 for(const ext of ['png','pdf']){
  const file=path.join(workspace,'preview.'+ext)
  await ev(app,`office.browser('file',{path:${JSON.stringify(file)}})`)
  let guest=await connect(port,t=>t.type==='page'&&t.url.endsWith('/preview.'+ext))
  const load=await ev(guest,`({title:document.title,ready:document.readyState,width:innerWidth,height:innerHeight,image:document.images[0]?{complete:document.images[0].complete,width:document.images[0].naturalWidth,height:document.images[0].naturalHeight}:null,pdf:!!document.querySelector('embed[type="application/pdf"],pdf-viewer'),url:location.href})`)
  if(ext==='png'){assert.ok(load.image?.complete);assert.equal(load.image.width,fs.readFileSync(file).readUInt32BE(16))}
  if(ext==='pdf'){assert.ok(load.pdf,'Chromium PDF viewer embed is installed');assert.equal((await(await fetch(load.url)).arrayBuffer()).byteLength,fs.statSync(file).size)}
  console.log('LOAD',ext,JSON.stringify(load));results.push({ext,load});if(ext==='pdf'){await sleep(3500);console.log('WCS',JSON.stringify(await ev(main,"process.mainModule.require('electron').webContents.getAllWebContents().map(w=>({id:w.id,url:w.getURL(),type:w.getType(),throttle:w.getBackgroundThrottling()}))")));console.log('TARGETS',JSON.stringify((await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).map(t=>({url:t.url,type:t.type,title:t.title}))))}
  if(ext==='pdf'){const pdfGuest=await connect(port,t=>t.type==='webview'&&t.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'));console.log('PDFDOM',JSON.stringify(await ev(pdfGuest,"({body:document.body.innerHTML.slice(0,5000),title:document.title})")));await sleep(2000)}
  if(ext==='png')await call(guest,'Emulation.setDeviceMetricsOverride',{width:1200,height:760,deviceScaleFactor:1,mobile:false});await sleep(700)
  let data
  // An explicit clip captures the native compositor without full-document
  // resizing, which stalls on Chromium's standalone image/PDF documents.
  const image=await call(guest,'Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,clip:{x:0,y:0,width:1200,height:760,scale:1}},15000)
  data=image.data
  assert.ok(Buffer.from(data,'base64').length>500)
  for(const lang of ['zh','en'])fs.writeFileSync(path.join(out,`${lang}-1500-file-${ext}-content.png`),Buffer.from(data,'base64'))
  if(ext==='png')await call(guest,'Emulation.clearDeviceMetricsOverride');console.log('CAPTURE',ext,Buffer.from(data,'base64').length)
 }
 const windows=await ev(main,"process.mainModule.require('electron').BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),visible:w.isVisible()}))");assert.ok(windows.every(w=>!w.visible));console.log('PASS file previews and captures stay hidden');results.push({windows,passed:true})
}catch(e){console.error(e.stack);results.push({error:e.stack});process.exitCode=1}finally{fs.writeFileSync(path.join(base,'result.json'),JSON.stringify(results,null,2));for(const ws of sockets)ws.close();child.kill();console.log('EVIDENCE',base)}
