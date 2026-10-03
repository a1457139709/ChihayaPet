import AppKit
import CryptoKit
import QuartzCore
import SwiftUI
import XCTest
@testable import ChihayaPet

final class StandingCharacterVisualAcceptanceTests: XCTestCase {
    @MainActor
    func testCaptureAllViewsAndExpressionsAtProductSizes() throws {
        guard let directory = ProcessInfo.processInfo.environment["CHIHAYA_STANDING_QA_OUTPUT"] else {
            throw XCTSkip("Set CHIHAYA_STANDING_QA_OUTPUT for the complete native gallery capture")
        }
        let output = URL(fileURLWithPath: directory, isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let root = try XCTUnwrap(Bundle.main.url(forResource: "Standing", withExtension: nil, subdirectory: "Characters"))
        let library = try StandingCharacterLibrary(rootURL: root)
        var captures: [[String: Any]] = []
        var bubbles: [[String: Any]] = []
        for outfit in StandingCharacterOutfit.allCases {
            for framing in CharacterFraming.allCases {
                let key = "\(outfit.rawValue)/\(framing.rawValue)"
                let variant = try XCTUnwrap(library.manifest.variants[key])
                let renderer = PNGRenderer(style: outfit.legacyStyle ?? .casual, framing: framing,
                    imageHeight: 256, animationsEnabled: false, expansionResourceURL: nil,
                    standingOutfit: outfit, standingLibrary: library, allowPendingStandingForQA: true)
                defer { renderer.shutdown() }
                for height: CGFloat in [240, 256, 480] {
                    renderer.setHeight(height)
                    let bounds = CGRect(origin: .zero, size: renderer.contentSize)
                    XCTAssertTrue(bounds.contains(renderer.imageFrame))
                    XCTAssertTrue(bounds.contains(renderer.headRegion))
                    XCTAssertTrue(bounds.contains(renderer.faceRegion))
                    XCTAssertEqual(renderer.imageFrame.height, height)
                    XCTAssertEqual(renderer.imageFrame.width, height * CGFloat(variant.canvas[0]) / CGFloat(variant.canvas[1]), accuracy: 0.001)
                    let attachment = renderer.speechAttachment
                    XCTAssertTrue(bounds.contains(attachment.mouth))
                    for edge in ["left", "right"] {
                        let screen = CGRect(x: -1440, y: 0, width: 1440, height: 1100)
                        let origin = CGPoint(x: edge == "left" ? screen.minX : screen.maxX - bounds.width, y: 200)
                        let bubble = IdleBubbleLayout(pet: bounds.offsetBy(dx: origin.x, dy: origin.y), screen: screen,
                            textHeight: 72, attachment: attachment.translated(by: origin))
                        XCTAssertTrue(screen.contains(bubble.frame))
                        XCTAssertEqual(bubble.frame.maxY - bubble.tailY, attachment.mouth.y + origin.y, accuracy: 0.001)
                        let hair = attachment.translated(by: origin)
                        let gap = bubble.tailOnRight ? hair.hairLeft - (bubble.frame.minX + bubble.outlineFrame.maxX)
                            : bubble.frame.minX + bubble.outlineFrame.minX - hair.hairRight
                        XCTAssertEqual(gap, 4, accuracy: 0.001)
                        renderer.setNumberedExpressionMode(.numbered("00"))
                        for dark in [false, true] {
                            let id = key.replacingOccurrences(of: "/", with: "--") + "--bubble--h\(Int(height))--\(edge)--\(dark ? "dark" : "light")"
                            let path = output.appendingPathComponent(id + ".png")
                            let digest = try autoreleasepool {
                                try captureBubble(renderer, petFrame: bounds.offsetBy(dx: origin.x, dy: origin.y),
                                    layout: bubble, dark: dark, to: path)
                            }
                            bubbles.append(["id": id, "variant": key, "faceID": "00", "sourceSHA256": try XCTUnwrap(variant.result("00")).sha256,
                                            "heightPoints": height, "scale": 2, "screenEdge": edge,
                                            "file": path.lastPathComponent, "sha256": digest, "hairGapPoints": gap,
                                            "tailOnRight": bubble.tailOnRight])
                        }
                    }
                    // All expressions at 256 points; default 00 also at both bounds.
                    let results = height == 256 ? variant.results : variant.results.filter { $0.id == "00" }
                    for result in results {
                        renderer.setNumberedExpressionMode(.numbered(result.id))
                        XCTAssertEqual(renderer.renderedStandingVariantKey, key)
                        XCTAssertEqual(renderer.renderedNumberedFaceID, result.id)
                        XCTAssertEqual(renderer.imageFrame.width, bounds.width - 24, accuracy: 0.001)
                        XCTAssertEqual(renderer.imageFrame.height, bounds.height - 24, accuracy: 0.001)
                        for dark in [false, true] {
                            let id = key.replacingOccurrences(of: "/", with: "--") + "--\(result.id)--h\(Int(height))--\(dark ? "dark" : "light")"
                            let path = output.appendingPathComponent(id + ".png")
                            let capture = try autoreleasepool { try capture(renderer, dark: dark, to: path) }
                            captures.append(["id": id, "variant": key, "faceID": result.id, "sourceSHA256": result.sha256,
                                             "review": result.review.status, "qaOnlyPending": !result.isApproved,
                                             "heightPoints": height, "scale": 2, "file": path.lastPathComponent,
                                             "sha256": capture, "mouth": [attachment.mouth.x, attachment.mouth.y],
                                             "hair": [attachment.hairLeft, attachment.hairRight]])
                        }
                    }
                }
            }
        }
        XCTAssertEqual(captures.count, 688) // 292*2 + 26*2 sizes*2 backgrounds.
        XCTAssertEqual(bubbles.count, 312) // 26 views * 3 sizes * 2 screen edges * 2 backgrounds.
        let report: [String: Any] = ["variantCount": 26, "expressionCount": 292, "captureCount": captures.count,
                                    "captureAPI": "Actual PNGRenderer AppKit/CALayer tree at Retina scale 2",
                                    "manifestSHA256": hash(try Data(contentsOf: root.appendingPathComponent("manifest.json"))),
                                    "pendingArtPolicy": "Pending PNGs enabled only in this explicit QA renderer; production rejects them",
                                    "bubbleCaptureCount": bubbles.count, "captures": captures, "bubbleCaptures": bubbles]
        try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            .write(to: output.appendingPathComponent("report.json"))
        let cards = (captures + bubbles).map { "<figure><img loading='lazy' src='\($0["file"]!)'><figcaption>\($0["id"]!)</figcaption></figure>" }.joined()
        try ("<meta charset='utf-8'><title>桌宠原生验收 · 全部服装</title><style>body{font:14px system-ui}main{display:grid;grid-template-columns:repeat(6,1fr)}figure{margin:5px}img{width:100%;background:#eee}figcaption{overflow-wrap:anywhere}</style><h1>13 组 · 26 取景 · 292 表情 · Retina 原生运行渲染</h1><main>" + cards + "</main>")
            .write(to: output.appendingPathComponent("review.html"), atomically: true, encoding: .utf8)
    }

    private func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    @MainActor
    private func captureBubble(_ renderer: PNGRenderer, petFrame: CGRect, layout: IdleBubbleLayout,
                               dark: Bool, to output: URL) throws -> String {
        let petWindow = NSWindow(contentRect: renderer.view.bounds, styleMask: .borderless,
            backing: .buffered, defer: false)
        petWindow.isReleasedWhenClosed = false
        let container = NSView(frame: renderer.view.bounds)
        petWindow.contentView = container; container.addSubview(renderer.view)
        defer { renderer.view.removeFromSuperview(); petWindow.contentView = nil; petWindow.close() }
        petWindow.displayIfNeeded(); renderer.view.layoutSubtreeIfNeeded()
        let presentation = DialoguePresentation(text: "贵安。今天也请照顾好自己。", width: IdleBubbleLayout.textWidth,
            height: 72, style: .idle, paginated: false, animated: false)
        presentation.start()
        defer { presentation.stop() }
        let host = NSHostingView(rootView: IdleBubbleView(presentation: presentation,
            position: IdleBubblePosition(layout), onClose: {}).environment(\.colorScheme, dark ? .dark : .light))
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: layout.frame.size),
            styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        ChihayaStyle.configureWindow(window)
        defer { window.contentView = nil; window.close() }
        host.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(NSBitmapImageRep(bitmapDataPlanes: nil,
            pixelsWide: Int(ceil(layout.frame.width * 2)), pixelsHigh: Int(ceil(layout.frame.height * 2)),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0))
        bitmap.size = layout.frame.size
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let bubbleImage = try XCTUnwrap(bitmap.cgImage)
        let scene = petFrame.union(layout.frame).insetBy(dx: -8, dy: -8)
        let width = Int(ceil(scene.width * 2)), height = Int(ceil(scene.height * 2))
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
        context.setFillColor(CGColor(gray: dark ? 0.1 : 0.96, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let beforePet = hash(Data(bytes: try XCTUnwrap(context.data), count: width * height * 4))
        context.scaleBy(x: 2, y: 2)
        context.translateBy(x: -scene.minX, y: -scene.minY)
        context.saveGState()
        context.translateBy(x: petFrame.minX, y: petFrame.minY)
        let petLayer = try XCTUnwrap(renderer.view.layer)
        petLayer.layoutIfNeeded(); petLayer.displayIfNeeded(); CATransaction.flush()
        petLayer.render(in: context)
        let afterPet = hash(Data(bytes: try XCTUnwrap(context.data), count: width * height * 4))
        XCTAssertNotEqual(beforePet, afterPet, "Bubble capture must contain the actual character as well as the bubble")
        context.restoreGState()
        context.draw(bubbleImage, in: layout.frame)
        let image = try XCTUnwrap(context.makeImage())
        let data = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
        try data.write(to: output)
        XCTAssertGreaterThan(data.count, 1000)
        return hash(data)
    }

    @MainActor
    private func capture(_ renderer: PNGRenderer, dark: Bool, to output: URL) throws -> String {
        let bounds = renderer.view.bounds
        let window = NSWindow(contentRect: bounds, styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let container = NSView(frame: bounds)
        window.contentView = container; container.addSubview(renderer.view)
        defer { renderer.view.removeFromSuperview(); window.contentView = nil; window.close() }
        window.displayIfNeeded(); renderer.view.layoutSubtreeIfNeeded()
        let layer = try XCTUnwrap(renderer.view.layer)
        layer.layoutIfNeeded(); layer.displayIfNeeded(); CATransaction.flush()
        let width = Int(ceil(bounds.width * 2)), height = Int(ceil(bounds.height * 2))
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
        context.setFillColor(CGColor(gray: dark ? 0.1 : 0.96, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let before = hash(Data(bytes: try XCTUnwrap(context.data), count: width * height * 4))
        context.scaleBy(x: 2, y: 2); layer.render(in: context)
        let after = hash(Data(bytes: try XCTUnwrap(context.data), count: width * height * 4))
        XCTAssertNotEqual(before, after, "Native capture must contain a visible character")
        XCTAssertFalse(window.isVisible)
        let image = try XCTUnwrap(context.makeImage())
        let data = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
        try data.write(to: output)
        XCTAssertNotNil(NSBitmapImageRep(data: try Data(contentsOf: output)))
        return hash(data)
    }
}
