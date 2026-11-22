package main

import (
	"fmt"
	"os"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	gwlStyleIndex           = ^uintptr(15)
	wsCaption               = 0x00C00000
	wsExTopmost             = 0x00000008
	monitorDefaultToNearest = 0x00000002
	dwmwaCloaked            = 14
	swpNoSize               = 0x0001
	swpNoMove               = 0x0002
	fullscreenPollInterval  = 500 * time.Millisecond
)

type monitorInfo struct {
	CbSize    uint32
	RcMonitor RECT
	RcWork    RECT
	DwFlags   uint32
}

// fullscreenProbe 是一次前台窗口探测的完整结果，供判定与诊断记录共用。
type fullscreenProbe struct {
	active  bool
	signal  string // 这次判定依据：QUNS_D3D / QUNS_BUSY+几何 / 几何
	quns    uint32
	hasQuns bool
	class   string
	rect    string
}

var (
	dwmapi = windows.NewLazySystemDLL("dwmapi.dll")

	procSHQueryUserNotificationState = shell32.NewProc("SHQueryUserNotificationState")
	procGetForegroundWindow          = user32.NewProc("GetForegroundWindow")
	procGetWindowRect                = user32.NewProc("GetWindowRect")
	procGetClassNameW                = user32.NewProc("GetClassNameW")
	procIsIconic                     = user32.NewProc("IsIconic")
	procIsZoomed                     = user32.NewProc("IsZoomed")
	procMonitorFromWindow            = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfoW              = user32.NewProc("GetMonitorInfoW")
	procDwmGetWindowAttribute        = dwmapi.NewProc("DwmGetWindowAttribute")
)

// 桌面、任务栏、开始菜单等铺满屏幕但不是“全屏应用”的窗口
var shellWindowClasses = map[string]bool{
	"Progman":                    true,
	"WorkerW":                    true,
	"Shell_TrayWnd":              true,
	"Shell_SecondaryTrayWnd":     true,
	"Windows.UI.Core.CoreWindow": true,
	"MultitaskingViewFrame":      true,
	"ForegroundStaging":          true,
}

func (a *App) fullscreenEnabled() bool {
	return a.getBool("fullscreenHide", true)
}

func (a *App) fullscreenLoop() {
	t := time.NewTicker(fullscreenPollInterval)
	defer t.Stop()
	for range t.C {
		a.pollFullscreen()
	}
}

func (a *App) pollFullscreen() {
	a.mu.Lock()
	ready := !a.quitting && a.hwnd != 0 && a.petInit
	a.mu.Unlock()
	if !ready {
		return
	}

	enabled := a.fullscreenEnabled()
	var probe fullscreenProbe
	if enabled {
		probe = probeFullscreen()
	}
	now := time.Now()

	a.mu.Lock()
	if a.quitting || a.hwnd == 0 {
		a.mu.Unlock()
		return
	}
	h := a.hwnd
	if !enabled {
		wasFsHidden := a.fsHidden
		a.fsDecider.release()
		a.fsHidden = false
		hidden := a.hidden
		if wasFsHidden || a.fsHasLast {
			a.appendFSLocked(fsLogEntry(now, probe, fsDecisionNone, "disabled", hidden, false))
		}
		top := false
		if !hidden && now.Sub(a.fsTopAt) > 5*time.Second {
			a.fsTopAt = now
			top = true
		}
		a.mu.Unlock()
		// 关掉避让时如果正处于「被全屏藏起来」的状态，要立刻把窗口放回来，
		// 否则设置里关掉开关后桌宠会一直不出现
		if wasFsHidden && !hidden {
			a.restoreAfterFullscreen(h)
			return
		}
		if top {
			ensureTopmost(h)
		}
		return
	}

	// 面板打开 / 拖拽中：用户正在操作，任何全屏判定都先放一边，避免面板被一起藏掉
	if a.panelOpen || a.dragging {
		a.fsDecider.pause()
		a.mu.Unlock()
		return
	}

	action := a.fsDecider.step(probe.active, now)
	switch action {
	case fsDecisionHide:
		if !a.hidden && !a.fsHidden {
			a.fsHidden = true
			a.appendFSLocked(fsLogEntry(now, probe, action, "", a.hidden, a.fsHidden))
			a.mu.Unlock()
			procShowWindow.Call(h, swHide)
			return
		}
	case fsDecisionRestore:
		a.fsHidden = false
		show := !a.hidden
		a.appendFSLocked(fsLogEntry(now, probe, action, "", a.hidden, a.fsHidden))
		a.mu.Unlock()
		if show {
			a.restoreAfterFullscreen(h)
		}
		return
	}

	// 无动作时也把外部（启动抑制 / 手动显示）设置的隐藏态同步进状态机
	a.fsHidden = a.fsDecider.hidden
	changed := !a.fsHasLast || a.fsLast != probe.active
	a.fsLast = probe.active
	a.fsHasLast = true
	if changed {
		a.appendFSLocked(fsLogEntry(now, probe, fsDecisionNone, "sample", a.hidden, a.fsHidden))
	}
	hidden := a.hidden
	fsHidden := a.fsHidden
	top := false
	if !hidden && !fsHidden && now.Sub(a.fsTopAt) > 5*time.Second {
		a.fsTopAt = now
		top = true
	}
	a.mu.Unlock()
	if top {
		ensureTopmost(h)
	}
}

