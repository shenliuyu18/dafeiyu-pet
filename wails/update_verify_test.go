package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseSHA256Sums(t *testing.T) {
	h := strings.Repeat("ab", 32)
	text := "\ufeff" + h + "  dafeiyu-pet-1.6.0-setup.exe\r\n" + strings.Repeat("cd", 32) + " *other.exe\n"
	if got := parseSHA256Sums(text, "dafeiyu-pet-1.6.0-setup.exe"); got != h {
		t.Fatalf("want %s, got %q", h, got)
	}
	if got := parseSHA256Sums(text, "other.exe"); got != strings.Repeat("cd", 32) {
		t.Fatalf("star-prefixed name not parsed: %q", got)
	}
	if got := parseSHA256Sums(text, "missing.exe"); got != "" {
		t.Fatalf("missing file should return empty, got %q", got)
	}
}

func TestFileSHA256(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.bin")
	if err := os.WriteFile(p, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte("hello"))
	got, err := fileSHA256(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != hex.EncodeToString(want[:]) {
		t.Fatalf("hash mismatch: %s", got)
	}
}

func TestPickReleaseAsset(t *testing.T) {
	assets := []interface{}{
		map[string]interface{}{"name": "SHA256SUMS.txt", "browser_download_url": "https://x/sums"},
		map[string]interface{}{"name": "SHA256SUMS.txt.sig", "browser_download_url": "https://x/sig"},
	}
	if _, u := pickReleaseAsset(assets, "SHA256SUMS.txt"); u != "https://x/sums" {
		t.Fatalf("sums url: %q", u)
	}
	if _, u := pickReleaseAsset(assets, "SHA256SUMS.txt.sig"); u != "https://x/sig" {
		t.Fatalf("sig url: %q", u)
	}
	if _, u := pickReleaseAsset(assets, "nope"); u != "" {
		t.Fatalf("missing asset should be empty: %q", u)
	}
}

func TestVerifyUpdateFileSHA256(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "setup.exe")
	content := []byte("installer-bytes")
	if err := os.WriteFile(dest, content, 0644); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	sums := hex.EncodeToString(sum[:]) + "  dafeiyu-pet-1.6.0-setup.exe\n"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/SHA256SUMS.txt" {
			_, _ = w.Write([]byte(sums))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	info := map[string]interface{}{
		"assetName": "dafeiyu-pet-1.6.0-setup.exe",
		"sumsUrl":   srv.URL + "/SHA256SUMS.txt",
	}
	if err := verifyUpdateFile(dest, info); err != nil {
		t.Fatalf("valid file rejected: %v", err)
	}

	// 篡改安装包
	if err := os.WriteFile(dest, []byte("tampered"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := verifyUpdateFile(dest, info); err == nil || !strings.Contains(err.Error(), "校验失败") {
		t.Fatalf("tampered file should fail, got %v", err)
	}

	// 没有清单
	if err := verifyUpdateFile(dest, map[string]interface{}{"assetName": "x.exe"}); err == nil {
		t.Fatal("missing sums should fail")
	}
}

func TestVerifyUpdateFileEd25519(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	old := updateSigningPubKey
	updateSigningPubKey = base64.StdEncoding.EncodeToString(pub)
	defer func() { updateSigningPubKey = old }()

	dir := t.TempDir()
	dest := filepath.Join(dir, "setup.exe")
	content := []byte("signed-installer")
	if err := os.WriteFile(dest, content, 0644); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	sums := hex.EncodeToString(sum[:]) + "  dafeiyu-pet-1.6.0-setup.exe\n"
	sig := base64.StdEncoding.EncodeToString(ed25519.Sign(priv, []byte(sums)))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/SHA256SUMS.txt":
			_, _ = w.Write([]byte(sums))
		case "/SHA256SUMS.txt.sig":
			_, _ = w.Write([]byte(sig))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	info := map[string]interface{}{
		"assetName": "dafeiyu-pet-1.6.0-setup.exe",
		"sumsUrl":   srv.URL + "/SHA256SUMS.txt",
		"sigUrl":    srv.URL + "/SHA256SUMS.txt.sig",
	}
	if err := verifyUpdateFile(dest, info); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}

	info["sigUrl"] = ""
	if err := verifyUpdateFile(dest, info); err == nil {
		t.Fatal("missing signature should fail when pubkey is configured")
	}
}
