package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	dbg "runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

// Version 由 tools/wails-build.js 按 package.json 同步；开发期用测试版号，发布时用正式版号。
var Version = "1.5.4"

// Variant 由构建脚本用 -ldflags 注入（full / lite）。
var Variant = "full"

// isolatedMode 由 --isolated 开启：独立状态目录 / 单实例 / 窗口类名，
// 方便开发时和本机已安装版本同时运行、做真机性能与交互验证。
var isolatedMode bool

func isLite() bool { return Variant == "lite" }

func appName() string {
	base := "大肥鱼桌宠"
	if isLite() {
		base += " Lite"
	}
	if isolatedMode {
		base += "（隔离调试）"
	}
	return base
}

func appDataDirName() string {
	base := "dafeiyu-desktop-pet"
	if isLite() {
		base += "-lite"
	}
	if isolatedMode {
		base += "-isolated"
	}
	return base
}

func singleInstanceName() string {
	name := `Global\dafeiyu-desktop-pet-wails`
	if isLite() {
		name += "-lite"
	}
	if isolatedMode {
		name += "-isolated"
	}
	return name
}

//go:embed all:frontend/dist
var frontendAssets embed.FS

type Pomodoro struct {
	running bool
	endsAt  time.Time
	stop    chan struct{}
}

type App struct {
	ctx context.Context

	mu          sync.Mutex
	state       map[string]interface{}
	statePath   string
	stateDirty  bool
	stateSaveMu sync.Mutex

	characterLocksMu sync.Mutex
	characterLocks   map[string]*characterLock

	hwnd      uintptr
	className string
	workArea  RECT
	dpi       float64
	petX      float64
	petY      float64
	petScale  float64
	petInit   bool
	panelOpen bool
	dragging  bool
	focusable bool
	interact  bool
	hidden    bool

	pomo      Pomodoro
	ledger    map[string]interface{}
	ledgerSeq uint64 // 账本来源代次；切换来源时递增，用于丢弃旧请求结果

	words *WordsFilter

	apiFetching  map[string]uint64 // 平台 -> 正在处理的请求代次，按平台去重
	lastUpdate   map[string]interface{}
	lastUpdateAt time.Time
	updateBusy   bool
	autoUpdating bool

	tray      *Tray
	trayReady bool

	lastSavedPos time.Time
	quitting     bool

	lastResumeCheck time.Time
	resumeChecking  bool
	powerSeq        int
	powerAckAt      time.Time
	powerOnAC       bool
	powerKnown      bool

	bootUsageScheduled bool

	releaseETag    string
	releaseLastMod string
	releaseRaw     map[string]interface{}

	fsHidden   bool
	fsHiddenAt time.Time                // 进入全屏隐藏的时刻，用于排查“消失 N 秒”的实际来源
	cloakAt    time.Time                // DWM 把窗口标成 cloaked 的时刻（可见却不出画时定位用）
	zHealAt    time.Time                // 上次因 z-order 被 shell 压住而重新置顶的时刻（限频）
	fsDecider  fullscreenHysteresis     // 隐藏/恢复的滞回状态机
	fsLog      []map[string]interface{} // 最近的全屏判定记录（issue #2 诊断）
	fsLast     bool                     // 上次记录的 active 值，用于只记录变化
	fsHasLast  bool
	fsTopAt    time.Time // 上次补置顶的时间：全屏轮询 500ms 一次，没必要每次都查窗口样式

	ledgerOK map[string]int64 // 各平台上次成功查询的时间（毫秒），失败时保留

	regionMu      sync.Mutex
	regionSet     bool
	regionFull    bool
	regionLast    RECT
	regionAt      time.Time
	regionSig     string
	regionBoxes   []RegionBox
	hitBox        RegionBox
	panelHold     time.Time
	regionHold    time.Time // 动画切换 / 拖拽松手时短暂保持整窗，避免边缘竞态
	regionPending bool      // 节流窗口内被压下的那次更新
	lastBoxes     string    // 上次上报的命中框 JSON，完全一致时跳过 Region 重算
	accentFixed   bool      // 是否已做过 Win10 毛玻璃修复
}

