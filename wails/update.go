package main

import (
	"encoding/json"
	"errors"
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

// updateError 让下载/校验/启动三类失败在前端有稳定的错误码，
// 不再只能把一段中文提示扔给用户。
type updateError struct {
	Code string
	Msg  string
}

func (e *updateError) Error() string { return e.Msg }

func updateErr(code, format string, args ...interface{}) error {
	return &updateError{Code: code, Msg: fmt.Sprintf(format, args...)}
}

func updateErrorCode(err error) string {
	var ue *updateError
	if errors.As(err, &ue) {
		return ue.Code
	}
	return "UNKNOWN"
}

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
		if i < len(na) {
			x = na[i]
		}
		if i < len(nb) {
			y = nb[i]
		}
		if x != y {
			if x > y {
				return 1
			}
			return -1
		}
	}
	if pa == pb {
		return 0
	}
	if pa == "" {
		return 1
	}
	if pb == "" {
		return -1
	}
	if pa > pb {
		return 1
	}
	return -1
}

const githubLatestReleaseURL = "https://api.github.com/repos/shenliuyu18/dafeiyu-pet/releases/latest"

func (a *App) fetchLatestRelease() (map[string]interface{}, error) {
	return a.fetchLatestReleaseFrom(&http.Client{Timeout: 8 * time.Second}, githubLatestReleaseURL)
}

// fetchLatestReleaseFrom 带 ETag / Last-Modified 条件请求：304 时直接复用上一份
// Release JSON，不再重复解析和消耗 GitHub 的 API 限额。
func (a *App) fetchLatestReleaseFrom(client *http.Client, url string) (map[string]interface{}, error) {
	a.mu.Lock()
	etag, lastMod, cached := a.releaseETag, a.releaseLastMod, a.releaseRaw
	a.mu.Unlock()

	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "dafeiyu-pet")
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Cache-Control", "no-cache")
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	} else if lastMod != "" {
		req.Header.Set("If-Modified-Since", lastMod)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s", t3("网络请求失败", "Network request failed", "ネットワーク接続に失敗しました"))
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotModified {
		if cached == nil {
			return nil, fmt.Errorf("%s", t3("GitHub 返回 304 但没有缓存", "GitHub returned 304 but there is no cached copy", "GitHub が 304 を返しましたがキャッシュがありません"))
		}
		return cloneUpdateInfo(cached), nil
	}
	if res.StatusCode != http.StatusOK {
		switch res.StatusCode {
		case http.StatusForbidden, http.StatusTooManyRequests:
			return nil, fmt.Errorf("%s", t3("GitHub 请求过于频繁，请稍后再试", "GitHub is rate-limiting requests; try again later", "GitHub のリクエスト制限中です。しばらくして再試行してください"))
		case http.StatusNotFound:
			return nil, fmt.Errorf("%s", t3("没有找到发布版本", "No release found", "リリースが見つかりません"))
		default:
			return nil, fmt.Errorf("GitHub HTTP %d", res.StatusCode)
		}
	}
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	var j map[string]interface{}
	if json.Unmarshal(body, &j) != nil {
		return nil, fmt.Errorf("%s", t3("GitHub 返回解析失败", "Failed to parse the GitHub response", "GitHub の応答を解析できません"))
	}
	if strv(j["tag_name"], "") == "" {
		return nil, fmt.Errorf("%s", t3("没有找到发布版本", "No release found", "リリースが見つかりません"))
	}
	a.mu.Lock()
	a.releaseETag = res.Header.Get("ETag")
	a.releaseLastMod = res.Header.Get("Last-Modified")
	a.releaseRaw = j
	a.mu.Unlock()
	return j, nil
}

