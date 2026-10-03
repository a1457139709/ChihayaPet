import AppKit
import CryptoKit
import XCTest
@testable import ChihayaPet

final class CharacterExpansionIntegrationTests: XCTestCase {
    @MainActor
    func testNativeTimelineDeadlineRerendersBlinkAndSpeakingMouthWithoutOtherUpdates() throws {
        let states = [ExpandedCharacterExpression.neutral, .smile].flatMap { expression in
            CharacterEye.allCases.flatMap { eye in
                CharacterMouth.allCases.map {
                    ExpansionFaceState(expression: expression, eye: eye, gaze: .center, mouth: $0)
                }
            }
        }
        let fixture = try makeExpansionFixture(states: states)
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let renderer = PNGRenderer(
            style: .winterFront, framing: .full, imageHeight: 8, animationsEnabled: true,
            resourceURL: nil, expansionResourceURL: nil, expansionLibrary: fixture.library,
            animationRandom: { $0.lowerBound }
        )
        defer { renderer.shutdown() }

        renderer.setPresented(true)
        XCTAssertEqual(
            renderer.renderedExpansionFaceState,
            ExpansionFaceState(expression: .neutral, eye: .open, gaze: .center, mouth: .closed)
        )

        renderer.advanceAnimation(now: try XCTUnwrap(renderer.nextAnimationDeadline))
        XCTAssertEqual(renderer.renderedExpansionFaceState?.eye, .half, "the timer path must install the blink frame")

        renderer.setActivity(waitingForReply: false, speaking: true)
        XCTAssertEqual(renderer.renderedExpansionFaceState?.mouth, .small)
        for _ in 0..<4 where renderer.renderedExpansionFaceState?.mouth != .medium {
            renderer.advanceAnimation(now: try XCTUnwrap(renderer.nextAnimationDeadline))
        }
        XCTAssertEqual(renderer.renderedExpansionFaceState?.mouth, .medium, "the timer path must install the next speaking frame")
    }

    @MainActor
    func testDraftPublisherFreezesAndResumesPoseDeadlineFromItsEmittedValue() {
        let now: TimeInterval = 100
        let suite = "desktop.expansion.draft.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(
            defaults: defaults,
            expansionResourceURL: nil,
            useNumberedSprites: false,
            poseNow: { now },
            poseRandomDelay: { 300 },
            choosePose: { $0[0] }
        )
        desktop.show()
        let store = AppStore(client: ControlledClient(), credentials: MemoryCredentials(), preferences: MemoryPreferences())
        let windows = InteractionWindows(store: store, desktop: desktop, defaults: defaults)
        defer { windows.shutdown(); desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }
        XCTAssertEqual(desktop.poseDeadline, 400)

        store.input = "draft"
        XCTAssertNil(desktop.poseDeadline, "the nonempty emitted draft must pause the automatic pose deadline immediately")

