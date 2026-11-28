package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

// 多开状态拆分：
//
//	根目录 dafeiyu-state.json 只存共享设置与凭据；
//	instances/<slot>/dafeiyu-state.json 存这只宠物自己的运行时状态。
//
// 共享文件写入采用「基线比较 + 锁内合并」，避免两只宠物同时改设置时互相覆盖。
var runtimeStateKeys = map[string]bool{
	"satiety":     true,
	"mood":        true,
	"pos":         true,
	"awake":       true,
	"character":   true,
	"pomoHistory": true,
}

func isRuntimeKey(k string) bool { return runtimeStateKeys[k] }

func (a *App) instanceStatePath() string {
	return filepath.Join(instancesDir(), strconv.Itoa(instanceSlot), "dafeiyu-state.json")
}

func splitRuntimeState(st map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(runtimeStateKeys))
	for k, v := range st {
		if isRuntimeKey(k) {
			out[k] = v
		}
	}
	return out
}

func splitSharedState(st map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(st))
	for k, v := range st {
		if !isRuntimeKey(k) {
			out[k] = v
		}
	}
	return out
}

func canonicalValue(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprint(v)
	}
	return string(b)
}

func canonicalState(st map[string]interface{}) map[string]string {
	out := make(map[string]string, len(st))
	for k, v := range st {
		out[k] = canonicalValue(v)
	}
	return out
}

func writeFileAtomic(p string, data []byte) error {
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(p)+".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, p)
}

// lockNamed 用命名互斥把跨进程的读-改-写串起来。
//
// 关键：Windows 互斥的归属是「系统线程」，而 Go 协程可能在 Wait 与 Release 之间
// 被调度到另一个线程，导致 ReleaseMutex 失败、锁永久不释放。因此加锁期间必须
// 用 LockOSThread 把协程钉在同一线程；同时最多等 3 秒，避免个别进程卡死时无限等待。
func lockNamed(name string) func() {
	runtime.LockOSThread()
	n, _ := syscall.UTF16PtrFromString(name)
	h, err := windows.CreateMutex(nil, false, n)
	if err != nil && !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		runtime.UnlockOSThread()
		return func() {}
	}
	if h == 0 {
		runtime.UnlockOSThread()
		return func() {}
	}
	r, _ := windows.WaitForSingleObject(h, 3000)
	if r != windows.WAIT_OBJECT_0 && r != uint32(windows.WAIT_ABANDONED) {
		windows.CloseHandle(h)
		runtime.UnlockOSThread()
		crashLog("lock", fmt.Sprintf("acquire failed (%d) %s", r, name))
		return func() {}
	}
	return func() {
		_ = windows.ReleaseMutex(h)
		windows.CloseHandle(h)
		runtime.UnlockOSThread()
	}
}

func (a *App) sharedLockName() string { return baseInstanceName() + "-state-lock" }

// applyInstanceState 把本槽位的运行时字段覆盖到共享状态之上。
func (a *App) applyInstanceState(st map[string]interface{}) {
	p := a.instanceStatePath()
	b, err := os.ReadFile(p)
	if err == nil {
		var inst map[string]interface{}
		if json.Unmarshal(b, &inst) == nil {
			for k, v := range inst {
				if isRuntimeKey(k) {
					st[k] = v
				}
			}
		}
	} else if os.IsNotExist(err) && instanceSlot > 1 {
		// 新槽位默认换一个没被其它宠物占用的形象，免得三只鱼叠在一起。
		st["character"] = a.pickUnusedCharacter()
	}
}

// splitLegacyState 首次升级到 1.5.5：备份旧状态并把运行时字段挪进 instances/1/。
func (a *App) splitLegacyState(sharedPath string, full map[string]interface{}) {
	if err := os.MkdirAll(instancesDir(), 0o755); err != nil {
		return
	}
	if b, err := os.ReadFile(sharedPath); err == nil {
		backup := sharedPath + ".bak-" + time.Now().Format("20060102-150405")
		_ = os.WriteFile(backup, b, 0o644)
	}
	runtime := splitRuntimeState(full)
	if b, err := json.MarshalIndent(runtime, "", "  "); err == nil {
		if writerErr := writeFileAtomic(filepath.Join(instancesDir(), "1", "dafeiyu-state.json"), b); writerErr == nil {
			crashLog("multi", "split state into instances/1")
		}
	}
}

