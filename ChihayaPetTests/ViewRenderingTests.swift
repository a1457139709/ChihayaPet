import AppKit
import SwiftUI
import XCTest
@testable import ChihayaPet

@MainActor
final class ViewRenderingTests: XCTestCase {
    func testRenderIdleBubbleBesideVisibleCharacter() throws {
        for style in CharacterStyle.allCases {
            for framing in CharacterFraming.allCases {
                for height in [240.0, 256, 480] {
                    for leftSide in [true, false] {
                        let renderer = PNGRenderer(style: style, framing: framing, imageHeight: height, animationsEnabled: false)
                        defer { renderer.shutdown() }
                        let size = CGSize(width: 800, height: height + 80)
                        let pet = CGRect(origin: CGPoint(x: leftSide ? size.width - renderer.contentSize.width - 20 : 20, y: 20), size: renderer.contentSize)
                        let presentation = DialoguePresentation(text: "方糖会慢慢融进茶里。有些细小的好意，也是这样不声不响地留下来。", width: IdleBubbleLayout.textWidth, style: .idle, paginated: false, animated: false)
                        presentation.start()
                        defer { presentation.stop() }
                        let layout = IdleBubbleLayout(pet: pet, screen: CGRect(origin: .zero, size: size), textHeight: presentation.height, attachment: renderer.speechAttachment.translated(by: pet.origin))
                        let scene = ZStack(alignment: .topLeading) {
                            (leftSide ? Color.white : Color(white: 0.13))
                            NativeCharacterTestView(renderer: renderer)
                                .frame(width: pet.width, height: pet.height)
                                .offset(x: pet.minX, y: size.height - pet.maxY)
                            IdleBubbleView(presentation: presentation, position: IdleBubblePosition(layout), onClose: {})
                                .offset(x: layout.frame.minX, y: size.height - layout.frame.maxY)
                        }.frame(width: size.width, height: size.height, alignment: .topLeading)
                        try render(scene, size: size, name: "idle-scene-\(style.rawValue)-\(framing.rawValue)-\(Int(height))-\(leftSide ? "left" : "right")")
                    }
                }
            }
        }
    }

    func testRenderIdleThemeAtBothScreenEdges() throws {
        let lines = ["早安。", "方糖会慢慢融进茶里。有些细小的好意，也是这样不声不响地留下来。"]
        for (index, text) in lines.enumerated() {
            let presentation = DialoguePresentation(text: text, width: IdleBubbleLayout.textWidth, style: .idle, paginated: false, animated: false)
            presentation.start()
            defer { presentation.stop() }
            for x in [0.0, 650] {
                let layout = IdleBubbleLayout(pet: CGRect(x: x, y: 520, width: 150, height: 272), screen: CGRect(x: 0, y: 0, width: 800, height: 800), textHeight: presentation.height, attachment: CharacterSpeechAttachment(mouth: CGPoint(x: x + 75, y: 700), hairLeft: x + 20, hairRight: x + 130))
                let bitmap = try render(IdleBubbleView(presentation: presentation, position: IdleBubblePosition(layout), onClose: {}), size: layout.frame.size, name: "idle-\(index)-\(Int(x))", parentScheme: .dark)
                // Flowers and the tail must have transparent clearance on every edge.
                // A centered intrinsic ZStack used to shift them outside the window.
                let horizontalEdges = (0..<bitmap.pixelsWide).flatMap { [(x: $0, y: 0), (x: $0, y: bitmap.pixelsHigh - 1)] }
                let verticalEdges = (0..<bitmap.pixelsHigh).flatMap { [(x: 0, y: $0), (x: bitmap.pixelsWide - 1, y: $0)] }
                let clippedPixels = (horizontalEdges + verticalEdges).filter {
                    (bitmap.colorAt(x: $0.x, y: $0.y)?.alphaComponent ?? 0) > 0.01
                }
                XCTAssertTrue(clippedPixels.isEmpty, "Idle bubble touches the clipping boundary: \(index), \(x)")
            }
        }
    }

