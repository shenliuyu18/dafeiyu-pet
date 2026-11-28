package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"unicode/utf16"

	"golang.org/x/sys/windows/registry"
)

// 开机启动方式：登录触发的计划任务，无延迟、普通权限，
// 由 Task Scheduler 在 Explorer 处理 Run 键之前拉起，比 HKCU Run 更早出现。
const autostartPowerShell = `$ErrorActionPreference = 'Stop'
$name = $env:PET_AUTOSTART_TASK
if ([string]::IsNullOrWhiteSpace($name)) { exit 2 }
$svc = New-Object -ComObject Schedule.Service
$svc.Connect()
$root = $svc.GetFolder('\')
if ($env:PET_AUTOSTART_ON -ne '1') {
  try { $root.DeleteTask($name, 0) } catch { }
  exit 0
}
$exe = $env:PET_AUTOSTART_EXE
if ([string]::IsNullOrWhiteSpace($exe) -or -not (Test-Path -LiteralPath $exe)) { exit 3 }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$task = $svc.NewTask(0)
$task.RegistrationInfo.Description = $name + ' autostart on user logon'
$task.Settings.Enabled = $true
$task.Settings.DisallowStartIfOnBatteries = $false
$task.Settings.StopIfGoingOnBatteries = $false
$task.Settings.ExecutionTimeLimit = 'PT0S'
$task.Settings.MultipleInstances = 2
$task.Settings.StartWhenAvailable = $true
$task.Settings.Priority = 6
$trigger = $task.Triggers.Create(9)
$trigger.UserId = $sid
$action = $task.Actions.Create(0)
$action.Path = $exe
$action.Arguments = '--restore-session'
$task.Principal.LogonType = 3
$task.Principal.RunLevel = 0
$root.RegisterTaskDefinition($name, $task, 6, $sid, $null, 3) | Out-Null
exit 0
`

func encodePowerShell(s string) string {
	u := utf16.Encode([]rune(s))
	buf := make([]byte, len(u)*2)
	for i, v := range u {
		buf[i*2] = byte(v)
		buf[i*2+1] = byte(v >> 8)
	}
	return base64.StdEncoding.EncodeToString(buf)
}

// setAutostartTask 创建/更新或删除登录计划任务。
func (a *App) setAutostartTask(on bool) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	onFlag := "0"
	if on {
		onFlag = "1"
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(autostartPowerShell))
	cmd.Env = append(os.Environ(),
		"PET_AUTOSTART_TASK="+appName(),
		"PET_AUTOSTART_EXE="+exe,
		"PET_AUTOSTART_ON="+onFlag,
	)
	cmd.SysProcAttr = hiddenProcAttr()
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

// cleanLegacyRunEntries 清掉旧版本的 HKCU Run 自启动（含已删除目录里的老条目），
// 避免登录时 Explorer 去启动不存在的 exe 或与计划任务重复启动。
func (a *App) cleanLegacyRunEntries() {
	const keyPath = `Software\Microsoft\Windows\CurrentVersion\Run`
	k, err := registry.OpenKey(registry.CURRENT_USER, keyPath, registry.SET_VALUE)
	if err != nil {
		return
	}
	defer k.Close()
	_ = k.DeleteValue(appName())
	_ = k.DeleteValue("com.dafeiyu.desktop-pet")
}

func (a *App) autostartTaskExists() bool {
	cmd := exec.Command("schtasks.exe", "/Query", "/TN", appName())
	cmd.SysProcAttr = hiddenProcAttr()
	return cmd.Run() == nil
}

// AutostartStatus 供设置页回显：设置开关与实际计划任务是否一致。
func (a *App) AutostartStatus() map[string]interface{} {
	return map[string]interface{}{
		"enabled": a.getBool("autoStart", false),
		"task":    a.autostartTaskExists(),
		"name":    appName(),
	}
}

// applyLoginItem 同步应用自启动设置；设置页切换时调用，确保任务先落盘再返回。
func (a *App) applyLoginItem() {
	if isolatedMode {
		return // 隔离调试实例不能写本机的登录计划任务
	}
	a.cleanLegacyRunEntries()
	if err := a.setAutostartTask(a.getBool("autoStart", false)); err != nil {
		crashLog("autostart", err.Error())
	}
}

// applyLoginItemAsync 启动时调用：Run 键清理很快，计划任务交给后台，不拖慢首帧。
func (a *App) applyLoginItemAsync() {
	if isolatedMode {
		return
	}
	a.cleanLegacyRunEntries()
	on := a.getBool("autoStart", false)
	go func() {
		if err := a.setAutostartTask(on); err != nil {
			crashLog("autostart", err.Error())
		}
	}()
}
