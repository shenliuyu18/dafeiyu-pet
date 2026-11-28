package main

// 形象包（按需下载的角色）：默认只内置大肥鱼，其余角色以 zip 形式下载到用户目录，
// 由 charactersFS 覆盖到内嵌资源之上——引擎侧不需要知道资源来自哪个包。

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// StringList 允许清单里写成 "动作名" 或 ["动作A","动作B"]
type StringList []string

func (s *StringList) UnmarshalJSON(b []byte) error {
	var one string
	if err := json.Unmarshal(b, &one); err == nil {
		*s = StringList{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(b, &many); err != nil {
		return err
	}
	*s = many
	return nil
}

// CharacterAction 是 manifest 里的单条动作
type CharacterAction struct {
	ID         string `json:"id"`
	Category   string `json:"category"`
	File       string `json:"file"`
	Frames     int    `json:"frames"`
	FPS        int    `json:"fps"`
	DurationMs int    `json:"durationMs"`
	HasAudio   bool   `json:"hasAudio"`
}

// DialogueMeme 是包内梗图：按场景触发，文案随图一起放在包里。
type DialogueMeme struct {
	File   string   `json:"file"`
	Scenes []string `json:"scenes"`
	Text   string   `json:"text"`
}

// CharacterDialogue 是形象包自带的台词与人设，未下载时应用里不保留任何内容。
type CharacterDialogue struct {
	Intro  string         `json:"intro"`
	Quips  []string       `json:"quips"`
	Feed   []string       `json:"feed"`
	Hungry []string       `json:"hungry"`
	Sleep  []string       `json:"sleep"`
	Memes  []DialogueMeme `json:"memes"`
}

// CharacterLocale 是包内台词/动作名/分类的某一语言译文，键为中文原文。
type CharacterLocale struct {
	Lines      map[string]string `json:"lines"`
	Actions    map[string]string `json:"actions"`
	Categories map[string]string `json:"categories"`
}

// SpriteSequence 是图集里的一套帧序列。
type SpriteSequence struct {
	Row   int   `json:"row"`
	Count int   `json:"count"`
	Times []int `json:"times"`
	Frame int   `json:"frame"`
}

type SpriteAction struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// SpriteSpec 让图集类形象把排版参数放在包内，而不是写死在应用代码里。
type SpriteSpec struct {
	Sheet     string                    `json:"sheet"`
	CellW     int                       `json:"cellW"`
	CellH     int                       `json:"cellH"`
	Cols      int                       `json:"cols"`
	Rows      int                       `json:"rows"`
	Sequences map[string]SpriteSequence `json:"sequences"`
	Map       map[string]string         `json:"map"`
	Actions   []SpriteAction            `json:"actions"`
}

// CharacterManifest 是形象包自带的元信息（包内 manifest.json）
type CharacterManifest struct {
	SchemaVersion int                        `json:"schemaVersion"`
	ID            string                     `json:"id"`
	SourcePackID  string                     `json:"sourcePackId"`
	Kind          string                     `json:"kind"`
	Name          string                     `json:"name"`
	Version       string                     `json:"version"`
	Author        string                     `json:"author"`
	Description   string                     `json:"description"`
	Cover         string                     `json:"cover"`
	Source        string                     `json:"source"`
	License       string                     `json:"license"`
	MinAppVersion string                     `json:"minAppVersion"`
	Homepage      string                     `json:"homepage"`
	Tags          []string                   `json:"tags"`
	UpdatedAt     string                     `json:"updatedAt"`
	Slots         map[string]StringList      `json:"slots"`
	Actions       []CharacterAction          `json:"actions"`
	Dialogue      *CharacterDialogue         `json:"dialogue,omitempty"`
	I18n          map[string]CharacterLocale `json:"i18n,omitempty"`
	Sprite        *SpriteSpec                `json:"sprite,omitempty"`
}

// InstalledCharacter 是回给前端的精简结构
type InstalledCharacter struct {
	ID            string                     `json:"id"`
	Name          string                     `json:"name"`
	Version       string                     `json:"version"`
	Author        string                     `json:"author"`
	Desc          string                     `json:"description"`
	License       string                     `json:"license"`
	Cover         string                     `json:"cover"` // 相对 URL，前端可直接 img src
	MinAppVersion string                     `json:"minAppVersion"`
	Homepage      string                     `json:"homepage"`
	Tags          []string                   `json:"tags"`
	UpdatedAt     string                     `json:"updatedAt"`
	Slots         map[string]StringList      `json:"slots"`
	Actions       []CharacterAction          `json:"actions"`
	Dialogue      *CharacterDialogue         `json:"dialogue,omitempty"`
	I18n          map[string]CharacterLocale `json:"i18n,omitempty"`
	Sprite        *SpriteSpec                `json:"sprite,omitempty"`
	Bytes         int64                      `json:"bytes"`
	Category      []string                   `json:"categories"` // 去重后的分类
}

func (a *App) userConfigDir() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = os.Getenv("APPDATA")
	}
	return filepath.Join(dir, appDataDirName())
}

func (a *App) charactersDir() string {
	return filepath.Join(a.userConfigDir(), "characters")
}

