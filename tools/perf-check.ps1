param(
  [string]$Exe = "",
  [double]$MaxStartupMs = 2500,
  [double]$MaxPrivateMB = 360,
  [double]$MaxIdleCpu = 12,
  [double]$MaxRoamCpu = 30,
  [int]$MaxStateWrites = 1
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$base = 'http://127.0.0.1:9336'
$stateDir = Join-Path $env:APPDATA 'dafeiyu-desktop-pet-isolated'
$stateFile = Join-Path $stateDir 'dafeiyu-state.json'

function Get-Json($path, $timeout = 5) { try { return Invoke-RestMethod -Uri ($base + $path) -TimeoutSec $timeout } catch { return $null } }
function Post-Js($js) { Invoke-WebRequest -Uri ($base + '/js') -Method Post -Body $js -TimeoutSec 10 | Out-Null }
function Get-Tree([int]$rootPid) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
  $ids = [System.Collections.Generic.List[int]]::new(); $ids.Add($rootPid); $frontier = @($rootPid)
  while ($frontier.Count -gt 0) {
    $next = @()
    foreach ($p in $all) { if ($frontier -contains [int]$p.ParentProcessId -and -not $ids.Contains([int]$p.ProcessId)) { $ids.Add([int]$p.ProcessId); $next += [int]$p.ProcessId } }
    $frontier = $next
  }
  return $ids.ToArray()
}
function Cpu-Sum($ids) {
  $s = 0.0
  foreach ($id in $ids) { $pr = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($pr -and $pr.TotalProcessorTime) { $s += $pr.TotalProcessorTime.TotalSeconds } }
  return $s
}
function Cpu-Sample($ids, [int]$sec) {
  $a = Cpu-Sum $ids; Start-Sleep -Seconds $sec; $b = Cpu-Sum $ids
  return [math]::Round((($b - $a) / $sec) * 100, 2)
}
function Private-MB($ids) {
  $sum = 0.0
  foreach ($id in $ids) { $pr = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($pr) { $sum += $pr.PrivateMemorySize64 } }
  return [math]::Round($sum / 1MB, 1)
}

if (-not $Exe) {
  Write-Host '[perf] 生成前端与隔离构建…'
  Push-Location $root; node tools/wails-prepare.js | Out-Null; Pop-Location
  $Exe = Join-Path $env:TEMP 'dafeiyu-perf.exe'
  Push-Location (Join-Path $root 'wails')
  go build -tags 'desktop,production' -ldflags '-H windowsgui' -o $Exe .
  Pop-Location
}
if (-not (Test-Path $Exe)) { throw "找不到可执行文件：$Exe" }

Get-Process dafeiyu-perf, dafeiyu-isolated -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $stateDir) { Remove-Item $stateDir -Recurse -Force }
$sw = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $Exe -ArgumentList '--isolated', '--dev-debug' -PassThru
try {
  $ready = $null
  for ($i = 0; $i -lt 300; $i++) {
    Start-Sleep -Milliseconds 100
    $st = Get-Json '/state' 1
    if ($st -and $st.petInit) { $ready = $sw.Elapsed.TotalMilliseconds; break }
  }
  if (-not $ready) { throw '启动超时：30 秒内没有 petInit' }
  while ($sw.Elapsed.TotalSeconds -lt 24) { Start-Sleep -Milliseconds 300 }
  $ids = Get-Tree $p.Id
  $private = Private-MB $ids

  Post-Js "(async () => { window.__freeze(true); S.autoActionSec = 100000; clearTimeout(oneShotTimer); oneShotPlaying = false; S.pomoRunning = false; S.autoDoze = false; S.awake = true; playAnim(ANIM.idle, true); const v = document.getElementById('petVid'); if (v) { try { await v.play(); } catch (e) {} } setInterval(() => { S.autoDoze = false; S.awake = true; S.lastInteract = Date.now(); }, 500); await window.go.main.App.SaveSettings('{}'); })()" | Out-Null
  Start-Sleep -Seconds 3
  $mt0 = (Get-Item $stateFile).LastWriteTimeUtc
  $idleCpu = Cpu-Sample $ids 60
  $mt1 = (Get-Item $stateFile).LastWriteTimeUtc
  $writes = if ($mt1 -ne $mt0) { 1 } else { 0 }

  Post-Js "window.__freeze(false); window.__teleport(420, 320); 'roam'" | Out-Null
  Start-Sleep -Seconds 3
  $roamCpu = Cpu-Sample $ids 20
  $privateEnd = Private-MB $ids

  $report = [ordered]@{
    exe = $Exe
    startupMs = [math]::Round($ready, 0)
    privateMB = $privateEnd
    idleCpuOneCorePct = $idleCpu
    roamCpuOneCorePct = $roamCpu
    stateWritesPerMinute = $writes
    processorCount = [Environment]::ProcessorCount
    checkedAt = (Get-Date).ToString('s')
  }
  $fail = @()
  if ($report.startupMs -gt $MaxStartupMs) { $fail += "启动 ${($report.startupMs)}ms > ${MaxStartupMs}ms" }
  if ($privateEnd -gt $MaxPrivateMB) { $fail += "私有内存 ${privateEnd}MB > ${MaxPrivateMB}MB" }
  if ($idleCpu -gt $MaxIdleCpu) { $fail += "空闲 CPU ${idleCpu}% > ${MaxIdleCpu}%" }
  if ($roamCpu -gt $MaxRoamCpu) { $fail += "漫游 CPU ${roamCpu}% > ${MaxRoamCpu}%" }
  if ($writes -gt $MaxStateWrites) { $fail += "状态写入 ${writes}/min > ${MaxStateWrites}" }
  $report | Add-Member -NotePropertyName ok -NotePropertyValue ($fail.Count -eq 0)
  $report | Add-Member -NotePropertyName failures -NotePropertyValue $fail
  $report | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $root 'perf-report.json') -Encoding utf8
  $report | ConvertTo-Json -Depth 4
  if ($fail.Count -gt 0) { Write-Error ("性能预算未通过：" + ($fail -join '；')); exit 1 }
  Write-Host '[perf] 性能预算通过'
}
finally {
  if ($p -and -not $p.HasExited) { Invoke-WebRequest -Uri ($base + '/quit') -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null; Start-Sleep -Seconds 2; Get-Process -Id $p.Id -ErrorAction SilentlyContinue | Stop-Process -Force }
  if (Test-Path $stateDir) { Remove-Item $stateDir -Recurse -Force -ErrorAction SilentlyContinue }
}
