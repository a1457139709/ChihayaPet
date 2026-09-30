import XCTest
@testable import ChihayaPet

final class HistoryTests: XCTestCase {
    func testRejectsWhitespaceAndCountsGraphemes() throws {
        XCTAssertThrowsError(try ConversationHistory.validateInput(" \n\t"))
        XCTAssertNoThrow(try ConversationHistory.validateInput(String(repeating: "👨‍👩‍👧‍👦", count: 2_000)))
        XCTAssertThrowsError(try ConversationHistory.validateInput(String(repeating: "你", count: 2_001)))
    }
    func testContextTrimsWholeTurnsWithoutRemovingDisplayHistory() throws {
        var history = ConversationHistory()
        for i in 0..<12 { try history.append(user: "问题\(i)", reply: ModelReply(text: "答", truncated: false)) }
        XCTAssertEqual(history.context.count, 10)
        XCTAssertEqual(history.context.first?.user, "问题2")
        XCTAssertEqual(history.turns.count, 12)
    }
    func testOversizedLatestTurnProducesEmptyContext() throws {
        var history = ConversationHistory()
        try history.append(user: "早", reply: ModelReply(text: "早", truncated: false))
        try history.append(user: "问", reply: ModelReply(text: String(repeating: "中", count: 12_000), truncated: false))
        XCTAssertTrue(history.context.isEmpty)
        XCTAssertEqual(history.turns.count, 2)
    }
    func testContextAcceptsExactCharacterLimit() throws {
        var history = ConversationHistory()
        try history.append(user: "问", reply: ModelReply(text: String(repeating: "e\u{301}", count: 11_999), truncated: false))
        XCTAssertEqual(history.context.count, 1)
    }
    func testDisplayHistoryEvictsByTurnsAndCharacters() throws {
        var history = ConversationHistory()
        for i in 0..<51 { try history.append(user: "\(i)", reply: ModelReply(text: "答", truncated: false)) }
        XCTAssertEqual(history.turns.count, 50)
        XCTAssertEqual(history.turns.first?.user, "1")
        XCTAssertTrue(history.didTrim)
        history.clear()
        for _ in 0..<5 { try history.append(user: "问", reply: ModelReply(text: String(repeating: "答", count: 20_000), truncated: false)) }
        XCTAssertEqual(history.turns.count, 4)
        XCTAssertTrue(history.didTrim)
        history.clear()
        XCTAssertFalse(history.didTrim)
        XCTAssertTrue(history.turns.isEmpty)
    }
    func testOversizedReplyNeverCreatesPartialTurn() throws {
        var history = ConversationHistory()
        try history.append(user: "一", reply: ModelReply(text: String(repeating: "🙂", count: 20_000), truncated: true))
        XCTAssertThrowsError(try history.append(user: "二", reply: ModelReply(text: String(repeating: "🙂", count: 20_001), truncated: false)))
        XCTAssertEqual(history.turns.count, 1)
        XCTAssertTrue(history.turns[0].truncated)
    }
}