    func testRenderChatSettingsAndReplyForVisualInspection() async throws {
        let client = ControlledClient()
        let credentials = MemoryCredentials()
        credentials.values["https://example.com/v1"] = "test-only"
        let store = AppStore(client: client, credentials: credentials, preferences: MemoryPreferences())
        store.input = "今天有些疲惫，能陪我聊一会儿吗？"
        store.send()
        for _ in 0..<1000 { if await client.count() == 1 { break }; await Task.yield() }
        await client.succeed(0, "当然可以。先放松一下吧，不必急着把所有事都做好。你愿意和我说说，今天发生了什么吗？")
        for _ in 0..<1000 { if !store.isBusy { break }; await Task.yield() }
        XCTAssertEqual(store.history.turns.count, 1)
        try render(ChatView(store: store, onClose: {}, onSettings: {}), size: CGSize(width: 360, height: 420), name: "chat")
        store.beginSettings()
        try render(SettingsView(store: store), size: CGSize(width: 520, height: 580), name: "settings")
        store.settingsTab = 1
        store.draftPrompt = SavedSettings.defaultPrompt
        try render(SettingsView(store: store), size: CGSize(width: 520, height: 580), name: "persona")
        let dialogue = DialoguePresentation(text: "不必急着回答。我只是想，若能与你这样安静地待一会儿，也很好。", animated: false)
        dialogue.start()
        defer { dialogue.stop() }
        try render(DialogueView(presentation: dialogue, onClose: {}), size: ChihayaStyle.panelSize, name: "bubble")
        let idleText = "一直盯着屏幕，也该休息一下了。……要我提醒第二遍吗？"
        let idle = DialoguePresentation(text: idleText, width: IdleBubbleLayout.textWidth, style: .idle, paginated: false, animated: false)
        idle.start()
        defer { idle.stop() }
        let layout = IdleBubbleLayout(pet: CGRect(x: 600, y: 100, width: 150, height: 272), screen: CGRect(x: 0, y: 0, width: 1200, height: 800), textHeight: idle.height, attachment: CharacterSpeechAttachment(mouth: CGPoint(x: 675, y: 290), hairLeft: 620, hairRight: 730))
        try render(IdleBubbleView(presentation: idle, position: IdleBubblePosition(layout), onClose: {}), size: layout.frame.size, name: "idle")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "render.music.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let music = MusicController(library: MusicLibrary(directory: root), defaults: defaults)
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite) }
        try render(MusicSettingsView(music: music), size: CGSize(width: 470, height: 440), name: "music")
        try render(ChatView(store: store, onClose: {}, onSettings: {}), size: CGSize(width: 360, height: 420), name: "chat-dark-host", parentScheme: .dark)
        try render(SettingsView(store: store, music: music), size: CGSize(width: 520, height: 580), name: "persona-dark-host", parentScheme: .dark)
        store.settingsTab = 2
        try render(SettingsView(store: store, music: music), size: CGSize(width: 520, height: 580), name: "music-settings", parentScheme: .dark)
    }
    @discardableResult
    private func render<V: View>(_ view: V, size: CGSize, name: String, parentScheme: ColorScheme = .light) throws -> NSBitmapImageRep {
        let host = NSHostingView(rootView: view.environment(\.colorScheme, parentScheme))
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        ChihayaStyle.configureWindow(window)
        host.frame = CGRect(origin: .zero, size: size)
        host.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let data = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
        try data.write(to: URL(fileURLWithPath: "/tmp/chihaya-\(name).png"))
        XCTAssertGreaterThan(data.count, 1_000)
        window.close()
        return bitmap
    }
}

private struct NativeCharacterTestView: NSViewRepresentable {
    let renderer: PNGRenderer
    func makeNSView(context: Context) -> NSView { renderer.view }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
