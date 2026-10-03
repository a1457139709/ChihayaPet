import AppKit
import CoreText
import CryptoKit
import QuartzCore
import XCTest
@testable import ChihayaPet

final class CharacterSpriteTests: XCTestCase {
    func testRuntimeBundleContainsOnlyNumberedImagesAndNotice() throws {
        let resources = try XCTUnwrap(Bundle.main.resourceURL)
        XCTAssertEqual(Set(try FileManager.default.contentsOfDirectory(atPath: resources.path)),
            ["Characters", "fansitekit-notice-original.txt"])
        let characters = resources.appendingPathComponent("Characters")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: characters.path), ["Standing"])
        let library = try StandingCharacterLibrary(rootURL: characters.appendingPathComponent("Standing"))
        for (key, variant) in library.manifest.variants {
            for result in variant.results {
                let data = try Data(contentsOf: library.rootURL.appendingPathComponent(result.path))
                XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), result.sha256, key)
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
                XCTAssertTrue(renderer.hasImage)
                XCTAssertLessThanOrEqual(renderer.cachedImageCount, 12)
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
        let url = try XCTUnwrap(Bundle.main.url(forResource: "Standing", withExtension: nil, subdirectory: "Characters"))
        let source = try StandingCharacterLibrary(rootURL: url).image(key: "b/close", faceID: "00")
        let bitmapSource = NSBitmapImageRep(cgImage: source.image)
        let offset = source.variant.faceRect
        func sourceAlpha(_ x: Int, _ y: Int) -> CGFloat {
            bitmapSource.colorAt(x: x, y: y)!.alphaComponent
        }
        let renderer = PNGRenderer(style: .winterSide, framing: .close, imageHeight: 480, animationsEnabled: false)
        defer { renderer.shutdown() }
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: renderer.contentSize), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = renderer.view
        defer { window.close() }
        let bitmap = try XCTUnwrap(renderer.view.bitmapImageRepForCachingDisplay(in: renderer.view.bounds))
        renderer.view.cacheDisplay(in: renderer.view.bounds, to: bitmap)
        let pixelsPerPoint = CGFloat(bitmap.pixelsHigh) / renderer.contentSize.height
        let scale = 480.0 / CGFloat(source.image.height)
        var gaps = 0
        for y in Int(offset[1])..<(Int(offset[1] + offset[3])) {
            for x in Int(offset[0])..<(Int(offset[0] + offset[2])) {
                // Exclude the tiny gaps already present in the original game cutout.
                guard (-1...1).allSatisfy({ dy in (-1...1).allSatisfy({ dx in sourceAlpha(x + dx, y + dy) >= 0.999 }) }) else { continue }
                let px = Int((PNGRenderer.margin + (CGFloat(x) + 0.5) * scale) * pixelsPerPoint)
                let py = Int((PNGRenderer.margin + (CGFloat(y) + 0.5) * scale) * pixelsPerPoint)
                if bitmap.colorAt(x: px, y: py)!.alphaComponent < 0.98 { gaps += 1 }
            }
        }
        XCTAssertEqual(gaps, 0, "Scaling a saved standing PNG must preserve its opaque face region")
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
                        XCTAssertTrue(renderer.hasImage)
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