func main() {
	isolatedMode = hasArg("--isolated")
	if hasArg("--resume-restart-helper") {
		runResumeRestartHelper()
		return
	}
	if !acquireSingleInstance() {
		return
	}
	windowClass := "DafeiyuPetWindow"
	if isLite() {
		windowClass = "DafeiyuPetWindowLite"
	}
	if isolatedMode {
		windowClass += "Isolated"
	}
	app := &App{
		className: windowClass,
		petScale:  0.85,
	}
	distFS, err := fs.Sub(frontendAssets, "frontend/dist")
	if err != nil {
		crashLog("assets", err.Error())
	} else {
		petAssets, err = newZipFS(distFS)
		if err != nil {
			crashLog("assets-zip", err.Error())
		}
	}
	// 已下载的形象包放在用户目录，叠加到内嵌资源之上（characters/<id>/... 优先读磁盘）
	var assetFS fs.FS
	if petAssets != nil {
		cfg := app.userConfigDir()
		_ = os.MkdirAll(filepath.Join(cfg, "characters"), 0o755)
		_ = os.MkdirAll(filepath.Join(cfg, "fonts"), 0o755)
		assetFS = &charactersFS{primary: petAssets, overlay: os.DirFS(cfg)}
	}
	err = wails.Run(&options.App{
		Title:            appName(),
		Width:            800,
		Height:           600,
		Frameless:        true,
		StartHidden:      true,
		AlwaysOnTop:      true,
		DisableResize:    true,
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		AssetServer:      &assetserver.Options{Assets: assetFS},
		OnStartup:        app.startup,
		OnDomReady:       app.domReady,
		OnBeforeClose:    app.beforeClose,
		Bind:             []interface{}{app},
		Windows: &windows.Options{
			WebviewIsTransparent:              true,
			WindowIsTranslucent:               true,
			BackdropType:                      windows.None,
			DisableWindowIcon:                 true,
			DisableFramelessWindowDecorations: true,
			WindowClassName:                   windowClass,
			IsZoomControlEnabled:              false,
			DisablePinchZoom:                  true,
			ZoomFactor:                        1,
		},
	})
	if err != nil {
		crashLog("wails", err.Error())
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// 词库直接来自随包素材；不联网
	lex, err := readAsset("assets/sensitive/lexicon.txt")
	if err != nil {
		crashLog("lexicon", err.Error())
	}
	a.words = NewWordsFilter(lex)
	a.loadState()
	// 旧版安装的官方形象包在启动时补齐 1.0.1 清单字段（只改 manifest.json，不联网）
	a.migrateInstalledPacks()
	a.healSelectedCharacter()
	go startPowerMonitor(a)
	a.startPowerStatusLoop()
	a.SetupWindow()
	go a.fullscreenLoop()
	go a.cursorLoop()
	go a.stateSaveLoop()
	go a.startTray()
	if hasArg("--dev-debug") {
		go startDebugServer(a)
	}
	if !isolatedMode {
		a.applyLoginItemAsync()
	}
	a.launchLinkedApp()
	// 账本查询和商店目录都不要挡首帧：2 秒后再拉。
	a.scheduleBootUsage()
	if !isolatedMode {
		go func() {
			time.Sleep(12 * time.Second)
			if time.Since(time.Unix(millis(a.get("lastUpdateCheck")), 0)) > 24*time.Hour {
				a.set("lastUpdateCheck", nowMillis())
				a.saveState()
				a.silentUpdateCheck()
			}
		}()
	}
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			if a.ledgerOn() {
				a.refreshUsage()
			}
			a.trayRefresh()
			// 顺带把闲置期间攒下的临时缓冲还回系统（素材服务、视频解码中转）
			a.releaseMemory()
		}
	}()
	// 启动时首读素材会产生一次性缓冲，密集回收几次把启动尖峰压下去：
	// 实测启动 10 秒内峰值 ~790MB，回收后回落到 ~60MB
	go func() {
		for _, d := range []time.Duration{6 * time.Second, 6 * time.Second, 8 * time.Second} {
			time.Sleep(d)
			a.releaseMemory()
		}
	}()
}

