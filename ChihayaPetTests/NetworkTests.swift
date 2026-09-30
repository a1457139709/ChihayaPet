import Foundation
import XCTest
@testable import ChihayaPet

final class NetworkTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.streamingHandler = nil
        StubURLProtocol.requestObserver = nil
        super.tearDown()
    }

    func testValidationNormalizesConfigurationAndBuildsEndpoint() throws {
        let config = try ConnectionConfig.validated(
            baseURL: "  https://example.com/api/v1///  ",
            model: "  chihaya-model  "
        )

        XCTAssertEqual(config.baseURL, "https://example.com/api/v1")
        XCTAssertEqual(config.model, "chihaya-model")
        XCTAssertEqual(config.endpoint.absoluteString, "https://example.com/api/v1/chat/completions")
    }

    func testValidationRejectsUnsafeOrIncompleteConfiguration() {
        let invalidURLs = [
            "", "http://example.com/v1", "https://", "https://user@example.com/v1",
            "https://example.com/v1?key=value", "https://example.com/v1#fragment"
        ]
        for baseURL in invalidURLs {
            XCTAssertThrowsError(try ConnectionConfig.validated(baseURL: baseURL, model: "model")) {
                XCTAssertEqual($0 as? ModelError, .invalidURL, "Unexpected result for \(baseURL)")
            }
        }

        XCTAssertThrowsError(try ConnectionConfig.validated(baseURL: "https://example.com", model: " \n ")) {
            XCTAssertEqual($0 as? ModelError, .missingModel)
        }
    }

    func testReplySendsOnlyCompatibleRequestFieldsAndParsesLengthFinishReason() async throws {
        let captured = LockedBox<URLRequest?>(nil)
        let capturedBody = LockedBox<Data?>(nil)
        StubURLProtocol.requestObserver = { request in
            if let body = try? requestBody(from: request), !body.isEmpty {
                capturedBody.withValue { $0 = body }
            }
        }
        StubURLProtocol.handler = { request in
            captured.withValue { $0 = request }
            return StubResponse(
                status: 200,
                body: #"{"choices":[{"message":{"role":"assistant","content":"你好"},"finish_reason":"length"}]}"#.data(using: .utf8)!
            )
        }
        let client = makeClient()
        let config = try ConnectionConfig.validated(baseURL: "https://example.com/v1/", model: "model-a")

        let result = try await client.reply(
            to: [ChatMessage(role: "system", content: "设定"), ChatMessage(role: "user", content: "你好")],
            using: RequestSnapshot(config: config, apiKey: " secret-key ")
        )

        XCTAssertEqual(result, ModelReply(text: "你好", truncated: true))
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.url?.absoluteString, "https://example.com/v1/chat/completions")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-key")
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(capturedBody.value)) as? [String: Any])
        XCTAssertEqual(Set(object.keys), Set(["model", "messages", "stream"]))
        XCTAssertEqual(object["model"] as? String, "model-a")
        XCTAssertEqual(object["stream"] as? Bool, false)
        let messages = try XCTUnwrap(object["messages"] as? [[String: String]])
        XCTAssertEqual(messages, [
            ["role": "system", "content": "设定"],
            ["role": "user", "content": "你好"]
        ])
    }

    func testReplyAcceptsExactlyTwentyThousandSwiftCharacters() async throws {
        let text = String(repeating: "👩🏽‍💻", count: 20_000)
        StubURLProtocol.handler = { _ in .jsonReply(text: text) }

        let reply = try await makeClient(maximumResponseBytes: 2_000_000).reply(
            to: [ChatMessage(role: "user", content: "hi")],
            using: try snapshot()
        )

        XCTAssertEqual(reply.text.count, 20_000)
    }

    func testReplyRejectsTwentyThousandAndOneSwiftCharacters() async throws {
        StubURLProtocol.handler = { _ in .jsonReply(text: String(repeating: "好", count: 20_001)) }

        await assertReplyError(.responseTooLarge, client: makeClient(), snapshot: try snapshot())
    }

    func testReplyRejectsResponseBeforeExceedingConfiguredByteBudget() async throws {
        StubURLProtocol.handler = { _ in .jsonReply(text: String(repeating: "a", count: 200)) }

        await assertReplyError(
            .responseTooLarge,
            client: makeClient(maximumResponseBytes: 100),
            snapshot: try snapshot()
        )
    }

    func testReplyClassifiesHTTPFailuresAndDoesNotRetry() async throws {
        let cases: [(Int, ModelError)] = [
            (301, .redirect), (401, .authentication), (403, .authentication),
            (404, .endpoint), (429, .rateLimited), (500, .server), (503, .server),
            (400, .endpoint)
        ]

        for (status, expected) in cases {
            let requestCount = LockedBox(0)
            StubURLProtocol.handler = { _ in
                requestCount.withValue { $0 += 1 }
                return StubResponse(status: status, headers: status == 301 ? ["Location": "https://elsewhere.example/v1"] : [:], body: Data())
            }

            await assertReplyError(expected, client: makeClient(), snapshot: try snapshot())
            XCTAssertEqual(requestCount.value, 1, "HTTP \(status) was retried")
        }
    }

    func testReplyClassifiesTransportFailures() async throws {
        let cases: [(URLError.Code, ModelError)] = [
            (.timedOut, .timeout), (.cancelled, .cancelled),
            (.notConnectedToInternet, .connection), (.secureConnectionFailed, .connection)
        ]

        for (code, expected) in cases {
            StubURLProtocol.handler = { _ in throw URLError(code) }
            await assertReplyError(expected, client: makeClient(), snapshot: try snapshot())
        }
    }

    func testReplyEnforcesTotalWallClockTimeout() async throws {
        StubURLProtocol.handler = { _ in
            Thread.sleep(forTimeInterval: 0.2)
            return .jsonReply(text: "late")
        }

        await assertReplyError(
            .timeout,
            client: makeClient(timeout: 0.02),
            snapshot: try snapshot()
        )
    }

    func testReplyRejectsMalformedOrEmptyResponses() async throws {
        let invalidBodies = [
            Data("not-json".utf8),
            Data(#"{"choices":[]}"#.utf8),
            Data(#"{"choices":[{"message":{"content":"  \n "}}]}"#.utf8),
            Data(#"{"choices":[{"message":{}}]}"#.utf8)
        ]

        for body in invalidBodies {
            StubURLProtocol.handler = { _ in StubResponse(status: 200, body: body) }
            await assertReplyError(.invalidResponse, client: makeClient(), snapshot: try snapshot())
        }
    }

    func testReplyRejectsMissingKeyWithoutStartingNetworkRequest() async throws {
        let requestCount = LockedBox(0)
        StubURLProtocol.handler = { _ in
            requestCount.withValue { $0 += 1 }
            return .jsonReply(text: "unexpected")
        }
        let emptyKey = RequestSnapshot(config: try snapshot().config, apiKey: " \n ")

        await assertReplyError(.missingKey, client: makeClient(), snapshot: emptyKey)
        XCTAssertEqual(requestCount.value, 0)
    }

    func testStreamReplyRequestsStreamingAndEmitsSplitUTF8SSEContentInOrder() async throws {
        let capturedBody = LockedBox<Data?>(nil)
        StubURLProtocol.requestObserver = { request in
            if let body = try? requestBody(from: request), !body.isEmpty {
                capturedBody.withValue { $0 = body }
            }
        }
        let wire = Data(": keep-alive\r\n\r\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"hidden\",\"content\":\"你👩🏽‍💻\"}}]}\r\n\r\ndata: {\"choices\":[{\"index\":1,\"delta\":{\"content\":\"ignored\"}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"好\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n".utf8)
        StubURLProtocol.streamingHandler = { _ in
            let split = wire.firstIndex(of: 0xF0)!
            return StubStreamResponse(status: 200, chunks: [
                Data(wire[..<wire.index(after: split)]),
                Data(wire[wire.index(after: split)...])
            ])
        }
        let deltas = LockedBox<[String]>([])

        let reply = try await makeClient().streamReply(
            to: [ChatMessage(role: "user", content: "hi")],
            using: try snapshot(),
            onDelta: { delta in deltas.withValue { $0.append(delta) } }
        )

        XCTAssertEqual(reply, ModelReply(text: "你👩🏽‍💻好", truncated: false))
        XCTAssertEqual(deltas.value.joined(), "你👩🏽‍💻好")
        XCTAssertEqual(deltas.value.first, "你👩🏽‍💻")
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(capturedBody.value)) as? [String: Any])
        XCTAssertEqual(object["stream"] as? Bool, true)
    }

    func testStreamReplyAcceptsJSONFallbackWithoutSecondRequest() async throws {
        let requests = LockedBox(0)
        StubURLProtocol.streamingHandler = { _ in
            requests.withValue { $0 += 1 }
            return StubStreamResponse(status: 200, headers: ["Content-Type": "application/json"], chunks: [.jsonReplyData(text: "fallback")])
        }
        let deltas = LockedBox<[String]>([])

        let reply = try await makeClient().streamReply(
            to: [ChatMessage(role: "user", content: "hi")], using: try snapshot(),
            onDelta: { delta in deltas.withValue { $0.append(delta) } }
        )

        XCTAssertEqual(reply.text, "fallback")
        XCTAssertEqual(requests.value, 1)
        XCTAssertEqual(deltas.value, ["fallback"])
    }

    func testStreamReplyRejectsPrematureEOFButPreservesAlreadyEmittedContent() async throws {
        StubURLProtocol.streamingHandler = { _ in
            StubStreamResponse(status: 200, chunks: [Data("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"small \"}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"deltas\"}}]}\n\n".utf8)])
        }
        let deltas = LockedBox<[String]>([])

        await assertStreamError(.invalidResponse, client: makeClient(), snapshot: try snapshot()) {
            delta in deltas.withValue { $0.append(delta) }
        }
        XCTAssertEqual(deltas.value, ["small ", "deltas"])
    }

    func testStreamReplyMarksLengthFinishAsTruncatedWithoutDone() async throws {
        StubURLProtocol.streamingHandler = { _ in
            StubStreamResponse(status: 200, chunks: [Data("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"cut\"},\"finish_reason\":\"length\"}]}\n\n".utf8)])
        }

        let reply = try await makeClient().streamReply(
            to: [ChatMessage(role: "user", content: "hi")], using: try snapshot(), onDelta: { _ in }
        )
        XCTAssertEqual(reply, ModelReply(text: "cut", truncated: true))
    }

    func testStreamReplyClassifiesHTTPErrorWithoutEmittingOrRetrying() async throws {
        let requests = LockedBox(0)
        let deltas = LockedBox<[String]>([])
        StubURLProtocol.streamingHandler = { _ in
            requests.withValue { $0 += 1 }
            return StubStreamResponse(status: 429, chunks: [])
        }

        await assertStreamError(.rateLimited, client: makeClient(), snapshot: try snapshot()) {
            delta in deltas.withValue { $0.append(delta) }
        }
        XCTAssertEqual(requests.value, 1)
        XCTAssertTrue(deltas.value.isEmpty)
    }

    func testModelClientDefaultStreamingKeepsNonStreamingMocksCompatible() async throws {
        struct ExistingMock: ModelClient {
            func reply(to messages: [ChatMessage], using snapshot: RequestSnapshot) async throws -> ModelReply {
                ModelReply(text: "mock reply", truncated: false)
            }
        }
        let deltas = LockedBox<[String]>([])

        let reply = try await ExistingMock().streamReply(
            to: [], using: try snapshot(),
            onDelta: { delta in deltas.withValue { $0.append(delta) } }
        )

        XCTAssertEqual(reply.text, "mock reply")
        XCTAssertEqual(deltas.value, ["mock reply"])
    }

    func testStreamReplyEnforcesWireAndSwiftCharacterLimits() async throws {
        StubURLProtocol.streamingHandler = { _ in
            StubStreamResponse(status: 200, chunks: [Data("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\n".utf8)])
        }
        await assertStreamError(.responseTooLarge, client: makeClient(maximumResponseBytes: 20), snapshot: try snapshot()) { _ in }

        let tooLong = String(repeating: "👩🏽‍💻", count: 20_001)
        let json = try JSONSerialization.data(withJSONObject: ["choices": [["index": 0, "delta": ["content": tooLong], "finish_reason": "stop"]]])
        StubURLProtocol.streamingHandler = { _ in StubStreamResponse(status: 200, chunks: [Data("data: ".utf8) + json + Data("\n\n".utf8)]) }
        let retained = LockedBox("")
        await assertStreamError(.responseTooLarge, client: makeClient(), snapshot: try snapshot()) {
            delta in retained.withValue { $0 += delta }
        }
        XCTAssertEqual(retained.value.count, 20_000)
    }

    func testStreamReplyCountsGraphemeJoinedAcrossSSEBoundaries() async throws {
        let base = String(repeating: "a", count: 20_000)
        let first = try JSONSerialization.data(withJSONObject: [
            "choices": [["index": 0, "delta": ["content": base]]]
        ])
        let second = try JSONSerialization.data(withJSONObject: [
            "choices": [["index": 0, "delta": ["content": "\u{301}"], "finish_reason": "stop"]]
        ])
        StubURLProtocol.streamingHandler = { _ in
            StubStreamResponse(status: 200, chunks: [
                Data("data: ".utf8) + first + Data("\n\n".utf8),
                Data("data: ".utf8) + second + Data("\n\n".utf8)
            ])
        }
        let emitted = LockedBox("")

        let reply = try await makeClient().streamReply(
            to: [ChatMessage(role: "user", content: "hi")], using: try snapshot(),
            onDelta: { delta in emitted.withValue { $0 += delta } }
        )

        XCTAssertEqual(reply.text, base + "\u{301}")
        XCTAssertEqual(reply.text.count, 20_000)
        XCTAssertEqual(emitted.value, reply.text)
    }

    func testStreamReplyCancellationAndWallClockTimeout() async throws {
        StubURLProtocol.streamingHandler = { _ in
            StubStreamResponse(status: 200, chunks: [Data("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"late\"},\"finish_reason\":\"stop\"}]}\n\n".utf8)], delays: [0.2])
        }
        await assertStreamError(.timeout, client: makeClient(timeout: 0.02), snapshot: try snapshot()) { _ in }

        let task = Task {
            try await makeClient(timeout: 5).streamReply(
                to: [ChatMessage(role: "user", content: "hi")], using: try snapshot(), onDelta: { _ in }
            )
        }
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("Expected cancellation")
        } catch {
            XCTAssertEqual(error as? ModelError, .cancelled)
        }
        try? await Task.sleep(nanoseconds: 250_000_000)
    }

    private func makeClient(
        timeout: TimeInterval = 60,
        maximumResponseBytes: Int = 2_000_000
    ) -> URLSessionModelClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSessionModelClient(
            configuration: configuration,
            timeout: timeout,
            maximumResponseBytes: maximumResponseBytes
        )
    }

    private func snapshot() throws -> RequestSnapshot {
        RequestSnapshot(
            config: try ConnectionConfig.validated(baseURL: "https://example.com/v1", model: "model"),
            apiKey: "key"
        )
    }

    private func assertReplyError(
        _ expected: ModelError,
        client: URLSessionModelClient,
        snapshot: RequestSnapshot,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await client.reply(to: [ChatMessage(role: "user", content: "hi")], using: snapshot)
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? ModelError, expected, file: file, line: line)
        }
    }

    private func assertStreamError(
        _ expected: ModelError,
        client: URLSessionModelClient,
        snapshot: RequestSnapshot,
        onDelta: @escaping @Sendable (String) async -> Void,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await client.streamReply(
                to: [ChatMessage(role: "user", content: "hi")], using: snapshot, onDelta: onDelta
            )
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? ModelError, expected, file: file, line: line)
        }
    }
}

