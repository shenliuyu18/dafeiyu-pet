package main

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

type diagFile struct {
	name string
	data []byte
}

func sanitizeStateForDiagnostics(st map[string]interface{}, keysConfigured map[string]bool) map[string]interface{} {
	out := make(map[string]interface{}, len(st))
	for k, v := range st {
		switch k {
		case "apiKeys", "deepseekKey", "customQuips", "launchApp":
			continue
		default:
			out[k] = v
		}
	}
	out["apiKeysRemoved"] = true
	out["apiKeyConfigured"] = keysConfigured
	out["customQuipsCount"] = len(toStrings(st["customQuips"]))
	if str(st["launchApp"], "") != "" {
		out["launchApp"] = "<redacted>"
	}
	return out
}

func sanitizeLedgerForDiagnostics(l map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(l))
	for k, v := range l {
		if k == "sessionId" {
			continue
		}
		out[k] = v
	}
	return out
}

func readLogTail(path string, max int64) []byte {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil
	}
	off := int64(0)
	if st.Size() > max {
		off = st.Size() - max
	}
	buf := make([]byte, st.Size()-off)
	if _, err := f.ReadAt(buf, off); err != nil {
		return nil
	}
	return buf
}

func writeDiagZip(path string, files []diagFile) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	zw := zip.NewWriter(f)
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })
	for _, df := range files {
		w, err := zw.Create(df.name)
		if err != nil {
			_ = zw.Close()
			return err
		}
		if _, err := w.Write(df.data); err != nil {
			_ = zw.Close()
			return err
		}
	}
	return zw.Close()
}

func diagnosticsDir() string {
	if home, err := os.UserHomeDir(); err == nil {
		d := filepath.Join(home, "Downloads")
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			return d
		}
	}
	return os.TempDir()
}

// ExportDiagnostics 生成一个不含 API Key / 自定义文字内容的诊断 zip，方便用户贴 issue。
func (a *App) ExportDiagnostics() map[string]interface{} {
	configured := a.apiKeysConfigured()
	a.mu.Lock()
	stateBytes, err := json.MarshalIndent(sanitizeStateForDiagnostics(a.state, configured), "", "  ")
	var ledgerBytes []byte
	if a.ledger != nil {
		ledgerBytes, _ = json.MarshalIndent(sanitizeLedgerForDiagnostics(a.ledger), "", "  ")
	}
	statePath := a.statePath
	a.mu.Unlock()
	if err != nil {
		return map[string]interface{}{"ok": false, "error": "读取状态失败：" + err.Error()}
	}

	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	meta := map[string]interface{}{
		"exportedAt":     time.Now().Format(time.RFC3339),
		"version":        Version,
		"variant":        Variant,
		"isolated":       isolatedMode,
		"goos":           runtime.GOOS,
		"goarch":         runtime.GOARCH,
		"windowsBuild":   windowsBuildNumber(),
		"stateFile":      statePath,
		"heapAllocMB":    round1(float64(ms.HeapAlloc) / 1048576),
		"heapSysMB":      round1(float64(ms.HeapSys) / 1048576),
		"systemMemMB":    round1(float64(ms.Sys) / 1048576),
		"goroutines":     runtime.NumGoroutine(),
		"debug":          a.DebugState(),
		"fullscreenLogs": a.FullscreenDiagnostics(),
	}
	metaBytes, _ := json.MarshalIndent(meta, "", "  ")
	fsBytes, _ := json.MarshalIndent(a.FullscreenDiagnostics(), "", "  ")

	logTail := readLogTail(errorLogPath(), 256<<10)
	if len(logTail) == 0 {
		logTail = []byte("（没有找到错误日志）\n")
	}
	readme := strings.Join([]string{
		"大肥鱼桌宠诊断包",
		"",
		"包含：",
		"- diagnostics.json：版本、系统、窗口、Region、内存与全屏判定",
		"- state-sanitized.json：设置快照（已移除 API Key、自定义文字内容与关联应用路径）",
		"- ledger.json：账单状态（不含 Key）",
		"- fullscreen.json：最近 40 次全屏判定记录",
		"- error-log-tail.txt：最近 256 KB 本机错误日志",
		"",
		"注意：错误日志与窗口信息可能包含本机用户名 / 路径。上传到 issue 前请先检查内容。",
		"",
	}, "\n")

	files := []diagFile{
		{"README.txt", []byte(readme)},
		{"diagnostics.json", metaBytes},
		{"state-sanitized.json", stateBytes},
		{"ledger.json", ledgerBytes},
		{"fullscreen.json", fsBytes},
		{"error-log-tail.txt", logTail},
	}
	name := "dafeiyu-diagnostics-" + time.Now().Format("20060102-150405") + ".zip"
	path := filepath.Join(diagnosticsDir(), name)
	if err := writeDiagZip(path, files); err != nil {
		return map[string]interface{}{"ok": false, "error": "写入诊断包失败：" + err.Error()}
	}
	st, _ := os.Stat(path)
	size := int64(0)
	if st != nil {
		size = st.Size()
	}
	a.balloon("done", a.displayName(), a.t("诊断包已导出到 ", "Diagnostics exported to ", "診断パッケージを書き出しました：")+filepath.Base(path))
	return map[string]interface{}{"ok": true, "path": path, "size": size}
}