// scheduleBootUsage 把首次账本刷新放到首帧之后；petStatus 在账本为空时也会调用，
// 用标记保证只排一次。刷新结果通过 usage 事件回填，不阻塞 init。
func (a *App) scheduleBootUsage() {
	a.mu.Lock()
	if a.bootUsageScheduled {
		a.mu.Unlock()
		return
	}
	a.bootUsageScheduled = true
	a.mu.Unlock()
	time.AfterFunc(2*time.Second, func() {
		if !a.ledgerOn() {
			return
		}
		go func() {
			if l := a.refreshUsage(); l != nil {
				a.emit("usage", l)
			}
		}()
	})
}

// releaseMemory 只在空闲时把堆内存还给系统，避免在拖拽 / 面板交互中触发 STW 造成卡顿。
func (a *App) releaseMemory() {
	a.mu.Lock()
	busy := a.dragging || a.panelOpen || a.quitting
	a.mu.Unlock()
	if busy {
		return
	}
	dbg.FreeOSMemory()
}

func hasArg(want string) bool {
	for _, a := range os.Args[1:] {
		if a == want {
			return true
		}
	}
	return false
}

func (a *App) domReady(ctx context.Context) {}

func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	a.quitting = true
	if a.petInit {
		a.state["pos"] = map[string]interface{}{"x": int(a.petX), "y": int(a.petY)}
	}
	a.mu.Unlock()
	a.saveStateNow()
	a.stopTray()
	return false
}

func (a *App) emit(name string, payload interface{}) {
	if a.ctx == nil {
		return
	}
	runtimeEventsEmit(a.ctx, name, payload)
}

// beginUpdate 在同一把锁内检查并占用共享更新状态，避免手动/自动更新同时启动。
func (a *App) beginUpdate(automatic bool) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.updateBusy || a.autoUpdating {
		return false
	}
	a.updateBusy = true
	if automatic {
		a.autoUpdating = true
	}
	return true
}

func (a *App) endUpdate(automatic bool) {
	a.mu.Lock()
	a.updateBusy = false
	if automatic {
		a.autoUpdating = false
	}
	a.mu.Unlock()
}

// Ready 由渲染层在监听器注册完成后调用，确保 init 不会丢。
func (a *App) Ready() map[string]interface{} {
	st := a.petStatus()
	a.emit("init", st)
	a.trayRefresh()
	return st
}

// ---------------- 基础工具 ----------------

func millis(v interface{}) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	case json.Number:
		x, _ := n.Int64()
		return x
	}
	return 0
}

func nowMillis() int64 { return time.Now().UnixNano() / int64(time.Millisecond) }

func clampF(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func round1(v float64) float64 { return float64(int64(v*10+0.5)) / 10 }

func errorLogPath() string {
	p := os.Getenv("TEMP")
	if p == "" {
		p = os.TempDir()
	}
	return p + string(os.PathSeparator) + "dafeiyu-error.log"
}

func crashLog(kind string, msg string) {
	logPath := errorLogPath()
	// 长期运行 / 反复失败时日志不能无限长：超过 1MB 就轮转一份 .1
	if st, err := os.Stat(logPath); err == nil && st.Size() > 1<<20 {
		_ = os.Remove(logPath + ".1")
		_ = os.Rename(logPath, logPath+".1")
	}
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "[%s] %s: %s\n", time.Now().Format(time.RFC3339), kind, msg)
}

// LogFrontend 接收前端未捕获异常，写入本机错误日志（不联网），方便用户反馈时定位。
func (a *App) LogFrontend(level, msg string) {
	switch level {
	case "error", "warn", "info":
	default:
		level = "info"
	}
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return
	}
	if r := []rune(msg); len(r) > 1500 {
		msg = string(r[:1500]) + "…"
	}
	crashLog("frontend-"+level, msg)
}

func (a *App) assetFile(name string) (string, error) {
	b, err := readAsset("assets/" + name)
	if err != nil {
		return "", err
	}
	p := os.TempDir() + string(os.PathSeparator) + "dafeiyu-" + strings.ReplaceAll(name, "/", "_")
	if err := os.WriteFile(p, b, 0644); err != nil {
		return "", err
	}
	return p, nil
}

// ---------------- 设置字段 ----------------

func (a *App) get(key string) interface{} {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state[key]
}

