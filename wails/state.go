package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func defaultState() map[string]interface{} {
	return map[string]interface{}{
		"satiety":         78,
		"mood":            82,
		"pos":             nil,
		"awake":           true,
		"scale":           0.85,
		"dock":            "roam",
		"pomoMin":         25,
		"pomoAnimSec":     5,
		"ledger":          true,
		"autoStart":       false,
		"launchApp":       "",
		"character":       "v1",
		"fontSize":        1,
		"sfx":             "default",
		"autoActionSec":   40,
		"ledgerSource":    "qoder",
		"autoUpdate":      true,
		"customQuips":     []interface{}{},
		"useCustomQuips":  true,
		"pinnedActions":   map[string]interface{}{},
		"deepseekKey":     "",
		"apiKeys":         map[string]interface{}{},
		"lastUpdateCheck": 0,
	}
}

func (a *App) stateFilePath() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = os.Getenv("APPDATA")
	}
	return filepath.Join(dir, appDataDirName(), "dafeiyu-state.json")
}

func (a *App) loadState() {
	p := a.stateFilePath()
	if _, err := os.Stat(p); err != nil && !isLite() {
		legacy := filepath.Join(filepath.Dir(p), "..", "dafeiyu-desktop-pet-qoder", "dafeiyu-state.json")
		legacy = filepath.Clean(legacy)
		if _, err := os.Stat(legacy); err == nil {
			_ = os.MkdirAll(filepath.Dir(p), 0755)
			_ = os.WriteFile(p, mustRead(legacy), 0644)
		}
	}
	st := defaultState()
	if b, err := os.ReadFile(p); err == nil {
		var loaded map[string]interface{}
		if json.Unmarshal(b, &loaded) == nil {
			for k, v := range loaded {
				st[k] = v
			}
		}
	}
	// 一次性迁移：旧默认尺寸 100% → 85%
	if _, ok := st["scale85"].(bool); !ok {
		if f, ok := st["scale"].(float64); !ok || (f > 0 && f < 1.0001 && f > 0.9999) {
			st["scale"] = 0.85
		}
		st["scale85"] = true
	}
	// 旧形象 id
	switch st["character"] {
	case "whale1":
		st["character"] = "v1"
	case "whale2":
		st["character"] = "v5"
	}
	if !validChar(str(st["character"], "v1")) {
		st["character"] = "v1"
	}
	// 自定义文字启动时二次过滤
	lines := toStrings(st["customQuips"])
	if cleaned, err := a.words.Sanitize(lines); err == nil {
		st["customQuips"] = cleaned
	} else {
		st["customQuips"] = []interface{}{}
	}
	if _, ok := st["useCustomQuips"].(bool); !ok {
		st["useCustomQuips"] = true
	}
	a.mu.Lock()
	a.state = st
	a.statePath = p
	a.mu.Unlock()

	a.migrateApiKeysEncryption()
	// 自动动作默认 20→40 的一次性迁移
	if _, ok := st["autoAction40"].(bool); !ok {
		if n := num(st["autoActionSec"]); n == 20 {
			st["autoActionSec"] = 40
		}
		st["autoAction40"] = true
		a.saveState()
	}
}

func mustRead(p string) []byte {
	b, _ := os.ReadFile(p)
	return b
}

