import CoreGraphics
import XCTest
@testable import ChihayaPet

final class CharacterInteractionStateTests: XCTestCase {
    private let active = CharacterPoseContext()

    func testPoseMetadataAndDefaults() {
        XCTAssertEqual(CharacterPose.allCases.map(\.title), ["站姿", "看书", "喝茶", "打瞌睡"])
        XCTAssertEqual(CharacterPose.allCases.map(\.defaultGaze), [.center, .down, .center, .center])
        XCTAssertEqual(CharacterPoseMode.allCases.map(\.title), ["自动", "站姿", "看书", "喝茶", "打瞌睡"])
        XCTAssertNil(CharacterPoseMode.automatic.fixedPose)
        XCTAssertEqual(CharacterPoseMode.dozing.fixedPose, .dozing)
    }

    func testEligibleTimeAccumulatesAcrossRepeatedShortBubblePauses() {
        var delays = [300.0, 400.0]
        var scheduler = CharacterPoseScheduler(
            now: 0,
            randomDelay: { delays.removeFirst() },
            choosePose: { $0[0] }
        )
        XCTAssertEqual(scheduler.currentPose, .standing)
        XCTAssertEqual(scheduler.presentedPose, .standing)
        XCTAssertEqual(scheduler.deadline, 300)

        scheduler.update(context: active, now: 100)
        scheduler.update(context: CharacterPoseContext(bubbleVisible: true), now: 100)
        XCTAssertEqual(scheduler.remainingDelay, 200)
        XCTAssertNil(scheduler.deadline)
        scheduler.update(context: active, now: 140)
        XCTAssertEqual(scheduler.deadline, 340)

        scheduler.update(context: CharacterPoseContext(bubbleVisible: true), now: 190)
        XCTAssertEqual(scheduler.remainingDelay, 150)
        scheduler.update(context: active, now: 200)
        scheduler.advance(now: 349.9)
        XCTAssertEqual(scheduler.currentPose, .standing)
        scheduler.advance(now: 350)
        XCTAssertEqual(scheduler.currentPose, .reading)
        XCTAssertEqual(scheduler.remainingDelay, 400)
        XCTAssertEqual(scheduler.deadline, 750)
    }

    func testInitialAutomaticDelayIsClampedToSchedulingRange() {
        for (injected, expected) in [(-1.0, 300.0), (299.0, 300.0), (600.0, 600.0), (601.0, 600.0)] {
            let scheduler = CharacterPoseScheduler(
                now: 10,
                randomDelay: { injected },
                choosePose: { $0[0] }
            )

            XCTAssertEqual(scheduler.remainingDelay, expected)
            XCTAssertEqual(scheduler.deadline, 10 + expected)
        }
    }

    func testLateCallbackRotatesOnceAndSchedulesFreshWithoutBacklog() {
        var choices = [CharacterPose.reading, .tea]
        var scheduler = CharacterPoseScheduler(
            now: 0,
            randomDelay: { 300 },
            choosePose: { candidates in
                let choice = choices.removeFirst()
                XCTAssertTrue(candidates.contains(choice))
                return choice
            }
        )

        scheduler.advance(now: 5_000)
        XCTAssertEqual(scheduler.currentPose, .reading)
        XCTAssertEqual(scheduler.deadline, 5_300)
        XCTAssertEqual(choices, [.tea])
        scheduler.advance(now: 5_000)
        XCTAssertEqual(scheduler.currentPose, .reading)
        XCTAssertEqual(choices, [.tea])
    }

    func testChatAndRequestTemporarilyPresentStandingThenRestoreCurrentPose() {
        var scheduler = CharacterPoseScheduler(
            now: 0,
            randomDelay: { 300 },
            choosePose: { _ in .reading }
        )
        scheduler.advance(now: 300)
        XCTAssertEqual(scheduler.currentPose, .reading)

        scheduler.update(context: CharacterPoseContext(chatVisible: true), now: 301)
        XCTAssertEqual(scheduler.currentPose, .reading)
        XCTAssertEqual(scheduler.presentedPose, .standing)
        scheduler.update(context: CharacterPoseContext(requestActive: true), now: 310)
        XCTAssertEqual(scheduler.presentedPose, .standing)
        scheduler.update(context: active, now: 320)
        XCTAssertEqual(scheduler.currentPose, .reading)
        XCTAssertEqual(scheduler.presentedPose, .reading)
    }

