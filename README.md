# DeepSeek Harness Desktop

把开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（npm 包 `@deepseek-ai/dsh`）用 **Electron** 封装成 **单个 exe** 的 Windows 桌面应用。
**目标电脑无需安装 Node.js、无需安装 DeepSeek Harness、无需安装 Microsoft Edge**——下载一个文件，双击即用。

## 特性

- **单文件**：`DeepSeek-Harness-Desktop.exe` 内含 Electron 运行时 + dsh 全部依赖（electron-builder `portable` 打包，运行时解压到临时目录）
- **免安装**：不需要 Node / npm / 解压 / Edge，双击即用
- **自带窗口**：内置 Chromium，不再依赖系统 Edge；无地址栏、无标签页、无菜单栏
- **单实例 + 关窗停服务**：重复双击不会开多窗口；关闭窗口自动结束 dsh 后台服务（只结束自己启动的进程，不再用端口扫描 + taskkill 全杀）
- **应用图标**：内嵌 DeepSeek 黑色 Logo，资源管理器 / 桌面快捷方式 / 任务栏 / 开始菜单都能清晰显示
- **自动更新**：GitHub Actions 每天检查上游 `@deepseek-ai/dsh` 新版本，自动打包并发布

## 快速开始（用户）

1. 到 [Releases](../../releases) 下载最新的 **`DeepSeek-Harness-Desktop.exe`**（单个文件）
2. 双击运行
3. 首次启动会自动初始化，几秒后弹出 DeepSeek Harness 应用窗口（`http://127.0.0.1:3080`）

> 首次运行 portable exe 需要解压到临时目录，比已解压版本稍慢属正常现象。
> 真正与 DeepSeek 对话仍需你自己的 API Key 与联网。

## 架构与打包流程

```
npm install @deepseek-ai/dsh    → build\runtime\dsh\...（dsh 及全部依赖）
electron-builder (portable)     → dist\DeepSeek-Harness-Desktop.exe（单文件）
```

- Electron 主进程（`electron/main.js`）负责：
  - 单实例锁（`requestSingleInstanceLock`）
  - 用 Electron 自带 Node 启动 dsh 服务（`ELECTRON_RUN_AS_NODE=1` + `dsh web`），省去单独打包 node.exe
  - 加载 `http://127.0.0.1:3080` 到内置 Chromium 窗口
  - 关窗/退出时结束自己启动的服务进程树（`taskkill /T /F`，只针对自己的 PID）
- 运行时（dsh）放在 `resources\dsh`，保持真实文件以便 Node 加载原生模块（sharp、node-pty、koffi 等）

`dist` 目录结构（electron-builder 产物）：
```
dist/
├─ DeepSeek-Harness-Desktop.exe  # portable 单文件（发布物）
└─ win-unpacked/                 # 未打包目录（本地调试用）
```

## 本地打包（维护者）

需要：**Node.js 24+**。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1 -Version 0.1.0-rc.6
```

- 产物：`dist\DeepSeek-Harness-Desktop.exe`（单文件）
- 换图标：替换 `launcher\icon.ico` 后重新打包即可
- 本地调试：`npm install` 后 `npm run start`（直接跑 Electron 壳）

## 自动发布（GitHub Actions）

`.github/workflows/release.yml` 每天定时（`cron`）并支持手动触发：

1. 读取 npm 上 `@deepseek-ai/dsh` 的 `latest` 版本，已发布则跳过
2. `npm ci` 安装打包工具链（electron + electron-builder）
3. 运行 `package.ps1` 打包单 exe
4. `gh release create` 上传 `DeepSeek-Harness-Desktop.exe`（不打 zip）

发布前请在仓库 `Settings → Actions → General → Workflow permissions` 勾选 **Read and write permissions**。

## 数据与卸载

运行数据（dsh profile、插件、Electron 窗口配置）存放在：
```
%LOCALAPPDATA%\DeepSeek-Harness-Desktop\
```

卸载 = 删除应用目录 + 该数据目录。

## FAQ

- **关窗后服务会残留吗？** 正常关闭会由 Electron 结束自己启动的服务进程树；若被任务管理器强杀导致残留，可用 `netstat -ano | findstr :3080` 查 PID 后 `taskkill /f /pid <PID>`。
- **为什么不是“运行时完全不落盘”？** portable 单文件首次运行会解压到临时目录，这是 Electron 单文件方案的常规取舍（换来体积压缩与更稳定的打包链路）。
- **体积为什么这么大？** 大头是 dsh 全部依赖（约 255MB），加上 Electron 运行时（约 190MB）。
- **支持 mac / Linux 吗？** 当前只打包 Windows x64；Electron 本身跨平台，后续可按需增加 mac/Linux target。

## 许可与声明

- 本项目代码：MIT（见 `LICENSE`）
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 版权归 DeepSeek 所有；本项目是社区打包工具，与 DeepSeek 无隶属关系。再分发上游产物时请遵守其许可。
