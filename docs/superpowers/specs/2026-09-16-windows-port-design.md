# Windows 11 port design

Approved in conversation: Electron implementation, Windows 11 x64 ZIP containing ChihayaPet.exe, no Windows runtime testing on this Mac. Work remains on codex/windows-port; preserve existing user changes and macOS implementation.

## Architecture

Add a standalone Electron application under windows/. Main process owns transparent pet and bubble windows, one chat/settings window, tray, disk data, HTTPS requests and lifecycle. Sandboxed renderers use a context-isolated allowlisted preload API. All assets and HTML are local; no renderer Node access or remote navigation. Reuse the 14 variants / 326 PNGs from CharacterSprites and preserve source notices. No game extraction and no private config/music bundled.

## Behavior

Seven outfits, full/close framing, automatic/fixed expressions, blink/breath/sway/mouth movement, 240–480 DIP size, drag, position persistence, always-on-top, click-through recovery from tray, hide/show, single instance and monitor/DPI recovery. Chat is memory-only, streams HTTPS Chat Completions with cancellation, 60-second deadline, JSON fallback and no redirects. Completed context max 10 rounds/12,000 graphemes; display max 50 rounds/100,000 graphemes; input 2,000 and reply 20,000 graphemes. Incomplete replies are excluded from context and retryable. One request slot shared with connection testing. Saving service/persona cancels and clears chat.

Keep Chinese floral ivory/purple/sage appearance, copyable chat, latest reply bubble and local idle lines, idle suppression while interacting/requesting/hidden/asleep/click-through, recent-eight nonrepeat. Imported music is copied into user-data Music with persistent library and playback preferences, loop controls, volume, startup play, fade, pause on hide/suspend. Use Chromium-supported WAV/MP3/M4A/AAC/OGG/FLAC; AIFF is a documented platform difference.

Use %APPDATA%/ChihayaPet for preferences, plaintext per-endpoint config and imported music. Never read project config or persona.md. Malformed files must not be silently overwritten. Package a self-contained win32-x64 Electron distribution; users need neither Node nor development tools. ZIP is primary artifact; no Windows signing claim.

## Validation

Node behavioral tests with isolated temp data and simulated network; syntax checks; original resource verifier; SHA256/PE/ZIP/ASAR package inspection. Do not launch desktop application or Windows emulator. Deliver SHA256 and manual Windows checklist covering display scaling, tray recovery, chat errors/cancel, persistence, music and lifecycle. Runtime compatibility remains for user's Windows 11 acceptance.
