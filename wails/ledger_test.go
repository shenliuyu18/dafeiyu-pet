package main

import (
	"errors"
	"testing"
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
