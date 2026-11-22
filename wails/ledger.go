package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type apiProvider struct {
	label string
	short string
	env   string
	fetch func(string) map[string]interface{}
}

var apiProviders = map[string]apiProvider{
	"deepseek":    {label: "DeepSeek", short: "DeepSeek", env: "DEEPSEEK_API_KEY", fetch: fetchDeepseek},
	"moonshot":    {label: "Kimi（Moonshot）", short: "Kimi", env: "MOONSHOT_API_KEY", fetch: fetchMoonshot},
	"siliconflow": {label: "SiliconFlow（硅基流动）", short: "SiliconFlow", env: "SILICONFLOW_API_KEY", fetch: fetchSiliconflow},
	"doubao":      {label: "豆包（火山方舟）", short: "豆包", env: "VOLC_ACCESSKEY", fetch: fetchDoubao},
	"openai":      {label: "ChatGPT（OpenAI）", short: "OpenAI", env: "OPENAI_ADMIN_KEY", fetch: fetchOpenai},
	"claude":      {label: "Claude（Anthropic）", short: "Claude", env: "ANTHROPIC_ADMIN_KEY", fetch: fetchClaude},
}

var keyHints = map[string]string{
	"deepseek":    "普通 API Key 即可（sk-…）",
	"moonshot":    "普通 API Key 即可（sk-…）",
	"siliconflow": "普通 API Key 即可（sk-…）",
	"doubao":      "豆包需要填写火山引擎访问密钥对「AK:SK」",
	"openai":      "需要 OpenAI Admin Key（sk-admin…），普通 Key 无法查询账单",
	"claude":      "需要 Anthropic Admin Key（sk-ant-admin…）",
}

// apiError 是账单查询失败的结构化原因：前端据此给出可操作的提示，
// 用户反馈 issue #3 时也能直接看到错误码、HTTP 状态与耗时。
type apiError struct {
	Code       string
	Message    string
	Hint       string
	HTTPStatus int
}

func (e *apiError) Error() string { return e.Message }

func apiFailure(code, msg, hint string) map[string]interface{} {
	out := map[string]interface{}{"error": msg, "errorCode": code}
	if hint != "" {
		out["errorHint"] = hint
	}
	return out
}

// failureResult 把 fetch 里的 error 统一转成前端可读的诊断字段。
func failureResult(prefix string, err error) map[string]interface{} {
	msg := err.Error()
	if prefix != "" && !strings.HasPrefix(msg, prefix) {
		msg = prefix + "：" + msg
	}
	out := map[string]interface{}{"error": msg, "errorCode": "UNKNOWN"}
	var ae *apiError
	if errors.As(err, &ae) {
		out["errorCode"] = ae.Code
		if ae.Hint != "" {
			out["errorHint"] = ae.Hint
		}
		if ae.HTTPStatus != 0 {
			out["httpStatus"] = ae.HTTPStatus
		}
	}
	return out
}

func httpFailure(status int, body []byte) *apiError {
	e := &apiError{
		HTTPStatus: status,
		Code:       "HTTP_ERROR",
		Message:    fmt.Sprintf("请求失败（HTTP %d）", status),
	}
	if m := providerErrorMessage(body); m != "" {
		e.Message += "：" + m
	}
	switch status {
	case 401:
		e.Code = "UNAUTHORIZED"
		e.Hint = "API Key 无效或已过期，请重新复制（不要带引号或空格）"
	case 403:
		e.Code = "FORBIDDEN"
		e.Hint = "该 Key 没有账单查询权限；OpenAI / Claude 需要 Admin Key"
	case 404:
		e.Code = "NOT_FOUND"
		e.Hint = "接口地址不存在，平台接口可能已变更，请反馈 issue"
	case 429:
		e.Code = "RATE_LIMITED"
		e.Hint = "请求过于频繁，请稍后重试"
	default:
		if status >= 500 {
			e.Code = "SERVER_ERROR"
			e.Hint = "平台服务异常，请稍后重试"
		}
	}
	return e
}

