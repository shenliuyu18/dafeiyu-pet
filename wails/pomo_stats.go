package main

import "time"

// recordPomodoro 把一次完成的专注记到当天；历史只保留最近 90 个有记录的日期。
func (a *App) recordPomodoro(minutes int) {
	if minutes <= 0 {
		return
	}
	day := time.Now().Format("2006-01-02")
	a.mu.Lock()
	raw, _ := a.state["pomoHistory"].([]interface{})
	hist := make([]interface{}, 0, len(raw)+1)
	found := false
	for _, item := range raw {
		m, ok := item.(map[string]interface{})
		if !ok || str(m["date"], "") == "" {
			continue
		}
		if str(m["date"], "") == day {
			m["minutes"] = numOr(m["minutes"], 0) + float64(minutes)
			found = true
		}
		hist = append(hist, m)
	}
	if !found {
		hist = append(hist, map[string]interface{}{"date": day, "minutes": float64(minutes)})
	}
	if len(hist) > 90 {
		hist = hist[len(hist)-90:]
	}
	a.state["pomoHistory"] = hist
	a.stateDirty = true
	a.mu.Unlock()
	a.saveState()
}

// PomoStats 返回今天 / 近 7 天 / 累计的专注分钟数，以及最近 7 天的每日柱状数据。
func (a *App) PomoStats() map[string]interface{} {
	byDate := map[string]float64{}
	a.mu.Lock()
	raw, _ := a.state["pomoHistory"].([]interface{})
	a.mu.Unlock()
	var total float64
	for _, item := range raw {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		d := str(m["date"], "")
		if d == "" {
			continue
		}
		v := numOr(m["minutes"], 0)
		byDate[d] += v
		total += v
	}

	now := time.Now()
	weekdays := []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	days := make([]interface{}, 0, 7)
	var week float64
	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		key := d.Format("2006-01-02")
		v := byDate[key]
		week += v
		days = append(days, map[string]interface{}{
			"date":    key,
			"label":   d.Format("01-02"),
			"weekday": weekdays[int(d.Weekday())],
			"minutes": round1(v),
			"today":   i == 0,
		})
	}
	return map[string]interface{}{
		"today": round1(byDate[now.Format("2006-01-02")]),
		"week":  round1(week),
		"total": round1(total),
		"days":  days,
	}
}
