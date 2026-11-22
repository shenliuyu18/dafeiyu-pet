package main

// 原生界面的语言（托盘、文件选择框、气泡通知）。前端语言保存在 state.lang，
// 这里用原子值缓存，避免托盘绘制时与状态锁互相等待。

import (
	"sync/atomic"

	"golang.org/x/sys/windows"
)

var uiLangStore atomic.Value

var procGetUserDefaultUILanguage = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage")

// 系统 UI 语言：中文 / 日语之外的区域一律用英语。
func langFromLANGID(id uint32) string {
	switch id & 0x3ff {
	case 0x04:
		return "zh"
	case 0x11:
		return "ja"
	}
	return "en"
}

func systemUILang() string {
	r, _, _ := procGetUserDefaultUILanguage.Call()
	return langFromLANGID(uint32(r))
}

func init() { uiLangStore.Store(systemUILang()) }

func normalizeLang(v string) string {
	switch v {
	case "en", "ja":
		return v
	}
	return "zh"
}

func (a *App) setUILang(v string) { uiLangStore.Store(normalizeLang(v)) }

func (a *App) uiLang() string {
	if v, ok := uiLangStore.Load().(string); ok {
		return normalizeLang(v)
	}
	return "zh"
}

func (a *App) displayName() string {
	return a.t("大肥鱼桌宠", "Big Fat Fish Desktop Pet", "大肥魚デスクトップペット")
}

func (a *App) t(zh, en, ja string) string {
	switch a.uiLang() {
	case "en":
		return en
	case "ja":
		return ja
	}
	return zh
}
