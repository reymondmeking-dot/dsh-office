# DSH Office 1.4.0 UI tour

[MP4](dsh-office-1.4.0-demo.mp4) · [Looping GIF](dsh-office-1.4.0-preview.gif) · [File hashes](manifest.json)

18 秒无声导览：6 个真实界面截图各停留 3 秒，展示中文办公室、项目管理、独立对话、Markdown 文件预览、CLI 资源检测和英文办公室。它展示产品界面，不代表一次员工任务的连续录像。

An 18-second silent tour made from six real UI captures, each held for three seconds: Chinese office, projects, a separate conversation, Markdown preview, CLI detection, and English office. It presents the product UI rather than a continuous employee-task recording.

项目、对话与文件使用隔离演示数据。CLI 登录状态由本机 CLI 只读检测；没有授权调用业务资源，也未展示凭据。捕获使用现有 Electron 应用的隐藏窗口、隔离的 `userData` / `DSH_HOME` / `CODEX_HOME` 和 CDP；没有额外浏览器下载。旧版配音宣传片仍单独保留在主 README 的折叠区。

Projects, conversations and files use isolated demo data. CLI sign-in status comes from read-only local CLI detection; no business-resource access is granted and no credentials are shown. Capture uses the existing Electron app, a hidden window, isolated `userData` / `DSH_HOME` / `CODEX_HOME`, and CDP, without an extra browser download. The earlier narrated promo remains separately labeled in the main README.

重新生成 / Regenerate on the configured Windows development machine:

```powershell
node scripts/record-readme-demo.mjs
```

Requires the built `dist/DSH Office/DSH Office.exe`, Node.js and FFmpeg. The script creates a new isolated working folder under `D:\AI\`, captures ten bilingual JPEGs for the main README, and writes the MP4, GIF and checksum manifest here. It does not run a model task or use the real DSH/Codex configuration homes.
