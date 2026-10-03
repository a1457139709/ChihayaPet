import AppKit
import CryptoKit
import XCTest
@testable import ChihayaPet

@MainActor
final class StandingCharacterTests: XCTestCase {
    private func library() throws -> StandingCharacterLibrary {
        try StandingCharacterLibrary(rootURL: XCTUnwrap(Bundle.main.url(forResource: "Standing", withExtension: nil, subdirectory: "Characters")))
    }

    func testBundledGalleryContainsAll26ViewsAnd292NumberedImages() throws {
        let library = try library()
        XCTAssertEqual(library.manifest.outfits.count, 13)
        XCTAssertEqual(Set(library.manifest.outfits.map(\.id)), Set(StandingCharacterOutfit.allCases.map(\.rawValue)))
        XCTAssertEqual(library.manifest.variants.count, 26)
        XCTAssertEqual(library.manifest.variants.values.reduce(0) { $0 + $1.results.count }, 292)
        for outfit in StandingCharacterOutfit.allCases {
            XCTAssertEqual(library.manifest.outfits.first { $0.id == outfit.rawValue }?.name, outfit.title)
            for framing in CharacterFraming.allCases {
                let variant = try XCTUnwrap(library.variant(outfit: outfit, framing: framing))
                let count = outfit == .winterSide || outfit == .summerSide ? 7 : 12
                XCTAssertEqual(variant.results.map(\.id), (0..<count).map { String(format: "%02d", $0) })
                XCTAssertEqual(variant.canvas[1], framing == .full ? 606 : 670)
                for result in variant.results {
                    let frame = try library.image(key: "\(outfit.rawValue)/\(framing.rawValue)", faceID: result.id, allowPendingForQA: true)
                    XCTAssertEqual(frame.image.width, variant.canvas[0])
                    XCTAssertEqual(frame.image.height, variant.canvas[1])
                    XCTAssertLessThanOrEqual(library.cachedImageCount, 12)
                    if !result.isApproved {
                        XCTAssertThrowsError(try library.image(key: frame.key, faceID: result.id), "QA cache must not bypass approval")
                    }
                }
            }
        }
    }

    func testAllExpressionsUseAtomicSavedPNGsAndKeepBodyPosition() throws {
        let library = try library()
        for outfit in StandingCharacterOutfit.allCases {
            for framing in CharacterFraming.allCases {
                let key = "\(outfit.rawValue)/\(framing.rawValue)"
                let renderer = PNGRenderer(style: outfit.legacyStyle ?? .casual, framing: framing,
                    imageHeight: 256, animationsEnabled: false, expansionResourceURL: nil,
                    standingOutfit: outfit, standingLibrary: library, allowPendingStandingForQA: true)
                defer { renderer.shutdown() }
                let originalFrame = renderer.imageFrame
                for result in try XCTUnwrap(library.manifest.variants[key]).results {
                    renderer.setNumberedExpressionMode(.numbered(result.id))
                    XCTAssertEqual(renderer.renderedStandingVariantKey, key)
                    XCTAssertEqual(renderer.renderedNumberedFaceID, result.id)
                    XCTAssertEqual(renderer.imageFrame, originalFrame)
                    XCTAssertTrue(renderer.hasImage)
                    XCTAssertFalse(renderer.usesExpansion)
                    let layers = try XCTUnwrap(renderer.view.subviews.first?.layer?.sublayers?.first?.sublayers?.first?.sublayers)
                    let active = layers.filter { !$0.isHidden && $0.contents != nil }
                    XCTAssertEqual(active.count, 1)
                    let image = try XCTUnwrap(active.first?.contents) as! CGImage
                    let source = try library.image(key: key, faceID: result.id, allowPendingForQA: true).image
                    XCTAssertEqual(image.dataProvider?.data as Data?, source.dataProvider?.data as Data?)
                    XCTAssertEqual(active.first?.frame.size, originalFrame.size)
                }
            }
        }
    }

    func testSpeechHairAnchorsMatchEachCurrentCompositeAtItsMouthRow() throws {
        let library = try library()
        for (key, variant) in library.manifest.variants {
            let image = try library.image(key: key, faceID: "00").image
            let bitmap = NSBitmapImageRep(cgImage: image)
            let row = Int(variant.speech.mouth[1])
            let visible = (0..<image.width).filter {
                (bitmap.colorAt(x: $0, y: row)?.alphaComponent ?? 0) > 0
            }
            XCTAssertEqual(variant.speech.hairLeft, CGFloat(try XCTUnwrap(visible.first)), key)
            XCTAssertEqual(variant.speech.hairRight, CGFloat(try XCTUnwrap(visible.last) + 1), key)
        }
    }

