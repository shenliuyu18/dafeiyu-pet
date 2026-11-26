[中文](README.md) | **English** | [日本語](README.ja.md)

<div align="center">
  <img src="assets/logo.png" width="120" alt="大肥鱼桌宠 (Dafeiyu Desktop Pet)">
  <h1>大肥鱼桌宠 (Dafeiyu Desktop Pet)</h1>
  <p><strong>A Windows desktop companion who eats plain rice, slacks off, and keeps the books.</strong></p>
  <p>
    <a href="https://github.com/shenliuyu18/dafeiyu-pet/releases">Download</a> ·
    <a href="https://shenliuyu18.github.io/dafeiyu-pet/">Website</a> ·
    <a href="CHANGELOG.en.md">Changelog</a> ·
    <a href="https://github.com/shenliuyu18/dafeiyu-pet/issues">Report an issue</a>
  </p>
</div>

---

A little "big blue fat fish" desktop pet who swims around everywhere on your desktop. She leans toward your mouse cursor, gets flung around when you drag her, wilts when she is hungry, mutters to herself when idle, and also keeps the books: **the plain rice she eats is exactly the balance in your AI platform accounts.**

- **106 frame-by-frame animations**: idle, eating plain rice, writing code, solving a Rubik's cube, setting off fireworks, moon gazing on Mid-Autumn Festival, decorating the Christmas tree…
- **9 selectable characters**: 大肥鱼 (Dafeiyu), GPT娘v1, GPT娘v2, plus six AI girls: Claude, Gemini, GLM, Grok, Kimi and Qwen.
- **144 memes**: classic meme images + selections from the 蓝色大肥鱼档案馆 (Blue Big Fat Fish Archive) + the dsh-meme library + DSniang1, each with its own caption.
- **Character store**: 8 downloadable characters + the 大肥鱼 plus expansion pack, with online download, local zip import and uninstall at any time; downloads automatically pick the fastest mirror.
- **大肥鱼 plus**: 167 new animations; once installed the animation pool grows to 268 without taking up an extra character slot.
- **Rice ledger / Pomodoro timer / custom interaction text / fullscreen avoidance / launch at startup**, with all data and API keys kept on your machine.
- **Chinese / English / Japanese**: UI navigation, right-click menu, 435 character lines and meme captions can all be switched, taking effect immediately with the setting
- **Full and Lite versions**: identical features, different asset specs, can be installed and run at the same time.

The tech stack is **Wails v2 + the system WebView2**: no bundled Chromium, a small install size and low memory usage, with assets and data staying on your machine. The program code is open source under MIT.

## Download and install

