'use strict'
// Project metadata and conversations live beside the user's own files. Listing
// follows only known, workspace-relative locations; no recursive vault scan.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { within } = require('./browser-policy.cjs')
const I = require('./renderer/i18n.js')
const L = (zh,en) => I.getLang() === 'en' ? en : zh
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
class ProjectStore {
  constructor({getWorkspace}) { this.getWorkspace = getWorkspace }
  root() { return fs.realpathSync(this.getWorkspace()) }
  safe(input, create = false) {
    const configured = path.resolve(this.getWorkspace()), root = this.root()
    let target = path.resolve(root, String(input || ''))
    if (path.isAbsolute(String(input)) && within(configured,target)) target=path.resolve(root,path.relative(configured,target))
    if (!within(root,target)) throw new Error(L('项目路径不在工作区内', 'Project path is outside the workspace'))
    let current=root
    for(const piece of path.relative(root,target).split(path.sep).filter(Boolean)) {
      current=path.join(current,piece)
      if(fs.existsSync(current)) {
        if(fs.lstatSync(current).isSymbolicLink()) throw new Error(L('项目路径不能包含链接或目录联接', 'Project paths cannot contain links or junctions'))
        if(!within(root,fs.realpathSync(current))) throw new Error(L('项目路径越界', 'Project path escapes the workspace'))
      } else if(!create) throw new Error(L('项目路径不存在', 'Project path does not exist'))
    }
    return fs.existsSync(target)?fs.realpathSync(target):target
  }
  readJSON(file, fallback) {
    try { const p=this.safe(file);if(!fs.statSync(p).isFile()||fs.statSync(p).size>8*1024*1024)return fallback;return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')) } catch {return fallback}
  }
  writeJSON(file,value,{exclusive=false}={}) {
    const target=this.safe(file,true);fs.mkdirSync(path.dirname(target),{recursive:true});this.safe(path.dirname(target))
    const data=JSON.stringify(value,null,2)+'\n'
    if(exclusive){fs.writeFileSync(target,data,{encoding:'utf8',flag:'wx'});return}
    const temp=this.safe(target+'.'+crypto.randomBytes(6).toString('hex')+'.tmp',true)
    try{fs.writeFileSync(temp,data,{encoding:'utf8',flag:'wx'});fs.renameSync(temp,target)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
  }
  indexFile() {return this.safe('.office/project-index.json',true)}
  indexed() {try{const v=this.readJSON(this.indexFile(),{});return Array.isArray(v.folders)?v.folders.filter(x=>typeof x==='string'&&!path.isAbsolute(x)):[]}catch{return []}}
  list() {
    let root;try{root=this.root()}catch{return []}
    const dirs=new Set(this.indexed())
    try {const base=this.safe('projects');for(const e of fs.readdirSync(base,{withFileTypes:true}))if(e.isDirectory()&&!e.isSymbolicLink())dirs.add(path.join('projects',e.name))}catch{}
    const out=[],seen=new Set(),ids=new Set()
    for(const rel of dirs){try{
      const dir=this.safe(path.resolve(root,rel)), key=process.platform==='win32'?dir.toLowerCase():dir
      if(seen.has(key))continue;seen.add(key)
      const p=this.readJSON(path.join(dir,'.office','project.json'),null)
      if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))continue
      ids.add(p.id);out.push({...p,dir,rel:path.relative(root,dir).split(path.sep).join('/')})
    }catch{}}
    return out.sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0))
  }
  preview({title,folder}={}) {
    const name=String(title||'').trim().slice(0,160)
    if(!name)throw new Error(L('请填写项目名称','Enter a project name'))
    const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)
    const slug=name.replace(/[\\/:*?"<>|\s]+/g,'-').replace(/^[.-]+|[.-]+$/g,'').slice(0,36)||'project'
    const dir=this.safe(folder||path.join('projects',stamp+'-'+slug+'-'+crypto.randomUUID().slice(0,8)),true)
    if(dir===this.root())throw new Error(L('请选择工作区内的项目子目录','Choose a project subdirectory inside the workspace'))
    const meta=this.safe(path.join(dir,'.office','project.json'),true)
    if(fs.existsSync(meta))throw new Error(L('此目录已有项目，请选择其他位置','This folder already contains a project; choose another location'))
    if(fs.existsSync(dir)&&!fs.statSync(dir).isDirectory())throw new Error(L('保存位置必须是目录','The save location must be a folder'))
    const rel=path.relative(this.root(),dir).split(path.sep).join('/')
    return{id:'project-'+crypto.createHash('sha256').update(rel).digest('hex').slice(0,20),title:name,dir,rel}
  }
  create(input={}) {
    if(input.confirmed!==true)throw new Error(L('请先确认项目保存位置','Confirm the project save location first'))
    const p=this.preview(input)
    const now=Date.now(), project={...p,kind:'workspace',status:'done',phase:L('项目已创建','Project created'),createdAt:now,finishedAt:now,brief:'',team:[],assignments:[],reports:[],summary:''}
    this.writeJSON(path.join(p.dir,'.office','project.json'),project,{exclusive:true});this.register(p.dir);return project
  }
  register(dir) {
    const full=this.safe(dir),p=this.readJSON(path.join(full,'.office','project.json'),null)
    if(!p||typeof p.id!=='string')throw new Error(L('项目元数据不存在','Project metadata is missing'))
    const rel=path.relative(this.root(),full).split(path.sep).join('/'),folders=this.indexed()
    if(!folders.includes(rel)){folders.push(rel);this.writeJSON(this.indexFile(),{version:1,folders})}
    return rel
  }
  projectDir(project) {
    if(!project||typeof project.dir!=='string')throw new Error(L('项目无效','Invalid project'))
    const dir=this.safe(project.dir),p=this.readJSON(path.join(dir,'.office','project.json'),null)
    if(!p||p.id!==project.id)throw new Error(L('项目元数据不匹配','Project metadata does not match'))
    return dir
  }
  conversationFile(project,id='default') {
    if(id!=='default'&&!UUID.test(String(id)))throw new Error(L('对话 ID 无效','Invalid conversation ID'))
    return this.safe(path.join(this.projectDir(project),'.office','conversations',id+'.json'),true)
  }
  readConversation(project,id='default') {
    const file=this.conversationFile(project,id),meta=this.readJSON(file,null)
    if(id!=='default'&&!meta)throw new Error(L('对话不存在','Conversation does not exist'))
    const now=Number(project.createdAt)||Date.now()
    const sourceProjectIds=Array.isArray(meta?.sourceProjectIds)?meta.sourceProjectIds.filter(x=>typeof x==='string'):[]
    const messages=id==='default'?this.readJSON(this.safe(path.join(this.projectDir(project),'.office','chat.json'),true),[]):meta.messages
    return{id,title:meta?.title||L('默认对话','Default conversation'),messages:Array.isArray(messages)?messages:[],sourceProjectIds,createdAt:meta?.createdAt||now,updatedAt:meta?.updatedAt||now}
  }
  conversations(project) {
    const out=[this.readConversation(project)]
    let dir;try{dir=this.safe(path.join(this.projectDir(project),'.office','conversations'))}catch{return out}
    for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isFile()&&UUID.test(path.basename(e.name,'.json'))&&e.name.endsWith('.json')){try{out.push(this.readConversation(project,path.basename(e.name,'.json')))}catch{}}
    return out
  }
  validateReferences(project,ids) {
    if(!Array.isArray(ids)||ids.length>30||ids.some(x=>typeof x!=='string'))throw new Error(L('引用项目列表无效','Invalid source project list'))
    const all=this.list(),unique=[...new Set(ids)]
    for(const id of unique)if(id===project.id||!all.some(p=>p.id===id&&p.status==='done'))throw new Error(L('只能引用其他已完成项目','Only other completed projects can be referenced'))
    return unique
  }
  createConversation(project,{title,sourceProjectIds=[]}={}) {
    this.projectDir(project)
    const now=Date.now(),c={id:crypto.randomUUID(),title:String(title||L('新对话','New conversation')).trim().slice(0,100)||L('新对话','New conversation'),messages:[],sourceProjectIds:this.validateReferences(project,sourceProjectIds),createdAt:now,updatedAt:now}
    this.writeJSON(this.conversationFile(project,c.id),c,{exclusive:true});return c
  }
  writeConversation(project,id='default',messages) {
    if(!Array.isArray(messages)||messages.length>10000)throw new Error(L('对话消息无效','Invalid conversation messages'))
    const c=this.readConversation(project,id);c.messages=messages;c.updatedAt=Date.now()
    if(id==='default'){
      this.writeJSON(path.join(this.projectDir(project),'.office','chat.json'),messages)
      const{messages:_,...meta}=c;this.writeJSON(this.conversationFile(project,id),meta)
    }else this.writeJSON(this.conversationFile(project,id),c)
    return c
  }
  setReferences(project,id='default',ids=[]) {
    const c=this.readConversation(project,id);c.sourceProjectIds=this.validateReferences(project,ids);c.updatedAt=Date.now()
    if(id==='default'){const{messages:_,...meta}=c;this.writeJSON(this.conversationFile(project,id),meta)}else this.writeJSON(this.conversationFile(project,id),c)
    return c
  }
  references(project,id='default') {
    const c=this.readConversation(project,id),ids=new Set(c.sourceProjectIds)
    return this.list().filter(p=>p.id!==project.id&&p.status==='done'&&ids.has(p.id)).map(p=>({id:p.id,title:p.title,dir:p.dir,summary:String(p.summary||'').slice(0,3000)}))
  }
}
module.exports={ProjectStore}
