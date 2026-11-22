package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// updateSigningPubKey 由发版构建通过 -ldflags "-X main.updateSigningPubKey=<base64>" 注入。
// 未配置时仍强制 SHA256，只是跳过签名校验；配置后签名缺失或无效都会拒绝安装。
var updateSigningPubKey = ""

const updateSumsMaxBytes = 256 << 10

// pickReleaseAsset 在 GitHub Release 资产里按完整文件名找 URL。
func pickReleaseAsset(assets []interface{}, name string) (string, string) {
	for _, ai := range assets {
		am, _ := ai.(map[string]interface{})
		if strv(am["name"], "") != name {
			continue
		}
		if u := strv(am["browser_download_url"], ""); u != "" {
			return name, u
		}
	}
	return "", ""
}

// parseSHA256Sums 从 `hash  filename` 清单里找目标文件的哈希。
func parseSHA256Sums(text, want string) string {
	want = strings.TrimSpace(want)
	for _, line := range strings.Split(text, "\n") {
		f := strings.Fields(strings.TrimSpace(strings.TrimPrefix(line, "\ufeff")))
		if len(f) < 2 {
			continue
		}
		name := strings.TrimPrefix(strings.TrimSpace(f[len(f)-1]), "*")
		if name != want && filepath.Base(name) != filepath.Base(want) {
			continue
		}
		h := strings.ToLower(f[0])
		if len(h) == sha256.Size*2 {
			return h
		}
	}
	return ""
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func fetchUpdateBytes(rawURL string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, errors.New("校验文件地址无效")
	}
	req.Header.Set("User-Agent", "dafeiyu-pet")
	req.Header.Set("Cache-Control", "no-cache")
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("下载校验文件失败：%w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("下载校验文件失败：HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, updateSumsMaxBytes))
	if err != nil {
		return nil, fmt.Errorf("读取校验文件失败：%w", err)
	}
	return b, nil
}

func fetchUpdateText(rawURL string) (string, error) {
	b, err := fetchUpdateBytes(rawURL)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(strings.TrimPrefix(string(b), "\ufeff")), nil
}

func shortHash(h string) string {
	if len(h) > 12 {
		return h[:12] + "…"
	}
	return h
}

// verifyUpdateFile 在启动安装程序前校验安装包：
// 1) 从 GitHub Release 直接下载 SHA256SUMS.txt（不走第三方加速镜像）；
// 2) 比对安装包 SHA256；
// 3) 若构建时注入了公钥，再验证清单的 Ed25519 签名。
func verifyUpdateFile(dest string, info map[string]interface{}) error {
	sumsURL := strv(info["sumsUrl"], "")
	if sumsURL == "" {
		return errors.New("发布缺少 SHA256SUMS.txt，已拒绝自动更新（可手动下载）")
	}
	sumsRaw, err := fetchUpdateBytes(sumsURL)
	if err != nil {
		return err
	}
	sums := strings.TrimSpace(strings.TrimPrefix(string(sumsRaw), "\ufeff"))
	assetName := filepath.Base(strv(info["assetName"], ""))
	expected := parseSHA256Sums(sums, assetName)
	if expected == "" {
		return fmt.Errorf("校验清单中没有 %s，已拒绝更新", assetName)
	}
	got, err := fileSHA256(dest)
	if err != nil {
		return fmt.Errorf("读取安装包失败：%w", err)
	}
	if !strings.EqualFold(got, expected) {
		return fmt.Errorf("安装包校验失败（期望 %s，实际 %s），文件可能已损坏或被篡改", shortHash(expected), shortHash(got))
	}

	if updateSigningPubKey != "" {
		sigURL := strv(info["sigUrl"], "")
		if sigURL == "" {
			return errors.New("已启用签名校验，但发布缺少 SHA256SUMS.txt.sig")
		}
		sigText, err := fetchUpdateText(sigURL)
		if err != nil {
			return err
		}
		pub, err := base64.StdEncoding.DecodeString(strings.TrimSpace(updateSigningPubKey))
		if err != nil || len(pub) != ed25519.PublicKeySize {
			return errors.New("内置更新公钥格式无效")
		}
		sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(sigText))
		if err != nil {
			return errors.New("校验清单签名格式无效")
		}
		if !ed25519.Verify(ed25519.PublicKey(pub), sumsRaw, sig) {
			return errors.New("校验清单签名无效，已拒绝更新")
		}
	}
	return nil
}