    func testFixedDozingStaysPresentedDuringChatAndHasNoDeadline() {
        var scheduler = CharacterPoseScheduler(now: 0, randomDelay: { 300 }, choosePose: { _ in .tea })
        scheduler.setMode(.dozing, now: 10)
        scheduler.update(context: CharacterPoseContext(chatVisible: true), now: 20)
        scheduler.advance(now: 10_000)

        XCTAssertEqual(scheduler.currentPose, .dozing)
        XCTAssertEqual(scheduler.presentedPose, .dozing)
        XCTAssertNil(scheduler.remainingDelay)
        XCTAssertNil(scheduler.deadline)
    }

    func testHardSuspensionCancelsThenResumesWithFreshRandomDelay() {
        var delays = [300.0, 450.0]
        var scheduler = CharacterPoseScheduler(
            now: 0,
            randomDelay: { delays.removeFirst() },
            choosePose: { _ in .reading }
        )
        scheduler.update(context: active, now: 100)
        scheduler.update(context: CharacterPoseContext(isVisible: false), now: 100)
        XCTAssertNil(scheduler.remainingDelay)
        XCTAssertNil(scheduler.deadline)

        scheduler.advance(now: 5_000)
        XCTAssertEqual(scheduler.currentPose, .standing)
        scheduler.update(context: active, now: 5_000)
        XCTAssertEqual(scheduler.remainingDelay, 450)
        XCTAssertEqual(scheduler.deadline, 5_450)
    }

    func testModeSwitchCancelsOldDeadlineAndAutomaticStartsFresh() {
        var delays = [300.0, 500.0]
        var scheduler = CharacterPoseScheduler(now: 0, randomDelay: { delays.removeFirst() }, choosePose: { _ in .tea })
        scheduler.setMode(.reading, now: 50)
        XCTAssertNil(scheduler.deadline)
        scheduler.setMode(.automatic, now: 70)
        XCTAssertEqual(scheduler.currentPose, .standing)
        XCTAssertEqual(scheduler.deadline, 570)
    }

    func testFixedModeSwitchDoesNotFireAnOverdueAutomaticRotation() {
        var choiceCount = 0
        var scheduler = CharacterPoseScheduler(
            now: 0,
            randomDelay: { 300 },
            choosePose: { candidates in
                choiceCount += 1
                return candidates[0]
            }
        )

        scheduler.setMode(.dozing, now: 1_000)

        XCTAssertEqual(choiceCount, 0)
        XCTAssertEqual(scheduler.currentPose, .dozing)
        XCTAssertNil(scheduler.deadline)
    }

    func testGazeUsesNormalizedDominantDirectionAndDeadZone() {
        var filter = CharacterGazeFilter(defaultGaze: .down)
        let face = CGRect(x: 100, y: 200, width: 100, height: 80)

        XCTAssertEqual(filter.update(point: CGPoint(x: 151, y: 239), in: face, eyesClosed: false, now: 0), .center)
        XCTAssertEqual(filter.normalizedPosition.x, 0.02, accuracy: 0.001)
        XCTAssertEqual(filter.normalizedPosition.y, -0.025, accuracy: 0.001)
        XCTAssertEqual(filter.update(point: CGPoint(x: 190, y: 240), in: face, eyesClosed: false, now: 0.1), .right)
        XCTAssertEqual(filter.update(point: CGPoint(x: 150, y: 275), in: face, eyesClosed: false, now: 0.2), .up)
    }

    func testGazeThrottlesClosedEyesAndRestoresDefaultOnExit() {
        var filter = CharacterGazeFilter(defaultGaze: .down)
        let face = CGRect(x: 0, y: 0, width: 100, height: 100)

        XCTAssertEqual(filter.update(point: CGPoint(x: 90, y: 50), in: face, eyesClosed: false, now: 0), .right)
        XCTAssertEqual(filter.update(point: CGPoint(x: 10, y: 50), in: face, eyesClosed: false, now: 0.05), .right)
        XCTAssertEqual(filter.update(point: CGPoint(x: 10, y: 50), in: face, eyesClosed: true, now: 0.2), .right)
        XCTAssertEqual(filter.mouseExited(), .down)
        XCTAssertEqual(filter.normalizedPosition, .zero)
    }

