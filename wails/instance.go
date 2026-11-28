package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// 多开：每个宠物一个进程，用槽位互斥保证同一槽只有一个实例。
// 槽 1 沿用旧版互斥名，老版本升级后仍是同一只宠物；槽 2 起加 -slotN 后缀。
const (
	maxInstances  = 16
	warnInstances = 4
)

var (
	instanceSlot     = 1
	instanceMutex    windows.Handle
	instanceToken    string
	instancePort     int
	instanceIsLeader = true
	procMessageBoxW  = user32.NewProc("MessageBoxW")
)

const (
	mbYesNo       = 0x00000004
	mbIconWarning = 0x00000030
	mbTopmost     = 0x00040000
	idYes         = 6
)

func baseInstanceName() string {
	name := `Global\dafeiyu-desktop-pet-wails`
	if isLite() {
		name += "-lite"
	}
	if isolatedMode {
		name += "-isolated"
	}
	return name
}

func slotMutexName(slot int) string {
	if slot <= 1 {
		return baseInstanceName()
	}
	return fmt.Sprintf("%s-slot%d", baseInstanceName(), slot)
}

// lockSlot 抢占某个槽位；返回 false 表示已被占用或创建失败。
func lockSlot(slot int) bool {
	name, _ := syscall.UTF16PtrFromString(slotMutexName(slot))
	h, err := windows.CreateMutex(nil, false, name)
	if err != nil {
		if errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
			if h != 0 {
				windows.CloseHandle(h)
			}
			return false
		}
		return false
	}
	if instanceMutex != 0 {
		windows.CloseHandle(instanceMutex)
	}
	instanceMutex = h
	instanceSlot = slot
	return true
}

func slotAlive(slot int) bool {
	name, _ := syscall.UTF16PtrFromString(slotMutexName(slot))
	h, err := windows.OpenMutex(windows.SYNCHRONIZE, false, name)
	if err != nil {
		return false
	}
	windows.CloseHandle(h)
	return true
}

func aliveSlots() []int {
	out := make([]int, 0, 4)
	for s := 1; s <= maxInstances; s++ {
		if slotAlive(s) {
			out = append(out, s)
		}
	}
	return out
}

func instanceCount() int { return len(aliveSlots()) }

func leaderSlot() int {
	for s := 1; s <= maxInstances; s++ {
		if slotAlive(s) {
			return s
		}
	}
	return 0
}

// acquireInstanceSlot 优先用 preferred（--slot 恢复会话时），否则从槽 1 起找空位。
func acquireInstanceSlot(preferred int) bool {
	if preferred >= 1 && preferred <= maxInstances {
		if lockSlot(preferred) {
			return true
		}
		return false
	}
	for s := 1; s <= maxInstances; s++ {
		if lockSlot(s) {
			return true
		}
	}
	return false
}

func argValue(name string) string {
	for i, a := range os.Args {
		if a == name && i+1 < len(os.Args) {
			return os.Args[i+1]
		}
		if strings.HasPrefix(a, name+"=") {
			return strings.TrimPrefix(a, name+"=")
		}
	}
	return ""
}

// confirmBox 用系统消息框确认；后续多开提示都走这里，避免前端面板未就绪时无法交互。
func confirmBox(text string) bool {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(appName())
	r, _, _ := procMessageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), mbYesNo|mbIconWarning|mbTopmost)
	return r == idYes
}

func infoBox(text string) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(appName())
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), mbIconWarning|mbTopmost)
}

// ---------------- 端点文件与 IPC ----------------

type instanceEndpoint struct {
	Slot      int    `json:"slot"`
	PID       int    `json:"pid"`
	Port      int    `json:"port"`
	Token     string `json:"token"`
	StartedAt int64  `json:"startedAt"`
}

func configRootDir() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = os.Getenv("APPDATA")
	}
	return filepath.Join(dir, appDataDirName())
}

func instancesDir() string { return filepath.Join(configRootDir(), "instances") }

func endpointPath(slot int) string {
	return filepath.Join(instancesDir(), fmt.Sprintf("%d.endpoint.json", slot))
}

func writeEndpoint(ep instanceEndpoint) error {
	if err := os.MkdirAll(instancesDir(), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(ep)
	if err != nil {
		return err
	}
	return os.WriteFile(endpointPath(ep.Slot), b, 0o600)
}

func readEndpoint(slot int) (instanceEndpoint, bool) {
	var ep instanceEndpoint
	b, err := os.ReadFile(endpointPath(slot))
	if err != nil {
		return ep, false
	}
	if json.Unmarshal(b, &ep) != nil || ep.Port <= 0 || ep.Token == "" {
		return instanceEndpoint{}, false
	}
	return ep, true
}

func removeEndpoint(slot int) {
	_ = os.Remove(endpointPath(slot))
}

// cleanStaleEndpoints 清掉崩溃/被强制结束留下的端点文件，避免 IPC 一直等超时。
func cleanStaleEndpoints() {
	entries, err := os.ReadDir(instancesDir())
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".endpoint.json") {
			continue
		}
		var slot int
		if _, err := fmt.Sscanf(e.Name(), "%d.endpoint.json", &slot); err != nil || slot <= 0 {
			continue
		}
		if slot == instanceSlot || !slotAlive(slot) {
			removeEndpoint(slot)
		}
	}
}

func newToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d-%d", os.Getpid(), time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// callInstance 访问另一个槽位的本机 IPC；只接受回环地址与正确 token。
func callInstance(slot int, cmd string, body []byte) ([]byte, error) {
	if !slotAlive(slot) {
		removeEndpoint(slot)
		return nil, fmt.Errorf("instance %d not running", slot)
	}
	ep, ok := readEndpoint(slot)
	if !ok {
		return nil, fmt.Errorf("instance %d not reachable", slot)
	}
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/%s", ep.Port, cmd), strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Pet-Token", ep.Token)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

func broadcast(cmd string) {
	self := instanceSlot
	for _, s := range aliveSlots() {
		if s == self {
			continue
		}
		_, _ = callInstance(s, cmd, nil)
	}
}

func startInstanceIPC(a *App) {
	cleanStaleEndpoints()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		crashLog("ipc", err.Error())
		return
	}
	instanceToken = newToken()
	instancePort = ln.Addr().(*net.TCPAddr).Port
	if err := writeEndpoint(instanceEndpoint{
		Slot: instanceSlot, PID: os.Getpid(), Port: instancePort,
		Token: instanceToken, StartedAt: time.Now().UnixMilli(),
	}); err != nil {
		crashLog("ipc-endpoint", err.Error())
	}
	mux := http.NewServeMux()
	authed := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("X-Pet-Token")
			if subtle.ConstantTimeCompare([]byte(got), []byte(instanceToken)) != 1 {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("/ping", authed(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"slot": instanceSlot, "primary": instanceIsLeader, "pid": os.Getpid(),
		})
	}))
	mux.HandleFunc("/show", authed(func(w http.ResponseWriter, r *http.Request) {
		a.showInactive()
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/hide", authed(func(w http.ResponseWriter, r *http.Request) {
		a.hideWindow()
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/toggle", authed(func(w http.ResponseWriter, r *http.Request) {
		a.toggleVisible()
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/quit", authed(func(w http.ResponseWriter, r *http.Request) {
		go a.Quit()
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/refresh", authed(func(w http.ResponseWriter, r *http.Request) {
		go a.refreshUsageForce(true)
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/notify", authed(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(io.LimitReader(r.Body, 8<<10))
		var msg struct {
			Title string `json:"title"`
			Text  string `json:"text"`
		}
		_ = json.Unmarshal(b, &msg)
		a.balloon("question", msg.Title, msg.Text)
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/reload-shared", authed(func(w http.ResponseWriter, r *http.Request) {
		a.reloadShared()
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/reload-characters", authed(func(w http.ResponseWriter, r *http.Request) {
		a.emit("characters-updated", nil)
		w.Write([]byte("ok"))
	}))
	mux.HandleFunc("/update-info", authed(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(a.updateInfo())
	}))
	go func() {
		if err := http.Serve(ln, mux); err != nil {
			crashLog("ipc-serve", err.Error())
		}
	}()
}

// ---------------- 启动 / 恢复 ----------------

func restoreSlotsPath() string { return filepath.Join(configRootDir(), "restore.json") }

type restoreFile struct {
	Slots []int `json:"slots"`
}