// providerErrorMessage 尽量从各平台的错误响应里挖出一句人话。
func providerErrorMessage(body []byte) string {
	var j map[string]interface{}
	if json.Unmarshal(body, &j) != nil {
		return ""
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		if m := strv(e["message"], ""); m != "" {
			return m
		}
	}
	if s, ok := j["error"].(string); ok && s != "" {
		return s
	}
	if m := strv(j["message"], ""); m != "" {
		return m
	}
	if rm, ok := j["ResponseMetadata"].(map[string]interface{}); ok {
		if e, ok := rm["Error"].(map[string]interface{}); ok {
			return strv(e["Message"], "")
		}
	}
	return ""
}

func (a *App) ledgerSource() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return ledgerSourceLocked(a.state)
}

func (a *App) refreshUsage() map[string]interface{} {
	return a.refreshUsageForce(false)
}

func (a *App) refreshUsageForce(force bool) map[string]interface{} {
	a.mu.Lock()
	if !a.ledgerOnLocked() {
		a.mu.Unlock()
		return nil
	}
	src := ledgerSourceLocked(a.state)
	cached := a.ledger
	a.mu.Unlock()

	if _, ok := apiProviders[src]; ok {
		// 打开账本、改 Key、切来源时都希望看到最新余额：
		// 缓存超过 45 秒或来源变了就重新拉一次，否则一直显示旧数字。
		stale := force
		if cached != nil {
			at := int64(num(cached["updatedAt"]))
			same := strv(cached["source"], "") == src
			if same && at > 0 && time.Since(time.UnixMilli(at)) < 45*time.Second {
				stale = false
			}
		}
		if stale {
			go a.fetchApiBalanceAsync(src)
		}
		return cached
	}

	data := a.collectQoderUsage()
	quota := a.planQuota()
	ledger := map[string]interface{}{
		"source": "qoder",
	}
	for k, v := range data {
		ledger[k] = v
	}
	ledger["quota"] = quota
	if quota > 0 {
		ledger["percent"] = minF(100, num(data["month"])/quota*100)
	} else {
		ledger["percent"] = nil
	}
	// 没找到任何 Qoder 会话时给出明确原因，否则前端只能显示一片 “—”
	if !boolv(data["available"], false) {
		ledger["errorCode"] = "NO_QODER_SESSIONS"
		ledger["error"] = "没找到本机 Qoder 会话记录（~/.qoder-cn/projects）"
		ledger["errorHint"] = "先登录 Qoder 跑一次会话；或在设置 → 白饭账本里改用 API 余额"
	}
	a.mu.Lock()
	a.ledger = ledger
	a.mu.Unlock()
	a.checkQuotaWarning(ledger)
	return ledger
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// RefreshUsage 是前端「重新检测」按钮的同步入口：跳过 45 秒缓存，
// 直接把这一次请求的结果（含错误码 / HTTP 状态 / 耗时）返回给页面。
func (a *App) RefreshUsage() map[string]interface{} {
	if !a.ledgerOn() {
		return map[string]interface{}{
			"source": a.ledgerSource(), "available": false,
			"error": "账本已在设置里关闭", "errorCode": "LEDGER_OFF",
			"errorHint": "在设置 → 白饭账本里重新开启",
		}
	}
	src := a.ledgerSource()
	if def, ok := apiProviders[src]; ok {
		if !a.beginFetch(src) {
			return a.ledgerPending(src, def)
		}
		defer a.endFetch(src)
		return a.fetchApiBalance(src)
	}
	return a.refreshUsageForce(true)
}

func (a *App) ledgerPending(provider string, def apiProvider) map[string]interface{} {
	a.mu.Lock()
	cached := a.ledger
	a.mu.Unlock()
	out := map[string]interface{}{
		"source": provider, "provider": provider,
		"providerLabel": def.label, "providerShort": def.short,
		"pending": true, "available": false, "rows": []map[string]string{},
		"error": "上一次检测还没结束", "errorCode": "PENDING",
		"errorHint": "稍等几秒，结果回来会自动刷新", "updatedAt": nowMillis(),
	}
	if cached != nil {
		for k, v := range cached {
			if _, exists := out[k]; !exists {
				out[k] = v
			}
		}
	}
	return out
}

func (a *App) fetchApiBalanceAsync(provider string) {
	// 按平台分别去重：以前用一个全局标志，某个平台卡住时别的平台也跟着拿不到数据
	if !a.beginFetch(provider) {
		return
	}
	defer a.endFetch(provider)
	a.fetchApiBalance(provider)
}

// fetchApiBalance 查询一次平台余额并写入账本缓存。调用方负责 beginFetch/endFetch。
func (a *App) fetchApiBalance(provider string) map[string]interface{} {
	def := apiProviders[provider]
	key, keySource := a.apiKeyAndSource(provider)
	if provider == "doubao" && key == "" {
		ak, sk := os.Getenv("VOLC_ACCESSKEY"), os.Getenv("VOLC_SECRETKEY")
		if ak != "" && sk != "" {
			key = ak + ":" + sk
			keySource = "env"
		}
	}
	now := nowMillis()
	base := map[string]interface{}{
		"source": provider, "provider": provider,
		"providerLabel": def.label, "providerShort": def.short,
		"available": false, "rows": []map[string]string{}, "updatedAt": now,
		"checkedAt": now, "latencyMs": 0, "keySource": keySource,
		"error": "", "errorCode": "", "errorHint": "", "httpStatus": 0,
	}
	if key == "" {
		base["errorCode"] = "MISSING_KEY"
		base["error"] = fmt.Sprintf("未配置 %s API Key", def.label)
		hint := keyHints[provider]
		if provider == "doubao" {
			hint += "；也可以用环境变量 VOLC_ACCESSKEY 与 VOLC_SECRETKEY"
		} else if def.env != "" {
			hint += "；也可以用环境变量 " + def.env
		}
		base["errorHint"] = hint
		a.setLedger(base)
		return base
	}

	begin := time.Now()
	r := def.fetch(key)
	base["latencyMs"] = time.Since(begin).Milliseconds()
	base["updatedAt"] = nowMillis()
	base["checkedAt"] = base["updatedAt"]
	for k, v := range r {
		base[k] = v
	}
	_, hasErr := r["error"]
	base["available"] = !hasErr
	if hasErr {
		if strv(base["errorCode"], "") == "" {
			base["errorCode"] = "UNKNOWN"
		}
		if code := strv(base["errorCode"], ""); code == "UNAUTHORIZED" || code == "FORBIDDEN" {
			base["errorHint"] = keyHints[provider]
		}
		a.mu.Lock()
		if a.ledgerOK != nil {
			if at := a.ledgerOK[provider]; at > 0 {
				base["lastOkAt"] = at
			}
		}
		a.mu.Unlock()
	} else {
		base["lastOkAt"] = base["updatedAt"]
		a.mu.Lock()
		if a.ledgerOK == nil {
			a.ledgerOK = map[string]int64{}
		}
		a.ledgerOK[provider] = int64(num(base["updatedAt"]))
		a.mu.Unlock()
	}
	a.setLedger(base)
	return base
}

// KeyCheck 在保存前验证一次 Key（不写状态、不发事件），让「保存成功但读不到账本」
// 的问题在保存那一刻就暴露出来。网络类错误不阻止保存，交由用户决定。
func (a *App) KeyCheck(provider, key string) map[string]interface{} {
	def, ok := apiProviders[provider]
	if !ok {
		return map[string]interface{}{"ok": false, "error": "未知的平台", "errorCode": "UNKNOWN_PROVIDER"}
	}
	k := strings.TrimSpace(key)
	if len([]rune(k)) < 8 {
		return map[string]interface{}{
			"ok": false, "error": "Key 太短，看起来不像有效的 API Key",
			"errorCode": "INVALID_KEY_FORMAT", "errorHint": keyHints[provider],
		}
	}
	begin := time.Now()
	r := def.fetch(k)
	lat := time.Since(begin).Milliseconds()
	if code := strv(r["errorCode"], ""); code != "" {
		out := map[string]interface{}{
			"ok": false, "errorCode": code, "latencyMs": lat,
			"error": strv(r["error"], "验证失败"),
		}
		if h := strv(r["errorHint"], ""); h != "" {
			out["errorHint"] = h
		}
		if st := int(numv(r["httpStatus"])); st != 0 {
			out["httpStatus"] = st
		}
		return out
	}
	out := map[string]interface{}{"ok": true, "latencyMs": lat}
	if note := strv(r["note"], ""); note != "" {
		out["note"] = note
	}
	return out
}

func (a *App) beginFetch(provider string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.apiFetching == nil {
		a.apiFetching = map[string]bool{}
	}
	if a.apiFetching[provider] {
		return false
	}
	a.apiFetching[provider] = true
	return true
}

func (a *App) endFetch(provider string) {
	a.mu.Lock()
	if a.apiFetching != nil {
		delete(a.apiFetching, provider)
	}
	a.mu.Unlock()
}

func (a *App) setLedger(l map[string]interface{}) {
	a.mu.Lock()
	a.ledger = l
	a.mu.Unlock()
	a.emit("usage", l)
	a.trayRefresh()
}

// ---------------- Qoder 本地 credits ----------------

type usageCacheEntry struct {
	month, day, session float64
}

var (
	usageMu    sync.Mutex
	usageCache = map[string]usageCacheEntry{}
)

func (a *App) collectQoderUsage() map[string]interface{} {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	out := map[string]interface{}{
		"today": 0.0, "month": 0.0, "session": 0.0, "sessionId": "",
		"files": 0, "available": false, "updatedAt": nowMillis(),
	}
	home, _ := os.UserHomeDir()
	root := filepath.Join(home, ".qoder-cn", "projects")
	files := []string{}
	walkTranscripts(root, 0, &files)
	var latestMtime int64
	var latestSession float64
	var latestID string
	for _, file := range files {
		st, err := os.Stat(file)
		if err != nil || st.ModTime().Before(monthStart) {
			continue
		}
		month, day, session, ok := sumUsageFile(file, monthStart, dayStart, st)
		if !ok {
			continue
		}
		out["files"] = out["files"].(int) + 1
		out["available"] = true
		out["month"] = out["month"].(float64) + month
		out["today"] = out["today"].(float64) + day
		if st.ModTime().UnixMilli() > latestMtime {
			latestMtime = st.ModTime().UnixMilli()
			latestSession = session
			latestID = strings.TrimSuffix(filepath.Base(file), ".jsonl")
		}
	}
	out["today"] = round1(out["today"].(float64))
	out["month"] = round1(out["month"].(float64))
	out["session"] = round1(latestSession)
	if len(latestID) > 8 {
		latestID = latestID[:8]
	}
	out["sessionId"] = latestID
	return out
}

func walkTranscripts(dir string, depth int, out *[]string) {
	if depth > 4 {
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		p := filepath.Join(dir, e.Name())
		if e.IsDir() {
			walkTranscripts(p, depth+1, out)
		} else if strings.HasSuffix(e.Name(), ".jsonl") {
			*out = append(*out, p)
		}
	}
}

type usageJSONLine struct {
	Timestamp string `json:"timestamp"`
	Message   struct {
		Usage *struct {
			Credits  float64 `json:"credits"`
			Billable *bool   `json:"billable"`
		} `json:"usage"`
	} `json:"message"`
}

func sumUsageFile(file string, monthStart, dayStart time.Time, st os.FileInfo) (float64, float64, float64, bool) {
	key := fmt.Sprintf("%s|%d|%d", file, st.ModTime().UnixNano(), st.Size())
	usageMu.Lock()
	if c, ok := usageCache[key]; ok {
		usageMu.Unlock()
		return c.month, c.day, c.session, true
	}
	usageMu.Unlock()
	b, err := os.ReadFile(file)
	if err != nil {
		return 0, 0, 0, false
	}
	var month, day, session float64
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.Contains(line, `"credits"`) {
			continue
		}
		var obj usageJSONLine
		if json.Unmarshal([]byte(line), &obj) != nil {
			continue
		}
		u := obj.Message.Usage
		if u == nil || (u.Billable != nil && !*u.Billable) {
			continue
		}
		t, _ := time.Parse(time.RFC3339Nano, obj.Timestamp)
		session += u.Credits
		if t.IsZero() || t.Before(monthStart) {
			continue
		}
		month += u.Credits
		if !t.Before(dayStart) {
			day += u.Credits
		}
	}
	usageMu.Lock()
	usageCache[key] = usageCacheEntry{month: month, day: day, session: session}
	// 清掉同一文件的旧缓存
	for k := range usageCache {
		if k != key && strings.HasPrefix(k, file+"|") {
			delete(usageCache, k)
		}
	}
	usageMu.Unlock()
	return month, day, session, true
}

