# DSH Office

<p align="center">
  <a href="https://github.com/reymondmeking-dot/dsh-office/releases/download/v1.2.1/dsh-office-promo.mp4">
    <img src="docs/images/promo-preview.gif" alt="DSH Office 宣传片 / promo video" width="720" />
  </a>
  <br />
  <b>▶ <a href="https://github.com/reymondmeking-dot/dsh-office/releases/download/v1.2.1/dsh-office-promo.mp4">观看 40 秒宣传片（带配音）/ Watch the 40-second promo (with sound)</a></b>
</p>

**像素办公室多 Agent 协作桌面应用** — 给 DeepSeek Harness (DSH) 套上一间会动的像素办公室：你给 CEO 派任务，CEO 定目标、HR 招人分工、员工并行干活、HR 审核返工、CEO 验收归档，全部在一间像素风办公室里实时上演。

A pixel-office desktop UI over **DeepSeek Harness (DSH)**. Give the CEO a task; the CEO sets the goal, HR hires a team and schedules the work, employees execute in parallel with HR review/rework loops, and the CEO accepts and archives everything — acted out live in a pixel-art office.

---

## 截图 / Screenshots

**像素办公室：任务全流程实时上演 / The pixel office: the whole pipeline acted out live**

| 中文 | English |
|---|---|
| ![中文办公室界面](docs/images/office-zh.jpg) | ![English office](docs/images/office-en.jpg) |

**项目对话：与 CEO 连续对话，点击成果直接查看 / Project chat: talk to the CEO, click a deliverable to read it**

![项目对话窗口](docs/images/chat-zh.jpg)

**新任务（可拖入附件）/ New task (drag in attachments)**

| 中文 | English |
|---|---|
| ![新建任务-中文](docs/images/task-zh.jpg) | ![New task - English](docs/images/task-en.jpg) |

**设置：服务商、模型果子、思考强度 / Settings: providers, model fruits, thinking effort**

| 中文 | English |
|---|---|
| ![设置-中文](docs/images/settings-zh.jpg) | ![Settings - English](docs/images/settings-en.jpg) |

**服务商编辑：协议、Base URL、每模型输入/输出上限 / Provider editor: protocol, base URL, per-model token limits**

| 中文 | English |
|---|---|
| ![服务商编辑-中文](docs/images/provider-zh.jpg) | ![Provider editor - English](docs/images/provider-en.jpg) |

> 截图使用演示配置（`api.example.com` 假数据），界面内不显示真实 API Key。
> Screenshots use demo data (`api.example.com`); the UI never shows raw API keys.

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

## 扩展中心：插件 / MCP / 技能 / 专家 / Extensions: plugins, MCP, skills & experts

标题栏的 🧩 打开扩展中心，分四页：

- **MCP 服务器**：添加本地命令（stdio）或远程地址（Streamable HTTP）的 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，支持环境变量 / 请求头、超时、单个开关，**测试连接**会真实握手并列出全部工具；也可以直接粘贴 Claude Desktop / Cursor 格式的 `{"mcpServers":{...}}` JSON 批量导入。DSH 模型员工通过 `@deepseek-ai/dsh-mcp-client` 挂载，Codex 员工通过 `codex exec -c mcp_servers.*` 挂载（不读你自己的 Codex 配置），工具名统一为 `mcp__服务器__工具`，在办公室里显示为 🔌。密钥写成 `${GITHUB_TOKEN}` 这类环境变量引用，不会明文写进配置。
- **技能**：技能是一份按需加载的操作手册（`SKILL.md`：`name` + `description` 头部 + 正文），员工平时只看到名字和一句说明，用到时才读全文。可以在界面里新建 / 编辑 / 开关 / 删除，导入现成的技能文件夹（兼容 Claude / Codex 格式，脚本等附带文件一并拷贝），也能查看插件自带的技能并“复制为我的”。自己的技能保存在 `<用户数据>/skills`，同名时优先。每次开工前，已启用的技能会同步到工作区 `.agents/skills`（只替换办公室自己放进去的目录，用 `.office-managed.json` 记录）：DSH 员工通过 `skill` 工具加载，Codex 员工按项目技能发现读取，办公室里显示为 📘 学习技能。
- **专家库**：专家 = 职位 + 核心技能 + 完整工作方法 + 重点使用的 MCP 工具 + 岗位技能。HR 招人时会拿到专家库清单并优先招专家，被招的员工带上专家设定开工，头像弹窗和资料室分工卡会标出专家身份。内置 8 位（调研、文案、数据分析、前端、产品、设计评审、测试、翻译），可新建，也可把内置专家“复制为我的”再改。
- **插件**：插件是一个带 `plugin.json` 的文件夹，可以同时打包 MCP 服务器、专家和技能（`skills/<名字>/SKILL.md`）。内置「办公室专家库」（默认启用）和「常用 MCP 工具包」（fetch / memory / sequential-thinking，默认关闭）；可从文件夹安装、卸载、单独开关插件里的每个 MCP 服务器。同名时自己添加的优先。