func readRestoreSlots() []int {
	b, err := os.ReadFile(restoreSlotsPath())
	if err != nil {
		return nil
	}
	var rf restoreFile
	if json.Unmarshal(b, &rf) != nil {
		return nil
	}
	seen := map[int]bool{}
	out := make([]int, 0, len(rf.Slots))
	for _, s := range rf.Slots {
		if s >= 1 && s <= maxInstances && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Ints(out)
	return out
}

func writeRestoreSlots(slots []int) {
	slots = append([]int(nil), slots...)
	sort.Ints(slots)
	b, err := json.Marshal(restoreFile{Slots: slots})
	if err != nil {
		return
	}
	p := restoreSlotsPath()
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return
	}
	tmp, err := os.CreateTemp(dir, ".restore.json.tmp-*")
	if err != nil {
		return
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err := tmp.Write(b); err != nil {
		_ = tmp.Close()
		return
	}
	if err := tmp.Close(); err != nil {
		return
	}
	_ = os.Rename(name, p)
}

// instanceLaunchArgs 子进程必须继承隔离模式与调试开关，否则会跑到正式命名空间。
func instanceLaunchArgs(extra ...string) []string {
	args := append([]string(nil), extra...)
	if isolatedMode {
		args = append(args, "--isolated")
	}
	if hasArg("--dev-debug") {
		args = append(args, "--dev-debug")
	}
	return args
}

// runRestoreSession 由计划任务或更新后的启动器调用：按上次会话拉起每组槽位，本身不建窗口。
func runRestoreSession() {
	slots := readRestoreSlots()
	if len(slots) == 0 {
		slots = []int{1}
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	for i, s := range slots {
		cmd := exec.Command(exe, instanceLaunchArgs(fmt.Sprintf("--slot=%d", s))...)
		cmd.SysProcAttr = hiddenProcAttr()
		_ = cmd.Start()
		// 错开启动，避免同时抢窗口类与 WebView2 初始化高峰
		if i < len(slots)-1 {
			time.Sleep(300 * time.Millisecond)
		}
	}
}

// addRestoreSlot 把本槽位登记到会话恢复列表；并发启动时在互斥内合并，避免互相覆盖。
func addRestoreSlot() {
	unlock := lockNamed(baseInstanceName() + "-restore")
	defer unlock()
	slots := readRestoreSlots()
	for _, s := range slots {
		if s == instanceSlot {
			return
		}
	}
	writeRestoreSlots(append(slots, instanceSlot))
}

// removeRestoreSlot 只在本实例主动退出时调用；崩溃不写盘，下次开机仍会恢复这只。
func removeRestoreSlot() {
	unlock := lockNamed(baseInstanceName() + "-restore")
	defer unlock()
	slots := readRestoreSlots()
	out := make([]int, 0, len(slots))
	for _, s := range slots {
		if s != instanceSlot {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		out = []int{1}
	}
	writeRestoreSlots(out)
}

// instanceRole 返回当前槽位是否主实例（存活槽位中编号最小者）与总数。
func instanceRole() (int, bool, int) {
	slots := aliveSlots()
	if len(slots) == 0 {
		return instanceSlot, true, 0
	}
	return slots[0], slots[0] == instanceSlot, len(slots)
}

func (a *App) instanceLoop() {
	lastLeader := -1
	lastCount := -1
	for {
		a.mu.Lock()
		quitting := a.quitting
		a.mu.Unlock()
		if quitting {
			return
		}
		slots := aliveSlots()
		leader := 0
		if len(slots) > 0 {
			leader = slots[0]
		}
		isLeader := leader == instanceSlot
		instanceIsLeader = isLeader
		if isLeader && a.tray == nil {
			a.ensureTray()
		} else if !isLeader && a.tray != nil {
			a.stopTray()
		}
		if leader != lastLeader || len(slots) != lastCount {
			lastLeader = leader
			lastCount = len(slots)
			a.emit("instance-info", map[string]interface{}{
				"slot":   instanceSlot,
				"leader": isLeader,
				"count":  len(slots),
				"max":    maxInstances,
			})
		}
		time.Sleep(2 * time.Second)
	}
}

// ---------------- App 接口 ----------------

func (a *App) InstanceInfo() map[string]interface{} {
	leader, isLeader, count := instanceRole()
	return map[string]interface{}{
		"slot":       instanceSlot,
		"leader":     isLeader,
		"count":      count,
		"max":        maxInstances,
		"leaderSlot": leader,
	}
}

func (a *App) SpawnInstance() map[string]interface{} {
	count := instanceCount()
	if count >= maxInstances {
		return map[string]interface{}{"ok": false, "code": "LIMIT", "error": t3("最多只能同时养 16 只", "At most 16 pets at once", "同時に飼えるのは最大16匹です")}
	}
	// 确认放在发起方：子进程弹框会让点「再养一只」的这只看起来没反应
	if count >= warnInstances && !a.getBool("multiWarnOff", false) {
		if !confirmBox(fmt.Sprintf(t3(
			"现在已经有 %d 只桌宠，每只约占用 290 MB 内存、漫游时约 23%% 单核。确定再养一只吗？（可在 设置 → 多开 里关闭此提醒）",
			"There are already %d pets running, about 290 MB and ~23%% of one core each while roaming. Add another one? (Turn this prompt off in Settings → Multiple pets.)",
			"すでに %d 匹のペットがいます（1匹あたり約290MB、散歩中はCPU1コアの約23%%）。もう1匹追加しますか？（設定 → 複数ペット でこの確認をオフにできます）"), count)) {
			return map[string]interface{}{"ok": false, "code": "CANCEL"}
		}
	}
	exe, err := os.Executable()
	if err != nil {
		crashLog("spawn", err.Error())
		return map[string]interface{}{"ok": false, "code": "SPAWN", "error": t3("无法启动新的桌宠", "Could not start a new pet", "新しいペットを起動できません")}
	}
	cmd := exec.Command(exe, instanceLaunchArgs("--no-confirm")...)
	cmd.SysProcAttr = hiddenProcAttr()
	if err := cmd.Start(); err != nil {
		crashLog("spawn", err.Error())
		return map[string]interface{}{"ok": false, "code": "SPAWN", "error": t3("无法启动新的桌宠", "Could not start a new pet", "新しいペットを起動できません")}
	}
	return map[string]interface{}{"ok": true}
}

func (a *App) QuitAll() {
	// 不占住托盘的窗口线程：广播可能因个别实例无响应而变慢
	go func() {
		broadcast("quit")
		time.Sleep(400 * time.Millisecond)
		a.Quit()
	}()
}

// activateLeader 在槽位已满时把主实例叫出来。
func activateLeader() {
	if s := leaderSlot(); s > 0 {
		if s == instanceSlot {
			return
		}
		_, _ = callInstance(s, "show", nil)
	}
}
