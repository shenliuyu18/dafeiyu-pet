package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func withAPIHosts(t *testing.T, srv *httptest.Server) {
	t.Helper()
	old := apiHostBase
	apiHostBase = map[string]string{}
	for _, host := range []string{
		"api.deepseek.com", "api.moonshot.cn", "api.siliconflow.cn",
		"api.moonshot.ai", "api.siliconflow.com",
		"api.openai.com", "api.anthropic.com",
	} {
		apiHostBase[host] = srv.URL
	}
	t.Cleanup(func() { apiHostBase = old })
}

func TestFetchPlatformsAgainstFakeAPI(t *testing.T) {
	now := time.Now()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/user/balance":
			fmt.Fprint(w, `{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"12.34","granted_balance":"1.00","topped_up_balance":"11.34"}]}`)
		case "/v1/users/me/balance":
			fmt.Fprint(w, `{"code":0,"data":{"available_balance":12.5,"voucher_balance":1.0,"cash_balance":11.5}}`)
		case "/v1/user/info":
			fmt.Fprint(w, `{"code":20000,"message":"OK","data":{"totalBalance":"12.5","balance":"2.5","chargeBalance":"10"}}`)
		case "/v1/organization/costs":
			fmt.Fprintf(w, `{"data":[{"start_time":%d,"results":[{"amount":{"value":1.5,"currency":"usd"}}]}]}`, now.Unix())
		case "/v1/organizations/cost_report":
			fmt.Fprintf(w, `{"data":[{"starting_at":%q,"results":[{"amount":"100"}]}]}`, now.Format(time.RFC3339))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	withAPIHosts(t, srv)

	cases := []struct {
		name string
		call func(string) map[string]interface{}
		key  string
	}{
		{"deepseek", fetchDeepseek, "sk-deepseek"},
		{"moonshot", fetchMoonshot, "sk-moonshot"},
		{"siliconflow", fetchSiliconflow, "sk-siliconflow"},
		{"openai", fetchOpenai, "sk-admin-openai"},
		{"claude", fetchClaude, "sk-ant-admin"},
	}
	for _, c := range cases {
		r := c.call(c.key)
		if code := strv(r["errorCode"], ""); code != "" {
			t.Fatalf("%s failed: %v (%s)", c.name, r["error"], code)
		}
		rows, _ := r["rows"].([]map[string]string)
		if len(rows) != 3 {
			t.Fatalf("%s returned %d rows: %#v", c.name, len(rows), r)
		}
		if rows[0]["value"] == "" {
			t.Fatalf("%s empty value: %#v", c.name, rows[0])
		}
	}
}

func TestFetchPlatformsHTTPErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user/balance":
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(w, `{"error":{"message":"invalid api key"}}`)
		case "/v1/organization/costs":
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, `{"error":{"message":"admin key required"}}`)
		case "/v1/users/me/balance":
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `<html>not json</html>`)
		default:
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, `{}`)
		}
	}))
	defer srv.Close()
	withAPIHosts(t, srv)

	r := fetchDeepseek("sk-x")
	if r["errorCode"] != "UNAUTHORIZED" || int(numOr(r["httpStatus"], 0)) != 401 {
		t.Fatalf("deepseek 401 not classified: %#v", r)
	}
	if strv(r["errorHint"], "") == "" {
		t.Fatal("auth error should carry a hint")
	}

	r = fetchOpenai("sk-admin-x")
	if r["errorCode"] != "FORBIDDEN" {
		t.Fatalf("openai 403 not classified: %#v", r)
	}

	r = fetchMoonshot("sk-x")
	if r["errorCode"] != "BAD_RESPONSE" {
		t.Fatalf("bad json not classified: %#v", r)
	}
}

func TestAPIURLOverride(t *testing.T) {
	if got := apiURL("api.deepseek.com", "/user/balance"); got != "https://api.deepseek.com/user/balance" {
		t.Fatalf("default url: %s", got)
	}
	old := apiHostBase
	apiHostBase = map[string]string{"api.deepseek.com": "http://127.0.0.1:9/"}
	defer func() { apiHostBase = old }()
	if got := apiURL("api.deepseek.com", "/x"); got != "http://127.0.0.1:9/x" {
		t.Fatalf("override url: %s", got)
	}
}

func TestIntlSiteFallback(t *testing.T) {
	failSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":{"message":"invalid api key"}}`)
	}))
	defer failSrv.Close()
	okSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/users/me/balance":
			fmt.Fprint(w, `{"code":0,"data":{"available_balance":1.2,"voucher_balance":1.0,"cash_balance":0.2}}`)
		case "/v1/user/info":
			fmt.Fprint(w, `{"code":20000,"data":{"totalBalance":"1.2","balance":"1.0","chargeBalance":"0.2"}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer okSrv.Close()
	old := apiHostBase
	apiHostBase = map[string]string{
		"api.moonshot.cn": failSrv.URL, "api.moonshot.ai": okSrv.URL,
		"api.siliconflow.cn": failSrv.URL, "api.siliconflow.com": okSrv.URL,
	}
	defer func() { apiHostBase = old }()

	for name, call := range map[string]func(string) map[string]interface{}{
		"moonshot": fetchMoonshot, "siliconflow": fetchSiliconflow,
	} {
		r := call("sk-intl")
		if code := strv(r["errorCode"], ""); code != "" {
			t.Fatalf("%s intl fallback failed: %v (%s)", name, r["error"], code)
		}
		rows, _ := r["rows"].([]map[string]string)
		if len(rows) != 3 || rows[0]["value"][:1] != "$" {
			t.Fatalf("%s intl rows: %#v", name, rows)
		}
	}
}
