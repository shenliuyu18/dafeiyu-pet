package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

type RECT struct {
	Left, Top, Right, Bottom int32
}

type POINT struct {
	X, Y int32
}

// CSS 像素坐标的可见区域；Hit 标记角色命中区（用于鼠标穿透判定）
type RegionBox struct {
	X   float64 `json:"x"`
	Y   float64 `json:"y"`
	W   float64 `json:"w"`
	H   float64 `json:"h"`
	Hit bool    `json:"hit"`
	// Soft 表示“可交互但非角色本体”的区域（目前只有气泡）。动作画布 / alpha 包络等
	// 只是为了让 Region 不裁内容，绝不能当成可交互区，否则气泡/动作期间会把整窗变成
	// 可点击窗口，吞掉覆盖区域内所有鼠标事件（用户反馈：气泡存在时点哪都没反应）。
	Soft bool `json:"soft,omitempty"`
}

type pixRect struct {
	x0, y0, x1, y1 int32
}

const (
	gwlExStyle       = ^uintptr(19)
	wsExAppWindow    = 0x00040000
	wsExToolWindow   = 0x00000080
	wsExNoActivate   = 0x08000000
	wsExTransparent  = 0x00000020
	swShowNoActivate = 4
	swHide           = 0
	hwndTopmost      = ^uintptr(0) // (HWND)-1
	hwndNoTopmost    = ^uintptr(1) // (HWND)-2
	swpNoActivate    = 0x0010
	swpShowWindow    = 0x0040
	swpFrameChanged  = 0x0020
	spiGetWorkArea   = 0x0030
	rgnOr            = 2

	smtoBlock       = 0x0001
	smtoAbortIfHung = 0x0002
	wmNull          = 0x0000

	// SetWindowCompositionAttribute 的 AccentPolicy（未文档化，Win10 起可用）
	wcaAccentPolicy        = 19
	accentDisabled         = 0
	accentEnableBlurBehind = 3 // Win10 上 Wails 给透明窗口用的就是它（issue #1 的成因）
	// 2 = ACCENT_ENABLE_TRANSPARENTGRADIENT：名字像"透明"，实测是拿 GradientColor
	// 铺一层不透明色把桌面遮住，仅作记录，不要用来替代 blur。详见 fixAeroBlur 注释。
	accentEnableTransparentGradientUnused = 2

	// Win11 22621 起才有 DWMWA_SYSTEMBACKDROP_TYPE；之前的版本 Wails 会退回 Aero 模糊
	backdropBuildThreshold = 22621

	// 位置驱动的 Region 刷新节流窗口（面板/拖拽等几何突变不受此限制）
	regionMinInterval = 80 * time.Millisecond
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")
	gdi32    = windows.NewLazySystemDLL("gdi32.dll")
	crypt32  = windows.NewLazySystemDLL("crypt32.dll")

	procFindWindowW              = user32.NewProc("FindWindowW")
	procGetWindowThreadProcessID = user32.NewProc("GetWindowThreadProcessId")
	procGetWindowLongPtrW        = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW        = user32.NewProc("SetWindowLongPtrW")
	procSetWindowPos             = user32.NewProc("SetWindowPos")
	procShowWindow               = user32.NewProc("ShowWindow")
	procIsWindow                 = user32.NewProc("IsWindow")
	procIsWindowVisible          = user32.NewProc("IsWindowVisible")
	procGetWindow                = user32.NewProc("GetWindow")
	procSendMessageTimeoutW      = user32.NewProc("SendMessageTimeoutW")
	procGetCursorPos             = user32.NewProc("GetCursorPos")
	procSetCursorPos             = user32.NewProc("SetCursorPos")
	procMouseEvent               = user32.NewProc("mouse_event")
	procGetDpiForWindow          = user32.NewProc("GetDpiForWindow")
	procSystemParametersInfo     = user32.NewProc("SystemParametersInfoW")
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	procSetWindowRgn             = user32.NewProc("SetWindowRgn")
	procGetWindowRgn             = user32.NewProc("GetWindowRgn")
	procSetWindowCompositionAttr = user32.NewProc("SetWindowCompositionAttribute")
	procCreateRectRgn            = gdi32.NewProc("CreateRectRgn")
	procCombineRgn               = gdi32.NewProc("CombineRgn")
	procDeleteObject             = gdi32.NewProc("DeleteObject")
	procCreateMutexW             = kernel32.NewProc("CreateMutexW")
	procLocalFree                = kernel32.NewProc("LocalFree")
	procCryptProtectData         = crypt32.NewProc("CryptProtectData")
	procCryptUnprotectData       = crypt32.NewProc("CryptUnprotectData")
)

