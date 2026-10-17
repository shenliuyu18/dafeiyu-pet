package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func cmpVersion(a, b string) int {
	parse := func(s string) (nums []int, pre string) {
		s = strings.TrimPrefix(strings.TrimSpace(s), "v")
		if i := strings.IndexByte(s, '-'); i >= 0 {
			pre = s[i+1:]
			s = s[:i]
		}
		for _, x := range strings.Split(s, ".") {
			n, _ := strconv.Atoi(x)
			nums = append(nums, n)
		}
		return
	}
	na, pa := parse(a)
	nb, pb := parse(b)
	for i := 0; i < len(na) || i < len(nb); i++ {
		x, y := 0, 0
		if i < len(na) { x = na[i] }
		if i < len(nb) { y = nb[i] }
		if x != y {
			if x > y { return 1 }
			return -1
		}
	}
	if pa == pb { return 0 }
	if pa == "" { return 1 }
	if pb == "" { return -1 }
	if pa > pb { return 1 }
	return -1
}

func fetchLatestRelease() (map[string]interface{}, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/shenliuyu18/dafeiyu-pet/releases/latest", nil)
	req.Header.Set("User-Agent", "dafeiyu-pet")
	req.Header.Set("Accept", "application/vnd.github+json")
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("网络请求失败")
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	var j map[string]interface{}
	if json.Unmarshal(body, &j) != nil {
		return nil, fmt.Errorf("GitHub 返回解析失败")
	}
	if strv(j["tag_name"], "") == "" {
		return nil, fmt.Errorf("没有找到发布版本")
	}
	return j, nil
}

func (a *App) CheckUpdate() map[string]interface{} {
	cur := Version
	j, err := fetchLatestRelease()
	if err != nil {
		return map[string]interface{}{"current": cur, "error": err.Error()}
	}
	tag := strv(j["tag_name"], "")
	url := strv(j["html_url"], "https://github.com/shenliuyu18/dafeiyu-pet/releases")
	assets, _ := j["assets"].([]interface{})
	var assetName, assetURL string
	for _, ai := range assets {
		am, _ := ai.(map[string]interface{})
		name := strv(am["name"], "")
		low := strings.ToLower(name)
		if !strings.HasSuffix(low, "setup.exe") {
			continue
		}
		// 完整版不能下载 Lite 包，Lite 也只下载 Lite 包
		if strings.Contains(low, "lite") != isLite() {
			continue
		}
		assetName = name
		assetURL = strv(am["browser_download_url"], "")
		break
	}
	has := cmpVersion(tag, cur) > 0
	out := map[string]interface{}{
		"current": cur, "latest": tag, "hasUpdate": has,
		"assetName": assetName, "url": assetURL, "urlPage": url,
		"proxyUrl": "", "error": "",
	}
	if assetURL != "" {
		out["proxyUrl"] = "https://gh-proxy.org/" + assetURL
	}
	if has && assetURL == "" {
		out["error"] = "最新版本没有找到安装包"
	}
	a.mu.Lock()
	a.lastUpdate = out
	a.mu.Unlock()
	return out
}

func defaultUpdateAssetName() string {
	if isLite() {
		return "dafeiyu-pet-lite-setup.exe"
	}
	return "dafeiyu-pet-setup.exe"
}

func uniqueDownloadPath(dir, name string) string {
	name = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, filepath.Base(name))
	if name == "" || name == "." {
		name = defaultUpdateAssetName()
	}
	p := filepath.Join(dir, name)
	if _, err := os.Stat(p); err != nil {
		return p
	}
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for i := 1; i < 100; i++ {
		q := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
		if _, err := os.Stat(q); err != nil {
			return q
		}
	}
	return filepath.Join(dir, fmt.Sprintf("%s-%d%s", stem, time.Now().Unix(), ext))
}

func downloadTo(url, dest string, onProgress func(received, total int64)) error {
	res, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("网络请求失败")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return fmt.Errorf("写入文件失败")
	}
	defer f.Close()
	total := res.ContentLength
	var received int64
	last := time.Now()
	buf := make([]byte, 64*1024)
	for {
		n, er := res.Body.Read(buf)
		if n > 0 {
			if _, ew := f.Write(buf[:n]); ew != nil {
				return fmt.Errorf("写入文件失败")
			}
			received += int64(n)
			if onProgress != nil && time.Since(last) > 400*time.Millisecond {
				last = time.Now()
				onProgress(received, total)
			}
		}
		if er == io.EOF {
			break
		}
		if er != nil {
			return fmt.Errorf("下载中断")
		}
	}
	if onProgress != nil {
		onProgress(received, total)
	}
	return nil
}

func (a *App) updateInfo() map[string]interface{} {
	a.mu.Lock()
	lu := a.lastUpdate
	a.mu.Unlock()
	if lu != nil {
		return lu
	}
	return a.CheckUpdate()
}