func (a *App) set(key string, v interface{}) {
	a.mu.Lock()
	a.state[key] = v
	a.mu.Unlock()
}

func (a *App) getString(key, def string) string {
	v, ok := a.get(key).(string)
	if !ok || v == "" {
		return def
	}
	return v
}

func (a *App) getBool(key string, def bool) bool {
	if v, ok := a.get(key).(bool); ok {
		return v
	}
	return def
}

func (a *App) ledgerOn() bool { return a.getBool("ledger", true) }

func (a *App) launchLinkedApp() {
	p := strings.TrimSpace(a.getString("launchApp", ""))
	if p == "" {
		return
	}
	if _, err := os.Stat(p); err != nil {
		return
	}
	cmd := exec.Command("cmd.exe", "/c", "start", "", p)
	cmd.SysProcAttr = hiddenProcAttr()
	_ = cmd.Start()
}

// ---------------- 设置/统计接口 ----------------

func (a *App) ReportPos(x, y, s float64, boxesJSON string, force bool) {
	a.mu.Lock()
	// 前端每 50~100ms 上报一次；桌宠静止时位置和命中框完全不变，
	// 这种上报直接丢掉，省掉每秒二十次 JSON 解析与 SetWindowRgn（GDI 区域反复创建）。
	same := a.petInit && a.lastBoxes == boxesJSON &&
		int(a.petX) == int(x) && int(a.petY) == int(y) &&
		(s <= 0 || a.petScale == clampF(s, 0.6, 1.6))
	if same && !force {
		a.mu.Unlock()
		return
	}
	a.lastBoxes = boxesJSON
	var boxes []RegionBox
	if boxesJSON != "" {
		_ = json.Unmarshal([]byte(boxesJSON), &boxes)
	}
	a.petX, a.petY = x, y
	if s > 0 {
		a.petScale = clampF(s, 0.6, 1.6)
	}
	if boxesJSON != "" {
		a.regionBoxes = boxes
		a.hitBox = RegionBox{}
		for _, b := range boxes {
			if b.Hit {
				a.hitBox = b
				break
			}
		}
	}
	a.petInit = true
	// 位置只标记 dirty，由 stateSaveLoop 合并落盘；退出 / 隐藏时会立即 flush
	save := time.Since(a.lastSavedPos) > 20*time.Second
	if save {
		a.lastSavedPos = time.Now()
		a.state["pos"] = map[string]interface{}{"x": int(x), "y": int(y)}
		a.stateDirty = true
	}
	a.mu.Unlock()
	// 位置驱动的 Region 更新走节流（80ms 一次足够，移动速度远低于这个粒度）；
	// 气泡显示 / 改尺寸等几何突变会带 force，必须绕过节流当场生效，
	// 否则 SetWindowRgn 落后两三帧，首次亮出的气泡上半截会被旧 Region 裁掉。
	a.updateWindowRegion(force)
}

func (a *App) SetPanel(open bool) {
	a.mu.Lock()
	a.panelOpen = open
	if open {
		a.panelHold = time.Time{}
	} else {
		// 菜单/设置淡出需要 160ms；期间保持整窗 Region，避免闪一下被裁的面板
		a.panelHold = time.Now().Add(260 * time.Millisecond)
	}
	a.mu.Unlock()
	a.applyInteractive()
	a.updateWindowRegion(true)
}

// HoldRegion 在视频动画切换 / 拖拽结束等短时间内保持整窗 Region。
// 这些时刻角色形状会突变，若立刻按旧 alpha 盒收缩，边缘会被裁一下才补齐。
func (a *App) HoldRegion(ms int) {
	if ms <= 0 {
		ms = 160
	}
	if ms > 1000 {
		ms = 1000
	}
	a.mu.Lock()
	a.regionHold = time.Now().Add(time.Duration(ms) * time.Millisecond)
	a.mu.Unlock()
	a.updateWindowRegion(true)
}

func (a *App) SetDragging(on bool) {
	a.mu.Lock()
	a.dragging = on
	a.mu.Unlock()
	a.applyInteractive()
	a.updateWindowRegion(true)
}