// pickUnusedCharacter 优先挑没被其它槽位使用的内置形象 / 已安装形象包。
func (a *App) pickUnusedCharacter() string {
	used := map[string]bool{}
	entries, _ := os.ReadDir(instancesDir())
	for _, e := range entries {
		if !e.IsDir() || e.Name() == strconv.Itoa(instanceSlot) {
			continue
		}
		if b, err := os.ReadFile(filepath.Join(instancesDir(), e.Name(), "dafeiyu-state.json")); err == nil {
			var inst map[string]interface{}
			if json.Unmarshal(b, &inst) == nil {
				if id := str(inst["character"], ""); id != "" {
					used[id] = true
				}
			}
		}
	}
	candidates := []string{"v1", "gpt"}
	for _, c := range a.ListInstalledCharacters() {
		candidates = append(candidates, "pack:"+c.ID)
	}
	for _, c := range candidates {
		if !used[c] {
			return c
		}
	}
	return "v1"
}

// sharedStatePath 共享状态文件；测试会直接指定 statePath，此时必须用它而不是真实用户目录。
func (a *App) sharedStatePath() string {
	if a.statePath != "" {
		return a.statePath
	}
	return a.stateFilePath()
}

// runtimeStatePath 本槽位运行时状态；未初始化时按共享文件所在目录推导，避免测试写到真实配置。
func (a *App) runtimeStatePath() string {
	if a.instancePath != "" {
		return a.instancePath
	}
	if a.statePath != "" {
		return filepath.Join(filepath.Dir(a.statePath), "instances", strconv.Itoa(instanceSlot), "dafeiyu-state.json")
	}
	return a.instanceStatePath()
}

// writeSharedState 在命名互斥内做三方合并：只覆盖本进程真正改动过的字段。
func (a *App) writeSharedState(shared map[string]interface{}) error {
	unlock := lockNamed(a.sharedLockName())
	defer unlock()
	p := a.sharedStatePath()
	latest := map[string]interface{}{}
	if b, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(b, &latest)
	}
	cur := canonicalState(shared)
	// 新增或修改
	for k, v := range shared {
		if a.lastShared[k] != cur[k] {
			latest[k] = v
		}
	}
	// 删除：本进程基线里有、现在没有，且磁盘内容仍是基线值
	for k, base := range a.lastShared {
		if _, keep := shared[k]; keep {
			continue
		}
		if canonicalValue(latest[k]) == base {
			delete(latest, k)
		}
	}
	b, err := json.MarshalIndent(latest, "", "  ")
	if err != nil {
		return err
	}
	if err := writeFileAtomic(p, b); err != nil {
		return err
	}
	a.lastShared = canonicalState(latest)
	return nil
}

// allPomoHistory 汇总所有槽位的专注记录，统计页不区分是哪只宠物贡献的。
func (a *App) allPomoHistory() []interface{} {
	entries, err := os.ReadDir(instancesDir())
	if err != nil {
		a.mu.Lock()
		raw, _ := a.state["pomoHistory"].([]interface{})
		a.mu.Unlock()
		return raw
	}
	var out []interface{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(instancesDir(), e.Name(), "dafeiyu-state.json"))
		if err != nil {
			continue
		}
		var inst map[string]interface{}
		if json.Unmarshal(b, &inst) != nil {
			continue
		}
		if raw, ok := inst["pomoHistory"].([]interface{}); ok {
			out = append(out, raw...)
		}
	}
	if len(out) == 0 {
		a.mu.Lock()
		raw, _ := a.state["pomoHistory"].([]interface{})
		a.mu.Unlock()
		return raw
	}
	return out
}

// characterNameOf 读取某槽位当前形象，供托盘菜单显示。
func characterNameOf(slot int) string {
	if slot == instanceSlot {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(instancesDir(), strconv.Itoa(slot), "dafeiyu-state.json"))
	if err != nil {
		return ""
	}
	var inst map[string]interface{}
	if json.Unmarshal(b, &inst) != nil {
		return ""
	}
	id := str(inst["character"], "")
	if strings.HasPrefix(id, "pack:") {
		return strings.TrimPrefix(id, "pack:")
	}
	return id
}

// reloadShared 在别的实例改了共享设置后重新读盘，保持语言/Key/账本来源一致。
func (a *App) reloadShared() {
	b, err := os.ReadFile(a.sharedStatePath())
	if err != nil {
		return
	}
	var loaded map[string]interface{}
	if json.Unmarshal(b, &loaded) != nil {
		return
	}
	a.stateSaveMu.Lock()
	a.mu.Lock()
	for k, v := range loaded {
		if !isRuntimeKey(k) {
			a.state[k] = v
		}
	}
	a.mu.Unlock()
	a.lastShared = canonicalState(loaded)
	a.stateSaveMu.Unlock()
	if lang := strv(loaded["lang"], ""); lang != "" {
		a.setUILang(lang)
	}
	// 其它宠物收到后重放一遍共享设置，界面与行为立即跟上
	st := a.petStatus()
	a.emit("settings-reloaded", map[string]interface{}{
		"settings": st["settings"],
		"apiKeys":  st["apiKeys"],
		"instance": st["instance"],
	})
}
