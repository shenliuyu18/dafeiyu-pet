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
	swpNoActivate    = 0x0010
	swpShowWindow    = 0x0040
	swpFrameChanged  = 0x0020
	spiGetWorkArea   = 0x0030
	rgnOr            = 2
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
	procIsWindowVisible          = user32.NewProc("IsWindowVisible")
	procGetCursorPos             = user32.NewProc("GetCursorPos")
	procSetCursorPos             = user32.NewProc("SetCursorPos")
	procMouseEvent               = user32.NewProc("mouse_event")
	procGetDpiForWindow          = user32.NewProc("GetDpiForWindow")
	procSystemParametersInfo     = user32.NewProc("SystemParametersInfoW")
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	procSetWindowRgn             = user32.NewProc("SetWindowRgn")
	procGetWindowRgn             = user32.NewProc("GetWindowRgn")
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
	a.mu.Lock()
	a.workArea = wa
	a.dpi = float64(dpi) / 96.0
	a.mu.Unlock()

	ex := getExStyle(h)
	ex &^= wsExAppWindow
	ex |= wsExToolWindow | wsExNoActivate | wsExTransparent
	setExStyle(h, ex)
	// 先铺满工作区再显示，避免 800×600 的闪烁
	procSetWindowPos.Call(h, hwndTopmost, uintptr(wa.Left), uintptr(wa.Top), uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top), swpNoActivate|swpShowWindow|swpFrameChanged)
	procShowWindow.Call(h, swShowNoActivate)
	a.updateWindowRegion(true)
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
	for {
		if a.hwnd == 0 {
			time.Sleep(200 * time.Millisecond)
			continue
		}
		var p POINT
		if ok, _, _ := procGetCursorPos.Call(uintptr(unsafe.Pointer(&p))); ok == 0 {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		wa := getWorkArea()
		dpi := getDPI(a.hwnd)
		if dpi <= 0 {
			dpi = 96
		}
		scale := float64(dpi) / 96.0
		a.mu.Lock()
		changed := !a.hidden && (wa != a.workArea || scale != a.dpi)
		if changed {
			a.workArea = wa
			a.dpi = scale
			procSetWindowPos.Call(a.hwnd, hwndTopmost, uintptr(wa.Left), uintptr(wa.Top), uintptr(wa.Right-wa.Left), uintptr(wa.Bottom-wa.Top), swpNoActivate|swpShowWindow)
		}
		px, py, ps, init := a.petX, a.petY, a.petScale, a.petInit
		panel, drag := a.panelOpen, a.dragging
		hit := a.hitBox
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
		}
		want := over || panel || drag
		if want != a.interact {
			a.interact = want
			a.setClickThrough(!want)
		}
		if p.X != lastX || p.Y != lastY {
			lastX, lastY = p.X, p.Y
			a.emit("cursor", map[string]interface{}{"x": cx, "y": cy, "over": over})
		}
		time.Sleep(30 * time.Millisecond)
	}
}

func (a *App) hideWindow() {
	a.mu.Lock()
	a.hidden = true
	h := a.hwnd
	a.mu.Unlock()
	if h != 0 {
		procShowWindow.Call(h, swHide)
	}
}

func (a *App) showInactive() {
	a.mu.Lock()
	a.hidden = false
	h := a.hwnd
	a.mu.Unlock()
	if h != 0 {
		procShowWindow.Call(h, swShowNoActivate)
	}
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

func openFileDialog(ctx context.Context) (string, error) {
	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title: "选择要和桌宠一起启动的应用",
		Filters: []runtime.FileFilter{
			{DisplayName: "应用 / 快捷方式", Pattern: "*.exe;*.lnk;*.bat;*.cmd"},
			{DisplayName: "所有文件", Pattern: "*.*"},
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
		"dragging": a.dragging, "focusable": a.focusable, "hidden": a.hidden,
		"dpi": a.dpi, "workArea": a.workArea, "cursorX": p.X, "cursorY": p.Y,
		"pomoRunning": a.pomo.running, "trayReady": a.trayReady,
		"regionSet": a.regionSet, "regionFull": a.regionFull, "region": a.regionLast,
		"variant": Variant, "regionBoxes": len(a.regionBoxes), "hitBox": a.hitBox,
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
	defer a.regionMu.Unlock()
	if force {
		a.regionAt = time.Time{}
	} else if time.Since(a.regionAt) < 60*time.Millisecond {
		return
	}
	a.mu.Lock()
	h := a.hwnd
	wa := a.workArea
	dpi := a.dpi
	px, py, ps, init := a.petX, a.petY, a.petScale, a.petInit
	panel, drag, hidden := a.panelOpen, a.dragging, a.hidden
	hold := time.Now().Before(a.panelHold)
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
