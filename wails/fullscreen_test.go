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
