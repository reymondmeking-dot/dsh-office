# DSH Office 1.4.0 UI tour

[MP4](dsh-office-1.4.0-demo.mp4) · [Looping GIF (highlight)](dsh-office-1.4.0-preview.gif) · [File hashes](manifest.json)

30 秒导览（1280×720，背景音乐与音效）：标题 → 办公室 → 项目管理 → 独立对话与跨项目引用 → 内置浏览器（真实打开的 IANA 公开页面）→ 密码管理 → Markdown 预览 → 技能 / MCP / 本机 CLI → 英文界面 → 结尾。画面全部是真实界面截图，叠加镜头推近、高亮框和中英字幕；它展示产品界面，不代表一次员工任务的连续录像。GIF 为其中 13 秒精华片段。

A 30-second tour (1280×720, music and SFX): title, office, projects, a separate conversation with references, the built-in browser on a real public IANA page, the password vault, Markdown preview, skills / MCP / local CLI, English UI, end card. Every frame is a real UI capture with camera moves, highlights and bilingual captions; it presents the product UI rather than a continuous employee-task recording. The GIF is a 13-second highlight.

项目、对话与文件使用隔离演示数据。CLI 登录状态由本机 CLI 只读检测；没有授权调用业务资源，也未展示凭据。捕获使用现有 Electron 应用的隐藏窗口、隔离的 `userData` / `DSH_HOME` / `CODEX_HOME` 和 CDP；没有额外浏览器下载。旧版配音宣传片仍单独保留在主 README 的折叠区。

Projects, conversations and files use isolated demo data. CLI sign-in status comes from read-only local CLI detection; no business-resource access is granted and no credentials are shown. Capture uses the existing Electron app, a hidden window, isolated `userData` / `DSH_HOME` / `CODEX_HOME`, and CDP, without an extra browser download. The earlier narrated promo remains separately labeled in the main README.

重新生成 / Regenerate on the configured Windows development machine:

```powershell
node scripts/record-readme-demo.mjs
```

Requires the built `dist/DSH Office/DSH Office.exe`, Node.js and FFmpeg. The script creates a new isolated working folder under `D:\AI\`, captures ten bilingual JPEGs for the main README, and writes the MP4, GIF and checksum manifest here. It does not run a model task or use the real DSH/Codex configuration homes.

注意 / Note: 当前 MP4 / GIF 是在同一套隔离数据的新一轮无头截图上，用 HyperFrames 合成的（工程在本地，未提交）。上面的脚本只重新生成旧版纯截图导览和 README 截图；直接运行会覆盖这里的视频。 The current MP4 / GIF were composed with HyperFrames from a fresh headless capture of the same isolated fixture (local project, not committed). The script above regenerates the earlier plain screenshot tour and the README screenshots, and running it overwrites the video here.