var singleMutex uintptr

func acquireSingleInstance() bool {
	name, _ := syscall.UTF16PtrFromString(singleInstanceName())
	h, _, err := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return true
	}
	if errno, ok := err.(syscall.Errno); ok && errno == 183 { // ERROR_ALREADY_EXISTS
		return false
	}
	singleMutex = h
	return true
}

func findPetWindow(class string) uintptr {
	cls, _ := syscall.UTF16PtrFromString(class)
	title, _ := syscall.UTF16PtrFromString(appName())
	myPID := uint32(os.Getpid())
	owned := func(h uintptr) bool {
		if h == 0 {
			return false
		}
		var pid uint32
		procGetWindowThreadProcessID.Call(h, uintptr(unsafe.Pointer(&pid)))
		return pid == myPID
	}
	for i := 0; i < 120; i++ {
		// 先按类和标题找，绝不抓另一个进程（完整版 / Lite 同机运行）的窗口
		if h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title))); owned(h) {
			return h
		}
		if h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(cls)), 0); owned(h) {
			return h
		}
		if h, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(title))); owned(h) {
			return h
		}
		time.Sleep(25 * time.Millisecond)
	}
	return 0
}

func (a *App) SetupWindow() {
	h := findPetWindow(a.className)
	if h == 0 {
		crashLog("window", "FindWindow failed")
		return
	}
	a.hwnd = h
	wa := getWorkArea()
	dpi := getDPI(h)
	if dpi <= 0 {
		dpi = 96
	}
	// 启动时如果已经有全屏应用在前台，先不要露头，等退出全屏后再显示
	suppress := a.fullscreenEnabled() && immersiveFullscreenActive()
	a.mu.Lock()
	a.workArea = wa
	a.dpi = float64(dpi) / 96.0
	if suppress {
		a.fsHidden = true
		a.fsDecider.suppress()
	}
	a.mu.Unlock()

	ex := getExStyle(h)
	ex &^= wsExAppWindow
	ex |= wsExToolWindow | wsExNoActivate | wsExTransparent
	setExStyle(h, ex)
	a.fixAeroBlur(h)
	// 先铺满工作区再显示，避免 800×600 的闪烁
	if suppress {
		procSetWindowPos.Call(h, hwndTopmost, uintptr(wa.Left), uintptr(wa.Top), uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top), swpNoActivate|swpFrameChanged)
		return
	}
	procSetWindowPos.Call(h, hwndTopmost, uintptr(wa.Left), uintptr(wa.Top), uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top), swpNoActivate|swpShowWindow|swpFrameChanged)
	procShowWindow.Call(h, swShowNoActivate)
	a.updateWindowRegion(true)
}

// ---------------- 透明窗口的 Aero 模糊修复（Windows 10） ----------------

type accentPolicy struct {
	AccentState   uint32
	AccentFlags   uint32
	GradientColor uint32
	AnimationID   uint32
}

type windowCompositionAttribData struct {
	Attrib uint32
	PvData unsafe.Pointer
	CbData uintptr
}

func windowsBuildNumber() uint32 {
	if v := windows.RtlGetVersion(); v != nil {
		return v.BuildNumber
	}
	return 0
}

