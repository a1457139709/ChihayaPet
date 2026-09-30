# Windows 11 Implementation Plan

> **For agentic workers:** use superpowers:subagent-driven-development or executing-plans task-by-task. Independent bounded modules may use dispatching-parallel-agents.

**Goal:** Deliver a Windows 11 x64 ZIP with a functional Electron port.
**Architecture:** Native Electron main-process lifecycle and sandboxed local renderers, shared existing PNG resources. No native Node extensions.
**Tech Stack:** Electron, JavaScript CommonJS main/core, plain HTML/CSS/JS renderers, node:test, @electron/asar and ZIP staging.
**Spec:** docs/superpowers/specs/2026-09-16-windows-port-design.md

## Global Constraints
- New branch codex/windows-port; preserve pre-existing changes.
- Windows 11 x64 ZIP; do not run the Windows app or emulator on macOS.
- No project config.json, persona.md, Music/, reference assets or original backup images in package.
- HTTPS only, no redirects; keys stay in main process.

## Task 1 — Storage and chat
Files: windows/src/core/{storage,chat}.cjs, windows/test/{storage,chat}.test.cjs.
- [x] Write behavior tests for URL normalization, atomic store and corrupt-file protection, bounded history, SSE chunking/JSON, cancellation and stale results.
- [x] Run `node --test windows/test/*.test.cjs` and observe missing implementation failures.
- [x] Implement pure Node modules against the IPC contract in windows/CONTRACT.md.
- [x] Re-run focused tests; report limitations.

## Task 2 — Local renderers
Files: windows/src/renderer/{pet,panel,bubble}.{html,js}, theme.css, windows/test/renderer.test.cjs.
- [x] Read manifest and current Swift UI/animation logic.
- [x] Implement sandboxed views using window.pet.snapshot/invoke/onState only; no arbitrary IPC names.
- [x] Draw manifest frames at exact offsets; implement animations, drag/click and suspended/reduced-motion states.
- [x] Implement chat, service/persona settings, music audio and controls, bubble typing/hover/close.
- [x] Check syntax and meaningful pure view-model behavior with node:test.

## Task 3 — Desktop lifecycle and integration
Files: windows/src/{main,preload}.cjs, windows/src/core/{desktop,music,idle}.cjs, related tests.
- [x] Write geometry and persistence/import safety tests with hand-derived expected bounds.
- [x] Implement main process, tray, IPC allowlist, focus and hide/suspend, single instance, monitor recovery.
- [x] Integrate storage/chat/renderers; maintain one authoritative snapshot.
- [x] Run all Node tests and syntax checks.

## Task 4 — Package and handoff
Files: windows/{package.json,package-lock.json}, windows/scripts/*.cjs, docs/WINDOWS.md, README.md, .gitignore.
- [x] Pin available current stable Electron and ASAR, install build-only tools.
- [x] Stage only allowlisted application and verified assets, generate icon from existing artwork, package win32-x64 ZIP.
- [x] Verify Windows PE architecture, ASAR entries, assets/hashes, required runtime files and no secrets; compute SHA256.
- [x] Record actual checks and Windows manual acceptance steps; perform independent code review and fix actionable issues.
- [x] Keep branch for user testing; do not merge or publish.