Go to [Releases](https://github.com/shenliuyu18/dafeiyu-pet/releases) to download the installer (Windows 10/11 x64, double-click to install, choose your own directory, desktop / Start menu shortcuts are created automatically):

| Version | File | Size | Notes |
| --- | --- | --- | --- |
| Full | `dafeiyu-pet-1.5.4-setup.exe` | 96.6 MiB | High-quality built-in assets; downloadable character packs use 640×360 CRF 32 |
| Lite | `dafeiyu-pet-lite-1.5.4-setup.exe` | 42.6 MiB | Built-in assets compressed; downloadable character packs automatically use 480×270 |

Backup download: [Lanzou Cloud drive](https://wwaql.lanzouu.com/b01i5xmkri) (password **5meo**, synced manually by the author).

> **Current stable release: 1.5.4** (2026-11-26). Power-saving mode and font weight, action search and collapsible groups, downloadable character packs upgraded to 1.0.1 (lines, translations and sprite parameters travel with the pack), complete trilingual coverage, plus stability fixes for the pet disappearing and click-through.

### Full or Lite?

| | Full | Lite |
| --- | --- | --- |
| Built-in animations | 106 original 640×360 VP9-alpha WebM | 480×270 VP9-alpha compressed |
| Downloadable character packs | 640×360 VP9, CRF 32 + sharpness 2 | 480×270 VP9, CRF 42 (selected automatically) |
| Expression art / memes | Original images | Compressed WebP |
| Sound effects / fonts / sensitive-word lexicon / memes | Kept | Kept |
| Features | Completely identical | Completely identical |

The Full version's built-in assets are packed byte-for-byte into a store-only `assets.zip`; the Lite version generates its own assets separately into `assets-lite/` via `tools/build-lite-assets.py` and never overwrites the Full version's assets. Character packs are not distributed with the installer and are downloaded on demand on first use.

### Install location

- Full: `%LOCALAPPDATA%\Programs\大肥鱼桌宠`
- Lite: `%LOCALAPPDATA%\Programs\大肥鱼桌宠 Lite`

The two versions use separate install directories, state directories and single instances, so they can be installed and run at the same time without affecting each other.

### Installation notes

- **WebView2 missing**: the installer downloads and installs it automatically (requires an internet connection).
- **SmartScreen says "Unknown publisher"**: the installer is not code-signed; click "More info" → "Run anyway".
- **Upgrading from the old Electron version (1.3.0 and earlier)**: uninstall the old version first in "Windows Settings → Apps", then install the new one. Since 1.4.0 neither the repository nor your machine contains any Electron code or runtime.

## Characters

You can switch, download or uninstall characters at any time in Settings → Characters & Sound; changes take effect immediately and your choice is remembered.

| Character | Type | Content |
| --- | --- | --- |
| 大肥鱼 (Dafeiyu) | Frame-by-frame animation | 106 640×360 VP9-alpha transparent WebM (default, built in) |
| 大肥鱼 plus | Expansion pack | 167 actions merged into 大肥鱼, animation pool 106 → 268, no extra character slot |
| GPT娘v1 | Spritesheet animation | 73-frame transparent spritesheet, supporting idle, running, waving, working, waiting, celebrating and a 16-direction gaze |
| GPT娘v2 | Frame-by-frame animation | 92 actions, downloaded on demand |
| Claude / Gemini / GLM / Grok / Kimi / Qwen | Frame-by-frame animation | 92~166 actions each, downloaded on demand; each has its own persona lines |

Character packs are downloaded on demand from the store and support local `.zip` import and uninstall at any time. Downloads use a direct connection plus several acceleration mirrors (ghfast, gh-proxy, ghproxy); the speed of each line is probed first and the fastest is chosen, with automatic failover when a line fails. To build your own pack, package it according to [docs/形象包制作标准.md](docs/形象包制作标准.md) using the bundled `tools/character-pack/validate.py` and `make_pack.py`.

Non-大肥鱼 characters use interaction text from their own AI girl personas (Claude's rules, Gemini's catgirl, GLM's fox girl, Grok's snark, Kimi's long text, Qwen's ojou-sama), without the rice jokes or memes, and the ledger is shown as the "Usage Ledger".

## Interactions

| Action | Effect |
| --- | --- |
| Drag | Place her anywhere on the desktop, playing the "dangling from the mouse" animation; the cursor becomes a grab hand |
| Single click | A pat: plays a random click-response animation, pops up a line plus a meme, mood +1 |
| Double click | Feed a bowl of plain rice (eating plain rice / eating tokens / big bite of snacks) |
| Right click | Menu: Feed Rice / Pick an Action… / Pomodoro / Rice Ledger / Status / Sleep / Settings / Hide Away / Quit |
| Mouse nearby | Leans gently toward the cursor; occasionally swims over out of curiosity |
| Left alone | Starts dozing off after about 100 seconds; when idle she finds her own fun at the configured interval |
| Pick an Action | Request a performance from the current character's actions; click ☆ to pin, up to 10 per character |
| Sound cues | `success` plays when feeding succeeds and when the Pomodoro ends, `error` when focus is cancelled (volume about 0.3) |
| Tray notifications | Idle chatter when the Pomodoro ends or the pet is hidden; the tray menu also shows the current ledger balance |

Idle performances are drawn by weight: small actions (stretching, looking in the mirror, tapping the desk), play (Rubik's cube, spinning top, violin, the blue whale appears), food (breakfast, watermelon, hot pot), seasons (fireworks, building a snowman, Mid-Autumn moon gazing, decorating the Christmas tree), plus a 25% chance of turning into idle chatter.

## Settings

Settings are grouped into 8 pages; changes take effect immediately and are persisted.

| Page | Content |
| --- | --- |
| Characters & Sound | 9 selectable characters, character store, import/uninstall; sound effects: default / whale SFX / mute; click-meme play order: pseudo-random queue / true random |
| Size & Font | Size presets: small 70% / default 85% / large 110% / extra large 140%, with 5% fine adjustment (0.6×–1.6×); font: 上首软糖体 (default) / YaHei / DengXian / KaiTi / SimSun, with support for importing custom .ttf/.otf/.woff/.woff2; font size 80%–140%, scaling bubbles, the right-click menu and the action panel together |
| Idle & Auto Actions | Idle position: roam anywhere / bottom-right corner / stay fixed; auto-hide during fullscreen video/games (can be turned off); auto action interval 5–300 seconds, default 40 seconds |
| Pomodoro | Duration 5–120 minutes (15 / 25 / 45 / 60 presets, ±5 minute fine-tuning); work animation interval 5–120 seconds, default 5 seconds |
| Rice Ledger | On/off; source: DeepSeek / Kimi / SiliconFlow / OpenAI / Claude; API key configuration |
| Startup & Updates | Launch at login: off / on (Windows logon scheduled task, no delay); sleep/wake safety self-check; apps to launch together; auto-update toggle; check GitHub for updates |
| Custom Interaction Text | Edited in a separate small window, up to 20 lines × 40 characters; checked against the offline sensitive-word lexicon on save; replaces the default lines when enabled |
| About | Language: 中文 / English / 日本語 (UI, lines, all built-in and downloaded-pack action names, and the tray switch together); version number, usage instructions, GitHub repository / changelog / issue links, export diagnostic bundle, asset licenses and credits |

The ☆ pins in "Pick an Action" are saved separately per character. The "pseudo-random queue" for click memes first shuffles the combinations into a queue and plays them in order, reshuffling when the queue is done and avoiding repeating the last meme of one round as the first of the next; "true random" draws independently every time.

## Rice Ledger

Open it from the right-click menu or the tray. Pick an AI platform in settings and configure its API key; the ledger then shows that account's "available balance / bonus balance / top-up balance" (OpenAI / Claude show this month's spend, last 7 days, and today).

- **API platforms**: DeepSeek, Kimi, SiliconFlow, OpenAI, Claude. Kimi / SiliconFlow automatically fall back to their international site (and currency) when the domestic site rejects the key; OpenAI / Claude require an Admin Key, and OpenAI counts API costs only, excluding ChatGPT subscriptions.
- **Environment variables**: without a key in the UI, `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `SILICONFLOW_API_KEY` / `OPENAI_ADMIN_KEY` / `ANTHROPIC_ADMIN_KEY` are used.
- **Key security**: API keys are encrypted with Windows DPAPI and stored in the local state file; only the current Windows account can decrypt them, and they are sent only to the corresponding platform's official API when querying. Do not fill them in on a shared computer; you bear the risk.

**Rice-joke mini glossary**: plain rice = sneaking a bite of your tokens; leftover rice = cache; outsourcing the slack-off = getting another Agent to do the work; clocking off for dinner = inference complete.

## Memes and animations

**Meme library**: 20 classic memes + 59 selections from the 蓝色大肥鱼档案馆 (Blue Big Fat Fish Archive) + 64 deduplicated dsh-meme images + DSniang1, 144 in total, each paired with a caption that fits the picture. The classic memes and the archive/dsh libraries are merged into a single scene pool that is shuffled by scene with no consecutive repeats.

**Animation state machine**: 22 core animations switch with state (idle breathing / floating steps / crab walk / looking around / click responses ×5 / eating plain rice / eating tokens / big bite of snacks / dozing off / head-down sigh / jumping for joy / writing code / counting the money), plus 84 idle performances. Animations that contain text (`是啊，吃什么` / `深度思考碎碎念`) are excluded from mirroring so the text is not flipped left to right.

**Satiety** decreases slowly over time; below 32 she wilts, swims more slowly and her rice bowl empties; feeding her refills it and raises her mood.

**Pomodoro**: after focus starts she swims to a corner of the screen and hangs a countdown sign there, quietly keeping you company; no other auto actions run meanwhile, and each work animation plays through completely, then rests for the configured interval before the next one plays; manual operations such as right-click "Pick an Action" still work. When time is up she swims back to the center of the screen and bounces to remind you to rest. When the countdown sign would touch the bottom edge of the screen it flips onto her body automatically so the taskbar cannot cover it.

## Data storage

`%APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json` (for Lite, `%APPDATA%\dafeiyu-desktop-pet-lite`) stores satiety, mood, position, size / idle position / Pomodoro duration and work animation interval / rice ledger toggle / launch at startup / apps to launch together / custom text, plus optional API keys (DPAPI-encrypted). Downloaded character packs are extracted into the `characters/` subdirectory, and the corresponding directory is deleted on uninstall.

## Character packs and DIY

- The store catalog is provided by [dafeiyu-pet-assets](https://github.com/shenliuyu18/dafeiyu-pet-assets) and contains 9 downloadable packs and covers; both the catalog and the zips live on GitHub, not on third-party drives.
- Full packs are 640×360 CRF 32 transparent WebM, Lite packs are 480×270; all with an alpha channel.
- When downloading, the fastest line among the direct connection and ghfast / gh-proxy / ghproxy is probed, with automatic failover.
- DIY packs: prepare `manifest.json` and the animation files per [docs/形象包制作标准.md](docs/形象包制作标准.md), validate with `python tools/character-pack/validate.py <directory or zip>`, then package with `make_pack.py`; the in-app "Import character pack" validates id, paths, files and slot references again.

## Development

Prerequisites: Node.js, Go 1.25+, Wails CLI v2.16+, NSIS 3.x, and WebView2 (bundled with Windows or already installed).

The project has no npm runtime dependencies; the build scripts use only Node built-in modules and automatically add the Go / Wails / NSIS toolchains in your user directory to PATH.

```bash
npm run build              # Full version → dist/dafeiyu-pet-<version>-setup.exe
npm run build:lite         # Lite version (compressed assets generated automatically) → dist/dafeiyu-pet-lite-<version>-setup.exe
npm run packs:lite         # Generate Lite character packs for the asset repo → characters-build/lite/
npm run dist-install       # Build the Full version, install it silently on this machine and launch it
npm run dist-install:lite  # Build the Lite version, install it silently on this machine and launch it
npm run perf:check         # Launch in isolation and sample startup/memory/CPU/disk budgets → perf-report.json
npm run test:frontend     # Frontend pure-logic unit tests (node:test, no extra dependencies)
```

For day-to-day debugging you can also go into `wails/` and run `wails dev`. After launch she appears in the bottom-right corner of the screen, and the tray icon can summon or hide her at any time.

For real-machine performance checks you can use `--isolated`: it uses a separate state directory (`dafeiyu-desktop-pet-isolated`), single instance and window class name, and can run alongside the version installed on your machine without touching the real settings, autostart or updates.

Launching with `--dev-debug` opens an extra debug bridge that listens only on `127.0.0.1:9336`: `/state` for window/Region state, `/mem` for heap and asset statistics, `/fullscreen` for the avoidance decision and the last 40 decisions, `/ledger` for ledger diagnostics (add `?refresh=1` to re-query immediately), and `/js` to inject JS straight into the page — very handy for troubleshooting interaction issues.

The repository ships GitHub Actions: push / PR runs version consistency checks, script syntax, gofmt, `go vet`, `go test` and a compile check; pushing a `v*` tag automatically builds the Full and Lite versions, generates `SHA256SUMS.txt` and creates a Release (update the version in `package.json` before releasing; a tag that does not match it fails the run). A manually triggered Release requires the full tag; tags containing `-` are automatically marked as pre-releases.

## Packaging

- The frontend is generated by `tools/wails-prepare.js` from `renderer/` + `assets/` (Full) or `assets-lite/` (Lite): relative paths in HTML / JS / CSS are rewritten, assets are packed into `assets.zip`, and Wails reads them through a virtual filesystem that supports video Range requests. The Full version keeps the original bytes store-only.
- `tools/wails-build.js` syncs the version number, invokes the Wails build to produce the NSIS installer, copies it to `dist/`, and supports `--lite` / `--install`.
- The installer uses `-webview2 download`: when a missing WebView2 is detected it is downloaded and installed. The setup wizard is in Simplified Chinese (NSIS `SimpChinese`).
- Release assets are named `dafeiyu-pet-<stable-version>-setup.exe` / `dafeiyu-pet-lite-<stable-version>-setup.exe`; update checks select the right one by the `setup.exe` suffix and the lite marker.
- **Version numbering convention**: the version is maintained in `package.json` and synced to CHANGELOG / README / installer names on release. The Wails Windows file version uses numeric fields (e.g. `1.5.4.0`), while the in-app About page and update checks use the full version string.
- **Update package verification**: after downloading an installer the client always verifies it against `SHA256SUMS.txt`; a mismatched hash deletes the file and refuses to execute it; when the manifest is missing, auto-update is disabled and only manual download is possible. Download and install go through the same verification.
- **Optional signing**: after configuring the repository secrets `UPDATE_SIGNING_KEY` (base64 of an Ed25519 private key PEM) and `UPDATE_SIGNING_PUBKEY` (base64 of the raw 32-byte public key), CI generates `SHA256SUMS.txt.sig` and injects the public key at build time; the client refuses updates that fail signature verification. Generate the key pair with `node tools/update-keys.js` and keep the private key only in Secrets.

## Directory structure

```
wails/                    Wails v2 + Go backend (the only implementation)
  characters.go           Character pack catalog, mirror probing, download, verification and extraction
  characters_test.go      Character pack validation and download/install tests
  main.go                 Startup, bindings, window, transparency, focus, updates
  win32.go                Win32 window styles, dynamic Region, hit polling, DPAPI
  fullscreen_windows.go   Fullscreen foreground detection and automatic avoidance
  state.go                State persistence, settings, DPAPI keys, autostart
  ledger.go               Balance / billing queries for 5 API platforms
  actions.go              Right-click menu action dispatch (feed / pomodoro / sleep / status / ledger)
  words.go                Offline sensitive-word Trie filter
  update.go               GitHub update check / download / silent install
  power.go                Sleep/wake self-check
  tray_windows.go         Native tray and balloon notifications
  assets.go               assets.zip virtual filesystem (supports Range)
  frontend/api.js         window.pet → Wails bindings/events + inline key/text editing
  build/                  App icon, version info, NSIS setup wizard
tools/
  wails-prepare.js            Generates the Wails frontend from renderer/ + assets/
  wails-build.js              One-step NSIS build, copies to dist, optional --install
  build-lite-assets.py        Lite compressed asset pipeline (writes only to assets-lite/)
  build-character-pack.py     Upstream sprite sheets → transparent WebM character packs
  build-character-pack-lite.py Character packs → 480×270 Lite versions
  install-character-packs.py  Build outputs → user directory
  character-pack/             Scripts for the DIY character pack standard (validate.py / make_pack.py / sample manifest)
  rename-pack-assets.py       Prefixes all action files in a pack with the pack name
  build-lexicon.py            Offline sensitive-word lexicon generation
  pipeline/                   DIY action asset pipeline (watermark removal → green screen keying → normalization → encoding)
renderer/                 Frontend DOM/CSS/JS shared by both versions
  index.html              Transparent video canvas + bubble/menu/ledger/settings structure
  style.css               Floating / leaning / bouncing / drag-struggle feedback animations + 上首软糖体 font
  pet.js                  Movement engine, leaning toward the cursor, animation state machine, bubbles, menu, ledger, character store
  archive-memes.js        Archive selection meme list and captions
  dsh-memes.js            dsh-meme library list and captions
assets/
  anims/*.webm            106 upstream original VP9-alpha transparent animations (大肥鱼)
  anims/index.js          Animation list (CSP forbids fetch, so injected via <script>)
  thumbs/*.webp           Character store covers
  memes/*.webp            Classic meme images (lossless WebP, including DSniang1)
  memes/archive/*         Archive selections + deduplicated dsh-meme library
  sounds/*.wav|mp3        Default sound effects and whale SFX
  fonts/上首软糖体.woff2   Full bubble font
  sensitive/              Offline sensitive-word lexicon and source notes
  pic/                    Cursor and tray notification icons
  logo.png                Icon source image
characters-build/         Character pack build outputs and release directory/checksums (not included in the installer)
web/                      Static website (deployed to GitHub Pages)
docs/                     Action generation prompt library, character pack standard, notification icon prompts
.github/workflows/        CI: version check / go vet / go test / compile; tags build and publish automatically
```

## Implementation notes

- **Transparent window and click-through**: `WindowIsTranslucent: true` + `BackdropType: None` make WebView2 truly reveal the desktop; `WS_EX_NOACTIVATE` does not steal focus by default, and it is removed with `SetForegroundWindow` when settings are opened and restored afterwards. With a fullscreen window, a dynamic Region (`SetWindowRgn`) keeps the pet and the complete bubble / meme / ledger / countdown sign areas; menus, settings and dragging restore the whole window. Panel/focus calls are serialized: the Region is expanded before a panel is shown and shrunk 260 ms after it closes. Frontend JS/CSS carry a version number so WebView2 does not use stale caches.
- **Zero asset modification (Full built-in assets)**: `assets.zip` is written store-only, so the video, art, meme, font and sound bytes match the source files; Wails provides a virtual filesystem through `zipFS`, and video Range requests work. Downloadable character packs are separately transcoded CRF 32 assets.
- **Frontend structure**: `renderer/` is the only UI source; `wails/frontend/api.js` maps it to Wails bindings/events and provides focusable API key / custom text editing cards inside the main window.
- **Window**: one transparent, always-on-top, non-focus-stealing window covering the work area; the character swims inside it with CSS `transform` (GPU compositing). Early versions used a "small window + setPosition follow", which accumulated 1 px size drift at 150% DPI, so it was changed to the full-screen canvas approach.
- **Character assets**: VP9-alpha transparent WebM played with `<video>` (Chromium supports the alpha channel natively). The asset canvas is 640×360, the character is centered and occupies about 226×282 with transparency around it. CSP must allow `media-src` and `font-src`, otherwise videos and fonts are blocked by `default-src 'none'`.
- **Animation state machine**: `applyBase()` selects the looping animation by the priority "dragging > sleeping > pomodoro > hungry > moving / idle"; one-shot actions such as clicking, feeding and the ledger go through `playOnce()` and return to the base state when finished, with a timeout fallback.
- **Character packs**: the catalog is kept in the asset repository; mirrors are probed before download, and the `manifest.json` inside the zip is validated for schema, id, paths and slots before being extracted atomically into the user directory. Built-in characters and plugin packs share the same asset overlay.
- **Size scaling**: the character is scaled as a whole with CSS `scale` inside `#scale`; the hit box, movement bounds and Wails click-through decisions are converted proportionally, so dragging/clicking is precise at any level from 0.6× to 1.6×.
- **Performance baseline** (measured on a real machine with an isolated instance, see `docs/后续开发方案.md`): cold start about 0.83 s; about 9.6% of a single core when quietly idle, about 23% of a single core while roaming (45fps); state is flushed to disk at most once a minute; main process private memory about 85 MB, WebView2 child processes about 200 MB in total (varying with window size and DPI), Go live heap about 27 MB. Video decoding pauses when the window is hidden, avoided for fullscreen, or minimized.

## Adding your own actions

1. Following the template in [docs/桌面宠物10秒动作提示词.md](docs/桌面宠物10秒动作提示词.md) (the complete prompt library for 106 actions), have an AI generate a 10-second, front-facing character animation on a solid-color background.
2. A single command handles green-screen keying + normalization to 640×360 / 24 fps + VP9-alpha encoding + refreshing the animation list:

   ```bash
   tools/pipeline/make-anim.sh 写周报.mp4 写周报
   ```

3. Add the action name to the matching animation pool in [renderer/pet.js](renderer/pet.js) (or to a category of `ACTIONS`) and restart the pet. Remember to also add actions that contain text to `NO_MIRROR` so they are not flipped left to right.

If you want to share them with others, just package them with the character pack standard; no application code changes are needed.

## FAQ

**Won't open, or only shows a white screen?** First make sure the Microsoft Edge WebView2 Runtime is installed on the system. The installer downloads and installs it automatically; you can also install it manually from the Microsoft website and restart the pet.

**Character pack download is very slow or fails?** The app automatically picks the fastest line between the direct connection and several mirrors; if none of them works, retry later, or download the zip manually from [dafeiyu-pet-assets](https://github.com/shenliuyu18/dafeiyu-pet-assets) and use "Import character pack" in the store.

**The whole desktop became blurry on Windows 10?** Fixed in 1.4.8: on systems before 22621 the old version fell back to Aero blur, and since the window covers the whole work area the entire desktop went fuzzy; the new version simply removes that layer and the desktop stays sharp. Should your machine show a black background, **right-click the tray icon → uncheck "Fix blurry Win10 background"** to return to the old behavior immediately (you can also set `"blurFix"` to `false` in the state file).

**Will it show "Unknown publisher"?** Yes. The installer is not code-signed and SmartScreen may block it; click "More info" → "Run anyway".

**Can the Full and Lite versions be installed at the same time?** Yes. Their install directories, state directories and single-instance identifiers are all independent, and they can run at the same time.

**How do I uninstall completely?** After uninstalling in "Windows Settings → Apps", delete `%APPDATA%\dafeiyu-desktop-pet` (for Lite, `%APPDATA%\dafeiyu-desktop-pet-lite`) if you also want to remove settings and keys.

**Is she still there while I watch fullscreen video?** Settings → Idle & Auto Actions → Fullscreen video / games, make sure it is enabled. Normal windows and maximized windows do not trigger hiding.

**Custom text won't save?** On save it is checked against the offline sensitive-word lexicon, and lines containing sensitive words are rejected; each line holds at most 40 characters and there are at most 20 lines.

**Update check fails?** If GitHub access is unstable, retry later, or download the installer manually from Releases and install it over the existing version; your settings are kept.

## Changelog

See [CHANGELOG.en.md](CHANGELOG.en.md).

- v1.0.0 (2026-10-15): first stable release.
- v1.2.0: custom Pomodoro duration, "Pick an Action", default size 85%.
- v1.3.0: multiple characters, multi-platform AI ledgers, two-level settings menu, auto-update, sound packs, font size, fixed position, autostart.
- v1.4.0: restored the upstream highest-quality assets, custom interaction text with offline sensitive-word filtering, Wails + WebView2 migration, Full / Lite dual builds.
- v1.4.1–v1.4.4: dual-version flashing, right-click menu Region fix, fullscreen auto-avoidance, high-priority autostart and wake self-check.
- v1.4.5: archive selection memes and the GPT girl 73-frame spritesheet animation.
- v1.4.6: selectable click-meme play order.
- v1.4.7: GPT娘v2 (test) and the deduplicated dsh-meme library.
- v1.4.8: fixed the blurry Win10 background, pet flashing and ledger reading; zero-copy asset reading, resident memory about 1GB → about 60MB; added GitHub Actions.
- v1.5.0: character store with 9 selectable characters, 大肥鱼 plus, AI girl persona lines, Lite character packs, DIY character pack standard, multi-mirror downloads; a concentrated batch of fixes for bubbles, the meme queue, sleep and image quality.
- v1.5.4: power-saving mode, font weight, action search and grouping, character packs 1.0.1, fixes for the pet disappearing and click-through, complete trilingual coverage.
- v1.5.3: ledger diagnostics, update signature verification, fullscreen debouncing/diagnostics, diagnostic bundle export, focus statistics, state schema v2, frontend logic split and performance improvements.
- v1.5.2: selectable fonts with custom import, logon scheduled task autostart with status display; fixed the first-frame flash in the top-left corner and blurry bubbles when scaled down.
- v1.5.1: fixed character pack intro mismatches (characters such as Grok introducing themselves as the "blue big fat fish") and WebView2 page zoom (Ctrl+wheel / Ctrl+plus or minus / pinch zooming the pet and settings panel as a whole).

## License

The program code in this repository (Go, JavaScript, HTML/CSS and build scripts) is open source under [MIT](LICENSE). Character animations, artwork, memes, fonts, sound effects and other assets are not covered by the MIT license and are used and redistributed under the licenses of their respective sources; a fair portion of them is for non-commercial use only, and commercial use requires separate permission from the rights holders.

## Asset sources and licenses

The animations in the "大肥鱼 plus" and "GPT娘v2 / Claude / Gemini / GLM / Grok / Kimi / Qwen" packs were transcoded from [hunmer/aboutme-pets](https://github.com/hunmer/aboutme-pets). The dsh series assets in that repository may not be used commercially, and public derivative works must credit the upstream repository; the base artwork of the other character packs comes from [lokicorvus/crosspet](https://github.com/lokicorvus/crosspet) under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), with attribution, non-commercial use and share-alike. This project's transcoded packs are offered under the same terms at [dafeiyu-pet-assets](https://github.com/shenliuyu18/dafeiyu-pet-assets).

The 106 built-in 大肥鱼 animations, classic memes, fonts, cursor and notification icons come from [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) (MIT, see [THIRD-PARTY-dsh-pet-LICENSE.txt](THIRD-PARTY-dsh-pet-LICENSE.txt)) — a desktop pet plugin running in the DeepSeek Harness, and also the origin of this "blue-haired little maid + whale tail" character and its animations. This program uses its animations, meme images and icon fonts, with a completely independent implementation; the category weights of the random idle performances, the balance tier rules and the `NO_MIRROR` convention were inspired by its configuration files, and `tools/pipeline/` and `docs/` come from its asset production line.

The success / error sound cues come from [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu) (MIT), and the state breakdown (idle / poke / head_pat / working / waiting / success / error / dragging / eat_token) was also inspired by this program's animation state machine design.

The DSniang1 memes and the "whale SFX" come from [louke6572/dsh-whale-widget-plus](https://github.com/louke6572/dsh-whale-widget-plus) (MIT, see [THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt](THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt)). The app icon reuses the early 大肥鱼v6 artwork and comes from [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) (MIT, see [THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt](THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt)).

The quotes of "GPT娘v1" come from [T7moris/GPT-Niang](https://github.com/T7moris/GPT-Niang) (MIT, see [THIRD-PARTY-GPT-Niang-LICENSE.txt](THIRD-PARTY-GPT-Niang-LICENSE.txt)); the 73-frame transparent spritesheet comes from [weit0529/gpt-pet](https://github.com/weit0529/gpt-pet) (MIT, see [THIRD-PARTY-gpt-pet-LICENSE.txt](THIRD-PARTY-gpt-pet-LICENSE.txt)).

The "archive selection memes" come from [EDMOK/blue-fish-archive](https://github.com/EDMOK/blue-fish-archive) / [fisharchive.cc](https://fisharchive.cc/). The character redesign is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), and the rights to each individual meme belong to its creator; this project uses them for non-commercial purposes only and keeps the attribution, see [THIRD-PARTY-blue-fish-archive-NOTICE.txt](THIRD-PARTY-blue-fish-archive-NOTICE.txt).

The "dsh-meme 大肥鱼 library" comes from [yyh-001/dsh-meme](https://github.com/yyh-001/dsh-meme) and [yyh-001/dsh-meme-packs](https://github.com/yyh-001/dsh-meme-packs). dafeiyu-001 / dafeiyu-learned are personal libraries; commercial use or redistribution requires permission from the rights holder; pack-mvc2p5cv (GPT-generated 大肥鱼, contributed by Anterique0) is CC BY-NC-SA 4.0. See [THIRD-PARTY-dsh-meme-NOTICE.txt](THIRD-PARTY-dsh-meme-NOTICE.txt).

The sensitive-word lexicon for custom interaction text comes from [Konsheng/Sensitive-lexicon](https://github.com/Konsheng/Sensitive-lexicon) (MIT, see [THIRD-PARTY-Sensitive-lexicon-LICENSE.txt](THIRD-PARTY-Sensitive-lexicon-LICENSE.txt)); the politics / pornography / violence / firearms and explosives / advertising categories are used and matched offline on your machine; the original lexicon text and the selected list are in `assets/sensitive/SOURCES.txt`.

## About older versions

Since 1.4.0 the Electron version is no longer provided: the repository contains no Electron main process, preload script, old editing window or electron / electron-builder dependencies, and there is no fallback build. If an Electron version 1.3.0 or earlier is still installed on your machine, uninstall it first in "Windows Settings → Apps", then install the new version.