// applyAccentPolicy 设置窗口的 AccentPolicy（WCA_ACCENT_POLICY）。
// state 决定合成方式：0 关闭 / 2 透明渐变 / 3 模糊（Aero 毛玻璃）。
func applyAccentPolicy(h uintptr, state, flags, gradient uint32) bool {
	if h == 0 || procSetWindowCompositionAttr.Find() != nil {
		return false
	}
	policy := accentPolicy{AccentState: state, AccentFlags: flags, GradientColor: gradient}
	data := windowCompositionAttribData{
		Attrib: wcaAccentPolicy,
		PvData: unsafe.Pointer(&policy),
		CbData: unsafe.Sizeof(policy),
	}
	r, _, _ := procSetWindowCompositionAttr.Call(h, uintptr(unsafe.Pointer(&data)))
	return r != 0
}

// Win10（< 22621）没有 DWMWA_SYSTEMBACKDROP_TYPE，Wails 给透明窗口加的是
// ACCENT_ENABLE_BLURBEHIND：给窗口背后叠一层高斯模糊。桌宠窗口铺满整个工作区，
// 于是整块桌面都发虚（issue #1）。
//
// 修法是直接把 AccentPolicy 清掉（ACCENT_DISABLED）。窗口本身是
// WS_EX_NOREDIRECTIONBITMAP，没有任何重定向表面，清掉 accent 之后客户区只剩
// WebView2 合成的内容，桌面原样透出、不模糊——和 Win11 上 BackdropType=None
// 的效果一致。
//
// 踩过的坑（2026-11 实测，勿改成「透明渐变」）：
// ACCENT_ENABLE_TRANSPARENTGRADIENT(2) 在真机上不是透明，而是拿 GradientColor
// 铺一层不透明色（实测整片变成 178,200,216 的纯色，把桌面全遮住）；
// 只有 ACCENT_DISABLED(0) 能保持清晰透出。
// 个别机器若因此变黑底，在状态文件里写 "blurFix": false 可退回原行为。
func (a *App) fixAeroBlur(h uintptr) {
	if h == 0 {
		return
	}
	if windowsBuildNumber() >= backdropBuildThreshold {
		return // Win11 走 DWM backdrop = None，本来就不模糊
	}
	if !a.getBool("blurFix", true) {
		crashLog("blur-fix", "skipped by state blurFix=false")
		return
	}
	if !applyAccentPolicy(h, accentDisabled, 0, 0) {
		crashLog("blur-fix", "clear accent failed")
		return
	}
	a.mu.Lock()
	a.accentFixed = true
	a.mu.Unlock()
}

// toggleBlurFix 供托盘菜单调用：在「清掉毛玻璃」和「Wails 默认毛玻璃」之间切换。
// 万一某台 Win10 机器清掉 accent 后渲染成黑底，用户取消勾选就能立刻退回原样。
func (a *App) toggleBlurFix() {
	on := !a.getBool("blurFix", true)
	a.set("blurFix", on)
	a.saveState()
	a.mu.Lock()
	h := a.hwnd
	if on {
		a.accentFixed = true
	}
	a.mu.Unlock()
	if h == 0 {
		return
	}
	if on {
		applyAccentPolicy(h, accentDisabled, 0, 0)
		crashLog("blur-fix", "托盘切换：修复已开启（清掉毛玻璃）")
	} else {
		// 退回 Wails 在 Win10 上的默认行为
		applyAccentPolicy(h, accentEnableBlurBehind, 2, 0)
		crashLog("blur-fix", "托盘切换：修复已关闭（恢复毛玻璃）")
	}
}

func getWorkArea() RECT {
	var r RECT
	procSystemParametersInfo.Call(spiGetWorkArea, 0, uintptr(unsafe.Pointer(&r)), 0)
	if r.Right <= r.Left || r.Bottom <= r.Top {
		return RECT{0, 0, 1920, 1080}
	}
	return r
}

func getDPI(h uintptr) uint32 {
	if procGetDpiForWindow.Find() == nil {
		r, _, _ := procGetDpiForWindow.Call(h)
		if r != 0 {
			return uint32(r)
		}
	}
	return 96
}

func getExStyle(h uintptr) uint32 {
	r, _, _ := procGetWindowLongPtrW.Call(h, uintptr(gwlExStyle))
	return uint32(r)
}

func setExStyle(h uintptr, style uint32) {
	procSetWindowLongPtrW.Call(h, uintptr(gwlExStyle), uintptr(style))
}

