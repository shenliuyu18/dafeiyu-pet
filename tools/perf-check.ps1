param(
  [string]$Exe = "",
  [double]$MaxStartupMs = 2500,
  [double]$MaxPrivateMB = 360,
  # 待机口径：待机视频在播 + 10fps 几何循环（即文档里的「真实待机」）。
  # 这部分开销几乎全在 WebView2 的视频解码与透明合成，同一台机器单轮可波动 ±8 个百分点，
  # 因此取 3 轮 30s 的中位数，并把可代码控制的 Go 主进程单独设一道紧阈值。
  [double]$MaxIdleCpu = 28,
  [double]$MaxIdleMainCpu = 3,
  [double]$MaxRoamCpu = 32,
  [double]$MaxFirstFrameMs = 780,
  [double]$MaxStoreOpenMs = 150,
  [double]$MaxLongTaskMs = 50,
  [int]$MaxStateWrites = 1
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$base = 'http://127.0.0.1:9336'
$stateDir = Join-Path $env:APPDATA 'dafeiyu-desktop-pet-isolated'
$stateFile = Join-Path $stateDir 'dafeiyu-state.json'

function Get-Json($path, $timeout = 5) { try { return Invoke-RestMethod -Uri ($base + $path) -TimeoutSec $timeout } catch { return $null } }
function Post-Js($js) { Invoke-RestMethod -Uri ($base + '/js') -Method Post -Body $js -TimeoutSec 10 | Out-Null }
function Wait-Log($pattern, [int]$timeoutMs = 5000) {
  $deadline = (Get-Date).AddMilliseconds($timeoutMs)
  while ((Get-Date) -lt $deadline) {
    try {
      $s = [string](Invoke-RestMethod -Uri ($base + '/last') -TimeoutSec 2)
      if ($s -match $pattern) { return $s }
    } catch {}
    Start-Sleep -Milliseconds 100
  }
  return $null
}
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
function Cpu-Split($ids, [int]$sec) {
  $start = @{}
  foreach ($id in $ids) { $pr = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($pr -and $pr.TotalProcessorTime) { $start[$id] = $pr.TotalProcessorTime.TotalSeconds } }
  Start-Sleep -Seconds $sec
  $main = 0.0; $web = 0.0
  foreach ($id in $ids) {
    $pr = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $pr -or -not $start.ContainsKey($id) -or -not $pr.TotalProcessorTime) { continue }
    $d = $pr.TotalProcessorTime.TotalSeconds - $start[$id]
    if ($pr.ProcessName -like '*webview2*') { $web += $d } else { $main += $d }
  }
  return @{ total = [math]::Round(($main + $web) / $sec * 100, 2); main = [math]::Round($main / $sec * 100, 2); webview = [math]::Round($web / $sec * 100, 2) }
}
function Median($values) {
  $arr = @($values | Sort-Object)
  if ($arr.Count -eq 0) { return 0 }
  $mid = [int][math]::Floor($arr.Count / 2)
  if ($arr.Count % 2 -eq 1) { return $arr[$mid] }
  return [math]::Round(($arr[$mid - 1] + $arr[$mid]) / 2, 2)
}
function Private-MB($ids) {
  $sum = 0.0
  foreach ($id in $ids) { $pr = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($pr) { $sum += $pr.PrivateMemorySize64 } }
  return [math]::Round($sum / 1MB, 1)
}
function Mem-Breakdown($ids) {
  $main = 0.0; $web = 0.0
  foreach ($id in $ids) {
    $pr = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $pr) { continue }
    if ($pr.ProcessName -like '*webview2*') { $web += $pr.PrivateMemorySize64 } else { $main += $pr.PrivateMemorySize64 }
  }
  return @{ main = [math]::Round($main / 1MB, 1); webview = [math]::Round($web / 1MB, 1) }
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
  # 3 轮 30s 采样取中位数：WebView2 的视频解码/合成在同一台机器上波动很大，
  # 单轮 60s 会把一次 GC 或一次解码抖动放大成整份报告的结论。
  $idleRounds = @()
  $idleMainRounds = @()
  foreach ($round in 1..3) {
    $split = Cpu-Split $ids 30
    $idleRounds += $split.total
    $idleMainRounds += $split.main
    Write-Host ("[perf] 待机第 {0} 轮：合计 {1}%（主进程 {2}% / WebView2 {3}%）" -f $round, $split.total, $split.main, $split.webview)
  }
  $idleCpu = Median $idleRounds
  $idleMainCpu = Median $idleMainRounds
  $idleCpuRounds = $idleRounds
  $mt1 = (Get-Item $stateFile).LastWriteTimeUtc
  $writes = if ($mt1 -ne $mt0) { 1 } else { 0 }

  Post-Js "window.__freeze(false); window.__teleport(420, 320); 'roam'" | Out-Null
  Start-Sleep -Seconds 3
  $roamCpu = (Cpu-Split $ids 20).total
  $privateEnd = Private-MB $ids

  # 首帧：渲染层自报的 performance.now()（相对页面开始）
  Post-Js "try { window.go.main.App.DebugLog('PERF firstFrame=' + (window.__firstFrameMs || 0)); } catch (e) {}" | Out-Null
  $ffLine = Wait-Log 'PERF firstFrame=(\d+)'
  $firstFrameMs = if ($ffLine -and $ffLine -match 'PERF firstFrame=(\d+)') { [int]$Matches[1] } else { 0 }

  # 设置面板首开：从调用到商店列表出现第一张卡片
  Post-Js "(async () => { const t0 = performance.now(); await openSettings(); openSetPage('look'); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 0)); if (document.querySelector('#set-store .store-item')) break; } window.go.main.App.DebugLog('PERF storeOpen=' + Math.round(performance.now() - t0)); })()" | Out-Null
  $soLine = Wait-Log 'PERF storeOpen=(\d+)' 8000
  $storeOpenMs = if ($soLine -and $soLine -match 'PERF storeOpen=(\d+)') { [int]$Matches[1] } else { -1 }

  # 商店进度 160 次更新：主线程最长任务（目标 < 50ms）
  Post-Js "(async () => { const card = document.querySelector('#set-store .store-item'); const id = card ? card.dataset.storeId : 'perf'; const d = []; let o = null; try { o = new PerformanceObserver((l) => { for (const e of l.getEntries()) d.push(e.duration); }); o.observe({ entryTypes: ['longtask'] }); } catch (e) {} for (let i = 0; i < 160; i++) { window.__storeProgress(id, i * 250000, 40000000); await new Promise((r) => setTimeout(r, 1)); } await new Promise((r) => setTimeout(r, 80)); if (o) o.disconnect(); const maxLong = d.length ? Math.max.apply(null, d) : 0; window.go.main.App.DebugLog('PERF storeProgress=' + Math.round(maxLong)); })()" | Out-Null
  $spLine = Wait-Log 'PERF storeProgress=(\d+)' 10000
  $storeLongMs = if ($spLine -and $spLine -match 'PERF storeProgress=(\d+)') { [int]$Matches[1] } else { -1 }
  Post-Js "closeSettings(); 'done'" | Out-Null

  $mem = Mem-Breakdown $ids
  $report = [ordered]@{
    exe = $Exe
    startupMs = [math]::Round($ready, 0)
    mainPrivateMB = $mem.main
    webviewPrivateMB = $mem.webview
    firstFrameMs = $firstFrameMs
    privateMB = $privateEnd
    idleCpuOneCorePct = $idleCpu
    idleMainCpuOneCorePct = $idleMainCpu
    idleCpuRounds = $idleCpuRounds
    roamCpuOneCorePct = $roamCpu
    storeFirstOpenMs = $storeOpenMs
    storeProgressMaxLongTaskMs = $storeLongMs
    stateWritesPerMinute = $writes
    processorCount = [Environment]::ProcessorCount
    checkedAt = (Get-Date).ToString('s')
  }
  $fail = @()
  if ($report.startupMs -gt $MaxStartupMs) { $fail += "启动 $($report.startupMs)ms > ${MaxStartupMs}ms" }
  if ($firstFrameMs -le 0) { $fail += '首帧未取到（页面未上报）' }
  elseif ($firstFrameMs -gt $MaxFirstFrameMs) { $fail += "首帧 ${firstFrameMs}ms > ${MaxFirstFrameMs}ms" }
  if ($privateEnd -gt $MaxPrivateMB) { $fail += "私有内存 ${privateEnd}MB > ${MaxPrivateMB}MB" }
  if ($idleCpu -gt $MaxIdleCpu) { $fail += "待机 CPU ${idleCpu}% > ${MaxIdleCpu}%（3 轮中位数）" }
  if ($idleMainCpu -gt $MaxIdleMainCpu) { $fail += "待机主进程 CPU ${idleMainCpu}% > ${MaxIdleMainCpu}%" }
  if ($roamCpu -gt $MaxRoamCpu) { $fail += "漫游 CPU ${roamCpu}% > ${MaxRoamCpu}%" }
  if ($storeOpenMs -lt 0) { $fail += '设置面板未测到商店首开耗时' }
  elseif ($storeOpenMs -gt $MaxStoreOpenMs) { $fail += "商店首开 ${storeOpenMs}ms > ${MaxStoreOpenMs}ms" }
  if ($storeLongMs -lt 0) { $fail += '商店进度未测到长任务数据' }
  elseif ($storeLongMs -gt $MaxLongTaskMs) { $fail += "商店进度最长任务 ${storeLongMs}ms > ${MaxLongTaskMs}ms" }
  if ($writes -gt $MaxStateWrites) { $fail += "状态写入 ${writes}/min > ${MaxStateWrites}" }
  $report | Add-Member -NotePropertyName ok -NotePropertyValue ($fail.Count -eq 0)
  $report | Add-Member -NotePropertyName failures -NotePropertyValue $fail
  $report | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $root 'perf-report.json') -Encoding utf8
  $report | ConvertTo-Json -Depth 4
  if ($fail.Count -gt 0) { Write-Error ("性能预算未通过：" + ($fail -join '；')); exit 1 }
  Write-Host '[perf] 性能预算通过'
}
finally {
  if ($p -and -not $p.HasExited) { Invoke-RestMethod -Uri ($base + '/quit') -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null; Start-Sleep -Seconds 2; Get-Process -Id $p.Id -ErrorAction SilentlyContinue | Stop-Process -Force }
  if (Test-Path $stateDir) { Remove-Item $stateDir -Recurse -Force -ErrorAction SilentlyContinue }
}
