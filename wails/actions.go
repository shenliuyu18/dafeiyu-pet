package main

import (
	"fmt"
	"time"
)

func (a *App) Action(name string) {
	switch name {
	case "feed":
		a.doFeed()
	case "pomodoro":
		a.mu.Lock()
		running := a.pomo.running
		a.mu.Unlock()
		if running {
			a.stopPomodoro()
			a.emit("bubble", "专注先停一下～")
		} else {
			a.startPomodoro()
		}
	case "sleep":
		a.mu.Lock()
		awake := boolv(a.state["awake"], true)
		a.mu.Unlock()
		a.setAwake(!awake)
	case "status":
		a.emit("show-status", nil)
	case "usage":
		if !a.ledgerOn() {
			return
		}
		l := a.refreshUsage()
		a.emit("show-usage", l)
	case "hide":
		a.hideWindow()
	case "quit":
		a.Quit()
	}
}

func (a *App) doFeed() {
	if !a.windowVisible() {
		a.showInactive()
	}
	a.mu.Lock()
	a.state["satiety"] = clampF(numOr(a.state["satiety"], 78)+22, 0, 100)
	a.state["mood"] = clampF(numOr(a.state["mood"], 82)+8, 0, 100)
	a.state["awake"] = true
	sati := int(mathRound(numOr(a.state["satiety"], 78)))
	mood := int(mathRound(numOr(a.state["mood"], 82)))
	a.mu.Unlock()
	a.saveState()
	a.emit("awake", true)
	a.emit("feed", map[string]interface{}{"satiety": sati, "mood": mood})
	a.trayRefresh()
}

func (a *App) setAwake(v bool) {
	a.mu.Lock()
	if boolv(a.state["awake"], true) == v {
		a.mu.Unlock()
		return
	}
	a.state["awake"] = v
	a.mu.Unlock()
	a.saveState()
	a.emit("awake", v)
}

func (a *App) startPomodoro() {
	a.setAwake(true)
	stop := make(chan struct{})
	a.mu.Lock()
	if a.pomo.running {
		a.mu.Unlock()
		return
	}
	a.pomo.running = true
	a.pomo.endsAt = time.Now().Add(time.Duration(a.pomoMinutesLocked()) * time.Minute)
	a.pomo.stop = stop
	a.mu.Unlock()
	a.emit("pomodoro", map[string]interface{}{"running": true, "remaining": time.Duration(a.pomoMinutes()) * time.Minute / time.Millisecond})
	a.trayRefresh()
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				a.mu.Lock()
				if !a.pomo.running {
					a.mu.Unlock()
					return
				}
				left := time.Until(a.pomo.endsAt)
				a.mu.Unlock()
				if left < 0 {
					left = 0
				}
				a.emit("pomodoro", map[string]interface{}{"running": true, "remaining": left.Milliseconds()})
				a.trayRefresh()
				if left <= 0 {
					a.finishPomodoro()
					return
				}
			}
		}
	}()
}

func (a *App) stopPomodoro() {
	a.mu.Lock()
	if !a.pomo.running {
		a.mu.Unlock()
		return
	}
	a.pomo.running = false
	if a.pomo.stop != nil {
		close(a.pomo.stop)
		a.pomo.stop = nil
	}
	a.mu.Unlock()
	a.emit("pomodoro", map[string]interface{}{"running": false, "remaining": 0})
	a.trayRefresh()
}

func (a *App) finishPomodoro() {
	a.mu.Lock()
	if !a.pomo.running {
		a.mu.Unlock()
		return
	}
	a.pomo.running = false
	if a.pomo.stop != nil {
		close(a.pomo.stop)
		a.pomo.stop = nil
	}
	a.mu.Unlock()
	a.emit("pomodoro", map[string]interface{}{"running": false, "remaining": 0})
	a.emit("pomodoro-done", nil)
	a.balloon("done", appName(), "专注时间结束啦，起来动一动吧！")
	a.trayRefresh()
}

func (a *App) pomoMinutes() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.pomoMinutesLocked()
}

func (a *App) pomoTooltip() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.pomo.running {
		return appName()
	}
	left := time.Until(a.pomo.endsAt)
	if left < 0 {
		left = 0
	}
	total := int(left / time.Second)
	return fmt.Sprintf("%s · 专注中 %02d:%02d", appName(), total/60, total%60)
}
