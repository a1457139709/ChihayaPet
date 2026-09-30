import XCTest
@testable import ChihayaPet

actor ControlledClient: ModelClient {
    private var continuations: [CheckedContinuation<ModelReply, Error>] = []
    private(set) var received: [[ChatMessage]] = []
    private(set) var snapshots: [RequestSnapshot] = []
    func reply(to messages: [ChatMessage], using snapshot: RequestSnapshot) async throws -> ModelReply {
        received.append(messages); snapshots.append(snapshot)
        return try await withCheckedThrowingContinuation { continuations.append($0) }
    }
    func count() -> Int { continuations.count }
    func succeed(_ index: Int, _ text: String) { guard continuations.indices.contains(index) else { return }; continuations[index].resume(returning: ModelReply(text: text, truncated: false)) }
    func fail(_ index: Int) { guard continuations.indices.contains(index) else { return }; continuations[index].resume(throwing: ModelError.server) }
}

@MainActor
final class CoordinatorTests: XCTestCase {
    let snapshot = RequestSnapshot(config: try! ConnectionConfig.validated(baseURL: "https://example.com/v1", model: "test"), apiKey: "test-only")
    func waitFor(_ client: ControlledClient, count: Int) async {
        for _ in 0..<1000 {
            if await client.count() == count { return }
            await Task.yield()
        }
        XCTFail("Request did not start")
    }
    func settle() async { for _ in 0..<50 { await Task.yield() } }
    func testSingleSlotAndCancelledLateResultCannotReleaseNewRequest() async {
        let client = ControlledClient(); let coordinator = RequestCoordinator(client: client)
        var results: [String] = []
        XCTAssertTrue(coordinator.start(kind: .chat, snapshot: snapshot, messages: []) { if case .success(let reply) = $0 { results.append(reply.text) } })
        XCTAssertFalse(coordinator.start(kind: .test, snapshot: snapshot, messages: []) { _ in XCTFail("duplicate") })
        await waitFor(client, count: 1)
        coordinator.cancel()
        XCTAssertTrue(coordinator.start(kind: .test, snapshot: snapshot, messages: []) { if case .success(let reply) = $0 { results.append(reply.text) } })
        await waitFor(client, count: 2)
        await client.fail(0); await settle()
        XCTAssertTrue(coordinator.isBusy)
        XCTAssertTrue(results.isEmpty)
        await client.succeed(1, "current"); await settle()
        XCTAssertEqual(results, ["current"])
        XCTAssertFalse(coordinator.isBusy)
    }
    func testDraftChangeInvalidatesTestEvenWhenValuesChangeBack() async {
        let client = ControlledClient(); let coordinator = RequestCoordinator(client: client)
        var accepted = false
        _ = coordinator.start(kind: .test, snapshot: snapshot, messages: []) { _ in accepted = true }
        await waitFor(client, count: 1)
        coordinator.draftChanged(); coordinator.draftChanged()
        await client.succeed(0, "old A"); await settle()
        XCTAssertFalse(accepted)
        XCTAssertFalse(coordinator.isBusy)
    }
    func testDraftEditDoesNotCancelSavedConfigurationChat() async {
        let client = ControlledClient(); let coordinator = RequestCoordinator(client: client)
        var result = ""
        _ = coordinator.start(kind: .chat, snapshot: snapshot, messages: []) { if case .success(let reply) = $0 { result = reply.text } }
        await waitFor(client, count: 1)
        coordinator.draftChanged()
        XCTAssertTrue(coordinator.isBusy)
        await client.succeed(0, "valid"); await settle()
        XCTAssertEqual(result, "valid")
    }
    func testSessionClearInvalidatesTestAndChat() async {
        for kind in [RequestKind.chat, .test] {
            let client = ControlledClient(); let coordinator = RequestCoordinator(client: client)
            var accepted = false
            _ = coordinator.start(kind: kind, snapshot: snapshot, messages: []) { _ in accepted = true }
            await waitFor(client, count: 1)
            coordinator.sessionCleared()
            await client.succeed(0, "late"); await settle()
            XCTAssertFalse(accepted)
        }
    }
}