// charactersFS 把用户目录下的形象包叠到内嵌资源之上：
// characters/<id>/xxx 优先读磁盘，读不到再回落到 assets.zip。
type charactersFS struct {
	primary fs.FS
	overlay fs.FS
}

func (c *charactersFS) Open(name string) (fs.File, error) {
	clean := strings.TrimPrefix(strings.ReplaceAll(name, "\\", "/"), "/")
	if c.overlay != nil {
		if strings.HasPrefix(clean, "characters/") {
			if f, err := c.overlay.Open(clean); err == nil {
				return f, nil
			}
		}
		// 用户导入的字体：/userfonts/x.ttf 实际读配置目录下的 fonts/x.ttf
		if rest, ok := strings.CutPrefix(clean, "userfonts/"); ok && rest != "" && !strings.Contains(rest, "..") {
			if f, err := c.overlay.Open("fonts/" + rest); err == nil {
				return f, nil
			}
		}
	}
	return c.primary.Open(name)
}

// loadInstalledCharacter 读取某个已安装包的 manifest
func (a *App) loadInstalledCharacter(id string) (*CharacterManifest, error) {
	if id == "" || strings.ContainsAny(id, `/\`) || strings.Contains(id, "..") {
		return nil, errors.New("非法的形象 id")
	}
	p := filepath.Join(a.charactersDir(), id, "manifest.json")
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	var m CharacterManifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	if m.ID == "" {
		m.ID = id
	}
	return &m, nil
}

// healSelectedCharacter 启动自检：选中的形象包已删除 / 清单损坏时回落到大肥鱼，避免启动后一片空白。
func (a *App) healSelectedCharacter() {
	a.mu.Lock()
	id := str(a.state["character"], "")
	a.mu.Unlock()
	if !strings.HasPrefix(id, "pack:") {
		return
	}
	pid := strings.TrimPrefix(id, "pack:")
	if m, err := a.loadInstalledCharacter(pid); err == nil && validateManifest(m) == nil {
		return
	}
	a.mu.Lock()
	a.state["character"] = "v1"
	a.stateDirty = true
	a.mu.Unlock()
	a.saveState()
	a.balloon("error", a.displayName(), a.t("形象包读取失败，已切回大肥鱼；可在设置里重新下载", "Failed to load the character pack. Switched back to the big fish; you can download it again in Settings.", "キャラクターパックの読み込みに失敗しました。大肥魚に戻しました。設定から再ダウンロードできます。"))
	crashLog("character-heal", id+" -> v1")
}

// ListInstalledCharacters 供前端启动时拉取：已安装的形象包 + 动作表
func (a *App) ListInstalledCharacters() []InstalledCharacter {
	out := []InstalledCharacter{}
	entries, err := os.ReadDir(a.charactersDir())
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		m, err := a.loadInstalledCharacter(e.Name())
		if err != nil {
			continue
		}
		seen := map[string]bool{}
		cats := []string{}
		var size int64
		for _, act := range m.Actions {
			if act.Category != "" && !seen[act.Category] {
				seen[act.Category] = true
				cats = append(cats, act.Category)
			}
			if st, err := os.Stat(filepath.Join(a.charactersDir(), m.ID, act.File)); err == nil {
				size += st.Size()
			}
		}
		cover := ""
		if m.Cover != "" {
			cover = fmt.Sprintf("../characters/%s/%s", m.ID, m.Cover)
		}
		out = append(out, InstalledCharacter{
			ID: m.ID, Name: m.Name, Version: m.Version, Author: m.Author,
			Desc: m.Description, License: m.License,
			MinAppVersion: m.MinAppVersion, Homepage: m.Homepage, Tags: m.Tags, UpdatedAt: m.UpdatedAt,
			Cover: cover, Slots: m.Slots, Actions: m.Actions, Bytes: size, Category: cats,
			Dialogue: m.Dialogue, I18n: m.I18n, Sprite: m.Sprite,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

var errPackBusy = errors.New("形象包正在使用，请先切换到其他形象再更新")

type characterLock struct {
	mu    sync.Mutex
	users int
}

// lockCharacter 只短暂持有 map 锁；下载和解压期间仅占用该 id 的锁。
func (a *App) lockCharacter(id string) func() {
	a.characterLocksMu.Lock()
	if a.characterLocks == nil {
		a.characterLocks = make(map[string]*characterLock)
	}
	lock := a.characterLocks[id]
	if lock == nil {
		lock = &characterLock{}
		a.characterLocks[id] = lock
	}
	lock.users++
	a.characterLocksMu.Unlock()

	lock.mu.Lock()
	return func() {
		lock.mu.Unlock()
		a.characterLocksMu.Lock()
		lock.users--
		if lock.users == 0 {
			delete(a.characterLocks, id)
		}
		a.characterLocksMu.Unlock()
	}
}

// InstallCharacter 下载 zip 并解压到 characters/<id>/。
// url 由前端从远程索引里取，下载前会在直连与内置加速镜像中探测最快线路。
func (a *App) InstallCharacter(id, url string) error {
	if id == "" || strings.ContainsAny(id, `/\`) || strings.Contains(id, "..") {
		return errors.New("非法的形象 id")
	}
	unlock := a.lockCharacter(id)
	defer unlock()
	canonical := stripMirror(url)
	var lastErr error
	for _, prefix := range rankMirrors(canonical) {
		if err := a.downloadAndInstall(id, prefix+canonical); err != nil {
			if errors.Is(err, errPackBusy) {
				return err
			}
			lastErr = err
			continue
		}
		broadcast("reload-characters")
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("没有可用的下载线路")
	}
	return lastErr
}

func (a *App) downloadAndInstall(id, url string) error {
	return a.downloadAndInstallWithLimit(id, url, maxPackBytes)
}

func (a *App) downloadAndInstallWithLimit(id, url string, limit int64) error {
	root := a.charactersDir()
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	tmpZip := filepath.Join(root, id+".zip.part")
	defer os.Remove(tmpZip)

	resp, err := packHTTPClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("下载失败 HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > limit {
		return fmt.Errorf("下载体积超过 %d 字节上限", limit)
	}
	f, err := os.Create(tmpZip)
	if err != nil {
		return err
	}
	total := resp.ContentLength
	var written int64
	buf := make([]byte, 256<<10)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if int64(n) > limit-written {
				f.Close()
				return fmt.Errorf("下载体积超过 %d 字节上限", limit)
			}
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				return werr
			}
			written += int64(n)
			if total > 0 {
				a.emit("character-progress", map[string]interface{}{
					"id": id, "downloaded": written, "total": total,
				})
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return rerr
		}
	}
	f.Close()

	packID, prefix, m, err := inspectPackZip(tmpZip)
	if err != nil {
		return err
	}
	if packID != id {
		return fmt.Errorf("包内 id「%s」与目录 id「%s」不一致", packID, id)
	}
	if err := validateManifest(m); err != nil {
		return fmt.Errorf("manifest.json 不符合形象包标准：%w", err)
	}
	if err := a.extractPack(id, tmpZip, prefix); err != nil {
		return err
	}
	return nil
}

// InstallCharacterFromFile 从本地 zip 安装（形象商店的「导入」按钮走这条路）
func (a *App) InstallCharacterFromFile(zipPath string) (string, error) {
	id, prefix, m, err := inspectPackZip(zipPath)
	if err != nil {
		return "", err
	}
	if err := validateUserImport(m); err != nil {
		return "", fmt.Errorf("manifest.json 不符合形象包标准：%w", err)
	}
	unlock := a.lockCharacter(id)
	defer unlock()
	if err := a.extractPack(id, zipPath, prefix); err != nil {
		return "", err
	}
	broadcast("reload-characters")
	return id, nil
}

var packIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,31}$`)

// 这些 id 已经被内置形象/官方包占用，用户自制包不能覆盖
var reservedPackIDs = map[string]bool{
	"v1": true, "v2": true, "v3": true, "v4": true, "v5": true, "v6": true,
	"gpt": true, "gptv1": true, "dsh1": true,
}

var packSlotNames = map[string]bool{
	"idle": true, "click": true, "feed": true, "sleep": true, "drag": true,
	"sad": true, "happy": true, "work": true, "money": true, "move": true,
}

// 梗图可以在这些场景触发，与前端 sayScene 的取值保持一致
var memeScenes = map[string]bool{
	"click": true, "feed": true, "hungry": true, "sleep": true,
	"ledger": true, "work": true, "error": true, "happy": true,
}

const (
	maxDialogueLines = 300
	maxDialogueRunes = 300
	maxMemeItems     = 100
	maxSpriteCell    = 4096
)

const (
	maxPackEntries = 4000
	maxPackBytes   = int64(2) << 30
)

func cleanPackRel(name string) (string, bool) {
	n := strings.TrimSpace(strings.ReplaceAll(name, "\\", "/"))
	if n == "" || strings.Contains(n, ":") {
		return "", false
	}
	n = path.Clean(n)
	if n == "." || n == ".." || path.IsAbs(n) || strings.HasPrefix(n, "../") {
		return "", false
	}
	return n, true
}

func isImageFile(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".webp", ".png", ".jpg", ".jpeg":
		return true
	}
	return false
}

