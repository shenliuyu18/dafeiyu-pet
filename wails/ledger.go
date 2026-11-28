package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
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
	"siliconflow": {label: "SiliconFlow", short: "SiliconFlow", env: "SILICONFLOW_API_KEY", fetch: fetchSiliconflow},
	"openai":      {label: "OpenAI", short: "OpenAI", env: "OPENAI_ADMIN_KEY", fetch: fetchOpenai},
	"claude":      {label: "Claude（Anthropic）", short: "Claude", env: "ANTHROPIC_ADMIN_KEY", fetch: fetchClaude},
}

var keyHints = map[string][3]string{
	"deepseek":    {"普通 API Key 即可（sk-…）", "A regular API key works (sk-…)", "通常の API キーで可（sk-…）"},
	"moonshot":    {"普通 API Key 即可（sk-…）；国内站与国际站的 Key 不能混用", "A regular API key works (sk-…); keys for the China and international sites cannot be mixed", "通常の API キーで可（sk-…）。中国版と国際版のキーは併用できません"},
	"siliconflow": {"普通 API Key 即可（sk-…）；国内站与国际站的 Key 不能混用", "A regular API key works (sk-…); keys for the China and international sites cannot be mixed", "通常の API キーで可（sk-…）。中国版と国際版のキーは併用できません"},
	"openai":      {"需要 OpenAI Admin Key（sk-admin…）；只统计 API 费用，不含 ChatGPT 订阅", "Requires an OpenAI Admin key (sk-admin…); counts API charges only, not the ChatGPT subscription", "OpenAI の Admin キーが必要（sk-admin…）。API 利用料のみで ChatGPT サブスクは含みません"},
	"claude":      {"需要 Anthropic Admin Key（sk-ant-admin…）", "Requires an Anthropic Admin key (sk-ant-admin…)", "Anthropic の Admin キーが必要（sk-ant-admin…）"},
}

