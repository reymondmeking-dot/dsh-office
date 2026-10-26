# DSH Office 1.4.0 UI tour

[English MP4](dsh-office-1.4.0-demo.mp4) · [中文 MP4](dsh-office-1.4.0-demo-zh.mp4) · [Looping GIF (highlight)](dsh-office-1.4.0-preview.gif) · [File hashes](manifest.json)

两个版本，画面结构相同（1280×720，配音 + 配乐 + 音效）：英文版 39 秒，英文界面与英文字幕；中文版 45 秒，中文界面与中文字幕。顺序：标题 → 办公室 → 项目管理 → 跨项目引用 → 内置浏览器（真实打开的 IANA 公开页面）→ 密码管理 → Markdown 预览 → 技能 / MCP / 本机 CLI → 结尾。画面全部是真实界面截图，叠加镜头推近和高亮框；它展示产品界面，不代表一次员工任务的连续录像。GIF 为英文版中 16 秒精华片段（无声）。

Two cuts with the same structure (1280×720, narration, music and SFX): English, 39 s, English UI and captions; Chinese, 45 s, Chinese UI and captions. Order: title, office, projects, cross-project references, the built-in browser on a real public IANA page, password vault, Markdown preview, skills / MCP / local CLI, end card. Every frame is a real UI capture with camera moves and highlights; it presents the product UI rather than a continuous employee-task recording. The GIF is a silent 16-second highlight of the English cut.

配音为本地 Kokoro 语音合成（英文 af_heart，中文 zf_xiaobei），配乐为本地 MusicGen（facebook/musicgen-stereo-medium）生成的器乐，音效来自 HyperFrames 自带素材；均为本机生成，未使用付费服务。

Narration is local Kokoro TTS (af_heart for English, zf_xiaobei for Chinese); music is an instrumental generated locally with MusicGen (facebook/musicgen-stereo-medium); SFX come from the HyperFrames bundled library. Everything was generated on this machine without paid services.

项目、对话与文件使用隔离演示数据。CLI 登录状态由本机 CLI 只读检测；没有授权调用业务资源，也未展示凭据。捕获使用现有 Electron 应用的隐藏窗口、隔离的 `userData` / `DSH_HOME` / `CODEX_HOME` 和 CDP；没有额外浏览器下载。旧版配音宣传片仍单独保留在主 README 的折叠区。

Projects, conversations and files use isolated demo data. CLI sign-in status comes from read-only local CLI detection; no business-resource access is granted and no credentials are shown. Capture uses the existing Electron app, a hidden window, isolated `userData` / `DSH_HOME` / `CODEX_HOME`, and CDP, without an extra browser download. The earlier narrated promo remains separately labeled in the main README.

重新生成截图 / Regenerate the screenshots on the configured Windows development machine:

```powershell
node scripts/record-readme-demo.mjs
```

Requires the built `dist/DSH Office/DSH Office.exe`, Node.js and FFmpeg. The script creates a new isolated working folder under `D:\AI\`, captures ten bilingual JPEGs for the main README, and writes a plain screenshot-tour MP4, GIF and checksum manifest here. It does not run a model task or use the real DSH/Codex configuration homes.

注意 / Note: 当前视频是在同一套隔离数据的新一轮无头截图上，用 HyperFrames 合成的（工程在本地，未提交）。直接运行上面的脚本会用旧版纯截图导览覆盖这里的视频。 The current videos were composed with HyperFrames from a fresh headless capture of the same isolated fixture (local project, not committed). Running the script above overwrites them with the earlier plain screenshot tour.
