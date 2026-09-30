import Foundation

struct ConversationTurn: Identifiable {
    let id = UUID()
    let user: String
    let assistant: String
    let truncated: Bool
    var characterCount: Int { user.count + assistant.count }
}

enum InputError: Error, LocalizedError {
    case empty, tooLong
    var errorDescription: String? {
        switch self {
        case .empty: return "请输入消息，不能只包含空白。"
        case .tooLong: return "单次输入最多 2,000 个字符。"
        }
    }
}

struct ConversationHistory {
    private(set) var turns: [ConversationTurn] = []
    private(set) var didTrim = false
    var context: [ConversationTurn] {
        var recent = Array(turns.suffix(10))
        var characters = recent.reduce(0) { $0 + $1.characterCount }
        while characters > 12_000, !recent.isEmpty { characters -= recent.removeFirst().characterCount }
        return recent
    }
    static func validateInput(_ input: String) throws {
        guard !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw InputError.empty }
        guard input.count <= 2_000 else { throw InputError.tooLong }
    }
    mutating func append(user: String, reply: ModelReply) throws {
        try Self.validateInput(user)
        guard reply.text.count <= 20_000 else { throw ModelError.responseTooLarge }
        guard !reply.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ModelError.invalidResponse }
        turns.append(ConversationTurn(user: user, assistant: reply.text, truncated: reply.truncated))
        var characters = turns.reduce(0) { $0 + $1.characterCount }
        while turns.count > 50 || characters > 100_000 {
            characters -= turns.removeFirst().characterCount
            didTrim = true
        }
    }
    mutating func clear() { turns = []; didTrim = false }
}
