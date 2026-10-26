'use strict'
;(() => {
  const I = typeof module === 'object' && module.exports ? require('./i18n.js') : window.I18N
  const entries = {
    'cli.title':['本机 CLI 资源','Local CLI resources'], 'cli.detect':['一键检测','Detect resources'],
    'tool.cli':['读取 {resource} 资源','Reading {resource} resources'],
    'cli.hint':['检测本机已安装、已登录的 CLI，勾选并确认后供员工使用。凭据留在原 CLI 中；本版仅开放下列只读命令。','Detect installed, signed-in CLIs. Select and confirm to grant employees access. Credentials stay with the CLI; this version allows the listed read commands only.'],
    'cli.empty':['点击“一键检测”，列出 GitHub CLI、TapTap CLI 的可用状态。','Click Detect resources to list the availability of GitHub CLI and TapTap CLI.'],
    'cli.detecting':['正在核实安装与登录状态…','Checking installation and sign-in…'], 'cli.ready':['已登录，可授权','Signed in · available'],
    'cli.credentials-present':['有登录凭据，尚未联网核验','Saved credentials · not verified online'], 'cli.not-authenticated':['尚未登录','Not signed in'],
    'cli.unknown':['无法核实登录状态','Sign-in status unknown'], 'cli.not-installed':['未安装','Not installed'], 'cli.enable':['允许员工使用','Allow employees to use'],
    'cli.unsupported':['CLI 版本暂不支持检测','CLI version does not support detection'],
    'cli.grant':['确认所选授权','Confirm selected access'], 'cli.confirmTitle':['授权本机 CLI 资源？','Grant access to local CLIs?'],
    'cli.confirmText':['员工将可以使用所选 CLI 当前登录账号执行界面列出的只读操作。不会导出或复制登录凭据。','Employees may use the selected CLI’s signed-in account for the listed read operations. Login credentials will not be copied or exported.'],
    'cli.saved':['授权已更新，新调用立即生效。','Access updated. New calls use these permissions immediately.'], 'cli.scope':['可调用命令','Allowed commands'],
    'about.title':['关于本程序','About DSH Office'], 'about.description':['像素风多智能体办公室 · DSH / Codex 双引擎','A pixel office for multiple agents · DSH / Codex engines'],
    'about.repo':['GitHub 源码仓库','GitHub repository'], 'about.website':['Planto AI 官网','Planto AI website'], 'about.browser':['链接将在内置浏览器打开','Links open in the built-in browser'],
    'chat.conversation':['项目内对话','Conversation'], 'chat.newConversation':['新建对话','New conversation'], 'chat.references':['引用成果','References'],
    'task.project':['所属项目','Project'], 'task.standalone':['单独任务（建立新项目文件夹）','Standalone task (new project folder)'],
    'task.location':['成果保存位置','Output folder'], 'task.locationConfirm':['确认将本次任务和成果保存到此目录','Save this task and its outputs in this folder'],
    'task.needLocation':['请先确认成果保存位置','Confirm the output folder first'], 'task.planning':['正在准备保存位置…','Preparing the output location…'],
  }
  for (const [key,[zh,en]] of Object.entries(entries)) { I.zh[key]=zh; I.en[key]=en }
})()
