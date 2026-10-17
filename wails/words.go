package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

const (
	maxWordLines = 20
	maxWordRunes = 40
)

type wordNode struct {
	children map[rune]*wordNode
	term     string
}

type WordsFilter struct {
	root  *wordNode
	count int
	ready bool
}

func NewWordsFilter(data []byte) *WordsFilter {
	w := &WordsFilter{root: &wordNode{children: map[rune]*wordNode{}}}
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		t := normalizeWord(line)
		r := []rune(t)
		if len(r) < 2 {
			continue
		}
		n := w.root
		for _, ch := range r {
			if n.children == nil {
				n.children = map[rune]*wordNode{}
			}
			if n.children[ch] == nil {
				n.children[ch] = &wordNode{}
			}
			n = n.children[ch]
		}
		if n.term == "" {
			n.term = t
			w.count++
		}
	}
	w.ready = w.count > 0
	return w
}

func normalizeWord(s string) string {
	s = norm.NFKC.String(strings.ToLower(s))
	var b strings.Builder
	for _, r := range s {
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) || unicode.IsControl(r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (w *WordsFilter) scan(text string) []string {
	if w == nil || !w.ready {
		return nil
	}
	runes := []rune(normalizeWord(text))
	hits := map[string]bool{}
	for i := range runes {
		n := w.root
		for j := i; j < len(runes); j++ {
			n = n.children[runes[j]]
			if n == nil {
				break
			}
			if n.term != "" {
				hits[n.term] = true
			}
		}
	}
	out := make([]string, 0, len(hits))
	for t := range hits {
		out = append(out, t)
	}
	return out
}

func maskWord(term string) string {
	r := []rune(term)
	if len(r) == 0 {
		return ""
	}
	return string(r[0]) + strings.Repeat("＊", len(r)-1)
}

func cleanupLine(s string) string {
	var b strings.Builder
	for _, r := range s {
		if unicode.IsControl(r) || r == '\ufeff' || (r >= '\u200b' && r <= '\u200f') || (r >= '\u202a' && r <= '\u202e') {
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

func (w *WordsFilter) Sanitize(lines []string) ([]string, error) {
	if w == nil || !w.ready {
		return nil, errors.New("敏感词库未加载，暂时无法保存自定义文字")
	}
	out := make([]string, 0, len(lines))
	bad := make([]string, 0)
	lineNo := 0
	for _, raw := range lines {
		line := cleanupLine(raw)
		if line == "" {
			continue
		}
		lineNo++
		if len([]rune(line)) > maxWordRunes {
			return nil, fmt.Errorf("第 %d 行超过 %d 个字", lineNo, maxWordRunes)
		}
		if hits := w.scan(line); len(hits) > 0 {
			masked := make([]string, 0, 3)
			for i, h := range hits {
				if i >= 3 {
					break
				}
				masked = append(masked, maskWord(h))
			}
			bad = append(bad, fmt.Sprintf("第 %d 行包含敏感词：%s", lineNo, strings.Join(masked, "、")))
			continue
		}
		exists := false
		for _, x := range out {
			if x == line {
				exists = true
				break
			}
		}
		if !exists {
			out = append(out, line)
		}
		if len(out) > maxWordLines {
			return nil, fmt.Errorf("最多保存 %d 行", maxWordLines)
		}
	}
	if len(bad) > 0 {
		return nil, errors.New(strings.Join(bad, "；"))
	}
	return out, nil
}

func (a *App) WordsInfo() map[string]interface{} {
	a.mu.Lock()
	lines := toStrings(a.state["customQuips"])
	use := boolv(a.state["useCustomQuips"], true)
	a.mu.Unlock()
	return map[string]interface{}{
		"lines":    lines,
		"use":      use,
		"maxLines": maxWordLines,
		"maxLen":   maxWordRunes,
	}
}

func (a *App) WordsSave(raw string) map[string]interface{} {
	var lines []string
	if err := json.Unmarshal([]byte(raw), &lines); err != nil {
		return map[string]interface{}{"ok": false, "error": "自定义文字格式不正确"}
	}
	cleaned, err := a.words.Sanitize(lines)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	a.mu.Lock()
	a.state["customQuips"] = cleaned
	a.state["useCustomQuips"] = len(cleaned) > 0
	payload := map[string]interface{}{
		"customQuips":    cleaned,
		"useCustomQuips": len(cleaned) > 0,
	}
	a.mu.Unlock()
	a.saveState()
	a.emit("words-updated", payload)
	return map[string]interface{}{"ok": true, "count": len(cleaned), "customQuips": cleaned, "useCustomQuips": len(cleaned) > 0}
}