func (a *App) checkQuotaWarning(ledger map[string]interface{}) {
	quota := a.planQuota()
	if quota <= 0 || ledger == nil {
		return
	}
	percent := num(ledger["month"]) / quota * 100
	month := time.Now().Format("2006-01")
	a.mu.Lock()
	if str(a.state["warnMonth"], "") != month {
		a.state["warnMonth"] = month
		a.state["warnTier"] = 1
		a.mu.Unlock()
		a.saveState()
		a.mu.Lock()
	}
	tier := 1
	if percent >= 100 {
		tier = 3
	} else if percent >= 80 {
		tier = 2
	}
	old := int(num(a.state["warnTier"]))
	if old == 0 {
		old = 1
	}
	if tier > old {
		a.state["warnTier"] = tier
		a.mu.Unlock()
		a.saveState()
		if tier == 3 {
			a.balloon("truncated", a.t("用量账本", "Usage ledger", "使用量帳簿"), fmt.Sprintf(a.t("本月套餐已经被用光了（%v credits）…", "This month's quota is used up (%v credits)…", "今月の枠を使い切りました（%v クレジット）…"), ledger["month"]))
		} else {
			a.balloon("error", a.t("用量账本", "Usage ledger", "使用量帳簿"), fmt.Sprintf(a.t("本月用量已到 %.0f%%（%v credits），悠着点…", "This month's usage reached %.0f%% (%v credits). Take it easy…", "今月の使用量が %.0f%% に達しました（%v クレジット）。ほどほどに…"), percent, ledger["month"]))
		}
		return
	}
	a.mu.Unlock()
}

