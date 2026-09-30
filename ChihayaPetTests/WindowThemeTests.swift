import AppKit
import SwiftUI
import XCTest
@testable import ChihayaPet

@MainActor
final class WindowThemeTests: XCTestCase {
    func testEveryContentWindowUsesLightThemeWhenApplicationIsDark() throws {
        let oldAppearance = NSApp.appearance
        NSApp.appearance = NSAppearance(named: .darkAqua)
        let suite = "window.theme.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        let store = AppStore(client: ControlledClient(), credentials: MemoryCredentials(), preferences: MemoryPreferences())
        let windows = InteractionWindows(store: store, desktop: desktop)
        defer {
            windows.hideInteractions(); windows.shutdown(); desktop.shutdown()
            defaults.removePersistentDomain(forName: suite); NSApp.appearance = oldAppearance
        }
        func check(_ window: NSWindow?) throws {
            let window = try XCTUnwrap(window)
            XCTAssertEqual(window.appearance?.bestMatch(from: [.aqua, .darkAqua]), .aqua)
            XCTAssertEqual(window.contentView?.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]), .aqua)
        }
        desktop.show(); windows.sayIdleLine()
        try check(NSApp.windows.first { $0.isVisible && $0.contentView is NSHostingView<IdleBubbleView> })
        store.bubble = ModelReply(text: "一起喝杯茶吧。", truncated: false)
        try check(NSApp.windows.first { $0.isVisible && $0.contentView is NSHostingView<IdleBubbleView> })
        for _ in 0..<2 {
            windows.openChat()
            try check(NSApp.windows.first { $0.isVisible && $0.contentView is NSHostingView<ChatView> })
            windows.closeChat(restoreFocus: false)
            windows.openSettings()
            let settings = NSApp.windows.first { $0.isVisible && $0.contentView is NSHostingView<SettingsView> }
            try check(settings)
            settings?.close()
        }
    }
}