func (a *App) setClickThrough(on bool) {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	if h == 0 {
		return
	}
	ex := getExStyle(h)
	if on {
		if ex&wsExTransparent != 0 {
			return
		}
		ex |= wsExTransparent
	} else {
		if ex&wsExTransparent == 0 {
			return
		}
		ex &^= wsExTransparent
	}
	setExStyle(h, ex)
}

func (a *App) applyInteractive() {
	a.mu.Lock()
	want := a.dragging || a.panelOpen
	a.mu.Unlock()
	if want {
		a.setClickThrough(false)
	}
}

func (a *App) applyFocusable(on bool) {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	if h == 0 {
		return
	}
	ex := getExStyle(h)
	if on {
		ex &^= wsExNoActivate
		ex &^= wsExAppWindow
		ex |= wsExToolWindow
		setExStyle(h, ex)
		procShowWindow.Call(h, swShowNoActivate)
		procSetForegroundWindow.Call(h)
	} else {
		ex |= wsExNoActivate | wsExToolWindow
		ex &^= wsExAppWindow
		setExStyle(h, ex)
	}
}

func (a *App) cursorLoop() {
	lastX, lastY := int32(-99999), int32(-99999)
	// 工作区 / DPI 很少变化：以前每 30ms 各查一次系统接口，空闲时纯属白烧 CPU。
	// 现在每 2 秒核对一次，切显示器或改缩放后仍能在数秒内纠正。
	wa := getWorkArea()
	probeScale := 1.0
	if dpi := getDPI(a.hwnd); dpi > 0 {
		probeScale = float64(dpi) / 96.0
	}
	lastProbe := time.Now()
	for {
		if a.hwnd == 0 {
			time.Sleep(200 * time.Millisecond)
			continue
		}
		now := time.Now()
		if now.Sub(lastProbe) > 2*time.Second {
			lastProbe = now
			wa = getWorkArea()
			dpi := getDPI(a.hwnd)
			if dpi <= 0 {
				dpi = 96
			}
			probeScale = float64(dpi) / 96.0
		}
		var p POINT
		if ok, _, _ := procGetCursorPos.Call(uintptr(unsafe.Pointer(&p))); ok == 0 {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		a.mu.Lock()
		changed := !a.hidden && (wa != a.workArea || probeScale != a.dpi)
		fsHidden := a.fsHidden
		if changed {
			oldWa, oldDpi := a.workArea, a.dpi
			a.workArea = wa
			a.dpi = probeScale
			crashLog("geo-change", fmt.Sprintf("wa %+v->%+v dpi %.2f->%.2f fsHidden=%v", oldWa, wa, oldDpi, probeScale, fsHidden))
			if !fsHidden {
				procSetWindowPos.Call(a.hwnd, hwndTopmost, uintptr(wa.Left), uintptr(wa.Top), uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top), swpNoActivate|swpShowWindow)
			}
		}
		px, py, ps, init := a.petX, a.petY, a.petScale, a.petInit
		panel, drag := a.panelOpen, a.dragging
		hit := a.hitBox
		// 气泡显示时 regionBoxes 里会多出气泡盒（hit=false）。光标落在气泡上时也需要窗口可交互，
		// 否则气泡看着挡住鼠标、实际点击却穿透到桌面（用户描述为“气泡偶尔吞掉鼠标动作”）。
		boxes := append([]RegionBox(nil), a.regionBoxes...)
		dpiScale := a.dpi
		a.mu.Unlock()
		if changed {
			a.updateWindowRegion(true)
		}

		cx := float64(p.X-wa.Left) / dpiScale
		cy := float64(p.Y-wa.Top) / dpiScale
		over := false
		if init {
			if hit.W > 0 && hit.H > 0 {
				over = cx >= hit.X-6 && cx <= hit.X+hit.W+6 && cy >= hit.Y-6 && cy <= hit.Y+hit.H+6
			} else {
				over = cx >= px+76*ps-6 && cx <= px+224*ps+6 && cy >= py+144*ps-6 && cy <= py+312*ps+6
			}
			// 气泡这类“可交互的软区域”才算，动作画布 / alpha 包络不算（否则会吞掉整片鼠标事件）
			if !over {
				for _, b := range boxes {
					if !b.Soft || b.W <= 0 || b.H <= 0 {
						continue
					}
					if cx >= b.X-4 && cx <= b.X+b.W+4 && cy >= b.Y-4 && cy <= b.Y+b.H+4 {
						over = true
						break
					}
				}
			}
		}
		want := over || panel || drag
		a.mu.Lock()
		a.interact = want
		a.mu.Unlock()
		// 每轮都按实际样式幂等校正：Wails / 系统在窗口样式被重置时可能把
		// WS_EX_TRANSPARENT 又加回来，只按「状态变化」切换会让桌宠卡在“点不到”。
		// setClickThrough 内部先读样式、已一致就直接返回，开销只有一次 GetWindowLong。
		a.setClickThrough(!want)
		if p.X != lastX || p.Y != lastY {
			lastX, lastY = p.X, p.Y
			a.emit("cursor", map[string]interface{}{"x": cx, "y": cy, "over": over})
		}
		// 光标在桌宠附近、正在拖拽或开着面板时才需要高频率（16ms）；
		// 其它时候 60ms 足够，空闲唤醒次数降一半。
		sleep := 60 * time.Millisecond
		near := false
		if init && hit.W > 0 && hit.H > 0 {
			near = cx >= hit.X-90 && cx <= hit.X+hit.W+90 && cy >= hit.Y-90 && cy <= hit.Y+hit.H+90
		}
		if drag || panel || over || near {
			sleep = 16 * time.Millisecond
		}
		time.Sleep(sleep)
	}
}