func keyHint(provider string) string {
	h := keyHints[provider]
	return t3(h[0], h[1], h[2])
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
		Message:    fmt.Sprintf(t3("请求失败（HTTP %d）", "Request failed (HTTP %d)", "リクエストに失敗しました（HTTP %d）"), status),
	}
	if m := providerErrorMessage(body); m != "" {
		e.Message += "：" + m
	}
	switch status {
	case 401:
		e.Code = "UNAUTHORIZED"
		e.Hint = t3("API Key 无效或已过期，请重新复制（不要带引号或空格）", "The API key is invalid or expired; copy it again (no quotes or spaces)", "API キーが無効か期限切れです。もう一度コピーしてください（引用符や空白を含めない）")
	case 403:
		e.Code = "FORBIDDEN"
		e.Hint = t3("该 Key 没有账单查询权限；OpenAI / Claude 需要 Admin Key", "This key cannot read billing; OpenAI / Claude require an Admin key", "このキーには請求情報の閲覧権限がありません。OpenAI / Claude は Admin キーが必要です")
	case 404:
		e.Code = "NOT_FOUND"
		e.Hint = t3("接口地址不存在，平台接口可能已变更，请反馈 issue", "Endpoint not found; the platform API may have changed—please file an issue", "エンドポイントが存在しません。API が変更された可能性があるため issue で報告してください")
	case 429:
		e.Code = "RATE_LIMITED"
		e.Hint = t3("请求过于频繁，请稍后重试", "Too many requests; try again later", "リクエストが多すぎます。しばらくして再試行してください")
	default:
		if status >= 500 {
			e.Code = "SERVER_ERROR"
			e.Hint = t3("平台服务异常，请稍后重试", "The platform service is having problems; try again later", "プラットフォーム側の障害です。しばらくして再試行してください")
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
	generation := a.ledgerSeq
	cached := a.ledger
	a.mu.Unlock()

	// 多开时副实例不发周期性网络请求：直接读主实例写下的缓存，过期再请主实例刷新。
	if !instanceIsLeader && !force {
		if c := readLedgerCache(); c != nil && strv(c["source"], "") == src {
			c["lang"] = uiLang()
			a.mu.Lock()
			if src == ledgerSourceLocked(a.state) {
				a.ledger = c
			}
			a.mu.Unlock()
			a.emit("usage", c)
			at := int64(num(c["updatedAt"]))
			if at <= 0 || time.Since(time.UnixMilli(at)) >= 90*time.Second {
				go func() { _, _ = callInstance(leaderSlot(), "refresh", nil) }()
			}
			return c
		}
		go func() { _, _ = callInstance(leaderSlot(), "refresh", nil) }()
		return cached
	}

	// 打开账本、改 Key、切来源时都希望看到最新余额：
	// 缓存超过 45 秒或来源变了就重新拉一次，否则一直显示旧数字。
	// 之前缓存为 nil 时 stale 恒为 false：首次打开账本不会触发拉取，气泡会一直停在“正在读取账单…”。
	// 没有缓存必须视为需要拉取。
	stale := force || cached == nil
	if cached != nil {
		at := int64(num(cached["updatedAt"]))
		same := strv(cached["source"], "") == src
		if same && at > 0 && time.Since(time.UnixMilli(at)) < 45*time.Second {
			stale = false
		}
	}
	if stale {
		go a.fetchApiBalanceAsync(src, generation)
	}
	return cached
}

// RefreshUsage 是前端「重新检测」按钮的同步入口：跳过 45 秒缓存，
// 直接把这一次请求的结果（含错误码 / HTTP 状态 / 耗时）返回给页面。
func (a *App) RefreshUsage() map[string]interface{} {
	if !a.ledgerOn() {
		return map[string]interface{}{
			"source": a.ledgerSource(), "available": false,
			"error": t3("账本已在设置里关闭", "The ledger is turned off in Settings", "帳簿は設定でオフになっています"), "errorCode": "LEDGER_OFF",
			"errorHint": t3("在设置 → 白饭账本里重新开启", "Turn it back on in Settings → Rice Ledger", "設定 → 白飯帳簿 で再度オンにしてください"),
		}
	}
	src := a.ledgerSource()
	generation, ok := a.beginFetch(src)
	if !ok {
		return a.ledgerPending(src, apiProviders[src])
	}
	defer a.endFetch(src, generation)
	return a.fetchApiBalance(src, generation)
}

func (a *App) ledgerPending(provider string, def apiProvider) map[string]interface{} {
	a.mu.Lock()
	cached := a.ledger
	a.mu.Unlock()
	out := map[string]interface{}{
		"source": provider, "provider": provider,
		"providerLabel": def.label, "providerShort": def.short,
		"pending": true, "available": false, "rows": []map[string]string{},
		"error": t3("上一次检测还没结束", "The previous check is still running", "前回の確認がまだ実行中です"), "errorCode": "PENDING",
		"errorHint": t3("稍等几秒，结果回来会自动刷新", "Wait a few seconds; the result will refresh automatically", "数秒お待ちください。結果が届くと自動で更新されます"), "updatedAt": nowMillis(),
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

func (a *App) fetchApiBalanceAsync(provider string, generation uint64) {
	// 按平台分别去重；调度前捕获的代次必须一直传到请求结束。
	if !a.beginFetchGeneration(provider, generation) {
		return
	}
	defer a.endFetch(provider, generation)
	a.fetchApiBalance(provider, generation)
}

// fetchApiBalance 查询一次平台余额并写入账本缓存。调用方负责 beginFetch/endFetch。
func (a *App) fetchApiBalance(provider string, generation uint64) map[string]interface{} {
	def := apiProviders[provider]
	key, keySource := a.apiKeyAndSource(provider)
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
		base["error"] = fmt.Sprintf(t3("未配置 %s API Key", "No %s API key configured", "%s のAPIキーが未設定"), def.label)
		hint := keyHint(provider)
		if def.env != "" {
			hint += t3("；也可以用环境变量 ", "; you can also use the environment variable ", "。環境変数 も使えます") + def.env
		}
		base["errorHint"] = hint
		a.setLedger(provider, generation, base, false)
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
			base["errorHint"] = keyHint(provider)
		}
	}
	a.setLedger(provider, generation, base, !hasErr)
	return base
}

// KeyCheck 在保存前验证一次 Key（不写状态、不发事件），让「保存成功但读不到账本」
// 的问题在保存那一刻就暴露出来。网络类错误不阻止保存，交由用户决定。
func (a *App) KeyCheck(provider, key string) map[string]interface{} {
	def, ok := apiProviders[provider]
	if !ok {
		return map[string]interface{}{"ok": false, "error": t3("未知的平台", "Unknown platform", "不明なプラットフォーム"), "errorCode": "UNKNOWN_PROVIDER"}
	}
	k := strings.TrimSpace(key)
	if len([]rune(k)) < 8 {
		return map[string]interface{}{
			"ok": false, "error": t3("Key 太短，看起来不像有效的 API Key", "The key is too short to be a valid API key", "キーが短すぎて有効な API Key に見えません"),
			"errorCode": "INVALID_KEY_FORMAT", "errorHint": keyHint(provider),
		}
	}
	begin := time.Now()
	r := def.fetch(k)
	lat := time.Since(begin).Milliseconds()
	if code := strv(r["errorCode"], ""); code != "" {
		out := map[string]interface{}{
			"ok": false, "errorCode": code, "latencyMs": lat,
			"error": strv(r["error"], t3("验证失败", "Verification failed", "確認に失敗しました")),
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

func (a *App) beginFetch(provider string) (uint64, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	generation := a.ledgerSeq
	return generation, a.beginFetchLocked(provider, generation)
}

func (a *App) beginFetchGeneration(provider string, generation uint64) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.beginFetchLocked(provider, generation)
}

func (a *App) beginFetchLocked(provider string, generation uint64) bool {
	if generation != a.ledgerSeq || ledgerSourceLocked(a.state) != provider {
		return false
	}
	if a.apiFetching == nil {
		a.apiFetching = map[string]uint64{}
	}
	if _, pending := a.apiFetching[provider]; pending {
		return false
	}
	a.apiFetching[provider] = generation
	return true
}

func (a *App) endFetch(provider string, generation uint64) {
	a.mu.Lock()
	if a.apiFetching[provider] == generation {
		delete(a.apiFetching, provider)
	}
	a.mu.Unlock()
}

// setLedger 只接受当前来源、当前代次的结果；旧请求仍向调用方返回结果，但不写缓存或发事件。
func (a *App) setLedger(provider string, generation uint64, l map[string]interface{}, successful bool) bool {
	a.mu.Lock()
	if generation != a.ledgerSeq || ledgerSourceLocked(a.state) != provider {
		a.mu.Unlock()
		return false
	}
	if successful {
		l["lastOkAt"] = l["updatedAt"]
		if a.ledgerOK == nil {
			a.ledgerOK = map[string]int64{}
		}
		a.ledgerOK[provider] = int64(num(l["updatedAt"]))
	} else if a.ledgerOK != nil {
		if at := a.ledgerOK[provider]; at > 0 {
			l["lastOkAt"] = at
		}
	}
	l["lang"] = uiLang() // 错误/提示是按当时语言生成的，前端据此判断是否需要重拉
	a.ledger = l
	a.mu.Unlock()
	// 事件在解锁后再发：前端处理可能很慢，持锁期间光标轮询 / 窗口巡检都会被拖住。
	// 发之前复核一次代次，避免旧请求的结果盖掉刚切来源后的新结果。
	a.mu.Lock()
	current := generation == a.ledgerSeq && ledgerSourceLocked(a.state) == provider
	a.mu.Unlock()
	if current {
		a.emit("usage", l)
	}
	a.writeLedgerCache(l)
	a.trayRefresh()
	return true
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
		return nil, &apiError{Code: "BAD_REQUEST", Message: t3("请求构造失败", "Could not build the request", "リクエストを組み立てられません"), Hint: t3("请反馈 issue", "Please file an issue", "issue で報告してください")}
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
			return nil, &apiError{Code: "TIMEOUT", Message: t3("请求超时（9 秒）", "Request timed out (9 s)", "リクエストがタイムアウトしました（9秒）"), Hint: t3("检查网络或代理后重试", "Check your network or proxy and try again", "ネットワークまたはプロキシを確認して再試行してください")}
		}
		return nil, &apiError{Code: "NETWORK", Message: t3("网络请求失败", "Network request failed", "ネットワーク接続に失敗しました"), Hint: t3("检查网络或代理后重试", "Check your network or proxy and try again", "ネットワークまたはプロキシを確認して再試行してください")}
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, &apiError{Code: "NETWORK", Message: t3("读取响应失败", "Failed to read the response", "応答の読み取りに失敗しました"), Hint: t3("检查网络后重试", "Check your network and try again", "ネットワークを確認して再試行してください"), HTTPStatus: res.StatusCode}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, httpFailure(res.StatusCode, body)
	}
	var out map[string]interface{}
	if json.Unmarshal(body, &out) != nil {
		return nil, &apiError{
			Code: "BAD_RESPONSE", HTTPStatus: res.StatusCode,
			Message: fmt.Sprintf(t3("平台返回了无法解析的数据（HTTP %d）", "The platform returned unreadable data (HTTP %d)", "プラットフォームが解析できないデータを返しました（HTTP %d）"), res.StatusCode),
			Hint:    t3("可能是接口变更，或网络被代理页面拦截", "The API may have changed, or a proxy page intercepted the request", "API の変更、またはプロキシページによる妨害の可能性があります"),
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
			{"label": t3("可用余额", "Available balance", "利用可能残高"), "value": sym + strv(b["total_balance"], "—")},
			{"label": t3("赠送余额", "Granted balance", "付与残高"), "value": sym + strv(b["granted_balance"], "—")},
			{"label": t3("充值余额", "Topped-up balance", "チャージ残高"), "value": sym + strv(b["topped_up_balance"], "—")},
		},
	}
	// is_available=false 只表示账户当前不可用（常见于余额为 0），
	// 不能当成"没拿到数据"——否则三行都正确读到了却显示"还没拿到账单数据"
	if !boolv(j["is_available"], true) {
		out["note"] = t3("已连上 DeepSeek，但账户当前不可用（余额不足或被停用）", "Connected to DeepSeek, but this account is currently unavailable (insufficient balance or suspended)", "DeepSeek に接続しましたが、このアカウントは現在利用できません（残高不足または停止中）")
	}
	return out
}

// fetchWithIntlFallback 先查国内站；国内站返回鉴权失败时换国际站域名再试一次
// （两站账号与 Key 独立，币种也不同）。
func fetchWithIntlFallback(cnHost, intlHost, path, key string) (map[string]interface{}, string, error) {
	j, err := httpGetJSON(cnHost, path, map[string]string{"Authorization": "Bearer " + key})
	if err == nil {
		return j, "¥", nil
	}
	var ae *apiError
	if errors.As(err, &ae) && (ae.Code == "UNAUTHORIZED" || ae.Code == "FORBIDDEN") {
		j2, err2 := httpGetJSON(intlHost, path, map[string]string{"Authorization": "Bearer " + key})
		if err2 == nil {
			return j2, "$", nil
		}
		return nil, "", err2
	}
	return nil, "", err
}

func fetchMoonshot(key string) map[string]interface{} {
	j, sym, err := fetchWithIntlFallback("api.moonshot.cn", "api.moonshot.ai", "/v1/users/me/balance", key)
	if err != nil {
		return failureResult("Kimi", err)
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return apiFailure("PROVIDER_ERROR", "Kimi："+strv(e["message"], t3("请求被拒绝", "request rejected", "リクエストが拒否されました")), t3("检查 Key 是否有效、账户状态是否正常", "Check whether the key is valid and the account is in good standing", "キーが有効か、アカウントの状態が正常かを確認してください"))
	}
	d, _ := j["data"].(map[string]interface{})
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": t3("可用余额", "Available balance", "利用可能残高"), "value": sym + strv(d["available_balance"], "—")},
			{"label": t3("代金券", "Vouchers", "クーポン"), "value": sym + strv(d["voucher_balance"], "—")},
			{"label": t3("现金余额", "Cash balance", "現金残高"), "value": sym + strv(d["cash_balance"], "—")},
		},
	}
}

