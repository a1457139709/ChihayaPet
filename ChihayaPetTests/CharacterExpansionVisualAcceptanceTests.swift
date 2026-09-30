import AppKit
import CryptoKit
import QuartzCore
import XCTest
@testable import ChihayaPet

/// Explicit opt-in only. A missing/incomplete real pack is an error, never a fixture fallback.
final class CharacterExpansionVisualAcceptanceTests: XCTestCase {
    private let heights = [240, 256, 480]
    private let backgrounds = ["light", "dark"]
    private var environment: [String: String] { ProcessInfo.processInfo.environment }
    private var project: URL {
        canonical(environment["CHIHAYA_EXPANSION_QA_PROJECT_ROOT"].map { URL(fileURLWithPath: $0) }
            ?? URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent())
    }
    private var legacy: URL { project.appendingPathComponent("ChihayaPet/Resources/CharacterSprites") }
    private func canonical(_ url: URL) -> URL { url.resolvingSymlinksInPath().standardizedFileURL }
    private func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw NSError(domain: "CharacterExpansionNativeQA", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    }
    private func json(_ object: Any, to url: URL) throws {
        try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
            .write(to: url, options: [.withoutOverwriting])
    }
    private func rect(_ r: CGRect) -> [String: Double] {
        ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height]
    }
    private func stateID(_ s: ExpansionFaceState) -> String {
        [s.expression.rawValue, s.eye.rawValue, s.gaze.rawValue, s.mouth.rawValue].joined(separator: "/")
    }
    private func output(_ variable: String) throws -> URL {
        guard let path = environment[variable], !path.isEmpty else {
            throw XCTSkip("Opt-in native QA: set \(variable) to a NEW output directory or use scripts/character_expansion_native_qa.py")
        }
        let result = canonical(URL(fileURLWithPath: path, isDirectory: true))
        let resources = canonical(project.appendingPathComponent("ChihayaPet/Resources"))
        try require(result != resources && !result.path.hasPrefix(resources.path + "/"), "QA output must remain outside app resources")
        try require(!FileManager.default.fileExists(atPath: result.path), "Refusing to overwrite existing output: \(result.path)")
        try FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
        return result
    }

    // Catches silent fallback, failed face installation, crop/alpha regressions, unbounded face caching,
    // missing native content, and bubble attachment/clamping errors with the real production pack.
    @MainActor
    func testRealPackNativeAcceptance() throws {
        let output = try output("CHIHAYA_EXPANSION_QA_OUTPUT")
        let started = Date()
        var scenes: [[String: Any]] = []
        var variants: [[String: Any]] = []
        let pack = canonical(environment["CHIHAYA_EXPANSION_QA_PACK"].map { URL(fileURLWithPath: $0) }
            ?? project.appendingPathComponent("ChihayaPet/Resources/CharacterExpansion"))
        do {
            let trusted = try CharacterSpriteLibrary(rootURL: legacy)
            let library = try ExpansionLibrary(rootURL: pack, legacyRootURL: legacy,
                                               allowedLegacyHashes: trusted.manifest.assetHashes)
            try library.validate(.complete)
            try library.verifySources(at: project)
            let inputs = try inputEvidence(library: library, pack: pack)
            try json(inputs, to: output.appendingPathComponent("inputs.json"))
            try FileManager.default.createDirectory(at: output.appendingPathComponent("scenes"), withIntermediateDirectories: false)
            try FileManager.default.createDirectory(at: output.appendingPathComponent("faces"), withIntermediateDirectories: false)
            for style in ExpandedCharacterStyle.allCases {
                for pose in CharacterPose.allCases {
                    for framing in CharacterFraming.allCases {
                        let key = "\(style.rawValue)/\(pose.rawValue)/\(framing.rawValue)"
                        let variantEvidence = try autoreleasepool {
                            try inspectFaces(library: library, style: style, pose: pose, framing: framing, output: output)
                        }
                        variants.append(variantEvidence)
                        for height in heights {
                            try autoreleasepool {
                                let renderer = PNGRenderer(style: style.legacyStyle ?? .winterFront, framing: framing,
                                    imageHeight: CGFloat(height), animationsEnabled: false, expandedStyle: style, pose: pose,
                                    expandedExpressionMode: .automatic, resourceURL: nil, expansionResourceURL: nil,
                                    expansionLibrary: library, animationRandom: { $0.lowerBound })
                                defer { renderer.shutdown() }
                                renderer.setGaze(pose.defaultGaze)
                                renderer.setReducedMotion(true)
                                renderer.setPresented(true)
                                try require(renderer.usesExpansion && !renderer.usesFallback, "Expansion fallback: \(key)")
                                try require(renderer.renderedExpansionVariantKey == key, "Wrong installed variant: \(key)")
                                try require(renderer.renderedExpansionPose == pose && renderer.expandedStyle == style
                                    && renderer.framing == framing, "Wrong renderer selection: \(key)")
                                let actual = try XCTUnwrap(renderer.renderedExpansionFaceState)
                                let expression: ExpandedCharacterExpression = pose == .reading ? .serious : (pose == .dozing ? .sleepy : .neutral)
                                try require(actual == ExpansionFaceState(expression: expression,
                                    eye: pose == .dozing ? .closed : .open, gaze: pose.defaultGaze, mouth: .closed), "Wrong default face: \(key)")
                                try require(!renderer.isScheduling, "Unexpected active scheduler: \(key)")
                                let bubble = try bubbleEvidence(renderer)
                                for background in backgrounds {
                                    let id = key.replacingOccurrences(of: "/", with: "--") + "--h\(height)--\(background)"
                                    let imageURL = output.appendingPathComponent("scenes/\(id).png")
                                    var scene = try capture(renderer, background: background, to: imageURL)
                                    scene.merge(["id": id, "variant": key, "imageHeightPoints": height,
                                        "renderedStyle": renderer.expandedStyle.rawValue, "renderedPose": renderer.renderedExpansionPose!.rawValue,
                                        "renderedFraming": renderer.framing.rawValue,
                                        "background": background, "expression": actual.expression.rawValue,
                                        "eye": actual.eye.rawValue, "gaze": actual.gaze.rawValue, "mouth": actual.mouth.rawValue,
                                        "bubbleGeometry": bubble, "usesExpansion": true,
                                        "sourceManifestSHA256": inputs["sourceManifestSHA256"]!]) { _, new in new }
                                    // A scene is counted only after a successfully encoded, saved and reopened native PNG.
                                    try json(scene, to: output.appendingPathComponent("scenes/\(id).json"))
                                    scenes.append(scene)
                                }
                                renderer.shutdown()
                                try require(!renderer.isScheduling && !renderer.usesExpansion, "Renderer did not release variant: \(key)")
                            }
                        }
                    }
                }
            }
            try require(scenes.count == 480 && Set(scenes.compactMap { $0["id"] as? String }).count == 480,
                        "Expected exactly 480 uniquely identified captures")
            try require(variants.count == 80, "Expected exactly 80 inspected variants")
            let unexpected = variants.reduce(0) { $0 + ($1["unexpectedDuplicateGroups"] as? Int ?? 0) }
            try writeGallery(scenes, output: output)
            try json(["captureComplete": true, "captureCount": scenes.count, "variantCount": variants.count,
                "faceStateCount": 28_800, "variants": variants, "scenes": scenes,
                "elapsedSeconds": Date().timeIntervalSince(started), "unexpectedDuplicateGroups": unexpected,
                "technicalAcceptance": unexpected == 0 ? "passed" : "failed-unexpected-face-aliases",
                "visualSemanticsReview": "pending-human-review", "bubbleVisualAcceptance": "pending; geometry only",
                "memoryScope": "Face LRU is bounded to 64 MiB; decoded prepared bases and patches are measured separately and are not covered by that cap."],
                to: output.appendingPathComponent("report.json"))
            try require(unexpected == 0, "Unexpected composed face aliases; inspect faces/*.json. Only closed-eye gaze aliases are permitted.")
        } catch {
            try? json(["captureComplete": false, "savedScenes": scenes.count, "inspectedVariants": variants.count,
                       "error": String(describing: error)], to: output.appendingPathComponent("failure.json"))
            throw error
        }
    }

    // A real legacy renderer checks native capture mechanics without pretending to cover expansion art.
    @MainActor
    func testLegacyCaptureMechanicsSelfCheck() throws {
        let output = try output("CHIHAYA_EXPANSION_QA_SELFCHECK_OUTPUT")
        var scenes: [[String: Any]] = []
        for height in heights {
            try autoreleasepool {
                let renderer = PNGRenderer(style: .winterFront, framing: .full, imageHeight: CGFloat(height),
                    animationsEnabled: false, resourceURL: legacy, expansionResourceURL: nil)
                defer { renderer.shutdown() }
                try require(!renderer.usesFallback && !renderer.usesExpansion, "Self-check requires actual legacy CharacterSprites")
                for background in backgrounds {
                    let id = "legacy-mechanics--h\(height)--\(background)"
                    var scene = try capture(renderer, background: background, to: output.appendingPathComponent(id + ".png"))
                    scene["id"] = id
                    scene["bubbleGeometry"] = try bubbleEvidence(renderer)
                    scenes.append(scene)
                }
                renderer.shutdown()
                try require(!renderer.isScheduling, "Self-check left a timer active")
            }
        }
        try json(["coverage": "legacy capture mechanics only; zero real expansion variants accepted", "scenes": scenes],
                 to: output.appendingPathComponent("self-check.json"))
    }

    private func inputEvidence(library: ExpansionLibrary, pack: URL) throws -> [String: Any] {
        let assets: [[String: Any]] = try library.manifest.assets.sorted { $0.key < $1.key }.map { id, asset in
            let url = canonical((asset.origin == .legacy ? legacy : pack).appendingPathComponent(asset.path))
            return ["id": id, "canonicalPath": url.path, "sha256": hash(try Data(contentsOf: url)),
                    "width": asset.width, "height": asset.height, "origin": asset.origin.rawValue]
        }
        let sources: [[String: Any]] = try library.manifest.sourceArtworks.map { source in
            let url = canonical(project.appendingPathComponent(source.projectRelativePath))
            return ["id": source.id, "canonicalPath": url.path, "sha256": hash(try Data(contentsOf: url)),
                    "width": source.width, "height": source.height]
        }
        return ["canonicalPackRoot": pack.path, "canonicalProjectRoot": project.path, "assets": assets, "sources": sources,
            "sourceManifestSHA256": hash(try Data(contentsOf: pack.appendingPathComponent("manifest.json"))),
            "trustedLegacyManifestSHA256": hash(try Data(contentsOf: legacy.appendingPathComponent("manifest.json"))),
            "validation": ["ExpansionLibrary.validate(.complete)", "ExpansionLibrary.verifySources(at: projectRoot)"],
            "frameworks": ["AppKit", "QuartzCore", "CoreGraphics", "ImageIO", "CryptoKit", "XCTest"],
            "captureAPI": "PNGRenderer.view.layer.render(in: CGContext), scale 2, unordered AppKit host window, no visible desktop windows",
            "os": ProcessInfo.processInfo.operatingSystemVersionString,
            "commandEvidence": environment["CHIHAYA_EXPANSION_QA_COMMAND"] ?? "direct XCTest invocation; inspect xcresult",
            "toolEvidence": environment["CHIHAYA_EXPANSION_QA_TOOLS"] ?? "not supplied; use runner for Xcode/SDK evidence"]
    }

    private func inspectFaces(library: ExpansionLibrary, style: ExpandedCharacterStyle, pose: CharacterPose,
                              framing: CharacterFraming, output: URL) throws -> [String: Any] {
        let result = try library.prepare(style: style, pose: pose, framing: framing)
        try require(result.resolution == .exact, "Variant preparation fell back")
        let prepared = try XCTUnwrap(result.prepared)
        let base = try XCTUnwrap(prepared.images[prepared.variant.base])
        let basePixels = try pixels(base)
        try require(basePixels.alphaTransparent > 0 && basePixels.alphaVisible > 0, "Base must contain both transparent background and visible artwork: \(prepared.key)")
        let cache = ExpansionFaceCache()
        defer { cache.removeAll() }
        var peak = 0
        var faces: [[String: Any]] = []
        var hashes: [String: [ExpansionFaceState]] = [:]
        for state in ExpansionFaceState.all {
            try autoreleasepool {
                let overlay = try cache.image(for: prepared, state: state)
                try require(overlay.width == Int(prepared.variant.face.width) && overlay.height == Int(prepared.variant.face.height),
                            "Face overlay has incorrect source bounds: \(prepared.key)")
                let overlayValues = try pixels(overlay)
                let composed = try compose(base: prepared.defaultFace, overlay: overlay)
                let composedValues = try pixels(composed)
                try require(composedValues.alphaVisible > 0, "Empty composed face: \(prepared.key)/\(stateID(state))")
                hashes[composedValues.sha256, default: []].append(state)
                faces.append(["state": stateID(state), "rgbaSHA256": composedValues.sha256,
                    "overlayRGBASHA256": overlayValues.sha256, "width": overlay.width,
                    "height": overlay.height, "decodedBytes": overlay.bytesPerRow * overlay.height,
                    "transparentPixels": overlayValues.alphaTransparent,
                    "visiblePixels": overlayValues.alphaVisible,
                    "partialAlphaPixels": overlayValues.alphaPartial,
                    "composedTransparentPixels": composedValues.alphaTransparent,
                    "composedPartialAlphaPixels": composedValues.alphaPartial])
                peak = max(peak, cache.decodedBytes)
                try require(cache.decodedBytes <= 64 * 1024 * 1024, "Face cache exceeds 64 MiB")
            }
        }
        var unexpected = 0
        let duplicates: [[String: Any]] = hashes.sorted { $0.key < $1.key }.compactMap { digest, states in
            guard states.count > 1 else { return nil }
            let allowed = states.allSatisfy { $0.eye == .closed && $0.expression == states[0].expression && $0.mouth == states[0].mouth }
            if !allowed { unexpected += 1 }
            return ["rgbaSHA256": digest, "states": states.map(stateID),
                    "classification": allowed ? "allowed-closed-eye-gaze" : "unexpected-alias-needs-art-review"]
        }
        let imageCosts: [[String: Any]] = prepared.images.sorted { $0.key < $1.key }.map { id, image in
            ["asset": id, "width": image.width, "height": image.height, "decodedBytes": image.bytesPerRow * image.height]
        }
        let decoded = prepared.images.values.reduce(0) { $0 + $1.bytesPerRow * $1.height }
        let baseDecoded = base.bytesPerRow * base.height
        let evidence: [String: Any] = ["variant": prepared.key, "faceCount": faces.count, "faces": faces,
            "duplicateGroups": duplicates, "unexpectedDuplicateGroups": unexpected, "preparedImages": imageCosts,
            "preparedBaseAndPatchDecodedBytes": decoded,
            "preparedBaseDecodedBytes": baseDecoded, "preparedPatchDecodedBytes": decoded - baseDecoded,
            "defaultFaceLogicalBytes": prepared.defaultFace.bytesPerRow * prepared.defaultFace.height,
            "faceCachePeakBytes": peak, "faceCacheFinalCount": cache.count,
            "baseTransparentPixels": basePixels.alphaTransparent, "basePartialAlphaPixels": basePixels.alphaPartial,
            "alphaRules": "base has visible and transparent pixels; empty overlays are valid; all replacement patches are fully opaque via validate(.complete)/prepare; default face plus overlay has visible pixels",
            "allocationNote": "CGImage bytesPerRow × height logical decoded footprint; cropped backing storage may be shared, not process RSS"]
        try json(evidence, to: output.appendingPathComponent("faces/" + prepared.key.replacingOccurrences(of: "/", with: "--") + ".json"))
        return ["variant": prepared.key, "faceCount": faces.count, "unexpectedDuplicateGroups": unexpected,
            "preparedBaseAndPatchDecodedBytes": decoded, "faceCachePeakBytes": peak]
    }

    private func compose(base: CGImage, overlay: CGImage) throws -> CGImage {
        try require(base.width == overlay.width && base.height == overlay.height,
                    "Default face and overlay dimensions differ")
        let context = try XCTUnwrap(CGContext(data: nil, width: base.width, height: base.height,
            bitsPerComponent: 8, bytesPerRow: base.width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
        context.setBlendMode(.copy)
        context.draw(base, in: CGRect(x: 0, y: 0, width: base.width, height: base.height))
        context.setBlendMode(.normal)
        context.draw(overlay, in: CGRect(x: 0, y: 0, width: overlay.width, height: overlay.height))
        return try XCTUnwrap(context.makeImage())
    }

    private func pixels(_ image: CGImage) throws -> (sha256: String, alphaTransparent: Int, alphaVisible: Int, alphaPartial: Int) {
        let context = try XCTUnwrap(CGContext(data: nil, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
        context.setBlendMode(.copy)
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        let data = Data(bytes: try XCTUnwrap(context.data), count: image.width * image.height * 4)
        var transparent = 0, partial = 0
        data.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) in
            for i in stride(from: 3, to: bytes.count, by: 4) {
                if bytes[i] == 0 { transparent += 1 } else if bytes[i] != 255 { partial += 1 }
            }
        }
        return (hash(data), transparent, image.width * image.height - transparent, partial)
    }

    @MainActor
    private func capture(_ renderer: PNGRenderer, background: String, to url: URL) throws -> [String: Any] {
        let scale: CGFloat = 2
        let bounds = renderer.view.bounds
        // AppKit attaches child backing layers only after the view has a window. This window
        // is never ordered or made key, so it cannot appear on or alter the user's desktop.
        let host = NSWindow(contentRect: bounds, styleMask: .borderless, backing: .buffered, defer: false)
        host.isReleasedWhenClosed = false
        let container = NSView(frame: bounds)
        host.contentView = container
        container.addSubview(renderer.view)
        defer { renderer.view.removeFromSuperview(); host.contentView = nil; host.close() }
        host.displayIfNeeded()
        try require(renderer.view.bounds == bounds, "Host window resized the renderer's point bounds")
        let width = Int(ceil(bounds.width * scale)), height = Int(ceil(bounds.height * scale))
        try require(width > 0 && height > 0 && width <= 8192 && height <= 8192, "Unbounded capture dimensions")
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
        let shade: CGFloat = background == "light" ? 0.96 : 0.10
        context.setFillColor(CGColor(gray: shade, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let before = hash(Data(bytes: try XCTUnwrap(context.data), count: width * height * 4))
        renderer.view.layoutSubtreeIfNeeded()
        let layer = try XCTUnwrap(renderer.view.layer)
        layer.layoutIfNeeded()
        layer.displayIfNeeded()
        CATransaction.flush()
        try require(!host.isVisible && !host.isKeyWindow, "QA host must remain offscreen")
        context.scaleBy(x: scale, y: scale)
        layer.render(in: context)
        let image = try XCTUnwrap(context.makeImage())
        let after = hash(Data(bytes: try XCTUnwrap(context.data), count: width * height * 4))
        try require(before != after, "Native layer capture is blank")
        let data = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
        try data.write(to: url, options: [.withoutOverwriting])
        let saved = try Data(contentsOf: url)
        let decoded = try XCTUnwrap(NSBitmapImageRep(data: saved))
        try require(decoded.pixelsWide == width && decoded.pixelsHigh == height, "Saved capture dimensions changed")
        return ["file": url.lastPathComponent, "sha256": hash(saved), "pointBounds": rect(bounds),
            "imageFramePoints": rect(renderer.imageFrame), "captureScale": scale,
            "pixelWidth": width, "pixelHeight": height, "backgroundGray": shade,
            "nativeContentDiffersFromBackground": true]
    }

    @MainActor
    private func bubbleEvidence(_ renderer: PNGRenderer) throws -> [[String: Any]] {
        // Explicit virtual display geometry: no dependence on, or changes to, the user's desktop.
        let screen = CGRect(x: -1440, y: 0, width: 1440, height: 1000)
        return try ["left", "right"].map { edge in
            let size = renderer.contentSize
            let origin = CGPoint(x: edge == "left" ? screen.minX : screen.maxX - size.width, y: 150)
            let pet = CGRect(origin: origin, size: size)
            let attachment = renderer.speechAttachment.translated(by: origin)
            let layout = IdleBubbleLayout(pet: pet, screen: screen, textHeight: 72, attachment: attachment)
            try require(screen.contains(layout.frame), "Bubble escapes screen at \(edge) edge")
            try require(layout.tailOnRight == (edge == "right"), "Bubble points away from pet at \(edge) edge")
            let gap = layout.tailOnRight ? attachment.hairLeft - (layout.frame.minX + layout.outlineFrame.maxX)
                : layout.frame.minX + layout.outlineFrame.minX - attachment.hairRight
            try require(abs(gap - 4) < 0.001, "Bubble lost transparent decoration margin or hair gap")
            try require(abs(layout.frame.maxY - layout.tailY - attachment.mouth.y) < 0.001, "Bubble tail missed mouth")
            return ["edge": edge, "screen": rect(screen), "pet": rect(pet), "bubble": rect(layout.frame),
                "outline": rect(layout.outlineFrame), "hairLeft": attachment.hairLeft, "hairRight": attachment.hairRight,
                "mouthX": attachment.mouth.x, "mouthY": attachment.mouth.y, "visibleHairGap": gap,
                "tailOnRight": layout.tailOnRight, "tailY": layout.tailY, "visualCapture": false]
        }
    }

    private func writeGallery(_ scenes: [[String: Any]], output: URL) throws {
        let cards = scenes.map { scene -> String in
            let id = scene["id"] as! String
            return "<figure><a href='scenes/\(id).png'><img loading='lazy' src='scenes/\(id).png'></a><figcaption>\(id)</figcaption></figure>"
        }.joined(separator: "\n")
        let html = """
        <!doctype html><meta charset="utf-8"><title>Native CharacterExpansion QA</title>
        <style>body{font:14px system-ui;background:#aaa}main{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:280px}img{max-width:100%;max-height:520px}figcaption{overflow-wrap:anywhere}</style>
        <h1>480 native captures</h1><p>Technical evidence. Human art semantics and native bubble visual acceptance remain pending. See report.json and faces/*.json.</p><main>\(cards)</main>
        """
        try Data(html.utf8).write(to: output.appendingPathComponent("index.html"), options: [.withoutOverwriting])
    }
}