func (a *App) hideWindow() {
	a.mu.Lock()
	a.hidden = true
	a.fsHidden = false
	a.fsHiddenAt = time.Time{}
	a.fsDecider.release()
	h := a.hwnd
	a.mu.Unlock()
	if h != 0 {
		procShowWindow.Call(h, swHide)
	}
	// 藏起来前把攒下的状态落盘，之后可能长时间不再有交互
	a.flushStateIfDirty()
	// 藏起来时把内存还给系统（此时不会有渲染压力，回收代价最低）
	go a.releaseMemory()
}

func (a *App) showInactive() {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	if h == 0 {
		return
	}
	// 全屏应用还在前台时先不露头，等退出全屏后由 fullscreenLoop 恢复。
	// 这里必须把 hidden 置 false：否则“先手动隐藏 → 全屏时点显示 → 退出全屏”之后
	// hidden 仍为 true，恢复分支按 !hidden 判定就永远不把窗口放回来。
	// 窗口暂时不可见由 fsHidden（全屏抑制）表达，状态与画面仍是一致的。
	if a.fullscreenEnabled() && immersiveFullscreenActive() {
		a.mu.Lock()
		a.hidden = false
		a.fsHidden = true
		a.fsDecider.suppress()
		a.mu.Unlock()
		return
	}
	a.mu.Lock()
	a.hidden = false
	a.fsHidden = false
	a.fsHiddenAt = time.Time{}
	a.fsDecider.release()
	a.mu.Unlock()
	ensureTopmost(h)
	procShowWindow.Call(h, swShowNoActivate)
	a.fixAeroBlur(h) // Win10：窗口重新显示后确保毛玻璃层没被带回来
	a.applyInteractive()
	a.updateWindowRegion(true)
}

func (a *App) windowVisible() bool {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	if h == 0 {
		return false
	}
	r, _, _ := procIsWindowVisible.Call(h)
	return r != 0
}

func hiddenProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}

func runtimeEventsEmit(ctx context.Context, name string, payload interface{}) {
	runtime.EventsEmit(ctx, name, payload)
}

func quitApp(ctx context.Context) {
	runtime.Quit(ctx)
}

func openFileDialog(ctx context.Context, title, appLabel, allLabel string) (string, error) {
	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: appLabel, Pattern: "*.exe;*.lnk;*.bat;*.cmd"},
			{DisplayName: allLabel, Pattern: "*.*"},
		},
	})
}

