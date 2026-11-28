package main

// 已安装形象包的清单迁移。
//
// 1.0.1 起清单要求版本号、动作分类、图集参数与英/日翻译；旧版安装的官方形象包
// 没有这些字段，升级应用后会一直停留在旧清单（商店里也没有版本号）。
// 这里把 1.0.1 的官方清单随程序内置，启动时给旧包补齐元数据——只改 manifest.json，
// 不动任何媒体文件，也不需要联网；第三方包不在内置表里，保持原样。

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

//go:embed pack_manifests.json
var packManifestsRaw []byte

var packManifestPatches map[string]CharacterManifest

func loadPackManifestPatches() {
	if packManifestPatches != nil {
		return
	}
	m := map[string]CharacterManifest{}
	if err := json.Unmarshal(packManifestsRaw, &m); err != nil {
		crashLog("pack-migrate", "embedded manifests: "+err.Error())
	}
	packManifestPatches = m
}

func cleanPackRelPath(rel string) (string, bool) {
	rel = strings.TrimSpace(strings.ReplaceAll(rel, "\\", "/"))
	if rel == "" || strings.HasPrefix(rel, "/") || strings.Contains(rel, ":") || path.Clean(rel) != rel {
		return "", false
	}
	if strings.HasPrefix(rel, "../") || rel == ".." {
		return "", false
	}
	return rel, true
}

func packFileExists(dir, rel string) bool {
	clean, ok := cleanPackRelPath(rel)
	if !ok {
		return false
	}
	st, err := os.Stat(filepath.Join(dir, filepath.FromSlash(clean)))
	return err == nil && st.Mode().IsRegular()
}

func hasAllCategories(actions []CharacterAction) bool {
	for _, a := range actions {
		if strings.TrimSpace(a.Category) == "" {
			return false
		}
	}
	return true
}

// migrateInstalledPacks 返回升级的清单数量。只处理内置表里的官方包。
func (a *App) migrateInstalledPacks() int {
	// 多开时多个进程会同时启动；串行化后第二个进程看到的已是迁移过的清单。
	unlock := lockNamed(baseInstanceName() + "-pack-migrate")
	defer unlock()
	loadPackManifestPatches()
	root := a.charactersDir()
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(root, e.Name())
		mp := filepath.Join(dir, "manifest.json")
		raw, err := os.ReadFile(mp)
		if err != nil {
			continue
		}
		var cur CharacterManifest
		if json.Unmarshal(raw, &cur) != nil {
			continue
		}
		id := cur.ID
		if id == "" {
			id = e.Name()
		}
		patch, ok := packManifestPatches[id]
		if !ok {
			continue // 第三方包：不碰
		}
		needsSprite := patch.Sprite != nil && cur.Sprite == nil
		if cur.Version == patch.Version && !needsSprite && hasAllCategories(cur.Actions) {
			continue // 已是 1.0.1
		}

		merged := cur
		merged.ID = id
		if merged.Name == "" {
			merged.Name = patch.Name
		}
		if merged.Description == "" {
			merged.Description = patch.Description
		}
		if merged.License == "" {
			merged.License = patch.License
		}
		if merged.Kind == "" {
			merged.Kind = patch.Kind
		}
		merged.Version = patch.Version
		if merged.Cover == "" && patch.Cover != "" && packFileExists(dir, patch.Cover) {
			merged.Cover = patch.Cover
		}
		if merged.Slots == nil {
			merged.Slots = patch.Slots
		}
		if merged.Dialogue == nil {
			merged.Dialogue = patch.Dialogue
		}
		if merged.I18n == nil {
			merged.I18n = patch.I18n
		}
		if patch.Sprite != nil && packFileExists(dir, patch.Sprite.Sheet) {
			merged.Sprite = patch.Sprite
		}
		// 官方包媒体文件与 1.0.1 一致：文件齐全时直接用新动作表（含分类/时长等），
		// 缺文件则保留本机动作表并补分类。
		allFiles := len(patch.Actions) > 0
		for _, act := range patch.Actions {
			if !packFileExists(dir, act.File) {
				allFiles = false
				break
			}
		}
		if allFiles {
			merged.Actions = patch.Actions
		} else {
			byID := make(map[string]CharacterAction, len(patch.Actions))
			for _, act := range patch.Actions {
				byID[act.ID] = act
			}
			for i := range merged.Actions {
				if merged.Actions[i].Category == "" {
					merged.Actions[i].Category = byID[merged.Actions[i].ID].Category
				}
				if merged.Actions[i].Category == "" {
					merged.Actions[i].Category = "其他"
				}
			}
		}
		if verr := validateManifest(&merged); verr != nil {
			crashLog("pack-migrate", fmt.Sprintf("%s full merge: %v", id, verr))
			// 兜底：只补版本与分类，保持旧动作表
			merged = cur
			merged.ID = id
			merged.Version = patch.Version
			for i := range merged.Actions {
				if merged.Actions[i].Category == "" {
					merged.Actions[i].Category = "其他"
				}
			}
			if verr2 := validateManifest(&merged); verr2 != nil {
				crashLog("pack-migrate", fmt.Sprintf("skip %s: %v", id, verr2))
				continue
			}
		}
		out, err := json.MarshalIndent(merged, "", "  ")
		if err != nil {
			continue
		}
		out = append(out, '\n')
		bak := fmt.Sprintf("%s.bak-%s", mp, time.Now().Format("20060102-150405"))
		_ = os.WriteFile(bak, raw, 0o644)
		tmp := mp + ".tmp"
		if err := os.WriteFile(tmp, out, 0o644); err != nil {
			continue
		}
		if err := os.Rename(tmp, mp); err != nil {
			continue
		}
		n++
	}
	if n > 0 {
		crashLog("pack-migrate", fmt.Sprintf("upgraded %d installed pack manifests to %s", n, "1.0.1"))
	}
	return n
}