func cloneUpdateInfo(src map[string]interface{}) map[string]interface{} {
	if src == nil {
		return nil
	}
	dst := make(map[string]interface{}, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func (a *App) CheckUpdate() map[string]interface{} {
	cur := Version
	a.mu.Lock()
	// 60 秒内复用结果：手动连点只消耗一次 GitHub 限额；跨过 60 秒也会走 304。
	if a.lastUpdate != nil && !a.lastUpdateAt.IsZero() && time.Since(a.lastUpdateAt) < 60*time.Second {
		cached := cloneUpdateInfo(a.lastUpdate)
		a.mu.Unlock()
		return cached
	}
	a.mu.Unlock()
	j, err := a.fetchLatestRelease()
	if err != nil {
		return map[string]interface{}{"current": cur, "error": err.Error()}
	}
	tag := strv(j["tag_name"], "")
	url := strv(j["html_url"], "https://github.com/shenliuyu18/dafeiyu-pet/releases")
	assets, _ := j["assets"].([]interface{})
	assetName, assetURL := pickUpdateAsset(assets, isLite())
	_, sumsURL := pickReleaseAsset(assets, "SHA256SUMS.txt")
	_, sigURL := pickReleaseAsset(assets, "SHA256SUMS.txt.sig")
	has := cmpVersion(tag, cur) > 0
	out := map[string]interface{}{
		"current": cur, "latest": tag, "hasUpdate": has,
		"assetName": assetName, "url": assetURL, "urlPage": url,
		"sumsUrl": sumsURL, "sigUrl": sigURL,
		"proxyUrl": "", "error": "", "variant": Variant,
	}
	if assetURL != "" {
		out["proxyUrl"] = "https://gh-proxy.org/" + assetURL
	}
	if has && assetURL == "" {
		out["error"] = t3("最新版本没有找到安装包", "No installer found for the latest version", "最新バージョンのインストーラーが見つかりません")
	}
	// 没有校验清单就停用自动更新：宁可让用户手动下载，也不执行未校验的安装包
	if has && sumsURL == "" {
		out["hasUpdate"] = false
		out["error"] = t3("最新版本缺少 SHA256SUMS.txt，已停用自动更新（可在 Releases 手动下载）", "The latest version is missing SHA256SUMS.txt, so auto-update is disabled (download manually from Releases)", "最新版に SHA256SUMS.txt がないため自動更新を停止しました（Releases から手動でダウンロードできます）")
	}
	if strv(out["error"], "") == "" {
		a.mu.Lock()
		a.lastUpdate = out
		a.lastUpdateAt = time.Now()
		a.mu.Unlock()
	}
	return out
}

func assetMatchesVariant(name string, lite bool) bool {
	base := strings.ToLower(filepath.Base(strings.TrimSpace(name)))
	if !strings.HasSuffix(base, "setup.exe") {
		return false
	}
	if lite {
		return strings.HasPrefix(base, "dafeiyu-pet-lite-")
	}
	return strings.HasPrefix(base, "dafeiyu-pet-") && !strings.Contains(base, "lite")
}

func pickUpdateAsset(assets []interface{}, lite bool) (string, string) {
	for _, ai := range assets {
		am, _ := ai.(map[string]interface{})
		name := strv(am["name"], "")
		if !assetMatchesVariant(name, lite) {
			continue
		}
		url := strv(am["browser_download_url"], "")
		if url != "" {
			return name, url
		}
	}
	return "", ""
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

// updatePartName 返回跨重试稳定的临时文件名；不能用 uniqueDownloadPath 的结果，
// 否则每次重试都会换一个新路径，续传就永远接不上。
func updatePartName(name string) string {
	name = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, filepath.Base(name))
	if name == "" || name == "." {
		name = defaultUpdateAssetName()
	}
	return "." + name + ".part"
}

func parseContentRangeTotal(v string) int64 {
	i := strings.LastIndexByte(v, '/')
	if i < 0 {
		return 0
	}
	n, err := strconv.ParseInt(strings.TrimSpace(v[i+1:]), 10, 64)
	if err != nil || n <= 0 {
		return 0
	}
	return n
}

// downloadTo 下载到 dest，但先写 dest 之外的 .part 文件：
// - 网络中断时保留 .part，下次同一版本重试会带 Range 续传；
// - 服务端不支持 Range（回 200）时自动回退整包；
// - 校验失败由调用方删除 .part，避免坏包被反复续传。
func downloadTo(url, dest, part string, onProgress func(received, total int64)) error {
	if part == "" {
		part = dest + ".part"
	}
	return downloadToOnce(url, dest, part, onProgress, true)
}

func downloadToOnce(url, dest, part string, onProgress func(received, total int64), allowRetry bool) error {
	var offset int64
	if st, err := os.Stat(part); err == nil && st.Mode().IsRegular() {
		offset = st.Size()
		// 三天前的半包大概率是另一个版本或已失效，直接重下
		if offset > 0 && time.Since(st.ModTime()) > 72*time.Hour {
			_ = os.Remove(part)
			offset = 0
		}
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return updateErr("NETWORK", "%s", t3("下载地址无效", "Invalid download URL", "ダウンロード URL が無効です"))
	}
	req.Header.Set("User-Agent", "dafeiyu-pet")
	if offset > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", offset))
	}
	client := &http.Client{Timeout: 30 * time.Minute}
	res, err := client.Do(req)
	if err != nil {
		return updateErr("NETWORK", "%s", t3("网络请求失败", "Network request failed", "ネットワーク接続に失敗しました"))
	}
	defer res.Body.Close()

	total := int64(0)
	appendMode := false
	switch {
	case offset > 0 && res.StatusCode == http.StatusPartialContent:
		appendMode = true
		total = offset + res.ContentLength
		if t := parseContentRangeTotal(res.Header.Get("Content-Range")); t > 0 {
			total = t
		}
	case offset > 0 && res.StatusCode == http.StatusRequestedRangeNotSatisfiable:
		// 半包比服务端文件还大（例如换了发布），丢掉重来一次
		_ = os.Remove(part)
		if allowRetry {
			return downloadToOnce(url, dest, part, onProgress, false)
		}
		return updateErr("NETWORK", "%s", t3("续传状态失效，请重试", "Resume state is stale; try again", "再開状態が無効です。再試行してください"))
	case res.StatusCode == http.StatusOK:
		offset = 0
		total = res.ContentLength
	default:
		_ = os.Remove(part)
		return updateErr("NETWORK", "HTTP %d", res.StatusCode)
	}

	flags := os.O_CREATE | os.O_WRONLY
	if appendMode {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
	}
	f, err := os.OpenFile(part, flags, 0644)
	if err != nil {
		return updateErr("DISK", "%s", t3("写入文件失败", "Failed to write the file", "ファイルの書き込みに失敗しました"))
	}
	received := offset
	last := time.Now()
	buf := make([]byte, 256*1024)
	for {
		n, er := res.Body.Read(buf)
		if n > 0 {
			if _, ew := f.Write(buf[:n]); ew != nil {
				f.Close()
				return updateErr("DISK", "%s", t3("写入文件失败", "Failed to write the file", "ファイルの書き込みに失敗しました"))
			}
			received += int64(n)
			if onProgress != nil && time.Since(last) > 200*time.Millisecond {
				last = time.Now()
				onProgress(received, total)
			}
		}
		if er == io.EOF {
			break
		}
		if er != nil {
			f.Close()
			// 保留 .part，下一次重试继续
			return updateErr("NETWORK", "%s", t3("下载中断", "Download interrupted", "ダウンロードが中断されました"))
		}
	}
	if err := f.Close(); err != nil {
		return updateErr("DISK", "%s", t3("写入文件失败", "Failed to write the file", "ファイルの書き込みに失敗しました"))
	}
	if onProgress != nil {
		onProgress(received, total)
	}
	_ = os.Remove(dest)
	if err := os.Rename(part, dest); err != nil {
		return updateErr("DISK", "%s", t3("保存安装包失败", "Failed to save the installer", "インストーラーの保存に失敗しました"))
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
	if isolatedMode {
		return map[string]interface{}{"started": false, "code": "ISOLATED", "error": t3("隔离调试实例不允许下载更新", "The isolated debug instance cannot download updates", "隔離デバッグ環境では更新をダウンロードできません")}
	}
	if !a.beginUpdate(false) {
		return map[string]interface{}{"started": false, "code": "BUSY", "error": t3("正在下载", "Downloading", "ダウンロード中")}
	}
	info := a.updateInfo()
	if !boolv(info["hasUpdate"], false) || strv(info["url"], "") == "" {
		a.endUpdate(false)
		return map[string]interface{}{"started": false, "code": "NO_UPDATE", "error": t3("没有可下载的新版本", "No newer version to download", "ダウンロードできる新しいバージョンはありません")}
	}
	if !assetMatchesVariant(strv(info["assetName"], ""), isLite()) {
		a.endUpdate(false)
		return map[string]interface{}{"started": false, "code": "MISMATCH", "error": t3("更新包与当前版本不匹配", "The update package does not match the current version", "更新パッケージが現在のバージョンと一致しません")}
	}
	dir, err := os.UserHomeDir()
	if err != nil {
		dir = os.TempDir()
	}
	dir = filepath.Join(dir, "Downloads")
	_ = os.MkdirAll(dir, 0755)
	name := strv(info["assetName"], defaultUpdateAssetName())
	dest := uniqueDownloadPath(dir, name)
	part := filepath.Join(dir, updatePartName(name))
	url := strv(info["url"], "")
	if mode == "accel" {
		url = strv(info["proxyUrl"], url)
	}
	go func() {
		defer a.endUpdate(false)
		err := downloadTo(url, dest, part, func(rec, total int64) {
			pct := 0
			if total > 0 {
				pct = int(minF(99, float64(rec)/float64(total)*100))
			}
			a.emit("update-progress", map[string]interface{}{"received": rec, "total": total, "percent": pct})
		})
		if err == nil {
			err = verifyUpdateFile(dest, info)
		}
		if err != nil {
			_ = os.Remove(dest)
			// 网络中断保留 .part 供下次续传；哈希/包不匹配的坏包必须清掉
			if updateErrorCode(err) != "NETWORK" {
				_ = os.Remove(part)
			}
			code := updateErrorCode(err)
			crashLog("update", code+": "+err.Error())
			a.emit("update-done", map[string]interface{}{"ok": false, "code": code, "error": err.Error()})
			return
		}
		if !a.spawnInteractiveUpdate(dest) {
			_ = os.Remove(dest)
			_ = os.Remove(part)
			crashLog("update", "LAUNCH: 无法打开安装程序")
			a.emit("update-done", map[string]interface{}{"ok": false, "code": "LAUNCH", "error": t3("无法打开安装程序", "Could not start the installer", "インストーラーを起動できません")})
			return
		}
		a.emit("update-done", map[string]interface{}{"ok": true, "launching": true, "file": filepath.Base(dest), "path": dest})
		time.Sleep(500 * time.Millisecond)
		a.Quit()
	}()
	return map[string]interface{}{"started": true}
}

func (a *App) InstallUpdate() map[string]interface{} {
	if isolatedMode {
		return map[string]interface{}{"started": false, "code": "ISOLATED", "error": t3("隔离调试实例不允许安装更新", "The isolated debug instance cannot install updates", "隔離デバッグ環境では更新をインストールできません")}
	}
	if !a.beginUpdate(true) {
		return map[string]interface{}{"started": false, "code": "BUSY", "error": t3("正在更新", "Updating", "更新中")}
	}
	info := a.updateInfo()
	if !boolv(info["hasUpdate"], false) || strv(info["url"], "") == "" {
		a.endUpdate(true)
		return map[string]interface{}{"started": false, "code": "NO_UPDATE", "error": t3("没有可更新的版本", "No newer version to update", "更新できる新しいバージョンはありません")}
	}
	if !assetMatchesVariant(strv(info["assetName"], ""), isLite()) {
		a.endUpdate(true)
		return map[string]interface{}{"started": false, "code": "MISMATCH", "error": t3("更新包与当前版本不匹配", "The update package does not match the current version", "更新パッケージが現在のバージョンと一致しません")}
	}
	a.balloon("done", a.displayName(), fmt.Sprintf(a.t("发现新版本 %s，正在后台下载并自动安装…", "New version %s found. Downloading and installing in the background…", "新バージョン %s を見つけました。バックグラウンドでダウンロードして自動インストールします…"), strv(info["latest"], "")))
	go func() {
		defer a.endUpdate(true)
		dir := filepath.Join(os.TempDir(), "dafeiyu-update")
		_ = os.MkdirAll(dir, 0755)
		name := filepath.Base(strv(info["assetName"], "setup.exe"))
		dest := filepath.Join(dir, fmt.Sprintf("update-%d-%s", time.Now().Unix(), name))
		part := filepath.Join(dir, updatePartName(name))
		url := strv(info["proxyUrl"], "")
		if url == "" {
			url = strv(info["url"], "")
		}
		err := downloadTo(url, dest, part, func(rec, total int64) {
			pct := 0
			if total > 0 {
				pct = int(minF(99, float64(rec)/float64(total)*100))
			}
			a.emit("update-progress", map[string]interface{}{"received": rec, "total": total, "percent": pct})
		})
		if err == nil {
			err = verifyUpdateFile(dest, info)
		}
		if err != nil {
			_ = os.Remove(dest)
			if updateErrorCode(err) != "NETWORK" {
				_ = os.Remove(part)
			}
			code := updateErrorCode(err)
			crashLog("update", code+": "+err.Error())
			a.balloon("error", a.displayName(), a.t("自动更新校验/下载失败：", "Auto-update verification/download failed: ", "自動更新の検証／ダウンロードに失敗：")+err.Error()+a.t("，可在设置里手动重试", ". You can retry manually in Settings.", "。設定から手動で再試行できます。"))
			a.emit("update-done", map[string]interface{}{"ok": false, "code": code, "error": err.Error()})
			return
		}
		if !a.spawnSilentUpdate(dest) {
			_ = os.Remove(dest)
			_ = os.Remove(part)
			crashLog("update", "LAUNCH: 无法启动安装程序")
			a.emit("update-done", map[string]interface{}{"ok": false, "code": "LAUNCH", "error": t3("无法启动安装程序", "Could not launch the installer", "インストーラーを起動できません")})
			return
		}
		time.Sleep(500 * time.Millisecond)
		a.Quit()
	}()
	return map[string]interface{}{"started": true}
}

// 下载完成后先退出桌宠，再打开交互式安装界面；安装结束（或取消）后重新启动桌宠。
func (a *App) spawnInteractiveUpdate(installer string) bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	script := filepath.Join(os.TempDir(), fmt.Sprintf("dafeiyu-update-ui-%d.cmd", time.Now().UnixNano()))
	lines := []string{
		"@echo off",
		"ping -n 4 127.0.0.1 >nul",
		fmt.Sprintf(`start /wait "" "%s"`, installer),
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
	if !a.getBool("autoUpdate", false) {
		a.balloon("done", a.displayName(), fmt.Sprintf(a.t("发现新版本 %s，可在设置 → 启动与更新里下载或安装", "New version %s is available. Download or install it in Settings → Startup & Updates.", "新バージョン %s があります。設定 → 起動と更新 からダウンロードまたはインストールできます。"), strv(info["latest"], "")))
		return
	}
	a.InstallUpdate()
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