private struct StubResponse {
    let status: Int
    var headers: [String: String] = [:]
    let body: Data

    static func jsonReply(text: String) -> StubResponse {
        let body = try! JSONSerialization.data(withJSONObject: [
            "choices": [[
                "message": ["role": "assistant", "content": text],
                "finish_reason": "stop"
            ]]
        ])
        return StubResponse(status: 200, headers: ["Content-Type": "application/json"], body: body)
    }
}

private struct StubStreamResponse {
    let status: Int
    var headers: [String: String] = ["Content-Type": "text/event-stream"]
    let chunks: [Data]
    var delays: [TimeInterval] = []
}

private extension Data {
    static func jsonReplyData(text: String) -> Data {
        try! JSONSerialization.data(withJSONObject: [
            "choices": [["message": ["role": "assistant", "content": text], "finish_reason": "stop"]]
        ])
    }
}

private func requestBody(from request: URLRequest) throws -> Data {
    if let body = request.httpBody {
        return body
    }
    guard let stream = request.httpBodyStream else {
        return Data()
    }

    stream.open()
    defer { stream.close() }
    var body = Data()
    var buffer = [UInt8](repeating: 0, count: 4_096)
    while true {
        let count = stream.read(&buffer, maxLength: buffer.count)
        if count < 0 {
            throw stream.streamError ?? URLError(.cannotDecodeRawData)
        }
        if count == 0 { break }
        body.append(buffer, count: count)
    }
    return body
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: (@Sendable (URLRequest) throws -> StubResponse)?
    static var streamingHandler: (@Sendable (URLRequest) throws -> StubStreamResponse)?
    static var requestObserver: (@Sendable (URLRequest) -> Void)?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        requestObserver?(request)
        return request
    }

    override func startLoading() {
        if let streamingHandler = Self.streamingHandler {
            do {
                let result = try streamingHandler(request)
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: result.status,
                    httpVersion: "HTTP/1.1", headerFields: result.headers
                )!
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                for (index, chunk) in result.chunks.enumerated() {
                    if index < result.delays.count { Thread.sleep(forTimeInterval: result.delays[index]) }
                    client?.urlProtocol(self, didLoad: chunk)
                }
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
            return
        }
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let result = try handler(request)
            let response = HTTPURLResponse(
                url: request.url!, statusCode: result.status,
                httpVersion: "HTTP/1.1", headerFields: result.headers
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: result.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private final class LockedBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value

    init(_ value: Value) { stored = value }

    var value: Value {
        lock.lock()
        defer { lock.unlock() }
        return stored
    }

    func withValue(_ body: (inout Value) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        body(&stored)
    }
}