func toStrings(v interface{}) []string {
	switch x := v.(type) {
	case []string:
		return x
	case []interface{}:
		out := make([]string, 0, len(x))
		for _, e := range x {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func (a *App) saveStateNow() {
	a.mu.Lock()
	if a.state == nil {
		a.mu.Unlock()
		return
	}
	p := a.statePath
	b, err := json.MarshalIndent(a.state, "", "  ")
	a.mu.Unlock()
	if err != nil || p == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0755)
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0644) == nil {
		_ = os.Rename(tmp, p)
	}
}

// 状态文件很小且写入频率低，直接同步保存；位置由 ReportPos 节流。
func (a *App) saveState() { a.saveStateNow() }

func (a *App) petStatus() map[string]interface{} {
	a.mu.Lock()
	s := a.state
	settings := map[string]interface{}{
		"scale":          a.scaleLocked(),
		"dock":           dockLocked(s),
		"pomoMin":        a.pomoMinutesLocked(),
		"pomoAnimSec":    a.pomoAnimSecLocked(),
		"ledger":         a.ledgerOnLocked(),
		"autoStart":      boolv(s["autoStart"], false),
		"launchApp":      str(s["launchApp"], ""),
		"character":      a.charIDLocked(),
		"fontSize":       clampF(numOr(s["fontSize"], 1), 0.8, 1.4),
		"sfx":            sfxLocked(s),
		"autoActionSec":  a.autoActionSecLocked(),
		"ledgerSource":   ledgerSourceLocked(s),
		"autoUpdate":     boolv(s["autoUpdate"], true),
		"customQuips":    toStrings(s["customQuips"]),
		"useCustomQuips": boolv(s["useCustomQuips"], true),
		"pinnedActions":  pinnedActionsOf(s),
	}
	sati := numOr(s["satiety"], 78)
	mood := numOr(s["mood"], 82)
	awake := boolv(s["awake"], true)
	pos := s["pos"]
	ledgerOn := a.ledgerOnLocked()
	ledger := a.ledger
	a.mu.Unlock()

	pomoRunning, pomoRemain := a.pomoStatus()
	if ledgerOn && ledger == nil {
		ledger = a.refreshUsage()
	}
	var ledgerOut interface{}
	if ledgerOn {
		ledgerOut = ledger
	}
	return map[string]interface{}{
		"satiety": int(mathRound(sati)),
		"mood":    int(mathRound(mood)),
		"awake":   awake,
		"pomodoro": map[string]interface{}{
			"running":   pomoRunning,
			"remaining": pomoRemain,
		},
		"pos":      pos,
		"settings": settings,
		"version":  Version,
		"appName":  appName(),
		"variant":  Variant,
		"apiKeys":  a.apiKeysConfigured(),
		"ledger":   ledgerOut,
	}
}

func numOr(v interface{}, def float64) float64 {
	if v == nil {
		return def
	}
	n := num(v)
	if n == 0 {
		return def
	}
	return n
}

func pinnedActionsOf(s map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	m, _ := s["pinnedActions"].(map[string]interface{})
	for charID, v := range m {
		if !validChar(charID) {
			continue
		}
		list := make([]interface{}, 0, 10)
		seen := map[string]bool{}
		for _, name := range toStrings(v) {
			name = strings.TrimSpace(name)
			if name == "" || len([]rune(name)) > 120 || seen[name] {
				continue
			}
			seen[name] = true
			list = append(list, name)
			if len(list) >= 10 {
				break
			}
		}
		if len(list) > 0 {
			out[charID] = list
		}
	}
	return out
}

func (a *App) scaleLocked() float64 { return clampF(numOr(a.state["scale"], 0.85), 0.6, 1.6) }
func (a *App) ledgerOnLocked() bool { return boolv(a.state["ledger"], true) }
func (a *App) pomoMinutesLocked() int {
	n := int(numOr(a.state["pomoMin"], 25))
	if n < 5 {
		n = 5
	}
	if n > 120 {
		n = 120
	}
	return n
}
func (a *App) pomoAnimSecLocked() int {
	n := int(numOr(a.state["pomoAnimSec"], 5))
	if n < 5 {
		n = 5
	}
	if n > 120 {
		n = 120
	}
	return n
}
func (a *App) autoActionSecLocked() int {
	n := int(numOr(a.state["autoActionSec"], 40))
	if n < 5 {
		n = 5
	}
	if n > 300 {
		n = 300
	}
	return n
}
func (a *App) charIDLocked() string {
	v := str(a.state["character"], "v1")
	if v == "whale1" {
		return "v1"
	}
	if v == "whale2" {
		return "v5"
	}
	if validChar(v) {
		return v
	}
	return "v1"
}
func dockLocked(s map[string]interface{}) string {
	d := str(s["dock"], "roam")
	if d == "corner" || d == "fixed" {
		return d
	}
	return "roam"
}
func sfxLocked(s map[string]interface{}) string {
	v := str(s["sfx"], "default")
	if v == "whale" || v == "off" {
		return v
	}
	return "default"
}
func ledgerSourceLocked(s map[string]interface{}) string {
	v := str(s["ledgerSource"], "qoder")
	if v == "qoder" {
		return v
	}
	if _, ok := apiProviders[v]; ok {
		return v
	}
	return "qoder"
}

// ---------------- API Key 存取（Windows DPAPI） ----------------

func (a *App) migrateApiKeysEncryption() {
	a.mu.Lock()
	changed := false
	keys, _ := a.state["apiKeys"].(map[string]interface{})
	if keys == nil {
		keys = map[string]interface{}{}
		a.state["apiKeys"] = keys
	}
	if legacy := str(a.state["deepseekKey"], ""); legacy != "" {
		if _, ok := keys["deepseek"]; !ok {
			keys["deepseek"] = a.encryptKey(legacy)
			a.state["deepseekKey"] = ""
			changed = true
		}
	}
	for k, v := range keys {
		if s, ok := v.(string); ok && s != "" && !strings.HasPrefix(s, "enc:") && !strings.HasPrefix(s, "plain:") {
			keys[k] = a.encryptKey(s)
			changed = true
		}
	}
	a.mu.Unlock()
	if changed {
		a.saveState()
	}
}

func (a *App) encryptKey(key string) string {
	if b, err := dpapiProtect([]byte(key)); err == nil {
		return "enc:" + base64.StdEncoding.EncodeToString(b)
	}
	return "plain:" + key
}

func (a *App) decryptKey(stored string) string {
	if stored == "" {
		return ""
	}
	if strings.HasPrefix(stored, "enc:") {
		b, err := base64.StdEncoding.DecodeString(stored[4:])
		if err != nil {
			return ""
		}
		plain, err := dpapiUnprotect(b)
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(plain))
	}
	if strings.HasPrefix(stored, "plain:") {
		return strings.TrimSpace(stored[6:])
	}
	return strings.TrimSpace(stored)
}

