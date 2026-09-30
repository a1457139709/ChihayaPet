import XCTest
@testable import ChihayaPet

actor DeltaClient: ModelClient {
    private var completions: [CheckedContinuation<ModelReply, Error>] = []
    private var deltas: [Int: @Sendable (String) async -> Void] = [:]
    private(set) var received: [[ChatMessage]] = []
    func reply(to messages: [ChatMessage], using snapshot: RequestSnapshot) async throws -> ModelReply {
        received.append(messages)
        return try await withCheckedThrowingContinuation { completions.append($0) }
    }
    func streamReply(to messages: [ChatMessage], using snapshot: RequestSnapshot, onDelta: @escaping @Sendable (String) async -> Void) async throws -> ModelReply {
        deltas[completions.count] = onDelta
        return try await reply(to: messages, using: snapshot)
    }
    func count() -> Int { completions.count }
    func emit(_ index: Int, _ text: String) async { await deltas[index]?(text) }
    func finish(_ index: Int, _ text: String) { completions[index].resume(returning: ModelReply(text: text, truncated: false)) }
    func fail(_ index: Int) { completions[index].resume(throwing: ModelError.connection) }
}

@MainActor
final class StreamingStateTests: XCTestCase {
    private func make(_ client: DeltaClient) -> AppStore {
        let keys = MemoryCredentials(); keys.values["https://example.com/v1"] = "fixture"
        return AppStore(client: client, credentials: keys, preferences: MemoryPreferences())
    }
    private func wait(_ client: DeltaClient, _ count: Int) async {
        for _ in 0..<1000 { if await client.count() == count { return }; await Task.yield() }
        XCTFail("No request")
    }
    private func settle() async { for _ in 0..<100 { await Task.yield() } }
    func testDeltasRemainTemporaryUntilOneCompletedTurn() async {
        let client = DeltaClient(); let store = make(client)
        store.input = "你好"; store.send(); await wait(client, 1)
        await client.emit(0, "你好，")
        XCTAssertEqual(store.streamingText, "你好，")
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertNil(store.bubble)
        await client.emit(0, "请坐。")
        await client.finish(0, "你好，请坐。"); await settle()
        XCTAssertEqual(store.history.turns.count, 1)
        XCTAssertEqual(store.bubble?.text, "你好，请坐。")
        XCTAssertEqual(store.streamingText, "")
        XCTAssertNil(store.pendingInput)
    }
    func testCancelledDeltasCannotOverwriteRetryOrReleaseNewSlot() async {
        let client = DeltaClient(); let store = make(client)
        store.input = "问题"; store.send(); await wait(client, 1)
        await client.emit(0, "片"); await client.emit(0, "段"); store.cancelRequest()
        XCTAssertEqual(store.streamingText, "片段")
        XCTAssertEqual(store.displayedChatText, "片段")
        XCTAssertTrue(store.history.turns.isEmpty)
        store.retry(); await wait(client, 2)
        XCTAssertEqual(store.streamingText, "")
        await client.emit(1, "新的")
        await client.emit(0, "旧的"); await client.finish(0, "旧回复"); await settle()
        XCTAssertEqual(store.streamingText, "新的")
        XCTAssertTrue(store.isBusy)
        let messages = await client.received
        XCTAssertEqual(messages[1].map(\.role), ["system", "user"])
        await client.finish(1, "新的回复"); await settle()
        XCTAssertEqual(store.history.turns.count, 1)
        XCTAssertEqual(store.history.turns[0].user, "问题")
    }
    func testConnectionFailureKeepsPartialAndClearRejectsLateChunks() async {
        let client = DeltaClient(); let store = make(client)
        store.input = "问题"; store.send(); await wait(client, 1)
        await client.emit(0, "未完成内容"); await client.fail(0); await settle()
        XCTAssertEqual(store.streamingText, "未完成内容")
        XCTAssertNotNil(store.chatError)
        XCTAssertTrue(store.history.context.isEmpty)
        store.clearConversation()
        await client.emit(0, "迟到")
        XCTAssertEqual(store.streamingText, "")
        XCTAssertNil(store.pendingInput)
    }
    func testConfigurationChangeInvalidatesProgressAndTestSharesSlot() async {
        let client = DeltaClient(); let store = make(client)
        store.input = "问题"; store.send(); await wait(client, 1)
        store.beginSettings(); store.testConnection()
        let count = await client.count(); XCTAssertEqual(count, 1)
        await client.emit(0, "旧设定")
        store.draftPrompt = "新角色"; store.savePrompt()
        await client.emit(0, "迟到"); await client.finish(0, "旧设定迟到"); await settle()
        XCTAssertEqual(store.streamingText, "")
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertFalse(store.isBusy)
    }
    func testBufferedRefreshCannotRestoreClearedProgress() async throws {
        let client = DeltaClient(); let store = make(client)
        store.input = "问题"; store.send(); await wait(client, 1)
        await client.emit(0, "首段"); await client.emit(0, "缓冲片段")
        store.clearConversation()
        await client.finish(0, "过期回复")
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertEqual(store.streamingText, "")
        XCTAssertEqual(store.displayedChatText, "")
        XCTAssertTrue(store.history.turns.isEmpty)
    }
    func testBurstReplyContinuesUnfoldingAfterNetworkCompletion() async throws {
        let client = DeltaClient(); let store = make(client)
        store.input = "晚上好"; store.send(); await wait(client, 1)
        let reply = "晚上好。今天也辛苦了，坐下喝杯茶吧。"
        await client.emit(0, reply)
        await client.finish(0, reply); await settle()
        XCTAssertEqual(store.history.turns.last?.assistant, reply)
        XCTAssertEqual(store.displayedChatTurnID, store.history.turns.last?.id)
        XCTAssertFalse(store.displayedChatText.isEmpty)
        XCTAssertNotEqual(store.displayedChatText, reply)
        for _ in 0..<100 {
            if store.displayedChatText == reply { break }
            try await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTAssertEqual(store.displayedChatText, reply)
        store.clearConversation()
        try await Task.sleep(nanoseconds: 60_000_000)
        XCTAssertEqual(store.displayedChatText, "")
    }
    func testGreetingIsChosenOnceAcrossSettingsAndConversationReset() {
        var greetings = Set<String>()
        for selected in 0..<5 {
            var choices = 0
            let store = AppStore(client: ControlledClient(), credentials: MemoryCredentials(), preferences: MemoryPreferences(), greetingIndex: { count in
                XCTAssertEqual(count, 5); choices += 1; return selected
            })
            let initial = store.greeting
            store.beginSettings(); store.clearConversation(); store.beginSettings()
            XCTAssertEqual(store.greeting, initial)
            XCTAssertEqual(choices, 1)
            greetings.insert(initial)
        }
        XCTAssertEqual(greetings.count, 5)
    }
}
