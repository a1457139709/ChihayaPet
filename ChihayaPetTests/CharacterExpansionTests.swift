import AppKit
import CryptoKit
import XCTest
@testable import ChihayaPet

final class CharacterExpansionTests: XCTestCase {
    private var root: URL!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: root) }

    private func fixture() throws -> ExpansionManifest {
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 4, pixelsHigh: 4,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 16, bitsPerPixel: 32)!
        for pixel in 0..<16 {
            let rgba = bitmap.bitmapData!.advanced(by: pixel * 4)
            rgba[0] = 255; rgba[1] = 0; rgba[2] = 0; rgba[3] = 255
        }
        let data = bitmap.representation(using: .png, properties: [:])!
        try data.write(to: root.appendingPathComponent("base.png"))
        let asset = ExpansionAsset(origin: .extensionPack, path: "base.png", sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), width: 4, height: 4)
        let source = ExpansionSourceArtwork(id: "master", projectRelativePath: "AIraw/master.png",
            sha256: asset.sha256, width: 4, height: 4)
        let state = ExpansionFaceState(expression: .neutral, eye: .open, gaze: .center, mouth: .closed)
        let variant = ExpansionVariant(base: "base", source: "master", sourceCrop: .init(x: 0, y: 0, width: 4, height: 4), face: .init(x: 1, y: 1, width: 2, height: 2), head: .init(x: 0, y: 0, width: 4, height: 3), mouth: .init(x: 2, y: 2), hairLeft: 0, hairRight: 4, recipes: [.init(state: state, patches: [])])
        return ExpansionManifest(version: 1, assets: ["base": asset], sourceArtworks: [source],
            declaredStates: [state], variants: ["a/standing/full": variant])
    }
    private func library(_ manifest: ExpansionManifest) throws -> ExpansionLibrary {
        try ExpansionLibrary(rootURL: root, manifest: manifest)
    }
    func testStagedValidationAndStrictCompletePackCoverage() throws {
        var manifest = try fixture()
        try library(manifest).validate(.staged)
        XCTAssertNotNil(try library(manifest).prepare(style: .winterFront, pose: .standing, framing: .full).prepared,
            "runtime preparation must not require the source artwork inside the package")
        XCTAssertThrowsError(try library(manifest).validate(.complete))
        let variant = manifest.variants["a/standing/full"]!
        manifest.declaredStates = ExpansionFaceState.all
        var completeVariant = variant
        completeVariant.recipes = manifest.declaredStates.map { .init(state: $0, patches: []) }
        for style in ExpandedCharacterStyle.allCases { for pose in CharacterPose.allCases { for framing in CharacterFraming.allCases {
            manifest.variants["\(style.rawValue)/\(pose.rawValue)/\(framing.rawValue)"] = completeVariant
        } } }
        try library(manifest).validate(.complete)
        manifest.variants.removeValue(forKey: "long_shirt/dozing/close")
        XCTAssertThrowsError(try library(manifest).validate(.complete))
    }
    func testBuildSourceVerificationUsesSeparateTrustedRoot() throws {
        let manifest = try fixture()
        let sourceRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: sourceRoot) }
        try FileManager.default.createDirectory(
            at: sourceRoot.appendingPathComponent("AIraw"), withIntermediateDirectories: true)
        try Data(contentsOf: root.appendingPathComponent("base.png"))
            .write(to: sourceRoot.appendingPathComponent("AIraw/master.png"))

        try library(manifest).verifySources(at: sourceRoot)
        try FileManager.default.removeItem(at: sourceRoot.appendingPathComponent("AIraw/master.png"))
        XCTAssertThrowsError(try library(manifest).verifySources(at: sourceRoot)) { error in
            XCTAssertEqual(error as? ExpansionResourceError, .invalidSource("master"))
        }
    }
    func testBuildSourceVerificationRejectsHashDimensionsAndSymlinkEscape() throws {
        let original = try fixture()
        let sourceRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let outside = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        defer {
            try? FileManager.default.removeItem(at: sourceRoot)
            try? FileManager.default.removeItem(at: outside)
        }
        try FileManager.default.createDirectory(
            at: sourceRoot.appendingPathComponent("AIraw"), withIntermediateDirectories: true)
        let data = try Data(contentsOf: root.appendingPathComponent("base.png"))
        try data.write(to: sourceRoot.appendingPathComponent("AIraw/master.png"))

        var manifest = original
        manifest.sourceArtworks[0].sha256 = String(repeating: "0", count: 64)
        XCTAssertThrowsError(try library(manifest).verifySources(at: sourceRoot)) { error in
            XCTAssertEqual(error as? ExpansionResourceError, .invalidSource("master"))
        }
        manifest = original
        manifest.sourceArtworks[0].width = 5
        XCTAssertThrowsError(try library(manifest).verifySources(at: sourceRoot)) { error in
            XCTAssertEqual(error as? ExpansionResourceError, .invalidSource("master"))
        }

        try FileManager.default.removeItem(at: sourceRoot.appendingPathComponent("AIraw/master.png"))
        try data.write(to: outside)
        try FileManager.default.createSymbolicLink(
            at: sourceRoot.appendingPathComponent("AIraw/master.png"), withDestinationURL: outside)
        XCTAssertThrowsError(try library(original).verifySources(at: sourceRoot)) { error in
            XCTAssertEqual(error as? ExpansionResourceError, .unsafePath("AIraw/master.png"))
        }
    }
    func testRejectsInvalidSourceMetadataReferencesAndCrop() throws {
        let original = try fixture()
        for path in ["", "../master.png", "/tmp/master.png", "AIraw/../master.png", "AIraw\\master.png"] {
            var manifest = original
            manifest.sourceArtworks[0].projectRelativePath = path
            XCTAssertThrowsError(try library(manifest).validate(.staged), path)
        }
        var manifest = original
        manifest.sourceArtworks[0].sha256 = "ABC"
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original
        manifest.sourceArtworks[0].width = 16_385
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original
        manifest.sourceArtworks.append(manifest.sourceArtworks[0])
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original
        manifest.variants["a/standing/full"]!.source = "missing"
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original
        manifest.variants["a/standing/full"]!.sourceCrop.width = 5
        XCTAssertThrowsError(try library(manifest).validate(.staged))
    }
    func testSourceMetadataCannotReplaceRuntimeAssetsOrHideUnusedExtensionFiles() throws {
        let original = try fixture()
        var manifest = original
        manifest.variants["a/standing/full"]!.base = "master"
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original
        manifest.variants["a/standing/full"]!.recipes[0].patches = [
            .init(asset: "master", destination: .init(x: 0, y: 0, width: 1, height: 1))]
        XCTAssertThrowsError(try library(manifest).validate(.staged))

        manifest = original
        manifest.declaredStates = ExpansionFaceState.all
        var completeVariant = manifest.variants["a/standing/full"]!
        completeVariant.recipes = manifest.declaredStates.map { .init(state: $0, patches: []) }
        for style in ExpandedCharacterStyle.allCases { for pose in CharacterPose.allCases { for framing in CharacterFraming.allCases {
            manifest.variants["\(style.rawValue)/\(pose.rawValue)/\(framing.rawValue)"] = completeVariant
        } } }
        manifest.assets["hidden-raw"] = manifest.assets["base"]
        XCTAssertThrowsError(try library(manifest).validate(.complete)) { error in
            XCTAssertEqual(error as? ExpansionResourceError, .invalidManifest("unreferenced extension assets"))
        }
    }
    func testPoutUsesRequestedDisplayTitleWithoutChangingIdentifier() {
        XCTAssertEqual(ExpandedCharacterExpression.pout.rawValue, "pout")
        XCTAssertEqual(ExpandedCharacterExpression.pout.title, "轻嗔")
    }
    func testRejectsUnsafeMissingAndSymlinkPaths() throws {
        for path in ["../base.png", "/tmp/base.png", "missing.png", "a/../base.png"] {
            var manifest = try fixture(); manifest.assets["base"]!.path = path
            XCTAssertThrowsError(try library(manifest).validate(.staged), path)
        }
        let outside = root.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".png")
        defer { try? FileManager.default.removeItem(at: outside) }
        try Data(contentsOf: root.appendingPathComponent("base.png")).write(to: outside)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("link.png"), withDestinationURL: outside)
        var manifest = try fixture(); manifest.assets["base"]!.path = "link.png"
        XCTAssertThrowsError(try library(manifest).validate(.staged))
    }
    func testRejectsHashDimensionsCoordinatesAndStateCoverage() throws {
        let original = try fixture()
        var manifest = original; manifest.assets["base"]!.sha256 = String(repeating: "0", count: 64)
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original; manifest.assets["base"]!.width = 8
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original; manifest.variants["a/standing/full"]!.face.x = .nan
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original; manifest.variants["a/standing/full"]!.head.width = 9
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original; manifest.variants["a/standing/full"]!.recipes = []
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original; manifest.variants["a/standing/full"]!.recipes[0].state.expression = .shy
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        manifest = original; manifest.variants["a/standing/full"]!.recipes[0].patches = [.init(asset: "base", destination: .init(x: 0, y: 0, width: 2, height: 2))]
        XCTAssertThrowsError(try library(manifest).validate(.staged))
    }
    func testRejectsExtremeDeclaredAssetDimensionsBeforePreparation() throws {
        for dimension in [Int.min, -1, 0, 16_385, Int.max] {
            for widthAxis in [true, false] {
                var manifest = try fixture()
                var extra = manifest.assets["base"]!
                if widthAxis { extra.width = dimension } else { extra.height = dimension }
                manifest.assets["extra"] = extra
                let lib = try library(manifest)
                XCTAssertThrowsError(try lib.validate(.staged)) { error in
                    XCTAssertEqual(error as? ExpansionResourceError, .invalidAsset("extra"))
                }
                XCTAssertThrowsError(try lib.prepare(style: .winterFront, pose: .standing, framing: .full)) { error in
                    XCTAssertEqual(error as? ExpansionResourceError, .invalidAsset("extra"))
                }
            }
        }
    }
    func testExtremeBaseAndFaceDimensionsThrowInsteadOfTrapping() throws {
        for widthAxis in [true, false] {
            var manifest = try fixture()
            if widthAxis {
                manifest.assets["base"]!.width = Int.max
                manifest.variants["a/standing/full"]!.face = .init(x: 0, y: 0, width: Double(Int.max), height: 2)
            } else {
                manifest.assets["base"]!.height = Int.max
                manifest.variants["a/standing/full"]!.face = .init(x: 0, y: 0, width: 2, height: Double(Int.max))
            }
            manifest.variants["a/standing/full"]!.recipes[0].patches = [
                .init(asset: "base", destination: .init(x: 0, y: 0, width: 1, height: 1))]
            let lib = try library(manifest)
            XCTAssertThrowsError(try lib.validate(.staged)) { error in
                XCTAssertEqual(error as? ExpansionResourceError, .invalidAsset("base"))
            }
            XCTAssertThrowsError(try lib.prepare(style: .winterFront, pose: .standing, framing: .full)) { error in
                XCTAssertEqual(error as? ExpansionResourceError, .invalidAsset("base"))
            }
        }
    }
    func testOpaqueReplacementCoversOldFaceAtTopLeftAndRejectsAlpha() throws {
        var manifest = try fixture()
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1, pixelsHigh: 1,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 4, bitsPerPixel: 32)!
        func setPatch(_ color: NSColor) throws {
            let rgba = bitmap.bitmapData!
            rgba[0] = 0; rgba[1] = 0; rgba[2] = UInt8(255 * color.alphaComponent); rgba[3] = UInt8(255 * color.alphaComponent)
            let data = bitmap.representation(using: .png, properties: [:])!
            try data.write(to: root.appendingPathComponent("patch.png"))
            manifest.assets["patch"] = .init(origin: .extensionPack, path: "patch.png",
                sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), width: 1, height: 1)
        }
        try setPatch(.blue)
        manifest.variants["a/standing/full"]!.recipes[0].patches = [
            .init(asset: "patch", destination: .init(x: 0, y: 0, width: 1, height: 1))]
        let lib = try library(manifest)
        try lib.validate(.staged)
        let prepared = try XCTUnwrap(lib.prepare(style: .winterFront, pose: .standing, framing: .full).prepared)
        let face = NSBitmapImageRep(cgImage: try ExpansionFaceCache().image(for: prepared, state: manifest.declaredStates[0]))
        XCTAssertEqual(face.colorAt(x: 0, y: 0)!.blueComponent, 1, accuracy: 0.01)
        XCTAssertEqual(face.colorAt(x: 0, y: 0)!.redComponent, 0, accuracy: 0.01)
        XCTAssertEqual(face.colorAt(x: 0, y: 1)!.alphaComponent, 0, accuracy: 0.01,
                       "pixels outside replacement patches must remain transparent")
        try setPatch(NSColor.blue.withAlphaComponent(0.5))
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        XCTAssertThrowsError(try library(manifest).prepare(style: .winterFront, pose: .standing, framing: .full))
    }
    func testEmptyFaceRecipeIsTransparentAndPreservesBaseComposition() throws {
        let manifest = try fixture()
        let prepared = try XCTUnwrap(library(manifest).prepare(
            style: .winterFront, pose: .standing, framing: .full).prepared)
        let overlay = try ExpansionFaceCache().image(for: prepared, state: manifest.declaredStates[0])
        let overlayRep = NSBitmapImageRep(cgImage: overlay)
        for y in 0..<overlay.height { for x in 0..<overlay.width {
            XCTAssertEqual(overlayRep.colorAt(x: x, y: y)!.alphaComponent, 0, accuracy: 0.001)
        } }

        let base = try XCTUnwrap(prepared.images[prepared.variant.base])
        func rendered(with overlay: CGImage?) throws -> Data {
            let context = try XCTUnwrap(CGContext(data: nil, width: base.width, height: base.height,
                bitsPerComponent: 8, bytesPerRow: base.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
            context.setBlendMode(.copy)
            context.draw(base, in: CGRect(x: 0, y: 0, width: base.width, height: base.height))
            if let overlay {
                context.setBlendMode(.normal)
                context.draw(overlay, in: prepared.variant.face.bottomLeftRect(canvasHeight: Double(base.height)))
            }
            return Data(bytes: try XCTUnwrap(context.data), count: base.width * base.height * 4)
        }
        XCTAssertEqual(try rendered(with: overlay), try rendered(with: nil))
    }
    func testFaceOverlayAppliesOverlappingPatchesInOrderAndEmptyStateHasNoResidue() throws {
        var manifest = try fixture()
        func addPatch(_ name: String, rgba: (UInt8, UInt8, UInt8, UInt8)) throws {
            let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1, pixelsHigh: 1,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                colorSpaceName: .deviceRGB, bytesPerRow: 4, bitsPerPixel: 32)!
            bitmap.bitmapData![0] = rgba.0; bitmap.bitmapData![1] = rgba.1
            bitmap.bitmapData![2] = rgba.2; bitmap.bitmapData![3] = rgba.3
            let data = bitmap.representation(using: .png, properties: [:])!
            try data.write(to: root.appendingPathComponent("\(name).png"))
            manifest.assets[name] = .init(origin: .extensionPack, path: "\(name).png",
                sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), width: 1, height: 1)
        }
        try addPatch("first", rgba: (0, 255, 0, 255))
        try addPatch("last", rgba: (0, 0, 255, 255))
        let empty = manifest.declaredStates[0]
        let edited = ExpansionFaceState(expression: .shy, eye: .open, gaze: .center, mouth: .closed)
        manifest.declaredStates.append(edited)
        manifest.variants["a/standing/full"]!.recipes.append(.init(state: edited, patches: [
            .init(asset: "first", destination: .init(x: 1, y: 1, width: 1, height: 1)),
            .init(asset: "last", destination: .init(x: 1, y: 1, width: 1, height: 1))
        ]))
        let prepared = try XCTUnwrap(library(manifest).prepare(
            style: .winterFront, pose: .standing, framing: .full).prepared)
        let cache = ExpansionFaceCache()
        let editedRep = NSBitmapImageRep(cgImage: try cache.image(for: prepared, state: edited))
        XCTAssertEqual(editedRep.colorAt(x: 1, y: 1)!.blueComponent, 1, accuracy: 0.01)
        XCTAssertEqual(editedRep.colorAt(x: 0, y: 0)!.alphaComponent, 0, accuracy: 0.01)
        let emptyRep = NSBitmapImageRep(cgImage: try cache.image(for: prepared, state: empty))
        for y in 0..<emptyRep.pixelsHigh { for x in 0..<emptyRep.pixelsWide {
            XCTAssertEqual(emptyRep.colorAt(x: x, y: y)!.alphaComponent, 0, accuracy: 0.001)
        } }
    }
    func testExplicitLegacyAllowlistIsRequired() throws {
        var manifest = try fixture(); manifest.assets["base"]!.origin = .legacy
        XCTAssertThrowsError(try library(manifest).validate(.staged))
        let lib = try ExpansionLibrary(rootURL: root, manifest: manifest, legacyRootURL: root, allowedLegacyHashes: ["base.png": manifest.assets["base"]!.sha256])
        try lib.validate(.staged)
    }
    func testFallbackPreparationFailureAndCurrentVariantRetention() throws {
        var manifest = try fixture()
        manifest.variants["a/reading/full"] = manifest.variants["a/standing/full"]
        let lib = try library(manifest)
        let active = ExpansionActiveVariant()
        XCTAssertEqual(try active.switchTo(style: .winterFront, pose: .tea, framing: .full, library: lib), .standing)
        weak var previous = active.current
        XCTAssertNotNil(previous)
        XCTAssertEqual(try active.switchTo(style: .winterFront, pose: .reading, framing: .full, library: lib), .exact)
        XCTAssertNil(previous)
        let identity = active.current
        try FileManager.default.removeItem(at: root.appendingPathComponent("base.png"))
        XCTAssertThrowsError(try active.switchTo(style: .winterFront, pose: .standing, framing: .full, library: lib))
        XCTAssertTrue(active.current === identity)
        XCTAssertEqual(try active.switchTo(style: .blueRose, pose: .tea, framing: .full, library: lib), .unavailable)
        XCTAssertTrue(active.current === identity)
    }
    func testFaceOnlyCompositionNoReadsAndCacheEviction() throws {
        let manifest = try fixture()
        let prepared = try XCTUnwrap(library(manifest).prepare(style: .winterFront, pose: .standing, framing: .full).prepared)
        try FileManager.default.removeItem(at: root.appendingPathComponent("base.png"))
        let cache = ExpansionFaceCache(byteLimit: 16)
        let state = manifest.declaredStates[0]
        let face = try cache.image(for: prepared, state: state)
        XCTAssertEqual(face.width, 2); XCTAssertEqual(face.height, 2)
        XCTAssertTrue(try cache.image(for: prepared, state: state) === face)
        XCTAssertLessThanOrEqual(cache.decodedBytes, 16)
        XCTAssertThrowsError(try cache.image(for: prepared, state: .init(expression: .shy, eye: .open, gaze: .center, mouth: .closed)))
        let secondManifest = try fixture()
        let second = try XCTUnwrap(library(secondManifest).prepare(style: .winterFront, pose: .standing, framing: .full).prepared)
        _ = try cache.image(for: second, state: state)
        XCTAssertEqual(cache.count, 1)
        XCTAssertFalse(try cache.image(for: prepared, state: state) === face)
        let noCache = ExpansionFaceCache(byteLimit: 1)
        _ = try noCache.image(for: prepared, state: state)
        XCTAssertEqual(noCache.count, 0)
        XCTAssertEqual(ExpansionPixelRect(x: 1, y: 2, width: 3, height: 4).bottomLeftRect(canvasHeight: 10), CGRect(x: 1, y: 4, width: 3, height: 4))
    }
}
