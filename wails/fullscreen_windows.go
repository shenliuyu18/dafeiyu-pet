package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	gwHwndPrev              = 3 // GetWindow(h, GW_HWNDPREV)：z-order 中紧邻其上的窗口
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
	procOpenProcess                  = kernel32.NewProc("OpenProcess")
	procQueryFullProcessImageNameW   = kernel32.NewProc("QueryFullProcessImageNameW")
	procCloseHandle                  = kernel32.NewProc("CloseHandle")
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
	// Win11 文件资源管理器（用户实测：最大化/自动隐藏任务栏时铺满屏幕，被误判成全屏）
	"XamlExplorerHostIslandWindow": true,
	"CabinetWClass":                true,
	"ExploreWClass":                true,
}

func (a *App) fullscreenEnabled() bool {
	return a.getBool("fullscreenHide", true)
}

func (a *App) fullscreenLoop() {
	t := time.NewTicker(fullscreenPollInterval)
	defer t.Stop()
	// 独立的快速巡检：窗口被“显示桌面”压到后面时，500ms 一次会让桌宠消失约半秒。
	// 200ms 一次能把空窗压到几乎察觉不到；只在真正被压/被改尺寸时才动，开销可忽略。
	heal := time.NewTicker(200 * time.Millisecond)
	defer heal.Stop()
	for {
		select {
		case <-t.C:
			a.pollFullscreen()
		case <-heal.C:
			a.mu.Lock()
			ready := !a.quitting && a.hwnd != 0 && a.petInit
			a.mu.Unlock()
			if ready {
				a.selfHealWindow()
			}
		}
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
		a.fsHiddenAt = time.Time{}
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
			a.mu.Unlock()
			// 隐藏前复核一次（不持锁）：显示桌面 / 切换窗口的瞬间，前台窗口可能刚变成
			// 桌面或 shell，第一次采样拿到的还是旧的“铺满屏幕”窗口。若复核后不再确认
			// 全屏，就放弃这次隐藏（避免“藏 2 秒又回来”的抖动）。
			if !probeConclusiveFullscreen() {
				a.mu.Lock()
				a.fsDecider.release()
				a.mu.Unlock()
				return
			}
			a.mu.Lock()
			if a.hidden || a.fsHidden {
				a.mu.Unlock()
				return
			}
			a.fsHidden = true
			a.fsHiddenAt = time.Now()
			a.appendFSLocked(fsLogEntry(now, probe, action, "", a.hidden, a.fsHidden))
			a.mu.Unlock()
			crashLog("fs-hide", fmt.Sprintf("signal=%s class=%s rect=%s quns=%d", probe.signal, probe.class, probe.rect, probe.quns))
			procShowWindow.Call(h, swHide)
			// 全屏期间把窗口从置顶层摘掉：个别全屏程序（独占渲染/游戏）会因为上方常驻的
			// topmost 窗口而拿不到前台焦点。恢复时会重新置顶。
			dropTopmost(h)
			return
		}
	case fsDecisionRestore:
		a.fsHidden = false
		show := !a.hidden
		sinceHide := time.Duration(0)
		if !a.fsHiddenAt.IsZero() {
			sinceHide = time.Since(a.fsHiddenAt)
			a.fsHiddenAt = time.Time{}
		}
		a.appendFSLocked(fsLogEntry(now, probe, action, "", a.hidden, a.fsHidden))
		a.mu.Unlock()
		// 记录实际被藏时长：用户反馈的“消失约 N 秒”可以直接从这里核对是不是本路径造成的
		crashLog("fs-restore", fmt.Sprintf("hidden_for=%s signal=%s class=%s", sinceHide.Round(10*time.Millisecond), probe.signal, probe.class))
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

// ensureTopmost 把窗口提到置顶层。
// 不能只看 WS_EX_TOPMOST 样式：Windows 的“显示桌面”（任务栏最右 / 三指下滑 / Win+D）
// 会把桌面窗口提到所有置顶窗口之上，而我们的窗口样式仍是 TOPMOST，于是旧逻辑直接 return，
// z-order 永远不恢复——这正是“桌宠随显示桌面消失且再也回不来”的根因。
// 现在改为：样式已是 TOPMOST 时，仍用 SWP_NOACTIVATE 重新插入置顶层（幂等且开销极小）。
func ensureTopmost(h uintptr) {
	if h == 0 {
		return
	}
	procSetWindowPos.Call(h, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

// raiseTopmost 在“显示桌面”类场景后强制把窗口提回前台可见的置顶层（不抢焦点）。
func raiseTopmost(h uintptr) {
	if h == 0 {
		return
	}
	procSetWindowPos.Call(h, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate|swpShowWindow)
}

// dropTopmost 把窗口移出 topmost 层（放到 HWND_NOTOPMOST），让全屏程序能拿到前台。
func dropTopmost(h uintptr) {
	if h == 0 {
		return
	}
	procSetWindowPos.Call(h, hwndNoTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

// decideQUNS 根据 QUNS 状态与“前台窗口是否铺满监视器”决定是否算全屏，并给出判定依据。
//
// QUNS 取值（shellapi.h）：
//
//	1 QUNS_NOT_PRESENT            锁屏/无人使用
//	2 QUNS_BUSY                   忙碌（退出全屏程序、演示等）
//	3 QUNS_RUNNING_D3D_FULL_SCREEN 独占 D3D 全屏
//	4 QUNS_PRESENTATION_MODE      演示模式
//	5 QUNS_ACCEPTS_NOTIFICATIONS  正常桌面（明确“没有全屏应用”）
//	6 QUNS_QUIET_TIME            专注助手静默时间
//
// 5 与 6 是“明确没有全屏应用”的状态，必须直接排除——否则资源管理器（XamlExplorerHostIslandWindow）
// 这类铺满屏幕、或开启了自动隐藏任务栏的最大化窗口会被几何判定误当成全屏，把桌宠藏起来。
// 2/3/4 才是“可能全屏”，仍需叠加几何确认（看图器/播放器的 QUNS=3 误报也要拦）。
func decideQUNS(state uint32, covered bool) (active bool, signal string) {
	switch state {
	case 2:
		return covered, "QUNS_BUSY+几何"
	case 3:
		return covered, "QUNS_D3D+几何"
	case 4:
		return covered, "QUNS_PRESENTATION+几何"
	case 5, 6:
		return false, fmt.Sprintf("QUNS(%d) 非全屏", state)
	}
	return false, fmt.Sprintf("QUNS(%d) 忽略", state)
}

// probeFullscreen 采样一次前台窗口，并保留判定依据。
func probeFullscreen() fullscreenProbe {
	h, class := foregroundWindow()
	p := fullscreenProbe{class: class}
	if foregroundIsScreenshotTool() {
		p.signal = "screenshot-tool"
		p.active = false
		return p
	}
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
		p.active, p.signal = decideQUNS(state, covered)
		return p
	}
	p.signal = "几何"
	p.active = covered
	return p
}

func immersiveFullscreenActive() bool {
	return probeFullscreen().active
}

// probeConclusiveFullscreen 在即将隐藏桌宠前再复核一次：短暂 sleep 后重新采样，
// 并且要求前台窗口不是 shell/桌面类、确实铺满屏幕。显示桌面/切换窗口的过渡期
// 前台窗口状态不稳定，只靠窗口状态机累计命中会误藏（表现为“消失 2 秒又回来”）。
func probeConclusiveFullscreen() bool {
	time.Sleep(80 * time.Millisecond)
	p := probeFullscreen()
	if !p.active {
		return false
	}
	if shellWindowClasses[p.class] {
		return false
	}
	return true
}

// selfHealWindow 兜底巡检：某些第三方程序（照片查看器、看图/录屏工具等）在前台/退出时
// 会让系统改掉我们窗口的矩形或区域，表现为“桌宠消失 / 应用被压在后面”。
// 这里每轮（500ms）核对：隐藏时不动；否则窗口矩形必须等于工作区、且窗口可见。
// 不符就立刻纠正并写日志，便于定位是哪一步把窗口弄坏的。
func (a *App) selfHealWindow() {
	a.mu.Lock()
	h := a.hwnd
	hidden, fsHidden, quitting := a.hidden, a.fsHidden, a.quitting
	wa := a.workArea
	a.mu.Unlock()
	if h == 0 || quitting || hidden || fsHidden {
		return
	}
	var wr RECT
	if ok, _, _ := procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&wr))); ok == 0 {
		return
	}
	// DWM 隐形（cloaked）时窗口“可见”但不出画，改 z-order / 尺寸都没意义；只记录起止时间。
	if procDwmGetWindowAttribute.Find() == nil {
		var cloaked uint32
		procDwmGetWindowAttribute.Call(h, dwmwaCloaked, uintptr(unsafe.Pointer(&cloaked)), unsafe.Sizeof(cloaked))
		a.mu.Lock()
		if cloaked != 0 {
			if a.cloakAt.IsZero() {
				a.cloakAt = time.Now()
				crashLog("cloak", "window cloaked by DWM")
			}
			a.mu.Unlock()
			return
		}
		if !a.cloakAt.IsZero() {
			d := time.Since(a.cloakAt)
			a.cloakAt = time.Time{}
			a.mu.Unlock()
			crashLog("cloak", fmt.Sprintf("uncloaked after %s", d.Round(10*time.Millisecond)))
			return
		}
		a.mu.Unlock()
	}
	wantW, wantH := wa.Right-wa.Left, wa.Bottom-wa.Top
	off := wr.Left != wa.Left || wr.Top != wa.Top || (wr.Right-wr.Left) != wantW || (wr.Bottom-wr.Top) != wantH
	vis, _, _ := procIsWindowVisible.Call(h)
	if off || vis == 0 {
		crashLog("self-heal", fmt.Sprintf("rect=%d,%d,%d,%d want=%d,%d,%d,%d visible=%v",
			wr.Left, wr.Top, wr.Right, wr.Bottom, wa.Left, wa.Top, wa.Right, wa.Bottom, vis != 0))
		procSetWindowPos.Call(h, hwndTopmost, uintptr(wa.Left), uintptr(wa.Top), uintptr(wantW), uintptr(wantH), swpNoActivate|swpShowWindow)
		a.updateWindowRegion(true)
		return
	}
	// 窗口“看起来正常”但仍可能被“显示桌面”压在所有置顶窗口之下（样式仍是 TOPMOST，
	// visible 也是 true，画面却什么都没有）。检测置顶层是否被别人插到前面：若有窗口压在我们
	// 之上且它也是 topmost，就把自己重新插回置顶最前（幂等、不抢焦点）。
	if !windowIsTopmostFront(h) {
		a.mu.Lock()
		now := time.Now()
		tooSoon := !a.zHealAt.IsZero() && now.Sub(a.zHealAt) < 3*time.Second
		if !tooSoon {
			a.zHealAt = now
		}
		a.mu.Unlock()
		if tooSoon {
			return
		}
		crashLog("self-heal", "z-order lost (hidden behind shell), re-raising topmost")
		raiseTopmost(h)
		a.updateWindowRegion(true)
		// “显示桌面”之类的系统动画会在一小段时间内持续重排 z-order，单次提顶可能又被压下。
		// 延迟再补一次，把这段动画窗口盖住。
		time.AfterFunc(350*time.Millisecond, func() { raiseTopmost(h) })
	}
}

// windowIsTopmostFront 判断窗口是否处于置顶层的最前（z-order 顶部没有别的顶层窗口压着）。
// 做法：遍历 z-order，找到第一个可见的、非最小化的顶层窗口；若是自己（或自己之前没有
// 覆盖式窗口），认为正常。为避免昂贵遍历，只检查紧邻自己之上的那个窗口。
func windowIsTopmostFront(h uintptr) bool {
	// 自己的 TOPMOST 样式被外部程序改掉时，即使上面只是普通窗口也会被压住。
	if ex := getExStyle(h); ex&wsExTopmost == 0 {
		return false
	}
	prev, _, _ := procGetWindow.Call(h, gwHwndPrev)
	if prev == 0 {
		return true // 已经在最顶
	}
	pv := uintptr(prev)
	if vis, _, _ := procIsWindowVisible.Call(pv); vis == 0 {
		return true // 上面那个不可见，等价于在最顶
	}
	ex := getExStyle(pv)
	if ex&wsExTopmost == 0 {
		return true // 上面的窗口不是置顶窗口，压不住我们
	}
	// 上面的也是置顶窗口。只有「显示桌面」推上来的 shell 窗口才算异常：
	// 别的置顶程序（输入法候选、任务管理器、另一个桌宠实例……）本来就该压在上面，
	// 每 200ms 抢一次顶会互相顶来顶去、日志刷屏。
	if !shellWindowClasses[windowClassName(pv)] {
		return true
	}
	return false
}

// ReportVisualStall 由渲染层在检测到画面停更（rAF 停 / 视频不出帧）后调用。
// 用户反馈过「桌宠消失约 2 秒又自己回来、Go 侧没有任何日志」：那一刻窗口可能仍然
// 可见且置顶，只是合成层没出帧。这里把当时的窗口/Region/隐藏状态一次性落盘，
// 用来判断到底是窗口被盖、Region 异常，还是渲染层冻住。
func (a *App) ReportVisualStall(kind, detail string) {
	if kind == "" {
		kind = "stall"
	}
	a.mu.Lock()
	h := a.hwnd
	hidden, fsHidden, panel, drag := a.hidden, a.fsHidden, a.panelOpen, a.dragging
	wa := a.workArea
	boxes := len(a.regionBoxes)
	regionSet, regionFull := a.regionSet, a.regionFull
	a.mu.Unlock()
	if h == 0 {
		crashLog("visual-stall", fmt.Sprintf("kind=%s detail=%s hwnd=0", kind, detail))
		return
	}
	vis, _, _ := procIsWindowVisible.Call(h)
	ico, _, _ := procIsIconic.Call(h)
	cloaked := int32(-1)
	if procDwmGetWindowAttribute.Find() == nil {
		var c uint32
		procDwmGetWindowAttribute.Call(h, dwmwaCloaked, uintptr(unsafe.Pointer(&c)), unsafe.Sizeof(c))
		cloaked = int32(c)
	}
	var wr RECT
	procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&wr)))
	ex := getExStyle(h)
	prevClass := ""
	prevVis := uintptr(1)
	prevTop := uint32(0)
	if prev, _, _ := procGetWindow.Call(h, gwHwndPrev); prev != 0 {
		prevClass = windowClassName(uintptr(prev))
		prevVis, _, _ = procIsWindowVisible.Call(prev)
		prevTop = getExStyle(uintptr(prev)) & wsExTopmost
	}
	crashLog("visual-stall", fmt.Sprintf(
		"kind=%s detail=%s vis=%v iconic=%v cloaked=%d topmost=%v rect=%d,%d,%d,%d work=%d,%d,%d,%d boxes=%d regionSet=%v regionFull=%v hidden=%v fsHidden=%v panel=%v drag=%v prev=%s prevVis=%v prevTop=%v",
		kind, detail, vis != 0, ico != 0, cloaked, ex&wsExTopmost != 0,
		wr.Left, wr.Top, wr.Right, wr.Bottom, wa.Left, wa.Top, wa.Right, wa.Bottom,
		boxes, regionSet, regionFull, hidden, fsHidden, panel, drag,
		prevClass, prevVis != 0, prevTop != 0))
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

