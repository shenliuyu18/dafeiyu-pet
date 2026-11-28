package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"testing"
	"time"
)

func TestSlotMutexNames(t *testing.T) {
	prevLite, prevIso := Variant, isolatedMode
	t.Cleanup(func() { Variant, isolatedMode = prevLite, prevIso })
	Variant, isolatedMode = "full", false
	if got := slotMutexName(1); got != `Global\dafeiyu-desktop-pet-wails` {
		t.Fatalf("slot 1 name = %q", got)
	}
	if got := slotMutexName(3); got != `Global\dafeiyu-desktop-pet-wails-slot3` {
		t.Fatalf("slot 3 name = %q", got)
	}
	Variant = "lite"
	if got := slotMutexName(2); got != `Global\dafeiyu-desktop-pet-wails-lite-slot2` {
		t.Fatalf("lite slot 2 name = %q", got)
	}
}

func TestStateSplitKeepsRuntimeFieldsOutOfShared(t *testing.T) {
	st := defaultState()
	shared := splitSharedState(st)
	runtime := splitRuntimeState(st)
	for k := range runtimeStateKeys {
		if _, ok := shared[k]; ok {
			t.Fatalf("shared state still contains runtime key %q", k)
		}
		if _, ok := runtime[k]; !ok {
			t.Fatalf("runtime state missing key %q", k)
		}
	}
	if _, ok := shared["lang"]; !ok {
		t.Fatal("shared state should keep lang")
	}
}

func TestRuntimeStatePathUsesSlotNumber(t *testing.T) {
	prev := instanceSlot
	instanceSlot = 4
	t.Cleanup(func() { instanceSlot = prev })
	a := &App{statePath: filepath.Join(t.TempDir(), "dafeiyu-state.json")}
	want := filepath.Join(filepath.Dir(a.statePath), "instances", "4", "dafeiyu-state.json")
	if got := a.runtimeStatePath(); got != want {
		t.Fatalf("runtimeStatePath = %q, want %q", got, want)
	}
}

func TestRestoreSlotsRoundTrip(t *testing.T) {
	prevIso := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = prevIso })
	t.Setenv("APPDATA", t.TempDir())
	if got := readRestoreSlots(); len(got) != 0 {
		t.Fatalf("missing restore file should be empty, got %#v", got)
	}
	writeRestoreSlots([]int{3, 1, 3, 99, 0})
	if got := readRestoreSlots(); len(got) != 2 || got[0] != 1 || got[1] != 3 {
		t.Fatalf("restore slots = %#v", got)
	}
}

func TestWriteSharedStateMergesWithoutClobbering(t *testing.T) {
	prevIso := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = prevIso })
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	path := filepath.Join(dir, "dafeiyu-state.json")
	if err := os.WriteFile(path, []byte(`{"lang":"zh","scale":0.85}`), 0o644); err != nil {
		t.Fatal(err)
	}

	a := &App{statePath: path}
	b := &App{statePath: path}
	a.lastShared = map[string]string{"lang": `"zh"`, "scale": "0.85"}
	b.lastShared = map[string]string{"lang": `"zh"`, "scale": "0.85"}

	if err := a.writeSharedState(map[string]interface{}{"lang": "en", "scale": 0.85}); err != nil {
		t.Fatal(err)
	}
	if err := b.writeSharedState(map[string]interface{}{"lang": "zh", "scale": 1.1}); err != nil {
		t.Fatal(err)
	}

	var got map[string]interface{}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got["lang"] != "en" {
		t.Fatalf("language change was lost: %#v", got)
	}
	if got["scale"] != 1.1 {
		t.Fatalf("scale change was lost: %#v", got)
	}
}

func TestLoadStateMigratesRuntimeFieldsIntoInstanceFile(t *testing.T) {
	prevIso := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = prevIso })
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)

	a := &App{words: NewWordsFilter(nil)}
	path := a.stateFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := `{"schemaVersion":2,"lang":"zh","scale":0.9,"satiety":33,"mood":44,"character":"gpt","pos":{"x":10,"y":20}}`
	if err := os.WriteFile(path, []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}

	a.loadState()
	a.saveStateNow()

	inst := filepath.Join(instancesDir(), "1", "dafeiyu-state.json")
	raw, err := os.ReadFile(inst)
	if err != nil {
		t.Fatalf("instance state not created: %v", err)
	}
	var runtime map[string]interface{}
	if err := json.Unmarshal(raw, &runtime); err != nil {
		t.Fatal(err)
	}
	if runtime["character"] != "gpt" || runtime["satiety"] != 33.0 {
		t.Fatalf("runtime fields not migrated: %#v", runtime)
	}

	raw, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var shared map[string]interface{}
	if err := json.Unmarshal(raw, &shared); err != nil {
		t.Fatal(err)
	}
	if _, ok := shared["character"]; ok {
		t.Fatalf("shared state should no longer carry character: %#v", shared)
	}
	if shared["scale"] != 0.9 {
		t.Fatalf("shared scale lost: %#v", shared)
	}
	if _, err := filepath.Glob(path + ".bak-*"); err != nil {
		t.Fatalf("backup check failed: %v", err)
	}
}

func TestReloadSharedPicksUpOtherInstanceChanges(t *testing.T) {
	prevIso := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = prevIso })
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	path := filepath.Join(dir, "dafeiyu-state.json")
	if err := os.WriteFile(path, []byte(`{"lang":"ja","scale":1.2}`), 0o644); err != nil {
		t.Fatal(err)
	}
	a := &App{state: defaultState(), statePath: path}
	a.reloadShared()
	if a.state["lang"] != "ja" || a.state["scale"] != 1.2 {
		t.Fatalf("shared reload did not apply: %#v", a.state)
	}
	// 运行时字段不受共享文件影响
	a.state["satiety"] = 55.0
	if err := os.WriteFile(path, []byte(`{"lang":"en","scale":1.2,"satiety":1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	a.reloadShared()
	if a.state["satiety"] != 55.0 {
		t.Fatalf("reload overwrote runtime field: %#v", a.state["satiety"])
	}
}

func TestLockNamedAcrossGoroutinesDoesNotWedge(t *testing.T) {
	name := `Global\dafeiyu-lock-test-` + strconv.FormatInt(time.Now().UnixNano(), 10)
	done := make(chan struct{})
	go func() {
		defer close(done)
		var wg sync.WaitGroup
		for i := 0; i < 32; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for j := 0; j < 50; j++ {
					unlock := lockNamed(name)
					runtime.Gosched()
					unlock()
				}
			}()
		}
		wg.Wait()
	}()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("lockNamed wedged: mutex ownership lost across OS threads")
	}
}
