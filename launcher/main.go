package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	appName  = "DeepSeek Harness"
	url      = "http://127.0.0.1:3080"
	mutexName = "DeepSeekHarnessDesktop.SingleInstance"

	errorAlreadyExists = 183
	mbIconInfo         = 0x40
	mbIconError        = 0x10
)

var (
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	user32   = syscall.NewLazyDLL("user32.dll")

	procCreateMutexW = kernel32.NewProc("CreateMutexW")
	procMessageBoxW  = user32.NewProc("MessageBoxW")

	httpClient = &http.Client{Timeout: 2 * time.Second}
)

func main() {
	if !acquireMutex() {
		msgBox(appName, "DeepSeek Harness 已经在运行。\n请查看已打开的应用窗口。", mbIconInfo)
		return
	}

	if err := run(); err != nil {
		msgBox(appName, "启动失败：\n"+err.Error(), mbIconError)
	}
}

func run() error {
	defer stopServer()

	root, err := exeDir()
	if err != nil {
		return err
	}

	if !isUp() {
		if err := startServer(root); err != nil {
			return err
		}
		if !waitUp(120 * time.Second) {
			return fmt.Errorf("服务未能在 %s 启动（120 秒超时）", url)
		}
	}

	edge, err := openEdge()
	if err != nil {
		return err
	}

	// 阻塞直到用户关闭应用窗口；窗口关闭后由 defer 停止后台服务。
	_ = edge.Wait()
	return nil
}

func acquireMutex() bool {
	name, err := syscall.UTF16PtrFromString(mutexName)
	if err != nil {
		return true
	}
	h, _, lastErr := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return true // 创建失败时仍然继续，避免误判
	}
	return lastErr != syscall.Errno(errorAlreadyExists)
}

func msgBox(title, text string, flags uintptr) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), flags)
}

func exeDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(exe), nil
}

func isUp() bool {
	resp, err := httpClient.Get(url)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return true
}

func waitUp(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if isUp() {
			return true
		}
		time.Sleep(500 * time.Millisecond)
	}
	return isUp()
}

func startServer(root string) error {
	nodeExe := filepath.Join(root, "runtime", "node.exe")
	dshBin := filepath.Join(root, "runtime", "dsh", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")
	if _, err := os.Stat(nodeExe); err != nil {
		return fmt.Errorf("找不到 node.exe：%s", nodeExe)
	}
	if _, err := os.Stat(dshBin); err != nil {
		return fmt.Errorf("找不到 dsh 入口：%s", dshBin)
	}

	dataDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "DeepSeek-Harness-Desktop")
	os.MkdirAll(dataDir, 0755)

	cmd := exec.Command(nodeExe, dshBin, "web")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "DSH_HOME="+filepath.Join(dataDir, "dsh-home"))
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动服务失败：%v", err)
	}
	return nil
}

func openEdge() (*exec.Cmd, error) {
	edge, err := findEdge()
	if err != nil {
		return nil, err
	}

	dataDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "DeepSeek-Harness-Desktop")
	profile := filepath.Join(dataDir, "edge-profile")
	os.MkdirAll(profile, 0755)

	cmd := exec.Command(edge,
		"--app="+url,
		"--user-data-dir="+profile,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-background-mode",
		"--disable-features=msEdgeFirstRunExperience",
	)
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("打开应用窗口失败：%v", err)
	}
	return cmd, nil
}

func findEdge() (string, error) {
	candidates := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Edge", "Application", "msedge.exe"),
	}
	for _, c := range candidates {
		if c != "" {
			if _, err := os.Stat(c); err == nil {
				return c, nil
			}
		}
	}
	return "", fmt.Errorf("未找到 Microsoft Edge。\n此应用依赖系统 Edge 作为显示窗口，请确认已安装 Edge。")
}

func stopServer() {
	out, err := exec.Command("netstat", "-ano").Output()
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, "LISTENING") || !strings.Contains(line, ":3080") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		p, e := strconv.Atoi(fields[len(fields)-1])
		if e != nil {
			continue
		}
		_ = exec.Command("taskkill", "/PID", strconv.Itoa(p), "/T", "/F").Run()
	}
}