func fsDecisionName(d fullscreenDecision) string {
	switch d {
	case fsDecisionHide:
		return "hide"
	case fsDecisionRestore:
		return "restore"
	}
	return "none"
}

func fsLogEntry(now time.Time, p fullscreenProbe, d fullscreenDecision, note string, petHidden, fsHidden bool) map[string]interface{} {
	quns := interface{}(nil)
	if p.hasQuns {
		quns = p.quns
	}
	action := fsDecisionName(d)
	if note != "" {
		action = note
	}
	return map[string]interface{}{
		"t":         now.Format("15:04:05"),
		"active":    p.active,
		"signal":    p.signal,
		"quns":      quns,
		"class":     p.class,
		"rect":      p.rect,
		"action":    action,
		"petHidden": petHidden,
		"fsHidden":  fsHidden,
	}
}

// appendFSLocked 追加一条判定记录，只保留最近 fullscreenLogLimit 条。
func (a *App) appendFSLocked(entry map[string]interface{}) {
	a.fsLast = boolv(entry["active"], false)
	a.fsHasLast = true
	a.fsLog = append(a.fsLog, entry)
	if len(a.fsLog) > fullscreenLogLimit {
		a.fsLog = a.fsLog[len(a.fsLog)-fullscreenLogLimit:]
	}
}

// FullscreenDiagnostics 返回全屏避让的当前状态与最近判定记录，用于 issue #2 自查。
func (a *App) FullscreenDiagnostics() map[string]interface{} {
	enabled := a.fullscreenEnabled()
	probe := probeFullscreen()
	now := time.Now()

	a.mu.Lock()
	entries := make([]map[string]interface{}, len(a.fsLog))
	copy(entries, a.fsLog)
	hidden, fsHidden, panel, dragging := a.hidden, a.fsHidden, a.panelOpen, a.dragging
	decider := a.fsDecider
	a.mu.Unlock()
	decider.normalize()

	return map[string]interface{}{
		"enabled":        enabled,
		"active":         probe.active,
		"signal":         probe.signal,
		"quns":           probe.quns,
		"hasQuns":        probe.hasQuns,
		"class":          probe.class,
		"rect":           probe.rect,
		"hidden":         hidden,
		"fsHidden":       fsHidden,
		"panelOpen":      panel,
		"dragging":       dragging,
		"hits":           decider.hits,
		"clears":         decider.clears,
		"confirmTicks":   decider.confirmTicks,
		"clearTicks":     decider.clearTicks,
		"restoreDelayMs": decider.restoreDelay.Milliseconds(),
		"rehideDelayMs":  decider.rehideDelay.Milliseconds(),
		"checkedAt":      now.Format("15:04:05"),
		"entries":        entries,
	}
}

func (a *App) restoreAfterFullscreen(h uintptr) {
	wa := getWorkArea()
	dpi := getDPI(h)
	if dpi <= 0 {
		dpi = 96
	}
	a.mu.Lock()
	a.workArea = wa
	a.dpi = float64(dpi) / 96.0
	a.mu.Unlock()
	procSetWindowPos.Call(h, hwndTopmost,
		uintptr(wa.Left), uintptr(wa.Top),
		uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top),
		swpNoActivate|swpShowWindow|swpFrameChanged)
	procShowWindow.Call(h, swShowNoActivate)
	a.fixAeroBlur(h) // Win10：全屏避让回来后再清一次毛玻璃层
	a.updateWindowRegion(true)
}

