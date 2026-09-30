import XCTest
import AppKit
@testable import ChihayaPet

final class IdleSpeechTests: XCTestCase {
    @MainActor
    func testIdleBubbleNeverTakesFocusOrChangesConversationAndHidesWithPet() {
        let suite = "idle.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        let store = AppStore(client: ControlledClient(), credentials: MemoryCredentials(), preferences: MemoryPreferences())
        let windows = InteractionWindows(store: store, desktop: desktop)
        desktop.onHide = { windows.hideInteractions() }
        defer { windows.shutdown(); desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }
        XCTAssertFalse(windows.canSayIdleLine)
        desktop.show()
        XCTAssertTrue(windows.canSayIdleLine)
        let keyWindow = NSApp.keyWindow
        windows.sayIdleLine()
        XCTAssertTrue(NSApp.keyWindow === keyWindow)
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertNil(store.bubble)
        store.input = "尚未发送"
        XCTAssertFalse(windows.canSayIdleLine)
        store.input = ""
        store.bubble = ModelReply(text: "聊天回复", truncated: false)
        XCTAssertFalse(windows.canSayIdleLine)
        store.bubble = nil
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.willSleepNotification, object: nil)
        XCTAssertFalse(windows.canSayIdleLine)
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
        XCTAssertTrue(windows.canSayIdleLine)
        desktop.hide()
        XCTAssertFalse(windows.canSayIdleLine)
    }
    func testWaitsFullIntervalAfterBlockedPeriodAndNeverCatchesUp() {
        var schedule = IdleSpeechSchedule()
        let start = Date(timeIntervalSince1970: 0)
        XCTAssertFalse(schedule.advance(now: start, allowed: true, delay: 180))
        XCTAssertFalse(schedule.advance(now: start.addingTimeInterval(179), allowed: true, delay: 180))
        XCTAssertTrue(schedule.advance(now: start.addingTimeInterval(180), allowed: true, delay: 180))
        XCTAssertFalse(schedule.advance(now: start.addingTimeInterval(1000), allowed: false, delay: 180))
        XCTAssertFalse(schedule.advance(now: start.addingTimeInterval(2000), allowed: true, delay: 180))
        XCTAssertTrue(schedule.advance(now: start.addingTimeInterval(2180), allowed: true, delay: 180))
    }
    func testLinesAreShortAndDoNotRepeatConsecutively() {
        var catalog = IdleSpeechCatalog()
        var previous = ""
        for _ in 0..<100 {
            let line = catalog.next(hour: 9)
            XCTAssertFalse(line.isEmpty)
            XCTAssertLessThan(line.count, 100)
            XCTAssertNotEqual(line, previous)
            previous = line
        }
    }
}
