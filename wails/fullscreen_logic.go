package main

import "time"

// 全屏自动避让的滞回状态机。抽成纯逻辑（不碰 Win32），方便单测复现 issue #2
// 的「闪现 → 隐身 → 闪现」循环。
const (
	// 连续两次采样都判定为全屏才隐藏（约 1 秒）：单次采样容易被最大化窗口、
	// 通知弹窗、切换动画误触发。
	fullscreenConfirmTicks = 2
	// 退出全屏后只需再确认一次非全屏即可恢复（隐藏前已在 probeConclusiveFullscreen 里
	// 做过一次严格复核，恢复侧不必再拖 1 秒多，缩短“误藏后消失”的时长）。
	fullscreenClearTicks = 1
	// 退出全屏后只需稳定 0.4 秒就恢复。误判隐藏时用户感知的消失时长 ≈ 确认+这段延迟，
	// 之前 1.2 秒（加两次确认约 2.2 秒）太长。
	fullscreenRestoreDelay = 400 * time.Millisecond
	// 恢复后 4 秒内不再隐藏：边界抖动时桌宠不会每隔一秒闪一次。
	fullscreenRehideDelay = 4 * time.Second
	// 判定记录只保留最近 40 条，够贴 issue，又不会占内存。
	fullscreenLogLimit = 40
)

type fullscreenDecision int

const (
	fsDecisionNone fullscreenDecision = iota
	fsDecisionHide
	fsDecisionRestore
)

type fullscreenHysteresis struct {
	confirmTicks int
	clearTicks   int
	restoreDelay time.Duration
	rehideDelay  time.Duration

	hits       int
	clears     int
	hidden     bool
	clearSince time.Time
	restoredAt time.Time
}

func newFullscreenHysteresis() fullscreenHysteresis {
	return fullscreenHysteresis{
		confirmTicks: fullscreenConfirmTicks,
		clearTicks:   fullscreenClearTicks,
		restoreDelay: fullscreenRestoreDelay,
		rehideDelay:  fullscreenRehideDelay,
	}
}

func (h *fullscreenHysteresis) normalize() {
	if h.confirmTicks <= 0 {
		h.confirmTicks = fullscreenConfirmTicks
	}
	if h.clearTicks <= 0 {
		h.clearTicks = fullscreenClearTicks
	}
	if h.restoreDelay <= 0 {
		h.restoreDelay = fullscreenRestoreDelay
	}
	// 注意用 <=0：App 里的状态机是零值，不会走 newFullscreenHysteresis()
	if h.rehideDelay <= 0 {
		h.rehideDelay = fullscreenRehideDelay
	}
}

// step 采样一次；只有跨过阈值时才返回 Hide / Restore。
func (h *fullscreenHysteresis) step(active bool, now time.Time) fullscreenDecision {
	h.normalize()
	if active {
		h.clears = 0
		h.clearSince = time.Time{}
		if h.hidden {
			// 已经藏起来了，持续命中不需要再动作
			h.hits = h.confirmTicks
			return fsDecisionNone
		}
		h.hits++
		if h.hits < h.confirmTicks {
			return fsDecisionNone
		}
		// 刚恢复不久又判定全屏：先压住，避免边界抖动来回闪
		if !h.restoredAt.IsZero() && now.Sub(h.restoredAt) < h.rehideDelay {
			return fsDecisionNone
		}
		h.hidden = true
		h.hits = h.confirmTicks
		return fsDecisionHide
	}

	h.hits = 0
	if !h.hidden {
		return fsDecisionNone
	}
	h.clears++
	if h.clearSince.IsZero() {
		h.clearSince = now
	}
	if h.clears < h.clearTicks {
		return fsDecisionNone
	}
	if now.Sub(h.clearSince) < h.restoreDelay {
		return fsDecisionNone
	}
	h.hidden = false
	h.clears = 0
	h.clearSince = time.Time{}
	h.restoredAt = now
	return fsDecisionRestore
}

// suppress 用于「启动/手动叫出时前台已经是全屏」：直接进入隐藏态，不要求先攒命中。
func (h *fullscreenHysteresis) suppress() {
	h.normalize()
	h.hidden = true
	h.hits = h.confirmTicks
	h.clears = 0
	h.clearSince = time.Time{}
}

// release 用于关闭避让、手动隐藏/显示后同步状态：清空滞回计数。
func (h *fullscreenHysteresis) release() {
	h.normalize()
	h.hidden = false
	h.hits = 0
	h.clears = 0
	h.clearSince = time.Time{}
}

// pause 用于面板打开 / 拖拽中：保留隐藏态，但不累计命中。
func (h *fullscreenHysteresis) pause() {
	h.hits = 0
	h.clears = 0
	h.clearSince = time.Time{}
}
