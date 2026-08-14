# DeepSeek Harness Desktop

把开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（npm 包 `@deepseek-ai/dsh`）用 **Electron** 封装成 Windows 桌面应用。
**无需安装 Node.js、DeepSeek Harness 或 Microsoft Edge**，下载 Setup.exe 安装即用。

## 特性

- **单文件安装包**：内含 Electron 运行时 + dsh 全部依赖
- **启动快**：安装时解压一次，之后每次启动约 2~3 秒
- **不依赖系统 Edge**：自带 Chromium 窗口
- **单实例 + 关窗停服务**：重复启动不弹多窗口，关闭窗口自动结束后台服务
- **自动更新**：GitHub Actions 每天检查上游新版本并自动发布

## 快速开始

1. 到 [Releases](../../releases) 下载 `DeepSeek-Harness-Desktop-Setup.exe`
2. 双击安装（可自定义安装路径）
3. 从开始菜单或桌面快捷方式启动

> 与 DeepSeek 对话仍需你自己的 API Key 与联网。

## 架构与打包流程

```
npm install @deepseek-ai/dsh    → build\runtime\dsh\...（dsh 及全部依赖）
scripts\prune-dsh.ps1           → 瘦身：删多平台二进制 / 调试符号 / 类型声明 / 文档
electron-builder (nsis)         → dist\DeepSeek-Harness-Desktop-Setup.exe
```

- Electron 主进程（`electron/main.js`）负责：
  - 单实例锁（`requestSingleInstanceLock`）
  - 用 Electron 自带 Node 启动 dsh 服务（`ELECTRON_RUN_AS_NODE=1` + `dsh web`），省去单独打包 node.exe
  - 加载 `http://127.0.0.1:3080` 到内置 Chromium 窗口
  - 关窗/退出时结束自己启动的服务进程树（`taskkill /T /F`，只针对自己的 PID）
- 运行时（dsh）放在安装目录的 `resources\dsh`，保持真实文件以便 Node 加载原生模块（sharp、node-pty、koffi 等）
- 打包时用 `scripts\prune-dsh.ps1` 给 dsh 运行时瘦身：删除 x64 Windows 用不到的多平台预编译（arm64/darwin）、调试符号（`.pdb`）、TypeScript 类型声明（`.d.ts`）、文档/测试文件，以及 node-pty 的构建源码树。安装包因此从 ~150MB 降到 ~99MB

## 本地打包（维护者）

需要：**Node.js 24+**。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1 -Version 0.1.0-rc.6
```

- 产物：`dist\DeepSeek-Harness-Desktop-Setup.exe`
- 换图标：替换 `launcher\icon.ico` 后重新打包即可
- 本地调试：`npm install` 后 `npm run start`

## 自动发布（GitHub Actions）

`.github/workflows/release.yml` 每天定时并支持手动触发：读取 npm 上 `@deepseek-ai/dsh` 的 `latest` 版本（已发布则跳过）→ `npm ci` → `package.ps1` 打包 → `gh release create` 上传 Setup.exe。

发布前请在仓库 `Settings → Actions → General → Workflow permissions` 勾选 **Read and write permissions**。

## 数据与卸载

- 默认安装位置：`%LOCALAPPDATA%\Programs\DeepSeek Harness Desktop`
- 卸载：开始菜单卸载入口，或"控制面板 → 应用和功能"，自动清理安装目录、快捷方式与注册表
- 运行数据（dsh profile、插件等）在 `%LOCALAPPDATA%\DeepSeek-Harness-Desktop\`，**卸载时默认保留**

## FAQ

- **运行时内存多大？** 实测约 600~700MB（Chromium 主进程 + 渲染 + GPU + dsh 服务），Electron 应用正常水平。
- **安装目录多大？** 约 430MB（Electron ~324MB + dsh ~110MB，已 prune 掉多平台二进制、调试符号、类型声明等）。
- **安装包多大？** 约 99MB。
- **Windows 提示"未知发布者"？** 尚未代码签名，选"仍要运行"即可。
- **支持 mac / Linux 吗？** 暂只打包 Windows x64，后续可按需增加。


- **选择目录时弹的是 Windows 系统对话框吗？** 是的。上游 dsh 自带的原生文件夹选择器在部分机器上不稳定（会报 `win32 folder dialog worker exited...`），打包时已把它替换为"由 Electron 主进程调用系统原生目录对话框（IFileDialog）"的实现——外观就是标准 Windows 文件夹选择框，稳定不崩。

## 许可与声明

- 本项目代码：MIT（见 `LICENSE`）
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 版权归 DeepSeek 所有；本项目是社区打包工具，与 DeepSeek 无隶属关系。再分发上游产物时请遵守其许可。
