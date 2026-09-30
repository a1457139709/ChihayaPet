import AppKit
import QuartzCore
import XCTest
@testable import ChihayaPet

final class CharacterAnimationTests: XCTestCase {
    func testBlinkStagesAndCancellationResetWithoutBacklog() {
        var timeline = CharacterAnimationTimeline(random: { $0.lowerBound })
        timeline.update(active: true, speaking: false, now: 0)
        XCTAssertEqual(timeline.nextDeadline, 3)
        timeline.advance(now: 3)
        XCTAssertEqual(timeline.eye, .half)
        timeline.advance(now: 3.055)
        XCTAssertEqual(timeline.eye, .closed)
        timeline.advance(now: 3.135)
        XCTAssertEqual(timeline.eye, .half)
        timeline.advance(now: 3.220)
        XCTAssertEqual(timeline.eye, .open)
        timeline.update(active: false, speaking: true, now: 3.3)
        XCTAssertNil(timeline.nextDeadline)
        XCTAssertEqual(timeline.mouth, .closed)
        timeline.advance(now: 100)
        XCTAssertEqual(timeline.eye, .open)
        timeline.update(active: true, speaking: false, now: 100)
        XCTAssertEqual(timeline.nextDeadline, 103)
    }

    func testMouthCadenceAndSpeakingStopDoNotResetBlink() {
        var timeline = CharacterAnimationTimeline(random: { $0.upperBound })
        timeline.update(active: true, speaking: true, now: 0)
        XCTAssertEqual(timeline.mouth, .small)
        XCTAssertEqual(timeline.nextDeadline, 0.16)
        timeline.advance(now: 0.16)
        XCTAssertEqual(timeline.mouth, .medium)
        timeline.update(active: true, speaking: false, now: 0.18)
        XCTAssertEqual(timeline.mouth, .closed)
        XCTAssertEqual(timeline.nextDeadline, 6)
    }

    @MainActor
    func testExpressionPriorityAndAllLifecycleGatesCloseMouth() {
        let renderer = PNGRenderer(style: .winterFront, framing: .full, imageHeight: 256, animationsEnabled: true)
        defer { renderer.shutdown() }
        renderer.setPresented(true)
        renderer.setActivity(waitingForReply: true, speaking: false)
        XCTAssertEqual(renderer.expression, .serious)
        renderer.setActivity(waitingForReply: true, speaking: true)
        XCTAssertEqual(renderer.expression, .smile)
        XCTAssertNotEqual(renderer.mouth, .closed)
        renderer.setExpressionMode(.surprised)
        XCTAssertEqual(renderer.expression, .surprised)
        XCTAssertNotEqual(renderer.mouth, .closed)
        for suspend in [renderer.setPresented, renderer.setAwake, renderer.setAnimationsEnabled] {
            suspend(false)
            XCTAssertEqual(renderer.mouth, .closed)
            XCTAssertFalse(renderer.isScheduling)
            suspend(true)
            XCTAssertTrue(renderer.isScheduling)
        }
        renderer.setReducedMotion(true)
        XCTAssertEqual(renderer.mouth, .closed)
        XCTAssertFalse(renderer.isScheduling)
        renderer.setReducedMotion(false)
        XCTAssertTrue(renderer.isScheduling)
        renderer.shutdown()
        XCTAssertFalse(renderer.isScheduling)
    }

    @MainActor
    func testFailedResourcesKeepStaticCharacterVisible() {
        let renderer = PNGRenderer(style: .summerSide, framing: .close, imageHeight: 256, animationsEnabled: true, resourceURL: nil)
        defer { renderer.shutdown() }
        XCTAssertTrue(renderer.usesFallback)
        XCTAssertEqual(renderer.imageFrame.width, 256 * 441 / 516, accuracy: 0.001)
        XCTAssertGreaterThan(renderer.contentSize.width, 0)
        XCTAssertEqual(renderer.cachedImageCount, 1)
    }

    @MainActor
    func testCancelledNativeTimerCannotChangeFaceAfterHideOrShutdown() async throws {
        let renderer = PNGRenderer(style: .winterSide, framing: .close, imageHeight: 256, animationsEnabled: true)
        renderer.setPresented(true)
        renderer.setActivity(waitingForReply: false, speaking: true)
        XCTAssertEqual(renderer.mouth, .small)
        renderer.setPresented(false)
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(renderer.mouth, .closed)
        XCTAssertEqual(renderer.eye, .open)
        XCTAssertFalse(renderer.isScheduling)
        renderer.setPresented(true)
        XCTAssertTrue(renderer.isScheduling)
        renderer.shutdown()
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(renderer.mouth, .closed)
        XCTAssertFalse(renderer.isScheduling)
        XCTAssertEqual(renderer.cachedImageCount, 0)
    }

    func testMaximumCombinedTransformFitsTwelvePointMargin() {
        // Bound every source corner with simultaneous click, breath and maximum sway.
        for width in [268.0, 310, 454, 508] {
            for height in [240.0, 256, 480] {
                let w = height * width / 606
                let scaleY = 1.02 * 1.003
                for angle in [-0.25, 0.25] {
                    let r = angle * .pi / 180
                    for x in [-w / 2, w / 2] {
                        for y in [0.0, height] {
                            let px = x * 1.02 * cos(r) - y * scaleY * sin(r) + w / 2
                            let py = x * 1.02 * sin(r) + y * scaleY * cos(r)
                            XCTAssertGreaterThanOrEqual(px, -12)
                            XCTAssertLessThanOrEqual(px, w + 12)
                            XCTAssertGreaterThanOrEqual(py, -12)
                            XCTAssertLessThanOrEqual(py, height + 12)
                        }
                    }
                }
            }
        }
    }
}
