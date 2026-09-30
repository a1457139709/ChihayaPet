import AppKit
import XCTest
@testable import ChihayaPet

@MainActor
final class NativeDialogueTests: XCTestCase {
    private func makeSystem() -> (InteractionWindows, DesktopController, AppStore, ControlledClient, UserDefaults, String) {
        let suite = "native.dialogue.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        let client = ControlledClient()
        let credentials = MemoryCredentials()
        credentials.values["https://example.com/v1"] = "fixture"
        let store = AppStore(client: client, credentials: credentials, preferences: MemoryPreferences())
        let windows = InteractionWindows(store: store, desktop: desktop, defaults: defaults)
        return (windows, desktop, store, client, defaults, suite)
    }

    private func dispose(_ windows: InteractionWindows, _ desktop: DesktopController, _ defaults: UserDefaults, _ suite: String) {
        windows.shutdown()
        desktop.shutdown()
        defaults.removePersistentDomain(forName: suite)
    }

    private func waitFor(_ client: ControlledClient, count: Int) async {
        for _ in 0..<1_000 {
            if await client.count() == count { return }
            await Task.yield()
        }
        XCTFail("Request did not start")
    }

    func testChatRequestSetsWaitingWhileConnectionTestDoesNot() async {
        let (windows, desktop, store, client, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }

        store.input = "你好"
        store.send()
        await waitFor(client, count: 1)
        XCTAssertTrue(windows.isWaitingForReply)
        XCTAssertFalse(windows.isSpeaking)

        store.cancelRequest()
        await client.fail(0)
        XCTAssertFalse(windows.isWaitingForReply)
        store.beginSettings()
        store.testConnection()
        await waitFor(client, count: 2)
        XCTAssertFalse(windows.isWaitingForReply)
        store.cancelRequest()
        await client.fail(1)
    }

    func testNewChatRequestHidesPreviousReplyAndCancelDoesNotReshowIt() async {
        let (windows, desktop, store, client, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }
        desktop.show()
        store.bubble = ModelReply(text: String(repeating: "上一条很长的回复。", count: 80), truncated: false)
        XCTAssertEqual(windows.currentReplyPresentation?.pages.count, 1)
        store.input = "新的问题"; store.send()
        await waitFor(client, count: 1)
        XCTAssertTrue(windows.isWaitingForReply)
        XCTAssertFalse(windows.isSpeaking)
        XCTAssertFalse(windows.isSpeechBubbleVisible)
        store.cancelRequest()
        windows.closeChat(restoreFocus: false)
        XCTAssertFalse(windows.isSpeechBubbleVisible)
        await client.fail(0)
    }

    func testCancellingConnectionTestDoesNotAlterPlayingReply() async {
        let (windows, desktop, store, client, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }
        desktop.show()
        store.bubble = ModelReply(text: String(repeating: "仍在播放的回复。", count: 80), truncated: false)
        let presentation = windows.currentReplyPresentation
        XCTAssertTrue(presentation?.isPlaying == true)

        store.beginSettings()
        store.testConnection()
        await waitFor(client, count: 1)
        XCTAssertFalse(windows.isWaitingForReply)
        store.cancelRequest()

        XCTAssertTrue(presentation?.isPlaying == true)
        XCTAssertFalse(presentation?.pageComplete == true)
        XCTAssertTrue(windows.isSpeaking)
        await client.fail(0)
    }

    func testPlaybackAggregationIgnoresReplacedPresentationCallbacks() {
        let (windows, desktop, store, _, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }
        desktop.show()

        windows.sayIdleLine()
        let idle = windows.currentIdlePresentation
        let stalePlayback = idle?.onPlaybackChanged
        XCTAssertTrue(idle?.isPlaying == true)
        XCTAssertTrue(windows.isSpeaking)

        store.bubble = ModelReply(text: String(repeating: "新的回复。", count: 30), truncated: false)
        XCTAssertNil(windows.currentIdlePresentation)
        XCTAssertTrue(windows.currentReplyPresentation?.isPlaying == true)
        XCTAssertTrue(windows.isSpeaking)

        windows.currentReplyPresentation?.stop()
        XCTAssertFalse(windows.isSpeaking)
        stalePlayback?(true)
        XCTAssertFalse(windows.isSpeaking)
    }

    func testAnimationPolicyChangeStopsDialoguePlaybackImmediately() {
        let (windows, desktop, store, _, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }
        desktop.show()

        store.bubble = ModelReply(text: String(repeating: "正在说话。", count: 30), truncated: false)
        XCTAssertTrue(windows.currentReplyPresentation?.isPlaying == true)
        XCTAssertTrue(windows.isSpeaking)

        desktop.setAnimations(false)
        XCTAssertTrue(windows.currentReplyPresentation?.pageComplete == true)
        XCTAssertFalse(windows.currentReplyPresentation?.isPlaying == true)
        XCTAssertFalse(windows.isSpeaking)
    }

    func testHideSleepWakeAndCloseKeepSpeakingInSyncWithVisibleReply() {
        let (windows, desktop, store, _, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }
        desktop.show()
        store.bubble = ModelReply(text: String(repeating: "生命周期对白。", count: 30), truncated: false)
        XCTAssertTrue(windows.isSpeaking)

        windows.hideInteractions()
        XCTAssertFalse(windows.isSpeaking)

        windows.refreshVisibility()
        XCTAssertTrue(windows.isSpeaking)

        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.willSleepNotification, object: nil)
        XCTAssertFalse(windows.isSpeaking)
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
        XCTAssertTrue(windows.isSpeaking)

        store.bubble = nil
        XCTAssertNil(windows.currentReplyPresentation)
        XCTAssertFalse(windows.isSpeaking)
    }

    func testReplyDeliveredAfterSleepStaysStoppedUntilWake() {
        let (windows, desktop, store, _, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }
        desktop.show()
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.willSleepNotification, object: nil)

        store.bubble = ModelReply(text: String(repeating: "醒来后再继续。", count: 30), truncated: false)
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))

        XCTAssertNotNil(windows.currentReplyPresentation)
        XCTAssertFalse(windows.currentReplyPresentation?.isPlaying == true)
        XCTAssertFalse(windows.isSpeaking)

        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
        XCTAssertTrue(windows.currentReplyPresentation?.isPlaying == true)
        XCTAssertTrue(windows.isSpeaking)
    }

    func testIdlePreferencesUseInjectedDefaults() {
        let (windows, desktop, _, _, defaults, suite) = makeSystem()
        defer { dispose(windows, desktop, defaults, suite) }

        windows.setIdleEnabled(false)
        windows.setIdleFrequency(.frequent)

        XCTAssertFalse(defaults.bool(forKey: "idle.enabled"))
        XCTAssertEqual(defaults.integer(forKey: "idle.frequency"), IdleSpeechFrequency.frequent.rawValue + 1)
        XCTAssertFalse(windows.idleEnabled)
        XCTAssertEqual(windows.idleFrequency, .frequent)
    }
}
