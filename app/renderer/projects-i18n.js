'use strict'
;(function (root, factory) {
  const I = typeof module === 'object' && module.exports ? require('./i18n.js') : root.I18N
  const messages = factory(I)
  if (typeof module === 'object' && module.exports) module.exports = messages
})(typeof window === 'object' ? window : globalThis, function (I) {
  const messages = {
    'projects.title': ['项目管理','Projects'], 'projects.new': ['新建项目','New project'], 'projects.refresh': ['刷新','Refresh'],
    'projects.search': ['搜索项目名称或文件夹','Search project names or folders'], 'projects.list': ['项目列表','Project list'],
    'projects.emptyTitle': ['从一个项目开始','Start with a project'], 'projects.emptyText': ['为工作确认一个文件夹，再在项目中创建多个独立对话。','Confirm a folder for your work, then create separate conversations within that project.'],
    'projects.noMatch': ['没有匹配的项目','No matching projects'], 'projects.pick': ['选择项目查看对话、成果与文件夹。','Select a project to see conversations, files and its folder.'],
    'projects.folder': ['项目文件夹','Project folder'], 'projects.reveal': ['在文件夹中显示','Show folder'], 'projects.backParent': ['返回所属项目','Back to parent project'],
    'projects.conversations': ['项目对话','Conversations'], 'projects.newConversation': ['新建对话','New conversation'],
    'projects.conversationTitle': ['对话名称','Conversation name'], 'projects.conversationPh': ['例如：第二版方案','For example: revised proposal'],
    'projects.createConversation': ['创建并打开对话','Create and open conversation'], 'projects.openConversation': ['打开对话','Open conversation'],
    'projects.conversationEmpty': ['还没有独立对话。新建一个，保留这一轮工作的上下文。','No separate conversations yet. Create one to keep this round of work together.'],
    'projects.untitledConversation': ['未命名对话','Untitled conversation'], 'projects.conversationCount': ['{n} 个对话','{n} conversations'],
    'projects.references': ['引用已完成项目的成果','Reference completed project outputs'], 'projects.editReferences': ['管理引用','Manage references'],
    'projects.referenceHint': ['所选项目的成果将作为当前对话的参考来源；原文件保留在来源文件夹中。','Selected project outputs become references for this conversation. Original files stay in their source folders.'],
    'projects.referenceEmpty': ['没有其他已完成项目可引用。','No other completed projects are available to reference.'],
    'projects.referenceCount': ['引用 {n} 个项目','{n} project references'], 'projects.referencesFor': ['「{title}」的引用','References for “{title}”'],
    'projects.saveReferences': ['确认并保存引用','Confirm and save references'], 'projects.referencesSaved': ['当前对话的引用已保存。','References saved for this conversation.'],
    'projects.unavailableSource': ['来源已不可用：{id}','Source is unavailable: {id}'], 'projects.removeUnavailable': ['可取消勾选以移除失效引用。','Uncheck to remove an unavailable reference.'],
    'projects.files': ['项目成果','Project files'], 'projects.filesEmpty': ['暂无成果文件。可以在对话中安排工作。','No output files yet. Start work in a conversation.'],
    'projects.tasks': ['项目任务','Project tasks'], 'projects.viewTask': ['查看任务','View task'], 'projects.cancel': ['取消','Cancel'],
    'projects.loading': ['正在读取项目…','Loading projects…'], 'projects.loadFiles': ['正在读取成果…','Loading files…'],
    'projects.error': ['操作失败：{message}','Action failed: {message}'], 'projects.needTitle': ['请填写项目名称。','Enter a project name.'],
    'projects.needConversationTitle': ['请填写对话名称。','Enter a conversation name.'], 'projects.unavailable': ['项目管理接口不可用，请使用最新版本重新打开。','Project management is unavailable. Reopen the latest app version.'],
    'projects.newTitle': ['新建项目 · 确认文件夹','New project · confirm its folder'], 'projects.name': ['项目名称','Project name'],
    'projects.namePh': ['例如：秋季品牌方案','For example: autumn brand plan'], 'projects.pickFolder': ['选择文件夹…','Choose folder…'],
    'projects.folderPh': ['填写名称后自动生成，可修改','Generated after naming; you can edit it'],
    'projects.folderHint': ['文件夹必须位于设置的工作区内。已有项目不会被覆盖。','The folder must be inside your configured workspace. Existing projects will not be overwritten.'],
    'projects.confirmLocation': ['将使用以下实际位置','This exact location will be used'], 'projects.previewPending': ['先填写名称，查看实际保存位置。','Enter a name to preview the exact location.'],
    'projects.checkingFolder': ['正在检查文件夹…','Checking folder…'], 'projects.confirmCreate': ['确认位置并创建','Confirm location and create'],
    'projects.creating': ['正在创建…','Creating…'], 'projects.creatingConversation': ['正在创建对话…','Creating conversation…'],
    'projects.locationChanged': ['实际位置已更新，请核对后再次确认。','The resolved location changed. Review it and confirm again.'],
    'projects.status.done': ['可对话','Ready to chat'], 'projects.status.failed': ['任务失败','Task failed'], 'projects.status.queued': ['排队中','Queued'], 'projects.status.active': ['进行中','In progress'],
    'projects.close': ['关闭项目管理','Close projects'], 'projects.createSuccess': ['项目已创建，文件夹位置已确认。','Project created with its confirmed folder.'],
  }
  for (const [key, [zh, en]] of Object.entries(messages)) { I.zh[key] = zh; I.en[key] = en }
  return messages
})
