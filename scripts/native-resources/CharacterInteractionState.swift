import CoreGraphics
import Foundation

enum CharacterPose: String, Codable, CaseIterable {
    case standing
    case reading
    case tea
    case dozing

    var title: String {
        switch self {
        case .standing: "站姿"
        case .reading: "看书"
        case .tea: "喝茶"
        case .dozing: "打瞌睡"
        }
    }

    var defaultGaze: CharacterGaze {
        self == .reading ? .down : .center
    }
}

enum CharacterPoseMode: String, Codable, CaseIterable {
    case automatic
    case standing
    case reading
    case tea
    case dozing

    var title: String {
        switch self {
        case .automatic: "自动"
        case .standing: CharacterPose.standing.title
        case .reading: CharacterPose.reading.title
        case .tea: CharacterPose.tea.title
        case .dozing: CharacterPose.dozing.title
        }
    }

    var fixedPose: CharacterPose? {
        switch self {
        case .automatic: nil
        case .standing: .standing
        case .reading: .reading
        case .tea: .tea
        case .dozing: .dozing
        }
    }
}

enum CharacterGaze: String, Codable, CaseIterable {
    case center
    case left
    case right
    case up
    case down
}

struct CharacterPoseContext: Equatable {
    var isVisible = true
    var isAwake = true
    var clickThrough = false
    var motionEnabled = true
    var reduceMotion = false
    var chatVisible = false
    var settingsVisible = false
    var draftActive = false
    var requestActive = false
    var bubbleVisible = false
    var dragging = false
    var petting = false

    var isHardSuspended: Bool {
        !isVisible || !isAwake || clickThrough || !motionEnabled || reduceMotion
    }

    var isPaused: Bool {
        chatVisible || settingsVisible || draftActive || requestActive ||
            bubbleVisible || dragging || petting
    }
}

struct CharacterPoseScheduler {
    private(set) var mode: CharacterPoseMode
    private(set) var currentPose: CharacterPose
    private(set) var remainingDelay: TimeInterval?
    private(set) var deadline: TimeInterval?
    private(set) var context: CharacterPoseContext

    var presentedPose: CharacterPose {
        if mode == .automatic, context.chatVisible || context.requestActive {
            return .standing
        }
        return currentPose
    }

    private var lastUpdate: TimeInterval
    private let randomDelay: () -> TimeInterval
    private let choosePose: ([CharacterPose]) -> CharacterPose

    init(
        mode: CharacterPoseMode = .automatic,
        context: CharacterPoseContext = CharacterPoseContext(),
        now: TimeInterval,
        randomDelay: @escaping () -> TimeInterval = { Double.random(in: 300...600) },
        choosePose: @escaping ([CharacterPose]) -> CharacterPose = { $0.randomElement()! }
    ) {
        self.mode = mode
        self.context = context
        self.lastUpdate = now
        self.randomDelay = randomDelay
        self.choosePose = choosePose
        currentPose = mode.fixedPose ?? .standing

        if mode == .automatic, !context.isHardSuspended {
            let delay = Self.boundedDelay(randomDelay())
            remainingDelay = delay
            deadline = context.isPaused ? nil : now + delay
        } else {
            remainingDelay = nil
            deadline = nil
        }
    }

    mutating func update(context newContext: CharacterPoseContext, now: TimeInterval) {
        settle(at: now)
        let wasHardSuspended = context.isHardSuspended
        context = newContext

        guard mode == .automatic else {
            remainingDelay = nil
            deadline = nil
            return
        }
        if newContext.isHardSuspended {
            remainingDelay = nil
            deadline = nil
        } else if wasHardSuspended || remainingDelay == nil {
            scheduleFresh(at: now)
        } else {
            refreshDeadline(at: now)
        }
    }

    mutating func advance(now: TimeInterval) {
        settle(at: now)
    }

    mutating func setMode(_ newMode: CharacterPoseMode, now: TimeInterval) {
        mode = newMode
        currentPose = newMode.fixedPose ?? .standing
        remainingDelay = nil
        deadline = nil
        lastUpdate = now
        if newMode == .automatic, !context.isHardSuspended {
            scheduleFresh(at: now)
        }
    }

    private mutating func settle(at now: TimeInterval) {
        let elapsed = max(0, now - lastUpdate)
        defer { lastUpdate = max(lastUpdate, now) }
        guard mode == .automatic,
              !context.isHardSuspended,
              !context.isPaused,
              var remaining = remainingDelay else {
            refreshDeadline(at: now)
            return
        }

        remaining -= elapsed
        if remaining <= 0 {
            rotate(at: now)
        } else {
            remainingDelay = remaining
            deadline = now + remaining
        }
    }

    private mutating func rotate(at now: TimeInterval) {
        let candidates = [CharacterPose.reading, .tea, .dozing].filter { $0 != currentPose }
        let selected = choosePose(candidates)
        currentPose = candidates.contains(selected) ? selected : candidates[0]
        scheduleFresh(at: now)
    }

    private mutating func scheduleFresh(at now: TimeInterval) {
        let delay = Self.boundedDelay(randomDelay())
        remainingDelay = delay
        refreshDeadline(at: now)
    }

    private static func boundedDelay(_ delay: TimeInterval) -> TimeInterval {
        min(max(delay, 300), 600)
    }

