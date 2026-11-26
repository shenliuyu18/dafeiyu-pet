package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 临时校验：characters-build/packs-content 下的每个包都要能通过安装期校验
func TestStagedStagedPacksValidation(t *testing.T) {
	dir := filepath.Join("..", "characters-build", "packs-content")
	if _, err := os.Stat(dir); err != nil {
		t.Skip("未生成 characters-build/packs-content，先运行 tools/build-pack-content.py")
	}
	zips, err := filepath.Glob(filepath.Join(dir, "*.zip"))
	if err != nil || len(zips) == 0 {
		t.Fatalf("找不到候选包：%v", err)
	}
	for _, zp := range zips {
		prefix, _, m, err := inspectPackZip(zp)
		if err != nil {
			t.Fatalf("%s: %v", filepath.Base(zp), err)
		}
		if err := validateManifest(m); err != nil {
			t.Fatalf("%s: %v", filepath.Base(zp), err)
		}
		zr, err := zip.OpenReader(zp)
		if err != nil {
			t.Fatalf("%s: %v", filepath.Base(zp), err)
		}
		names := map[string]bool{}
		for _, f := range zr.File {
			names[prefix+strings.ReplaceAll(f.Name, "\\", "/")] = true
		}
		zr.Close()
		need := []string{prefix + m.Cover}
		for _, a := range m.Actions {
			need = append(need, prefix+a.File)
		}
		if m.Dialogue != nil {
			for _, mem := range m.Dialogue.Memes {
				need = append(need, prefix+mem.File)
			}
		}
		if m.Sprite != nil {
			need = append(need, prefix+m.Sprite.Sheet)
		}
		for _, n := range need {
			if !names[n] {
				t.Fatalf("%s: 缺少条目 %s", filepath.Base(zp), n)
			}
		}
		if st, err := os.Stat(zp); err != nil || st.Size() == 0 {
			t.Fatalf("%s: 文件为空", filepath.Base(zp))
		}
	}
}