// ---------------- HTTP / API 账单 ----------------

// apiHostBase 只给测试用：把平台域名映射到 httptest 的地址；生产环境为空。
var apiHostBase = map[string]string{}

func apiURL(host, path string) string {
	if base := apiHostBase[host]; base != "" {
		return strings.TrimRight(base, "/") + path
	}
	return "https://" + host + path
}

func httpGetJSON(host, path string, headers map[string]string) (map[string]interface{}, error) {
	req, err := http.NewRequest(http.MethodGet, apiURL(host, path), nil)
	if err != nil {
		return nil, &apiError{Code: "BAD_REQUEST", Message: "请求构造失败", Hint: "请反馈 issue"}
	}
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 9 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		var ne net.Error
		if errors.As(err, &ne) && ne.Timeout() {
			return nil, &apiError{Code: "TIMEOUT", Message: "请求超时（9 秒）", Hint: "检查网络或代理后重试"}
		}
		return nil, &apiError{Code: "NETWORK", Message: "网络请求失败", Hint: "检查网络或代理后重试"}
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, &apiError{Code: "NETWORK", Message: "读取响应失败", Hint: "检查网络后重试", HTTPStatus: res.StatusCode}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, httpFailure(res.StatusCode, body)
	}
	var out map[string]interface{}
	if json.Unmarshal(body, &out) != nil {
		return nil, &apiError{
			Code: "BAD_RESPONSE", HTTPStatus: res.StatusCode,
			Message: fmt.Sprintf("平台返回了无法解析的数据（HTTP %d）", res.StatusCode),
			Hint:    "可能是接口变更，或网络被代理页面拦截",
		}
	}
	return out, nil
}

