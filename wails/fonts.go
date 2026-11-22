package main

// 用户自定义字体：导入后复制到配置目录 fonts/，由 charactersFS 以 userfonts/ 暴露给
// WebView，前端注入 @font-face 使用。内置字体选项走系统字体，不占安装包体积。

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const maxFontBytes = 40 << 20

var fontExts = map[string]bool{".ttf": true, ".otf": true, ".woff": true, ".woff2": true}

func (a *App) fontsDir() string {
	return filepath.Join(a.userConfigDir(), "fonts")
}

func pickFontFile(ctx context.Context, title, fontLabel, allLabel string) (string, error) {
	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: fontLabel, Pattern: "*.ttf;*.otf;*.woff;*.woff2"},
			{DisplayName: allLabel, Pattern: "*.*"},
		},
	})
}

// 只保留字母、数字、汉字和少量安全符号，避免路径穿越与奇怪的 URL。
func safeFontName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' || r == '.' || unicode.IsSpace(r) {
			b.WriteRune(r)
		}
	}
	s := strings.TrimSpace(b.String())
	s = strings.Join(strings.Fields(s), "-")
	s = strings.Trim(s, ". ")
	if s == "" {
		return ""
	}
	if rs := []rune(s); len(rs) > 48 {
		s = string(rs[:48])
	}
	return s
}

func fontMagicOK(b []byte) bool {
	if len(b) < 4 {
		return false
	}
	switch string(b[:4]) {
	case "wOFF", "wOF2", "OTTO", "true", "typ1":
		return true
	}
	return b[0] == 0 && b[1] == 1 && b[2] == 0 && b[3] == 0
}

func (a *App) fontFileExists(name string) bool {
	if name == "" || name != filepath.Base(name) || strings.Contains(name, "..") {
		return false
	}
	ext := strings.ToLower(filepath.Ext(name))
	if !fontExts[ext] {
		return false
	}
	st, err := os.Stat(filepath.Join(a.fontsDir(), name))
	return err == nil && st.Mode().IsRegular()
}

func (a *App) validFontFamily(v string) bool {
	switch v {
	case "soft", "yahei", "dengxian", "kaiti", "simsun":
		return true
	}
	name, ok := strings.CutPrefix(v, "custom:")
	return ok && a.fontFileExists(name)
}

// ImportFont 弹出文件选择框，校验并复制字体到用户配置目录，返回保存后的文件名。
// 用户取消时返回空字符串。
func (a *App) ImportFont() (string, error) {
	src, err := pickFontFile(a.ctx,
		a.t("选择字体文件", "Choose a font file", "フォントファイルを選択"),
		a.t("字体文件", "Font files", "フォントファイル"),
		a.t("所有文件", "All files", "すべてのファイル"))
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(src) == "" {
		return "", nil
	}
	return a.importFontFile(src)
}

func (a *App) importFontFile(src string) (string, error) {
	ext := strings.ToLower(filepath.Ext(src))
	if !fontExts[ext] {
		return "", errors.New("仅支持 .ttf / .otf / .woff / .woff2 字体")
	}
	st, err := os.Stat(src)
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() || st.Size() <= 0 {
		return "", errors.New("无法读取该字体文件")
	}
	if st.Size() > maxFontBytes {
		return "", fmt.Errorf("字体文件超过 %d MB", maxFontBytes>>20)
	}
	f, err := os.Open(src)
	if err != nil {
		return "", err
	}
	defer f.Close()
	head := make([]byte, 4)
	if _, err := io.ReadFull(f, head); err != nil || !fontMagicOK(head) {
		return "", errors.New("文件不是有效的字体")
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return "", err
	}

	base := safeFontName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src)))
	if base == "" {
		base = "font"
	}
	name := base + ext
	dir := a.fontsDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	tmp := filepath.Join(dir, name+".tmp")
	out, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(out, io.LimitReader(f, maxFontBytes+1))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tmp)
		return "", errors.New("保存字体失败")
	}
	if err := os.Rename(tmp, filepath.Join(dir, name)); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	return name, nil
}
