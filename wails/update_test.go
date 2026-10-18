package main

import "testing"

func TestAssetMatchesVariant(t *testing.T) {
	cases := []struct {
		name string
		lite bool
		want bool
	}{
		{"dafeiyu-pet-1.4.0-beta.14-setup.exe", false, true},
		{"dafeiyu-pet-lite-1.4.0-beta.14-setup.exe", true, true},
		{"dafeiyu-pet-lite-1.4.0-beta.14-setup.exe", false, false},
		{"dafeiyu-pet-1.4.0-beta.14-setup.exe", true, false},
		{"dafeiyu-pet-1.4.0-beta.14-wails-setup.exe", false, true},
		{"dafeiyu-pet-lite-1.4.0-beta.14-wails-setup.exe", true, true},
		{"other-1.4.0-setup.exe", false, false},
		{"dafeiyu-pet-1.4.0-setup.zip", false, false},
	}
	for _, c := range cases {
		if got := assetMatchesVariant(c.name, c.lite); got != c.want {
			t.Fatalf("assetMatchesVariant(%q,%v)=%v want %v", c.name, c.lite, got, c.want)
		}
	}
}

func TestPickUpdateAssetSeparatesVariants(t *testing.T) {
	full := "dafeiyu-pet-1.4.0-beta.14-setup.exe"
	lite := "dafeiyu-pet-lite-1.4.0-beta.14-setup.exe"
	assets := []interface{}{
		map[string]interface{}{"name": "source.zip", "browser_download_url": "https://example.invalid/source.zip"},
		map[string]interface{}{"name": full, "browser_download_url": "https://example.invalid/full"},
		map[string]interface{}{"name": lite, "browser_download_url": "https://example.invalid/lite"},
	}
	if name, url := pickUpdateAsset(assets, false); name != full || url != "https://example.invalid/full" {
		t.Fatalf("full picked %q %q", name, url)
	}
	if name, url := pickUpdateAsset(assets, true); name != lite || url != "https://example.invalid/lite" {
		t.Fatalf("lite picked %q %q", name, url)
	}
}
