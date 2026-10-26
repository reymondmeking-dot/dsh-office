'use strict'
;(() => {
  const $ = s => document.querySelector(s), api = window.office, t = (k,v) => I18N.t(k,v)
  let enabled = {}, detected = [], working = false
  const msg = value => { $('#cli-message').textContent = value || '' }
  function render() {
    const list = $('#cli-list'); list.replaceChildren()
    if (!detected.length) { const p = document.createElement('p'); p.className='hint'; p.textContent=t('cli.empty'); list.append(p); return }
    for (const r of detected) {
      const row=document.createElement('div'); row.className='cli-resource'
      const label=document.createElement('label'); label.className='cli-resource-label'
      const check=document.createElement('input'); check.type='checkbox'; check.checked=!!enabled[r.id]
      const available=r.installed&&(r.authenticated||r.credentialAvailable)
      check.disabled=!available&&!enabled[r.id]; check.onchange=()=>{enabled[r.id]=check.checked;msg('')}
      const info=document.createElement('span'),name=document.createElement('strong');name.textContent=r.name||r.id
      const status=document.createElement('small');status.textContent=t('cli.'+(!r.installed?'not-installed':r.status||'unknown'))
      info.append(name,status);label.append(check,info);row.append(label)
      if(r.installed){const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=t('cli.scope');detail.append(summary);const commands=document.createElement('code');commands.textContent=(r.commands||[]).join(' · ');detail.append(commands);row.append(detail)}
      list.append(row)
    }
  }
  $('#cli-detect').onclick=async()=>{
    if(working)return;working=true;$('#cli-detect').disabled=true;msg(t('cli.detecting'))
    try{const r=await api.detectCli();detected=r.resources;render();msg('')}catch(e){msg(e.message)}finally{working=false;$('#cli-detect').disabled=false}
  }
  $('#cli-grant').onclick=async()=>{
    const selected=detected.filter(r=>enabled[r.id]).map(r=>r.name||r.id).join(', ')
    if(!await OfficeBrowser.confirm(t('cli.confirmTitle'),t('cli.confirmText'),selected))return
    try{enabled=await api.saveCliResources({enabled:{github:!!enabled.github,taptap:!!enabled.taptap},confirmed:true});msg(t('cli.saved'))}catch(e){msg(e.message)}
  }
  $('#set-about').onclick=()=>$('#about-modal').classList.remove('hidden')
  for(const link of document.querySelectorAll('[data-office-link]'))link.onclick=e=>{e.preventDefault();$('#about-modal').classList.add('hidden');OfficeBrowser.open(link.dataset.officeLink).catch(e=>msg(e.message))}
  $('#btn-lang').addEventListener('click',render)
  document.addEventListener('office:settings',e=>{enabled={...e.detail.cliResources};render()})
  api.init().then(d=>{enabled={...d.settings.cliResources};render()})
})()
