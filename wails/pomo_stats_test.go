package main

import "testing"

func TestPomoStats(t *testing.T) {
	a := &App{state: defaultState()}
	a.recordPomodoro(25)
	a.recordPomodoro(15)
	s := a.PomoStats()
	if s["today"] != 40.0 || s["week"] != 40.0 || s["total"] != 40.0 {
		t.Fatalf("stats mismatch: %#v", s)
	}
	days, _ := s["days"].([]interface{})
	if len(days) != 7 {
		t.Fatalf("days = %d", len(days))
	}
	last, _ := days[6].(map[string]interface{})
	if last["today"] != true || last["minutes"] != 40.0 {
		t.Fatalf("today bucket: %#v", last)
	}
}

func TestPomoStatsEmpty(t *testing.T) {
	a := &App{state: defaultState()}
	s := a.PomoStats()
	if s["today"] != 0.0 || s["total"] != 0.0 {
		t.Fatalf("empty stats should be zero: %#v", s)
	}
	if days, _ := s["days"].([]interface{}); len(days) != 7 {
		t.Fatalf("days = %d", len(days))
	}
}

func TestRecordPomodoroIgnoresNonPositive(t *testing.T) {
	a := &App{state: defaultState()}
	a.recordPomodoro(0)
	a.recordPomodoro(-5)
	s := a.PomoStats()
	if s["total"] != 0.0 {
		t.Fatalf("non-positive minutes recorded: %#v", s)
	}
}