func (a *App) SetFocusable(on bool) {
	a.mu.Lock()
	a.focusable = on
	a.mu.Unlock()
	a.applyFocusable(on)
	if on {
		a.applyInteractive()
	}
}

func (a *App) UpdateStats(satiety, mood float64) {
	a.mu.Lock()
	a.state["satiety"] = clampF(satiety, 0, 100)
	a.state["mood"] = clampF(mood, 0, 100)
	a.stateDirty = true
	a.mu.Unlock()
}

func (a *App) SaveSettings(raw string) {
	var s map[string]interface{}
	if json.Unmarshal([]byte(raw), &s) != nil {
		return
	}
	autoStartChanged := false
	powerSaveChanged := false
	ledgerDirty := false
	a.mu.Lock()
	apply := func(key string) (interface{}, bool) {
		v, ok := s[key]
		return v, ok
	}
	if v, ok := apply("scale"); ok {
		if f, ok := v.(float64); ok {
			a.state["scale"] = clampF(f, 0.6, 1.6)
		}
	}
	if v, ok := apply("dock"); ok {
		if d, ok := v.(string); ok && (d == "corner" || d == "roam" || d == "fixed") {
			a.state["dock"] = d
		}
	}
	if v, ok := apply("pomoMin"); ok {
		if f, ok := v.(float64); ok {
			a.state["pomoMin"] = int(clampF(mathRound(f), 5, 120))
		}
	}
	if v, ok := apply("pomoAnimSec"); ok {
		if f, ok := v.(float64); ok {
			a.state["pomoAnimSec"] = int(clampF(mathRound(f), 5, 120))
		}
	}
	if v, ok := apply("ledger"); ok {
		if b, ok := v.(bool); ok {
			if boolv(a.state["ledger"], true) != b {
				ledgerDirty = true
			}
			a.state["ledger"] = b
		}
	}
	if v, ok := apply("autoStart"); ok {
		if b, ok := v.(bool); ok {
			if boolv(a.state["autoStart"], false) != b {
				autoStartChanged = true
			}
			a.state["autoStart"] = b
		}
	}
	if v, ok := apply("safeResume"); ok {
		if b, ok := v.(bool); ok {
			a.state["safeResume"] = b
		}
	}
	if v, ok := apply("fullscreenHide"); ok {
		if b, ok := v.(bool); ok {
			a.state["fullscreenHide"] = b
		}
	}
	if v, ok := apply("memeOrder"); ok {
		if s, ok := v.(string); ok && (s == "queue" || s == "random") {
			a.state["memeOrder"] = s
		}
	}
	if v, ok := apply("powerSave"); ok {
		if str, ok := v.(string); ok {
			m := normalizePowerSave(str)
			if normalizePowerSave(strv(a.state["powerSave"], "auto")) != m {
				powerSaveChanged = true
			}
			a.state["powerSave"] = m
		}
	}
	if v, ok := apply("launchApp"); ok {
		if str, ok := v.(string); ok {
			if len(str) > 1024 {
				str = str[:1024]
			}
			a.state["launchApp"] = str
		}
	}
	if v, ok := apply("ledgerSource"); ok {
		if str, ok := v.(string); ok && apiProviders[str].label != "" {
			if ledgerSourceLocked(a.state) != str {
				a.ledger = nil
				a.ledgerSeq++
				ledgerDirty = true
			}
			a.state["ledgerSource"] = str
		}
	}
	if v, ok := apply("autoUpdate"); ok {
		if b, ok := v.(bool); ok {
			a.state["autoUpdate"] = b
		}
	}
	if v, ok := apply("character"); ok {
		if str, ok := v.(string); ok && validChar(str) {
			a.state["character"] = str
		}
	}
	if v, ok := apply("fontFamily"); ok {
		if fam, ok := v.(string); ok && a.validFontFamily(fam) {
			a.state["fontFamily"] = fam
		}
	}
	if v, ok := apply("fontSize"); ok {
		if f, ok := v.(float64); ok {
			a.state["fontSize"] = clampF(f, 0.8, 1.4)
		}
	}
	if v, ok := apply("fontWeight"); ok {
		if f, ok := v.(float64); ok {
			a.state["fontWeight"] = fontWeightOf(f)
		}
	}
	if v, ok := apply("sfx"); ok {
		if str, ok := v.(string); ok && (str == "default" || str == "whale" || str == "off") {
			a.state["sfx"] = str
		}
	}
	if v, ok := apply("lang"); ok {
		if str, ok := v.(string); ok && (str == "zh" || str == "en" || str == "ja") {
			a.state["lang"] = str
			a.setUILang(str)
		}
	}
	if v, ok := apply("autoActionSec"); ok {
		if f, ok := v.(float64); ok {
			a.state["autoActionSec"] = int(clampF(mathRound(f), 5, 300))
		}
	}
	if v, ok := apply("useCustomQuips"); ok {
		if b, ok := v.(bool); ok {
			a.state["useCustomQuips"] = b
		}
	}
	if v, ok := apply("customQuips"); ok {
		if arr, ok := v.([]interface{}); ok {
			lines := make([]string, 0, len(arr))
			for _, x := range arr {
				if str, ok := x.(string); ok {
					lines = append(lines, str)
				}
			}
			if cleaned, err := a.words.Sanitize(lines); err == nil {
				a.state["customQuips"] = cleaned
			}
		}
	}
	if v, ok := apply("pinnedActions"); ok {
		if m, ok := v.(map[string]interface{}); ok {
			a.state["pinnedActions"] = pinnedActionsOf(map[string]interface{}{"pinnedActions": m})
		}
	}
	a.mu.Unlock()
	if autoStartChanged {
		a.applyLoginItem()
	}
	if powerSaveChanged {
		a.emit("power-mode", a.PowerStatus())
	}
	a.saveState()
	if ledgerDirty && a.ledgerOn() {
		go a.refreshUsage()
	}
	a.trayRefresh()
}