func numv(v interface{}) float64 {
	if n, ok := v.(float64); ok {
		return n
	}
	return 0
}

func strv(v interface{}, def string) string {
	if s, ok := v.(string); ok {
		return s
	}
	return def
}

func deepSumAmount(v interface{}) float64 {
	sum := 0.0
	switch x := v.(type) {
	case map[string]interface{}:
		for k, val := range x {
			if k == "amount" {
				switch n := val.(type) {
				case float64:
					sum += n
				case string:
					var f float64
					fmt.Sscanf(n, "%f", &f)
					sum += f
				}
			} else {
				sum += deepSumAmount(val)
			}
		}
	case []interface{}:
		for _, e := range x {
			sum += deepSumAmount(e)
		}
	}
	return sum
}

func fetchDeepseek(key string) map[string]interface{} {
	j, err := httpGetJSON("api.deepseek.com", "/user/balance", map[string]string{"Authorization": "Bearer " + key})
	if err != nil {
		return failureResult("DeepSeek", err)
	}
	infos, _ := j["balance_infos"].([]interface{})
	var b map[string]interface{}
	if len(infos) > 0 {
		b, _ = infos[0].(map[string]interface{})
	}
	sym := ""
	if strv(b["currency"], "CNY") == "CNY" {
		sym = "¥"
	}
	out := map[string]interface{}{
		"rows": []map[string]string{
			{"label": "可用余额", "value": sym + strv(b["total_balance"], "—")},
			{"label": "赠送余额", "value": sym + strv(b["granted_balance"], "—")},
			{"label": "充值余额", "value": sym + strv(b["topped_up_balance"], "—")},
		},
	}
	// is_available=false 只表示账户当前不可用（常见于余额为 0），
	// 不能当成"没拿到数据"——否则三行都正确读到了却显示"还没拿到账单数据"
	if !boolv(j["is_available"], true) {
		out["note"] = "已连上 DeepSeek，但账户当前不可用（余额不足或被停用）"
	}
	return out
}

