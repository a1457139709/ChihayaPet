import Foundation
import QuartzCore

enum ExpandedCharacterExpressionMode: String, Codable, CaseIterable {
    case automatic
    case neutral
    case serious
    case smile
    case surprised
    case shy
    case pout
    case sleepy
    case proud

    var expression: ExpandedCharacterExpression? {
        self == .automatic ? nil : ExpandedCharacterExpression(rawValue: rawValue)
    }

    var legacyMode: CharacterExpressionMode? {
        CharacterExpressionMode(rawValue: rawValue)
    }

    var title: String { expression?.title ?? "自动" }
}

struct CharacterFacePresentation: Equatable {
    var expression: ExpandedCharacterExpression
    var eye: CharacterEye
    var gaze: CharacterGaze
    var mouth: CharacterMouth
}

enum CharacterFacePolicy {
    static func resolve(
        mode: ExpandedCharacterExpressionMode,
        pose: CharacterPose,
        visibleTyping: Bool,
        waiting: Bool,
        petReaction: CharacterPetReactionPhase?,
        animatedEye: CharacterEye,
        animatedMouth: CharacterMouth,
        gaze: CharacterGaze
    ) -> CharacterFacePresentation {
        let expression: ExpandedCharacterExpression
        if let manual = mode.expression {
            expression = manual
        } else if visibleTyping {
            expression = .smile
        } else if waiting {
            expression = .serious
        } else if petReaction == .closedEyeSmile {
            expression = .smile
        } else if petReaction == .shy {
            expression = .shy
        } else {
            switch pose {
            case .reading: expression = .serious
            case .dozing: expression = .sleepy
            case .standing, .tea: expression = .neutral
            }
        }

        let eye: CharacterEye
        if mode.expression != nil || visibleTyping || waiting {
            eye = animatedEye
        } else if petReaction == .closedEyeSmile {
            eye = .closed
        } else if pose == .dozing {
            eye = .closed
        } else {
            eye = animatedEye
        }
        return CharacterFacePresentation(
            expression: expression,
            eye: eye,
            gaze: gaze,
            mouth: visibleTyping ? animatedMouth : .closed
        )
    }
}

struct CharacterDeadlineGeneration {
    typealias Token = UInt64
    private var value: Token = 0

    mutating func issue() -> Token {
        value &+= 1
        return value
    }

    mutating func cancel() {
        value &+= 1
    }

    func accepts(_ token: Token) -> Bool { token == value }
}

enum ExpansionNativeFaceAdapter {
    static func install(base: CGImage, face: CGImage, bodyLayer: CALayer, faceLayer: CALayer) {
        bodyLayer.contents = base
        bodyLayer.isHidden = false
        faceLayer.contents = face
        faceLayer.isHidden = false
        for layer in [bodyLayer, faceLayer] {
            layer.contentsGravity = .resize
            layer.minificationFilter = .linear
            layer.magnificationFilter = .linear
        }
    }

    static func layout(
        variant: ExpansionVariant,
        base: CGImage,
        in bounds: CGRect,
        bodyLayer: CALayer,
        faceLayer: CALayer
    ) {
        bodyLayer.frame = bounds
        let source = variant.face.bottomLeftRect(canvasHeight: Double(base.height))
        let scaleX = bounds.width / CGFloat(base.width)
        let scaleY = bounds.height / CGFloat(base.height)
        faceLayer.frame = CGRect(
            x: bounds.minX + source.minX * scaleX,
            y: bounds.minY + source.minY * scaleY,
            width: source.width * scaleX,
            height: source.height * scaleY
        )
    }
}
