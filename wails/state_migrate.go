package main

// 状态文件 schema 版本与迁移链。
// 旧文件没有 schemaVersion 字段，一律视为 v1；新安装直接是当前版本。
const currentStateSchema = 2

// migrateState 把状态迁移到 currentStateSchema，并清掉历史上的布尔迁移标记。
// 返回 true 表示内容有变化，调用方应尽快落盘。
func migrateState(st map[string]interface{}) bool {
	if st == nil {
		return false
	}
	version := 1
	if v := int(numOr(st["schemaVersion"], 0)); v > 0 {
		version = v
	} else {
		st["schemaVersion"] = 1
	}
	// 文件比程序新：不做降级迁移，原样保留
	if version > currentStateSchema {
		return false
	}

	changed := false
	for version < currentStateSchema {
		switch version {
		case 1:
			if migrateStateV1ToV2(st) {
				changed = true
			}
			version = 2
		default:
			version = currentStateSchema
		}
	}
	if int(numOr(st["schemaVersion"], 0)) != currentStateSchema {
		st["schemaVersion"] = currentStateSchema
		changed = true
	}
	for _, key := range []string{"scale85", "autoAction40", "highPriority", "planQuota", "warnMonth", "warnTier"} {
		if _, ok := st[key]; ok {
			delete(st, key)
			changed = true
		}
	}
	// Qoder 本地 credits 来源已移除，旧值迁到默认的 API 来源
	if v, ok := st["ledgerSource"]; ok {
		src, _ := v.(string)
		if apiProviders[src].label == "" {
			st["ledgerSource"] = "deepseek"
			changed = true
		}
	}
	return changed
}

// v1 → v2：
// - 旧默认尺寸 100% 改为 85%（只对从未迁移过的文件）
// - 自动动作默认间隔 20 秒改为 40 秒
// 标记位只用于判断是否已经迁移过，迁移完成后由 migrateState 删除。
func migrateStateV1ToV2(st map[string]interface{}) bool {
	changed := false
	if _, done := st["scale85"].(bool); !done {
		f, ok := st["scale"].(float64)
		if !ok || (f > 0.9999 && f < 1.0001) {
			st["scale"] = 0.85
			changed = true
		}
	}
	if _, done := st["autoAction40"].(bool); !done {
		if numOr(st["autoActionSec"], 0) == 20 {
			st["autoActionSec"] = 40
			changed = true
		}
	}
	return changed
}
