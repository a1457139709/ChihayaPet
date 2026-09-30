import Foundation

/// Discrete face events only. Core Animation handles continuous body motion.
struct CharacterAnimationTimeline {
    private(set) var eye: CharacterEye = .open
    private(set) var mouth: CharacterMouth = .closed
    private var active = false
    private var speaking = false
    private var blinkStage = 0
    private var blinkDeadline: TimeInterval?
    private var mouthDeadline: TimeInterval?
    private var mouthIndex = 0
    private let random: (ClosedRange<Double>) -> Double
    init(random: @escaping (ClosedRange<Double>) -> Double = { Double.random(in: $0) }) { self.random = random }
    var nextDeadline: TimeInterval? { [blinkDeadline, mouthDeadline].compactMap { $0 }.min() }
    mutating func update(active: Bool, speaking: Bool, now: TimeInterval) {
        if !active {
            self.active = false; self.speaking = false
            blinkDeadline = nil; mouthDeadline = nil; blinkStage = 0
            eye = .open; mouth = .closed
            return
        }
        if !self.active {
            blinkDeadline = now + random(3...6); blinkStage = 0; eye = .open
        }
        self.active = true
        if speaking != self.speaking {
            self.speaking = speaking
            mouthIndex = 0; mouth = speaking ? .small : .closed
            mouthDeadline = speaking ? now + random(0.09...0.16) : nil
        }
    }
    mutating func advance(now: TimeInterval) {
        guard active else { return }
        if let deadline = blinkDeadline, now + 0.000_001 >= deadline {
            switch blinkStage {
            case 0: eye = .half; blinkStage = 1; blinkDeadline = now + 0.055
            case 1: eye = .closed; blinkStage = 2; blinkDeadline = now + 0.080
            case 2: eye = .half; blinkStage = 3; blinkDeadline = now + 0.085
            default: eye = .open; blinkStage = 0; blinkDeadline = now + random(3...6)
            }
        }
        if let deadline = mouthDeadline, now + 0.000_001 >= deadline {
            let frames: [CharacterMouth] = [.small, .medium, .small, .closed]
            mouthIndex = (mouthIndex + 1) % frames.count
            mouth = frames[mouthIndex]
            mouthDeadline = now + random(0.09...0.16)
        }
    }
}
