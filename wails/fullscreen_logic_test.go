package main

import (
	"testing"
	"time"
)

const testTick = 500 * time.Millisecond

func drift(t time.Time, d time.Duration) time.Time { return t.Add(d) }

func TestFullscreenHysteresisHidesAfterTwoHits(t *testing.T) {
	h := newFullscreenHysteresis()
	t0 := time.Unix(1_700_000_000, 0)

	if got := h.step(true, t0); got != fsDecisionNone {
		t.Fatalf("single hit must not hide, got %v", got)
	}
	if got := h.step(true, drift(t0, testTick)); got != fsDecisionHide {
		t.Fatalf("two consecutive hits should hide, got %v", got)
	}
	if got := h.step(true, drift(t0, 2*testTick)); got != fsDecisionNone {
		t.Fatalf("already hidden should stay quiet, got %v", got)
	}
}

func TestFullscreenHysteresisRestoreNeedsClearTicksAndDelay(t *testing.T) {
	h := newFullscreenHysteresis()
	t0 := time.Unix(1_700_000_000, 0)
	h.step(true, t0)
	h.step(true, drift(t0, testTick))

	if got := h.step(false, drift(t0, 2*testTick)); got != fsDecisionNone {
		t.Fatalf("first clear sample must not restore, got %v", got)
	}
	if got := h.step(false, drift(t0, 3*testTick)); got != fsDecisionNone {
		t.Fatalf("restore must wait for %v, got %v", fullscreenRestoreDelay, got)
	}
	if got := h.step(false, drift(t0, 3*testTick+fullscreenRestoreDelay)); got != fsDecisionRestore {
		t.Fatalf("stable clear should restore, got %v", got)
	}
}

// issue #2 的核心回归：恢复后立刻又被判定全屏时，必须忍住 4 秒，不能反复闪。
func TestFullscreenHysteresisRehideCooldown(t *testing.T) {
	h := newFullscreenHysteresis()
	t0 := time.Unix(1_700_000_000, 0)
	h.step(true, t0)
	h.step(true, drift(t0, testTick))
	h.step(false, drift(t0, 2*testTick))
	h.step(false, drift(t0, 3*testTick+fullscreenRestoreDelay))
	restoredAt := drift(t0, 3*testTick+fullscreenRestoreDelay)

	if got := h.step(true, restoredAt); got != fsDecisionNone {
		t.Fatalf("cooldown must suppress immediate re-hide, got %v", got)
	}
	if got := h.step(true, drift(restoredAt, testTick)); got != fsDecisionNone {
		t.Fatalf("still inside cooldown, got %v", got)
	}
	if got := h.step(true, drift(restoredAt, fullscreenRehideDelay)); got != fsDecisionHide {
		t.Fatalf("after cooldown a confirmed fullscreen should hide, got %v", got)
	}
}

func TestFullscreenHysteresisZeroValueUsesDefaults(t *testing.T) {
	var h fullscreenHysteresis
	h.normalize()
	if h.confirmTicks != fullscreenConfirmTicks || h.clearTicks != fullscreenClearTicks {
		t.Fatalf("zero value ticks not normalized: %+v", h)
	}
	if h.restoreDelay != fullscreenRestoreDelay {
		t.Fatalf("restore delay not normalized: %v", h.restoreDelay)
	}
	// 曾经把 rehideDelay 写成「只处理 <0」，零值状态机的冷却期变成 0，
	// issue #2 的 4 秒防抖实际上没生效。
	if h.rehideDelay != fullscreenRehideDelay {
		t.Fatalf("rehide delay must default to %v, got %v", fullscreenRehideDelay, h.rehideDelay)
	}
}

func TestFullscreenHysteresisPauseKeepsHiddenState(t *testing.T) {
	h := newFullscreenHysteresis()
	t0 := time.Unix(1_700_000_000, 0)
	h.suppress()
	if !h.hidden {
		t.Fatal("suppress should mark hidden")
	}
	h.pause()
	if !h.hidden {
		t.Fatal("pause must keep hidden state")
	}
	h.release()
	if h.hidden {
		t.Fatal("release should clear hidden state")
	}
	if got := h.step(false, t0); got != fsDecisionNone {
		t.Fatalf("released state must not restore, got %v", got)
	}
}