// pickPackFile 弹「选择形象包 .zip」对话框。前端早期误用了 Wails v1 的
// window.runtime.OpenFileDialog（v2 已不存在），改由后端统一弹框。
func pickPackFile(ctx context.Context, title, packLabel, allLabel string) (string, error) {
	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: packLabel, Pattern: "*.zip"},
			{DisplayName: allLabel, Pattern: "*.*"},
		},
	})
}

func openURL(ctx context.Context, url string) error {
	if url == "" {
		return errors.New("empty url")
	}
	runtime.BrowserOpenURL(ctx, url)
	return nil
}

func (a *App) DebugState() map[string]interface{} {
	a.mu.Lock()
	defer a.mu.Unlock()
	var p POINT
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	return map[string]interface{}{
		"hwnd": a.hwnd, "petX": a.petX, "petY": a.petY, "petScale": a.petScale,
		"petInit": a.petInit, "interactive": a.interact, "panel": a.panelOpen,
		"dragging": a.dragging, "focusable": a.focusable, "hidden": a.hidden, "fsHidden": a.fsHidden,
		"dpi": a.dpi, "workArea": a.workArea, "cursorX": p.X, "cursorY": p.Y,
		"pomoRunning": a.pomo.running, "trayReady": a.trayReady,
		"regionSet": a.regionSet, "regionFull": a.regionFull, "region": a.regionLast,
		"variant": Variant, "regionBoxes": len(a.regionBoxes), "hitBox": a.hitBox,
		"build": windowsBuildNumber(), "accentFixed": a.accentFixed,
	}
}

// 窗口没有 Region（整窗）时 GetWindowRgn 返回 ERROR；有 Region 时返回具体类型。
func windowRegionIsFull(h uintptr) bool {
	rgn, _, _ := procCreateRectRgn.Call(0, 0, 0, 0)
	if rgn == 0 {
		return false
	}
	defer procDeleteObject.Call(rgn)
	t, _, _ := procGetWindowRgn.Call(h, rgn)
	return t == 0
}

