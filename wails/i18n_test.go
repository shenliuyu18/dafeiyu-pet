package main

import "testing"

func TestNormalizeLang(t *testing.T) {
	cases := map[string]string{"en": "en", "ja": "ja", "zh": "zh", "EN": "zh", "": "zh", "fr": "zh"}
	for in, want := range cases {
		if got := normalizeLang(in); got != want {
			t.Errorf("normalizeLang(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUILangTranslation(t *testing.T) {
	defer uiLangStore.Store("zh")
	a := &App{}
	a.setUILang("en")
	if got := a.t("中文", "English", "日本語"); got != "English" {
		t.Fatalf("en = %q", got)
	}
	a.setUILang("ja")
	if got := a.t("中文", "English", "日本語"); got != "日本語" {
		t.Fatalf("ja = %q", got)
	}
	a.setUILang("zh")
	if got := a.t("中文", "English", "日本語"); got != "中文" {
		t.Fatalf("zh = %q", got)
	}
}

func TestPetStatusIncludesLang(t *testing.T) {
	a := &App{state: map[string]interface{}{"lang": "ja", "ledger": false}}
	st := a.petStatus()
	settings, _ := st["settings"].(map[string]interface{})
	if settings == nil || settings["lang"] != "ja" {
		t.Fatalf("settings.lang = %v", settings["lang"])
	}
}

func TestLangFromLANGID(t *testing.T) {
	cases := map[uint32]string{
		0x0804: "zh", // zh-CN
		0x0404: "zh", // zh-TW
		0x0411: "ja", // ja-JP
		0x0409: "en", // en-US
		0x0407: "en", // de-DE
		0x0809: "en", // en-GB
	}
	for id, want := range cases {
		if got := langFromLANGID(id); got != want {
			t.Errorf("langFromLANGID(0x%04x) = %q, want %q", id, got, want)
		}
	}
	if l, _ := defaultState()["lang"].(string); l != "zh" && l != "ja" && l != "en" {
		t.Fatalf("default lang = %q", l)
	}
}
