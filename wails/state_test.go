package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// 多开后运行时字段写在 instances/<slot>/，共享设置留在 state.json。
func runtimeStateFile(path string) string {
	return filepath.Join(filepath.Dir(path), "instances", strconv.Itoa(instanceSlot), "dafeiyu-state.json")
}

func readStateFile(t *testing.T, path string) map[string]interface{} {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read state: %v", err)
	}
	var got map[string]interface{}
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal state: %v", err)
	}
	return got
}

func isolateStateFiles(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	previous := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = previous })
	return dir
}

func readStateBackups(t *testing.T, path string) map[string]string {
	t.Helper()
	matches, err := filepath.Glob(path + ".corrupt-*")
	if err != nil {
		t.Fatalf("find state backups: %v", err)
	}
	backups := make(map[string]string, len(matches))
	for _, match := range matches {
		b, err := os.ReadFile(match)
		if err != nil {
			t.Fatalf("read state backup %s: %v", match, err)
		}
		backups[match] = string(b)
	}
	return backups
}

func TestUpdateStatsDefersDiskWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	a := &App{state: defaultState(), statePath: path}

	a.UpdateStats(12.5, 34.5)
	if !a.stateDirty {
		t.Fatal("UpdateStats should mark state dirty")
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("UpdateStats must not write on every 30s tick")
	}

	a.flushStateIfDirty()
	if a.stateDirty {
		t.Fatal("flush should clear dirty flag")
	}
	got := readStateFile(t, runtimeStateFile(path))
	if got["satiety"] != 12.5 || got["mood"] != 34.5 {
		t.Fatalf("flushed values mismatch: %#v", got)
	}
}

func TestFlushStateSkipsCleanState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	a := &App{state: defaultState(), statePath: path}

	a.state["satiety"] = 66.0
	a.stateDirty = true
	a.flushStateIfDirty()
	instPath := runtimeStateFile(path)
	before, err := os.Stat(instPath)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	// 没有新改动时再 flush 不应重写文件
	a.flushStateIfDirty()
	after, err := os.Stat(instPath)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if !after.ModTime().Equal(before.ModTime()) {
		t.Fatal("clean state should not be rewritten")
	}
}

func TestSaveFailureKeepsDirty(t *testing.T) {
	a := &App{state: defaultState(), statePath: ""}
	a.stateDirty = true
	a.saveStateNow()
	if !a.stateDirty {
		t.Fatal("failed save must keep the dirty flag for the next flush")
	}
}

func TestSaveFailureCleansTempAndKeepsDirty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatalf("create rename blocker: %v", err)
	}
	a := &App{state: defaultState(), statePath: path}

	a.saveStateNow()
	if !a.stateDirty {
		t.Fatal("failed rename must keep the dirty flag")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read state directory: %v", err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".tmp") {
			t.Fatalf("failed save left temporary file: %s", entry.Name())
		}
	}
}

func TestSaveStateNowConcurrentWritesLeaveNoTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	a := &App{state: defaultState(), statePath: path}

	const saves = 32
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(saves)
	for i := 0; i < saves; i++ {
		go func(i int) {
			defer wg.Done()
			<-start
			a.mu.Lock()
			a.state["write"] = i
			a.state["payload"] = strings.Repeat(string(rune('a'+i%26)), 4096+i*97)
			a.mu.Unlock()
			a.saveStateNow()
		}(i)
	}
	close(start)
	wg.Wait()

	got := readStateFile(t, path)
	if _, ok := got["write"]; !ok {
		t.Fatal("saved state is missing the concurrent write marker")
	}
	if a.stateDirty {
		t.Fatal("successful concurrent saves must leave state clean")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read state directory: %v", err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".tmp") {
			t.Fatalf("temporary state file left behind: %s", entry.Name())
		}
	}
}

func TestNumOrPreservesZeroAndDefaultsUnsupportedValues(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want float64
	}{
		{name: "int zero", in: 0, want: 0},
		{name: "float zero", in: 0.0, want: 0},
		{name: "json number zero", in: json.Number("0"), want: 0},
		{name: "nil", in: nil, want: 42},
		{name: "string", in: "0", want: 42},
		{name: "bool", in: false, want: 42},
		{name: "invalid json number", in: json.Number("invalid"), want: 42},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := numOr(tt.in, 42); got != tt.want {
				t.Fatalf("numOr(%#v, 42) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestLoadStateRestoresZeroSatietyAndMood(t *testing.T) {
	isolateStateFiles(t)
	a := &App{}
	path := a.stateFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("create state directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(`{"schemaVersion":2,"ledger":false,"satiety":0,"mood":0}`), 0644); err != nil {
		t.Fatalf("write state: %v", err)
	}

	a.loadState()
	status := a.petStatus()
	if status["satiety"] != 0 || status["mood"] != 0 {
		t.Fatalf("zero stats were not restored: satiety=%#v mood=%#v", status["satiety"], status["mood"])
	}
}

func TestLoadStateBacksUpCorruptFileWithoutOverwritingBackups(t *testing.T) {
	isolateStateFiles(t)
	a := &App{}
	path := a.stateFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("create state directory: %v", err)
	}
	const corrupt = `{"satiety":`
	if err := os.WriteFile(path, []byte(corrupt), 0644); err != nil {
		t.Fatalf("write corrupt state: %v", err)
	}
	oldBackup := path + ".corrupt-20000101-000000"
	if err := os.WriteFile(oldBackup, []byte("previous backup"), 0644); err != nil {
		t.Fatalf("write old backup: %v", err)
	}

	a.loadState()
	beforeRestart := readStateBackups(t, path)
	if len(beforeRestart) != 2 {
		t.Fatalf("got %d backups, want old and newly corrupted state", len(beforeRestart))
	}
	if beforeRestart[oldBackup] != "previous backup" {
		t.Fatal("old backup content was overwritten")
	}
	foundCorrupt := false
	for _, content := range beforeRestart {
		if content == corrupt {
			foundCorrupt = true
		}
	}
	if !foundCorrupt {
		t.Fatal("corrupt state content was not preserved in a backup")
	}

	a.saveStateNow()
	restarted := &App{}
	restarted.loadState()
	afterRestart := readStateBackups(t, path)
	if len(afterRestart) != len(beforeRestart) {
		t.Fatalf("restart changed backup count: got %d, want %d", len(afterRestart), len(beforeRestart))
	}
	for name, want := range beforeRestart {
		if afterRestart[name] != want {
			t.Fatalf("restart changed backup %s", name)
		}
	}
	readStateFile(t, path)
}
