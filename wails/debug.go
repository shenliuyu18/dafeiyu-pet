package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	mrun "runtime"
	dbg "runtime/debug"
	"strconv"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// 仅 --dev-debug 启用的本机调试桥：POST /js 执行页面 JS；JS 可用 App.DebugLog 回传。
var (
	debugMu   sync.Mutex
	debugLast string
)

func (a *App) DebugLog(msg string) {
	debugMu.Lock()
	debugLast = msg
	debugMu.Unlock()
	p := filepath.Join(os.TempDir(), "dafeiyu-wails-debug.log")
	f, err := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		defer f.Close()
		fmt.Fprintf(f, "[%s] %s\n", time.Now().Format(time.RFC3339), msg)
	}
}

func startDebugServer(a *App) {
	mux := http.NewServeMux()
	mux.HandleFunc("/state", func(w http.ResponseWriter, r *http.Request) {
		b, _ := json.Marshal(a.DebugState())
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/js", func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if a.ctx == nil {
			http.Error(w, "no context", 503)
			return
		}
		runtime.WindowExecJS(a.ctx, string(b))
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/last", func(w http.ResponseWriter, r *http.Request) {
		debugMu.Lock()
		s := debugLast
		debugMu.Unlock()
		w.Write([]byte(s))
	})
	mux.HandleFunc("/cursor", func(w http.ResponseWriter, r *http.Request) {
		x, _ := strconv.Atoi(r.URL.Query().Get("x"))
		y, _ := strconv.Atoi(r.URL.Query().Get("y"))
		setCursorPhysical(x, y)
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/click", func(w http.ResponseWriter, r *http.Request) {
		mouseClick(r.URL.Query().Get("button"))
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/traymenu", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		tr := a.tray
		a.mu.Unlock()
		if tr != nil && tr.hwnd != 0 {
			procPostMessage.Call(tr.hwnd, wmTrayMenu, 0, 0)
		}
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/fullscreen", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		h := a.hwnd
		a.mu.Unlock()
		resp := a.FullscreenDiagnostics()
		resp["visible"] = a.windowVisible()
		resp["hwnd"] = h
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
	mux.HandleFunc("/ledger", func(w http.ResponseWriter, r *http.Request) {
		var l map[string]interface{}
		if r.URL.Query().Get("refresh") == "1" {
			l = a.RefreshUsage()
		} else {
			a.mu.Lock()
			l = a.ledger
			a.mu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"source": a.ledgerSource(),
			"ledger": l,
		})
	})
	mux.HandleFunc("/resume", func(w http.ResponseWriter, r *http.Request) {
		a.scheduleResumeCheck()
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/resume-restart", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		a.state["lastResumeRestart"] = 0
		a.mu.Unlock()
		a.restartAfterResume("调试模拟")
		w.Write([]byte("ok"))
	})
	// 只在 --dev-debug 下暴露：手动切换窗口 AccentPolicy，用来在 Win11 上复现 / 验证
	// Win10 才走到的毛玻璃分支（state=blur 复现，state=fix 走我们自己的修复，state=off 清除）
	mux.HandleFunc("/accent", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		h := a.hwnd
		a.mu.Unlock()
		var state, flags uint32
		switch r.URL.Query().Get("state") {
		case "blur":
			state, flags = accentEnableBlurBehind, 2
		case "fix", "off":
			// fix = 实际发布的修复：清掉 accent（透明渐变会被渲染成不透明纯色，不能用）
			state = accentDisabled
		default:
			http.Error(w, "state=blur|fix|off", 400)
			return
		}
		ok := applyAccentPolicy(h, state, flags, 0)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "state": state, "hwnd": h})
	})
	mux.HandleFunc("/mem", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("gc") == "1" {
			mrun.GC()
			dbg.FreeOSMemory()
		}
		var ms mrun.MemStats
		mrun.ReadMemStats(&ms)
		out := map[string]interface{}{
			"heapAllocMB": round1(float64(ms.HeapAlloc) / 1048576),
			"heapSysMB":   round1(float64(ms.HeapSys) / 1048576),
			"sysMB":       round1(float64(ms.Sys) / 1048576),
			"numGC":       ms.NumGC,
			"goroutines":  mrun.NumGoroutine(),
		}
		if petAssets != nil {
			out["assets"] = petAssets.stats()
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})
	mux.HandleFunc("/boxes", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		out := map[string]interface{}{
			"regionBoxes": a.regionBoxes,
			"hitBox":      a.hitBox,
			"petX":        a.petX,
			"petY":        a.petY,
			"dpi":         a.dpi,
		}
		a.mu.Unlock()
		a.regionMu.Lock()
		out["regionLast"] = a.regionLast
		out["regionFull"] = a.regionFull
		a.regionMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})
	mux.HandleFunc("/quit", func(w http.ResponseWriter, r *http.Request) {
		a.Quit()
		w.Write([]byte("bye"))
	})
	port := 9336 + instanceSlot - 1
	_ = http.ListenAndServe(fmt.Sprintf("127.0.0.1:%d", port), mux)
}
