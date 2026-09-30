import AppKit
import CoreGraphics
import XCTest
@testable import ChihayaPet

final class GeometryTests: XCTestCase {
    @MainActor
    func testRendererLetsItsParentReceiveMouseEvents() {
        let renderer = PNGRenderer(outfit: "winter", imageHeight: 256, animationsEnabled: true)
        let parent = NSView(frame: CGRect(origin: .zero, size: renderer.contentSize))
        renderer.view.frame = parent.bounds
        parent.addSubview(renderer.view)

        XCTAssertTrue(parent.hitTest(CGPoint(x: 20, y: 20)) === parent)
        renderer.shutdown()
    }

    @MainActor
    func testRendererAnchorsAnimationAtBottomCenterWithoutMovingImage() throws {
        let renderer = PNGRenderer(style: .winterFront, framing: .full, imageHeight: 256, animationsEnabled: true)
        let imageContainer = try XCTUnwrap(renderer.view.subviews.first)
        let layer = try XCTUnwrap(imageContainer.layer)

        XCTAssertEqual(layer.anchorPoint, CGPoint(x: 0.5, y: 0))
        XCTAssertEqual(layer.frame.minX, renderer.imageFrame.minX, accuracy: 0.001)
        XCTAssertEqual(layer.frame.minY, renderer.imageFrame.minY, accuracy: 0.001)
        XCTAssertEqual(layer.frame.width, renderer.imageFrame.width, accuracy: 0.001)
        XCTAssertEqual(layer.frame.height, renderer.imageFrame.height, accuracy: 0.001)
        XCTAssertEqual(renderer.imageFrame.midX, renderer.contentSize.width / 2, accuracy: 0.001)
        XCTAssertEqual(renderer.imageFrame.minY, 12, accuracy: 0.001)
        renderer.shutdown()
    }

    func testNearbyPanelUsesLeftSideWhenItFits() {
        let result = Geometry.nearbyPanel(
            size: CGSize(width: 360, height: 420),
            pet: CGRect(x: 700, y: 200, width: 200, height: 300),
            screen: CGRect(x: 0, y: 0, width: 1440, height: 900)
        )

        XCTAssertEqual(result, CGRect(x: 332, y: 140, width: 360, height: 420))
    }

    func testNearbyPanelUsesRightSideWhenLeftDoesNotFit() {
        let result = Geometry.nearbyPanel(
            size: CGSize(width: 360, height: 420),
            pet: CGRect(x: 100, y: 200, width: 200, height: 300),
            screen: CGRect(x: 0, y: 0, width: 1440, height: 900)
        )

        XCTAssertEqual(result, CGRect(x: 308, y: 140, width: 360, height: 420))
    }

    func testNearbyPanelClampsToNonZeroScreenOriginWhenNeitherSideFits() {
        let result = Geometry.nearbyPanel(
            size: CGSize(width: 360, height: 420),
            pet: CGRect(x: -1180, y: 1030, width: 200, height: 300),
            screen: CGRect(x: -1280, y: 300, width: 500, height: 800)
        )

        XCTAssertEqual(result, CGRect(x: -1140, y: 680, width: 360, height: 420))
    }

    func testNearbyPanelPinsOversizedPanelToScreenOrigin() {
        let result = Geometry.nearbyPanel(
            size: CGSize(width: 600, height: 900),
            pet: CGRect(x: 100, y: 400, width: 200, height: 300),
            screen: CGRect(x: 0, y: 22, width: 500, height: 778)
        )

        XCTAssertEqual(result, CGRect(x: 0, y: 22, width: 600, height: 900))
    }
}
