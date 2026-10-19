package main

import "testing"

func TestAllowedURL(t *testing.T) {
	allowed := []string{
		"https://github.com/shenliuyu18/dafeiyu-pet",
		"https://github.com/shenliuyu18/dafeiyu-pet/blob/main/CHANGELOG.md",
		"https://gh-proxy.org/https://github.com/shenliuyu18/dafeiyu-pet/releases/download/v1.4.1/dafeiyu-pet-1.4.1-setup.exe",
		"https://wwaql.lanzouu.com/b01i5xmkri",
	}
	for _, u := range allowed {
		if !allowedURL(u) {
			t.Fatalf("allowedURL(%q) = false, want true", u)
		}
	}
	blocked := []string{
		"https://wwaql.lanzouu.com/b01i5xmkri.evil.example",
		"https://wwaql.lanzouu.com.evil.example/b01i5xmkri",
		"http://wwaql.lanzouu.com/b01i5xmkri",
		"https://github.com/shenliuyu18/dafeiyu-pet-evil",
	}
	for _, u := range blocked {
		if allowedURL(u) {
			t.Fatalf("allowedURL(%q) = true, want false", u)
		}
	}
}
