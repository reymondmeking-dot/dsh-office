# DSH Office 1.4.0

<p align="center">
  <a href="docs/demo/dsh-office-1.4.0-demo.mp4">
    <img src="docs/demo/dsh-office-1.4.0-preview.gif" alt="DSH Office 1.4.0 界面演示 / UI tour" width="800" />
  </a>
  <br />
  <b>▶ <a href="docs/demo/dsh-office-1.4.0-demo.mp4">观看 1.4.0 界面演示（18 秒，无声）/ Watch the 1.4.0 UI tour (18 seconds, silent)</a></b>
</p>

> 由 6 个真实 1.4.0 界面截图组成（每个 3 秒），使用隔离演示数据；这是无声界面导览，并非一次员工完整任务的连续录像。
>
> Built from six real 1.4.0 UI captures (3 seconds each) with isolated demo data. This is a silent UI tour, not a continuous recording of a complete employee task.

**像素办公室多 Agent 协作桌面应用** — 给 DeepSeek Harness (DSH) 套上一间会动的像素办公室：你给 CEO 派任务，CEO 定目标、HR 招人分工、员工并行干活、HR 审核返工、CEO 验收归档，全部在一间像素风办公室里实时上演。

A pixel-office desktop UI over **DeepSeek Harness (DSH)**. Give the CEO a task; the CEO sets the goal, HR hires a team and schedules the work, employees execute in parallel with HR review/rework loops, and the CEO accepts and archives everything — acted out live in a pixel-art office.

