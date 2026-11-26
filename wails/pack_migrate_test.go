package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateInstalledPacksUpgradesOfficialPack(t *testing.T) {
	prev := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = prev })
	t.Setenv("APPDATA", t.TempDir())

	a := &App{}
	loadPackManifestPatches()
	patch, ok := packManifestPatches["gptv1"]
	if !ok {
		t.Fatal("embedded gptv1 manifest missing")
	}
	dir := filepath.Join(a.charactersDir(), "gptv1")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, act := range patch.Actions {
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(act.File)), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, patch.Sprite.Sheet), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	var old CharacterManifest
	deep, _ := json.Marshal(patch)
	_ = json.Unmarshal(deep, &old) // 深拷贝，避免修改补丁本身
	old.Version = ""
	old.Sprite = nil
	old.I18n = nil
	old.Dialogue = nil
	for i := range old.Actions {
		old.Actions[i].Category = ""
	}
	raw, _ := json.Marshal(old)
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	if n := a.migrateInstalledPacks(); n != 1 {
		t.Fatalf("expected 1 migrated pack, got %d", n)
	}
	m, err := a.loadInstalledCharacter("gptv1")
	if err != nil {
		t.Fatal(err)
	}
	if m.Version != "1.0.1" {
		t.Fatalf("version not migrated: %q", m.Version)
	}
	if m.Sprite == nil {
		t.Fatal("sprite config not migrated")
	}
	for _, act := range m.Actions {
		if act.Category == "" {
			t.Fatalf("action %q still has no category", act.ID)
		}
	}
	if n := a.migrateInstalledPacks(); n != 0 {
		t.Fatalf("migration must be idempotent, got %d", n)
	}
}

func TestMigrateInstalledPacksLeavesThirdPartyAlone(t *testing.T) {
	prev := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = prev })
	t.Setenv("APPDATA", t.TempDir())

	a := &App{}
	dir := filepath.Join(a.charactersDir(), "my-cat")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	raw := []byte(`{"schemaVersion":1,"id":"my-cat","name":"My Cat","version":"0.9.0","kind":"video","actions":[{"id":"idle","category":"自定义","file":"a.webm"}]}`)
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if n := a.migrateInstalledPacks(); n != 0 {
		t.Fatalf("third-party packs must be untouched, migrated %d", n)
	}
	got, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(raw) {
		t.Fatal("third-party manifest was modified")
	}
}