func fetchMoonshot(key string) map[string]interface{} {
	j, err := httpGetJSON("api.moonshot.cn", "/v1/users/me/balance", map[string]string{"Authorization": "Bearer " + key})
	if err != nil {
		return failureResult("Kimi", err)
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return apiFailure("PROVIDER_ERROR", "Kimi："+strv(e["message"], "请求被拒绝"), "检查 Key 是否有效、账户状态是否正常")
	}
	d, _ := j["data"].(map[string]interface{})
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": "可用余额", "value": "¥" + strv(d["available_balance"], "—")},
			{"label": "代金券", "value": "¥" + strv(d["voucher_balance"], "—")},
			{"label": "现金余额", "value": "¥" + strv(d["cash_balance"], "—")},
		},
	}
}

func fetchSiliconflow(key string) map[string]interface{} {
	j, err := httpGetJSON("api.siliconflow.cn", "/v1/user/info", map[string]string{"Authorization": "Bearer " + key})
	if err != nil {
		return failureResult("SiliconFlow", err)
	}
	if code, ok := j["code"].(float64); ok && code != 20000 && code != 0 {
		return apiFailure("PROVIDER_ERROR", "SiliconFlow："+strv(j["message"], "请求被拒绝"), "检查 Key 是否有效、账户状态是否正常")
	}
	d, _ := j["data"].(map[string]interface{})
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": "可用余额", "value": "¥" + strv(d["totalBalance"], "—")},
			{"label": "赠送余额", "value": "¥" + strv(d["balance"], "—")},
			{"label": "充值余额", "value": "¥" + strv(d["chargeBalance"], "—")},
		},
	}
}

func fetchDoubao(key string) map[string]interface{} {
	parts := strings.FieldsFunc(key, func(r rune) bool {
		return r == ':' || r == '：' || r == ',' || r == '，' || r == ' ' || r == '\t'
	})
	if len(parts) < 2 {
		return apiFailure("INVALID_KEY_FORMAT", "豆包需要填写「AK:SK」（火山引擎访问密钥对）", keyHints["doubao"])
	}
	auth := "Basic " + base64.StdEncoding.EncodeToString([]byte(parts[0]+":"+parts[1]))
	j, err := httpGetJSON("open.volcengineapi.com", "/?Action=QueryBalanceAcct&Version=2022-01-01", map[string]string{"Authorization": auth})
	if err != nil {
		return failureResult("豆包（火山引擎）", err)
	}
	res, _ := j["Result"].(map[string]interface{})
	if res == nil {
		msg := "请求被拒绝（检查 AK/SK 与权限）"
		if m, ok := j["ResponseMetadata"].(map[string]interface{}); ok {
			if e, ok := m["Error"].(map[string]interface{}); ok {
				msg = strv(e["Message"], msg)
			}
		}
		return apiFailure("PROVIDER_ERROR", "豆包："+msg, "检查 AK/SK 是否正确、账号是否有查询余额权限")
	}
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": "可用余额", "value": fmt.Sprintf("¥%v", res["AvailableBalance"])},
			{"label": "现金余额", "value": fmt.Sprintf("¥%v", res["CashBalance"])},
			{"label": "欠费金额", "value": fmt.Sprintf("¥%v", res["ArrearsBalance"])},
		},
	}
}