    func testAutomaticModeDoesNotInventBlinkMouthGazeOrMoodFrames() throws {
        let renderer = PNGRenderer(style: .casual, framing: .full, imageHeight: 256, animationsEnabled: true,
            expansionResourceURL: nil, standingOutfit: .maidWork, standingLibrary: try library())
        defer { renderer.shutdown() }
        XCTAssertEqual(renderer.renderedNumberedFaceID, "00")
        renderer.setPresented(true)
        renderer.setActivity(waitingForReply: true, speaking: true)
        renderer.setGaze(.left)
        renderer.setPetReaction(.closedEyeSmile)
        renderer.advanceAnimation(now: CACurrentMediaTime() + 60)
        XCTAssertEqual(renderer.renderedNumberedFaceID, "00")
        XCTAssertFalse(renderer.isScheduling, "Numbered sprites have no synthetic facial animation timer")
        renderer.setNumberedExpressionMode(.numbered("10"))
        renderer.setNumberedExpressionMode(.automatic)
        renderer.setActivity(waitingForReply: false, speaking: false)
        XCTAssertEqual(renderer.renderedNumberedFaceID, "10", "Without a reliable mapping, preserve a valid approved expression")
    }

    func testCrossVariantIDsPreferencesMigrationAndRestart() throws {
        let suite = "standing.selection.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("blue_rose", forKey: "desktop.expandedStyle")
        defaults.set("smile", forKey: "desktop.expandedExpressionMode")
        defaults.set("tea", forKey: "desktop.poseMode")
        let first = DesktopController(defaults: defaults)
        XCTAssertEqual(first.standingOutfit, .rose)
        XCTAssertEqual(first.numberedExpressionMode, .automatic, "Old emotions cannot be guessed as numbered faces")
        XCTAssertEqual(first.poseMode, .standing)
        first.setNumberedExpressionMode(.numbered("11"))
        first.setStandingOutfit(.winterSide)
        XCTAssertEqual(first.numberedExpressionMode, .numbered("00"))
        XCTAssertEqual(first.numberedExpressions.count, 7)
        first.setNumberedExpressionMode(.numbered("06"))
        first.setFraming(.close)
        first.shutdown()
        let restored = DesktopController(defaults: defaults)
        defer { restored.shutdown() }
        XCTAssertEqual(restored.standingOutfit, .winterSide)
        XCTAssertEqual(restored.framing, .close)
        XCTAssertEqual(restored.numberedExpressionMode, .numbered("06"))
        XCTAssertEqual(restored.renderedNumberedFaceID, "06")
        XCTAssertEqual(restored.renderedStandingVariantKey, "b/close")
    }

    func testInvalidPreferencesFallBackToValidWinter00AndAreRepaired() throws {
        let suite = "standing.invalid.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("missing-outfit", forKey: "desktop.standingOutfit")
        defaults.set("missing-framing", forKey: "desktop.framing")
        defaults.set("999", forKey: "desktop.numberedExpression")
        let desktop = DesktopController(defaults: defaults)
        defer { desktop.shutdown() }
        XCTAssertEqual(desktop.standingOutfit, .winterFront)
        XCTAssertEqual(desktop.framing, .full)
        XCTAssertEqual(desktop.renderedNumberedFaceID, "00")
        XCTAssertEqual(defaults.string(forKey: "desktop.standingOutfit"), "a")
        XCTAssertEqual(defaults.string(forKey: "desktop.framing"), "full")
        XCTAssertEqual(defaults.string(forKey: "desktop.numberedExpression"), "00")
    }

