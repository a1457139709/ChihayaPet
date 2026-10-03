import AppKit

// Original appearance identifiers remain valid for saved preferences.
enum CharacterStyle: String, CaseIterable, Codable {
    case winterFront = "a", summerFront = "a_", winterSide = "b", summerSide = "b_", casual = "c", pink = "d", gym = "e"
    var title: String {
        switch self {
        case .winterFront: return "冬服正面"
        case .summerFront: return "夏服正面"
        case .winterSide: return "冬服侧身"
        case .summerSide: return "夏服侧身"
        case .casual: return "米色便服"
        case .pink: return "粉色裙装"
        case .gym: return "体操服"
        }
    }
}
enum CharacterFraming: String, CaseIterable, Codable {
    case full, close
    var title: String { self == .full ? "全景" : "近景" }
}
enum CharacterExpression: String, CaseIterable, Codable {
    case neutral, serious, smile, surprised
    var title: String {
        switch self { case .neutral: return "日常"; case .serious: return "认真"; case .smile: return "微笑"; case .surprised: return "惊讶" }
    }
}
enum CharacterExpressionMode: String, CaseIterable, Codable {
    case automatic, neutral, serious, smile, surprised
    var expression: CharacterExpression? { CharacterExpression(rawValue: rawValue) }
    var title: String { expression?.title ?? "自动" }
    func resolved(waitingForReply: Bool, speaking: Bool) -> CharacterExpression {
        expression ?? (speaking ? .smile : (waitingForReply ? .serious : .neutral))
    }
}
enum CharacterEye: String, CaseIterable, Codable { case open, half, closed }
enum CharacterMouth: String, CaseIterable, Codable { case closed, small, medium }

struct CharacterSpeechAttachment: Equatable {
    var mouth: CGPoint
    var hairLeft: CGFloat
    var hairRight: CGFloat
    func translated(by offset: CGPoint) -> Self {
        Self(mouth: CGPoint(x: mouth.x + offset.x, y: mouth.y + offset.y), hairLeft: hairLeft + offset.x, hairRight: hairRight + offset.x)
    }
}

