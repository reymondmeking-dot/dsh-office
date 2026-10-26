'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {ProjectStore}=require('../app/projects.cjs')
const base=path.resolve(__dirname,'../tmp/project-unit-'+process.pid);fs.mkdirSync(base,{recursive:true})
test.after(()=>fs.rmSync(base,{recursive:true,force:true}))
let n=0
function fixture(){const root=path.join(base,'workspace-'+(++n));fs.mkdirSync(root);return{root,store:new ProjectStore({getWorkspace:()=>root})}}
function oldProject(root,name='old',extras={}){const dir=path.join(root,'projects',name);fs.mkdirSync(path.join(dir,'.office'),{recursive:true});const p={id:name,title:name,dir:'D:\\forged-outside',rel:'forged',status:'done',createdAt:1,summary:'Source summary',...extras};fs.writeFileSync(path.join(dir,'.office','project.json'),JSON.stringify(p));return{...p,dir,rel:'projects/'+name}}
test('project creation previews exact save location without writing and requires confirmation',()=>{
 const{root,store}=fixture();const preview=store.preview({title:'Research project'});assert.equal(fs.existsSync(path.join(root,'projects')),false)
 assert.ok(preview.dir.startsWith(path.join(root,'projects')));assert.throws(()=>store.create({title:'Research',folder:preview.dir}))
 const p=store.create({title:preview.title,folder:preview.dir,confirmed:true});assert.equal(p.id,preview.id);assert.equal(p.dir,preview.dir);assert.equal(p.kind,'workspace');assert.equal(p.status,'done')
 assert.deepEqual(store.list().map(x=>x.id),[p.id]);const index=JSON.parse(fs.readFileSync(path.join(root,'.office','project-index.json'),'utf8'));assert.deepEqual(index.folders,[p.rel]);assert.ok(!JSON.stringify(index).includes(root))
 const before=fs.readFileSync(path.join(p.dir,'.office','project.json'),'utf8');assert.throws(()=>store.create({title:'Overwrite',folder:p.dir,confirmed:true}));assert.equal(fs.readFileSync(path.join(p.dir,'.office','project.json'),'utf8'),before)
})
test('project creation preserves user files and listing canonicalizes legacy metadata with registered nested projects',()=>{
 const{root,store}=fixture(),legacy=oldProject(root);const folder=path.join(root,'clients','alpha');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'user.txt'),'untouched')
 const p=store.create({title:'Client Alpha',folder,confirmed:true});assert.equal(fs.readFileSync(path.join(folder,'user.txt'),'utf8'),'untouched')
 const listed=store.list();assert.equal(listed.length,2);assert.equal(listed.find(x=>x.id===legacy.id).dir,fs.realpathSync(legacy.dir));assert.equal(listed.find(x=>x.id===legacy.id).rel,'projects/old');assert.equal(listed.find(x=>x.id===p.id).dir,fs.realpathSync(folder))
 assert.equal(store.register(legacy.dir),'projects/old');assert.equal(store.list().length,2)
})
test('two conversations remain isolated and default conversation preserves old chat format',()=>{
 const{root,store}=fixture(),p=oldProject(root),old=[{role:'user',text:'old question',at:1},{role:'ceo',text:'old answer',at:2}];const chat=path.join(p.dir,'.office','chat.json');fs.writeFileSync(chat,JSON.stringify(old));const original=fs.readFileSync(chat,'utf8')
 assert.deepEqual(store.readConversation(p).messages,old)
 const a=store.createConversation(p,{title:'Research'}),b=store.createConversation(p,{title:'Editing'});store.writeConversation(p,a.id,[{role:'user',text:'A only'}]);store.writeConversation(p,b.id,[{role:'user',text:'B only'}])
 assert.equal(store.readConversation(p,a.id).messages[0].text,'A only');assert.equal(store.readConversation(p,b.id).messages[0].text,'B only');assert.equal(fs.readFileSync(chat,'utf8'),original)
 assert.equal(store.conversations(p).length,3);store.writeConversation(p,'default',[...old,{role:'user',text:'new question'}]);assert.ok(Array.isArray(JSON.parse(fs.readFileSync(chat,'utf8'))));assert.equal(store.readConversation(p,a.id).messages.length,1)
 for(const id of ['../project','x/y','default/../../x','not-a-uuid'])assert.throws(()=>store.readConversation(p,id))
})
test('references preserve provenance, require other done projects and never copy source files',()=>{
 const{root,store}=fixture(),p=oldProject(root,'current'),source=oldProject(root,'source',{summary:'s'.repeat(4000)}),failed=oldProject(root,'failed',{status:'failed'});fs.writeFileSync(path.join(source.dir,'source.md'),'original evidence')
 const c=store.createConversation(p,{title:'Compare sources',sourceProjectIds:[source.id]});assert.deepEqual(store.readConversation(p,c.id).sourceProjectIds,[source.id]);const refs=store.references(p,c.id)
 assert.deepEqual(Object.keys(refs[0]).sort(),['dir','id','summary','title']);assert.equal(refs[0].dir,fs.realpathSync(source.dir));assert.equal(refs[0].summary.length,3000);assert.equal(fs.existsSync(path.join(p.dir,'source.md')),false)
 assert.throws(()=>store.setReferences(p,c.id,[p.id]));assert.throws(()=>store.setReferences(p,c.id,[failed.id]));assert.throws(()=>store.setReferences(p,c.id,['missing']))
 store.setReferences(p,'default',[source.id]);assert.deepEqual(store.references(p).map(r=>r.id),[source.id]);assert.equal(fs.readFileSync(path.join(source.dir,'source.md'),'utf8'),'original evidence')
})
test('project paths and metadata reject outside paths, junctions and registry traversal without reading them',()=>{
 const{root,store}=fixture(),outside=path.join(base,'outside-'+n);fs.mkdirSync(path.join(outside,'.office'),{recursive:true});fs.writeFileSync(path.join(outside,'.office','project.json'),JSON.stringify({id:'outside',status:'done'}))
 oldProject(root,'inside');assert.throws(()=>store.preview({title:'Bad',folder:outside}));assert.throws(()=>store.create({title:'Bad',folder:'../escape',confirmed:true}));assert.throws(()=>store.register(outside))
 fs.symlinkSync(outside,path.join(root,'projects','linked'),process.platform==='win32'?'junction':'dir');assert.throws(()=>store.preview({title:'Link',folder:path.join(root,'projects','linked','new')}));assert.ok(!store.list().some(p=>p.id==='outside'))
 fs.mkdirSync(path.join(root,'.office'));fs.writeFileSync(path.join(root,'.office','project-index.json'),JSON.stringify({version:1,folders:['../'+path.basename(outside),outside,'projects/linked']}));assert.deepEqual(store.list().map(p=>p.id),['inside'])
})
