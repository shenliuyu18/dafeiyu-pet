package main

import (
	"syscall"
	"testing"
	"unsafe"
)

func TestWindowRegionIsFull(t *testing.T) {
	user32 := syscall.NewLazyDLL("user32.dll")
	gdi32 := syscall.NewLazyDLL("gdi32.dll")
	createWindow := user32.NewProc("CreateWindowExW")
	destroyWindow := user32.NewProc("DestroyWindow")
	createRectRgn := gdi32.NewProc("CreateRectRgn")
	setWindowRgn := user32.NewProc("SetWindowRgn")

	cls, _ := syscall.UTF16PtrFromString("STATIC")
	title, _ := syscall.UTF16PtrFromString("region-test")
	h, _, err := createWindow.Call(0, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title)), 0, 0, 0, 100, 100, 0, 0, 0, 0)
	if h == 0 {
		t.Fatalf("CreateWindowExW: %v", err)
	}
	defer destroyWindow.Call(h)

	rgn, _, _ := createRectRgn.Call(0, 0, 50, 50)
	if rgn == 0 {
		t.Fatal("CreateRectRgn failed")
	}
	if ok, _, _ := setWindowRgn.Call(h, rgn, 0); ok == 0 {
		t.Fatal("SetWindowRgn(pet region) failed")
	}
	if windowRegionIsFull(h) {
		t.Fatal("window with a partial region reported as full")
	}

	if ok, _, _ := setWindowRgn.Call(h, 0, 0); ok == 0 {
		t.Fatal("SetWindowRgn(full) failed")
	}
	if !windowRegionIsFull(h) {
		t.Fatal("window without a region should report full")
	}
}