    private func fixture() throws -> (URL, [String: Any]) {
        let source = try library().rootURL
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("standing-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: source.appendingPathComponent("manifest.json"))) as? [String: Any])
        let all = try XCTUnwrap(json["variants"] as? [String: [String: Any]])
        let variants = all.filter { ["a/full", "a/close"].contains($0.key) }
        json["outfits"] = [["id": "a", "name": "冬服正面"]]
        json["variants"] = variants
        for variant in variants.values {
            for result in variant["results"] as! [[String: Any]] {
                let path = result["path"] as! String
                let target = root.appendingPathComponent(path)
                try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try FileManager.default.copyItem(at: source.appendingPathComponent(path), to: target)
            }
        }
        return (root, json)
    }
    private func save(_ json: [String: Any], root: URL) throws {
        try JSONSerialization.data(withJSONObject: json).write(to: root.appendingPathComponent("manifest.json"))
    }

    func testPendingDamagedAndMissingFramesReturnNilForTheRequestedImage() throws {
        let (root, initial) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        var json = initial
        var variants = json["variants"] as! [String: [String: Any]]
        var close = variants["a/close"]!
        var results = close["results"] as! [[String: Any]]
        results[1]["review"] = ["status": "pending"]
        close["results"] = results; variants["a/close"] = close; json["variants"] = variants
        try save(json, root: root)
        XCTAssertNil(try StandingCharacterLibrary(rootURL: root).resolve(outfit: .winterFront, framing: .close, faceID: "01"))
        try Data("corrupt PNG".utf8).write(to: root.appendingPathComponent(results[2]["path"] as! String))
        XCTAssertNil(try StandingCharacterLibrary(rootURL: root).resolve(outfit: .winterFront, framing: .close, faceID: "02"))
        try FileManager.default.removeItem(at: root.appendingPathComponent(results[0]["path"] as! String))
        let library = try StandingCharacterLibrary(rootURL: root)
        XCTAssertNil(library.resolve(outfit: .winterFront, framing: .close, faceID: "00"))
        XCTAssertNil(library.resolve(outfit: .rose, framing: .close, faceID: "00"))
        XCTAssertNotNil(library.resolve(outfit: .winterFront, framing: .full, faceID: "00"),
            "An available image from another view must not replace the requested image")
    }

    func testUnsupportedManifestAndAbsentPackLeaveTheRendererEmpty() throws {
        let (root, initial) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        var json = initial; json["version"] = 99
        try save(json, root: root)
        XCTAssertThrowsError(try StandingCharacterLibrary(rootURL: root))
        for url in [root, root.appendingPathComponent("absent")] {
            let renderer = PNGRenderer(style: .winterFront, framing: .close, imageHeight: 256, animationsEnabled: true,
                standingOutfit: .maid, standingResourceURL: url)
            defer { renderer.shutdown() }
            XCTAssertFalse(renderer.hasImage)
            XCTAssertNil(renderer.standingFrame)
            XCTAssertEqual(renderer.cachedImageCount, 0)
            renderer.setPresented(true)
            XCTAssertFalse(renderer.isScheduling)
            XCTAssertTrue(renderer.contentSize.width.isFinite && renderer.contentSize.width > 0)
            let layers = try XCTUnwrap(renderer.view.subviews.first?.layer?.sublayers?.first?.sublayers?.first?.sublayers)
            XCTAssertTrue(layers.allSatisfy { $0.contents == nil })
        }
    }

    func testFailedExpressionAndViewSwitchesClearThePreviouslyDisplayedImage() throws {
        let (root, json) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        try save(json, root: root)
        let variants = json["variants"] as! [String: [String: Any]]
        let results = variants["a/full"]!["results"] as! [[String: Any]]
        try FileManager.default.removeItem(at: root.appendingPathComponent(results[1]["path"] as! String))
        let renderer = PNGRenderer(style: .winterFront, framing: .full, imageHeight: 256, animationsEnabled: true,
            standingLibrary: try StandingCharacterLibrary(rootURL: root))
        defer { renderer.shutdown() }
        renderer.setPresented(true)
        XCTAssertTrue(renderer.hasImage)
        renderer.setNumberedExpressionMode(.numbered("01"))
        XCTAssertFalse(renderer.hasImage)
        XCTAssertNil(renderer.renderedNumberedFaceID)
        let layers = try XCTUnwrap(renderer.view.subviews.first?.layer?.sublayers?.first?.sublayers?.first?.sublayers)
        XCTAssertTrue(layers.allSatisfy { $0.contents == nil })
        renderer.setNumberedExpressionMode(.numbered("00"))
        XCTAssertTrue(renderer.hasImage)
        renderer.setStandingCharacter(outfit: .rose, framing: .close)
        XCTAssertFalse(renderer.hasImage)
        XCTAssertNil(renderer.renderedStandingVariantKey)
        XCTAssertTrue(layers.allSatisfy { $0.contents == nil })
    }

    func testUnsafePathsAndInvalidGeometryCannotReachImageDecoding() throws {
        let (root, initial) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        for invalid in ["../outside.png", "/tmp/outside.png", "sprites/../outside.png"] {
            var json = initial
            var variants = json["variants"] as! [String: [String: Any]]
            var variant = variants["a/full"]!
            var results = variant["results"] as! [[String: Any]]
            results[0]["path"] = invalid; variant["results"] = results; variants["a/full"] = variant
            json["variants"] = variants; try save(json, root: root)
            XCTAssertThrowsError(try StandingCharacterLibrary(rootURL: root))
        }
    }
}
