package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
		fsHidden, hidden, h := a.fsHidden, a.hidden, a.hwnd
		a.mu.Unlock()
		resp := map[string]interface{}{
			"active":   immersiveFullscreenActive(),
			"fsHidden": fsHidden,
			"hidden":   hidden,
			"visible":  a.windowVisible(),
			"hwnd":     h,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
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
	mux.HandleFunc("/quit", func(w http.ResponseWriter, r *http.Request) {
		a.Quit()
		w.Write([]byte("bye"))
	})
	_ = http.ListenAndServe("127.0.0.1:9336", mux)
}
