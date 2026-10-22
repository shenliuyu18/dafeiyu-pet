package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
	"unsafe"
)

const (
	pbtApmSuspend         = 0x0004
	pbtApmResumeSuspend   = 0x0007
	pbtApmResumeAutomatic = 0x0012
	deviceNotifyCallback  = 2
)

type deviceNotifySubscribeParameters struct {
	Callback uintptr
	Context  uintptr
}

var (
	powrprof                                   = syscall.NewLazyDLL("powrprof.dll")
	procPowerRegisterSuspendResumeNotification = powrprof.NewProc("PowerRegisterSuspendResumeNotification")

	powerSubscriber   deviceNotifySubscribeParameters
	powerCallback     uintptr
	powerRegistration uintptr
)

func startPowerMonitor(a *App) {
	if powerRegistration != 0 {
		return
	}
	powerCallback = syscall.NewCallback(powerNotifyCallback)
	powerSubscriber.Callback = powerCallback
	powerSubscriber.Context = uintptr(unsafe.Pointer(a))
	r, _, err := procPowerRegisterSuspendResumeNotification.Call(
		uintptr(deviceNotifyCallback),
		uintptr(unsafe.Pointer(&powerSubscriber)),
		uintptr(unsafe.Pointer(&powerRegistration)),
	)
	if r != 0 {
		crashLog("power", fmt.Sprintf("PowerRegisterSuspendResumeNotification failed: %v", err))
	}
}

func powerNotifyCallback(context uintptr, typ uintptr, setting uintptr) uintptr {
	if typ == pbtApmResumeAutomatic || typ == pbtApmResumeSuspend {
		if app := (*App)(unsafe.Pointer(context)); app != nil {
			app.scheduleResumeCheck()
		}
	}
	return 0
}

func (a *App) scheduleResumeCheck() {
	if !a.getBool("safeResume", true) {
		return
	}
	a.mu.Lock()
	if a.quitting || a.hidden || a.fsHidden || a.resumeChecking {
		a.mu.Unlock()
		return
	}
	if time.Since(a.lastResumeCheck) < 5*time.Second {
		a.mu.Unlock()
		return
	}
	a.lastResumeCheck = time.Now()
	a.resumeChecking = true
	a.mu.Unlock()

	go func() {
		// 给显示器、显卡驱动和 WebView2 一点恢复时间
		time.Sleep(1500 * time.Millisecond)
		a.resumeHealthCheck()
		a.mu.Lock()
		a.resumeChecking = false
		a.mu.Unlock()
	}()
}

func windowResponds(h uintptr, timeout time.Duration) bool {
	var result uintptr
	r, _, _ := procSendMessageTimeoutW.Call(
		h, wmNull, 0, 0,
		uintptr(smtoBlock|smtoAbortIfHung),
		uintptr(timeout/time.Millisecond),
		uintptr(unsafe.Pointer(&result)),
	)
	return r != 0
}

func (a *App) resumeHealthCheck() {
	if !a.getBool("safeResume", true) {
		return
	}
	a.mu.Lock()
	h, hidden, fsHidden, quitting, petInit := a.hwnd, a.hidden, a.fsHidden, a.quitting, a.petInit
	a.mu.Unlock()
	if quitting || hidden || fsHidden || h == 0 || !petInit {
		return
	}
	if ok, _, _ := procIsWindow.Call(h); ok == 0 {
		a.restartAfterResume("唤醒后窗口不存在")
		return
	}
	if ok, _, _ := procIsWindowVisible.Call(h); ok == 0 {
		a.restartAfterResume("唤醒后窗口不可见")
		return
	}
	if !windowResponds(h, 3*time.Second) {
		a.restartAfterResume("唤醒后窗口无响应")
		return
	}

	wa := getWorkArea()
	dpi := getDPI(h)
	if dpi <= 0 {
		dpi = 96
	}
	a.mu.Lock()
	a.workArea = wa
	a.dpi = float64(dpi) / 96.0
	px, py, ps := a.petX, a.petY, a.petScale
	ww := float64(wa.Right-wa.Left) / a.dpi
	wh := float64(wa.Bottom-wa.Top) / a.dpi
	a.mu.Unlock()

	// 保证桌宠仍落在恢复后的工作区内
	if px > ww-80*ps {
		px = ww - 80*ps
	}
	if py > wh-80*ps {
		py = wh - 80*ps
	}
	if px < 0 {
		px = 0
	}
	if py < 0 {
		py = 0
	}
	a.mu.Lock()
	a.petX, a.petY = px, py
	seq := a.powerSeq + 1
	a.powerSeq = seq
	a.powerAckAt = time.Time{}
	a.mu.Unlock()

	procSetWindowPos.Call(h, hwndTopmost,
		uintptr(wa.Left), uintptr(wa.Top),
		uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top),
		swpNoActivate|swpShowWindow)
	a.updateWindowRegion(true)

	started := time.Now()
	a.emit("power-resume", map[string]interface{}{"seq": seq, "x": px, "y": py, "scale": ps})
	go func() {
		time.Sleep(3 * time.Second)
		a.mu.Lock()
		ack, cur, hidden, fsHidden := a.powerAckAt, a.powerSeq, a.hidden, a.fsHidden
		a.mu.Unlock()
		if cur != seq || hidden || fsHidden || ack.After(started) {
			return
		}
		a.restartAfterResume("唤醒后前端未响应")
	}()
}

func (a *App) PowerAck(seq int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if seq == a.powerSeq {
		a.powerAckAt = time.Now()
	}
}

func (a *App) restartAfterResume(reason string) {
	if !a.getBool("safeResume", true) {
		return
	}
	now := nowMillis()
	a.mu.Lock()
	if a.quitting || a.hidden || a.fsHidden {
		a.mu.Unlock()
		return
	}
	last := int64(num(a.state["lastResumeRestart"]))
	if last > 0 && now-last < 5*60*1000 {
		a.mu.Unlock()
		crashLog("power", reason+"（5 分钟内已重启过，跳过）")
		return
	}
	a.state["lastResumeRestart"] = now
	a.mu.Unlock()

	crashLog("power", reason+"，准备重启")
	a.saveStateNow()
	exe, err := os.Executable()
	if err != nil {
		return
	}
	// 不再经过 cmd.exe，避免中文安装路径被按 OEM 代码页解析；helper 模式不拿单实例锁
	cmd := exec.Command(exe, "--resume-restart-helper")
	cmd.SysProcAttr = hiddenProcAttr()
	if err := cmd.Start(); err != nil {
		crashLog("power", "启动重启器失败: "+err.Error())
		return
	}
	a.Quit()
	// 窗口无响应时 Quit 可能卡住；给新实例让出单实例锁
	time.AfterFunc(2*time.Second, func() { os.Exit(0) })
}

func runResumeRestartHelper() {
	// 等旧进程退出并释放单实例锁后再启动正式实例
	time.Sleep(4 * time.Second)
	exe, err := os.Executable()
	if err != nil {
		crashLog("power", "读取重启目标失败: "+err.Error())
		return
	}
	cmd := exec.Command(exe)
	if err := cmd.Start(); err != nil {
		crashLog("power", "重启失败: "+err.Error())
	}
}