// safeJoin 在 cleanPackRel 之外再做一次落盘前的包含性检查
func safeJoin(base, rel string) (string, error) {
	dst := filepath.Join(base, filepath.FromSlash(rel))
	r, err := filepath.Rel(base, dst)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(os.PathSeparator)) {
		return "", errors.New("zip 内含非法路径")
	}
	return dst, nil
}

// validateManifest 只校验清单本身，不读磁盘；导入和远程下载共用
func validateManifest(m *CharacterManifest) error {
	if m.SchemaVersion != 1 {
		return fmt.Errorf("schemaVersion 必须是 1（当前 %d）", m.SchemaVersion)
	}
	if m.MinAppVersion != "" && cmpVersion(Version, m.MinAppVersion) < 0 {
		return fmt.Errorf("需要应用 %s 或更高版本（当前 %s）", m.MinAppVersion, Version)
	}
	if !packIDPattern.MatchString(m.ID) {
		return fmt.Errorf("id 需为 2–32 位小写字母/数字/-/_，且以字母或数字开头（当前 %q）", m.ID)
	}
	if strings.TrimSpace(m.Name) == "" {
		return errors.New("缺少 name")
	}
	if utf8.RuneCountInString(m.Name) > 60 {
		return errors.New("name 最多 60 个字")
	}
	if _, ok := cleanPackRel(m.Cover); !ok {
		return errors.New("cover 必须是包内相对路径，例如 cover.webp")
	}
	if !isImageFile(m.Cover) {
		return errors.New("cover 只支持 .webp/.png/.jpg")
	}
	if len(m.Actions) == 0 {
		return errors.New("actions 不能为空")
	}
	if len(m.Actions) > 500 {
		return errors.New("actions 最多 500 条")
	}
	seen := map[string]bool{}
	for i := range m.Actions {
		a := &m.Actions[i]
		a.ID = strings.TrimSpace(a.ID)
		if a.ID == "" {
			return fmt.Errorf("第 %d 条动作缺少 id", i+1)
		}
		if utf8.RuneCountInString(a.ID) > 60 {
			return fmt.Errorf("动作 id 过长：%s", a.ID)
		}
		if seen[a.ID] {
			return fmt.Errorf("动作 id 重复：%s", a.ID)
		}
		seen[a.ID] = true
		if _, ok := cleanPackRel(a.File); !ok {
			return fmt.Errorf("动作「%s」的 file 必须是包内相对路径", a.ID)
		}
		switch strings.ToLower(path.Ext(a.File)) {
		case ".webm":
		case ".webp":
			// 只有官方图集包（kind=sprite，gptv1）用单张 spritesheet
			if m.Kind != "sprite" {
				return fmt.Errorf("动作「%s」只支持 .webm 透明视频（图集形象请把 kind 设为 sprite）", a.ID)
			}
		default:
			return fmt.Errorf("动作「%s」只支持 .webm 透明视频或 .webp 图集（当前 %s）", a.ID, path.Ext(a.File))
		}
	}
	for name, list := range m.Slots {
		if !packSlotNames[name] {
			return fmt.Errorf("未知槽位 %q（可用：idle/click/feed/sleep/drag/sad/happy/work/money/move）", name)
		}
		if len(list) == 0 {
			return fmt.Errorf("槽位 %s 不能为空", name)
		}
		for _, id := range list {
			if !seen[id] {
				return fmt.Errorf("槽位 %s 引用了不存在的动作 %q", name, id)
			}
		}
	}
	if err := validateSprite(m); err != nil {
		return err
	}
	if err := validateDialogue(m); err != nil {
		return err
	}
	return nil
}

