# DeepSeek Harness Desktop

把开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（npm 包 `@deepseek-ai/dsh`）用 **Enigma Virtual Box** 打包成 **单个 exe** 的 Windows 桌面应用。

**目标电脑无需安装 Node.js、无需安装 DeepSeek Harness、无需解压**——下载一个文件，双击即用。

## 特性

- **单文件**：`DeepSeek-Harness-Desktop.exe` 内含 Node.js 运行时 + dsh 全部依赖（Enigma Virtual Box 虚拟化，运行时不落盘）
- **免安装**：不需要 Node / npm / 解压，双击即用
- **像 App**：复用系统 Edge 的「应用模式」窗口，无地址栏、无标签页
- **单实例 + 关窗停服务**：重复双击不会开多窗口；关窗自动结束后台服务
- **应用图标**：内嵌 DeepSeek 黑色 Logo，在资源管理器 / 桌面快捷方式 / 任务栏 / 开始菜单都能清晰显示
- **自动更新**：GitHub Actions 每天检查上游 `@deepseek-ai/dsh` 新版本，自动打包并发布

## 快速开始（用户）

1. 到 [Releases](../../releases) 下载最新的 **`DeepSeek-Harness-Desktop.exe`**（单个文件）
2. 双击运行
3. 首次启动会自动初始化，几秒后弹出 DeepSeek Harness 应用窗口（`http://127.0.0.1:3080`）

> 需要系统已安装 Microsoft Edge（Win10/11 自带）。真正与 DeepSeek 对话仍需你自己的 API Key 与联网。

## 打包流程（本仓库 = 自动打包机）

```
编译 Go 启动器            → dist\Desktop.exe（内嵌黑色 DeepSeek 图标）
下载便携 Node             → dist\runtime\node.exe
npm install @deepseek-ai/dsh → dist\runtime\dsh\...
自动生成 EVB 工程          → dist\DeepSeek-Harness-Desktop.evb
enigmavbconsole 封包       → dist\DeepSeek-Harness-Desktop.exe（单文件）
发布 exe，不打 zip
```

`dist` 目录结构（EVB 输入 + 最终产物）：

```
dist/
├─ Desktop.exe                  # Go 启动器（内嵌黑色图标）
├─ runtime\                     # Node.js + dsh 依赖
│  ├─ node.exe
│  └─ dsh\...
├─ DeepSeek-Harness-Desktop.evb # EVB 工程（打包时自动生成）
└─ DeepSeek-Harness-Desktop.exe # 最终单文件产物（发布物）
```

> `scripts\DeepSeek-Harness-Desktop.evb` 是本机做好的参考工程（含绝对路径，仅作对照）；`package.ps1` 会在打包时按当前目录自动重新生成等价工程，因此本机/CI 都能用。

## 本地打包（维护者）

需要：**Go 1.22+**、**Node.js 24+**、**Enigma Virtual Box**（含 `enigmavbconsole.exe`）。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1 -Version 0.1.0-rc.6
```

- 若脚本找不到 `enigmavbconsole.exe`，用 `-EnigmaVbConsole "D:\Enigma Virtual Box\enigmavbconsole.exe"` 指定
- 产物：`dist\DeepSeek-Harness-Desktop.exe`（单文件，**不打 zip**）
- 换图标：替换 `launcher\icon.ico`（黑色 DeepSeek Logo）后重跑即可

## 自动发布（GitHub Actions）

`.github/workflows/release.yml` 每天定时（`cron`）并可手动触发：

1. 自动下载并静默安装 **Enigma Virtual Box**
2. 读取 npm 上 `@deepseek-ai/dsh` 的 `latest` 版本，已发布则跳过
3. 运行 `package.ps1` 打包单 exe
4. `gh release create` 上传 `DeepSeek-Harness-Desktop.exe`（不打 zip）

发布前请在仓库 `Settings → Actions → General → Workflow permissions` 勾选 **Read and write permissions**。

## 数据与卸载

运行数据（dsh profile、插件、Edge 窗口配置）存放在：

```
%LOCALAPPDATA%\DeepSeek-Harness-Desktop\
```

卸载 = 删除应用目录 + 该数据目录。

## FAQ

- **关窗后还想手动停服务？** 关闭应用窗口即自动停止；若曾用任务管理器强杀导致残留，可 `netstat -ano | findstr :3080` 查 PID 后 `taskkill /f /pid <PID>`，或注销/重启。
- **运行时任务栏图标是什么？** exe 文件/桌面快捷方式/固定到任务栏/开始菜单显示的是**黑色 DeepSeek Logo**；窗口运行时的任务栏图标由网页 favicon 决定（Edge 窗口）。如需窗口内也显示黑色图标，需换原生窗口方案（体积会增大）。
- **为什么单 exe 有 350MB？** 未压缩，内含 Node.js（~90MB）和 dsh 全部依赖（~255MB）。EVB 可开压缩（`CompressFiles=True`）减小体积但首次启动会解压变慢。
- **支持 mac / Linux 吗？** 当前只做 Windows x64（EVB 仅支持 Windows）。

## 许可证与声明

- 本项目代码：MIT（见 `LICENSE`）
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 版权归 DeepSeek 所有；本项目是社区打包工具，与 DeepSeek 无隶属关系。再分发上游产物时请遵守其许可证。