func fetchOpenai(key string) map[string]interface{} {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	weekStart := now.Unix() - 7*86400
	path := fmt.Sprintf("/v1/organization/costs?start_time=%d&end_time=%d&interval=1d&limit=180", monthStart, now.Unix())
	j, err := httpGetJSON("api.openai.com", path, map[string]string{"Authorization": "Bearer " + key})
	if err != nil {
		return failureResult("OpenAI", err)
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return apiFailure("PROVIDER_ERROR", "OpenAI："+strv(e["message"], "请求被拒绝（需要 Admin Key）"), keyHints["openai"])
	}
	var month, week, today float64
	currency := "usd"
	data, _ := j["data"].([]interface{})
	for _, db := range data {
		b, _ := db.(map[string]interface{})
		bucket := 0.0
		results, _ := b["results"].([]interface{})
		for _, ri := range results {
			it, _ := ri.(map[string]interface{})
			amount, _ := it["amount"].(map[string]interface{})
			bucket += numv(amount["value"])
			currency = strv(amount["currency"], currency)
		}
		t := int64(numv(b["start_time"]))
		month += bucket
		if t >= weekStart {
			week += bucket
		}
		if t >= dayStart {
			today += bucket
		}
	}
	sym := "$"
	if strings.EqualFold(currency, "cny") {
		sym = "¥"
	}
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": "本月消费", "value": fmt.Sprintf("%s%.2f", sym, month)},
			{"label": "近 7 天", "value": fmt.Sprintf("%s%.2f", sym, week)},
			{"label": "今日", "value": fmt.Sprintf("%s%.2f", sym, today)},
		},
	}
}

func fetchClaude(key string) map[string]interface{} {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	q := "starting_at=" + urlQuery(monthStart.Format(time.RFC3339)) + "&ending_at=" + urlQuery(now.Format(time.RFC3339)) + "&bucket_width=1d&limit=31"
	j, err := httpGetJSON("api.anthropic.com", "/v1/organizations/cost_report?"+q, map[string]string{
		"x-api-key": key, "anthropic-version": "2023-06-01",
	})
	if err != nil {
		return failureResult("Claude", err)
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return apiFailure("PROVIDER_ERROR", "Claude："+strv(e["message"], "请求被拒绝（需要 Admin Key）"), keyHints["claude"])
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekStart := now.Add(-7 * 24 * time.Hour)
	var monthCents, weekCents, todayCents float64
	data, _ := j["data"].([]interface{})
	if data == nil {
		monthCents = deepSumAmount(j)
	}
	for _, db := range data {
		b, _ := db.(map[string]interface{})
		cents := deepSumAmount(b["results"])
		t, _ := time.Parse(time.RFC3339, strv(b["starting_at"], ""))
		monthCents += cents
		if !t.IsZero() {
			if !t.Before(weekStart) {
				weekCents += cents
			}
			if !t.Before(dayStart) {
				todayCents += cents
			}
		}
	}
	money := func(c float64) string { return fmt.Sprintf("$%.2f", c/100) }
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": "本月消费", "value": money(monthCents)},
			{"label": "近 7 天", "value": money(weekCents)},
			{"label": "今日", "value": money(todayCents)},
		},
	}
}

func urlQuery(s string) string {
	return strings.NewReplacer(":", "%3A", "+", "%2B", " ", "%20").Replace(s)
}
