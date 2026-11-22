package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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
	got := readStateFile(t, path)
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
	before, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	// 没有新改动时再 flush 不应重写文件
	a.flushStateIfDirty()
	after, err := os.Stat(path)
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