func checkDialogueText(label, s string, allowEmpty bool) error {
	line := strings.TrimSpace(s)
	if line == "" {
		if allowEmpty {
			return nil
		}
		return fmt.Errorf("%s 不能为空", label)
	}
	if utf8.RuneCountInString(line) > maxDialogueRunes {
		return fmt.Errorf("%s 最多 %d 个字", label, maxDialogueRunes)
	}
	return nil
}

func validateSprite(m *CharacterManifest) error {
	if m.Kind == "sprite" && m.Sprite == nil {
		return errors.New("kind=sprite 的包必须提供 sprite 图集配置")
	}
	if m.Kind != "sprite" && m.Sprite != nil {
		return errors.New("sprite 图集配置只用于 kind=sprite 的包")
	}
	s := m.Sprite
	if s == nil {
		return nil
	}
	sheet, ok := cleanPackRel(s.Sheet)
	if !ok {
		return errors.New("sprite.sheet 必须是包内相对路径")
	}
	if !isImageFile(sheet) {
		return errors.New("sprite.sheet 只支持 .webp/.png/.jpg")
	}
	s.Sheet = sheet
	if s.CellW <= 0 || s.CellH <= 0 || s.CellW > maxSpriteCell || s.CellH > maxSpriteCell {
		return errors.New("sprite 单元格尺寸不合法")
	}
	if s.Cols <= 0 || s.Rows <= 0 || s.Cols > 64 || s.Rows > 64 {
		return errors.New("sprite 行列数必须在 1–64 之间")
	}
	if len(s.Sequences) == 0 {
		return errors.New("sprite.sequences 不能为空")
	}
	for key, seq := range s.Sequences {
		if key == "" {
			return errors.New("sprite 序列名不能为空")
		}
		if seq.Row < 0 || seq.Row >= s.Rows {
			return fmt.Errorf("序列 %s 的行号超出范围", key)
		}
		if seq.Count <= 0 || seq.Count > 64 {
			return fmt.Errorf("序列 %s 的帧数必须在 1–64 之间", key)
		}
		if len(seq.Times) != seq.Count {
			return fmt.Errorf("序列 %s 的 times 数量应与 count 一致", key)
		}
		for _, t := range seq.Times {
			if t <= 0 || t > 60000 {
				return fmt.Errorf("序列 %s 的帧间隔不合法", key)
			}
		}
		// frame 是行内起始列（可从 count 之外的列起播，用于单帧定格），不是 count 的偏移
		if seq.Frame < 0 || seq.Frame >= s.Cols {
			return fmt.Errorf("序列 %s 的起始帧超出图集列数", key)
		}
	}
	for _, need := range []string{"idle", "waiting"} {
		if _, ok := s.Sequences[need]; !ok {
			return fmt.Errorf("sprite 缺少必需的序列 %s", need)
		}
	}
	for name, seq := range s.Map {
		if strings.TrimSpace(name) == "" {
			return errors.New("sprite.map 的动作名不能为空")
		}
		if _, ok := s.Sequences[seq]; !ok {
			// 前端把 run 按朝向拆成 runLeft/runRight，映射表里保留这个虚拟动作别名
			_, hasL := s.Sequences["runLeft"]
			_, hasR := s.Sequences["runRight"]
			if seq == "run" && hasL && hasR {
				continue
			}
			return fmt.Errorf("sprite.map 的 %q 指向不存在的序列 %s", name, seq)
		}
	}
	if len(s.Actions) == 0 {
		return errors.New("sprite.actions 不能为空")
	}
	for i := range s.Actions {
		a := &s.Actions[i]
		a.Label = strings.TrimSpace(a.Label)
		if a.Key == "" || a.Label == "" {
			return errors.New("sprite.actions 的 key/label 不能为空")
		}
		if _, ok := s.Sequences[a.Key]; !ok {
			return fmt.Errorf("sprite.actions 的 %q 指向不存在的序列 %s", a.Label, a.Key)
		}
		if utf8.RuneCountInString(a.Label) > 60 {
			return fmt.Errorf("sprite 动作名过长：%s", a.Label)
		}
	}
	return nil
}

