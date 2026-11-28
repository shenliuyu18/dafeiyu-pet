package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// 账本缓存：主实例负责拉取并落盘，副实例读这份缓存，避免 N 个进程同时打平台 API。
func (a *App) ledgerCachePath() string {
	return filepath.Join(filepath.Dir(a.sharedStatePath()), "ledger-cache.json")
}

func (a *App) writeLedgerCache(l map[string]interface{}) {
	if !instanceIsLeader || l == nil {
		return
	}
	b, err := json.Marshal(l)
	if err != nil {
		return
	}
	_ = writeFileAtomic(a.ledgerCachePath(), b)
}

func readLedgerCache() map[string]interface{} {
	b, err := os.ReadFile(filepath.Join(configRootDir(), "ledger-cache.json"))
	if err != nil {
		return nil
	}
	var l map[string]interface{}
	if json.Unmarshal(b, &l) != nil {
		return nil
	}
	return l
}