// 截图/录屏工具前台时（Win11 按 PrtSc 会拉起“截图工具”的全屏蒙层），不能当成全屏应用，
// 否则桌宠会先被藏起来、退出截图后又放回来，表现为“截图后闪一下”。
var screenshotProcesses = []string{"snippingtool", "screenssketch", "screenclippinghost", "sharex", "snipaste", "lightshot", "pixpin", "faststone"}

func processBaseName(pid uint32) string {
	const processQueryLimitedInformation = 0x1000
	h, _, _ := procOpenProcess.Call(processQueryLimitedInformation, 0, uintptr(pid))
	if h == 0 {
		return ""
	}
	defer procCloseHandle.Call(h)
	buf := make([]uint16, 1024)
	size := uint32(len(buf))
	ok, _, _ := procQueryFullProcessImageNameW.Call(h, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 || size == 0 {
		return ""
	}
	return strings.ToLower(filepath.Base(syscall.UTF16ToString(buf[:size])))
}

func foregroundIsScreenshotTool() bool {
	h, _, _ := procGetForegroundWindow.Call()
	if h == 0 {
		return false
	}
	var pid uint32
	procGetWindowThreadProcessID.Call(h, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 || pid == uint32(os.Getpid()) {
		return false
	}
	name := processBaseName(pid)
	if name == "" {
		return false
	}
	for _, s := range screenshotProcesses {
		if strings.Contains(name, s) {
			return true
		}
	}
	return false
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

	// 带标准标题栏的窗口不是沉浸式全屏（真正的 F11 网页全屏、游戏全屏都没有标题栏）。
	// 之前只在「最大化」时才豁免，导致 Edge 应用模式、某些工具窗口虽然铺满显示器、
	// 但并不是最大化状态（IsZoomed=false），被误判成全屏把桌宠藏了起来（表现为“桌宠失踪”）。
	style, _, _ := procGetWindowLongPtrW.Call(h, gwlStyleIndex)
	if uint32(style)&wsCaption == wsCaption {
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
