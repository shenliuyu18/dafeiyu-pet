package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSanitizeStateForDiagnostics(t *testing.T) {
	st := map[string]interface{}{
		"apiKeys":     map[string]interface{}{"deepseek": "enc:secret"},
		"deepseekKey": "legacy-secret",
		"customQuips": []interface{}{"一句", "两句"},
		"launchApp":   `C:\private\app.exe`,
		"satiety":     80.0,
	}
	out := sanitizeStateForDiagnostics(st, map[string]bool{"deepseek": true})
	for _, k := range []string{"apiKeys", "deepseekKey", "customQuips"} {
		if _, ok := out[k]; ok {
			t.Fatalf("sensitive key %q leaked", k)
		}
	}
	if out["customQuipsCount"] != 2 {
		t.Fatalf("customQuipsCount = %#v", out["customQuipsCount"])
	}
	if out["launchApp"] != "<redacted>" {
		t.Fatalf("launchApp not redacted: %#v", out["launchApp"])
	}
	if out["satiety"] != 80.0 {
		t.Fatalf("normal field lost: %#v", out)
	}
}

func TestWriteDiagZip(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "diag.zip")
	files := []diagFile{
		{"b.txt", []byte("bee")},
		{"a.txt", []byte("aye")},
	}
	if err := writeDiagZip(p, files); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.OpenReader(p)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	if len(zr.File) != 2 {
		t.Fatalf("entries = %d", len(zr.File))
	}
	if zr.File[0].Name != "a.txt" || zr.File[1].Name != "b.txt" {
		t.Fatalf("entries not sorted: %s, %s", zr.File[0].Name, zr.File[1].Name)
	}
	rc, err := zr.File[0].Open()
	if err != nil {
		t.Fatal(err)
	}
	defer rc.Close()
	b := make([]byte, 8)
	n, _ := rc.Read(b)
	if string(b[:n]) != "aye" {
		t.Fatalf("content = %q", b[:n])
	}
}

func TestReadLogTail(t *testing.T) {
	p := filepath.Join(t.TempDir(), "x.log")
	if err := os.WriteFile(p, []byte("0123456789"), 0644); err != nil {
		t.Fatal(err)
	}
	got := readLogTail(p, 4)
	if strings.TrimSpace(string(got)) != "6789" {
		t.Fatalf("tail = %q", got)
	}
	if readLogTail(filepath.Join(t.TempDir(), "missing.log"), 4) != nil {
		t.Fatal("missing log should return nil")
	}
}