func (a *App) updateWindowRegion(force bool) {
	a.regionMu.Lock()
	if force {
		a.regionAt = time.Time{}
	} else if time.Since(a.regionAt) < regionMinInterval {
		// 节流期间的更新不能直接丢：最后一次上报被丢掉的话，Region 会停在旧位置，
		// 桌宠边缘就被裁掉一块。这里记一个待处理标记，节流窗口结束后补刷一次。
		if !a.regionPending {
			a.regionPending = true
			time.AfterFunc(regionMinInterval, func() {
				a.regionMu.Lock()
				a.regionPending = false
				a.regionMu.Unlock()
				a.updateWindowRegion(false)
			})
		}
		a.regionMu.Unlock()
		return
	}
	defer a.regionMu.Unlock()
	a.mu.Lock()
	h := a.hwnd
	wa := a.workArea
	dpi := a.dpi
	px, py, ps, init := a.petX, a.petY, a.petScale, a.petInit
	panel, drag, hidden := a.panelOpen, a.dragging, a.hidden
	hold := time.Now().Before(a.panelHold) || time.Now().Before(a.regionHold)
	boxes := append([]RegionBox(nil), a.regionBoxes...)
	a.mu.Unlock()
	if h == 0 || hidden || dpi <= 0 {
		return
	}
	full := panel || drag || hold
	if full {
		// 不能只信 regionFull 标志：窗口样式/显隐变化后系统可能重置 Region，
		// 此时标志仍是 true，菜单会落在桌宠 Region 外，表现为显示不全且点不动。
		if a.regionSet && a.regionFull && windowRegionIsFull(h) {
			a.regionAt = time.Now()
			return
		}
		ok, _, _ := procSetWindowRgn.Call(h, 0, 1)
		if ok == 0 {
			time.Sleep(2 * time.Millisecond)
			ok, _, _ = procSetWindowRgn.Call(h, 0, 1)
		}
		if ok == 0 {
			a.regionFull = false
			a.regionAt = time.Now()
			return
		}
		a.regionSet = true
		a.regionFull = true
		a.regionSig = ""
		a.regionAt = time.Now()
		return
	}
	if !init {
		boxes = []RegionBox{{X: 0, Y: 0, W: 1, H: 1, Hit: true}}
	} else if len(boxes) == 0 {
		// 前端尚未上报时的兜底：尽量贴近 #hit 的实际可见范围
		boxes = []RegionBox{{X: px + 76*ps, Y: py + 132*ps, W: 150 * ps, H: 187 * ps, Hit: true}}
	}
	ww := float64(wa.Right - wa.Left)
	wh := float64(wa.Bottom - wa.Top)
	var rects []pixRect
	minX, minY := int32(1<<30), int32(1<<30)
	maxX, maxY := int32(-1), int32(-1)
	for _, b := range boxes {
		if !(b.W > 0) || !(b.H > 0) {
			continue
		}
		x0 := int32(b.X * dpi)
		y0 := int32(b.Y * dpi)
		x1 := int32((b.X + b.W) * dpi)
		y1 := int32((b.Y + b.H) * dpi)
		if x0 < 0 {
			x0 = 0
		}
		if y0 < 0 {
			y0 = 0
		}
		if x1 > int32(ww) {
			x1 = int32(ww)
		}
		if y1 > int32(wh) {
			y1 = int32(wh)
		}
		if x1 <= x0 || y1 <= y0 {
			continue
		}
		rects = append(rects, pixRect{x0, y0, x1, y1})
		if x0 < minX {
			minX = x0
		}
		if y0 < minY {
			minY = y0
		}
		if x1 > maxX {
			maxX = x1
		}
		if y1 > maxY {
			maxY = y1
		}
	}
	if len(rects) == 0 {
		return
	}
	sig := fmt.Sprintf("%v", rects)
	if a.regionSet && !a.regionFull && a.regionSig == sig {
		return
	}
	union, _, _ := procCreateRectRgn.Call(0, 0, 0, 0)
	if union == 0 {
		return
	}
	for _, r := range rects {
		rr, _, _ := procCreateRectRgn.Call(uintptr(r.x0), uintptr(r.y0), uintptr(r.x1), uintptr(r.y1))
		if rr != 0 {
			procCombineRgn.Call(union, union, rr, rgnOr)
			procDeleteObject.Call(rr)
		}
	}
	ok, _, _ := procSetWindowRgn.Call(h, union, 1)
	if ok == 0 {
		procDeleteObject.Call(union)
		return
	}
	a.regionSet = true
	a.regionFull = false
	a.regionLast = RECT{minX, minY, maxX, maxY}
	a.regionSig = sig
	a.regionAt = time.Now()
}

// ---------------- DPAPI ----------------

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func dpapiProtect(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty data")
	}
	in := dataBlob{cbData: uint32(len(data)), pbData: &data[0]}
	var out dataBlob
	r, _, err := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(&in)), 0, 0, 0, 0, 0x1,
		uintptr(unsafe.Pointer(&out)),
	)
	if r == 0 {
		return nil, err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	buf := unsafe.Slice(out.pbData, out.cbData)
	res := make([]byte, len(buf))
	copy(res, buf)
	return res, nil
}

func dpapiUnprotect(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty data")
	}
	in := dataBlob{cbData: uint32(len(data)), pbData: &data[0]}
	var out dataBlob
	r, _, err := procCryptUnprotectData.Call(
		uintptr(unsafe.Pointer(&in)), 0, 0, 0, 0, 0x1,
		uintptr(unsafe.Pointer(&out)),
	)
	if r == 0 {
		return nil, err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	buf := unsafe.Slice(out.pbData, out.cbData)
	res := make([]byte, len(buf))
	copy(res, buf)
	return res, nil
}

func setCursorPhysical(x, y int) {
	procSetCursorPos.Call(uintptr(x), uintptr(y))
}

func mouseClick(button string) {
	down, up := uintptr(2), uintptr(4)
	if button == "right" {
		down, up = 8, 16
	}
	procMouseEvent.Call(down, 0, 0, 0, 0)
	procMouseEvent.Call(up, 0, 0, 0, 0)
}
