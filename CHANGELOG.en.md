[中文](CHANGELOG.md) | **English** | [日本語](CHANGELOG.ja.md)

# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [1.5.4] - 2026-11-26

Main changes since 1.5.3: a power-saving mode plus leaner startup and idle cost; downloadable character packs upgraded to format 1.0.1 (lines, replies, memes, en/ja translations and sprite parameters ship with the pack); reworked settings and panels with complete trilingual coverage; and a batch of stability fixes around the pet disappearing, click-through, the ledger and updates.

### Added

-   **Power-saving mode**: settings → Idle & auto actions gains Auto / Always / Off. On battery, idle drops to 6 fps and roaming to 30 fps, the idle video pauses and a low-frequency breathing offset takes over; the page shows AC/battery live and a power change applies within seconds
-   **Font weight**: Regular / Bold; fonts without that weight use the nearest one, and single-weight fonts use synthesized bold
-   **Unified update-failure messages**: a failed download or install shows a copyable summary that distinguishes network errors, hash mismatches, package/version mismatch, installer launch failure and disk write failure
-   **Action picker search and collapsible groups**: a live filter at the top and collapsible groups, so 100+ actions no longer require endless scrolling; the picker remembers your scroll position per character
-   **Character-pack format 1.0.1**: a pack can now carry its lines, feed/hungry/sleep replies, memes, en/ja translations and sprite parameters; every action must declare a category and the picker groups by it. The store catalogue now points at 1.0.1 — old-format packs are incompatible and need re-downloading
-   **Resumable and conditional updates**: interrupted downloads resume from the breakpoint (falling back to a full download when Range is unsupported); update checks use ETag/Last-Modified and skip re-downloading unchanged release info
-   **State-file self-healing**: a corrupt state file is backed up as `.corrupt-*` and replaced with defaults
-   **Window self-heal and visual diagnostics**: periodic checks of window size, visibility and z-order, plus a visual-stall watchdog and logs for DWM cloaking and fullscreen recovery durations (`visual-stall` / `cloak` / `fs-restore`)
-   **Download/extract size caps**: oversized packs abort with a message instead of filling the disk

### Changed

-   **Settings reorganized**: eight scenario-based categories; language moved into “Language & text”; fullscreen/ledger diagnostics and diagnostics export folded into “About & help → Advanced diagnostics”; long explanations collapse; the duplicated README link is gone from About
-   **Menu and visual polish**: Settings / Hide / Exit grouped after a separator, the ledger uses a 🧾 icon; helper text meets WCAG AA; store covers are larger and square
-   **Ledger sources**: only DeepSeek / Kimi / SiliconFlow / OpenAI / Claude official APIs remain; Qoder local transcripts and Doubao are removed and old settings are cleaned on startup; Kimi / SiliconFlow fall back to the international site on auth failure; the default source is DeepSeek
-   **Ledger settings and key entry**: switch, source, key and safety notes share one card; the key has its own block with a “Required / Configured” badge; key and custom-line dialogs open next to the pet (flipping sides when needed, closing on outside click or Esc, following the chosen font)
-   **Ledger bubble**: the tray and bubble show the platform short name and available balance; without a key it points straight to setup; auto actions pause while the ledger is open
-   **Self-drawn confirm dialogs**: replace native confirm/alert, with a red danger button, anchored to the triggering button
-   **Cleaner uninstall**: removes the whole app-data directory, separated per Full/Lite variant
-   **Auto-update is off by default for new installs**: the tray only notifies; enable it in settings
-   **Download hints appear only when an update is available**
-   **Other packs use only their own memes** (no fallback to the big-fish gallery); the self-intro uses the short pack name
-   **Installed packs migrate automatically**: after upgrading, official packs installed earlier get the 1.0.1 manifest fields (version, action categories, en/ja translations and sprite parameters) filled in at startup — only `manifest.json` changes, a `.bak-*` backup is kept, and nothing is re-downloaded or fetched; third-party packs are left untouched
-   **Trilingual coverage completed**: status bubbles, power-saving hints, update errors, store cards, key/custom-line dialogs, ledger errors and hints, pack action names and more follow the UI language

### Fixed

-   **Pet occasionally disappearing (main focus)**: title-barred full-screen windows, image viewers reporting D3D fullscreen (QUNS=3), Explorer reporting QUNS=5, z-order not restored after “show desktop”, and third-party apps changing window size/visibility are each tightened; recovery after a false hide is cut from about 2 s to about 1 s, with a final re-check before hiding
-   **Blank window when Chromium resets the media pipeline**: a cover frame is kept ready, shown immediately on media resets or frame stalls and removed when frames return (`video-reload` / `media-emptied` in the log)
-   **Click-through occasionally stuck**: the system can re-add `WS_EX_TRANSPARENT`, making the pet unclickable; it is now re-corrected against the real style every loop
-   **Bubbles swallowing clicks**: only soft areas such as bubbles are interactive; action canvases and alpha envelopes no longer are
-   **Edge clipping and flashing when switching animations or sources**: the old frame is held until the new video really presents a frame, and source switches are deferred until after the snapshot is composited
-   **Panels and menus**: settings clipped after cancelling the uninstall dialog, the uninstall dialog too far from its button, the Shift+F10 menu closed by a second contextmenu, panels not cancellable while opening
-   **Store and packs**: 404 covers/animations after packaging, old packs wrongly shown as updatable, legacy GPT-chan sprite packs rejected, local import using a Wails v1 dialog, missing download-progress events, installed list not refreshing
-   **Ledger**: endless “reading the ledger” with no cache, stale errors after saving a key, auto actions interrupting the ledger
-   **Updates and background**: package/version mismatch validation, backend and update-error messages not following the language
-   **Other**: pet flashing on PrtSc, double-click feeding occasionally missing, flicker after drag release, store button fonts not following the setting, performance-budget script missing warnings

### Performance & stability

-   Leaner startup: no network requests before the first frame; cold start to first frame is about 0.23 s
-   Store download progress updates per card, so a 40 MB download has no long tasks; panels open faster and store memory is released when settings close
-   Lossless slimming for the full build: memes converted to lossless WebP, installer from 117 MB to about 96.6 MiB (101 MB), pixel-identical to the originals
-   Streaming asset packaging cuts peak memory by more than 90% while producing byte-identical output
-   Power-idle breathing moved from a 60 fps CSS animation to the main loop (~10 fps): renderer CPU in the same state drops from about 17% to about 9%
-   Lower idle overhead: the cursor loop no longer queries work area/DPI every 30 ms (now every 2 s) and idles at 60 ms (16 ms near the pet, while dragging or with a panel open); the fallback cover frame refreshes every 3 s
-   Performance budgets now cover first frame, store first open, download long tasks and main-process CPU

## [1.5.3] - 2026-11-22

Main changes since 1.5.2: failed ledger queries can be self-diagnosed and re-checked, mandatory verification of update packages, fullscreen debouncing and diagnostics, state schema v2, diagnostic bundle export, complete Chinese / English / Japanese UI with a localized installer, and a batch of performance and stability improvements.

### Added

-   **Ledger diagnostics**: Settings → Rice Ledger gains "Re-check" and "View diagnostic details", showing the source, key source (local / environment variable), error code, HTTP status, elapsed time and last success time; the ledger bubble also shows the error hint and a "Re-check" button
-   **Validate API keys before saving**: on save the corresponding platform API is called first to validate the key; invalid / unauthorized keys (401, 403, malformed) are rejected with a reason, while unreachable networks still allow saving with a warning
-   **Fullscreen decision diagnostics**: Settings → Idle & Auto Actions can show the last 40 fullscreen decisions (time, basis, foreground window class name and size, hit count, action), making it easy to report unexpected hiding when switching windows
-   **Update package verification and optional signing**: after download `SHA256SUMS.txt` is always verified, and a mismatched hash deletes the file and refuses to execute it; without the manifest, auto-update is disabled. After configuring `UPDATE_SIGNING_KEY` / `UPDATE_SIGNING_PUBKEY`, CI generates a `.sig` and the client verifies the Ed25519 signature as well
-   **One-click diagnostic bundle export**: Settings → About → Export diagnostic bundle produces a zip (redacted settings, ledger status, fullscreen decisions, the last 256 KB of the error log, version and window information) with API keys, custom text content and linked app paths removed
-   **State schema v2**: the state file gains `schemaVersion` and an explicit migration chain, replacing one-off boolean markers such as `scale85` / `autoAction40`; old v1 files are migrated automatically at startup

