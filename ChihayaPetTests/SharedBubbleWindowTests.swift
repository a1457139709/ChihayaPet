import AppKit
import SwiftUI
import XCTest
@testable import ChihayaPet

@MainActor
final class SharedBubbleWindowTests: XCTestCase {
    func testChatAndReplyAreMutuallyExclusiveAndReplyIsSinglePage() {
        let suite = "shared.bubble.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        let store = AppStore(client: ControlledClient(), credentials: MemoryCredentials(), preferences: MemoryPreferences())
        let windows = InteractionWindows(store: store, desktop: desktop, defaults: defaults)
        defer { windows.shutdown(); desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }
        desktop.show()
        windows.openChat()
        store.bubble = ModelReply(text: String(repeating: "喝茶歇一歇。", count: 100), truncated: false)
        XCTAssertFalse(windows.isSpeaking)
        XCTAssertFalse(windows.isSpeechBubbleVisible)
        windows.closeChat(restoreFocus: false)
        XCTAssertTrue(windows.isSpeechBubbleVisible)
        XCTAssertEqual(windows.currentReplyPresentation?.pages.count, 1)
        XCTAssertLessThanOrEqual(windows.currentReplyPresentation?.text.count ?? 999, 60)
        windows.currentReplyPresentation?.advance()
        RunLoop.main.run(until: Date().addingTimeInterval(0.06))
        if let view = NSApp.windows.first(where: { $0.isVisible && $0.contentView is NSHostingView<IdleBubbleView> })?.contentView,
           let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: bitmap)
            try? bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "/tmp/chihaya-shared-reply.png"))
        }
        windows.openChat()
        XCTAssertFalse(windows.isSpeechBubbleVisible)
        XCTAssertFalse(windows.isSpeaking)
        windows.closeChat(restoreFocus: false)
        windows.currentReplyPresentation?.advance()
        windows.tickIdle(now: Date().addingTimeInterval(20))
        XCTAssertNil(store.bubble)
        windows.openChat(); windows.closeChat(restoreFocus: false)
        XCTAssertFalse(windows.isSpeechBubbleVisible)
    }
    func testSharedWindowReadMoreHoverAndManualDismissal() async throws {
        let suite = "shared.lifecycle.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        let client = ControlledClient()
        let keys = MemoryCredentials(); keys.values["https://example.com/v1"] = "fixture"
        let store = AppStore(client: client, credentials: keys, preferences: MemoryPreferences())
        let windows = InteractionWindows(store: store, desktop: desktop, defaults: defaults)
        defer { windows.shutdown(); desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }
        desktop.show(); windows.sayIdleLine()
        let number = windows.speechWindowNumber
        windows.openChat()
        store.input = "讲个故事"; store.send()
        windows.closeChat(restoreFocus: false)
        XCTAssertFalse(windows.isSpeechBubbleVisible)
        for _ in 0..<1000 { if await client.count() == 1 { break }; await Task.yield() }
        await client.succeed(0, String(repeating: "花园里的故事。", count: 30))
        for _ in 0..<1000 { if store.bubble != nil { break }; await Task.yield() }
        XCTAssertTrue(windows.isSpeechBubbleVisible)
        XCTAssertEqual(windows.speechWindowNumber, number)
        windows.currentReplyPresentation?.advance()
        windows.currentReplyPresentation?.setHovered(true)
        windows.tickIdle(now: Date().addingTimeInterval(20))
        XCTAssertNotNil(store.bubble)
        windows.readFullReply()
        XCTAssertTrue(windows.isChatVisible)
        XCTAssertFalse(windows.isSpeechBubbleVisible)
        XCTAssertEqual(store.chatReplyFocus, store.history.turns.last?.id)
        windows.closeChat(restoreFocus: false)
        let oldTurn = store.chatReplyFocus
        store.input = "再讲一次"; store.send()
        for _ in 0..<1000 { if await client.count() == 2 { break }; await Task.yield() }
        await client.succeed(1, String(repeating: "花园里的故事。", count: 30))
        for _ in 0..<1000 { if store.history.turns.count == 2 { break }; await Task.yield() }
        windows.readFullReply()
        XCTAssertEqual(store.chatReplyFocus, store.history.turns.last?.id)
        XCTAssertNotEqual(store.chatReplyFocus, oldTurn)
        windows.closeChat(restoreFocus: false)
        windows.dismissSpeech()
        XCTAssertNil(store.bubble)
        windows.refreshVisibility()
        XCTAssertFalse(windows.isSpeechBubbleVisible)
    }

}
