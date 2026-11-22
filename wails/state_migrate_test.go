package main

import "testing"

func TestDefaultStateHasCurrentSchema(t *testing.T) {
	if got := int(numOr(defaultState()["schemaVersion"], 0)); got != currentStateSchema {
		t.Fatalf("default schema = %d, want %d", got, currentStateSchema)
	}
}

func TestMigrateStateV1(t *testing.T) {
	st := map[string]interface{}{
		"scale":         1.0,
		"autoActionSec": 20,
		"highPriority":  true,
	}
	if !migrateState(st) {
		t.Fatal("v1 state should be reported as changed")
	}
	if int(numOr(st["schemaVersion"], 0)) != 2 {
		t.Fatalf("schema not bumped: %#v", st["schemaVersion"])
	}
	if st["scale"] != 0.85 {
		t.Fatalf("scale should migrate to 0.85, got %#v", st["scale"])
	}
	if int(numOr(st["autoActionSec"], 0)) != 40 {
		t.Fatalf("autoActionSec should migrate to 40, got %#v", st["autoActionSec"])
	}
	for _, k := range []string{"scale85", "autoAction40", "highPriority"} {
		if _, ok := st[k]; ok {
			t.Fatalf("legacy marker %q should be removed", k)
		}
	}
}

func TestMigrateStateV1AlreadyMigratedMarkers(t *testing.T) {
	st := map[string]interface{}{
		"scale":         1.0,
		"autoActionSec": 20,
		"scale85":       true,
		"autoAction40":  true,
	}
	migrateState(st)
	if st["scale"] != 1.0 {
		t.Fatalf("marked scale should not be re-migrated: %#v", st["scale"])
	}
	if int(numOr(st["autoActionSec"], 0)) != 20 {
		t.Fatalf("marked autoActionSec should not be re-migrated: %#v", st["autoActionSec"])
	}
	if _, ok := st["scale85"]; ok {
		t.Fatal("legacy marker should be removed after v2")
	}
}

func TestMigrateStateDoesNotDowngradeFutureSchema(t *testing.T) {
	st := map[string]interface{}{
		"schemaVersion": 99,
		"scale":         1.0,
	}
	if migrateState(st) {
		t.Fatal("future schema should be left untouched")
	}
	if int(numOr(st["schemaVersion"], 0)) != 99 || st["scale"] != 1.0 {
		t.Fatalf("future state mutated: %#v", st)
	}
}

func TestMigrateStateV2Untouched(t *testing.T) {
	st := map[string]interface{}{
		"schemaVersion": 2,
		"scale":         0.7,
		"autoActionSec": 55,
	}
	if migrateState(st) {
		t.Fatal("clean v2 state should not be marked changed")
	}
	if st["scale"] != 0.7 || int(numOr(st["autoActionSec"], 0)) != 55 {
		t.Fatalf("v2 state mutated: %#v", st)
	}
}
