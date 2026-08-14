# DeepSeek Harness Desktop

把开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（npm 包 `@deepseek-ai/dsh`）用 **Electron** 封装成 Windows 桌面应用的**安装版（NSIS setup）**。
**目标电脑无需安装 Node.js、无需安装 DeepSeek Harness、无需安装 Microsoft Edge**——下载一个 Setup.exe，安装即用。

## 特性

- **安装版单文件**：发布物只有一个 `DeepSeek-Harness-Desktop-Setup.exe`，内含 Electron 运行时 + dsh 全部依赖
- **可自定义安装路径**：向导式安装，可自选目录；默认装到当前用户目录（无需管理员权限）
- **启动快**：安装时解压一次，之后每次启动约 2~3 秒（不用像便携版那样每次自解压）
- **自带快捷方式与卸载程序**：自动创建开始菜单/桌面快捷方式；卸载用自带的卸载程序（或控制面板），自动清理安装目录、快捷方式与注册表，不留垃圾
- **自带窗口**：内置 Chromium，不依赖系统 Edge；无地址栏、无标签页、无菜单栏
- **单实例 + 关窗停服务**：重复启动不会开多窗口；关闭窗口自动结束 dsh 后台服务（只结束自己启动的进程，不再用端口扫描 + taskkill 全杀）
- **应用图标**：内嵌 DeepSeek 黑色 Logo，资源管理器 / 桌面快捷方式 / 任务栏 / 开始菜单都能清晰显示
- **自动更新**：GitHub Actions 每天检查上游 `@deepseek-ai/dsh` 新版本，自动打包并发布

## 快速开始（用户）

1. 到 [Releases](../../releases) 下载最新的 **`DeepSeek-Harness-Desktop-Setup.exe`**（单个文件）
2. 双击运行，按向导完成安装（可自定义安装路径）
3. 安装完成后自动打开应用；以后从开始菜单或桌面快捷方式启动即可

> 真正与 DeepSeek 对话仍需你自己的 API Key 与联网。

## 架构与打包流程

```
npm install @deepseek-ai/dsh    → build\runtime\dsh\...（dsh 及全部依赖）
electron-builder (nsis)         → dist\DeepSeek-Harness-Desktop-Setup.exe（安装版）
```

- Electron 主进程（`electron/main.js`）负责：
  - 单实例锁（`requestSingleInstanceLock`）
  - 用 Electron 自带 Node 启动 dsh 服务（`ELECTRON_RUN_AS_NODE=1` + `dsh web`），省去单独打包 node.exe
  - 加载 `http://127.0.0.1:3080` 到内置 Chromium 窗口
  - 关窗/退出时结束自己启动的服务进程树（`taskkill /T /F`，只针对自己的 PID）
- 运行时（dsh）放在安装目录的 `resources\dsh`，保持真实文件以便 Node 加载原生模块（sharp、node-pty、koffi 等）

`dist` 目录结构（electron-builder 产物）：
```
dist/
├─ DeepSeek-Harness-Desktop-Setup.exe  # NSIS 安装版（发布物）
└─ win-unpacked/                       # 未打包目录（本地调试用）
```

## 本地打包（维护者）

需要：**Node.js 24+**。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1 -Version 0.1.0-rc.6
```

- 产物：`dist\DeepSeek-Harness-Desktop-Setup.exe`（安装版）
- 换图标：替换 `launcher\icon.ico` 后重新打包即可
- 本地调试：`npm install` 后 `npm run start`（直接跑 Electron 壳）

## 自动发布（GitHub Actions）

`.github/workflows/release.yml` 每天定时（`cron`）并支持手动触发：

1. 读取 npm 上 `@deepseek-ai/dsh` 的 `latest` 版本，已发布则跳过
2. `npm ci` 安装打包工具链（electron + electron-builder）
3. 运行 `package.ps1` 打包安装版
4. `gh release create` 上传 `DeepSeek-Harness-Desktop-Setup.exe`（不打 zip）

发布前请在仓库 `Settings → Actions → General → Workflow permissions` 勾选 **Read and write permissions**。

## 安装与卸载

- **默认安装位置**（当前用户版）：`%LOCALAPPDATA%\Programs\DeepSeek Harness Desktop`
- **卸载**：开始菜单的卸载入口，或"控制面板 → 应用和功能"——自带卸载程序会自动删除安装目录、快捷方式和注册表卸载项
- 运行数据（dsh profile、插件、Electron 窗口配置）存放在 `%LOCALAPPDATA%\DeepSeek-Harness-Desktop\`，**卸载时默认保留**（里面有你的配置/插件数据，想彻底清除可手动删除该目录）

## FAQ

- **运行时内存多大？** 实测约 600~700MB（Chromium 主进程 + 渲染 + GPU + dsh 服务），这是 Electron 应用的正常水平，与安装/便携无关。
- **磁盘占用多大？** 安装目录约 580MB（Electron ~324MB + dsh ~256MB）。因为安装时只解压一次，不占用临时目录。
- **为什么不用便携版（单 exe 免安装）了？** 便携版每次启动都要把 3.3 万个文件重新解压到临时目录（约 26 秒），"单文件"代价太大；安装版启动快（~3s）且卸载干净，体验更好。
- **Windows 提示"未知发布者"？** exe 尚未代码签名，SmartScreen 可能弹提示，选"仍要运行"即可。后续可加代码签名证书消除。
- **关窗后服务会残留吗？** 正常关闭会由 Electron 结束自己启动的服务进程树；若被任务管理器强杀导致残留，可用 `netstat -ano | findstr :3080` 查 PID 后 `taskkill /f /pid <PID>`。
- **支持 mac / Linux 吗？** 当前只打包 Windows x64；Electron 本身跨平台，后续可按需增加 mac/Linux target。

## 许可与声明

- 本项目代码：MIT（见 `LICENSE`）
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 版权归 DeepSeek 所有；本项目是社区打包工具，与 DeepSeek 无隶属关系。再分发上游产物时请遵守其许可。
