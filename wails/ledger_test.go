package main

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestHTTPFailureClassification(t *testing.T) {
	cases := []struct {
		status int
		code   string
	}{
		{401, "UNAUTHORIZED"},
		{403, "FORBIDDEN"},
		{404, "NOT_FOUND"},
		{429, "RATE_LIMITED"},
		{500, "SERVER_ERROR"},
		{503, "SERVER_ERROR"},
		{418, "HTTP_ERROR"},
	}
	for _, c := range cases {
		e := httpFailure(c.status, []byte(`{"error":{"message":"nope"}}`))
		if e.Code != c.code {
			t.Fatalf("status %d: want code %s, got %s", c.status, c.code, e.Code)
		}
		if e.HTTPStatus != c.status {
			t.Fatalf("status %d: http status not preserved", c.status)
		}
		if e.Message == "" {
			t.Fatalf("status %d: empty message", c.status)
		}
	}
	if e := httpFailure(401, nil); e.Hint == "" {
		t.Fatal("401 should carry an actionable hint")
	}
}

func TestProviderErrorMessageVariants(t *testing.T) {
	cases := map[string]string{
		`{"error":{"message":"invalid key"}}`:                         "invalid key",
		`{"error":"bad thing"}`:                                       "bad thing",
		`{"message":"missing admin scope"}`:                           "missing admin scope",
		`{"ResponseMetadata":{"Error":{"Message":"AK/SK mismatch"}}}`: "AK/SK mismatch",
		`not json`: "",
		`{}`:       "",
	}
	for body, want := range cases {
		if got := providerErrorMessage([]byte(body)); got != want {
			t.Fatalf("body %s: want %q, got %q", body, want, got)
		}
	}
}

func TestFailureResultCarriesDiagnostics(t *testing.T) {
	err := &apiError{Code: "UNAUTHORIZED", Message: "请求失败（HTTP 401）", Hint: "换 Key", HTTPStatus: 401}
	out := failureResult("DeepSeek", err)
	if out["errorCode"] != "UNAUTHORIZED" || out["errorHint"] != "换 Key" {
		t.Fatalf("diagnostics missing: %#v", out)
	}
	if out["httpStatus"] != 401 {
		t.Fatalf("httpStatus missing: %#v", out)
	}
	if out["error"] != "DeepSeek：请求失败（HTTP 401）" {
		t.Fatalf("prefix not applied: %#v", out["error"])
	}

	plain := failureResult("Kimi", errors.New("boom"))
	if plain["errorCode"] != "UNKNOWN" {
		t.Fatalf("plain error should be UNKNOWN: %#v", plain)
	}
	if plain["error"] != "Kimi：boom" {
		t.Fatalf("plain message: %#v", plain["error"])
	}
}

func TestKeyCheckRejectsBadInputWithoutNetwork(t *testing.T) {
	a := &App{}
	if r := a.KeyCheck("nope", "0123456789"); r["ok"] != false || r["errorCode"] != "UNKNOWN_PROVIDER" {
		t.Fatalf("unknown provider should be rejected: %#v", r)
	}
	if r := a.KeyCheck("deepseek", "short"); r["ok"] != false || r["errorCode"] != "INVALID_KEY_FORMAT" {
		t.Fatalf("short key should be rejected: %#v", r)
	}
}

func TestLedgerRequestFromPreviousSourceGenerationIsDiscarded(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-old-ledger-key" {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		close(started)
		<-release
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"12.34","granted_balance":"1.00","topped_up_balance":"11.34"}]}`)
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(unblock)
	withAPIHosts(t, srv)

	st := defaultState()
	st["apiKeys"] = map[string]interface{}{"deepseek": "plain:sk-old-ledger-key"}
	a := &App{state: st}
	result := make(chan map[string]interface{}, 1)
	go func() { result <- a.RefreshUsage() }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("ledger request did not start")
	}

	// 切到无 Key 的来源并等其结果落盘，再切回原来源。
	// 原请求仍在 pending，因此RefreshUsage必须保持PENDING语义。
	a.SaveSettings(`{"ledgerSource":"moonshot"}`)
	if current := a.RefreshUsage(); current["source"] != "moonshot" {
		t.Fatalf("new source request returned %#v", current)
	}
	a.SaveSettings(`{"ledgerSource":"deepseek"}`)
	if pending := a.RefreshUsage(); pending["pending"] != true || pending["errorCode"] != "PENDING" {
		t.Fatalf("in-flight request should remain pending: %#v", pending)
	}

	unblock()
	var old map[string]interface{}
	select {
	case old = <-result:
	case <-time.After(3 * time.Second):
		t.Fatal("old ledger request did not finish")
	}
	if old["source"] != "deepseek" || old["available"] != true {
		t.Fatalf("caller should still receive its original result: %#v", old)
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if a.ledger != nil {
		t.Fatalf("stale request overwrote the new source generation: %#v", a.ledger)
	}
	if _, ok := a.ledgerOK["deepseek"]; ok {
		t.Fatalf("stale request updated success metadata: %#v", a.ledgerOK)
	}
}

func TestScheduledLedgerRequestKeepsOriginalGeneration(t *testing.T) {
	called := make(chan struct{}, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called <- struct{}{}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"is_available":true,"balance_infos":[]}`)
	}))
	t.Cleanup(srv.Close)
	withAPIHosts(t, srv)

	st := defaultState()
	st["ledger"] = false
	st["apiKeys"] = map[string]interface{}{"deepseek": "plain:sk-scheduled-ledger-key"}
	a := &App{state: st}
	generation, ok := a.beginFetch("deepseek")
	if !ok {
		t.Fatal("failed to capture request generation")
	}
	a.endFetch("deepseek", generation)
	a.SaveSettings(`{"ledgerSource":"moonshot"}`)
	a.SaveSettings(`{"ledgerSource":"deepseek"}`)

	a.fetchApiBalanceAsync("deepseek", generation)
	select {
	case <-called:
		t.Fatal("scheduled request from an old source generation started")
	case <-time.After(100 * time.Millisecond):
	}
}

func TestSavingUnchangedLedgerSourceKeepsRequestCurrent(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"12.34"}]}`)
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(unblock)
	withAPIHosts(t, srv)

	st := defaultState()
	st["apiKeys"] = map[string]interface{}{"deepseek": "plain:sk-current-ledger-key"}
	a := &App{state: st}
	result := make(chan map[string]interface{}, 1)
	go func() { result <- a.RefreshUsage() }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("ledger request did not start")
	}
	a.SaveSettings(`{"ledgerSource":"deepseek"}`)
	unblock()
	select {
	case <-result:
	case <-time.After(3 * time.Second):
		t.Fatal("ledger request did not finish")
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if a.ledger == nil || a.ledger["source"] != "deepseek" || a.ledger["available"] != true {
		t.Fatalf("unchanged source invalidated the request: %#v", a.ledger)
	}
}
