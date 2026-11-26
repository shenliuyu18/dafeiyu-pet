package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestPackForVariant(t *testing.T) {
	p := CatalogPack{
		ID: "gemini", URL: "full.zip", ZipBytes: 100,
		LiteURL: "lite.zip", LiteZipBytes: 40,
	}
	if got := packForVariant(p, false); got.URL != "full.zip" || got.ZipBytes != 100 {
		t.Fatalf("full variant changed: %+v", got)
	}
	if got := packForVariant(p, true); got.URL != "lite.zip" || got.ZipBytes != 40 {
		t.Fatalf("lite variant not selected: %+v", got)
	}
	legacy := CatalogPack{ID: "old", URL: "full.zip", ZipBytes: 100}
	if got := packForVariant(legacy, true); got.URL != "full.zip" || got.ZipBytes != 100 {
		t.Fatalf("legacy pack should fall back to full: %+v", got)
	}
}

func TestValidChar(t *testing.T) {
	for _, s := range []string{"v1", "gpt", "pack:claude", "pack:my_pet-1", "pack:gpt"} {
		if !validChar(s) {
			t.Fatalf("%s should be valid", s)
		}
	}
	for _, s := range []string{"", "whale1", "whale2", "v2", "v3", "v4", "v5", "v6", "gpt2", "pack:", "pack:MyPet", "pack:../x"} {
		if validChar(s) {
			t.Fatalf("%s should be invalid", s)
		}
	}
}

