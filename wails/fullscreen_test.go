package main

import (
	"syscall"
	"testing"
	"unsafe"
)

func createTestWindow(t *testing.T, x, y, w, h int32) uintptr {
	t.Helper()
	user32 := syscall.NewLazyDLL("user32.dll")
	createWindow := user32.NewProc("CreateWindowExW")
	cls, _ := syscall.UTF16PtrFromString("STATIC")
	title, _ := syscall.UTF16PtrFromString("fullscreen-test")
	const wsPopup = 0x80000000
	hwnd, _, err := createWindow.Call(
		0, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title)), wsPopup,
		uintptr(x), uintptr(y), uintptr(w), uintptr(h), 0, 0, 0, 0,
	)
	if hwnd == 0 {
		t.Fatalf("CreateWindowExW: %v", err)
	}
	return hwnd
}

func destroyTestWindow(h uintptr) {
	user32 := syscall.NewLazyDLL("user32.dll")
	destroyWindow := user32.NewProc("DestroyWindow")
	destroyWindow.Call(h)
}

func TestWindowCoversMonitor(t *testing.T) {
	user32 := syscall.NewLazyDLL("user32.dll")
	getSystemMetrics := user32.NewProc("GetSystemMetrics")
	screenW, _, _ := getSystemMetrics.Call(0)
	screenH, _, _ := getSystemMetrics.Call(1)
	if screenW == 0 || screenH == 0 {
		t.Fatal("GetSystemMetrics failed")
	}

	full := createTestWindow(t, 0, 0, int32(screenW), int32(screenH))
	defer destroyTestWindow(full)
	if !windowCoversMonitor(full) {
		t.Fatal("fullscreen-sized borderless window should cover the monitor")
	}

	small := createTestWindow(t, 100, 100, 320, 200)
	defer destroyTestWindow(small)
	if windowCoversMonitor(small) {
		t.Fatal("small window must not be treated as fullscreen")
	}
}

func TestShellWindowClassesExcluded(t *testing.T) {
	for _, cls := range []string{"Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"} {
		if !shellWindowClasses[cls] {
			t.Fatalf("%s should be excluded from fullscreen detection", cls)
		}
	}
}

func TestDecideQUNSRequiresGeometry(t *testing.T) {
	cases := []struct {
		state   uint32
		covered bool
		want    bool
	}{
		// 2/3/4 可能全屏，但必须几何确认
		{3, false, false},
		{3, true, true},
		{2, false, false},
		{2, true, true},
		{4, false, false},
		{4, true, true},
		// 5/6 明确不是全屏（资源管理器铺满也不该隐藏桌宠）
		{5, true, false},
		{5, false, false},
		{6, true, false},
		// 1（锁屏）及其它一律忽略
		{1, true, false},
		{0, true, false},
	}
	for _, c := range cases {
		got, signal := decideQUNS(c.state, c.covered)
		if got != c.want {
			t.Fatalf("QUNS=%d covered=%v: want active=%v, got %v (%s)", c.state, c.covered, c.want, got, signal)
		}
	}
}
