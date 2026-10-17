package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
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
	"deepseek":   {label: "DeepSeek", short: "DeepSeek", env: "DEEPSEEK_API_KEY", fetch: fetchDeepseek},
	"moonshot":   {label: "Kimi（Moonshot）", short: "Kimi", env: "MOONSHOT_API_KEY", fetch: fetchMoonshot},
	"siliconflow": {label: "SiliconFlow（硅基流动）", short: "SiliconFlow", env: "SILICONFLOW_API_KEY", fetch: fetchSiliconflow},
	"doubao":     {label: "豆包（火山方舟）", short: "豆包", env: "VOLC_ACCESSKEY", fetch: fetchDoubao},
	"openai":     {label: "ChatGPT（OpenAI）", short: "OpenAI", env: "OPENAI_ADMIN_KEY", fetch: fetchOpenai},
	"claude":     {label: "Claude（Anthropic）", short: "Claude", env: "ANTHROPIC_ADMIN_KEY", fetch: fetchClaude},
}

var keyHints = map[string]string{
	"deepseek":   "普通 API Key 即可（sk-…）",
	"moonshot":   "普通 API Key 即可（sk-…）",
	"siliconflow": "普通 API Key 即可（sk-…）",
	"doubao":     "豆包需要填写火山引擎访问密钥对「AK:SK」",
	"openai":     "需要 OpenAI Admin Key（sk-admin…），普通 Key 无法查询账单",
	"claude":     "需要 Anthropic Admin Key（sk-ant-admin…）",
}

func (a *App) ledgerSource() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return ledgerSourceLocked(a.state)
}

func (a *App) refreshUsage() map[string]interface{} {
	a.mu.Lock()
	if !a.ledgerOnLocked() {
		a.mu.Unlock()
		return nil
	}
	src := ledgerSourceLocked(a.state)
	cached := a.ledger
	a.mu.Unlock()

	if _, ok := apiProviders[src]; ok {
		go a.fetchApiBalanceAsync(src)
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

func (a *App) fetchApiBalanceAsync(provider string) {
	a.mu.Lock()
	if a.apiFetching {
		a.mu.Unlock()
		return
	}
	a.apiFetching = true
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.apiFetching = false
		a.mu.Unlock()
	}()
	def, ok := apiProviders[provider]
	base := map[string]interface{}{
		"source": provider, "providerLabel": provider, "providerShort": provider,
		"available": false, "rows": []map[string]string{}, "updatedAt": nowMillis(), "error": "",
	}
	if ok {
		base["providerLabel"] = def.label
		base["providerShort"] = def.short
	}
	key := a.apiKey(provider)
	if provider == "doubao" && key == "" {
		ak, sk := os.Getenv("VOLC_ACCESSKEY"), os.Getenv("VOLC_SECRETKEY")
		if ak != "" && sk != "" {
			key = ak + ":" + sk
		}
	}
	if key == "" {
		base["error"] = fmt.Sprintf("未配置 %s API Key", base["providerLabel"])
		a.setLedger(base)
		return
	}
	r := def.fetch(key)
	for k, v := range r {
		base[k] = v
	}
	base["available"] = r["error"] == nil
	base["updatedAt"] = nowMillis()
	a.setLedger(base)
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
			a.balloon("truncated", "用量账本", fmt.Sprintf("本月套餐已经被用光了（%v credits）…", ledger["month"]))
		} else {
			a.balloon("error", "用量账本", fmt.Sprintf("本月用量已到 %.0f%%（%v credits），悠着点…", percent, ledger["month"]))
		}
		return
	}
	a.mu.Unlock()
}

// ---------------- HTTP / API 账单 ----------------

func httpGetJSON(host, path string, headers map[string]string) (map[string]interface{}, error) {
	req, err := http.NewRequest(http.MethodGet, "https://"+host+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 9 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	var out map[string]interface{}
	if json.Unmarshal(body, &out) != nil {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
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
		return map[string]interface{}{"error": "DeepSeek 请求失败"}
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
	return map[string]interface{}{
		"available": boolv(j["is_available"], true),
		"rows": []map[string]string{
			{"label": "可用余额", "value": sym + strv(b["total_balance"], "—")},
			{"label": "赠送余额", "value": sym + strv(b["granted_balance"], "—")},
			{"label": "充值余额", "value": sym + strv(b["topped_up_balance"], "—")},
		},
	}
}

func fetchMoonshot(key string) map[string]interface{} {
	j, err := httpGetJSON("api.moonshot.cn", "/v1/users/me/balance", map[string]string{"Authorization": "Bearer " + key})
	if err != nil {
		return map[string]interface{}{"error": "Kimi 请求失败"}
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return map[string]interface{}{"error": "Kimi：" + strv(e["message"], "请求被拒绝")}
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
		return map[string]interface{}{"error": "SiliconFlow 请求失败"}
	}
	if code, ok := j["code"].(float64); ok && code != 20000 && code != 0 {
		return map[string]interface{}{"error": "SiliconFlow：" + strv(j["message"], "请求被拒绝")}
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
		return map[string]interface{}{"error": "豆包需要填写「AK:SK」（火山引擎访问密钥对）"}
	}
	auth := "Basic " + base64.StdEncoding.EncodeToString([]byte(parts[0]+":"+parts[1]))
	j, err := httpGetJSON("open.volcengineapi.com", "/?Action=QueryBalanceAcct&Version=2022-01-01", map[string]string{"Authorization": auth})
	if err != nil {
		return map[string]interface{}{"error": "豆包（火山引擎）请求失败"}
	}
	res, _ := j["Result"].(map[string]interface{})
	if res == nil {
		msg := "请求被拒绝（检查 AK/SK 与权限）"
		if m, ok := j["ResponseMetadata"].(map[string]interface{}); ok {
			if e, ok := m["Error"].(map[string]interface{}); ok {
				msg = strv(e["Message"], msg)
			}
		}
		return map[string]interface{}{"error": "豆包：" + msg}
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
		return map[string]interface{}{"error": "OpenAI 请求失败（需要可访问 api.openai.com 的网络）"}
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return map[string]interface{}{"error": "OpenAI：" + strv(e["message"], "请求被拒绝（需要 Admin Key）")}
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
		return map[string]interface{}{"error": "Claude 请求失败"}
	}
	if e, ok := j["error"].(map[string]interface{}); ok {
		return map[string]interface{}{"error": "Claude：" + strv(e["message"], "请求被拒绝（需要 Admin Key）")}
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
