package main

import (
	"fmt"
	"runtime"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	wmApp          = 0x8000
	wmTrayCallback = wmApp + 1
	wmTrayMenu     = wmApp + 2
	nifMessage     = 0x00000001
	nifIcon        = 0x00000002
	nifTip         = 0x00000004
	nifInfo        = 0x00000010
	nimAdd         = 0x00000000
	nimModify      = 0x00000001
	nimDelete      = 0x00000002
	imageIcon      = 1
	lrLoadFromFile = 0x00000010
	lrDefaultSize  = 0x00000040
	mfString       = 0x00000000
	mfSeparator    = 0x00000800
	tpmRightButton = 0x00000002
	tpmReturnCmd   = 0x00000100
	tpmNoNotify    = 0x00000080
	niifInfo       = 0x00000001
	niifWarning    = 0x00000002
	niifError      = 0x00000003
	wmDestroy      = 0x0002
	idiApplication = 32512
)

var (
	shell32              = windows.NewLazySystemDLL("shell32.dll")
	procShellNotifyIcon  = shell32.NewProc("Shell_NotifyIconW")
	procLoadImageW       = user32.NewProc("LoadImageW")
	procLoadIconW        = user32.NewProc("LoadIconW")
	procRegisterClassEx  = user32.NewProc("RegisterClassExW")
	procCreateWindowEx   = user32.NewProc("CreateWindowExW")
	procDefWindowProc    = user32.NewProc("DefWindowProcW")
	procGetMessage       = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessage  = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procCreatePopupMenu  = user32.NewProc("CreatePopupMenu")
	procAppendMenu       = user32.NewProc("AppendMenuW")
	procTrackPopupMenu   = user32.NewProc("TrackPopupMenu")
	procDestroyMenu      = user32.NewProc("DestroyMenu")
	procGetModuleHandle  = kernel32.NewProc("GetModuleHandleW")
	procSetForeground    = user32.NewProc("SetForegroundWindow")
	procPostMessage      = user32.NewProc("PostMessageW")

	trayWndProcCallback uintptr
	trayInst            *Tray
	trayClassName       = "DafeiyuTrayWindow"
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type msgStruct struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      POINT
}

type notifyIconData struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
	dwState          uint32
	dwStateMask      uint32
	szInfo           [256]uint16
	uTimeout         uint32
	szInfoTitle      [64]uint16
	dwInfoFlags      uint32
	guidItem         [16]byte
	hBalloonIcon     uintptr
}

type Tray struct {
	app  *App
	mu   sync.Mutex
	hwnd uintptr
	nid  notifyIconData
	icon uintptr
}

func utf16Copy(dst []uint16, s string) {
	u, _ := syscall.UTF16FromString(s)
	if len(u) > len(dst) {
		u = u[:len(dst)]
		u[len(u)-1] = 0
	}
	copy(dst, u)
}

func (t *Tray) wndProc(hwnd, msg, wp, lp uintptr) uintptr {
	if msg == wmTrayMenu {
		t.showMenu()
		return 0
	}
	if msg == wmTrayCallback {
		mouse := uint32(lp) & 0xffff
		switch mouse {
		case 0x0202: // WM_LBUTTONUP
			t.app.toggleVisible()
			return 0
		case 0x0205: // WM_RBUTTONUP
			t.showMenu()
			return 0
		case 0x0400: // NIN_BALLOONUSERCLICK
			t.app.showInactive()
			return 0
		}
	}
	if msg == wmDestroy {
		procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProc.Call(hwnd, msg, wp, lp)
	return r
}

func (a *App) startTray() {
	t := &Tray{app: a}
	a.mu.Lock()
	a.tray = t
	a.mu.Unlock()
	t.run()
}

func (t *Tray) run() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	hInst, _, _ := procGetModuleHandle.Call(0)
	cn, _ := syscall.UTF16PtrFromString(trayClassName)
	if trayWndProcCallback == 0 {
		trayWndProcCallback = syscall.NewCallback(func(hwnd, msg, wp, lp uintptr) uintptr {
			if trayInst != nil {
				return trayInst.wndProc(hwnd, msg, wp, lp)
			}
			r, _, _ := procDefWindowProc.Call(hwnd, msg, wp, lp)
			return r
		})
	}
	wc := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   trayWndProcCallback,
		hInstance:     hInst,
		lpszClassName: cn,
	}
	procRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	hwnd, _, _ := procCreateWindowEx.Call(0, uintptr(unsafe.Pointer(cn)), uintptr(unsafe.Pointer(cn)), 0, 0, 0, 0, 0, 0, 0, hInst, 0)
	if hwnd == 0 {
		return
	}
	t.hwnd = hwnd
	trayInst = t

	var icon uintptr
	if p, err := t.app.assetFile("icon.ico"); err == nil {
		ip, _ := syscall.UTF16PtrFromString(p)
		icon, _, _ = procLoadImageW.Call(0, uintptr(unsafe.Pointer(ip)), imageIcon, 32, 32, lrLoadFromFile|lrDefaultSize)
	}
	if icon == 0 {
		icon, _, _ = procLoadIconW.Call(0, idiApplication)
	}
	t.icon = icon
	t.nid = notifyIconData{
		hWnd:             hwnd,
		uID:              1,
		uFlags:           nifMessage | nifIcon | nifTip,
		uCallbackMessage: wmTrayCallback,
		hIcon:            icon,
	}
	t.nid.cbSize = uint32(unsafe.Sizeof(t.nid))
	utf16Copy(t.nid.szTip[:], appName())
	if r, _, _ := procShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&t.nid))); r != 0 {
		t.app.mu.Lock()
		t.app.trayReady = true
		t.app.mu.Unlock()
	}

	var msg msgStruct
	for {
		r, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&msg)))
	}
}

