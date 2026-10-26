import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import http from 'node:http'
import {spawn} from 'node:child_process'
const ROOT='D:\\dsh-office', dir=path.join(ROOT,'tmp','browser-login-'+Date.now()), profile=path.join(dir,'profile'), workspace=path.join(dir,'workspace'), home=path.join(dir,'dsh-home')
for(const p of [dir,profile,workspace,home])fs.mkdirSync(p,{recursive:true})
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>Local login verification</title><style>body{font:18px system-ui;background:#f4f6fa;padding:60px}main{max-width:450px;margin:auto;background:white;padding:32px;border-radius:16px}label{display:block;margin:18px 0}input{display:block;padding:12px;width:90%;margin-top:8px}button{padding:12px 24px}h1{font-size:26px}</style></head><body><main><h1>Local login verification</h1><p>Isolated fixture · 本地登录测试</p><form id="login"><label>Username / 用户名<input name="username" autocomplete="username"></label><label>Password / 密码<input name="password" type="password" autocomplete="current-password"></label><button>Sign in / 登录</button></form><p id="result"></p></main><script>document.querySelector("form").addEventListener("submit",e=>{e.preventDefault();document.querySelector("#result").textContent="Form submitted / 已提交"})</script></body></html>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({workspace,dshRoot:'D:\\deepseek-harness',models:[],providers:{},browser:{allowPrivate:true}}))
const child=spawn(path.join(ROOT,'dist','DSH Office','DSH Office.exe'),[`--user-data-dir=${profile}`,'--remote-debugging-port=9462','--inspect=9463'],{windowsHide:true,stdio:'ignore',env:{...process.env,DSH_OFFICE_HEADLESS:'1',DSH_HOME:home,CODEX_HOME:path.join(dir,'codex-home')}})
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const sockets=[]
async function target(port,choose){for(let i=0;i<90;i++){try{const t=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(choose);if(t)return t}catch{}await sleep(300)}throw Error('Missing CDP target '+port)}
async function connect(t){const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});sockets.push(ws);let id=0;return async(method,params={})=>new Promise((r,j)=>{const my=++id,timeout=setTimeout(()=>j(Error(method+' timeout')),30000);const h=ev=>{const m=JSON.parse(ev.data);if(m.id!==my)return;clearTimeout(timeout);ws.removeEventListener('message',h);m.error?j(Error(m.error.message)):r(m.result)};ws.addEventListener('message',h);ws.send(JSON.stringify({id:my,method,params}))})}
async function evaluate(call,expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}
let log=[];const pass=x=>{console.log('PASS',x);log.push('PASS '+x)}
try{
 const main=await connect(await target(9462,t=>t.url.endsWith('/renderer/index.html')));await sleep(1800);await main('Emulation.setDeviceMetricsOverride',{width:1500,height:960,deviceScaleFactor:1,mobile:false})
 const ui=(action,args={})=>evaluate(main,`window.office.browser(${JSON.stringify(action)},${JSON.stringify(args)})`)
 const init=await ui('state');assert.equal(init.vaultAvailable,true);pass('Windows safeStorage is available')
 await ui('new',{url:origin+'/login'});await ui('visible',{visible:true});await ui('bounds',{x:20,y:190,width:1200,height:570})
 const login=await connect(await target(9462,t=>t.url.startsWith(origin)));await sleep(500)
 const password='Fixture-Only-'+Date.now()+'-NeverSavedClear',username='fixture-user'
 await evaluate(login,`document.querySelector('[name=username]').value=${JSON.stringify(username)};document.querySelector('[name=password]').value=${JSON.stringify(password)};document.querySelector('form').requestSubmit();true`)
 let state;for(let i=0;i<30;i++){state=await ui('state');if(state.pending.some(x=>x.kind==='save'))break;await sleep(200)}
 assert.ok(state.pending.some(x=>x.kind==='save'));assert.ok(!JSON.stringify(state).includes(password));pass('submit requests save without leaking password to UI events')
 await evaluate(main,"document.querySelector('#browser-confirm-yes').click();true");await sleep(400)
 const disk=fs.readFileSync(path.join(profile,'vault.json'),'utf8');assert.ok(!disk.includes(password));assert.ok(!disk.includes(username));assert.ok(!disk.includes(origin));pass('DPAPI vault contains ciphertext only')
 const credentials=await ui('credentials');assert.equal(credentials.sites.length,1)
 await evaluate(login,"document.querySelector('[name=password]').value='';document.querySelector('[name=username]').value='';true")
 await ui('fill',{credentialId:credentials.sites[0].id})
 assert.equal(await evaluate(login,`document.querySelector('[name=password]').value===${JSON.stringify(password)}`),true);pass('one-click fill restores matching-origin credentials')
 const inspector=await connect(await target(9463,t=>t.type==='node'))
 const bridge=await evaluate(inspector,"({url:process.env.DSH_OFFICE_BROWSER_URL,token:process.env.DSH_OFFICE_BROWSER_TOKEN})")
 const contextId='login-test-employee',model=[]
 const tool=async(name,args={})=>{const response=await fetch(bridge.url+'/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.token,'Content-Type':'application/json'},body:JSON.stringify({name,args,contextId,projectDir:workspace,owner:'Login test employee'})});const data=await response.json();if(!response.ok)throw Error(data.error||response.status);model.push(data);return data.result}
 await tool('browser_open',{url:origin+'/login?employee=1'})
 const shots=path.join(ROOT,'tmp','ui-shots','after');fs.mkdirSync(shots,{recursive:true})
 const setLang=async(lang)=>{await evaluate(main,`if(document.documentElement.lang.startsWith('zh')!==${lang==='zh'})document.querySelector('#btn-lang').click();true`);await sleep(200)}
 const shot=async(name,call=main)=>{if(call!==main)await call('Emulation.setDeviceMetricsOverride',{width:1200,height:760,deviceScaleFactor:1,mobile:false});await sleep(350);const r=await call('Page.captureScreenshot',call===main?{format:'png'}:{format:'png',captureBeyondViewport:true,fromSurface:true});fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(r.data,'base64'));if(call!==main)await call('Emulation.clearDeviceMetricsOverride')}
 for(const lang of ['zh','en']){await setLang(lang);await evaluate(main,'window.OfficeBrowser.vault()');await shot(lang+'-vault');await evaluate(main,"document.querySelector('#vault-modal').classList.add('hidden');true")}
 const pending=await tool('browser_login',{origin});assert.equal(pending.status,'pending_user_confirmation')
 state=await ui('state');assert.ok(state.pending.some(x=>x.kind==='login'));pass('employee browser_login requires explicit UI approval')
 const tabs=(await(await fetch('http://127.0.0.1:9462/json/list')).json()).filter(t=>t.url.startsWith(origin)&&t.url.includes('employee=1'))
 const employee=await connect(tabs.at(-1));assert.equal(await evaluate(employee,"document.querySelector('[name=password]').value===''"),true)
 await ui('visible',{visible:false})
 await evaluate(main,"document.querySelector('#btn-browser')?.click();true").catch(()=>{})
 await setLang('en');await shot('en-login-confirmation')
 await evaluate(main,"document.querySelector('#browser-confirm-no').click();true");await sleep(200)
 await setLang('zh');await tool('browser_login',{origin});await sleep(300);await shot('zh-login-confirmation')
 await evaluate(main,"document.querySelector('#browser-confirm-yes').click();true");await sleep(400)
 const employeeTab=(await ui('state')).tabs.find(t=>t.owner);await ui('select',{id:employeeTab.id})
 for(const lang of ['zh','en']){await setLang(lang);await evaluate(main,'window.OfficeBrowser.open()');await shot(lang+'-employee-watch-shell');if(lang==='en'&&fs.existsSync(path.join(shots,'zh-employee-watch-content.png')))fs.copyFileSync(path.join(shots,'zh-employee-watch-content.png'),path.join(shots,lang+'-employee-watch-content.png'))}
 assert.equal(await evaluate(employee,`document.querySelector('[name=password]').value===${JSON.stringify(password)}`),true)
 await tool('browser_snapshot');const screenshot=await tool('browser_screenshot');assert.ok(fs.existsSync(screenshot.path));assert.equal(screenshot.protected,true);assert.ok(!JSON.stringify(model).includes(password));assert.ok(!JSON.stringify(model).includes(username));pass('approved employee fill returns no password or input values to model')
 const appLog=fs.readFileSync(path.join(profile,'office.log'),'utf8');assert.ok(!appLog.includes(password));pass('application log excludes password')
 await fetch(bridge.url+'/release',{method:'POST',headers:{Authorization:'Bearer '+bridge.token,'Content-Type':'application/json'},body:JSON.stringify({contextId})})
 fs.writeFileSync(path.join(dir,'model-visible.json'),JSON.stringify(model,null,2));fs.writeFileSync(path.join(dir,'evidence.log'),log.join('\n')+'\n')
 console.log('EVIDENCE',dir)
}catch(e){console.error(e.stack);process.exitCode=1}finally{for(const ws of sockets)ws.close();child.kill();server.close()}