Open the 🧩 Extensions center from the title bar:

- **MCP servers**: add local (stdio) or remote (Streamable HTTP) [MCP](https://modelcontextprotocol.io) servers with env vars / headers, timeouts and per-server switches. **Test** performs a real handshake and lists every tool; you can also paste a Claude Desktop / Cursor `{"mcpServers":{...}}` block. DSH-model employees mount them through `@deepseek-ai/dsh-mcp-client`, Codex employees through `codex exec -c mcp_servers.*` (your own Codex config is ignored). Tools are named `mcp__server__tool` and show up as 🔌 in the office. Write secrets as `${GITHUB_TOKEN}`-style env references; they are never stored in plain text.
- **Skills**: a skill is an on-demand playbook (`SKILL.md` with `name` + `description` frontmatter, then the body). Employees see only the name and description and read the full text when it applies. Create, edit, toggle and delete skills in the UI, import existing skill folders (Claude / Codex format; bundled scripts are copied too), or view a plugin skill and "copy as mine". Your skills live in `<userData>/skills` and win on name clashes. Before work starts the enabled skills are synced into the workspace `.agents/skills` (only folders Office put there are replaced, tracked in `.office-managed.json`): DSH employees load them with the `skill` tool, Codex employees through project skill discovery; the office shows 📘 Learning skill.
- **Experts**: an expert is a title, core skills, a full working method, the MCP tools it relies on and its role skills. HR sees the expert library while hiring and prefers experts; hired experts start with their brief, and the agent popup and archive team cards show the badge. Eight are built in (research, copywriting, data analysis, frontend, product, design review, QA, translation); create your own or "copy as mine" to customise.
- **Plugins**: a plugin is a folder with `plugin.json` that bundles MCP servers, experts and skills (`skills/<name>/SKILL.md`). Built-ins: "Office expert library" (on) and "Starter MCP pack" (fetch / memory / sequential-thinking, off). Install from a folder, uninstall, and toggle each bundled MCP server. Your own entries win on name clashes.

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

Offline validation: `node --test scripts/parameters.test.cjs scripts/extensions.test.cjs scripts/test-providers.cjs`. Tests use fixtures and do not call a user's model provider.

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
  plugins/            built-in plugins: office-experts (8 experts + skills), mcp-starter
  preload.cjs         contextIsolation IPC bridge
  renderer/           pixel-office canvas and all UI (index.html, office.js, app.js,
                      sprites.js, i18n.js shared zh/en dictionary)
  harness/            CEO / HR / employee role prompt templates
scripts/              per-platform packaging, icon generator, Linux test Dockerfile
.github/workflows/    release.yml: four-platform build + GitHub Release
```

## License

MIT，见 [LICENSE](LICENSE)。/ MIT, see [LICENSE](LICENSE).
