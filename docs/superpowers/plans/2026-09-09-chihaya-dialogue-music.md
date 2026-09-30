# Chihaya Dialogue and Music Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent music module, with local dialogue integration and final review. No git repository exists; work in the existing user workspace and keep this ledger.

**Goal:** Ship the approved single Chihaya visual theme, paged typewriter dialogue and local music playback in the native app.

**Architecture:** ChihayaStyle and vector ornaments serve the native UI. DialoguePresentation owns measured pages and cancellable reveal/lifetime tasks. MusicController and MusicLibrary own playback/import independently of chat; InteractionWindows connects lifecycle.

**Tech Stack:** Swift, AppKit, SwiftUI, CoreText, AVFoundation, macOS 26.0+, arm64, Xcode 26.6.

**Spec:** docs/superpowers/specs/2026-09-09-themes-and-music-design.md

## Constraints and integration

No theme selector, no other themes, no third-party runtime, no OST extraction, no bundled music, no automatic playback on launch. Preserve original PNGs and cloud configuration. Build scripts regenerate project membership for Swift files.

| Task | Files | Interface / verification |
| --- | --- | --- |
| 1 | Core/DialoguePresentation.swift, UI/ChihayaStyle.swift, UI/DialogueView.swift, UI/FloralOrnaments.swift | Measured Unicode pages; reveal/advance/previous; observable model; no focus activation |
| 2 | Music/MusicLibrary.swift, Music/MusicController.swift, UI/MusicSettingsView.swift, ChihayaPetTests/MusicTests.swift | Observable MusicController; import via picker; suspend(reason)/resume(reason), shutdown; root integrates settings and window lifecycle |
| 3 | UI/InteractionWindows.swift, ChatView.swift, SettingsView.swift, AppDelegate.swift | Shared dialogue replaces both bubble types; full reading before idle expiry; style chat and settings; menu music actions |
| 4 | ChihayaPetTests/DialogueTests.swift, ViewRenderingTests.swift, docs/VALIDATION.md | Unit/integration, actual native screenshots, full suite, Release, resource whitelist |

- [x] Write Unicode pagination/reveal tests and verify failures before completion.
- [x] Implement measured pagination and presentation; run tests.
- [x] Implement native frame/flowers and apply shared dialogue to reply/idle windows.
- [x] Implement music with temporary generated WAV tests; no real credentials or music needed.
- [x] Integrate settings, menu and sleep/hide music lifecycle; verify focus regression tests.
- [x] Render native previews, review final code, fix findings and run full test/build/resource checks.

## Execution ledger

Ruling: existing workspace is not a Git repository; use existing directory, no artificial repository or worktree creation.
Task separation: music agent owns Music/* and UI/MusicSettingsView.swift only; root owns appearance, dialogue and integration. Both use new independent test files; no concurrent xcodebuild runs.
Preflight: music interfaces consumed only by integration task; production preferences remain separate from service settings. Rendering must leave decorative overflow inside real panel bounds.

Completion: root completed music after the implementation agent became unavailable. Independent review found stale audio completion, remove/play concurrency and reflow reading-position issues; regression tests failed before fixes and passed afterward. Scoped re-review found no remaining actionable issues. Full XCTest: 59 tests, zero failures, 2026-09-09 21:35:47. Release build, signature and resource whitelist passed. Native music settings verified after independent launch. Real OST listening and extended stability remain separate manual checks in VALIDATION.md.