func fetchSiliconflow(key string) map[string]interface{} {
	j, sym, err := fetchWithIntlFallback("api.siliconflow.cn", "api.siliconflow.com", "/v1/user/info", key)
	if err != nil {
		return failureResult("SiliconFlow", err)
	}
	if code, ok := j["code"].(float64); ok && code != 20000 && code != 0 {
		return apiFailure("PROVIDER_ERROR", "SiliconFlow："+strv(j["message"], t3("请求被拒绝", "request rejected", "リクエストが拒否されました")), t3("检查 Key 是否有效、账户状态是否正常", "Check whether the key is valid and the account is in good standing", "キーが有効か、アカウントの状態が正常かを確認してください"))
	}
	d, _ := j["data"].(map[string]interface{})
	return map[string]interface{}{
		"available": true,
		"rows": []map[string]string{
			{"label": t3("可用余额", "Available balance", "利用可能残高"), "value": sym + strv(d["totalBalance"], "—")},
			{"label": t3("赠送余额", "Granted balance", "付与残高"), "value": sym + strv(d["balance"], "—")},
			{"label": t3("充值余额", "Topped-up balance", "チャージ残高"), "value": sym + strv(d["chargeBalance"], "—")},
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
		return apiFailure("PROVIDER_ERROR", "OpenAI："+strv(e["message"], t3("请求被拒绝（需要 Admin Key）", "request rejected (Admin key required)", "リクエストが拒否されました（Admin キーが必要）")), keyHint("openai"))
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
			{"label": t3("本月消费", "This month", "今月の利用"), "value": fmt.Sprintf("%s%.2f", sym, month)},
			{"label": t3("近 7 天", "Last 7 days", "過去7日"), "value": fmt.Sprintf("%s%.2f", sym, week)},
			{"label": t3("今日", "Today", "今日"), "value": fmt.Sprintf("%s%.2f", sym, today)},
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
		return apiFailure("PROVIDER_ERROR", "Claude："+strv(e["message"], t3("请求被拒绝（需要 Admin Key）", "request rejected (Admin key required)", "リクエストが拒否されました（Admin キーが必要）")), keyHint("claude"))
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
			{"label": t3("本月消费", "This month", "今月の利用"), "value": money(monthCents)},
			{"label": t3("近 7 天", "Last 7 days", "過去7日"), "value": money(weekCents)},
			{"label": t3("今日", "Today", "今日"), "value": money(todayCents)},
		},
	}
}

func urlQuery(s string) string {
	return strings.NewReplacer(":", "%3A", "+", "%2B", " ", "%20").Replace(s)
}