func mathRound(f float64) float64 {
	if f < 0 {
		return float64(int64(f - 0.5))
	}
	return float64(int64(f + 0.5))
}

// 内置/半内置形象：v1 逐帧动画，gpt 是 GPT娘v1 图集。
// pack:<id> 是下载/导入的形象包；启动时前端会检查包是否还在，不在就回落 v1。
func validChar(s string) bool {
	switch s {
	case "v1", "gpt":
		return true
	}
	if id, ok := strings.CutPrefix(s, "pack:"); ok {
		return packIDPattern.MatchString(id)
	}
	return false
}

func (a *App) PickApp() string {
	p, err := openFileDialog(a.ctx,
		a.t("选择要和桌宠一起启动的应用", "Choose an app to launch with the pet", "ペットと一緒に起動するアプリを選択"),
		a.t("应用 / 快捷方式", "Applications / shortcuts", "アプリ / ショートカット"),
		a.t("所有文件", "All files", "すべてのファイル"))
	if err != nil {
		return ""
	}
	return p
}

func (a *App) OpenExternal(url string) {
	if !allowedURL(url) {
		return
	}
	_ = openURL(a.ctx, url)
}

// PickPackFile 让用户选择一个形象包 .zip，返回绝对路径（取消时返回空串）。
func (a *App) PickPackFile() string {
	p, err := pickPackFile(a.ctx,
		a.t("选择形象包（.zip）", "Choose a character pack (.zip)", "キャラクターパック（.zip）を選択"),
		a.t("形象包", "Character pack", "キャラクターパック"),
		a.t("所有文件", "All files", "すべてのファイル"))
	if err != nil {
		return ""
	}
	return p
}

func allowedURL(s string) bool {
	const repo = "https://github.com/shenliuyu18/dafeiyu-pet"
	const lanzou = "https://wwaql.lanzouu.com/b01i5xmkri"
	return s == repo || strings.HasPrefix(s, repo+"/") ||
		strings.HasPrefix(s, "https://gh-proxy.org/") || s == lanzou
}

func (a *App) Notify(text string) {
	a.balloon("question", appName(), text)
}

func (a *App) Quit() {
	a.saveStateNow()
	if a.ctx != nil {
		quitApp(a.ctx)
	}
}

// ---------------- 读表辅助 ----------------

func str(v interface{}, def string) string {
	if s, ok := v.(string); ok {
		return s
	}
	return def
}

func num(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}

func boolv(v interface{}, def bool) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return def
}
