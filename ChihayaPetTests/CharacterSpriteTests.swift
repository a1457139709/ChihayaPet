import AppKit
import CoreText
import CryptoKit
import QuartzCore
import XCTest
@testable import ChihayaPet

final class CharacterSpriteTests: XCTestCase {
    func testAllBundledVariantsAndCombinationsDecodeAndMatchHashes() throws {
        let root = try XCTUnwrap(Bundle.main.url(forResource: "CharacterSprites", withExtension: nil))
        let library = try CharacterSpriteLibrary(rootURL: root)
        XCTAssertEqual(library.manifest.variants.count, 14)
        XCTAssertEqual(library.manifest.assetHashes.count, 326)
        for (path, expected) in library.manifest.assetHashes {
            let data = try Data(contentsOf: root.appendingPathComponent(path))
            XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), expected, path)
        }
        for style in CharacterStyle.allCases {
            for framing in CharacterFraming.allCases {
                let loaded = try library.load(style: style, framing: framing)
                XCTAssertEqual(loaded.images.count, loaded.variant.paths.count)
                for expression in CharacterExpression.allCases {
                    for eye in CharacterEye.allCases {
                        for mouth in CharacterMouth.allCases {
                            let path = try XCTUnwrap(loaded.variant.face(expression, eye, mouth))
                            XCTAssertNotNil(loaded.images[path])
                        }
                    }
                }
            }
        }
    }

    @MainActor
    func testSwitchOnlyCachesCurrentVariantAndHasNoContentsTransitions() throws {
        let renderer = PNGRenderer(style: .winterFront, framing: .full, imageHeight: 256, animationsEnabled: false)
        defer { renderer.shutdown() }
        for style in CharacterStyle.allCases {
            for framing in CharacterFraming.allCases {
                renderer.setCharacter(style: style, framing: framing)
                XCTAssertFalse(renderer.usesFallback)
                XCTAssertLessThanOrEqual(renderer.cachedImageCount, 37)
                XCTAssertEqual(renderer.style, style)
                XCTAssertEqual(renderer.framing, framing)
                let bodyContainer = try XCTUnwrap(renderer.view.subviews.first?.layer?.sublayers?.first?.sublayers?.first)
                let layers = try XCTUnwrap(bodyContainer.sublayers)
                XCTAssertEqual(layers.count, 2)
                let activeLayers = layers.filter { $0.contents != nil && !$0.isHidden }
                XCTAssertEqual(activeLayers.count, 1, "A native frame must be presented as one atomic texture")
                XCTAssertEqual(activeLayers.first?.frame, bodyContainer.bounds, "The atomic texture must cover the source canvas")
                for layer in layers {
                    XCTAssertTrue(layer.actions?["contents"] is NSNull)
                    XCTAssertNil(layer.action(forKey: "contents"))
                    XCTAssertTrue(layer.animationKeys()?.isEmpty ?? true)
                }
            }
        }
    }

    @MainActor
    func testScalingDoesNotOpenSeamsAcrossOpaqueSourceFaceBoundary() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "CharacterSprites", withExtension: nil))
        let source = try CharacterSpriteLibrary(rootURL: url).load(style: .winterSide, framing: .close)
        let body = NSBitmapImageRep(cgImage: try XCTUnwrap(source.images[source.variant.body]))
        let facePath = try XCTUnwrap(source.variant.face(.neutral, .open, .closed))
        let face = NSBitmapImageRep(cgImage: try XCTUnwrap(source.images[facePath]))
        let offset = source.variant.faceOffset
        func sourceAlpha(_ x: Int, _ y: Int) -> CGFloat {
            let bodyAlpha = body.colorAt(x: x, y: y)!.alphaComponent
            let fx = x - Int(offset[0]), fy = y - Int(offset[1])
            let faceAlpha = fx >= 0 && fy >= 0 && fx < face.pixelsWide && fy < face.pixelsHigh ? face.colorAt(x: fx, y: fy)!.alphaComponent : 0
            return faceAlpha + bodyAlpha * (1 - faceAlpha)
        }
        let renderer = PNGRenderer(style: .winterSide, framing: .close, imageHeight: 480, animationsEnabled: false)
        defer { renderer.shutdown() }
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: renderer.contentSize), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = renderer.view
        defer { window.close() }
        let bitmap = try XCTUnwrap(renderer.view.bitmapImageRepForCachingDisplay(in: renderer.view.bounds))
        renderer.view.cacheDisplay(in: renderer.view.bounds, to: bitmap)
        let pixelsPerPoint = CGFloat(bitmap.pixelsHigh) / renderer.contentSize.height
        let scale = 480.0 / source.variant.height
        var gaps = 0
        for y in Int(offset[1])..<(Int(offset[1]) + face.pixelsHigh) {
            for x in Int(offset[0])..<(Int(offset[0]) + face.pixelsWide) {
                // Exclude the tiny gaps already present in the original game cutout.
                guard (-1...1).allSatisfy({ dy in (-1...1).allSatisfy({ dx in sourceAlpha(x + dx, y + dy) >= 0.999 }) }) else { continue }
                let px = Int((PNGRenderer.margin + (CGFloat(x) + 0.5) * scale) * pixelsPerPoint)
                let py = Int((PNGRenderer.margin + (CGFloat(y) + 0.5) * scale) * pixelsPerPoint)
                if bitmap.colorAt(x: px, y: py)!.alphaComponent < 0.98 { gaps += 1 }
            }
        }
        XCTAssertEqual(gaps, 0, "Separately filtered complementary masks must not open a new seam")
    }

    @MainActor
    func testRenderAllNativeVariantsAtThreeSizesOnLightAndDarkBackgrounds() throws {
        let root = URL(fileURLWithPath: "/tmp/chihaya-native-qa", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        for height in [240.0, 256, 480] {
            for dark in [false, true] {
                let cellWidth = Int(ceil(height * 508 / 606 + 40))
                let cellHeight = Int(height) + 62
                let width = cellWidth * 7, totalHeight = cellHeight * 2
                let context = try XCTUnwrap(CGContext(data: nil, width: width, height: totalHeight, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
                context.setFillColor((dark ? NSColor(calibratedWhite: 0.13, alpha: 1) : .white).cgColor)
                context.fill(CGRect(x: 0, y: 0, width: width, height: totalHeight))
                for (column, style) in CharacterStyle.allCases.enumerated() {
                    for (row, framing) in CharacterFraming.allCases.enumerated() {
                        let renderer = PNGRenderer(style: style, framing: framing, imageHeight: height, animationsEnabled: false)
                        defer { renderer.shutdown() }
                        XCTAssertFalse(renderer.usesFallback)
                        let window = NSWindow(contentRect: CGRect(origin: .zero, size: renderer.contentSize), styleMask: [.borderless], backing: .buffered, defer: false)
                        window.isReleasedWhenClosed = false
                        window.contentView = renderer.view
                        renderer.view.layoutSubtreeIfNeeded()
                        renderer.view.displayIfNeeded()
                        let bitmap = try XCTUnwrap(renderer.view.bitmapImageRepForCachingDisplay(in: renderer.view.bounds))
                        renderer.view.cacheDisplay(in: renderer.view.bounds, to: bitmap)
                        let rendered = try XCTUnwrap(bitmap.cgImage)
                        let x = CGFloat(column * cellWidth) + (CGFloat(cellWidth) - renderer.contentSize.width) / 2
                        let y = CGFloat((1 - row) * cellHeight) + 28
                        context.saveGState()
                        context.translateBy(x: x, y: y)
                        context.draw(rendered, in: CGRect(origin: .zero, size: renderer.contentSize))
                        context.restoreGState()
                        window.close()
                        let label = NSAttributedString(string: "\(style.title) · \(framing.title)", attributes: [.font: NSFont.systemFont(ofSize: 13), .foregroundColor: dark ? NSColor.white : NSColor.black])
                        context.textPosition = CGPoint(x: CGFloat(column * cellWidth) + 12, y: CGFloat((1 - row) * cellHeight) + 12)
                        CTLineDraw(CTLineCreateWithAttributedString(label), context)
                    }
                }
                let image = try XCTUnwrap(context.makeImage())
                let data = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
                XCTAssertGreaterThan(data.count, 100_000, "Native sprites should be present in the rendered image")
                try data.write(to: root.appendingPathComponent("variants-\(Int(height))-\(dark ? "dark" : "light").png"))
            }
        }
    }
}
