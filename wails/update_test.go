package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

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

func TestManualUpdateRejectedDuringAutomaticUpdate(t *testing.T) {
	for _, tc := range []struct {
		name string
		call func(*App) map[string]interface{}
	}{
		{"download", func(a *App) map[string]interface{} { return a.DownloadUpdate("") }},
		{"install", func(a *App) map[string]interface{} { return a.InstallUpdate() }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a := &App{
				autoUpdating: true,
				lastUpdate:   map[string]interface{}{"hasUpdate": false},
			}
			if got := tc.call(a); got["code"] != "BUSY" || got["started"] != false {
				t.Fatalf("automatic update must exclude manual work: %#v", got)
			}
			a.mu.Lock()
			defer a.mu.Unlock()
			if a.updateBusy || !a.autoUpdating {
				t.Fatalf("rejected call changed automatic occupancy: busy=%v auto=%v", a.updateBusy, a.autoUpdating)
			}
		})
	}
}

func TestBeginUpdateAllowsOnlyOneConcurrentCaller(t *testing.T) {
	const callers = 64
	a := &App{}
	start := make(chan struct{})
	results := make(chan bool, callers)
	var wg sync.WaitGroup
	wg.Add(callers)
	for i := 0; i < callers; i++ {
		go func(automatic bool) {
			defer wg.Done()
			<-start
			results <- a.beginUpdate(automatic)
		}(i%2 == 0)
	}
	close(start)
	wg.Wait()
	close(results)

	successes := 0
	for ok := range results {
		if ok {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("beginUpdate successes=%d, want 1", successes)
	}
	a.mu.Lock()
	busy, automatic := a.updateBusy, a.autoUpdating
	a.mu.Unlock()
	if !busy {
		t.Fatal("winning call did not retain occupancy")
	}
	a.endUpdate(automatic)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.updateBusy || a.autoUpdating {
		t.Fatalf("endUpdate did not release occupancy: busy=%v auto=%v", a.updateBusy, a.autoUpdating)
	}
}

func TestDownloadUpdateClaimsOccupancyBeforeFetchingMetadata(t *testing.T) {
	firstRequest := make(chan struct{})
	releaseFirst := make(chan struct{})
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseFirst) }) }
	t.Cleanup(release)

	var mu sync.Mutex
	requests := 0
	oldTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		mu.Lock()
		requests++
		n := requests
		mu.Unlock()
		if n == 1 {
			close(firstRequest)
			<-releaseFirst
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"tag_name":"v1.5.4"}`)),
			Request:    req,
		}, nil
	})
	t.Cleanup(func() { http.DefaultTransport = oldTransport })

	a := &App{}
	first := make(chan map[string]interface{}, 1)
	go func() { first <- a.DownloadUpdate("") }()
	select {
	case <-firstRequest:
	case <-time.After(3 * time.Second):
		t.Fatal("metadata request did not start")
	}
	second := a.DownloadUpdate("")
	release()
	select {
	case <-first:
	case <-time.After(3 * time.Second):
		t.Fatal("first download call did not return")
	}
	if second["code"] != "BUSY" || second["started"] != false {
		t.Fatalf("concurrent download should be rejected before metadata lookup: %#v", second)
	}
	mu.Lock()
	defer mu.Unlock()
	if requests != 1 {
		t.Fatalf("rejected download performed another metadata request: %d", requests)
	}
}

func TestUpdateEarlyReturnsReleaseOccupancy(t *testing.T) {
	for _, tc := range []struct {
		name string
		info map[string]interface{}
		code string
	}{
		{"no update", map[string]interface{}{"hasUpdate": false}, "NO_UPDATE"},
		{"variant mismatch", map[string]interface{}{
			"hasUpdate": true, "url": "https://example.invalid/update.exe",
			"assetName": "dafeiyu-pet-lite-1.6.0-setup.exe",
		}, "MISMATCH"},
	} {
		for _, automatic := range []bool{false, true} {
			name := tc.name + "/manual"
			if automatic {
				name = tc.name + "/automatic"
			}
			t.Run(name, func(t *testing.T) {
				a := &App{lastUpdate: cloneUpdateInfo(tc.info), lastUpdateAt: time.Now()}
				call := a.DownloadUpdate
				if automatic {
					call = func(string) map[string]interface{} { return a.InstallUpdate() }
				}
				for i := 0; i < 2; i++ {
					if got := call(""); got["code"] != tc.code || got["started"] != false {
						t.Fatalf("call %d: want %s, got %#v", i, tc.code, got)
					}
					a.mu.Lock()
					busy, auto := a.updateBusy, a.autoUpdating
					a.mu.Unlock()
					if busy || auto {
						t.Fatalf("call %d leaked occupancy: busy=%v auto=%v", i, busy, auto)
					}
				}
			})
		}
	}
}

func TestAutomaticUpdateFailureReleasesSharedOccupancy(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	t.Setenv("TMP", dir)
	t.Setenv("TEMP", dir)

	started := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-started:
		default:
			close(started)
		}
		<-release
		_, _ = io.WriteString(w, "not an installer")
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(unblock)

	a := &App{lastUpdate: map[string]interface{}{
		"hasUpdate": true, "url": srv.URL, "assetName": "dafeiyu-pet-1.6.0-setup.exe",
		"latest": "v1.6.0", "sumsUrl": "",
	}, lastUpdateAt: time.Now()}
	if got := a.InstallUpdate(); got["started"] != true {
		t.Fatalf("automatic update did not start: %#v", got)
	}
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("installer download did not start")
	}
	if got := a.DownloadUpdate(""); got["code"] != "BUSY" {
		t.Fatalf("manual download started during automatic update: %#v", got)
	}
	if got := a.InstallUpdate(); got["code"] != "BUSY" {
		t.Fatalf("second automatic update started: %#v", got)
	}
	unblock()
	waitForUpdateIdle(t, a)
}

func TestIsolatedUpdateReturnsDoNotClaimOccupancy(t *testing.T) {
	previous := isolatedMode
	isolatedMode = true
	t.Cleanup(func() { isolatedMode = previous })
	a := &App{}
	for _, call := range []func() map[string]interface{}{
		func() map[string]interface{} { return a.DownloadUpdate("") },
		func() map[string]interface{} { return a.InstallUpdate() },
	} {
		if got := call(); got["code"] != "ISOLATED" || got["started"] != false {
			t.Fatalf("isolated result changed: %#v", got)
		}
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.updateBusy || a.autoUpdating {
		t.Fatalf("isolated call claimed occupancy: busy=%v auto=%v", a.updateBusy, a.autoUpdating)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func waitForUpdateIdle(t *testing.T, a *App) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		a.mu.Lock()
		busy, auto := a.updateBusy, a.autoUpdating
		a.mu.Unlock()
		if !busy && !auto {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("update occupancy was not released")
}