func ensureTopmost(h uintptr) {
	if getExStyle(h)&wsExTopmost != 0 {
		return
	}
	procSetWindowPos.Call(h, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

// probeFullscreen 采样一次前台窗口，并保留判定依据。
// QUNS_BUSY(2) / QUNS_PRESENTATION_MODE(4) 的命中范围很宽（最大化窗口、专注助手、
// 演示设置都可能返回），单独采信会误隐藏，必须再让前台窗口几何确认一次；
// 只有 QUNS_RUNNING_D3D_FULL_SCREEN(3) 是独占全屏，可以直接采信。
func probeFullscreen() fullscreenProbe {
	h, class := foregroundWindow()
	p := fullscreenProbe{class: class}
	if h != 0 {
		var wr RECT
		if ok, _, _ := procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&wr))); ok != 0 {
			p.rect = fmt.Sprintf("%dx%d", wr.Right-wr.Left, wr.Bottom-wr.Top)
		}
	}
	covered := h != 0 && windowCoversMonitor(h)

	if state, ok := queryUserNotificationState(); ok {
		p.quns = state
		p.hasQuns = true
		switch state {
		case 3:
			p.active = true
			p.signal = "QUNS_D3D"
			return p
		case 2, 4:
			p.active = covered
			p.signal = "QUNS_BUSY+几何"
			return p
		}
		p.signal = fmt.Sprintf("QUNS(%d)+几何", state)
		p.active = covered
		return p
	}
	p.signal = "几何"
	p.active = covered
	return p
}

func immersiveFullscreenActive() bool {
	return probeFullscreen().active
}

func queryUserNotificationState() (uint32, bool) {
	var state uint32
	r, _, _ := procSHQueryUserNotificationState.Call(uintptr(unsafe.Pointer(&state)))
	if r != 0 {
		return 0, false
	}
	return state, true
}

// foregroundWindow 返回值得关注的前台窗口；桌面 / 任务栏 / 自己 都返回 0。
func foregroundWindow() (uintptr, string) {
	h, _, _ := procGetForegroundWindow.Call()
	if h == 0 {
		return 0, ""
	}
	var pid uint32
	procGetWindowThreadProcessID.Call(h, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 || pid == uint32(os.Getpid()) {
		return 0, ""
	}
	if ok, _, _ := procIsWindowVisible.Call(h); ok == 0 {
		return 0, ""
	}
	if ok, _, _ := procIsIconic.Call(h); ok != 0 {
		return 0, ""
	}
	return h, windowClassName(h)
}

func windowClassName(h uintptr) string {
	var classBuf [64]uint16
	n, _, _ := procGetClassNameW.Call(h, uintptr(unsafe.Pointer(&classBuf[0])), uintptr(len(classBuf)))
	if n > 0 && int(n) <= len(classBuf) {
		return syscall.UTF16ToString(classBuf[:int(n)])
	}
	return ""
}

func foregroundCoversMonitor() bool {
	h, _ := foregroundWindow()
	return h != 0 && windowCoversMonitor(h)
}

func windowCoversMonitor(h uintptr) bool {
	if procDwmGetWindowAttribute.Find() == nil {
		var cloaked uint32
		procDwmGetWindowAttribute.Call(h, dwmwaCloaked, uintptr(unsafe.Pointer(&cloaked)), unsafe.Sizeof(cloaked))
		if cloaked != 0 {
			return false
		}
	}

	if shellWindowClasses[windowClassName(h)] {
		return false
	}

	// 开启自动隐藏任务栏时，普通最大化窗口也会铺满显示器；带标题栏的最大化窗口不算沉浸式全屏。
	style, _, _ := procGetWindowLongPtrW.Call(h, gwlStyleIndex)
	if zoomed, _, _ := procIsZoomed.Call(h); zoomed != 0 && uint32(style)&wsCaption == wsCaption {
		return false
	}

	var wr RECT
	if ok, _, _ := procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&wr))); ok == 0 {
		return false
	}
	mon, _, _ := procMonitorFromWindow.Call(h, monitorDefaultToNearest)
	if mon == 0 {
		return false
	}
	mi := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
	if ok, _, _ := procGetMonitorInfoW.Call(mon, uintptr(unsafe.Pointer(&mi))); ok == 0 {
		return false
	}
	const tol int32 = 2
	m := mi.RcMonitor
	return wr.Left <= m.Left+tol && wr.Top <= m.Top+tol &&
		wr.Right >= m.Right-tol && wr.Bottom >= m.Bottom-tol
}