**1.4.0**：[项目与多对话](#项目多对话与成果引用--projects-conversations--references) · [浏览器与文件预览](#浏览器文件预览与本地密码--browser-file-previews--local-passwords) · [本机 CLI 资源](#本机-cli-资源--local-cli-resources)

**1.4.0**: [Projects & conversations](#项目多对话与成果引用--projects-conversations--references) · [Browser & file previews](#浏览器文件预览与本地密码--browser-file-previews--local-passwords) · [Local CLI resources](#本机-cli-资源--local-cli-resources)

<details>
<summary>旧版宣传片 / Earlier promo（40 秒，带配音 / 40 seconds, with sound）</summary>

<p align="center">
  <a href="https://github.com/reymondmeking-dot/dsh-office/releases/download/v1.2.1/dsh-office-promo.mp4">
    <img src="docs/images/promo-preview.gif" alt="旧版 DSH Office 宣传片 / Earlier DSH Office promo" width="720" />
  </a>
  <br />
  <a href="https://github.com/reymondmeking-dot/dsh-office/releases/download/v1.2.1/dsh-office-promo.mp4">观看旧版宣传片 / Watch the earlier promo</a>
</p>

该视频展示较早版本的整体工作流程，界面与 1.4.0 有所不同。
This video shows the overall workflow in an earlier version; its interface differs from 1.4.0.

</details>

---

## 截图 / Screenshots

**双层标题栏与像素办公室 / Two-level title bar & pixel office**

| 中文 | English |
|---|---|
| ![1.4.0 中文办公室界面](docs/images/v1.4.0-office-zh.jpg) | ![1.4.0 English office](docs/images/v1.4.0-office-en.jpg) |

**项目管理：保存位置、独立对话与成果引用 / Projects: save location, separate conversations & references**

| 中文 | English |
|---|---|
| ![1.4.0 项目管理](docs/images/v1.4.0-projects-zh.jpg) | ![1.4.0 project management](docs/images/v1.4.0-projects-en.jpg) |

**项目对话：切换上下文，直接查看成果 / Project chat: switch contexts & open deliverables**

| 中文 | English |
|---|---|
| ![1.4.0 项目对话](docs/images/v1.4.0-chat-zh.jpg) | ![1.4.0 project conversation](docs/images/v1.4.0-chat-en.jpg) |

**文件查看器：在应用内阅读交付物 / File viewer: read deliverables inside the app**

| 中文 | English |
|---|---|
| ![1.4.0 文件查看器](docs/images/v1.4.0-files-zh.jpg) | ![1.4.0 file viewer](docs/images/v1.4.0-files-en.jpg) |

**本机 CLI：一键检测，勾选确认授权 / Local CLIs: detect, select & confirm access**

| 中文 | English |
|---|---|
| ![1.4.0 CLI 资源授权](docs/images/v1.4.0-cli-zh.jpg) | ![1.4.0 CLI resource access](docs/images/v1.4.0-cli-en.jpg) |

> 以上为 1.4.0 的真实界面截图，项目内容使用隔离演示数据。CLI 页仅做本机只读检测，未在演示中授权资源；截图不含密码或 API Key。
>
> These are real 1.4.0 UI captures with isolated demo project content. The CLI screen shows a local read-only detection result; no access was granted for this demo. No password or API key is shown.

---

## 功能 / Features

**中文**

- 🕹️ **像素办公室**：CEO、HR 和员工在办公室里走动、开会、去咖啡机和休息区；任务全流程可视化。
- 🍇 **模型果子**：每个模型是果盘里的一颗水果，拖到员工身上即可换模型。
- 🔑 **服务商管理**：路由 ID + 协议（OpenAI Chat/Responses、Anthropic Messages）+ Base URL + API Key + 模型列表，与 DSH「模型」页完全同构。
- ⚡ **一键拉取并应用**：自动向 `/models` 拉取模型清单，并读取上下文窗口（最大输入）和最大输出 token，保存后立即生效。
- ⇩ **从其他 Agent 一键导入**：扫描本机的 **DSH、Codex、Claude Code、Hermes、opencode、cc-switch** 配置以及 **环境变量 / `.env`**（如 `DEEPSEEK_API_KEY`），勾选即导入并应用。
- 🧠 **思考强度**：按模型能力选择 `reasoningEffort` 档位（off/minimal/low/medium/high/xhigh/max），支持全员默认和单人覆盖；⚡加急模式全员快速冲刺。
- 🗂️ **资料室**：每个完成的项目变成书架上的一本书，可直接预览成果、目标、分工和审核记录。
- 🤖 **Codex CLI 当员工**：直接调用本机已安装并登录的 [Codex CLI](https://github.com/openai/codex)（ChatGPT 账号登录也行，无需 API Key）。「设置 → 服务商」里一键检测，设置里是一张表格：横排是模型，竖列是思考深度，左上角是⚡快速模式开关。滑动某个模型的开关即启用（整列变色并进入果盘，拖给 CEO / HR / 任意员工即可），在某个深度打勾就是它的默认思考深度，改动即时生效；Codex 在项目目录里读写文件、执行命令，多轮对话保持上下文，默认限制在工作区内（Windows 用 elevated 沙箱）。可与 DSH 模型混编同一支团队。
- 💬 **项目对话窗口**：任务完成后自动弹出，左侧与 CEO 连续对话（带上下文，可追问、让他修改或补充成果），右侧是成果列表；**总结和主要成果一点就看**，对话里提到的文件也能直接点开，被 CEO 改过的文件会标「已更新」。对话记录保存在项目里，随时可回来继续。
- 🌏 **中英双语界面**：右上角 `EN/中` 一键切换，即时生效。
- 🧩 **扩展中心：插件、MCP、技能、专家库**（详见下文）。

**English**

- 🕹️ **Pixel office**: CEO, HR and employees walk around, hold meetings, visit the coffee machine and lounge — the whole task pipeline is visualized.
- 🍇 **Model fruits**: every model is a fruit in the tray; drag one onto an employee to switch their model.
- 🔑 **Provider management**: route ID + protocol (OpenAI Chat/Responses, Anthropic Messages) + base URL + API key + model list — identical shape to the DSH Models page.
- ⚡ **Fetch & apply**: one click pulls the `/models` catalogue with context-window (max input) and max-output-token limits, saves and applies immediately.
- ⇩ **One-click agent import**: scans local configs from **DSH, Codex, Claude Code, Hermes, opencode, cc-switch** plus **environment variables / `.env`** (e.g. `DEEPSEEK_API_KEY`); tick and import.
- 🧠 **Thinking effort**: per-model `reasoningEffort` levels (off/minimal/low/medium/high/xhigh/max), with a team default and per-employee override; ⚡ rush mode puts everyone in fast gear.
- 🗂️ **Archive room**: every finished project becomes a book on the shelf, with previewable deliverables, goal, assignments and review history.
- 🤖 **Codex CLI as an employee**: calls the [Codex CLI](https://github.com/openai/codex) already installed and signed in on your machine (ChatGPT login works, no API key needed). Detect it under Settings → Providers, settings show a spreadsheet — models across the top, thinking depth down the left, ⚡ fast-mode switch in the corner. Slide a model on to enable it (its column lights up and it joins the fruit tray; drag it onto the CEO, HR or any employee), tick a depth to make it that model's default; changes apply instantly. Codex reads/writes files and runs commands in the project folder, keeps context across turns, and is confined to the workspace by default (elevated sandbox on Windows). Mix it freely with DSH models in one team.
- 💬 **Project chat window**: pops up when a task finishes. Chat with the CEO with full context (ask follow-ups, have them revise or extend the results) while the right pane lists the deliverables — **click the summary or any main deliverable to read it**, click files mentioned in the conversation, and files the CEO edited are flagged “updated”. Transcripts are saved in the project so you can come back anytime.
- 🌏 **Bilingual UI (Chinese + English)**: switch instantly with the `EN/中` button in the title bar.
- 🧩 **Extensions: plugins, MCP, skills and experts** (see below).

---

## 项目、多对话与成果引用 / Projects, conversations & references

**中文**

- 标题栏「项目管理」按名称或文件夹搜索项目，查看实际保存目录、成果文件、项目任务与对话；「资料室」仍保留原有书架视图。新建项目后即可创建对话，也可以给已有任务项目添加多个对话。
- **创建前确认位置**：输入项目名称后先预览工作区内的实际文件夹，可修改路径或选择现有文件夹；点击「确认位置并创建」才写入项目元数据。创建拒绝工作区外路径、链接 / 目录联接，以及已经有项目元数据的目录；不会覆盖旧项目或清空目录里的其他文件。新建任务也显示并要求确认成果位置，可归属一个已有项目，或作为独立任务保存。
- **每项目多个独立对话**：对话名称、消息历史与引用分别持久化；默认对话兼容旧的聊天记录。切换对话保留各自的上下文，同一项目的对话共享该项目的成果文件夹。当前同项目一次处理一轮回复；尚在排队 / 执行的任务完成后才能继续成果对话。
- **显式引用完成成果**：创建对话时勾选，或在「管理引用」中确认保存。仅可引用其他已完成项目，界面保留来源标题与真实目录；当前对话得到来源摘要和目录作为只读参考。引用关系本身不复制、合并或修改来源文件；新成果仍保存到当前项目。

**English**

- Projects in the title bar searches names / folders and shows the actual directory, output files, project tasks and conversations. Archive room keeps its original bookshelf view. A new project is ready for conversations; existing task projects can also have multiple conversations.
- **Confirm the location before creating**: naming a project previews its exact workspace folder. Edit the path or choose an existing folder, then select Confirm location and create to write metadata. Creation rejects outside-workspace paths, links / junctions and folders with existing project metadata. It neither overwrites an old project nor clears other files in the folder. New tasks also display and require confirmation of their output location, and can belong to an existing project or remain standalone.
- **Separate conversations within each project**: conversation names, messages and references persist independently; the default conversation preserves legacy chat records. Switching conversations keeps their contexts separate while sharing the project's output folder. One reply runs at a time within a project; queued / running tasks must finish before further result conversations.
- **Explicit references to completed outputs**: select sources while creating a conversation, or confirm changes under Manage references. Only other completed projects can be referenced. Source titles and real directories remain visible; the current conversation receives their summaries and directories as read-only references. Creating a reference does not copy, merge or modify source files. New outputs stay in the current project.

---

## 浏览器、文件预览与本地密码 / Browser, file previews & local passwords

**中文**

- **浏览器面板**：标题栏「浏览器」打开标签页、地址栏、前进 / 后退 / 刷新、加载状态与「系统浏览器」入口。非网址输入直接搜索；设置支持 Bing、DuckDuckGo、Google 和包含 `{q}` 的自定义搜索 URL。默认使用 **Bing**。
- **隐藏员工会话**：默认启用的内置 `office-browser` 插件通过现有 MCP 接线同时服务 DSH 和 Codex。每次员工会话拥有独立、非持久化的 Chromium session；任务结束回收。浏览操作在隐藏 WebContents 中进行，打开面板即可围观同一个会话；关闭面板不停止工作。「接管标签页」交还用户操作，并暂停该标签页的员工浏览工具。
- **工作区文件预览**：资料室与交付文件可在应用内打开 Markdown、图片、PDF、HTML，以及只读等宽代码 / 文本。路径先解析 realpath，再检查是否位于 `settings.workspace` 内；越界路径和链接被拒绝。文本预览 / 员工文件读取上限 2 MB，图片、PDF、HTML 预览上限 50 MB。下载存入工作区 `downloads/`，面板显示下载提示。
- **HTML 交付物沙箱**：支持本地同目录资源、内联样式与脚本；不授予 Node、preload 或同源权限。CSP 禁止外网资源、网络 API、嵌套 frame / object 和表单提交；依赖外部 CDN、远程 API 或嵌入页面的交付物不能完整运行。PDF 使用 Chromium 内置查看器。
- **本地密码库**：登录表单提交时询问是否保存；再次访问相同 origin 可一键填充。密码通过 Electron `safeStorage`（Windows 为 DPAPI）加密，`<userData>/vault.json` 只存密文；系统安全存储不可用时拒绝保存。密码管理页支持站点列表、填充、复制、删除与二次确认导出。**导出是供本机系统凭据环境使用的密文备份，不是明文导出或跨电脑迁移功能。**
- **凭据边界**：员工只能请求 `browser_login(origin)`，必须由用户在 Office 界面确认，随后主进程直接填表；模型接口仅返回待确认 / 操作状态。工具返回值递归遮蔽已知密码及常见 URL 编码形式；日志不记录密码。员工截图会遮蔽表单控件、frame 等内容；标签页使用过凭据，或当前 origin 已保存密码时，**不捕捉页面，生成安全占位图并返回 `protected:true`**，因此不能用此工具获取登录页面的完整截图。
- **浏览安全默认值**：内网 / 本地地址默认关闭，`file://` 不开放；可在设置中允许内网，或配置域名黑名单（包含子域名）。员工每次浏览会话默认最多 **20 页、10 分钟**。页面内容属于不可信输入；搜索站点可能返回验证码、限流页或暂时无法解析的结果，工具会明确返回空结果提示。

浏览器仅复用构建所用 **Electron 39.8.5 自带的 Chromium / WebContentsView**。本功能没有新增 npm 依赖、CEF、独立 Chromium 或 Playwright 浏览器下载。用户标签页使用 `persist:office-browser`；远程页面均为 `sandbox:true`、`contextIsolation:true`、`nodeIntegration:false`，不加载 preload。MCP stdio 脚本通过本机回环服务与每次启动随机 token 连接主进程，token 经子进程环境传递。

**English**

- **Browser panel**: open Browser in the title bar for tabs, an address bar, back / forward / reload, loading state and Open externally. Non-URL input becomes a search. Settings offer Bing, DuckDuckGo, Google and a custom search URL containing `{q}`. **Bing** is the default.
- **Hidden employee sessions**: the enabled-by-default `office-browser` plugin uses the existing MCP wiring for both DSH and Codex. Each employee run gets an isolated, non-persistent Chromium session, released when the run ends. Browsing happens in hidden WebContents. Open the panel to follow the same session; hiding it keeps the employee working. Take over tab enables user input and pauses employee browser tools for that tab.
- **Workspace file previews**: open Markdown, images, PDF, HTML and read-only monospace code / text from the archive or deliverables. Paths are resolved with realpath and checked against `settings.workspace`; traversal and escaping links are rejected. Text previews / employee file reads are limited to 2 MB; image, PDF and HTML previews to 50 MB. Downloads go into workspace `downloads/` and appear in the panel.
- **Sandboxed HTML deliverables**: local resources in the document directory, inline styles and scripts are supported, without Node, a preload or same-origin privileges. CSP blocks external resources, network APIs, nested frames / objects and form submission. Deliverables needing a CDN, remote API or embedded page cannot run completely. PDF uses Chromium's built-in viewer.
- **Local password vault**: form submission prompts to save, and the same origin can be filled on a later visit. Electron `safeStorage` (DPAPI on Windows) encrypts the data; `<userData>/vault.json` contains ciphertext only. Saving is refused if OS secure storage is unavailable. Password management lists sites and supports fill, copy, delete and export with two confirmations. **Export is an encrypted backup for the same computer and OS credential environment; it is neither plaintext export nor cross-computer migration.**
- **Credential boundary**: employees can only request `browser_login(origin)`. A user must confirm in Office before the main process fills the form; the model-facing interface returns pending / operation status only. Tool responses recursively redact known passwords and common URL-encoded variants; passwords are not logged. Employee screenshots mask form controls and frames. For a tab that has used credentials, or whose current origin has a saved password, the tool **does not capture the page: it creates a safety placeholder and returns `protected:true`**.
- **Safe browsing defaults**: private / local networks are blocked and `file://` is not exposed. Settings can explicitly permit private networks and configure blocked domains, including subdomains. Each employee browser session defaults to **20 pages and 10 minutes**. Treat page content as untrusted. Search sites may challenge, rate-limit or return markup the parser cannot read; the tool reports an explicit empty-results message.

This feature reuses **Electron 39.8.5's bundled Chromium / WebContentsView**. It adds no npm dependency, CEF, standalone Chromium or Playwright browser download. User tabs use `persist:office-browser`; remote pages run with `sandbox:true`, `contextIsolation:true`, `nodeIntegration:false` and no preload. A dependency-free stdio MCP script connects to a loopback-only main-process service using a fresh startup token passed through the child environment.

工具名称 / Tool names (model-facing prefix: `mcp__office-browser__`):

| 工具 / Tool | 用途 / Purpose |
|---|---|
| `browser_search(query, count?)` | 搜索标题、URL、摘要 / Search titles, URLs and snippets |
| `browser_open(url)` | 打开页面并读取正文 / Open a page and read its text |
| `browser_snapshot()` | 获取精简交互元素与 ref / List concise interactive elements and refs |
| `browser_click(ref)` | 按 ref 点击 / Click by ref |
| `browser_type(ref, text, submit?)` | 填写普通表单 / Fill a regular form field |
| `browser_select(ref, value)` | 选择选项 / Select an option |
| `browser_scroll(dir)` | 向上 / 下滚动 / Scroll up or down |
| `browser_screenshot()` | 保存到项目 browser-shots/ / Save into project browser-shots/ |
| `browser_read_file(path)` | 读取工作区文件 / Read a workspace file |
| `browser_login(origin)` | 请求用户确认后填充凭据 / Request user-approved credential filling |

例如 / Example: `mcp__office-browser__browser_search`. DOM / ref 操作优先；没有可用 DOM 点击方法时才使用 Chromium 输入事件。/ DOM / ref actions take priority; Chromium input events are a fallback when an element has no usable DOM click method.

---

## 本机 CLI 资源 / Local CLI resources

**中文**

设置中的「本机 CLI 资源」支持一键检测 **GitHub CLI** 与 **TapTap CLI**。列表区分未安装、未登录、可授权与尚未联网核验的凭据状态，并可展开查看命令范围。资源**默认不授权**；只有勾选并点击「确认所选授权」、完成界面确认后，员工才可复用对应 CLI 当前账号的登录会话。取消勾选并确认保存后，后续调用立即使用新授权，无需重启；这不会注销 CLI 自身账号。

GitHub 检测调用 CLI 的 `gh auth status --json hosts`，使用其真实账号核验结果。TapTap 使用 `auth status --offline --json`；`credentials-present` 仅表示存在尚未过期的本地登录凭据，**不表示已验证联网服务可用**。首次实际读取仍可能因账号、网络或服务权限失败。Office 不打开、复制或导出 CLI 的登录凭据文件，状态列表也不返回 token。

内置 `office-cli` MCP 插件同时挂到 DSH / Codex，提供 `mcp__office-cli__cli_list_resources` 与 `mcp__office-cli__cli_call`。前者只列用户已授权的资源；后者接收资源 ID 和参数数组。范围限于界面列出的只读命令，例如 GitHub 仓库、issue、PR 的查看 / 列表 / 搜索，以及 TapTap overview、开发者 / 应用列表和应用资料读取。TapTap 执行前还检查对应命令帮助中的 `Risk: read`。不开放任意 shell、`gh api`、登录 / token / 配置读取、写入、发布、合并、文件输入或自定义端点；输出有超时、大小上限和凭据形态遮蔽。没有安装的 CLI 不会被自动下载。

**English**

Settings → Local CLI resources detects **GitHub CLI** and **TapTap CLI**. The list distinguishes missing installations, signed-out sessions, usable accounts and credentials not checked online; expand a row to inspect its command scope. Resources are **not authorized by default**. Employees can reuse a CLI's current session only after the user selects it, chooses Confirm selected access and confirms in the UI. Uncheck and confirm to revoke access for subsequent calls immediately, without restarting or signing out the CLI itself.

GitHub detection runs `gh auth status --json hosts` and uses the CLI's real account-check result. TapTap runs `auth status --offline --json`: `credentials-present` means a saved, unexpired local credential, **not verified online service availability**. A later read can still fail because of account, network or service permissions. Office does not open, copy or export CLI credential files, and the status list does not return tokens.

The built-in `office-cli` MCP plugin connects to both DSH and Codex with `mcp__office-cli__cli_list_resources` and `mcp__office-cli__cli_call`. The former lists only user-authorized resources; the latter takes a resource ID and an argument array. Access is restricted to the displayed read allowlist: GitHub repository / issue / PR views, lists and searches, and TapTap overview, developer / app lists and app-information reads. TapTap command help must also declare `Risk: read` before execution. Arbitrary shells, `gh api`, auth / token / configuration reads, writes, publishing, merging, file inputs and custom endpoints are not exposed. Results are bounded by time / size limits and redact credential-shaped values. Missing CLIs are not downloaded automatically.

## 关于 1.4.0 / About 1.4.0

「设置 → 关于本程序」显示版本 **1.4.0**，并提供 [GitHub 源码仓库](https://github.com/reymondmeking-dot/dsh-office) 与 [Planto AI 官网](https://planto-ai.com/)；链接在内置浏览器中打开。

Settings → About DSH Office shows version **1.4.0** and links to the [GitHub repository](https://github.com/reymondmeking-dot/dsh-office) and [Planto AI website](https://planto-ai.com/), opening in the built-in browser.

---

## 扩展中心：插件 / MCP / 技能 / 专家 / Extensions: plugins, MCP, skills & experts

标题栏的 🧩 打开扩展中心，分四页：

- **MCP 服务器**：添加本地命令（stdio）或远程地址（Streamable HTTP）的 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，支持环境变量 / 请求头、超时、单个开关，**测试连接**会真实握手并列出全部工具；也可以直接粘贴 Claude Desktop / Cursor 格式的 `{"mcpServers":{...}}` JSON 批量导入。DSH 模型员工通过 `@deepseek-ai/dsh-mcp-client` 挂载，Codex 员工通过 `codex exec -c mcp_servers.*` 挂载（不读你自己的 Codex 配置），工具名统一为 `mcp__服务器__工具`，在办公室里显示为 🔌。密钥写成 `${GITHUB_TOKEN}` 这类环境变量引用，不会明文写进配置。
- **技能**：技能是一份按需加载的操作手册（`SKILL.md`：`name` + `description` 头部 + 正文），员工平时只看到名字和一句说明，用到时才读全文。可以在界面里新建 / 编辑 / 开关 / 删除，导入现成的技能文件夹（兼容 Claude / Codex 格式，脚本等附带文件一并拷贝），也能查看插件自带的技能并“复制为我的”。自己的技能保存在 `<用户数据>/skills`，同名时优先。每次开工前，已启用的技能会同步到工作区 `.agents/skills`（只替换办公室自己放进去的目录，用 `.office-managed.json` 记录）：DSH 员工通过 `skill` 工具加载，Codex 员工按项目技能发现读取，办公室里显示为 📘 学习技能。
- **专家库**：专家 = 职位 + 核心技能 + 完整工作方法 + 重点使用的 MCP 工具 + 岗位技能。HR 招人时会拿到专家库清单并优先招专家，被招的员工带上专家设定开工，头像弹窗和资料室分工卡会标出专家身份。内置 8 位（调研、文案、数据分析、前端、产品、设计评审、测试、翻译），可新建，也可把内置专家“复制为我的”再改。
- **插件**：插件是一个带 `plugin.json` 的文件夹，可以同时打包 MCP 服务器、专家和技能（`skills/<名字>/SKILL.md`）。内置「办公室专家库」「办公室浏览器」与「本机 CLI 资源」（插件默认启用，CLI 资源仍须逐项授权），以及「常用 MCP 工具包」（fetch / memory / sequential-thinking，默认关闭）；可从文件夹安装、卸载、单独开关插件里的每个 MCP 服务器。同名时自己添加的优先。

Open the 🧩 Extensions center from the title bar:

- **MCP servers**: add local (stdio) or remote (Streamable HTTP) [MCP](https://modelcontextprotocol.io) servers with env vars / headers, timeouts and per-server switches. **Test** performs a real handshake and lists every tool; you can also paste a Claude Desktop / Cursor `{"mcpServers":{...}}` block. DSH-model employees mount them through `@deepseek-ai/dsh-mcp-client`, Codex employees through `codex exec -c mcp_servers.*` (your own Codex config is ignored). Tools are named `mcp__server__tool` and show up as 🔌 in the office. Write secrets as `${GITHUB_TOKEN}`-style env references; they are never stored in plain text.
- **Skills**: a skill is an on-demand playbook (`SKILL.md` with `name` + `description` frontmatter, then the body). Employees see only the name and description and read the full text when it applies. Create, edit, toggle and delete skills in the UI, import existing skill folders (Claude / Codex format; bundled scripts are copied too), or view a plugin skill and "copy as mine". Your skills live in `<userData>/skills` and win on name clashes. Before work starts the enabled skills are synced into the workspace `.agents/skills` (only folders Office put there are replaced, tracked in `.office-managed.json`): DSH employees load them with the `skill` tool, Codex employees through project skill discovery; the office shows 📘 Learning skill.
- **Experts**: an expert is a title, core skills, a full working method, the MCP tools it relies on and its role skills. HR sees the expert library while hiring and prefers experts; hired experts start with their brief, and the agent popup and archive team cards show the badge. Eight are built in (research, copywriting, data analysis, frontend, product, design review, QA, translation); create your own or "copy as mine" to customise.
- **Plugins**: a plugin is a folder with `plugin.json` that bundles MCP servers, experts and skills (`skills/<name>/SKILL.md`). Built-ins: "Office expert library", "Office browser" and "Local CLI resources" (plugins on; individual CLI resources require explicit grants), plus "Starter MCP pack" (fetch / memory / sequential-thinking, off). Install from a folder, uninstall, and toggle each bundled MCP server. Your own entries win on name clashes.

```json
{
  "id": "my-pack", "name": {"zh": "我的插件", "en": "My pack"}, "version": "1.0.0",
  "mcpServers": [{"name": "github", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"}}],
  "experts": [{"id": "seo", "title": {"zh": "SEO 专家", "en": "SEO expert"}, "skills": "keywords, on-page", "prompt": "You are ...", "mcp": ["github"], "skillset": ["seo-checklist"]}],
  "skills": "skills"
}
```

## 上下文、输出与压缩 / Context, output & compaction

在 **设置 → 上下文与压缩** 中调整整个 Office 的自动压缩策略，包括触发比例、额外预留、摘要输出上限、近期原文保留比例、压缩重试、溢出恢复，以及可选的摘要服务商和模型。每个模型的实际触发量会实时显示；保存前会检查窗口、输出、预留和已知模型能力，项目运行期间会拒绝保存设置。

在 **设置 → 模型 → 编辑服务商** 中，可分别调整每个模型的上下文窗口、单次输出上限、模型最大输出能力、思考档位和图片输入。**检测连接与参数** 会发送一条短测试消息，并尝试获取该模型的参数；优先使用服务商返回的数据，再参考精确匹配的本地模型目录或现有配置，并显示来源和检测时间。模型列表不可用不会把成功的连接判成失败。通断测试不验证最大 token 容量，未返回的参数会标明未知；手动值可保留，读取到的声明能力上限不能通过提高请求预算绕过。

| 参数 | 20 万 token 窗口的建议示例 |
|---|---:|
| 单次输出预算 | 32,768，且不超过已知输出能力 |
| 压缩目标比例 | 80% |
| 额外预留 | 8,192 |
| 摘要输出上限 | 8,192 |
| 近期原文保留比例 | 扣除输出后窗口的 16% |
| 压缩额外尝试 / 溢出恢复 | 1 / 1 |

实际触发量是 `min(窗口 × 触发比例, 窗口 − 单次输出预算 − 额外预留)`。以上示例为 **159,040 token（79.5%）**。建议按配置窗口缩放，并受已知模型输出能力约束；这不是对任何模型真实容量的承诺。旧版本未设置单次输出预算时，会在启动时迁移为明确的建议预算。加急模型有独立模型条目时使用其自己的窗口、输出、思考与图片参数；未独立添加时沿用原模型配置。摘要预算预检按实际触发量估算，单次大量工具结果跨过阈值时仍由 DSH 的运行时溢出恢复处理。

**English:** Under **Settings → Context & compaction**, edit the Office-wide policy and inspect each model's effective trigger. Under a provider's model editor, edit its shared context window, request output budget, declared output capability, reasoning levels, and image support. **Test connection & read limits** probes connectivity and reads exact-model metadata, preferring provider data over a matching local catalog or saved configuration. Missing metadata stays unknown; a successful short probe does not verify maximum capacity. Recommendations scale with the configured window and known output capability. Saving validates budgets in both the renderer and main process. Office writes a final runtime overlay so global Harness defaults cannot silently override the choices saved here.

离线回归 / Offline regression:

```powershell
node --test scripts/parameters.test.cjs scripts/extensions.test.cjs scripts/test-providers.cjs scripts/office-browser.test.cjs scripts/browser-backend.test.cjs scripts/projects.test.cjs scripts/cli-resources.test.cjs
```

使用 fixtures 验证现有参数、扩展、服务商，以及密码库加密与拒绝明文后端、工作区越界 / 链接、URL 策略、搜索解析、MCP schema / 连接 / 双引擎接线、密码脱敏、项目目录确认与拒覆盖、独立对话 / 来源引用、CLI 只读参数与授权撤销；不调用真实模型服务商。/ Fixture-based tests cover existing parameters, extensions and providers, vault encryption and refusal of plaintext backends, workspace traversal / links, URL policy, search parsing, MCP schemas / connection / dual-engine wiring, secret redaction, project location confirmation / overwrite refusal, separate conversations / source references, and CLI read-only arguments / authorization revocation. They do not call a live model provider.

本地无头验收使用独立用户目录、调试端口和 `DSH_OFFICE_HEADLESS=1`；临时 `DSH_HOME` 初始化时仅复制 `.credentials.yaml`，Codex 使用独立 `CODEX_HOME`。不要用真实用户数据目录运行开发验证。/ Headless acceptance uses an isolated user-data directory, a debugging port and `DSH_OFFICE_HEADLESS=1`. The temporary `DSH_HOME` initially contains only a copy of `.credentials.yaml`, and Codex gets its own `CODEX_HOME`. Do not run development checks against the real user-data directory.

```powershell
# 本地验收脚本 / Local acceptance scripts (Node.js 22+)
node tmp/browser-e2e.mjs dsh
node tmp/browser-e2e.mjs codex
```

该本地脚本需要打包后的 exe、已有模型测试配置 `tmp/en-demo-profile/settings.json` 和可用凭据副本；会真实调用模型与公开站点。它断言员工经 MCP 调用 search / open / screenshot、项目截图存在、交付文件包含真实来源 URL。每次运行将结果写入 `tmp/browser-e2e-<engine>-<timestamp>/evidence.json`，最新结果在 `tmp/browser-e2e-<engine>-latest.json`。运行状态以这些证据文件为准。界面对比截图位于 `tmp/ui-shots/before/` 和 `tmp/ui-shots/after/`，覆盖中英文及 1280×800 / 1500×960；这些是开发验收产物，不是应用运行时依赖。

The local script requires the packaged exe, an existing model fixture at `tmp/en-demo-profile/settings.json` and credential copies; it makes live model and public-web requests. It asserts MCP search / open / screenshot calls, a project screenshot and a real source URL in the deliverable. Each run writes `tmp/browser-e2e-<engine>-<timestamp>/evidence.json`, with a latest-result pointer at `tmp/browser-e2e-<engine>-latest.json`; use those files as the source of truth for pass / fail status. UI comparisons are under `tmp/ui-shots/before/` and `tmp/ui-shots/after/`, covering Chinese / English at 1280×800 and 1500×960. These are development artifacts, not runtime dependencies.

## 运行前提 / Requirements

**中文**

- Windows 10/11 (x64)、Linux (x64) 或 macOS（Apple Silicon / Intel）。
- 一份可用的 **DeepSeek Harness** 源码目录（需要其中的 `apps/cli/lib/bin.js` 及 `yaml` 等依赖）。默认查找位置：
  - Windows：`D:\deepseek-harness`
  - Linux/macOS：`/opt/deepseek-harness`、`~/deepseek-harness`，也可在「设置 → DSH 源码目录」里手动指定。
- `node` 在 PATH 上（用于拉起 DSH 运行时）。
- 至少一个 OpenAI / Anthropic 兼容的模型服务商和 API Key，或直接使用一键导入。

**English**

- Windows 10/11 (x64), Linux (x64), or macOS (Apple Silicon / Intel).
- A working **DeepSeek Harness** checkout (it provides `apps/cli/lib/bin.js` and the `yaml` dependency). Default search paths:
  - Windows: `D:\deepseek-harness`
  - Linux/macOS: `/opt/deepseek-harness`, `~/deepseek-harness`, or set it manually under **Settings → DSH source directory**.
- `node` on PATH (used to spawn the DSH runtime).
- At least one OpenAI/Anthropic-compatible provider with an API key — or just use the one-click importer.

---

## 下载安装 / Install

预编译包见 [Releases](https://github.com/reymondmeking-dot/dsh-office/releases)（Windows、Linux、macOS arm64/x64）。
Prebuilt packages are on the [Releases](https://github.com/reymondmeking-dot/dsh-office/releases) page (Windows, Linux, macOS arm64/x64).

### Windows

下载 `DSH-Office-windows-x64.zip`，解压后运行 `DSH Office.exe`（本地运行 `scripts/build.ps1` 还会创建桌面和开始菜单快捷方式）。

Download `DSH-Office-windows-x64.zip`, unzip, and run `DSH Office.exe` (building locally via `scripts/build.ps1` also creates Desktop/Start-Menu shortcuts).

### Linux

```bash
tar -xzf dsh-office-linux-x64.tar.gz
cd dsh-office-linux-x64
./install.sh            # 安装到 ~/Applications 并创建 .desktop / installs to ~/Applications + .desktop
# 或直接运行 / or run directly: ./"DSH Office.sh"
```

Debian/Ubuntu 运行时依赖 / runtime libraries:

```bash
sudo apt install libgtk-3-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpango-1.0-0 libcairo2
```

### macOS

- Apple Silicon（M 系列）→ `DSH-Office-macos-arm64.zip`
- Intel → `DSH-Office-macos-x64.zip`

解压后把 `DSH Office.app` 拖到「应用程序」。本应用没有 Apple Developer 签名（ad-hoc 临时签名），首次启动请**右键 → 打开 → 打开**；如仍被 Gatekeeper 拦截：

Unzip, drag `DSH Office.app` to Applications. The app is **ad-hoc signed (no Apple Developer ID)** — first launch via **right-click → Open → Open**; if Gatekeeper still blocks it:

```bash
xattr -dr com.apple.quarantine "/Applications/DSH Office.app"
```

---

## 使用 / Quick start

1. 打开应用，点右上角 **⚙️ 设置**。
2. 点 **⇩ 从 Agent 一键导入**，勾选扫描到的服务商，导入即自动应用；或点 **＋ 添加服务商** 手动填写，再用 **⚡ 一键拉取并应用**。
3. 点 **＋ 新任务**，写标题和描述（可拖入附件/文件夹），提交。
4. 看 CEO 定目标、HR 开工会招人、员工交付审核，完成后去 **📚 资料室** 翻书。

1. Open the app and click **⚙️ Settings**.
2. Click **⇩ One-click import from agents**, tick the found providers and import; or **＋ Add provider** manually, then **⚡ Fetch & apply**.
3. Click **＋ New task**, fill in the title and brief (drag files/folders in as attachments), submit.
4. Watch the CEO set goals, HR run kickoff and hire, employees deliver and get reviewed; finished projects land in the **📚 Archive room**.

---

## 密钥与隐私 / Keys & privacy

**中文**

- API Key 只写入 DSH 标准凭据文件 `~/.dsh/.credentials.yaml`（权限 0600），界面只显示打码（`••••1234`）。
- 一键导入时，原始密钥始终留在 Electron 主进程，不经过渲染界面，也不会写进项目文件或日志。
- 项目文件默认在 `~/Documents/DSH Office/projects/`，每个项目一个文件夹（附件复制到其 `附件/` 子目录）。
- 删除服务商不会删除凭据文件里的 Key。

**English**

- API keys are written only to the standard DSH credential file `~/.dsh/.credentials.yaml` (mode 0600); the UI only ever shows masks like `••••1234`.
- During import, raw keys stay inside the Electron main process and never cross into the renderer, projects, or logs.
- Projects live under `~/Documents/DSH Office/projects/`, one folder per project (attachments are copied into its attachments subfolder).
- Deleting a provider does not delete its key from the credential file.

---

## 从源码构建 / Build from source

需要 Node.js 18+；构建脚本会自动下载 Electron 39.8.5 预编译包。/ Requires Node.js 18+; the scripts download Electron 39.8.5 automatically.

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
# -> dist/DSH Office/DSH Office.exe
```

```bash
# Linux
bash scripts/build-linux.sh          # -> dist/dsh-office-linux-x64.tar.gz

# macOS（在对应架构的机器上运行 / run natively on matching hardware）
bash scripts/build-macos.sh arm64    # -> dist/DSH-Office-macos-arm64.zip
bash scripts/build-macos.sh x64      # -> dist/DSH-Office-macos-x64.zip
```

推一个 `v*` tag 会触发 GitHub Actions，在 Windows / Ubuntu / macOS arm64 / macOS x64 四种 runner 上出包并发布 Release。

Pushing a `v*` tag triggers GitHub Actions which builds all four packages (Windows, Linux, macOS arm64, macOS x64) and publishes a Release.

---

## 项目结构 / Project layout

```
app/
  main.cjs            Electron main: window, settings, CEO→HR→employee orchestration
  runtime.cjs         DSH CLI subprocess pool + office profile writer
  codex.cjs           Codex CLI engine: detect, model catalogue, `codex exec --json` runtime
  providers.cjs       credentials, /models discovery, model test, DSH config reads
  agents.cjs          scanner for Codex/Claude/Hermes/opencode/cc-switch/env configs
  extensions.cjs      plugins, MCP servers (DSH + Codex wiring, connection test), experts, skills
  browser.cjs         hidden WebContents sessions, loopback MCP bridge, file previews
  browser-policy.cjs  workspace realpath checks, network policy, search parsing, redaction
  vault.cjs           safeStorage ciphertext-only password store
  projects.cjs        confirmed project folders, conversation persistence and source references
  cli-resources.cjs   native CLI detection, explicit grants and read-only argv allowlists
  plugins/            built-ins: office-browser, office-cli, office-experts (8 experts + skills), mcp-starter
  preload.cjs         contextIsolation IPC bridge
  renderer/           pixel-office canvas and all UI (index.html, office.js, app.js,
                      sprites.js, i18n.js shared zh/en dictionary, browser.js / browser.css,
                      browser-i18n.js, projects.js / projects.css / projects-i18n.js,
                      resources.js / resources.css / resources-i18n.js, titlebar.js, accessibility.js)
  harness/            CEO / HR / employee role prompt templates
scripts/              per-platform packaging, icon generator, Linux test Dockerfile
.github/workflows/    release.yml: four-platform build + GitHub Release
```

## License

MIT，见 [LICENSE](LICENSE)。/ MIT, see [LICENSE](LICENSE).