    func testPetTriggersAtDistanceAndTwoReversalsThenHonorsCooldown() {
        var detector = HeadPettingDetector()
        let head = CGRect(x: 0, y: 0, width: 100, height: 100)

        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 25, y: 50), in: head, buttonDown: false, enabled: true, now: 0.2))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0.4))
        XCTAssertTrue(detector.sample(point: CGPoint(x: 25, y: 50), in: head, buttonDown: false, enabled: true, now: 0.6))
        XCTAssertEqual(detector.cooldownUntil, 8.6)

        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 1))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 25, y: 50), in: head, buttonDown: false, enabled: true, now: 1.2))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 1.4))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 25, y: 50), in: head, buttonDown: false, enabled: true, now: 1.6))
    }

    func testPetDistanceRequiresAtLeastTwentyFourPointsWithTwoReversals() {
        let head = CGRect(x: 0, y: 0, width: 100, height: 100)
        var belowThreshold = HeadPettingDetector()
        XCTAssertFalse(belowThreshold.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0))
        XCTAssertFalse(belowThreshold.sample(point: CGPoint(x: 18, y: 50), in: head, buttonDown: false, enabled: true, now: 0.2))
        XCTAssertFalse(belowThreshold.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0.4))
        XCTAssertFalse(belowThreshold.sample(point: CGPoint(x: 17, y: 50), in: head, buttonDown: false, enabled: true, now: 0.6))

        var atThreshold = HeadPettingDetector()
        XCTAssertFalse(atThreshold.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0))
        XCTAssertFalse(atThreshold.sample(point: CGPoint(x: 18, y: 50), in: head, buttonDown: false, enabled: true, now: 0.2))
        XCTAssertFalse(atThreshold.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0.4))
        XCTAssertTrue(atThreshold.sample(point: CGPoint(x: 18, y: 50), in: head, buttonDown: false, enabled: true, now: 0.6))
    }

    func testPetRejectsStaleButtonOutsideDisabledAndJitterSamples() {
        var detector = HeadPettingDetector()
        let head = CGRect(x: 0, y: 0, width: 100, height: 100)

        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 0))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 30, y: 50), in: head, buttonDown: false, enabled: true, now: 0.2))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: true, now: 1.5))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 30, y: 50), in: head, buttonDown: true, enabled: true, now: 1.7))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 150), in: head, buttonDown: false, enabled: true, now: 1.9))
        XCTAssertFalse(detector.sample(point: CGPoint(x: 10, y: 50), in: head, buttonDown: false, enabled: false, now: 2.1))

        for (index, x) in [50.0, 50.5, 49.8, 50.7, 49.6, 50.8].enumerated() {
            XCTAssertFalse(detector.sample(point: CGPoint(x: x, y: 50), in: head, buttonDown: false, enabled: true, now: 3 + Double(index) * 0.1))
        }
    }

    func testReactionAdvancesExpiresAndCanBeCancelled() {
        var reaction = CharacterPetReactionTimeline()
        reaction.start(now: 10)
        XCTAssertEqual(reaction.phase, .closedEyeSmile)
        XCTAssertEqual(reaction.deadline, 11)
        XCTAssertEqual(reaction.expiry, 12.5)

        reaction.advance(now: 11)
        XCTAssertEqual(reaction.phase, .shy)
        XCTAssertEqual(reaction.deadline, 12.5)
        reaction.advance(now: 50)
        XCTAssertNil(reaction.phase)
        XCTAssertNil(reaction.deadline)
        XCTAssertNil(reaction.expiry)

        reaction.start(now: 60)
        reaction.cancel()
        XCTAssertNil(reaction.phase)
        XCTAssertNil(reaction.deadline)
        XCTAssertNil(reaction.expiry)
    }
}