func validateDialogue(m *CharacterManifest) error {
	// i18n 允许只带动作名/分类译文（plus 包沿用宿主形象的台词），
	// 但 lines 译文必须能对应到包内台词。
	texts := map[string]bool{}
	if m.Dialogue == nil {
		for lang, loc := range m.I18n {
			if len(loc.Lines) > 0 {
				return fmt.Errorf("%s 的 lines 翻译需要同时提供 dialogue 台词", lang)
			}
		}
		return validateI18nMaps(m, texts)
	}
	d := m.Dialogue
	texts = map[string]bool{}
	checkList := func(name string, list []string) error {
		if len(list) > maxDialogueLines {
			return fmt.Errorf("%s 最多 %d 条", name, maxDialogueLines)
		}
		for i, s := range list {
			if err := checkDialogueText(fmt.Sprintf("%s 第 %d 条", name, i+1), s, false); err != nil {
				return err
			}
			texts[strings.TrimSpace(s)] = true
		}
		return nil
	}
	if err := checkDialogueText("intro", d.Intro, true); err != nil {
		return err
	}
	if s := strings.TrimSpace(d.Intro); s != "" {
		texts[s] = true
	}
	for _, item := range []struct {
		name string
		list []string
	}{{"quips", d.Quips}, {"feed", d.Feed}, {"hungry", d.Hungry}, {"sleep", d.Sleep}} {
		if err := checkList(item.name, item.list); err != nil {
			return err
		}
	}
	if len(d.Memes) > maxMemeItems {
		return fmt.Errorf("memes 最多 %d 张", maxMemeItems)
	}
	for i := range d.Memes {
		mem := &d.Memes[i]
		rel, ok := cleanPackRel(mem.File)
		if !ok {
			return fmt.Errorf("第 %d 张梗图的 file 必须是包内相对路径", i+1)
		}
		if !isImageFile(rel) {
			return fmt.Errorf("第 %d 张梗图只支持 .webp/.png/.jpg", i+1)
		}
		mem.File = rel
		if len(mem.Scenes) == 0 {
			return fmt.Errorf("第 %d 张梗图缺少 scenes", i+1)
		}
		for _, scene := range mem.Scenes {
			if !memeScenes[scene] {
				return fmt.Errorf("第 %d 张梗图的场景 %q 不受支持", i+1, scene)
			}
		}
		if err := checkDialogueText(fmt.Sprintf("第 %d 张梗图的 text", i+1), mem.Text, true); err != nil {
			return err
		}
		if s := strings.TrimSpace(mem.Text); s != "" {
			texts[s] = true
		}
	}
	if len(texts) == 0 {
		return errors.New("dialogue 不能为空")
	}
	return validateI18nMaps(m, texts)
}

func validateI18nMaps(m *CharacterManifest, texts map[string]bool) error {
	actionKeys := map[string]bool{}
	cats := map[string]bool{}
	for _, a := range m.Actions {
		actionKeys[a.ID] = true
		if a.Category != "" {
			cats[a.Category] = true
		}
	}
	if m.Sprite != nil {
		for _, a := range m.Sprite.Actions {
			actionKeys[a.Label] = true
		}
	}
	for lang, loc := range m.I18n {
		if lang != "en" && lang != "ja" {
			return fmt.Errorf("不支持的语言 %q（只有 en/ja）", lang)
		}
		checkMap := func(name string, dict map[string]string, allowed map[string]bool) error {
			for src, tr := range dict {
				if !allowed[src] {
					return fmt.Errorf("%s 翻译的原文 %q 不在包内", name, src)
				}
				if err := checkDialogueText(fmt.Sprintf("%s 翻译 %q", name, src), tr, false); err != nil {
					return err
				}
			}
			return nil
		}
		if err := checkMap("lines", loc.Lines, texts); err != nil {
			return err
		}
		if err := checkMap("actions", loc.Actions, actionKeys); err != nil {
			return err
		}
		if err := checkMap("categories", loc.Categories, cats); err != nil {
			return err
		}
	}
	return nil
}