func (a *App) stopTray() {
	a.mu.Lock()
	t := a.tray
	a.mu.Unlock()
	if t == nil {
		return
	}
	t.mu.Lock()
	if t.hwnd != 0 {
		procShellNotifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&t.nid)))
		procPostMessage.Call(t.hwnd, wmDestroy, 0, 0)
	}
	t.mu.Unlock()
}

func (a *App) trayRefresh() {
	a.mu.Lock()
	t := a.tray
	a.mu.Unlock()
	if t == nil {
		return
	}
	tip := a.pomoTooltip()
	t.mu.Lock()
	if t.nid.cbSize != 0 {
		utf16Copy(t.nid.szTip[:], tip)
		t.nid.uFlags |= nifTip
		procShellNotifyIcon.Call(nimModify, uintptr(unsafe.Pointer(&t.nid)))
	}
	t.mu.Unlock()
}

func (a *App) balloon(kind, title, content string) {
	a.mu.Lock()
	t := a.tray
	a.mu.Unlock()
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.nid.cbSize == 0 {
		return
	}
	n := t.nid
	utf16Copy(n.szInfoTitle[:], title)
	utf16Copy(n.szInfo[:], content)
	n.dwInfoFlags = niifInfo
	if kind == "error" {
		n.dwInfoFlags = niifWarning
	} else if kind == "truncated" {
		n.dwInfoFlags = niifError
	}
	n.uTimeout = 10000
	n.uFlags |= nifInfo
	procShellNotifyIcon.Call(nimModify, uintptr(unsafe.Pointer(&n)))
}

func (t *Tray) showMenu() {
	var pt POINT
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)
	a := t.app
	visible := a.windowVisible()
	add := func(id int, label string) {
		u, _ := syscall.UTF16PtrFromString(label)
		procAppendMenu.Call(menu, mfString, uintptr(id), uintptr(unsafe.Pointer(u)))
	}
	sep := func() { procAppendMenu.Call(menu, mfSeparator, 0, 0) }

	if visible {
		add(1, "🙈  藏起桌宠")
	} else {
		add(1, "🐟  叫出桌宠")
	}
	add(2, "🍚  投喂")
	if a.pomoRunning() {
		add(3, fmt.Sprintf("🍅  结束专注（剩 %s）", clockLeft(a.pomoStatusRemaining())))
	} else {
		add(3, fmt.Sprintf("🍅  开始专注 %d 分钟", a.pomoMinutes()))
	}
	add(4, "🎬  选个动作…")
	if a.ledgerOn() {
		add(5, a.trayLedgerLabel())
	}
	sep()
	add(6, "⚙️  设置")
	add(7, "📊  看看状态")
	add(8, "退出")
	procSetForeground.Call(t.hwnd)
	cmd, _, _ := procTrackPopupMenu.Call(menu, tpmReturnCmd|tpmNoNotify|tpmRightButton, uintptr(pt.X), uintptr(pt.Y), 0, t.hwnd, 0)
	switch cmd {
	case 1:
		a.toggleVisible()
	case 2:
		a.doFeed()
	case 3:
		if a.pomoRunning() {
			a.stopPomodoro()
		} else {
			a.startPomodoro()
		}
	case 4:
		a.showInactive()
		a.emit("show-picker", nil)
	case 5:
		l := a.refreshUsage()
		a.emit("show-usage", l)
	case 6:
		a.showInactive()
		a.emit("show-settings", nil)
	case 7:
		a.showInactive()
		a.emit("show-status", nil)
	case 8:
		a.Quit()
	}
}

func (a *App) toggleVisible() {
	if a.windowVisible() {
		a.hideWindow()
	} else {
		a.showInactive()
	}
}

func (a *App) pomoRunning() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.pomo.running
}

func (a *App) pomoStatusRemaining() int64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.pomo.running {
		return 0
	}
	left := time.Until(a.pomo.endsAt)
	if left < 0 {
		return 0
	}
	return left.Milliseconds()
}

func clockLeft(ms int64) string {
	total := int((ms + 999) / 1000)
	return fmt.Sprintf("%02d:%02d", total/60, total%60)
}

func (a *App) trayLedgerLabel() string {
	a.mu.Lock()
	l := a.ledger
	a.mu.Unlock()
	if l == nil {
		return "🍚  白饭账本"
	}
	if src := strv(l["source"], "qoder"); src != "qoder" {
		short := strv(l["providerShort"], "API")
		if rows, ok := l["rows"].([]map[string]string); ok && len(rows) > 0 {
			return "🍚  " + short + " " + rows[0]["value"]
		}
		return "🍚  " + short
	}
	if boolv(l["available"], false) {
		return fmt.Sprintf("🍚  本月白饭 %v credits", l["month"])
	}
	return "🍚  白饭账本"
}