func TestFetchCatalogSelectsLite(t *testing.T) {
	const body = `{"packs":[{"id":"gemini","url":"full.zip","zipBytes":100,"liteUrl":"lite.zip","liteZipBytes":40}]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(body))
	}))
	defer srv.Close()

	packs, err := fetchCharacterCatalog(srv.URL, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(packs) != 1 || packs[0].URL != "lite.zip" || packs[0].ZipBytes != 40 {
		t.Fatalf("lite catalog not applied: %+v", packs)
	}
	packs, err = fetchCharacterCatalog(srv.URL, false)
	if err != nil {
		t.Fatal(err)
	}
	if packs[0].URL != "full.zip" || packs[0].ZipBytes != 100 {
		t.Fatalf("full catalog changed: %+v", packs[0])
	}
}

func testManifest(id string) string {
	return fmt.Sprintf(`{
		"schemaVersion": 1,
		"id": %q,
		"name": "测试娘",
		"cover": "cover.webp",
		"license": "CC0",
		"slots": {"idle": ["待机"], "click": "挥手", "sleep": ["睡觉"]},
		"actions": [
			{"id": "待机", "category": "待机", "file": "animations/idle.webm"},
			{"id": "挥手", "category": "点击回应", "file": "animations/wave.webm"},
			{"id": "睡觉", "category": "日常起居", "file": "animations/sleep.webm"}
		]
	}`, id)
}

func writeZip(t *testing.T, zipPath string, files map[string]string) {
	t.Helper()
	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	f.Close()
}

func validPackFiles(prefix, manifest string) map[string]string {
	files := map[string]string{
		prefix + "manifest.json":         manifest,
		prefix + "cover.webp":            "cover-bytes",
		prefix + "animations/idle.webm":  "video-idle",
		prefix + "animations/wave.webm":  "video-wave",
		prefix + "animations/sleep.webm": "video-sleep",
	}
	return files
}

func TestValidateManifest(t *testing.T) {
	good := func() *CharacterManifest {
		return &CharacterManifest{
			SchemaVersion: 1, ID: "my_pet-1", Name: "测试娘", Cover: "cover.webp",
			Slots: map[string]StringList{"idle": {"待机"}},
			Actions: []CharacterAction{
				{ID: "待机", File: "animations/idle.webm"},
				{ID: "挥手", File: "animations/wave.webm"},
			},
		}
	}
	if err := validateManifest(good()); err != nil {
		t.Fatalf("valid manifest rejected: %v", err)
	}

	cases := []struct {
		name string
		edit func(*CharacterManifest)
	}{
		{"reserved id", func(m *CharacterManifest) { m.ID = "v1" }},
		{"bad id case", func(m *CharacterManifest) { m.ID = "MyPet" }},
		{"missing name", func(m *CharacterManifest) { m.Name = " " }},
		{"no cover", func(m *CharacterManifest) { m.Cover = "" }},
		{"cover escapes", func(m *CharacterManifest) { m.Cover = "../cover.webp" }},
		{"no actions", func(m *CharacterManifest) { m.Actions = nil }},
		{"duplicate action", func(m *CharacterManifest) { m.Actions[1].ID = "待机" }},
		{"bad file ext", func(m *CharacterManifest) { m.Actions[0].File = "a.exe" }},
		{"file escapes", func(m *CharacterManifest) { m.Actions[0].File = "../a.webm" }},
		{"unknown slot", func(m *CharacterManifest) { m.Slots = map[string]StringList{"dance": {"待机"}} }},
		{"slot missing action", func(m *CharacterManifest) { m.Slots = map[string]StringList{"idle": {"不存在"}} }},
	}
	for _, c := range cases {
		m := good()
		c.edit(m)
		if err := validateUserImport(m); err == nil {
			t.Fatalf("%s should be rejected", c.name)
		}
	}

	sprite := good()
	sprite.Kind = "sprite"
	sprite.Actions[0].File = "spritesheet.webp"
	if err := validateUserImport(sprite); err == nil {
		t.Fatal("custom sprite pack should be rejected")
	}
}

func dialogueManifest() *CharacterManifest {
	return &CharacterManifest{
		SchemaVersion: 1, ID: "my_pet-1", Name: "测试娘", Cover: "cover.webp",
		Dialogue: &CharacterDialogue{
			Intro: "你好呀",
			Quips: []string{"摸头可以"},
			Feed:  []string{"好吃"},
			Memes: []DialogueMeme{{File: "memes/pat.webp", Scenes: []string{"click"}, Text: "摸摸头"}},
		},
		I18n: map[string]CharacterLocale{
			"en": {
				Lines:      map[string]string{"你好呀": "Hi there", "摸头可以": "Head pats are fine", "好吃": "Yum", "摸摸头": "Pat pat"},
				Actions:    map[string]string{"待机": "Idle"},
				Categories: map[string]string{"日常起居": "Daily life"},
			},
		},
		Actions: []CharacterAction{
			{ID: "待机", Category: "日常起居", File: "animations/idle.webm"},
			{ID: "挥手", Category: "点击回应", File: "animations/wave.webm"},
		},
	}
}

func TestValidateManifestDialogue(t *testing.T) {
	if err := validateManifest(dialogueManifest()); err != nil {
		t.Fatalf("valid dialogue rejected: %v", err)
	}
	cases := []struct {
		name string
		edit func(*CharacterManifest)
	}{
		{"meme escapes", func(m *CharacterManifest) { m.Dialogue.Memes[0].File = "../x.webp" }},
		{"meme not image", func(m *CharacterManifest) { m.Dialogue.Memes[0].File = "memes/x.webm" }},
		{"meme unknown scene", func(m *CharacterManifest) { m.Dialogue.Memes[0].Scenes = []string{"dance"} }},
		{"meme no scene", func(m *CharacterManifest) { m.Dialogue.Memes[0].Scenes = nil }},
		{"unknown locale", func(m *CharacterManifest) { m.I18n["fr"] = CharacterLocale{Lines: map[string]string{"好吃": "Bon"}} }},
		{"translation for missing line", func(m *CharacterManifest) { m.I18n["en"].Lines["不存在"] = "Ghost" }},
		{"empty translation", func(m *CharacterManifest) { m.I18n["en"].Lines["好吃"] = " " }},
		{"translation for missing action", func(m *CharacterManifest) { m.I18n["en"].Actions["不存在"] = "Ghost" }},
		{"translation for missing category", func(m *CharacterManifest) { m.I18n["en"].Categories["不存在"] = "Ghost" }},
		{"i18n without dialogue", func(m *CharacterManifest) { m.Dialogue = nil }},
	}
	for _, c := range cases {
		m := dialogueManifest()
		c.edit(m)
		if err := validateManifest(m); err == nil {
			t.Fatalf("%s should be rejected", c.name)
		}
	}
	// plus 包可以只带动作/分类译文，台词沿用宿主形象
	noDialogue := dialogueManifest()
	noDialogue.Dialogue = nil
	noDialogue.I18n = map[string]CharacterLocale{"en": {Actions: map[string]string{noDialogue.Actions[0].ID: "Wave"}}}
	if err := validateManifest(noDialogue); err != nil {
		t.Fatalf("action-only i18n rejected: %v", err)
	}
}

func TestValidateManifestSprite(t *testing.T) {
	good := func() *CharacterManifest {
		return &CharacterManifest{
			SchemaVersion: 1, ID: "gptv1", Name: "GPT娘v1", Kind: "sprite", Cover: "cover.webp",
			Actions: []CharacterAction{{ID: "spritesheet", File: "spritesheet.webp"}},
			Sprite: &SpriteSpec{
				Sheet: "spritesheet.webp", CellW: 192, CellH: 208, Cols: 8, Rows: 11,
				Sequences: map[string]SpriteSequence{
					"idle":    {Row: 0, Count: 2, Times: []int{500, 500}},
					"waiting": {Row: 1, Count: 1, Times: []int{500}},
				},
				Map:     map[string]string{"待机呼吸": "idle"},
				Actions: []SpriteAction{{Key: "idle", Label: "待机呼吸"}},
			},
		}
	}
	if err := validateManifest(good()); err != nil {
		t.Fatalf("valid sprite rejected: %v", err)
	}
	cases := []struct {
		name string
		edit func(*CharacterManifest)
	}{
		{"sprite kind without sprite", func(m *CharacterManifest) { m.Sprite = nil }},
		{"sprite on video pack", func(m *CharacterManifest) { m.Kind = "" }},
		{"bad sheet", func(m *CharacterManifest) { m.Sprite.Sheet = "../sheet.webp" }},
		{"zero cell", func(m *CharacterManifest) { m.Sprite.CellW = 0 }},
		{"row out of range", func(m *CharacterManifest) {
			m.Sprite.Sequences["idle"] = SpriteSequence{Row: 99, Count: 1, Times: []int{100}}
		}},
		{"times mismatch", func(m *CharacterManifest) {
			m.Sprite.Sequences["idle"] = SpriteSequence{Row: 0, Count: 3, Times: []int{100}}
		}},
		{"map to unknown sequence", func(m *CharacterManifest) { m.Sprite.Map["待机呼吸"] = "dance" }},
		{"sprite action unknown key", func(m *CharacterManifest) { m.Sprite.Actions[0].Key = "dance" }},
		{"missing waiting sequence", func(m *CharacterManifest) { delete(m.Sprite.Sequences, "waiting") }},
	}
	for _, c := range cases {
		m := good()
		c.edit(m)
		if err := validateManifest(m); err == nil {
			t.Fatalf("%s should be rejected", c.name)
		}
	}
	// 单帧定格可以越过 count 取列；run 是 runLeft/runRight 的虚拟别名
	quirks := good()
	quirks.Sprite.Sequences["sleep"] = SpriteSequence{Row: 0, Count: 1, Times: []int{1200}, Frame: 2}
	quirks.Sprite.Sequences["runLeft"] = SpriteSequence{Row: 1, Count: 2, Times: []int{100, 100}}
	quirks.Sprite.Sequences["runRight"] = SpriteSequence{Row: 2, Count: 2, Times: []int{100, 100}}
	quirks.Sprite.Map["原地左转奔跑"] = "run"
	if err := validateManifest(quirks); err != nil {
		t.Fatalf("frame-beyond-count / run alias rejected: %v", err)
	}
}

func TestDownloadAndInstallRejectsDeclaredOversizedZip(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	a := &App{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(maxPackBytes+1))
	}))
	defer srv.Close()

	err := a.downloadAndInstall("my_pet-1", srv.URL)
	if err == nil || !strings.Contains(err.Error(), "下载体积超过") {
		t.Fatalf("oversized response should be rejected by size, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(a.charactersDir(), "my_pet-1.zip.part")); !os.IsNotExist(err) {
		t.Fatalf("partial download should be removed, stat err=%v", err)
	}
}

func TestDownloadAndInstallRejectsOversizedChunkedZip(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	a := &App{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.(http.Flusher).Flush() // 不声明 Content-Length，强制走分块读取路径。
		_, _ = w.Write([]byte(strings.Repeat("x", 1024)))
	}))
	defer srv.Close()

	err := a.downloadAndInstallWithLimit("my_pet-1", srv.URL, 1023)
	if err == nil || !strings.Contains(err.Error(), "下载体积超过") {
		t.Fatalf("chunked response should be rejected while reading, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(a.charactersDir(), "my_pet-1.zip.part")); !os.IsNotExist(err) {
		t.Fatalf("partial download should be removed, stat err=%v", err)
	}
}

func TestInstallCharacterSerializesSameID(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	a := &App{}
	const id = "my_pet-1"
	zipPath := filepath.Join(t.TempDir(), "pack.zip")
	writeZip(t, zipPath, validPackFiles("", testManifest(id)))
	body, err := os.ReadFile(zipPath)
	if err != nil {
		t.Fatal(err)
	}

	var mu sync.Mutex
	requests, active, maxActive := 0, 0, 0
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseFirst) }) }
	defer release()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests++
		call := requests
		active++
		if active > maxActive {
			maxActive = active
		}
		mu.Unlock()
		defer func() {
			mu.Lock()
			active--
			mu.Unlock()
		}()
		if call == 1 {
			close(firstStarted)
			<-releaseFirst
		}
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	firstDone := make(chan error, 1)
	go func() { firstDone <- a.InstallCharacter(id, srv.URL) }()
	select {
	case <-firstStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("first install did not start")
	}
	secondDone := make(chan error, 1)
	go func() { secondDone <- a.InstallCharacter(id, srv.URL) }()
	select {
	case err := <-secondDone:
		release()
		t.Fatalf("second install should wait for the first, got %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	release()
	for i, done := range []<-chan error{firstDone, secondDone} {
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("install %d failed: %v", i+1, err)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("install %d did not finish", i+1)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if requests != 2 || maxActive != 1 {
		t.Fatalf("same-ID installs overlapped: requests=%d maxActive=%d", requests, maxActive)
	}
	for _, suffix := range []string{".zip.part", ".installing"} {
		if _, err := os.Stat(filepath.Join(a.charactersDir(), id+suffix)); !os.IsNotExist(err) {
			t.Fatalf("%s should not remain after installs, stat err=%v", suffix, err)
		}
	}
}

func TestCharacterOperationsWaitForInstall(t *testing.T) {
	const id = "my_pet-1"
	files := validPackFiles("", testManifest(id))
	importZip := filepath.Join(t.TempDir(), "import.zip")
	writeZip(t, importZip, files)
	importBody, err := os.ReadFile(importZip)
	if err != nil {
		t.Fatal(err)
	}

	for _, tc := range []struct {
		name          string
		operation     func(*App, string) error
		wantInstalled bool
	}{
		{
			name: "uninstall",
			operation: func(a *App, _ string) error {
				return a.RemoveCharacter(id)
			},
		},
		{
			name: "import",
			operation: func(a *App, _ string) error {
				_, err := a.InstallCharacterFromFile(importZip)
				return err
			},
			wantInstalled: true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("APPDATA", t.TempDir())
			a := &App{}
			started := make(chan struct{})
			release := make(chan struct{})
			var releaseOnce sync.Once
			unblock := func() { releaseOnce.Do(func() { close(release) }) }
			defer unblock()
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				close(started)
				<-release
				_, _ = w.Write(importBody)
			}))
			defer srv.Close()

			installDone := make(chan error, 1)
			go func() { installDone <- a.InstallCharacter(id, srv.URL) }()
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("install did not start")
			}
			operationDone := make(chan error, 1)
			go func() { operationDone <- tc.operation(a, importZip) }()
			select {
			case err := <-operationDone:
				unblock()
				t.Fatalf("%s should wait for install, got %v", tc.name, err)
			case <-time.After(100 * time.Millisecond):
			}
			unblock()
			for name, done := range map[string]<-chan error{"install": installDone, tc.name: operationDone} {
				select {
				case err := <-done:
					if err != nil {
						t.Fatalf("%s failed: %v", name, err)
					}
				case <-time.After(5 * time.Second):
					t.Fatalf("%s did not finish", name)
				}
			}
			_, err := os.Stat(filepath.Join(a.charactersDir(), id))
			if tc.wantInstalled && err != nil {
				t.Fatalf("imported pack should remain installed: %v", err)
			}
			if !tc.wantInstalled && !os.IsNotExist(err) {
				t.Fatalf("uninstall should remove the completed install, stat err=%v", err)
			}
		})
	}
}

func TestExtractPackRollsBackOldPackWhenFinalRenameFails(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	a := &App{}
	const id = "my_pet-1"
	final := filepath.Join(a.charactersDir(), id)
	if err := os.MkdirAll(final, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(final, "old.txt"), []byte("old pack"), 0o644); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(t.TempDir(), "pack.zip")
	writeZip(t, zipPath, validPackFiles("", testManifest(id)))

	calls := 0
	rename := func(from, to string) error {
		calls++
		if calls == 2 {
			return errors.New("final rename blocked")
		}
		return os.Rename(from, to)
	}
	err := a.extractPackWithRename(id, zipPath, "", rename)
	if err == nil || !strings.Contains(err.Error(), "final rename blocked") {
		t.Fatalf("rename failure should remain diagnostic, got %v", err)
	}
	got, readErr := os.ReadFile(filepath.Join(final, "old.txt"))
	if readErr != nil || string(got) != "old pack" {
		t.Fatalf("old pack was not restored: body=%q err=%v", got, readErr)
	}
	if _, err := os.Stat(final + ".old"); !os.IsNotExist(err) {
		t.Fatalf("backup should be renamed back after rollback, stat err=%v", err)
	}
}

func TestExtractPackKeepsOldPackWhenRollbackRenameFails(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	a := &App{}
	const id = "my_pet-1"
	final := filepath.Join(a.charactersDir(), id)
	if err := os.MkdirAll(final, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(final, "old.txt"), []byte("old pack"), 0o644); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(t.TempDir(), "pack.zip")
	writeZip(t, zipPath, validPackFiles("", testManifest(id)))

	calls := 0
	rename := func(from, to string) error {
		calls++
		if calls == 2 {
			return errors.New("final rename blocked")
		}
		if calls == 3 {
			return errors.New("rollback rename blocked")
		}
		return os.Rename(from, to)
	}
	err := a.extractPackWithRename(id, zipPath, "", rename)
	if err == nil || !strings.Contains(err.Error(), "final rename blocked") || !strings.Contains(err.Error(), "rollback rename blocked") {
		t.Fatalf("both rename failures should be diagnostic, got %v", err)
	}
	got, readErr := os.ReadFile(filepath.Join(final+".old", "old.txt"))
	if readErr != nil || string(got) != "old pack" {
		t.Fatalf("old pack backup was lost: body=%q err=%v", got, readErr)
	}
}

func TestInstallCharacterRoundTripsDialogue(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	a := &App{}
	manifest := `{
		"schemaVersion": 1,
		"id": "my_pet-1",
		"name": "测试娘",
		"cover": "cover.webp",
		"dialogue": {"intro": "你好呀", "quips": ["摸头可以"], "memes": [{"file": "memes/pat.webp", "scenes": ["click"], "text": "摸摸头"}]},
		"i18n": {"en": {"lines": {"你好呀": "Hi", "摸头可以": "Pats ok", "摸摸头": "Pat pat"}}},
		"actions": [
			{"id": "待机", "category": "日常起居", "file": "animations/idle.webm"},
			{"id": "挥手", "category": "点击回应", "file": "animations/wave.webm"}
		]
	}`
	files := validPackFiles("", manifest)
	files["memes/pat.webp"] = "meme-bytes"
	zipPath := filepath.Join(tmp, "dialogue.zip")
	writeZip(t, zipPath, files)
	id, err := a.InstallCharacterFromFile(zipPath)
	if err != nil {
		t.Fatalf("dialogue pack should install: %v", err)
	}
	list := a.ListInstalledCharacters()
	if len(list) != 1 || list[0].ID != id {
		t.Fatalf("pack not listed: %+v", list)
	}
	c := list[0]
	if c.Dialogue == nil || c.Dialogue.Intro != "你好呀" || len(c.Dialogue.Memes) != 1 || c.Dialogue.Memes[0].File != "memes/pat.webp" {
		t.Fatalf("dialogue not round-tripped: %+v", c.Dialogue)
	}
	if got := c.I18n["en"].Lines["摸摸头"]; got != "Pat pat" {
		t.Fatalf("i18n not round-tripped: %+v", c.I18n)
	}

	// 引用的梗图不在包里时必须拒绝，避免运行时空图片
	broken := validPackFiles("", strings.Replace(manifest, "memes/pat.webp", "memes/missing.webp", 1))
	brokenZip := filepath.Join(tmp, "broken.zip")
	writeZip(t, brokenZip, broken)
	if _, err := (&App{}).InstallCharacterFromFile(brokenZip); err == nil {
		t.Fatal("missing meme file should be rejected")
	}
}

func TestInstallCharacterFromWrappedZip(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	a := &App{}

	evil := validPackFiles("", testManifest("my_pet-1"))
	evil["../evil.txt"] = "must-not-escape"
	evilZip := filepath.Join(tmp, "evil.zip")
	writeZip(t, evilZip, evil)
	if id, err := a.InstallCharacterFromFile(evilZip); err == nil {
		t.Fatalf("zip with ../ entry should be rejected, got id %s", id)
	}

	wrapped := validPackFiles("测试娘-v1/", testManifest("my_pet-1"))
	zipPath := filepath.Join(tmp, "wrapped.zip")
	writeZip(t, zipPath, wrapped)
	id, err := a.InstallCharacterFromFile(zipPath)
	if err != nil {
		t.Fatalf("wrapped zip should install: %v", err)
	}
	if id != "my_pet-1" {
		t.Fatalf("unexpected id: %s", id)
	}
	for _, rel := range []string{"manifest.json", "cover.webp", "animations/idle.webm", "animations/sleep.webm"} {
		if _, err := os.Stat(filepath.Join(a.charactersDir(), id, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("missing %s: %v", rel, err)
		}
	}
	list := a.ListInstalledCharacters()
	if len(list) != 1 || len(list[0].Slots["idle"]) != 1 || list[0].Slots["idle"][0] != "待机" {
		t.Fatalf("slots not round-tripped: %+v", list)
	}
}