### Fixed

-   **Ledger still unreadable after entering an API key ([#3](https://github.com/shenliuyu18/dafeiyu-pet/issues/3))**: previously the failure reason was flattened into a single "request failed"; now non-2xx HTTP, timeouts, proxy interception and platform error responses are all converted into structured error codes with actionable hints, and invalid configuration is surfaced already when the key is saved
-   **Pet repeatedly flashing when switching to / from a fullscreen or maximized window ([#2](https://github.com/shenliuyu18/dafeiyu-pet/issues/2))**: leaving fullscreen now requires two consecutive non-fullscreen samples that stay stable for 1.2 seconds before restoring; for 4 seconds after restoring it will not hide again because of boundary jitter, avoiding the "flash → hide → flash" loop

### Performance & Stability

-   **Merged state writes**: values that change every 20–30 seconds, such as satiety / mood / position, are no longer written to disk immediately each time; instead they are marked dirty and merged into a single write every minute by a background task; settings, feeding, hiding and quitting still save immediately, losing at most less than a minute of automatic decay progress
-   **Idle frame rate adaptation**: when not dragging and the speed is very low, the animation loop drops to about 10fps; roaming runs at about 45fps; dragging keeps 60fps. Breathing / swimming still plays at the WebM's own frame rate
-   **Pause video when hidden**: video decoding stops when the pet hides in the tray, is avoided for fullscreen or is minimized, and resumes the current action when visible again
-   **Lower hit-box sampling rate**: art / spritesheets cache the alpha bounding box by asset address, and per-frame videos are sampled every 250ms instead of every 120ms, reducing GPU readbacks from `getImageData`; the Region is expanded by 6px to cover sampling error
-   **Lower always-on-top correction rate for fullscreen**: fullscreen polling still samples every 500ms, but re-applying topmost drops from every sample to once every 5 seconds
-   **Frontend exception logging**: uncaught JS exceptions and Promise rejections are written to the local `dafeiyu-error.log` (deduplicated within 60 seconds, each entry truncated to 1500 characters); logs over 1MB are rotated to `.1`, making issue reports easier to diagnose
-   **Short-circuit animation state checks**: when satiety has not crossed the 32 threshold, the base animation selection is no longer re-run every 30 seconds
-   **Focus statistics**: Settings → Pomodoro gains today / last 7 days / cumulative minutes plus a 7-day bar chart; completed focus sessions are recorded automatically and stored only locally
-   **Character pack self-healing**: the current character pack manifest is validated at startup, and a missing or corrupt pack automatically switches back to 大肥鱼; manually switching to a broken character also falls back with a notice
-   **Extended character pack manifest**: supports `minAppVersion` / `homepage` / `tags` / `updatedAt`, and apps below the minimum version refuse to install; the store shows the pack version
-   **Installer and default language**: the installer is available in Chinese / English / Japanese and selects the system language automatically; the app also follows the system language on first launch (English for systems other than Chinese or Japanese), and shortcut names are localized too
-   **Chinese / English / Japanese multilingual support**: Settings → About can switch the language, covering the right-click menu, settings pages, runtime status hints, all built-in and downloaded-pack action names, 312 character lines and all meme captions; the tray menu, file picker and balloon notifications switch too
-   **Frontend contract types**: added `renderer/types.d.ts`, covering `window.pet`, ledger, diagnostics, Pomodoro statistics and other return structures
-   **Reproducible performance budget**: `npm run perf:check` samples startup, private memory, idle / roaming CPU and disk write counts with an isolated instance, fails with a non-zero exit code when a threshold is exceeded and generates `perf-report.json`; a manual Perf workflow is also provided
-   **Testable network layer for ledger platforms**: `httpGetJSON` supports test domain mapping, and `httptest` coverage for success / 401 / 403 / bad JSON was added for the 6 platforms
-   **Frontend logic split, first step**: the movement engine (clamp / turning / inertia / target selection) and the pseudo-random meme queue were extracted into `renderer/lib/`, with `node:test` unit tests; `npm run test:frontend` is now part of CI
-   **Animation state machine split**: base action priority (dragging > sleeping > pomodoro > hungry > moving/idle) was extracted into `renderer/lib/anim.js`, with 5 new unit tests, bringing frontend unit tests to 18
-   **Bubble layout split**: flip-down detection, left/right clamping and top pull-back were extracted into `renderer/lib/bubble-layout.js`, with 4 new unit tests; all 272 character lines got English/Japanese translations, with coverage tests added
-   **Dialogue data split**: copy data such as `QUIPS` / `CHAR_LINES` / `MEMES` moved to `renderer/lib/dialogue-data.js`, leaving only rendering logic in `pet.js`, which shrank by about 250 lines
-   **Frame scheduling split**: idle/roaming/dragging frame-rate thresholds and the 80ms position report throttle were extracted into `renderer/lib/frame-schedule.js`, with 3 new unit tests; 167 settings page strings got English/Japanese
-   **Settings page logic split**: `saveSettings` / `syncSettingsUI` / `applyLedgerUI` moved to `renderer/features/settings.js` and are copied into the build output; fixed a startup white screen caused by a missing `CODE_CHAR_DEFS`
- **Character static data split**: `CHARS` / `SPRITE` / `SPRITE_MAP` moved to `renderer/features/animation-data.js`, copied along with the features directory during the build; added a standalone loading test; `ACTIONS_BUILTIN` / `WHISPERS_BUILTIN` / `BALANCE_BUILTIN` / `PACK_CAT_WEIGHT` were migrated as well, and the fallback functions `feedLines/hungryLines/sleepLines` were restored
- **Animation function split**: 465 lines in total — `buildPackTables` / the store list / action picking / playback functions — moved to `renderer/features/animation.js`; the build output restored Region `143x162`, verified on a real machine
- **Ledger diagnostic formatting split**: `KEY_SOURCE_LABEL` / `ledgerDiagText` moved to `renderer/features/ledger-format.js` with new unit tests; pure functions became module exports to avoid initialization-path dependencies
- **Pet bounding box split**: the geometry conversion of `visiblePetRect()` was extracted into `renderer/lib/pet-rect.js` with unit tests; menu and panel alignment no longer depends on inline formulas
- **Time formatting split**: `fmtClock` / `fmtPomoMinutes` were extracted into `renderer/lib/time-format.js` with 2 new unit tests, and the countdown and focus minutes go through the module consistently
- **Right-click menu function split**: `positionMenu` / `refreshMenu` / `openMenu` / `closeMenu` moved to `renderer/features/menu.js`; also fixed the infinite recursion of `saveSettings` caused by `const api` shadowing inside the settings module
- **Pick an Action split**: 134 lines including `pickerSec` / `openPicker` / `closePicker` moved to `renderer/features/picker.js`, with Region verified on a real machine
- **Status bubble split**: `showStatus` / `creditsLine` / `applyHungry` / `applyDoze` moved to `renderer/features/status.js`, separating the status text from the hunger/doze switching
- **Hit testing split**: 114 lines in total — `alphaBounds` / `petRenderBox` / `petHitBoxes` / `hitTest` — moved to `renderer/features/hit.js`, with Region reporting working normally
- **Pomodoro logic split**: 79 lines in total — countdown, rest interval, work animation rotation and statistics refresh — moved to `renderer/features/pomodoro.js`
- **Update UI split**: `relayoutUpdatePanel` / `doCheckUpdate` / `startUpdateDownload` / `pickLinkedApp`, 106 lines in total, moved to `renderer/features/update.js`
- **Settings content split**: 15 functions in total — fonts, custom text, panel positioning and toggles — moved to `renderer/features/settings-content.js`; fixed the loss of `async` when extracting `async openSettings`
- **Ledger bubble split**: `showUsage` / `usageNote` / `renderUsage` / `retryUsage` / `syncLedgerDiag` / `recheckLedger` moved to `renderer/features/usage.js`
- **Pins and dialogs split**: `pinsFor` / `actionText` / `actionAvailable` / `updatePickerHint` / `togglePin` / `modalOpen` moved to `renderer/features/picker-pins.js`
- **Fullscreen diagnostics split**: `fsDiagLines` / `refreshFsDiag` / `toggleFsDiag` moved to `renderer/features/fs-diag.js`
- **Settings toggles split**: the 12 `apply*` functions for startup/update/position/ledger toggles moved to `renderer/features/settings-toggles.js`
- **Character parameters split**: `applyCharacter` / `applySfx` / `applyAutoActionSec` / `applyPomoMin` / `applyPomoAnimSec` moved to `renderer/features/character-settings.js`
- **Click handling and mask cache split**: `handlePetClick` / combo state moved to `renderer/features/interaction.js`; `maskCanvas` / `maskCtx` / `maskCache` merged into `features/hit.js`
- **Pointer events split**: 109 lines in total — dragging, clicking, the right-click menu, the orphan `mouseup` fallback and resize — moved to `renderer/features/pointer-events.js`, loaded after `pet.js`; on a real machine, clicking expands the Region from `134x161` to `146x337`, with bubbles working normally
- **Bubble and meme split**: 10 functions in total — `revealBubble` / `say` / `sayNow` / the meme pool and scene lines — moved to `renderer/features/bubble.js`; on a real machine, clicking expands the Region from `159x162` to `146x337`
- **Runtime helpers split**: 9 functions — `snapshotFrame` / `hideSnap` / `reportClientError` / bounds and movement engine — moved to `renderer/features/runtime.js`; after clicking, Region `134x161` → `146x318`
- **Main loop and bubble positioning split**: 9 functions — `frame` / `markPetReady` / `positionBubble` / Region keep-alive and others — moved to `renderer/features/loop.js`; after clicking, Region `138x162` → `146x318`
- **Init callback split**: the inline `api.on('init')` callback became `handleInit(st)` and moved to `renderer/features/lifecycle.js`; startup and clicking verified on a real machine
- **Main process events split**: 9 inline callbacks in total — power-resume / keys-updated / words-updated / usage / feed / awake / pomodoro-done / cursor — became named functions and moved into `renderer/features/lifecycle.js`
- **Layout constants split**: pure constants such as `PET` / sizes / Pomodoro / fonts / auto actions / API names moved to `renderer/lib/geometry-config.js`; `S`/`P` and the module destructuring stay in `pet.js`
- **Runtime actions split**: 12 functions in total — `applyLean` / `wake` / `playHappy` / `playEat` / `burstHearts` / `spawnFood` / diagnostic export and others — moved to `renderer/features/actions.js`; `setInterval(maybeShow)` now starts after `handleInit`, eliminating startup errors about an uninitialized `S`
- **Spritesheet playback split**: 9 functions in total — spritesheet loading, row-by-row sampling, sequence advance and the idle loop — moved to `renderer/features/sprite.js`; after clicking, Region `141x162` → `146x318`
- **Video and one-shot action split**: `refreshFlip` / `setPose` / `startVideo` / `poseForName` / `playAnim` / `playOnce` moved to `renderer/features/animation-playback.js`; after clicking, Region `138x162` → `146x337`
- **Lines and preview split**: `charLines` / `charIntro` / `mockApi` moved to `renderer/features/dialogue.js`; after clicking, Region `143x162` → `146x356`
- **Frontend contract types completed**: `types.d.ts` gains `InitPayload` and the signatures of all `PetLib` modules (format / i18n / anim / bubble / frameSchedule / animActions / memePool / petRect / timeFormat / ledgerFormat / settingsUi / dialogue); `tsc -p jsconfig.json` passes
-   **Default meme caption translations**: 40 captions covering MEMES and the 20 classic memes got English/Japanese, and the 123 entries of the archive / dsh libraries got them too, for 436 entries covered by tests in total

## [1.5.2] - 2026-11-20

Main changes since 1.5.1: fonts are selectable and custom fonts can be imported, readability at small sizes is improved; launching at login now uses a logon scheduled task and is simplified to off / on; fixed startup flashing, blurry bubbles and a mismatch between the autostart state and the actual task.

### Added

-   **Selectable fonts and custom import**: Settings → Size & Font adds "上首软糖体 (default) / YaHei / DengXian / KaiTi / SimSun", and supports importing local `.ttf` / `.otf` / `.woff` / `.woff2`; imported files are copied into the `fonts/` directory of the config path and still apply after a restart
-   **Better readability at small sizes**: explanatory text on the settings page went from 10.5–11.5px to 11.5–12px, and bubble body text from 14px → 15px; synthetic bold is disabled for 上首软糖体 so fake bold does not smear the strokes together

### Fixed

-   **Blurry, unreadable fonts ([#4](https://github.com/shenliuyu18/dafeiyu-pet/issues/4))**: added selectable fonts and custom import, improved readability at small sizes, and fixed blurry text when scaled
-   **The pet briefly flashes in the top-left corner before jumping to its fixed position**: at first-frame rendering the saved position was not available yet and `P` was still `(0,0)`. Now `#pet` is hidden before initialization and shown once the main process returns the position and the Region covers the final position; in a pure browser preview it falls back to showing after 1.2 seconds
-   **Blurry bubble text at the default 85% size**: the scaling layer used `transform: scale()`, so text was drawn at 100% and then shrunk; after switching to `zoom` the layout uses the final font size and the text edges are sharp again (dragging, edge-hugging bubbles and the window hit area regressed in sync)
-   **The autostart toggle showed "on" while the system had no scheduled task**: the settings page now mirrors the actual task state (enabled / task missing, needs rebuild / disabled) instead of only the local setting; when the task is missing it prompts you to click "on" again

### Changed

-   **Launching at login now uses a Windows logon scheduled task**: triggered at logon, no delay, normal privileges, with an `--autostart` argument; it no longer writes to HKCU Run, and leftover entries of the old `com.dafeiyu.desktop-pet` are cleaned up so login does not try to start a deleted old directory
-   **The autostart setting is simplified to off / on**: the two levels "normal autostart / high-priority autostart" were removed, along with the high-priority related state and process priority code

## [1.5.1] - 2026-11-17

### Fixed

-   **After downloading a character the intro still said "I am the blue big fat fish"**: the greeting was generated for the built-in 大肥鱼 before the character pack had finished registering. Now she speaks for the current character only after the pack is registered; GPT娘v1/v2 and Claude, Gemini, GLM, Grok, Kimi, Qwen each have their own intro, and DIY packs fall back to the pack name
-   **Ctrl+wheel / Ctrl+plus or minus / trackpad pinch zoomed the pet and settings panel as a whole**: WebView2 page zoom made the Region and hit area misalign. Now zoom controls and pinch zoom are disabled, 100% is forced at startup, and Ctrl+wheel, Ctrl+plus or minus and pinch gestures are intercepted in the frontend; normal wheel scrolling is unaffected

## [1.5.0] - 2026-11-17

Main changes since 1.4.8: character assets became "built-in 大肥鱼 + on-demand character pack downloads", with 8 new downloadable characters and 1 expansion pack, a unified character store, and a batch of meme, bubble and sleep fixes.

### Added

-   **Character store (on-demand download)**: Settings → Characters & Sound lists built-in, installed and downloadable character packs in one place (cover, size, action count); supports online download, local `.zip` import and uninstall at any time, and packs that are not downloaded still show a built-in preview cover
-   **9 selectable characters**: 大肥鱼, GPT娘v1, GPT娘v2, plus the six AI girls Claude, Gemini, GLM, Grok, Kimi and Qwen; all except 大肥鱼 are downloaded on demand
-   **大肥鱼 plus expansion pack**: 167 new animations, merged into 大肥鱼 once installed (animation pool 106 → 268), taking no extra character slot, and listed separately as a plus group in "Pick an Action"
-   **AI girl persona interaction text**: Claude (lots of rules, reviews everything), Gemini (Hakimi catgirl), GLM (sleepy fox girl), Grok (snarky, real-time web access), Kimi (long text, Moonshot), Qwen (an ojou-sama with plenty of compute), each with independent click / feeding / hunger / sleep lines and no shared rice jokes
-   **Action semantic mapping**: action names differ from pack to pack, so actions are mapped by in-pack category and keywords onto fixed behavior slots such as idle / work / eating and drinking / emotion / click response, falling back to idle when nothing matches
-   **Lite character packs**: downloadable packs gain a 480×270 VP9 version selected automatically by the Lite build; the Full version uses 640×360 high-quality packs
-   **Automatic multi-mirror speed selection**: downloads include a direct connection plus the ghfast / gh-proxy / ghproxy mirrors, probing throughput with the first 256 KB and trying from fastest to slowest with automatic failover
-   **DIY character pack standard**: added [docs/形象包制作标准.md](docs/%E5%BD%A2%E8%B1%A1%E5%8C%85%E5%88%B6%E4%BD%9C%E6%A0%87%E5%87%86.md), defining manifest fields, directory structure, the 640×360 transparent WebM requirements and the `idle/click/feed/sleep/drag/sad/happy/work/money/move` behavior slots; import validates id, paths, files and slot references, and zips wrapped in one extra folder are supported
-   **Supporting tools**: `tools/build-character-pack.py` (sprite sheets → transparent WebM), `tools/build-character-pack-lite.py`, `tools/install-character-packs.py`, `tools/rename-pack-assets.py`, and `tools/character-pack/{validate,make_pack}.py`

### Fixed

-   **Bubbles "pop out halfway, then pop out fully"** (the focus of this release; all three independent causes are solved):
    -   A meme whose image had not finished loading had a height of 0, so the bubble first popped as an empty strip and then grew; now memes do not take part in layout while loading
    -   CSS-embedded fonts only start downloading once glyphs use them, so `document.fonts.status` falsely reported "loaded" and the glyphs got wider and wrapped after the font arrived; now fonts are explicitly preloaded at startup
    -   When a bubble was near the screen edge, the offset was computed through several layers of "font size × pet scale × system DPI" and came out wrong; now positioning iterates to convergence until it is fully on screen
    -   All display paths — lines, click state, rice ledger, loading — go through the same gate (revealed only after fonts are ready + height is stable + position has converged), and the scale/fade animation was removed
-   **Changing memes shrank a large bubble into small text, like a black flash**: the text was changed and the image hidden before the new image was ready; now the old bubble stays until the new image has loaded, with text, image and size switching in the same frame
-   **The pseudo-random queue still drew the same meme twice in a row**: the classic meme branch bypassed the shuffle queue; now classic memes and the archive / dsh / DSniang1 memes are merged into one pool that is shuffled by scene with a shared "previous" dedupe, while true random mode still draws independently
-   **Broken covers for packs that were not downloaded in the store**: CSP does not allow remote images, yet catalog cards referenced GitHub covers directly; covers are now built into `assets/thumbs/` and display offline too
-   **GPT娘v2 was listed at the end**: the store now uses a fixed order, with GPT娘v2 right after GPT娘v1; unknown packs newly added to the catalog come after the known characters
-   **The "in use" marker did not refresh after switching characters / items disappeared after uninstalling / actions lingered after uninstalling plus**: list state, the installed scan and action table recomputation now refresh together
-   **"Let her sleep" only kept 大肥鱼 asleep, and switching characters while asleep reverted to idle**: the sleep pose pool now excludes yawn and startle actions; after switching characters she stays asleep and plays the new character's sleep pose
-   **大肥鱼 plus actions did not appear in "Pick an Action"**: at startup the action table was built before the character pack scan, and the panel had no plus group; now the current 大肥鱼 is recomputed after the expansion pack is scanned, with plus listed separately
-   **The character vanished for a moment when clicking quickly / switching actions**: switching the video source left a gap where she disappeared and reappeared; now the current frame is snapshotted over the original position before switching and removed once the new video starts playing
-   **Blank pet after downloading GPT娘v1**: the spritesheet pack was applied as the video character `pack:gptv1`; it is now mapped back to the `gpt` character in code and rendered as the 73-frame spritesheet
-   **Store text injection and zip size bypass**: store cards now HTML-escape the name, license and cover from the manifest; extraction enforces the 2 GB limit again against the actual bytes written, so a forged zip header cannot bypass it; updating a character pack that is in use now prompts you to switch characters first instead of re-downloading from every mirror
-   **Image quality loss in character packs**: Full packs went from CRF 40 to CRF 32 + `sharpness 2`, still 640×360 VP9 transparent WebM, raising the PSNR in the character area by about 2 dB; Lite assets were regenerated at 480×270 from the new full packs
-   **Encoding and memory issues in the transcoding tools**: Chinese file names broke output on Windows cp1252, so UTF-8 is now forced; large sprite sheets now use PIL per-frame cropping with a raw pixel pipeline, cutting single-process memory from about 830 MB → 250 MB
-   **Downloads of large character packs timing out**: the download timeout was loosened from 10 minutes to 60 minutes so packs of 100 MB+ do not fail midway on slow lines

### Changed

-   **大肥鱼v2 removed**, 大肥鱼v1 renamed to "大肥鱼", and the expansion pack renamed to "大肥鱼 plus"; the expression art of 大肥鱼 v3–v6 and the old GPT娘v2 was removed at the same time, while DSniang1 is kept as a meme
-   **"Desktop pet character" and "character pack" in settings merged into one list**: built-in, installed and downloadable packs sit together, with switching / uninstalling / downloading in one place
-   **Asset files are named uniformly** as `<pack-id>-<action-name>.webm`, and the app resolves them from the in-pack manifest, so identically named actions in different packs no longer overwrite each other
-   **Font sizes, spacing and corner radii unified globally**: settings, right-click menu, action panel and character list all scale proportionally with "Size & Font"
-   **Asset hosting moved**: character packs and covers moved to the Release of the separate asset repository [dafeiyu-pet-assets](https://github.com/shenliuyu18/dafeiyu-pet-assets); the `packs` branch of the main repository has been deleted and the app reads the catalog from the asset repository
-   **Open-source license and attribution**: the program code is open source under MIT; character assets are used under the licenses of their respective sources, see "License" and "Asset sources and licenses" in the README
-   **Engineering**: CI adds version consistency, gofmt, JS/Python syntax, go vet, go test and a compile check; the Release tag is entered manually, tags containing `-` are automatically marked as pre-releases, and `SHA256SUMS.txt` is attached

### Notes

-   The installer still only bundles 大肥鱼 (106 actions); the other character packs are downloaded on demand and do not increase the installer size
-   Full character packs are transcoded at 640×360 CRF 32; the Lite version uses 480×270
-   For character pack asset licensing see "Asset sources and licenses" in the README

## [1.4.8] - 2026-11-15

### Fixed

-   **The whole desktop goes blurry after launching on Windows 10** (#1): on systems before 22621 Wails applied `ACCENT_ENABLE_BLURBEHIND` (Aero blur) to the transparent window, and since the pet window covers the whole work area it was effectively blurring the entire desktop. The new version removes that layer entirely (the `AccentPolicy` is set to disabled); the window has no redirected surface anyway, so after removal only the WebView2-composited content remains and the desktop shows through sharp as is; it is cleared again after returning from fullscreen avoidance or re-showing the window. If a particular machine turns black because of this, add `"blurFix": false` to the state file to return to the old behavior
-   **The pet repeatedly flashes and hides** (#2): fullscreen avoidance changed from "hide on a single sample" to two consecutive confirmations (about 1 second); broad signals such as `QUNS_BUSY` / presentation mode get an extra geometry check of the foreground window; hiding is no longer triggered while a panel is open or while dragging; and at startup, if a fullscreen app is already in the foreground, she no longer flashes first and hides afterwards
-   **Ledger unreadable even with an API key configured** (#3): API requests are now deduplicated per platform (previously one stuck platform would starve the others); the cache is re-fetched after 45 seconds; async results refresh the ledger bubble in place while it is open; when Qoder cannot find session records, or the key is invalid or lacks permission, the reason is stated directly in the bubble instead of a row of "—"
-   Asynchronous ledger requests other than the update check no longer overwrite an already displayed error state
-   **Accounts with a zero balance were misjudged as "no ledger data yet"** (found in a real DeepSeek test): when the API returns `is_available=false` (insufficient balance / disabled), all three balance rows were in fact read, yet the request was treated as failed; now the three numbers are displayed as usual with a note saying "account currently unavailable"
-   **The tray menu gains a "Fix blurry Win10 background" check item** (only on Win10): should a machine render black after the blur is removed, unchecking it from the tray immediately returns to the old behavior without editing the state file

### Improved

-   **Memory usage**: asset reads now return zero-copy slices straight from `assets.zip` (previously the whole file was read into the heap on every request); temporary buffers are returned to the system after startup and when idle — resident memory measured at about 1GB → about 60MB
-   **Position reporting and Region refresh**: the frontend report interval went from 50ms → 80ms, with a lower rate when still; the Go side skips identical reports entirely; Region updates are throttled with a supplementary refresh, avoiding recreating GDI regions through `SetWindowRgn` twenty times a second
-   **Engineering**: added `.gitattributes` to enforce LF on disk; `tools/wails-build.js` supports externally supplied `GOPATH` / `GOPROXY`; added GitHub Actions — push/PR runs version consistency checks + `go vet` + `go test` + a compile check, and tags automatically build the Full and Lite versions and create a Release

### Changed

-   Stable installers: `dafeiyu-pet-1.4.8-setup.exe` / `dafeiyu-pet-lite-1.4.8-setup.exe`

## [1.4.7] - 2026-11-06

### Added

-   **GPT娘v2 (test)**: a new adult-design white-haired white dragon girl, using 8 expressions from ai-chan-sheets as circular avatar cards; idle, click, feeding, work, sleep and mood states switch to the matching expression; selectable alongside the GPT girl in settings
-   **dsh-meme 大肥鱼 library**: 64 deduplicated memes imported from yyh-001/dsh-meme and dsh-meme-packs, covering clicking, eating, working, sleeping, being happy, errors, the ledger and other scenes, each with its own caption
-   **Meme library deduplication**: cleaned up 7 duplicate classic memes (压力一只大肥鱼, 吃吃饱摸肚子, 大烧货, 就一碗, 深度睡眠, 电死你, 除了调情没啥用) and 1 duplicate archive image; 9 images in the new pack that duplicated existing ones were not imported twice

### Changed

-   The meme library is now 20 classic memes + 59 archive selections + 64 dsh-meme images, 143 in total
-   GPT娘v2 assets are used non-commercially under CC BY-NC-SA 4.0 with attribution kept, see `THIRD-PARTY-ai-chan-sheets-NOTICE.txt`
-   dafeiyu-001 / dafeiyu-learned are personal libraries; commercial use or redistribution requires permission from the rights holder; pack-mvc2p5cv is CC BY-NC-SA 4.0, see `THIRD-PARTY-dsh-meme-NOTICE.txt` for attribution
-   Stable installers: `dafeiyu-pet-1.4.7-setup.exe` / `dafeiyu-pet-lite-1.4.7-setup.exe`

## [1.4.6] - 2026-10-22

### Added

-   **Selectable click-meme play order**: Settings → Characters & Sound adds "pseudo-random queue / true random"; pseudo-random first shuffles the click meme combinations into a queue and plays them in order, reshuffling when done and avoiding repeating the last meme of one round as the first of the next; true random draws independently every time with equal probability for every combination

### Changed

-   Stable installers: `dafeiyu-pet-1.4.6-setup.exe` / `dafeiyu-pet-lite-1.4.6-setup.exe`

## [1.4.5] - 2026-10-22

### Added

-   **Archive selection memes**: 60 original images selected from the 蓝色大肥鱼档案馆 (Blue Big Fat Fish Archive), covering clicking, feeding, hunger, sleeping, working, errors, being happy and the ledger; each meme comes with a caption that fits the picture, so interactions no longer combine unrelated lines at random
-   **Complete GPT girl spritesheet animation**: the GPT girl now uses a 73-frame transparent spritesheet, supporting idle, running left and right, waving, hovering, waiting, working, celebrating and a 16-direction mouse gaze, with matching new entries in "Pick an Action"

### Fixed

-   **The GPT girl did not play a running animation while moving**: movement actions now play two sets of running frames by facing direction instead of falling back to idle
-   **The same state triggered repeatedly, replaying the animation from the start**: looping animations such as idle/work keep their current frame sequence unless a replay is requested, so actions are not interrupted over and over
-   **The 16-direction gaze pointed off-target**: the gaze angle is now computed from the character's actual drawing center
-   **Build outputs loaded the meme list twice**: `archive-memes.js` keeps only one reference with a version number, avoiding stale caches

### Changed

-   Stable installers: `dafeiyu-pet-1.4.5-setup.exe` / `dafeiyu-pet-lite-1.4.5-setup.exe`
-   The Full version keeps the original archive memes; the Lite version compresses archive memes to 480px WebP, while the GPT girl spritesheet stays as is
-   Added the CC BY-NC-SA 4.0 attribution for the 蓝色大肥鱼档案馆 and the gpt-pet MIT license, and asset sources are shown in "About 大肥鱼桌宠"

## [1.4.4] - 2026-10-22

### Added

-   **Auto-avoidance for fullscreen video/games**: when a fullscreen video is playing in the foreground, a fullscreen game is running or presentation mode is entered, the pet hides automatically instead of sitting on top of the picture; after leaving fullscreen she returns above other windows. Normal windows (including maximized ones) are unaffected; Settings → idle position adds a "fullscreen video / games" toggle, on by default
-   **High-priority launch at startup**: autostart gained two levels, "normal autostart / high-priority autostart"; high priority sets the pet process to Windows `HIGH_PRIORITY_CLASS`, so it stutters less when the system is busy, and switching back to normal or turning it off restores normal priority immediately
-   **Safety self-check after sleep/hibernate resume**: after waking from hibernate or sleep the window, always-on-top state, responsiveness and Region are checked; normal cases are fixed silently, and abnormal ones save the state and restart the pet automatically; this does not happen when the pet was hidden deliberately

### Fixed

-   **Clicking check-for-updates repeatedly occasionally found no new version**: duplicate requests are ignored while a check is running, so concurrent results cannot overwrite each other; a failed check keeps the previously found version and the download button; GitHub rate limits or non-200 responses give a clear hint; successful results are reused for 8 seconds to reduce duplicate requests
-   **Files in use during install/uninstall**: the installer and uninstaller now close the running pet first (graceful shutdown, then force-kill on timeout) before writing or deleting files
-   **The settings panel went off-screen after a new version was detected**: when the update prompt and download button appear and text wrapping changes the panel size, it is re-aligned to the screen edge automatically
-   **The pet did not return after being dragged in bottom-right dock mode**: the return constraint now takes precedence over sleep, idle performances and Pomodoro state, so she swims back to the bottom-right corner from anywhere

### Changed

-   Stable installers: `dafeiyu-pet-1.4.4-setup.exe` / `dafeiyu-pet-lite-1.4.4-setup.exe`

## [1.4.3] - 2026-10-19

### Fixed

-   **The right-click menu occasionally showed only partly, with the upper half unclickable**: when a panel was open the window Region could still be the pet hit area, leaving the upper half of the menu outside the Region, both clipped and leaking clicks to the desktop. Now the actual window Region is read before expanding it and retried if it did not expand; frontend panel calls also retry on failure, and the first open waits for fonts to be ready
-   **Removed the scaling compositing layer from the menu/settings/action panels**: pure fade in and out instead, avoiding occasional blank text layers under a transparent WebView2 window

### Changed

-   Stable installers: `dafeiyu-pet-1.4.3-setup.exe` / `dafeiyu-pet-lite-1.4.3-setup.exe`

## [1.4.2] - 2026-10-19

### Added

-   **Lanzou Cloud download entry**: the download section of the website and the third update button on the "Startup & Updates" page in the app offer "Lanzou Cloud download (password 5meo)"; from now on stable releases update the GitHub Release and the Lanzou Cloud drive together
-   **Install directly after a GitHub download**: after "GitHub direct download" or "GitHub accelerated download" on the update page finishes, the current pet closes automatically and the interactive installer opens; when the installation finishes or is cancelled the pet reopens automatically

### Changed

-   Stable installers: `dafeiyu-pet-1.4.2-setup.exe` / `dafeiyu-pet-lite-1.4.2-setup.exe`

## [1.4.1] - 2026-10-18

### Fixed

-   **大肥鱼 flashed/jumped when the Full and Lite versions ran together**: both versions shared the same window class name, so when Lite started `FindWindow` grabbed the Full version's window, and the two backends took turns setting position and Region on the same window, making the picture flicker between both states; Lite's own window stayed hidden the whole time. Now the Full and Lite versions use separate window class names, and `findPetWindow` validates against the current process PID and never binds across processes; each version manages only its own window

### Changed

-   Stable installers: `dafeiyu-pet-1.4.1-setup.exe` / `dafeiyu-pet-lite-1.4.1-setup.exe`

## [1.4.0] - 2026-10-18

### Added

-   **"Pick an Action" supports custom pins**: click the ☆ to the right of an action to pin frequently used ones, click again to unpin; up to 10 per character, the pinned section sits at the top of the action panel and survives a restart. The Full and Lite versions save them separately
-   **New icon**: candidate 6 (大肥鱼v6 calm artwork) was adopted, cropped from the existing assets into a text-free, transparent-background design, generating a multi-size ICO from 16 to 256 and replacing the icons of the exe, tray, installer and desktop/Start menu shortcuts
-   **Custom interaction text** (Settings → Custom Interaction Text): a separate input window, one line per entry, up to 20 lines and 40 characters per line; when enabled, clicking the pet and idle chatter prefer the custom lines; saving non-empty text enables it automatically
-   **Offline sensitive-word filtering**: [Konsheng/Sensitive-lexicon](https://github.com/Konsheng/Sensitive-lexicon) was adopted (MIT; the original lexicon has 48,000+ entries, about 30,000 remain after deduplication and filtering out single characters, pure numbers, URLs and benign words); validated both on save and at startup, all matched locally with no network access and no text upload; lines containing sensitive words are rejected with the line number
-   **Adjustable Pomodoro work animation interval** (Settings → Pomodoro): after the previous work animation plays through completely, she rests for the specified time before the next one (writing code / thinking / busy / counting); default **5 seconds**, adjustable from 5 to 120 seconds in 5-second steps; the interval only affects work animations and no other auto actions run
-   **Full / Lite dual versions**: the Full version keeps all original assets (installer 68.6MiB / about 74.7MiB installed); the Lite version resamples animations to 480×270 VP9-alpha and shrinks art to WebP q84 with a longest edge of 720, keeping all 106 animations, sound effects, fonts, memes and the sensitive-word lexicon (installer 39.7MiB / about 46.0MiB installed). The two versions have independent install directories, state directories, single instances and autostart entries and can run at the same time; update checks pick the matching installer per version
-   **Unified icons**: the app exe, tray, installer and desktop/Start menu shortcuts all use multi-size icons generated from `assets/logo.png`

### Fixed

-   **The right-click menu occasionally showed only partly in the bottom-right corner**: the menu now waits for fonts/layout to stabilize after showing, re-reads its width and height, and clamps them with an 8px safe margin on all sides of the viewport; a ResizeObserver and re-positioning on window resize prevent it from going off-screen after content changes or a font swap; the menu itself is also limited in maximum width/height and can scroll
-   **Hardened update package selection for Full/Lite**: update assets are now strictly distinguished by the `dafeiyu-pet-` / `dafeiyu-pet-lite-` prefixes, so the Full version never picks Lite and vice versa; the asset name is verified again before downloading/auto-installing, and a mismatch raises an error instead of downloading the wrong version. New Go unit tests cover both versions and the old `wails` file names
-   **The pet window covered too large an area, blocking clicks and scrolling on empty space**: the window Region used to be a fixed rectangle of about 468×867 CSS around the pet, most of it transparent emptiness. Now the frontend reports the character hit area + **the alpha bounding box of the current animation frame/art** + the bounding boxes of the bubble, countdown sign, effects and sleepy Zzz, and Go merges them into the visible area with `CombineRgn`; without a bubble the area is about 144×175 CSS. Empty space no longer belongs to the window, so mouse clicks/scrolling land directly on the desktop or other apps; the area expands and shrinks instantly when bubbles appear/disappear and panels open/close, while clicking the pet itself and focusing settings work normally; art sides and actions with props are not clipped
-   **The startup position could be overwritten by `(0,0)`**: the frontend no longer reports a position before initialization completes, so the top-left coordinates are not written into the state file
-   **The GitHub repository button on the "About 大肥鱼桌宠" page did nothing**: the external link whitelist required the repository URL to have a trailing `/`, while the button used the repository home page without it and was silently blocked. The whitelist now also accepts the repository home page itself; the "Releases updates" button became "Changelog" and points to the repository's `CHANGELOG.md`
-   **Frequent action switching during the Pomodoro**: the Go backend pushed the countdown once per second and the frontend re-ran `applyBase()` every time, so the work animation jumped back and forth between 4 random actions. Now only the countdown number refreshes every second; no other actions run automatically during focus, and a work animation that finishes pauses for the "work animation interval" before the next one; manual operations such as right-click "Pick an Action" and click interactions still play normally and enter the interval when done
-   **The Pomodoro moved the pet toward the top-left corner in bottom-right dock mode**: starting focus set the position target 30px inward from the corner and ending it swam toward the screen center. Now only "roam anywhere" mode swims to a corner during focus; bottom-right / stay fixed modes stay put when focus starts and ends
-   **The top of the left-click bubble was clipped / right-click settings occasionally showed only partly / closing the menu flashed a clipped frame**: the window Region previously left only one rather small rectangle, so tall bubbles/memes had their tops cut off; right-clicking "Settings" called `closeMenu → setPanel(null)` and `openSettings → setPanel(true)` asynchronously, which could reorder and leave the Region on the pet area after settings opened. The Region now covers the whole bubble/meme/ledger card/countdown sign, both flipped up and down; panel/focus calls are serialized; the Region is expanded before showing a panel and shrunk 260ms after closing it (covering the 160ms fade-out); frontend assets carry a version number against caching. Frame-by-frame verification in fullscreen confirmed settings/menus display fully while opening and closing
-   **Clicks on the fullscreen desktop stopped working except on the taskbar while the pet was running**: the WebView2 child window inside the fullscreen Wails window swallowed mouse events, and adding `WS_EX_TRANSPARENT` to the top-level/child window alone was not enough; this was changed to a dynamic window Region that counts only the pet, bubble and countdown sign areas as the window, temporarily restoring the whole window for menus/settings/dragging. The background window click test went from "BLOCKED" to "PASS", while clicking the pet and focusing settings still work
-   **The second half of some long actions was cut off**: one-shot actions used a 6-second fallback timer while video metadata had not loaded yet, so 10-second animations often switched back to idle at 6.4 seconds; now it waits for metadata and times by the video's real duration (15-second hard limit + end-event fallback)
-   **Operating the API key / custom text dialog in settings closed settings by mistake**: the dialog sits outside the settings panel, so clicking an input or button was treated as "clicking outside the panel" and closed settings, after which the dialog was clipped by the Region. Now the dialog opening no longer triggers the settings/menu "close on outside click", and input, saving and clearing all stay visible throughout
-   **Rapid consecutive setting changes could be overwritten by old values**: the settings API sends a whole snapshot, so several asynchronous saves could land out of order (a real test wiped "apps to launch together"). Settings saving became a serial frontend queue that persists strictly in operation order
-   **Some settings jumped back to the default at the lower limit**: pressing "−5 seconds" again at a 5-second auto action interval jumped back to 40 seconds, and the Pomodoro duration had the same problem; now the minimum is kept at the boundary. When the update download/auto-install API immediately returns a failure, the button is no longer locked forever and shows the reason

-   **No version information in Windows file properties**: Wails by default puts the version string in the language-neutral block, so Explorer's "Details" showed blanks; after adding FileVersion and the 0409/0804 string tables, the exe properties of both the Full and Lite versions show the file version, product version 1.4.0.0 and the product name

### Changed

-   **Architecture migration: Electron → Wails v2 + system WebView2**: Chromium is no longer bundled. The Full main program is about 78.2MB (including all original assets), the NSIS installer about **68.6MiB**, and about **74.7MiB** installed; the Lite main program is about 48.1MB, the installer about **39.7MiB**, and about **46.0MiB** installed (the Electron installer was 136MiB / about 314MB installed). Transparent window, per-pixel alpha, always-on-top/click-through, tray, settings, ledger, API keys (DPAPI), custom text, update check and silent install, autostart and linked launch have all been ported and verified in the installed build. Click-through uses a dynamic Region; the installer uses `-webview2 download`, and a missing runtime is installed through the bundled Microsoft online bootstrapper.
-   **The setup wizard is now in Simplified Chinese**: welcome, choosing the install directory, installing, finishing and uninstalling pages are all Chinese; the WebView2 installation prompt and the unsupported Windows version/architecture prompts were localized too.
-   **Zero asset compression (Full only)**: all Full assets are written byte-for-byte into a store-only `assets.zip` (no re-encoding, no downsampling, no font subsetting) and read directly by the Go virtual fs; the Full version must not compress assets again in the future. The Lite version is a new separate build whose compressed results are written only to `assets-lite/` and never modify the original `assets/`.
-   **Restored upstream highest-quality assets**: the 106 animations went back to the original dsh-pet WebM (51.8MB, no more lossy re-encodes); v2–v5 art was re-normalized from upstream PNG at 1280×720 / 2× content height (WebP q95); v6 and GPT girl art were remade at high resolution; 27 memes became lossless WebP; the font went back to the full 上首软糖体 (WOFF2 about 2.2MB, supporting any custom Chinese characters)
-   Font size adjustment now also affects the **right-click menu** and the **"Pick an Action" panel** (bubbles, menu and action panel scale together; the settings panel has a fixed layout and does not follow)
-   **Removed the old Electron version**: deleted the Electron main process, preload bridge, old API key / custom text windows and old packaging dev tools, removed the `electron` / `electron-builder` dependencies and `node_modules`, and no longer provide an Electron fallback build; also deleted the obsolete animation re-encoding and font subsetting scripts to avoid misuse. The Full install path is `%LOCALAPPDATA%\Programs\大肥鱼桌宠` and the Lite one `%LOCALAPPDATA%\Programs\大肥鱼桌宠 Lite`; the Full version keeps `%APPDATA%\dafeiyu-desktop-pet` and the Lite version uses `%APPDATA%\dafeiyu-desktop-pet-lite`, so both can run at the same time. To upgrade from the old Electron version, uninstall it first
-   **Removed `wails` from installer names**: the stable files are `dafeiyu-pet-1.4.0-setup.exe` and `dafeiyu-pet-lite-1.4.0-setup.exe`; the build script, README and update-check asset naming were synced
-   **Build privacy cleanup**: builds use `-trimpath` / `-buildvcs=false` so local Go toolchain paths (including the Windows user name) and VCS information are not written into the exe; sources, asset metadata and build outputs were scanned, and no Qoder account, API key, device identifier or user directory path was found

## [1.3.0](https://github.com/shenliuyu18/dafeiyu-pet/releases/tag/v1.3.0) - 2026-10-17

> ⚠️ **Must read before upgrading: uninstall the old version (1.2.0 and earlier) before installing 1.3.0.** Installing over it will not clean up the files left by the old version (old fonts, memes, redundant DLLs, easily 40MB+ wasted) and may mix old and new shortcuts.

### Added

-   **Multiple switchable characters** (Settings → Characters & Sound): 大肥鱼v1 (106 frame-by-frame animations) / 大肥鱼v2–v5 (the four expression sets from [dsh-whale-widget-plus](https://github.com/louke6572/dsh-whale-widget-plus), with 18 / 32 / 32 / 16 poses) / 大肥鱼v6 ([DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) art + head-pat GIF) / GPT girl (test content); art-based characters change pose by state with breathing float, and each has its own "Pick an Action" list
-   **Two-level settings menu**: Characters & Sound / Size & Font / Idle & Auto Actions / Pomodoro / Rice Ledger / Startup & Updates / About 大肥鱼桌宠; the panel never goes off-screen no matter where the pet is or which sub-page is selected, and opens attached to the pet itself
-   **The rice ledger extended to multi-platform bills**: the source can be switched between Qoder credits / DeepSeek / Kimi (Moonshot) / SiliconFlow / Doubao (Volcano Engine) / ChatGPT (OpenAI) / Claude (Anthropic); each platform's API key is configured in settings through a separate small window, **encrypted and stored with Windows DPAPI**, sent only to the corresponding platform's official API when querying, with a prominent risk warning; environment variables also work as a fallback
-   **Check GitHub updates + auto-update**: results are shown inline in settings (no system dialog); a new version can be "GitHub direct download", "GitHub accelerated download (gh-proxy)" (saved to Downloads) or "auto-install update" (download + silent install + automatic restart); checked automatically on the first launch each day, and **auto-update can be toggled in settings (on by default)**
-   **Sound pack switching**: default / whale SFX (the press/release cues of the DeepSeek whale widget) / mute
-   **Adjustable font size**: 80%–140%, affecting the text in bubbles
-   **New idle position "stay fixed"**: she stays wherever you drop her, and does not wander during the Pomodoro either
-   **Launch at startup** and **apps to launch together** (opens the apps you choose when the pet starts)
-   **Adjustable auto action interval**: 5–300 seconds (default 40 seconds); every interval she performs a random action
-   **Custom Pomodoro duration**: 15 / 25 / 45 / 60 minute presets + ±5 minute fine-tuning (5–120 minutes)
-   **"About 大肥鱼桌宠" page**: version number, GitHub repository / Releases / issue links, full usage instructions and asset credits

### Fixed

-   **Double-click feeding occasionally failed** (with multiple windows/versions, the "press" was swallowed by the system and the browser produced no dblclick): now the combo count is tracked manually (two clicks within 500ms feed her), and an orphan "only up" event landing on the fish also counts as a click
-   **The bubble extended off-screen in "stay in the bottom-right corner" mode**: with the pet hugging the bottom-right corner, the bubble is pulled back automatically, leaving only a few pixels between its right border and the right screen border
-   **The settings panel went off-screen after switching to a long page**: it is clamped into the screen again based on the panel's actual size
-   The ledger number card no longer lingers in normal bubbles after the rice ledger was viewed

### Improved

-   **Size reduction**: the installer went from 140.9MB → about 100MB (animations re-encoded in two tiers, "always visible / occasional performance", 51.8→23.2MB, 27 memes PNG→WebP 4.7→0.7MB, the font subsetted to the glyphs used by the source 3.9→0.3MB, 32.4MB of unused Electron components trimmed)
-   The default size changed to 85% of the previous one (levels: small 70% / default 85% / large 110% / extra large 140%, with a one-time migration of old state)
-   Selecting an action in "Pick an Action" now only performs it, without popping up the action name
-   The GPT girl lost the DeepSeek-related memes and lines, and her menu shows "Feed" and "Usage Ledger"

### Notes

-   The software name stays "大肥鱼桌宠", installer `dafeiyu-pet-1.3.0-setup.exe`
-   Art-based characters are static expression images (the assets themselves have no frame-by-frame animation) and change pose by state
-   The lower bound of the install size is set by the Electron runtime (the main exe alone is about 200MB), and about 275MB installed

## [1.2.0](https://github.com/shenliuyu18/dafeiyu-pet/releases/tag/v1.2.0) - 2026-10-16

> ⚠️ **Must read before upgrading: uninstall the old version before installing 1.2.0.**  
> This release changed the names and install identities of the two versions (see "Changed" below); installing over the old version will not clean up the files it left behind — old fonts, old memes, the trimmed old DLLs and so on easily waste another 40MB or more, and desktop/Start menu shortcuts may mix old and new.  
> Uninstall "Full" / "Simple" 1.1.0 and earlier in "Windows Settings → Apps" first, then install the new version.

### Changed

-   **The two versions were renamed (same features, just names)**:
    -   The former "Simple" (without Qoder features) became the default **standard version "大肥鱼桌宠"**, installer `dafeiyu-pet-1.2.0-setup.exe`
    -   The former "Full" was renamed **"大肥鱼桌宠·适配Qoder版"** (with the rice ledger and plan reminders), installer `dafeiyu-pet-qoder-1.2.0-setup.exe`
    -   The install directory, data directory, shortcuts and uninstall entries of the two versions remain fully independent, and they can be installed and run at the same time; on first launch the Qoder edition automatically carries over the configuration (plan quota, Pomodoro duration, size, etc.) from the 1.1.0 Full data directory
-   **The default size changed to 85% of the previous one**: the size levels were adjusted to small 70% / default 85% / large 110% / extra large 140% (±5% fine-tuning unchanged); an old state file holding the old default 100% is migrated automatically on first launch, while other ratios you adjusted manually are unaffected

### Added

-   **Custom Pomodoro duration**: the settings panel gains "Pomodoro duration", with 15 / 25 / 45 / 60 minute presets and ±5 minute fine-tuning (range 5–120 minutes); "Start focus" in the right-click menu and the tray follows the current setting and survives a restart
-   **"Pick an Action…" added to the right-click menu and tray**: opens a categorized action panel (basic states / what to eat / click responses / small actions / play / seasons / work and ledger / text chatter / others) with all 106 animations and not one missing; click once and she performs it for you immediately; clicking the same action again replays it from the start

### Fixed

-   **Double-click feeding occasionally failed when both versions ran together**: in such an environment some "press" events are swallowed by the system and the browser no longer produces a `dblclick`, so double-clicking does nothing. Now the combo is detected by the app itself (two clicks within 500ms feed her, and fast repeated clicks only feed once), and an orphan "only up" event landing on the fish also counts as a click, using the same fallback logic as the panel buttons

### Improved

-   **Big size reduction: installer 140.9MB → 98.0MB, installed 344MB → 275MB**
    -   The 106 animations were re-encoded in two tiers, "always visible / occasional performance" (crf46@24fps / crf52@16fps): 51.8MB → 23.2MB, with the alpha channel preserved and verified file by file
    -   27 memes PNG → WebP: 4.7MB → 0.7MB
    -   上首软糖体 subsetted to WOFF2 with the glyphs the program actually uses: 3.9MB → 0.2MB (this was reverted in 1.4.0 and the full font restored; the subsetting script was removed)
    -   Components unused by the Electron runtime are trimmed at packaging time (dxcompiler / dxil / vk\_swiftshader / vulkan-1, used only by WebGPU and software Vulkan): another 32.4MB saved

### Notes

-   The lower bound of the install size is determined by the Electron framework itself: the main exe alone is 201MB (Chromium + V8 runtime), so 275MB is basically the floor

## [1.1.0](https://github.com/shenliuyu18/dafeiyu-pet/releases/tag/v1.1.0) - 2026-10-16

### Added

-   **Settings UI** (opened from the right-click menu / tray):
    -   Size: small (75%) / default (100%) / large (125%) / extra large (150%) presets, plus 5% fine-tuning buttons in the 0.6×–1.6× range; the default 100% is the original size
    -   Idle position: **roam anywhere** (original behavior) / **stay in the bottom-right corner** (no wandering, swims back on her own after being dragged away, and jumps straight to the corner when selected)
    -   Quick reference of controls (single click / double click / drag / right click / mouse nearby / dozing)
    -   Settings are written to the state file and survive a restart
-   **Simple build** (`dafeiyu-pet-lite-*` in the Release): removes the rice ledger, tray usage display and plan reminders, and works fine without Qoder installed; independent install directory, independent data directory and independent uninstall entry, so it can be installed, run and uninstalled alongside the Full version

### Improved

-   Packaging enables `compression: maximum` and keeps only the Chinese and English language packs: the installer drops from 148.5MB to 140.9MB
-   Idle performances and memes now use previously unused assets (looking around / busy tapping / counting and archiving / 12 memes), so all 106 animations are used
-   Removed unused notification icons (notify-test / notify-approval)
-   Size scaling goes through a CSS `scale` on the whole layer, and the hit box / movement bounds / mouse click-through decisions are converted proportionally, so dragging and clicking are precise at every level from 0.6× to 1.6×
-   Edge avoidance: the Pomodoro countdown sign flips to the lower edge of the fish body when it approaches the bottom edge of the screen (so the taskbar does not cover it); the bubble flips below the fish when it approaches the top edge of the screen (so it is not clipped)

### Fixed

-   **Input problems when both versions ran together** ("menu freezes", clicking empty space does not close the menu): removed the system-level mouse hook that swallowed clicks (`setIgnoreMouseEvents` no longer uses `forward`); the program no longer manipulates window z-order (z reordering between two always-on-top windows makes mouse events get lost in batches); the whole window receives mouse input while a panel (menu/settings card) is open; added an "orphan up" fallback — an "up" event without a paired press landing on a button dispatches the click, and landing outside the panel closes it
-   The install / uninstall of the two versions overwrote each other: the Simple build uses an independent `name` and install directory (`%LOCALAPPDATA%\Programs\dafeiyu-desktop-pet-lite`) and an independent uninstall entry, without affecting each other
-   The "rice ledger" description line and bubble ledger content left in the Simple build UI were removed, and there is no more Qoder-related content in the interface
-   The Pomodoro countdown sign was covered by the taskbar when the fish hugged the bottom edge of the screen (for example pinned to the bottom-right corner)

## [1.0.0](https://github.com/shenliuyu18/dafeiyu-pet/releases/tag/v1.0.0) - 2026-10-15

First stable release: a big blue fat fish swimming around on your desktop — loves plain rice, loves slacking off, and occasionally dozes off 🐳🍚

### Characters & animations

-   106 640×360 VP9-alpha transparent WebM animations (from the open-source project [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet), MIT): idle breathing / floating steps / crab walk / eating plain rice / eating tokens / dangling from the mouse / 5 click responses / dozing off / writing code / balance settlement / Rubik's cube / fireworks / Mid-Autumn moon gazing / decorating the Christmas tree …
-   Animation state machine: 22 core animations switch by the priority "dragging > sleeping > pomodoro > hungry > moving / idle"; one-shot actions such as clicking / feeding / the ledger return to the base state automatically when done
-   Idle performances are drawn at random by weight (small actions 20 / play 20 / what to eat 16 / seasons 14 / text 10), with a 25% chance of turning into idle chatter
-   Animations that contain text (`是啊，吃什么`, `深度思考碎碎念`) are excluded from mirroring so the text is not flipped left to right

### Interactions

-   Drag: a real grabbing feel + inertia coasting on release, playing the "dangling from the mouse" animation with the cursor turning into a grab hand
-   Single click: a pat, playing a random click-response animation + a punchy line + a meme, mood +1
-   Double click: feed a bowl of plain rice (eating plain rice / eating tokens / big bite of snacks animations), refilling satiety and raising mood
-   Right-click menu: Feed Rice / Pomodoro / Rice Ledger / Status / Sleep / Hide Away / Quit
-   Mouse nearby: leans gently toward the cursor (at most 5px, disabled while dragging); occasionally swims over out of curiosity
-   Automatic roaming + bouncing off screen edges; after about 100 seconds of being ignored she starts dozing off (dozing animation + Zzz bubble)
-   Tray: show / hide, rice ledger, Pomodoro, quit; notifications carry icons (done / warning / question and so on)
-   Sound effects: `success` plays when feeding succeeds and when the Pomodoro ends, `error` when focus is cancelled (volume about 0.3, unobtrusive)

### 🍚 Rice Ledger (Qoder usage)

-   Aggregates the session transcripts of the local Qoder desktop client (the real `message.usage.credits` of every assistant message in `~/.qoder-cn/projects/**/*.jsonl`, including subagents) and shows "eaten today / eaten this month / this session" in credits
-   Refreshes automatically every 5 minutes, cached by mtime + size (about 29ms for the first scan, about 1ms on a cache hit); the tray menu also shows this month's total
-   Optional plan quota: after filling `planQuota` (credits/month) in the state file the ledger gains a percentage progress bar, and the tray pops up one reminder each time this month's consumption crosses 80% / 100%
-   Satiety decreases slowly over time; below 32 she wilts, swims more slowly and her rice bowl is empty

### ⏱ Pomodoro

-   After focus starts she swims to a corner of the screen and hangs a countdown sign there, quietly keeping you company; when time is up she swims to the exact center of the screen and bounces to remind you to rest

### 🛠 Engineering

-   Electron 38; a full-screen transparent always-on-top canvas + CSS `transform` movement (GPU compositing, avoiding the cumulative size drift bug of `setPosition` with small windows at 150% DPI)
-   Mouse click-through: the main process polls the cursor every 30ms + hit testing (`setIgnoreMouseEvents(forward:true)` forwarding is unreliable on Windows and was not relied upon)
-   Packaging: electron-builder NSIS installer (changeable install directory, shortcut creation); `asar: false` reads media directly; uncaught exceptions after packaging are written to `%TEMP%\dafeiyu-error.log`
-   Measured usage (150% DPI, transparent video always playing, audio process included): CPU ≈ 2.2–3.3% (share of a single core), memory ≈ 440MB

### Known issues

-   The installer is not code-signed, so Windows SmartScreen may warn about an "Unknown publisher": click "More info" → "Run anyway"
