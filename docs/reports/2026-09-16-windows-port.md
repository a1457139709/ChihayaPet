# Windows 11 port — implementation and validation

Date: 2026-09-16. Branch: `codex/windows-port`, based on `main` at `1e1d42e`.

## Delivered

A separate Electron application under `windows/`, with the existing macOS source and Xcode project preserved. Windows desktop integration covers transparent character/bubble windows, tray recovery, drag and position persistence, seven outfits and two framings, expressions and animation, chat/service/persona settings, idle speech, local music, single-instance startup, and hide/lock/suspend behavior.

Chat requests and local persistence stay in the main process; renderers are sandboxed and context-isolated. The preload and main process restrict actions by window role. Renderer networking, navigation and new windows are blocked. Service credentials are stored in plaintext in the user's data directory, by endpoint, and are absent from state snapshots and package contents. Chat remains memory-only. Existing project config, persona.md and local Music were not read or bundled.

Build scripts fetch a fixed, checksum-verified official Electron Windows runtime and perform file-only packaging. No Wine, virtual machine, Windows app launch or Mac GUI test was used.

## Verification performed

Environment: macOS, Node.js `v26.8.1`, Electron target `44.4.1` / `win32-x64`.

- `cd windows && npm test`: **56 tests passed, 0 failed**. Includes Node-only Electron-boundary simulation, storage and corruption protection, credential isolation, SSE/JSON transport, cancellation and stale-result protection, grapheme limits, incomplete-response retry, geometry, idle timing, music import, renderer behavior and packaging.
- `npm run check`: all source/test/build JavaScript syntax checks passed; 14 sprite variants and 326 PNG SHA256 checks passed.
- `python3 scripts/verify_resources.py --source-only`: 14 variants, 504 eye/mouth combinations, 326 PNGs / 15,264,618 bytes and provenance checks passed. This validates shared source resources, not an existing macOS app bundle.
- npm install/audit: **0 known vulnerabilities** in the locked build dependencies at verification time. Removed the vulnerable extract-zip dependency and used validated ZIP entry extraction instead.
- `npm run package:win`: passed. Verified x64 Windows PE header, pinned runtime version and required runtime files, ASAR source equality, 344-file application whitelist, 326 sprite hashes and original notice. No private config, persona, original sprite backup, reference library, npm modules or music bundled.
- Final ZIP was reopened and every member was hashed against the verified distribution directory; contents match.
- Independent code review found three issues (stale audio promises, length-limited reply handling, Chinese IME Enter). All were fixed with regressions; scoped re-review found no remaining important findings.

## Artifact

- `windows/dist/ChihayaPet-1.0.0-win11-x64.zip`
- Size: **173,539,927 bytes** (about 165.5 MiB)
- SHA256: `2698e428b2900b9344907d9a98e8ee4aa8a2ddb53e68952600386ba7f9d3bd2d`
- Sidecar: same ZIP filename plus `.sha256`
- Machine-readable report: `windows/dist/build-report.json`

The ZIP contains the complete `ChihayaPet-win32-x64` folder. Extract all files, then run `ChihayaPet.exe`. Distribution folders, ZIPs, downloaded runtimes and npm dependencies are ignored by Git and can be rebuilt with the locked instructions.

## Unverified / platform differences

**Windows runtime testing was deliberately not performed**, as requested. Transparency, DPI/multi-monitor behavior, tray interaction, actual audio codecs, real model connections and suspend/resume require the user's Windows 11 testing. The application is not Windows code-signed. ARM64 is not a native target of this package. AIFF is excluded from the Windows import formats; WAV/MP3 conversion is the fallback. The Windows theme recreates the appearance in HTML/CSS rather than using macOS fonts and AppKit drawing.

The detailed user acceptance checklist is in `docs/WINDOWS.md`. Automated checks establish source and package consistency, not proof of Windows runtime compatibility.

## Branch and existing user changes

Keep this branch for user testing; no merge, push or publication. Pre-existing deletions of `chihaya_prompt_v1.md` and `gpt_role_prompt.md`, and untracked `persona.md`, remain untouched and are excluded from this implementation commit.
