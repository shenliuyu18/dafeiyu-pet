package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
)

func TestFetchLatestReleaseReusesETag(t *testing.T) {
	var mu sync.Mutex
	hits := 0
	notModified := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		if r.Header.Get("If-None-Match") == `"rel-1"` {
			mu.Lock()
			notModified++
			mu.Unlock()
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"rel-1"`)
		w.Header().Set("Last-Modified", "Mon, 02 Jan 2006 15:04:05 GMT")
		_, _ = io.WriteString(w, `{"tag_name":"v1.6.0","html_url":"https://example.invalid"}`)
	}))
	defer srv.Close()

	app := &App{}
	client := &http.Client{}
	first, err := app.fetchLatestReleaseFrom(client, srv.URL)
	if err != nil {
		t.Fatalf("first request failed: %v", err)
	}
	second, err := app.fetchLatestReleaseFrom(client, srv.URL)
	if err != nil {
		t.Fatalf("304 request failed: %v", err)
	}
	if strv(second["tag_name"], "") != strv(first["tag_name"], "") {
		t.Fatalf("304 result differs: %v vs %v", first, second)
	}
	mu.Lock()
	defer mu.Unlock()
	if hits != 2 || notModified != 1 {
		t.Fatalf("expected 2 requests (1 conditional 304), got hits=%d notModified=%d", hits, notModified)
	}
}

func TestDownloadResumesFromPart(t *testing.T) {
	content := bytes.Repeat([]byte("0123456789abcdef"), 128*1024) // 2MB
	var mu sync.Mutex
	first := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := int64(0)
		if rg := r.Header.Get("Range"); rg != "" {
			_, _ = fmt.Sscanf(rg, "bytes=%d-", &start)
		}
		if start > 0 {
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, len(content)-1, len(content)))
			w.WriteHeader(http.StatusPartialContent)
		} else {
			w.Header().Set("Content-Length", strconv.Itoa(len(content)))
		}
		mu.Lock()
		cut := first && start == 0
		if cut {
			first = false
		}
		mu.Unlock()
		if cut {
			_, _ = w.Write(content[:500000])
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			if hj, ok := w.(http.Hijacker); ok {
				conn, _, err := hj.Hijack()
				if err == nil {
					_ = conn.Close()
				}
			}
			return
		}
		_, _ = w.Write(content[start:])
	}))
	defer srv.Close()

	dir := t.TempDir()
	dest := filepath.Join(dir, "update.exe")
	part := filepath.Join(dir, updatePartName("update.exe"))

	err := downloadTo(srv.URL, dest, part, nil)
	if err == nil || updateErrorCode(err) != "NETWORK" {
		t.Fatalf("first download should fail with NETWORK, got %v", err)
	}
	if st, statErr := os.Stat(part); statErr != nil || st.Size() == 0 {
		t.Fatalf("partial file should remain for resume: %v", statErr)
	}

	if err := downloadTo(srv.URL, dest, part, nil); err != nil {
		t.Fatalf("resume failed: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Fatalf("resumed file mismatch: got %d bytes want %d", len(got), len(content))
	}
	if _, err := os.Stat(part); !os.IsNotExist(err) {
		t.Fatalf("part file should be renamed away, stat err=%v", err)
	}
}

func TestDownloadFallsBackWhenRangeIgnored(t *testing.T) {
	content := bytes.Repeat([]byte("abc"), 300000)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 故意忽略 Range，总是整包返回
		w.Header().Set("Content-Length", strconv.Itoa(len(content)))
		_, _ = w.Write(content)
	}))
	defer srv.Close()

	dir := t.TempDir()
	dest := filepath.Join(dir, "pkg.exe")
	part := filepath.Join(dir, updatePartName("pkg.exe"))
	if err := os.WriteFile(part, content[:100], 0644); err != nil {
		t.Fatal(err)
	}
	if err := downloadTo(srv.URL, dest, part, nil); err != nil {
		t.Fatalf("fallback download failed: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Fatalf("fallback file mismatch: got %d bytes want %d", len(got), len(content))
	}
}

func TestUpdatePartName(t *testing.T) {
	if got := updatePartName(`dafeiyu-pet-1.6.0-setup.exe`); got != ".dafeiyu-pet-1.6.0-setup.exe.part" {
		t.Fatalf("unexpected part name: %q", got)
	}
	if got := updatePartName(`..\evil/name?.exe`); got != ".name_.exe.part" {
		t.Fatalf("path separators should be sanitized: %q", got)
	}
}