func (a *App) DownloadUpdate(mode string) map[string]interface{} {
	a.mu.Lock()
	busy := a.updateBusy
	a.mu.Unlock()
	if busy {
		return map[string]interface{}{"started": false, "error": "正在下载"}
	}
	info := a.updateInfo()
	if !boolv(info["hasUpdate"], false) || strv(info["url"], "") == "" {
		return map[string]interface{}{"started": false, "error": "没有可下载的新版本"}
	}
	dir, err := os.UserHomeDir()
	if err != nil {
		dir = os.TempDir()
	}
	dir = filepath.Join(dir, "Downloads")
	_ = os.MkdirAll(dir, 0755)
	dest := uniqueDownloadPath(dir, strv(info["assetName"], defaultUpdateAssetName()))
	url := strv(info["url"], "")
	if mode == "accel" {
		url = strv(info["proxyUrl"], url)
	}
	a.mu.Lock()
	a.updateBusy = true
	a.mu.Unlock()
	go func() {
		err := downloadTo(url, dest, func(rec, total int64) {
			pct := 0
			if total > 0 {
				pct = int(minF(99, float64(rec)/float64(total)*100))
			}
			a.emit("update-progress", map[string]interface{}{"received": rec, "total": total, "percent": pct})
		})
		a.mu.Lock()
		a.updateBusy = false
		a.mu.Unlock()
		if err != nil {
			a.emit("update-done", map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		a.emit("update-done", map[string]interface{}{"ok": true, "file": filepath.Base(dest), "path": dest})
	}()
	return map[string]interface{}{"started": true}
}

func (a *App) InstallUpdate() map[string]interface{} {
	a.mu.Lock()
	busy := a.updateBusy || a.autoUpdating
	a.mu.Unlock()
	if busy {
		return map[string]interface{}{"started": false, "error": "正在更新"}
	}
	info := a.updateInfo()
	if !boolv(info["hasUpdate"], false) || strv(info["url"], "") == "" {
		return map[string]interface{}{"started": false, "error": "没有可更新的版本"}
	}
	a.mu.Lock()
	a.updateBusy = true
	a.autoUpdating = true
	a.mu.Unlock()
	a.balloon("done", appName(), fmt.Sprintf("发现新版本 %s，正在后台下载并自动安装…", strv(info["latest"], "")))
	go func() {
		dir := filepath.Join(os.TempDir(), "dafeiyu-update")
		_ = os.MkdirAll(dir, 0755)
		dest := filepath.Join(dir, fmt.Sprintf("update-%d-%s", time.Now().Unix(), filepath.Base(strv(info["assetName"], "setup.exe"))))
		url := strv(info["proxyUrl"], "")
		if url == "" {
			url = strv(info["url"], "")
		}
		err := downloadTo(url, dest, func(rec, total int64) {
			pct := 0
			if total > 0 {
				pct = int(minF(99, float64(rec)/float64(total)*100))
			}
			a.emit("update-progress", map[string]interface{}{"received": rec, "total": total, "percent": pct})
		})
		a.mu.Lock()
		a.updateBusy = false
		a.autoUpdating = false
		a.mu.Unlock()
		if err != nil {
			a.balloon("error", appName(), "自动更新下载失败："+err.Error()+"，可在设置里手动重试")
			a.emit("update-done", map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		if !a.spawnSilentUpdate(dest) {
			a.emit("update-done", map[string]interface{}{"ok": false, "error": "无法启动安装程序"})
			return
		}
		time.Sleep(500 * time.Millisecond)
		a.Quit()
	}()
	return map[string]interface{}{"started": true}
}

func (a *App) spawnSilentUpdate(installer string) bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	script := filepath.Join(os.TempDir(), fmt.Sprintf("dafeiyu-update-%d.cmd", time.Now().UnixNano()))
	lines := []string{
		"@echo off",
		"ping -n 4 127.0.0.1 >nul",
		fmt.Sprintf(`start /wait "" "%s" /S`, installer),
		"ping -n 3 127.0.0.1 >nul",
		fmt.Sprintf(`start "" "%s"`, exe),
		`del "%~f0"`,
	}
	if os.WriteFile(script, []byte(strings.Join(lines, "\r\n")+"\r\n"), 0644) != nil {
		return false
	}
	cmd := exec.Command("cmd.exe", "/c", script)
	cmd.SysProcAttr = hiddenProcAttr()
	return cmd.Start() == nil
}

func (a *App) silentUpdateCheck() {
	info := a.CheckUpdate()
	if info == nil || strv(info["error"], "") != "" || !boolv(info["hasUpdate"], false) {
		return
	}
	if !a.getBool("autoUpdate", true) {
		a.balloon("done", appName(), fmt.Sprintf("发现新版本 %s，可在设置 → 启动与更新里下载或安装", strv(info["latest"], "")))
		return
	}
	a.InstallUpdate()
}
