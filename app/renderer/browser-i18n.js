'use strict'
;(() => {
  const I18N = typeof module === 'object' && module.exports ? require('./i18n.js') : window.I18N
  const messages = {
    'browser.title': ['浏览器','Browser'], 'browser.settings': ['浏览与搜索','Browsing & search'],
    'browser.securityHint': ['员工默认在隐藏会话中浏览。关闭面板仍会继续工作；内网访问默认关闭。','Employees browse in hidden sessions. Closing the panel keeps them working. Private networks are blocked by default.'],
    'browser.searchEngine': ['默认搜索引擎','Default search engine'], 'browser.custom': ['自定义','Custom'],
    'browser.template': ['搜索模板 URL（包含 {q}）','Search URL template (include {q})'],
    'browser.maxPages': ['每次任务页面上限','Pages per task'], 'browser.maxMinutes': ['每次任务时限（分钟）','Task time limit (minutes)'],
    'browser.allowPrivate': ['允许访问内网 / 本地地址（请仅在需要时开启）','Allow private / local network addresses (enable only when needed)'],
    'browser.blacklist': ['域名黑名单（每行一个，包含子域名）','Blocked domains (one per line, includes subdomains)'],
    'browser.tabs': ['浏览器标签页','Browser tabs'], 'browser.new': ['新建标签页','New tab'], 'browser.hide': ['收起浏览器，员工继续工作','Hide browser; employees keep working'],
    'browser.back': ['后退','Back'], 'browser.forward': ['前进','Forward'], 'browser.reload': ['刷新','Reload'], 'browser.address': ['输入网址或搜索内容','Enter a URL or search'],
    'browser.go': ['前往','Go'], 'browser.external': ['系统浏览器','Open externally'], 'browser.takeover': ['接管标签页','Take over tab'],
    'browser.loading': ['页面加载中','Loading page'], 'browser.emptyTitle': ['浏览器已就绪','Your browser is ready'],
    'browser.emptyHint': ['输入网址开始，或选择员工标签页围观工作。','Enter a URL, or select an employee tab to follow their work.'],
    'browser.personal': ['我的会话','Your session'], 'browser.watching': ['只读围观','Watching · read only'], 'browser.owner': ['正在围观：{owner}','Following: {owner}'],
    'browser.untitled': ['新标签页','New tab'], 'browser.download': ['下载：{name}','Download: {name}'], 'browser.error': ['操作失败：{message}','Action failed: {message}'],
    'browser.deny': ['暂不允许','Not now'], 'browser.allow': ['确认','Confirm'], 'browser.saveTitle': ['保存登录密码？','Save this password?'],
    'browser.saveText': ['登录信息只在本机加密保存。员工和模型无法读取密码。','Credentials are encrypted on this computer. Employees and models cannot read the password.'],
    'browser.loginTitle': ['允许员工使用已保存的凭据？','Allow this employee to use saved credentials?'],
    'browser.loginText': ['确认后由主进程直接填入当前站点；员工只会收到操作状态。','After confirmation the main process fills this site directly. The employee receives status only.'],
    'browser.act.search': ['搜索公开资料','Searching public sources'], 'browser.act.open': ['浏览 {site}','Browsing {site}'],
    'browser.act.snapshot': ['读取网页结构','Reading page structure'], 'browser.act.click': ['点击网页元素','Clicking page element'],
    'browser.act.type': ['填写网页表单','Filling web form'], 'browser.act.select': ['选择表单选项','Selecting form option'],
    'browser.act.scroll': ['浏览页面内容','Scrolling page'], 'browser.act.screenshot': ['保存网页截图','Saving page screenshot'],
    'browser.act.read_file': ['读取工作区文件','Reading workspace file'], 'browser.act.login': ['等待登录确认','Waiting for login approval'],
    'vault.title': ['密码管理','Passwords'], 'vault.hint': ['使用系统加密保护，密码不进入员工工具返回值。填充仅用于对应站点。','Protected by OS encryption. Passwords never enter employee tool results. Filling is restricted to the matching site.'],
    'vault.exportHint': ['导出为本机加密备份','Export as an encrypted backup for this computer'], 'vault.export': ['导出备份','Export backup'],
    'vault.empty': ['还没有保存的密码。登录时可选择保存。','No saved passwords yet. Choose Save when you sign in.'],
    'vault.unavailable': ['系统加密不可用，无法保存密码。请检查操作系统密钥服务。','OS encryption is unavailable. Passwords cannot be saved. Check your system key service.'],
    'vault.fill': ['填充','Fill'], 'vault.copy': ['复制密码','Copy password'], 'vault.delete': ['删除','Delete'], 'vault.copied': ['密码已复制到剪贴板','Password copied to clipboard'],
    'vault.deleteTitle': ['删除这条密码？','Delete this password?'], 'vault.deleteText': ['删除后将无法从密码库恢复。','You cannot recover it from this vault after deletion.'],
    'vault.exportTitle': ['导出密码库备份？','Export a vault backup?'], 'vault.exportText': ['备份将保存到工作区 downloads，仍为系统加密密文。','The backup will be saved to workspace downloads, still encrypted by this OS.'],
    'vault.exportAgainTitle': ['再次确认导出','Confirm export again'], 'vault.exportAgainText': ['请妥善保管备份。确认后立即写入文件。','Keep the backup secure. Confirm to write the file now.'],
    'vault.exported': ['备份已保存：{path}','Backup saved: {path}'], 'file.readOnly': ['只读预览','Read only'],
  }
  for (const [key, [zh, en]] of Object.entries(messages)) { I18N.zh[key] = zh; I18N.en[key] = en }
})()