// validateUserImport 在通用校验之外，额外限制官方保留 id 和图集包。
// 远程下载走的 validateManifest 不拦这两种，因为 gptv1 本身就是官方图集包。
func validateUserImport(m *CharacterManifest) error {
	if err := validateManifest(m); err != nil {
		return err
	}
	if reservedPackIDs[m.ID] {
		return fmt.Errorf("id「%s」是保留名称，请换一个", m.ID)
	}
	if m.Kind == "sprite" {
		return errors.New("图集（spritesheet）形象暂不支持自制导入，请使用 .webm 透明视频")
	}
	return nil
}

// validatePackDir 检查清单引用的封面和动作文件确实解压出来了
func validatePackDir(dir string, m *CharacterManifest) error {
	cover, _ := cleanPackRel(m.Cover)
	coverPath, err := safeJoin(dir, cover)
	if err != nil {
		return err
	}
	if st, err := os.Stat(coverPath); err != nil || st.IsDir() || st.Size() == 0 {
		return fmt.Errorf("找不到封面文件：%s", m.Cover)
	}
	for _, a := range m.Actions {
		rel, _ := cleanPackRel(a.File)
		p, err := safeJoin(dir, rel)
		if err != nil {
			return err
		}
		if st, err := os.Stat(p); err != nil || st.IsDir() || st.Size() == 0 {
			return fmt.Errorf("找不到动作文件：%s", a.File)
		}
	}
	if m.Dialogue != nil {
		for _, mem := range m.Dialogue.Memes {
			rel, _ := cleanPackRel(mem.File)
			p, err := safeJoin(dir, rel)
			if err != nil {
				return err
			}
			if st, err := os.Stat(p); err != nil || st.IsDir() || st.Size() == 0 {
				return fmt.Errorf("找不到梗图文件：%s", mem.File)
			}
		}
	}
	if m.Sprite != nil {
		rel, _ := cleanPackRel(m.Sprite.Sheet)
		p, err := safeJoin(dir, rel)
		if err != nil {
			return err
		}
		if st, err := os.Stat(p); err != nil || st.IsDir() || st.Size() == 0 {
			return fmt.Errorf("找不到图集文件：%s", m.Sprite.Sheet)
		}
	}
	return nil
}

// inspectPackZip 找到 manifest.json 并确定它在 zip 里的根前缀：
// 支持「manifest.json 在根目录」和「整个包被套了一层文件夹」两种打包方式。
func inspectPackZip(zipPath string) (string, string, *CharacterManifest, error) {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", "", nil, fmt.Errorf("zip 损坏：%w", err)
	}
	defer zr.Close()
	if len(zr.File) > maxPackEntries {
		return "", "", nil, fmt.Errorf("zip 内文件太多（最多 %d 个）", maxPackEntries)
	}
	var total uint64
	for _, zf := range zr.File {
		name := path.Clean(strings.ReplaceAll(zf.Name, "\\", "/"))
		if name == "." {
			continue
		}
		if name == ".." || path.IsAbs(name) || strings.HasPrefix(name, "../") || strings.Contains(name, ":") {
			return "", "", nil, errors.New("zip 内含非法路径")
		}
		if zf.FileInfo().Mode()&os.ModeSymlink != 0 {
			return "", "", nil, errors.New("zip 内含符号链接，已拒绝")
		}
		total += zf.UncompressedSize64
		if total > uint64(maxPackBytes) {
			return "", "", nil, fmt.Errorf("解压后体积超过 %d MB", maxPackBytes>>20)
		}
	}

	type hit struct {
		prefix string
		m      *CharacterManifest
	}
	var hits []hit
	for _, zf := range zr.File {
		name := path.Clean(strings.ReplaceAll(zf.Name, "\\", "/"))
		if path.Base(name) != "manifest.json" {
			continue
		}
		prefix := strings.TrimSuffix(name, "manifest.json")
		if prefix != "" && !strings.HasSuffix(prefix, "/") {
			continue
		}
		if strings.Count(strings.Trim(prefix, "/"), "/") > 0 {
			continue // 只认根目录或单层文件夹
		}
		rc, err := zf.Open()
		if err != nil {
			return "", "", nil, err
		}
		b, err := io.ReadAll(io.LimitReader(rc, 1<<20))
		rc.Close()
		if err != nil {
			return "", "", nil, err
		}
		b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf"))
		var m CharacterManifest
		if err := json.Unmarshal(b, &m); err != nil {
			return "", "", nil, fmt.Errorf("%smanifest.json 不是合法 JSON：%w", prefix, err)
		}
		hits = append(hits, hit{prefix: prefix, m: &m})
	}
	if len(hits) == 0 {
		return "", "", nil, errors.New("zip 内没有 manifest.json（放在压缩包根目录或单层文件夹里）")
	}
	if len(hits) > 1 {
		return "", "", nil, errors.New("zip 内有多份 manifest.json，无法确定使用哪一份")
	}
	if hits[0].m.ID == "" {
		return "", "", nil, errors.New("manifest 缺少 id")
	}
	return hits[0].m.ID, hits[0].prefix, hits[0].m, nil
}

// extractPack 解压到 characters/<id>/，先写临时目录再原子改名，避免半成品被引擎读到
func (a *App) extractPack(id, zipPath, prefix string) error {
	return a.extractPackWithRename(id, zipPath, prefix, os.Rename)
}

