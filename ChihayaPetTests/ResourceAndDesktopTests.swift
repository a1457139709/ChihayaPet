import AppKit
import XCTest
@testable import ChihayaPet

@MainActor
final class ResourceAndDesktopTests: XCTestCase {
    func testChangingStyleAndFramingRefreshesPanelsWithoutMovingBottomCenter() {
        let suite = "desktop.style.geometry.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let screen = try! XCTUnwrap(NSScreen.screens.first?.visibleFrame)
        defaults.set(Double(screen.midX - 100), forKey: "desktop.frameX")
        defaults.set(Double(screen.minY + 80), forKey: "desktop.frameY")
        let desktop = DesktopController(defaults: defaults)
        defer { desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }
        let originalFrame = desktop.frame
        var notifiedSelections: [(CharacterStyle, CharacterFraming)] = []
        desktop.onGeometryChange = { notifiedSelections.append((desktop.style, desktop.framing)) }

        desktop.setStyle(.gym)
        desktop.setFraming(.close)

        XCTAssertEqual(desktop.frame.midX, originalFrame.midX, accuracy: 0.001)
        XCTAssertEqual(desktop.frame.minY, originalFrame.minY, accuracy: 0.001)
        XCTAssertEqual(notifiedSelections.count, 2)
        XCTAssertEqual(notifiedSelections.last?.0, .gym)
        XCTAssertEqual(notifiedSelections.last?.1, .close)
    }

    func testBundledOutfitsLoadWithOriginalAspectAndTransparency() throws {
        for name in ["chihaya-summer", "chihaya-winter"] {
            let image = try XCTUnwrap(NSImage(named: NSImage.Name(name)))
            XCTAssertEqual(image.size.width / image.size.height, 441.0 / 516.0, accuracy: 0.0001)
            let bitmap = try XCTUnwrap(NSBitmapImageRep(data: try XCTUnwrap(image.tiffRepresentation)))
            XCTAssertTrue(bitmap.hasAlpha)
            XCTAssertEqual(try XCTUnwrap(bitmap.colorAt(x: 0, y: 0)).alphaComponent, 0)
        }
    }
    func testLegacyOutfitMigratesOnceToTypedStyle() {
        for (legacy, expected) in [("winter", CharacterStyle.winterFront), ("summer", .summerFront)] {
            let suite = "desktop.migration.\(legacy).\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: suite)!
            defaults.set(legacy, forKey: "desktop.outfit")

            let first = DesktopController(defaults: defaults)
            XCTAssertEqual(first.style, expected)
            XCTAssertEqual(defaults.string(forKey: "desktop.style"), expected.rawValue)
            first.shutdown()

            defaults.set(legacy == "winter" ? "summer" : "winter", forKey: "desktop.outfit")
            let restored = DesktopController(defaults: defaults)
            XCTAssertEqual(restored.style, expected)
            restored.shutdown()
            defaults.removePersistentDomain(forName: suite)
        }
    }

    func testSelectionsAndCustomSizePersistButClickThroughResets() {
        let suite = "local.ChihayaPet.Tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let first = DesktopController(defaults: defaults)
        XCTAssertEqual(first.imageHeight, 256)
        XCTAssertEqual(first.style, .winterFront)
        XCTAssertEqual(first.framing, .full)
        XCTAssertEqual(first.expressionMode, .automatic)
        first.setStyle(.pink)
        first.setFraming(.close)
        first.setExpressionMode(.surprised)
        first.setHeight(347)
        first.setClickThrough(true)
        XCTAssertEqual(first.imageHeight, 347)
        first.setHeight(900)
        XCTAssertEqual(first.imageHeight, 480)
        XCTAssertEqual(first.frame.height, 504)
        first.shutdown()
        let restored = DesktopController(defaults: defaults)
        XCTAssertEqual(restored.imageHeight, 480)
        XCTAssertEqual(restored.style, .pink)
        XCTAssertEqual(restored.framing, .close)
        XCTAssertEqual(restored.expressionMode, .surprised)
        XCTAssertFalse(restored.clickThrough)
        restored.setHeight(10)
        XCTAssertEqual(restored.imageHeight, 240)
        XCTAssertEqual(restored.frame.height, 264)
        restored.shutdown()
    }
    func testAllStyleAndFramingSizesLeaveRoomForAnimationAndExposeAnchors() throws {
        for style in CharacterStyle.allCases {
            for framing in CharacterFraming.allCases {
                for height: CGFloat in [240, 256, 480] {
                    let renderer = PNGRenderer(style: style, framing: framing, imageHeight: height, animationsEnabled: true)
                    XCTAssertEqual(renderer.contentSize.height, height + 24)
                    let bounds = CGRect(origin: .zero, size: renderer.contentSize)
                    let transformed = renderer.imageFrame
                        .insetBy(dx: -renderer.imageFrame.width * 0.01, dy: -height * 0.01)
                        .offsetBy(dx: 0, dy: 2)
                    XCTAssertTrue(bounds.contains(transformed), "\(style) \(framing) \(height)")
                    XCTAssertTrue(bounds.contains(renderer.speechAttachment.mouth), "\(style) \(framing) \(height)")
                    XCTAssertGreaterThan(renderer.speechAttachment.hairLeft, renderer.imageFrame.minX)
                    XCTAssertLessThan(renderer.speechAttachment.hairRight, renderer.imageFrame.maxX)
                    XCTAssertLessThan(renderer.speechAttachment.hairLeft, renderer.speechAttachment.hairRight)
                    renderer.shutdown()
                }
            }
        }
    }

    func testSpeechAttachmentUsesScreenCoordinates() {
        let suite = "desktop.attachment.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        defer { desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }

        let attachment = desktop.speechAttachment

        XCTAssertTrue(desktop.frame.contains(attachment.mouth))
        XCTAssertGreaterThan(attachment.hairLeft, desktop.frame.minX)
        XCTAssertLessThan(attachment.hairRight, desktop.frame.maxX)
    }

    func testActivityUpdatesAutomaticExpressionAndManualModeOverridesIt() {
        let suite = "desktop.activity.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        defer { desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }

        desktop.setActivity(waitingForReply: true, speaking: false)
        XCTAssertEqual(desktop.currentExpression, .serious)
        desktop.setActivity(waitingForReply: false, speaking: false)
        XCTAssertEqual(desktop.currentExpression, .neutral)
        desktop.setExpressionMode(.surprised)
        desktop.setActivity(waitingForReply: true, speaking: true)
        XCTAssertEqual(desktop.currentExpression, .surprised)
    }

    func testAnimationPolicyNotificationCallsBackImmediately() {
        let suite = "desktop.motion-policy.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(defaults: defaults)
        defer { desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }
        var callbackCount = 0
        desktop.onAnimationPolicyChanged = { callbackCount += 1 }

        desktop.setAnimations(false)
        XCTAssertFalse(desktop.effectiveAnimationsEnabled)
        XCTAssertEqual(callbackCount, 1)

        NSWorkspace.shared.notificationCenter.post(
            name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
            object: nil
        )
        XCTAssertEqual(callbackCount, 2)
    }
}
