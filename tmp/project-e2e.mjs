// Headless project/conversation/reference acceptance with one real Codex chat.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'tmp','project-e2e-'+Date.now()),profile=path.join(base,'profile'),workspace=path.join(base,'workspace'),dshHome=path.join(base,'dsh-home'),codexHome=path.join(base,'codex-home'),out=path.join(root,'tmp','ui-shots','after'),port=9470
for(const dir of [base,profile,workspace,dshHome,codexHome,out])fs.mkdirSync(dir,{recursive:true})
fs.copyFileSync(path.join(os.homedir(),'.dsh','.credentials.yaml'),path.join(dshHome,'.credentials.yaml'))
for(const name of ['auth.json','models_cache.json']){const file=path.join(os.homedir(),'.codex',name);if(fs.existsSync(file))fs.copyFileSync(file,path.join(codexHome,name))}
const seed=JSON.parse(fs.readFileSync(path.join(root,'tmp','en-demo-profile','settings.json'),'utf8').replace(/^\uFEFF/,'')),model=seed.models.find(m=>m.engine==='codex'&&!/minimax|mmx/i.test(JSON.stringify(m)));assert.ok(model)
Object.assign(seed,{workspace,models:[{...model,defaultEffort:'low',maxTokens:8192}],providers:{},defaultModel:model.key,defaultEffort:'low',mcpServers:[],plugins:{'office-browser':false,'office-cli':false,'office-experts':false,'mcp-starter':false},experts:[],cliResources:{}})
require('../app/parameters.js').migrateSettings(seed)
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(seed,null,2))
const sourceDir=path.join(workspace,'projects','completed-source'),sourceFile=path.join(sourceDir,'source.md'),nonce=crypto.randomUUID(),sourceText=`# Completed project source\n\nThe fixture token is ${nonce}.\n`
fs.mkdirSync(path.join(sourceDir,'.office'),{recursive:true});fs.writeFileSync(sourceFile,sourceText);fs.writeFileSync(path.join(sourceDir,'.office','project.json'),JSON.stringify({id:'completed-source',title:'Verified source · 已完成来源',dir:sourceDir,rel:'projects/completed-source',status:'done',createdAt:Date.now()-10000,finishedAt:Date.now()-5000,phase:'已完成',team:[],reports:[],summary:'Contains source.md with a verified sentence. Read the source file before quoting.'}))
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),logs=[];let child,ws,next=0
const log=s=>{console.log(s);logs.push(s)}
async function start(){child=spawn(path.join(root,'dist','DSH Office','DSH Office.exe'),[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--window-size=1500,960'],{windowsHide:true,stdio:'ignore',env:{...process.env,DSH_OFFICE_HEADLESS:'1',DSH_HOME:dshHome,CODEX_HOME:codexHome}});let target;for(let i=0;i<90&&!target;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.url.endsWith('/renderer/index.html'))}catch{}if(!target)await sleep(350)}assert.ok(target,'isolated renderer available');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});await sleep(1300);await cdp('Emulation.setDeviceMetricsOverride',{width:1500,height:960,deviceScaleFactor:1,mobile:false})}
async function stop(){ws?.close();if(child&&child.exitCode===null){const wait=new Promise(r=>child.once('exit',r));child.kill();await wait}await sleep(700)}
function cdp(method,params={},timeout=45000){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{ws.removeEventListener('message',receive);reject(Error(method+' timeout'))},timeout);const receive=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timer);ws.removeEventListener('message',receive);m.error?reject(Error(m.error.message)):resolve(m.result)};ws.addEventListener('message',receive);ws.send(JSON.stringify({id,method,params}))})}
async function ev(expression,timeout){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}
const api=(name,...args)=>ev(`window.office.${name}(${args.map(JSON.stringify).join(',')})`)
async function setLang(lang){await ev(`if(document.documentElement.lang.startsWith('zh')!==${lang==='zh'})document.querySelector('#btn-lang').click();true`);await sleep(250)}
async function shot(name){await sleep(350);const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));log('SHOT '+name)}
const close=()=>ev("document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));true")
const info={base,profile,workspace,passed:false}
try{
 await start();assert.equal((await api('init')).settings.workspace,workspace)
 const preview=await api('projectPreview',{title:'Independent conversations · 独立对话',folder:'clients/research'})
 assert.equal(fs.existsSync(preview.dir),false);await assert.rejects(api('createProject',{title:preview.title,folder:preview.dir}));assert.equal(fs.existsSync(preview.dir),false);log('PASS preview does not write; creation requires location confirmation')
 await assert.rejects(api('projectPreview',{title:'Outside',folder:path.dirname(workspace)}));log('PASS outside workspace directory rejected')
 for(const lang of ['zh','en']){await close();await setLang(lang);await ev('window.OfficeProjects.open()');await ev("document.querySelector('#project-new').click();true");await ev(`document.querySelector('#newproject-title').value=${JSON.stringify(preview.title)};document.querySelector('#newproject-title').dispatchEvent(new Event('input'));document.querySelector('#newproject-folder').value=${JSON.stringify(preview.dir)};document.querySelector('#newproject-folder').dispatchEvent(new Event('input'));true`);await sleep(500);await shot(lang+'-project-location-confirmation')}
 await close()
 const p=await api('createProject',{title:preview.title,folder:preview.dir,confirmed:true});assert.equal(p.id,preview.id);info.project=p
 const meta=path.join(p.dir,'.office','project.json'),original=fs.readFileSync(meta,'utf8');await assert.rejects(api('createProject',{title:'Overwrite',folder:p.dir,confirmed:true}));assert.equal(fs.readFileSync(meta,'utf8'),original);log('PASS confirmed creation preserves exact path and refuses overwrite')
 const c1=await api('createConversation',p.id,{title:'Source review · 引用研究',sourceProjectIds:['completed-source']}),c2=await api('createConversation',p.id,{title:'Independent draft · 独立草稿'});info.conversations=[c1.id,c2.id]
 assert.deepEqual((await api('chatHistory',p.id,c1.id)).references.map(x=>x.dir),[fs.realpathSync(sourceDir)]);assert.deepEqual((await api('chatHistory',p.id,c2.id)).references,[])
 log('RUN one real Codex chat to read the selected completed-project source')
 const task=ev(`window.office.chatSend(${JSON.stringify(p.id)},${JSON.stringify('Read source.md from the selected completed project. Quote its one factual sentence exactly and cite the full absolute source file path. Do not modify source or create files. Keep your answer under 100 words.')},${JSON.stringify(c1.id)})`,240000)
 const reply=await task;info.reply=reply.message?.text||'';assert.ok(info.reply.includes(nonce),'reply quotes the unpredictable file-only source token');assert.ok(info.reply.replaceAll('\\','/').includes(sourceFile.replaceAll('\\','/')),'reply preserves the real source file path')
 const h1=await api('chatHistory',p.id,c1.id),h2=await api('chatHistory',p.id,c2.id);assert.equal(h1.messages.length,2);assert.deepEqual(h2.messages,[]);assert.equal(fs.readFileSync(sourceFile,'utf8'),sourceText)
 const a=JSON.parse(fs.readFileSync(path.join(p.dir,'.office','conversations',c1.id+'.json'),'utf8')),b=JSON.parse(fs.readFileSync(path.join(p.dir,'.office','conversations',c2.id+'.json'),'utf8'));assert.equal(a.messages.length,2);assert.deepEqual(b.messages,[]);log('PASS real quote/provenance; two conversations isolated; source file unchanged')
 await stop();await start();assert.equal((await api('chatHistory',p.id,c1.id)).messages.length,2);assert.equal((await api('chatHistory',p.id,c2.id)).messages.length,0);log('PASS project, source references and independent conversations survive restart')
 for(const lang of ['zh','en']){
   await close();await setLang(lang)
   await ev(`window.OfficeProjects.open(${JSON.stringify(p.id)})`);await sleep(350);await shot(lang+'-project-manager')
   await close();await ev(`document.dispatchEvent(new CustomEvent('office:open-project-chat',{detail:{id:${JSON.stringify(p.id)},conversationId:${JSON.stringify(c1.id)}}}));true`);await sleep(900);assert.ok(await ev(`document.querySelector('#chat-log').innerText.includes(${JSON.stringify(nonce)})`));await shot(lang+'-project-conversation')
 }
 info.passed=true;log('PASS project acceptance completed')
}catch(e){info.error=e.stack;console.error(e.stack);process.exitCode=1}finally{await stop();fs.writeFileSync(path.join(base,'result.json'),JSON.stringify(info,null,2));fs.writeFileSync(path.join(base,'evidence.log'),logs.join('\n')+'\n');console.log('EVIDENCE',base)}
