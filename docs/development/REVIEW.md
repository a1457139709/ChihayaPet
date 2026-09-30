# Independent implementation review

Reviewed 2026-09-08 against `docs/DESIGN.md`. Scope: Core, UI, AppDelegate, Services, Desktop, and their unit tests. This is a source review of the newly created implementation; there is no previous Git baseline. Native build, test execution, and GUI acceptance are being performed separately by the parent task.

## Finding — resolved

### P2 — Route missing connection configuration to the service tab

Location: `ChihayaPet/UI/SettingsView.swift:72–75`, with the reused settings host in `ChihayaPet/UI/InteractionWindows.swift:54–67`.

Trigger: Before saving a model service, open Settings, select “角色设定”, close Settings, then enter a chat message and press Send. `AppStore.sendText` correctly detects the missing configuration and opens Settings, but the existing `NSHostingView` retains `SettingsView`'s selected persona tab. Neither `openSettings` nor `focusMissingField` changes the selected tab to “模型服务”. The required address/model/key fields therefore remain hidden, contrary to the design's requirement to locate the missing settings field and guide configuration. The same problem occurs if Settings is already open on the persona tab.

**Resolved 2026-09-08:** AppStore now selects the service tab and emits a focus request before opening Settings; SettingsView observes both. A failing-then-passing XCTest and native UI regression confirmed the closed-persona-window trigger.

Original recommendation: Pass an explicit connection-configuration navigation request when `onNeedsSettings` fires, select the service tab, and focus the relevant field after that tab becomes visible. Verify the trigger above both with Settings closed and with it already visible; ordinary Settings opening can retain the user's selected tab.

## Scoped follow-up verification

Source re-reviewed 2026-09-08 after the fix. `AppStore` now publishes the selected settings tab and a fresh focus-request UUID for every missing-configuration send; `SettingsView` binds that selection and schedules field focus on the next main-queue turn. The request is emitted before the settings window is opened, so the routing covers both an existing visible settings host and a reopened host. Ordinary settings opening retains its selected tab. The original P2 is closed; no additional P1/P2 regression was found in this scoped review.

Also reviewed `AppDelegate.installApplicationMenu` and `applicationShouldHandleReopen`. Edit actions use the standard responder chain, Quit targets the application delegate, and reopening reuses `openChat` to restore the pet and input panel. These additions do not change request, credential, or conversation lifecycle handling. No actionable P1/P2 issue found in either addition.

Verification evidence supplied by the parent task: `testMissingConfigurationRoutesFromPersonaToServiceSettings` failed before the fix and passed afterward, and native GUI replay of persona → close Settings → Send selected the service tab and focused the address field. The parent identifies the current built app by SHA-256 `8725f18714187bf8f2073c56aa1943862d6c5aed705207ef81cbd5fe2b88bbd8`; its 30-minute soak was still running at this review. This follow-up independently inspected the source and test assertion, but did not rerun builds, tests, GUI actions, or the soak.

## Reviewed behavior and limitations

- No additional confirmed P1/P2 issues found in request generation checks, cancellation ownership, immutable request snapshots, successful-history trimming, failure/retry bookkeeping, keychain service separation, or the production client's text/error parsing.
- The known renderer hit-test, center-anchor, small-drag drift, primary-screen selection, and test request-body-capture corrections were already in progress and are excluded from this finding.
- Native focus restoration, input-method behavior, Spaces/full-screen placement, display changes, and animation clipping still require GUI verification. In particular, check Settings-only close focus restoration: `windowWillClose` invokes a helper whose guard checks whether that same window is still visible. This timing concern is not promoted to a finding without native confirmation.
- This review did not run `xcodebuild`, access live credentials, issue cloud requests, or change implementation files.