        store.input = ""
        XCTAssertEqual(desktop.poseDeadline, 400, "clearing the emitted draft must resume with the frozen eligible time")
    }

    @MainActor
    func testChangingExpressionPrewarmsEveryDeclaredStateOnExistingVariantOnce() throws {
        let expressions: [ExpandedCharacterExpression] = [.neutral, .serious]
        let states = expressions.flatMap { expression in
            CharacterEye.allCases.flatMap { eye in
                CharacterGaze.allCases.flatMap { gaze in
                    CharacterMouth.allCases.map { mouth in
                        ExpansionFaceState(expression: expression, eye: eye, gaze: gaze, mouth: mouth)
                    }
                }
            }
        }
        let fixture = try makeExpansionFixture(states: states)
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let renderer = PNGRenderer(
            style: .winterFront, framing: .full, imageHeight: 8, animationsEnabled: false,
            resourceURL: nil, expansionResourceURL: nil, expansionLibrary: fixture.library
        )
        defer { renderer.shutdown() }

        let neutralCount = renderer.cachedImageCount
        XCTAssertEqual(neutralCount, 1 + CharacterEye.allCases.count * CharacterGaze.allCases.count * CharacterMouth.allCases.count)
        renderer.setExpandedExpressionMode(.serious)
        XCTAssertEqual(
            renderer.cachedImageCount,
            neutralCount + CharacterEye.allCases.count * CharacterGaze.allCases.count * CharacterMouth.allCases.count,
            "the newly resolved expression must be fully prewarmed without reloading the variant"
        )
        let warmedCount = renderer.cachedImageCount
        renderer.setExpandedExpressionMode(.neutral)
        renderer.setExpandedExpressionMode(.serious)
        XCTAssertEqual(renderer.cachedImageCount, warmedCount, "revisiting cached expression states must preserve the bounded cache")
    }

    @MainActor
    func testNeutralOnlyRequestedPoseRetriesStandingWhenItsInitialFaceIsUnavailable() throws {
        let neutral = ExpansionFaceState(expression: .neutral, eye: .open, gaze: .center, mouth: .closed)
        let fixture = try makeExpansionFixture(states: [neutral], poses: [.standing, .reading])
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let renderer = PNGRenderer(
            style: .winterFront, framing: .full, imageHeight: 8, animationsEnabled: false,
            resourceURL: nil, expansionResourceURL: nil, expansionLibrary: fixture.library
        )
        defer { renderer.shutdown() }

        renderer.setPose(.reading)
        XCTAssertTrue(renderer.usesExpansion)
        XCTAssertEqual(renderer.pose, .reading)
        XCTAssertEqual(renderer.renderedExpansionVariantKey, "a/standing/full", "observation must report installed variant rather than requested pose")
        XCTAssertEqual(renderer.renderedExpansionPose, .standing)
        XCTAssertEqual(renderer.renderedExpansionFaceState, neutral)
    }

    func testFacePolicyUsesManualThenTypingWaitingPetAndPosePriority() {
        let animatedEye = CharacterEye.half
        let animatedMouth = CharacterMouth.medium

        let manual = CharacterFacePolicy.resolve(
            mode: .proud, pose: .dozing, visibleTyping: true, waiting: true,
            petReaction: .closedEyeSmile, animatedEye: animatedEye,
            animatedMouth: animatedMouth, gaze: .left
        )
        XCTAssertEqual(manual.expression, .proud)
        XCTAssertEqual(manual.eye, .half)
        XCTAssertEqual(manual.mouth, .medium)

        let typing = CharacterFacePolicy.resolve(
            mode: .automatic, pose: .dozing, visibleTyping: true, waiting: true,
            petReaction: .closedEyeSmile, animatedEye: animatedEye,
            animatedMouth: animatedMouth, gaze: .right
        )
        XCTAssertEqual(typing.expression, .smile)
        XCTAssertEqual(typing.eye, .half, "visible speaking opens dozing eyes")
        XCTAssertEqual(typing.mouth, .medium)

        let waiting = CharacterFacePolicy.resolve(
            mode: .automatic, pose: .standing, visibleTyping: false, waiting: true,
            petReaction: .closedEyeSmile, animatedEye: animatedEye,
            animatedMouth: animatedMouth, gaze: .center
        )
        XCTAssertEqual(waiting.expression, .serious)
        XCTAssertEqual(waiting.mouth, .closed)

        let pet = CharacterFacePolicy.resolve(
            mode: .automatic, pose: .standing, visibleTyping: false, waiting: false,
            petReaction: .closedEyeSmile, animatedEye: animatedEye,
            animatedMouth: animatedMouth, gaze: .up
        )
        XCTAssertEqual(pet.expression, .smile)
        XCTAssertEqual(pet.eye, .closed)

        let reading = CharacterFacePolicy.resolve(
            mode: .automatic, pose: .reading, visibleTyping: false, waiting: false,
            petReaction: nil, animatedEye: animatedEye,
            animatedMouth: animatedMouth, gaze: .down
        )
        XCTAssertEqual(reading.expression, .serious)
        XCTAssertEqual(reading.gaze, .down)

        let dozing = CharacterFacePolicy.resolve(
            mode: .automatic, pose: .dozing, visibleTyping: false, waiting: false,
            petReaction: nil, animatedEye: animatedEye,
            animatedMouth: animatedMouth, gaze: .center
        )
        XCTAssertEqual(dozing.expression, .sleepy)
        XCTAssertEqual(dozing.eye, .closed)
    }

    func testDeadlineGenerationRejectsCancelledAndReplacedCallbacks() {
        var generation = CharacterDeadlineGeneration()
        let first = generation.issue()
        XCTAssertTrue(generation.accepts(first))

        generation.cancel()
        XCTAssertFalse(generation.accepts(first))

        let second = generation.issue()
        let third = generation.issue()
        XCTAssertFalse(generation.accepts(second))
        XCTAssertTrue(generation.accepts(third))
    }

    @MainActor
    func testExpandedPreferencesMigrateIndependentlyAndClickThroughStillResets() {
        let suite = "desktop.expansion.preferences.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(CharacterStyle.pink.rawValue, forKey: "desktop.style")
        defaults.set(CharacterExpressionMode.surprised.rawValue, forKey: "desktop.expressionMode")

        let first = DesktopController(defaults: defaults, expansionResourceURL: nil, useNumberedSprites: false)
        XCTAssertEqual(first.expandedStyle, .pink)
        XCTAssertEqual(first.expandedExpressionMode, .surprised)
        XCTAssertEqual(first.poseMode, .automatic)
        XCTAssertTrue(first.gazeEnabled)
        XCTAssertTrue(first.headPettingEnabled)

        first.setExpandedStyle(.blueRose)
        first.setExpandedExpressionMode(.shy)
        first.setPoseMode(.reading)
        first.setGazeEnabled(false)
        first.setHeadPettingEnabled(false)
        first.setClickThrough(true)
        first.shutdown()

        let restored = DesktopController(defaults: defaults, expansionResourceURL: nil, useNumberedSprites: false)
        defer { restored.shutdown() }
        XCTAssertEqual(restored.expandedStyle, .blueRose)
        XCTAssertEqual(restored.style, .pink, "new-only styles preserve the legacy fallback preference")
        XCTAssertEqual(restored.expandedExpressionMode, .shy)
        XCTAssertEqual(restored.expressionMode, .surprised, "new-only expressions preserve the legacy fallback preference")
        XCTAssertEqual(restored.poseMode, .reading)
        XCTAssertFalse(restored.gazeEnabled)
        XCTAssertFalse(restored.headPettingEnabled)
        XCTAssertFalse(restored.clickThrough)

        restored.setStyle(.pink)
        restored.setExpressionMode(.surprised)
        XCTAssertEqual(restored.expandedStyle, .pink, "legacy style API can replace a new-only selection")
        XCTAssertEqual(restored.expandedExpressionMode, .surprised, "legacy expression API can replace a new-only selection")
    }

    @MainActor
    func testHardSuspensionCancelsPoseDeadlineAndResumeStartsFresh() {
        var now: TimeInterval = 100
        let suite = "desktop.expansion.pose.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let desktop = DesktopController(
            defaults: defaults,
            expansionResourceURL: nil,
            useNumberedSprites: false,
            poseNow: { now },
            poseRandomDelay: { 300 },
            choosePose: { $0[0] }
        )
        defer { desktop.shutdown(); defaults.removePersistentDomain(forName: suite) }

        desktop.show()
        XCTAssertEqual(desktop.poseDeadline, 400)
        now = 150
        desktop.setClickThrough(true)
        XCTAssertNil(desktop.poseDeadline)

        now = 900
        desktop.setClickThrough(false)
        XCTAssertEqual(desktop.currentPose, .standing)
        XCTAssertEqual(desktop.poseDeadline, 1200)
    }

    @MainActor
    func testNativeFaceLayerFullyReplacesOldFaceWhenScaled() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        func png(name: String, width: Int, height: Int, rgba: (UInt8, UInt8, UInt8, UInt8)) throws -> ExpansionAsset {
            let bitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                isPlanar: false, colorSpaceName: .deviceRGB,
                bytesPerRow: width * 4, bitsPerPixel: 32
            )!
            for pixel in 0..<(width * height) {
                let bytes = bitmap.bitmapData!.advanced(by: pixel * 4)
                bytes[0] = rgba.0; bytes[1] = rgba.1; bytes[2] = rgba.2; bytes[3] = rgba.3
            }
            let data = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
            try data.write(to: root.appendingPathComponent(name))
            return ExpansionAsset(
                origin: .extensionPack,
                path: name,
                sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
                width: width,
                height: height
            )
        }

        let state = ExpansionFaceState(expression: .neutral, eye: .open, gaze: .center, mouth: .closed)
        let standing = ExpansionVariant(
            base: "base", source: "master",
            sourceCrop: .init(x: 0, y: 0, width: 4, height: 4),
            face: .init(x: 1, y: 1, width: 2, height: 2),
            head: .init(x: 0, y: 0, width: 4, height: 3),
            mouth: .init(x: 2, y: 2), hairLeft: 0, hairRight: 4,
            recipes: [.init(state: state, patches: [
                .init(asset: "face", destination: .init(x: 0, y: 0, width: 2, height: 2))
            ])]
        )
        var brokenReading = standing
        brokenReading.base = "missing"
        let baseAsset = try png(name: "base.png", width: 4, height: 4, rgba: (255, 0, 0, 255))
        let faceAsset = try png(name: "face.png", width: 2, height: 2, rgba: (0, 0, 255, 255))
        let manifest = ExpansionManifest(
            version: 1,
            assets: [
                "base": baseAsset,
                "face": faceAsset,
                "missing": ExpansionAsset(
                    origin: .extensionPack, path: "missing.png",
                    sha256: String(repeating: "0", count: 64), width: 4, height: 4
                )
            ],
            sourceArtworks: [.init(id: "master", projectRelativePath: "synthetic/master.png",
                sha256: baseAsset.sha256, width: baseAsset.width, height: baseAsset.height)],
            declaredStates: [state],
            variants: [
                "a/standing/full": standing,
                "a/reading/full": brokenReading
            ]
        )
        let library = try ExpansionLibrary(rootURL: root, manifest: manifest)
        let renderer = PNGRenderer(
            style: .winterFront, framing: .full, imageHeight: 8, animationsEnabled: false,
            resourceURL: nil, expansionResourceURL: nil, expansionLibrary: library
        )
        defer { renderer.shutdown() }
        XCTAssertTrue(renderer.usesExpansion)
        renderer.setPose(.reading)
        XCTAssertTrue(renderer.usesExpansion, "a broken requested pose retries the same style's standing variant")

        let prepared = try XCTUnwrap(library.prepare(style: .winterFront, pose: .standing, framing: .full).prepared)
        let base = try XCTUnwrap(prepared.images[prepared.variant.base])
        let face = try ExpansionFaceCache().image(for: prepared, state: state)
        let rootLayer = CALayer()
        let bodyLayer = CALayer()
        let faceLayer = CALayer()
        rootLayer.bounds = CGRect(x: 0, y: 0, width: 8, height: 8)
        rootLayer.addSublayer(bodyLayer)
        rootLayer.addSublayer(faceLayer)
        ExpansionNativeFaceAdapter.install(base: base, face: face, bodyLayer: bodyLayer, faceLayer: faceLayer)
        ExpansionNativeFaceAdapter.layout(
            variant: prepared.variant, base: base, in: rootLayer.bounds,
            bodyLayer: bodyLayer, faceLayer: faceLayer
        )

        let width = 8
        let height = 8
        let context = try XCTUnwrap(CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        rootLayer.render(in: context)
        let rep = NSBitmapImageRep(cgImage: try XCTUnwrap(context.makeImage()))
        for y in 2...5 {
            for x in 2...5 {
                let color = try XCTUnwrap(rep.colorAt(x: x, y: y))
                XCTAssertEqual(color.redComponent, 0, accuracy: 0.02, "old face leaked at \(x),\(y)")
                XCTAssertEqual(color.blueComponent, 1, accuracy: 0.02, "replacement seam at \(x),\(y)")
                XCTAssertEqual(color.alphaComponent, 1, accuracy: 0.02)
            }
        }
        XCTAssertEqual(try XCTUnwrap(rep.colorAt(x: 1, y: 3)).redComponent, 1, accuracy: 0.02)
        XCTAssertEqual(try XCTUnwrap(rep.colorAt(x: 6, y: 3)).redComponent, 1, accuracy: 0.02)
    }

    @MainActor
    private func makeExpansionFixture(
        states: [ExpansionFaceState],
        poses: [CharacterPose] = [.standing]
    ) throws -> (root: URL, library: ExpansionLibrary) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        func png(name: String, width: Int, height: Int, rgba: (UInt8, UInt8, UInt8, UInt8)) throws -> ExpansionAsset {
            let bitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                isPlanar: false, colorSpaceName: .deviceRGB,
                bytesPerRow: width * 4, bitsPerPixel: 32
            )!
            for pixel in 0..<(width * height) {
                let bytes = bitmap.bitmapData!.advanced(by: pixel * 4)
                bytes[0] = rgba.0; bytes[1] = rgba.1; bytes[2] = rgba.2; bytes[3] = rgba.3
            }
            let data = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
            try data.write(to: root.appendingPathComponent(name))
            return ExpansionAsset(
                origin: .extensionPack, path: name,
                sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
                width: width, height: height
            )
        }

        let recipes = states.map { state in
            ExpansionFaceRecipe(
                state: state,
                patches: [.init(asset: "face", destination: .init(x: 0, y: 0, width: 2, height: 2))]
            )
        }
        let variant = ExpansionVariant(
            base: "base", source: "master",
            sourceCrop: .init(x: 0, y: 0, width: 4, height: 4),
            face: .init(x: 1, y: 1, width: 2, height: 2),
            head: .init(x: 0, y: 0, width: 4, height: 3),
            mouth: .init(x: 2, y: 2), hairLeft: 0, hairRight: 4,
            recipes: recipes
        )
        let baseAsset = try png(name: "base.png", width: 4, height: 4, rgba: (255, 0, 0, 255))
        let faceAsset = try png(name: "face.png", width: 2, height: 2, rgba: (0, 0, 255, 255))
        let manifest = ExpansionManifest(
            version: 1,
            assets: [
                "base": baseAsset,
                "face": faceAsset
            ],
            sourceArtworks: [.init(id: "master", projectRelativePath: "synthetic/master.png",
                sha256: baseAsset.sha256, width: baseAsset.width, height: baseAsset.height)],
            declaredStates: states,
            variants: Dictionary(uniqueKeysWithValues: poses.map { ("a/\($0.rawValue)/full", variant) })
        )
        return (root, try ExpansionLibrary(rootURL: root, manifest: manifest))
    }
}