func (a *App) extractPackWithRename(id, zipPath, prefix string, rename func(string, string) error) error {
	if id == "" || strings.ContainsAny(id, `/\`) || strings.Contains(id, "..") {
		return errors.New("非法的形象 id")
	}
	// 多开时两个进程可能同时装同一个包：用命名互斥串行化，避免都写 .installing 目录。
	unlock := lockNamed(baseInstanceName() + "-pack-" + id)
	defer unlock()
	root := a.charactersDir()
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	tmpDir := filepath.Join(root, id+".installing")

	os.RemoveAll(tmpDir)
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return err
	}
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("zip 损坏: %w", err)
	}
	defer zr.Close()
	if len(zr.File) > maxPackEntries {
		return fmt.Errorf("zip 内文件太多（最多 %d 个）", maxPackEntries)
	}
	var total uint64
	for _, zf := range zr.File {
		name := path.Clean(strings.ReplaceAll(zf.Name, "\\", "/"))
		if name == "." {
			continue
		}
		if name == ".." || path.IsAbs(name) || strings.HasPrefix(name, "../") || strings.Contains(name, ":") {
			return errors.New("zip 内含非法路径")
		}
		if zf.FileInfo().Mode()&os.ModeSymlink != 0 {
			return errors.New("zip 内含符号链接，已拒绝")
		}
		total += zf.UncompressedSize64
		if total > uint64(maxPackBytes) {
			return fmt.Errorf("解压后体积超过 %d MB", maxPackBytes>>20)
		}
	}
	var written uint64
	for _, zf := range zr.File {
		name := path.Clean(strings.ReplaceAll(zf.Name, "\\", "/"))
		if prefix != "" {
			if !strings.HasPrefix(name+"/", prefix) {
				continue // 单层文件夹外的说明文件/系统垃圾不装
			}
			name = strings.TrimPrefix(name, prefix)
		}
		if name == "" || name == "." || name == ".." {
			continue
		}
		dst, err := safeJoin(tmpDir, name)
		if err != nil {
			return err
		}
		if zf.FileInfo().IsDir() {
			os.MkdirAll(dst, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		rc, err := zf.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(dst)
		if err != nil {
			rc.Close()
			return err
		}
		n, cerr := io.Copy(out, io.LimitReader(rc, int64(uint64(maxPackBytes)-written)+1))
		written += uint64(n)
		out.Close()
		rc.Close()
		if cerr != nil {
			return cerr
		}
		if written > uint64(maxPackBytes) {
			return fmt.Errorf("解压后体积超过 %d MB", maxPackBytes>>20)
		}
	}
	m, err := a.loadInstalledCharacterIn(tmpDir)
	if err != nil {
		return fmt.Errorf("包内 manifest 无效: %w", err)
	}
	if m.ID != id {
		return fmt.Errorf("manifest 里的 id「%s」与安装目录「%s」不一致", m.ID, id)
	}
	if err := validateManifest(m); err != nil {
		return fmt.Errorf("manifest.json 不符合形象包标准：%w", err)
	}
	if err := validatePackDir(tmpDir, m); err != nil {
		return err
	}

	// 原子落位
	final := filepath.Join(root, id)
	old := final + ".old"
	os.RemoveAll(old)
	oldMoved := false
	if _, err := os.Stat(final); err == nil {
		if err := rename(final, old); err != nil {
			return fmt.Errorf("%w：%v", errPackBusy, err)
		}
		oldMoved = true
	}
	if err := rename(tmpDir, final); err != nil {
		if oldMoved {
			if rollbackErr := rename(old, final); rollbackErr != nil {
				return fmt.Errorf("安装落位失败：%w；旧包回滚失败（备份保留在 %s）：%v", err, old, rollbackErr)
			}
		}
		return fmt.Errorf("安装落位失败：%w", err)
	}
	os.RemoveAll(old)
	return nil
}

func (a *App) loadInstalledCharacterIn(dir string) (*CharacterManifest, error) {
	b, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, err
	}
	var m CharacterManifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// RemoveCharacter 卸载形象包
func (a *App) RemoveCharacter(id string) error {
	if id == "" || strings.ContainsAny(id, `/\`) || strings.Contains(id, "..") {
		return errors.New("非法的形象 id")
	}
	unlock := a.lockCharacter(id)
	defer unlock()
	if err := os.RemoveAll(filepath.Join(a.charactersDir(), id)); err != nil {
		return err
	}
	broadcast("reload-characters")
	return nil
}

// ── 形象包目录与下载线路 ──────────────────────────────────────────────
// 目录里保存直连 GitHub 的规范地址；下载前把地址套到内置镜像上，
// 先用小段 Range 探测吞吐，再按最快到最慢依次尝试。
const packCatalogURL = "https://raw.githubusercontent.com/shenliuyu18/dafeiyu-pet-assets/main/characters.json"

// 形象包下载客户端：部分网络下直连 GitHub 会一直等响应头，旧实现 60 分钟才失败，
// 界面上就是永远停在「下载中…」。给连接与响应头加超时，失败后按镜像顺序继续尝试。
var packHTTPClient = &http.Client{
	Timeout: 12 * time.Minute,
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSHandshakeTimeout:   12 * time.Second,
		ResponseHeaderTimeout: 25 * time.Second,
		IdleConnTimeout:       60 * time.Second,
		MaxIdleConns:          8,
	},
}

var packMirrors = []string{
	"",
	"https://ghfast.top/",
	"https://gh-proxy.com/",
	"https://ghproxy.net/",
}

func isGitHubURL(u string) bool {
	return strings.HasPrefix(u, "https://github.com/") || strings.HasPrefix(u, "https://raw.githubusercontent.com/")
}

func stripMirror(u string) string {
	for _, m := range packMirrors {
		if m != "" && strings.HasPrefix(u, m) {
			return strings.TrimPrefix(u, m)
		}
	}
	return u
}

func mirrorCandidates(canonical string) []string {
	if !isGitHubURL(canonical) {
		return []string{canonical}
	}
	out := make([]string, 0, len(packMirrors))
	for _, m := range packMirrors {
		out = append(out, m+canonical)
	}
	return out
}

// rankMirrors 返回按探测速度排序的镜像前缀；探测全部失败时保留默认顺序。
func rankMirrors(canonical string) []string {
	if !isGitHubURL(canonical) {
		return []string{""}
	}
	type probeResult struct {
		idx int
		d   time.Duration
		ok  bool
	}
	ch := make(chan probeResult, len(packMirrors))
	for i, m := range packMirrors {
		go func(i int, u string) {
			d, ok := probeMirror(u)
			ch <- probeResult{idx: i, d: d, ok: ok}
		}(i, m+canonical)
	}
	ok := make([]probeResult, 0, len(packMirrors))
	for range packMirrors {
		if p := <-ch; p.ok {
			ok = append(ok, p)
		}
	}
	sort.Slice(ok, func(i, j int) bool { return ok[i].d < ok[j].d })
	out := make([]string, 0, len(ok))
	for _, p := range ok {
		out = append(out, packMirrors[p.idx])
	}
	if len(out) == 0 {
		return packMirrors
	}
	return out
}

// probeMirror 读取前 256KB 估算下载速度；不支持 Range 的线路也能探测。
func probeMirror(u string) (time.Duration, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, false
	}
	req.Header.Set("Range", "bytes=0-262143")
	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return 0, false
	}
	n, err := io.CopyN(io.Discard, resp.Body, 256<<10)
	if err != nil && err != io.EOF {
		return 0, false
	}
	if n == 0 {
		return 0, false
	}
	return time.Since(start), true
}

type CatalogPack struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Desc         string `json:"description"`
	Actions      int    `json:"actions"`
	Zip          string `json:"zip"`
	ZipBytes     int64  `json:"zipBytes"`
	PlusFor      string `json:"plusFor"`
	Cover        string `json:"cover"`
	URL          string `json:"url"`
	InstallHint  string `json:"installHint"`
	LiteZip      string `json:"liteZip"`
	LiteZipBytes int64  `json:"liteZipBytes"`
	LiteURL      string `json:"liteUrl"`
}

// Lite 版下载 480×270 的压缩包；catalog 里没有 lite 字段时仍回落到完整包。
func packForVariant(p CatalogPack, lite bool) CatalogPack {
	if lite && p.LiteURL != "" {
		p.URL = p.LiteURL
		if p.LiteZipBytes > 0 {
			p.ZipBytes = p.LiteZipBytes
		}
	}
	return p
}

// FetchCharacterCatalog 拉取可下载的形象包列表，失败返回空列表（商店里只显示已安装的）
func (a *App) FetchCharacterCatalog() ([]CatalogPack, error) {
	return fetchCharacterCatalog(packCatalogURL, isLite())
}

// fetchCharacterCatalog 并发请求直连与所有镜像，取最先返回的有效目录。
func fetchCharacterCatalog(catalogURL string, lite bool) ([]CatalogPack, error) {
	candidates := mirrorCandidates(catalogURL)
	if isGitHubURL(catalogURL) {
		sep := "?"
		if strings.Contains(catalogURL, "?") {
			sep = "&"
		}
		bust := fmt.Sprintf("%st=%d", sep, time.Now().Unix())
		for i := range candidates {
			candidates[i] += bust
		}
	}
	type catalogResult struct {
		packs []CatalogPack
		err   error
	}
	ch := make(chan catalogResult, len(candidates))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	for _, u := range candidates {
		go func(u string) {
			packs, err := fetchCatalogOnce(ctx, u, lite)
			ch <- catalogResult{packs: packs, err: err}
		}(u)
	}
	var lastErr error
	for range candidates {
		r := <-ch
		if r.err == nil {
			cancel()
			return r.packs, nil
		}
		lastErr = r.err
	}
	if lastErr == nil {
		lastErr = errors.New("形象目录为空")
	}
	return nil, lastErr
}

func fetchCatalogOnce(ctx context.Context, u string, lite bool) ([]CatalogPack, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	cli := &http.Client{Timeout: 15 * time.Second}
	resp, err := cli.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var doc struct {
		Packs []CatalogPack `json:"packs"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, err
	}
	for i := range doc.Packs {
		doc.Packs[i] = packForVariant(doc.Packs[i], lite)
	}
	return doc.Packs, nil
}