    private mutating func refreshDeadline(at now: TimeInterval) {
        if mode == .automatic,
           !context.isHardSuspended,
           !context.isPaused,
           let remainingDelay {
            deadline = now + remainingDelay
        } else {
            deadline = nil
        }
    }
}

struct CharacterGazeFilter {
    private(set) var gaze: CharacterGaze
    private(set) var normalizedPosition: CGPoint = .zero
    private(set) var defaultGaze: CharacterGaze

    private var lastUpdate: TimeInterval?
    private let minimumInterval: TimeInterval
    private let deadZone: CGFloat

    init(defaultGaze: CharacterGaze, maximumUpdatesPerSecond: Double = 10, deadZone: CGFloat = 0.25) {
        self.defaultGaze = defaultGaze
        gaze = defaultGaze
        minimumInterval = 1 / max(1, maximumUpdatesPerSecond)
        self.deadZone = max(0, deadZone)
    }

    mutating func setDefaultGaze(_ newDefault: CharacterGaze) {
        defaultGaze = newDefault
    }

    @discardableResult
    mutating func update(point: CGPoint, in faceRect: CGRect, eyesClosed: Bool, now: TimeInterval) -> CharacterGaze {
        guard !eyesClosed, faceRect.width > 0, faceRect.height > 0 else { return gaze }
        if let lastUpdate, now - lastUpdate + 0.000_001 < minimumInterval { return gaze }
        lastUpdate = now

        let normalizedX = max(-1, min(1, (point.x - faceRect.midX) / (faceRect.width / 2)))
        let normalizedY = max(-1, min(1, (point.y - faceRect.midY) / (faceRect.height / 2)))
        normalizedPosition = CGPoint(x: normalizedX, y: normalizedY)

        if abs(normalizedX) < deadZone, abs(normalizedY) < deadZone {
            gaze = .center
        } else if abs(normalizedX) >= abs(normalizedY) {
            gaze = normalizedX < 0 ? .left : .right
        } else {
            gaze = normalizedY < 0 ? .down : .up
        }
        return gaze
    }

    @discardableResult
    mutating func mouseExited() -> CharacterGaze {
        gaze = defaultGaze
        normalizedPosition = .zero
        lastUpdate = nil
        return gaze
    }
}

struct HeadPettingDetector {
    private struct Sample {
        let point: CGPoint
        let time: TimeInterval
    }

    private(set) var cooldownUntil: TimeInterval?
    private var samples: [Sample] = []
    private let windowDuration: TimeInterval
    private let requiredReversals: Int
    private let requiredDistance: CGFloat
    private let cooldownDuration: TimeInterval
    private let jitterDistance: CGFloat

    init(
        windowDuration: TimeInterval = 1.2,
        requiredReversals: Int = 2,
        requiredDistance: CGFloat = 24,
        cooldownDuration: TimeInterval = 8,
        jitterDistance: CGFloat = 2
    ) {
        self.windowDuration = windowDuration
        self.requiredReversals = requiredReversals
        self.requiredDistance = requiredDistance
        self.cooldownDuration = cooldownDuration
        self.jitterDistance = jitterDistance
    }

    mutating func reset() {
        samples.removeAll(keepingCapacity: true)
    }

    mutating func sample(
        point: CGPoint,
        in headRegion: CGRect,
        buttonDown: Bool,
        enabled: Bool,
        now: TimeInterval
    ) -> Bool {
        guard enabled, !buttonDown, headRegion.contains(point) else {
            reset()
            return false
        }
        if let cooldownUntil, now < cooldownUntil {
            reset()
            return false
        }

        samples.removeAll { now - $0.time > windowDuration || $0.time > now }
        if let last = samples.last, abs(point.x - last.point.x) < jitterDistance {
            return false
        }
        samples.append(Sample(point: point, time: now))

        var distance: CGFloat = 0
        var reversals = 0
        var previousDirection = 0
        for pair in zip(samples, samples.dropFirst()) {
            let delta = pair.1.point.x - pair.0.point.x
            distance += abs(delta)
            let direction = delta < 0 ? -1 : 1
            if previousDirection != 0, direction != previousDirection {
                reversals += 1
            }
            previousDirection = direction
        }

        guard reversals >= requiredReversals, distance >= requiredDistance else { return false }
        cooldownUntil = now + cooldownDuration
        reset()
        return true
    }
}

enum CharacterPetReactionPhase: String, Codable, CaseIterable {
    case closedEyeSmile
    case shy
}

struct CharacterPetReactionTimeline {
    private(set) var phase: CharacterPetReactionPhase?
    private(set) var deadline: TimeInterval?
    private(set) var expiry: TimeInterval?

    mutating func start(now: TimeInterval) {
        phase = .closedEyeSmile
        deadline = now + 1
        expiry = now + 2.5
    }

    mutating func advance(now: TimeInterval) {
        guard let expiry else { return }
        if now + 0.000_001 >= expiry {
            cancel()
        } else if phase == .closedEyeSmile, let deadline, now + 0.000_001 >= deadline {
            phase = .shy
            self.deadline = expiry
        }
    }

    mutating func cancel() {
        phase = nil
        deadline = nil
        expiry = nil
    }
}