func (a *App) apiKey(provider string) string {
	a.mu.Lock()
	keys, _ := a.state["apiKeys"].(map[string]interface{})
	stored, _ := keys[provider].(string)
	legacy := ""
	if provider == "deepseek" {
		legacy = str(a.state["deepseekKey"], "")
	}
	a.mu.Unlock()
	if saved := a.decryptKey(stored); saved != "" {
		return saved
	}
	if legacy != "" {
		return strings.TrimSpace(legacy)
	}
	if def, ok := apiProviders[provider]; ok && def.env != "" {
		return strings.TrimSpace(os.Getenv(def.env))
	}
	return ""
}

func (a *App) apiKeysConfigured() map[string]bool {
	out := map[string]bool{}
	for id := range apiProviders {
		out[id] = a.apiKey(id) != ""
	}
	return out
}

func (a *App) KeyInfo(provider string) map[string]interface{} {
	def, ok := apiProviders[provider]
	if !ok {
		def = apiProviders["deepseek"]
		provider = "deepseek"
	}
	return map[string]interface{}{
		"provider": provider,
		"label":    def.label,
		"hint":     keyHints[provider],
		"hasKey":   a.apiKey(provider) != "",
	}
}

func (a *App) KeySave(provider, key string) map[string]interface{} {
	if _, ok := apiProviders[provider]; !ok {
		return map[string]interface{}{"ok": false, "error": "未知的平台"}
	}
	k := strings.TrimSpace(key)
	if len([]rune(k)) < 8 {
		return map[string]interface{}{"ok": false, "error": "Key 太短，看起来不像有效的 API Key"}
	}
	a.mu.Lock()
	keys, _ := a.state["apiKeys"].(map[string]interface{})
	if keys == nil {
		keys = map[string]interface{}{}
		a.state["apiKeys"] = keys
	}
	keys[provider] = a.encryptKey(k)
	if provider == "deepseek" {
		a.state["deepseekKey"] = ""
	}
	src := ledgerSourceLocked(a.state)
	a.mu.Unlock()
	a.saveState()
	if src == provider && a.ledgerOn() {
		a.refreshUsage()
	}
	a.emit("keys-updated", a.apiKeysConfigured())
	return map[string]interface{}{"ok": true}
}

func (a *App) KeyClear(provider string) map[string]interface{} {
	a.mu.Lock()
	if keys, ok := a.state["apiKeys"].(map[string]interface{}); ok {
		delete(keys, provider)
	}
	if provider == "deepseek" {
		a.state["deepseekKey"] = ""
	}
	src := ledgerSourceLocked(a.state)
	a.mu.Unlock()
	a.saveState()
	if src == provider && a.ledgerOn() {
		a.refreshUsage()
	}
	a.emit("keys-updated", a.apiKeysConfigured())
	return map[string]interface{}{"ok": true}
}

// ---------------- 定时器/小工具 ----------------

func (a *App) pomoStatus() (bool, int64) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.pomo.running {
		return false, 0
	}
	left := time.Until(a.pomo.endsAt)
	if left < 0 {
		left = 0
	}
	return true, left.Milliseconds()
}
