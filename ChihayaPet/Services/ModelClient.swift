import Foundation

struct ConnectionConfig: Codable, Equatable, Sendable {
    let baseURL: String
    let model: String

    init(baseURL: String, model: String) {
        self.baseURL = baseURL
        self.model = model
    }

    static func validated(baseURL: String, model: String) throws -> ConnectionConfig {
        let normalizedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedModel.isEmpty else { throw ModelError.missingModel }

        guard let normalizedURL = Self.normalizedBaseURL(baseURL) else {
            throw ModelError.invalidURL
        }
        return ConnectionConfig(baseURL: normalizedURL, model: normalizedModel)
    }

    var endpoint: URL {
        // Values entering networking are validated again by URLSessionModelClient.
        URL(string: baseURL + "/chat/completions")!
    }

    private static func normalizedBaseURL(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              components.scheme?.lowercased() == "https",
              let host = components.host,
              !host.isEmpty,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil else {
            return nil
        }

        components.scheme = "https"
        components.host = host.lowercased()
        while components.percentEncodedPath.count > 1 && components.percentEncodedPath.hasSuffix("/") {
            components.percentEncodedPath.removeLast()
        }
        if components.percentEncodedPath == "/" {
            components.percentEncodedPath = ""
        }
        guard let normalized = components.string,
              let url = URL(string: normalized),
              url.host != nil else {
            return nil
        }
        return normalized
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let baseURL = try container.decode(String.self, forKey: .baseURL)
        let model = try container.decode(String.self, forKey: .model)
        do {
            self = try Self.validated(baseURL: baseURL, model: model)
        } catch {
            throw DecodingError.dataCorruptedError(
                forKey: .baseURL,
                in: container,
                debugDescription: "Invalid model connection configuration"
            )
        }
    }
}

struct ChatMessage: Codable, Equatable, Sendable {
    let role: String
    let content: String
}

struct ModelReply: Equatable, Sendable {
    let text: String
    let truncated: Bool
}

struct RequestSnapshot: Sendable {
    let config: ConnectionConfig
    let apiKey: String
}

protocol ModelClient: Sendable {
    func reply(to messages: [ChatMessage], using snapshot: RequestSnapshot) async throws -> ModelReply
    func streamReply(
        to messages: [ChatMessage],
        using snapshot: RequestSnapshot,
        onDelta: @escaping @Sendable (String) async -> Void
    ) async throws -> ModelReply
}

extension ModelClient {
    func streamReply(
        to messages: [ChatMessage],
        using snapshot: RequestSnapshot,
        onDelta: @escaping @Sendable (String) async -> Void
    ) async throws -> ModelReply {
        let result = try await reply(to: messages, using: snapshot)
        await onDelta(result.text)
        return result
    }
}

enum ModelError: Error, LocalizedError, Equatable {
    case invalidURL
    case missingModel
    case missingKey
    case authentication
    case endpoint
    case rateLimited
    case server
    case connection
    case timeout
    case invalidResponse
    case responseTooLarge
    case cancelled
    case redirect

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "请填写有效的 HTTPS 基础地址，且不要包含用户信息、查询参数或片段。"
        case .missingModel:
            return "请填写模型名称。"
        case .missingKey:
            return "请填写 API Key。"
        case .authentication:
            return "鉴权失败，请检查 API Key、账户权限或账户状态。"
        case .endpoint:
            return "请求端点不可用，请检查基础地址和模型名称。"
        case .rateLimited:
            return "额度或请求频率受限，请稍后手动重试。"
        case .server:
            return "模型服务暂时不可用，请稍后重试。"
        case .connection:
            return "连接失败，请检查网络、服务地址和 TLS 配置。"
        case .timeout:
            return "请求超时，请稍后手动重试。"
        case .invalidResponse:
            return "服务未返回可用的文本回复，请检查接口兼容性。"
        case .responseTooLarge:
            return "回复超过本地允许的大小。"
        case .cancelled:
            return "请求已取消。"
        case .redirect:
            return "服务返回了重定向，请填写重定向后的最终 HTTPS 地址。"
        }
    }
}

final class URLSessionModelClient: @unchecked Sendable, ModelClient {
    static let defaultTimeout: TimeInterval = 60
    static let defaultMaximumResponseBytes = 2_000_000
    static let maximumReplyCharacters = 20_000

    private let session: URLSession
    private let timeout: TimeInterval
    private let maximumResponseBytes: Int
    private let redirectDelegate = RedirectRejectingDelegate()

    init(
        configuration: URLSessionConfiguration = .ephemeral,
        timeout: TimeInterval = URLSessionModelClient.defaultTimeout,
        maximumResponseBytes: Int = URLSessionModelClient.defaultMaximumResponseBytes
    ) {
        let safeConfiguration = (configuration.copy() as? URLSessionConfiguration) ?? configuration
        safeConfiguration.urlCache = nil
        safeConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData
        safeConfiguration.httpCookieStorage = nil
        safeConfiguration.httpShouldSetCookies = false
        safeConfiguration.timeoutIntervalForRequest = timeout
        safeConfiguration.timeoutIntervalForResource = timeout
        self.session = URLSession(configuration: safeConfiguration)
        self.timeout = max(0, timeout)
        self.maximumResponseBytes = max(1, maximumResponseBytes)
    }

    func reply(to messages: [ChatMessage], using snapshot: RequestSnapshot) async throws -> ModelReply {
        let request = try makeRequest(messages: messages, snapshot: snapshot, stream: false)
        return try await raceRequest { [self] in
            try await perform(request)
        }
    }

    func streamReply(
        to messages: [ChatMessage],
        using snapshot: RequestSnapshot,
        onDelta: @escaping @Sendable (String) async -> Void
    ) async throws -> ModelReply {
        let request = try makeRequest(messages: messages, snapshot: snapshot, stream: true)
        return try await raceRequest { [self] in
            try await performStream(request, onDelta: onDelta)
        }
    }

    private func makeRequest(
        messages: [ChatMessage],
        snapshot: RequestSnapshot,
        stream: Bool
    ) throws -> URLRequest {
        let config = try ConnectionConfig.validated(
            baseURL: snapshot.config.baseURL,
            model: snapshot.config.model
        )
        let key = snapshot.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw ModelError.missingKey }

        var request = URLRequest(url: config.endpoint)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(RequestBody(model: config.model, messages: messages, stream: stream))
        return request
    }

    private func raceRequest(
        _ operation: @escaping @Sendable () async throws -> ModelReply
    ) async throws -> ModelReply {
        let race = ReplyRace()
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                race.install(continuation)
                let requestTask = Task {
                    do {
                        race.resolve(.success(try await operation()))
                    } catch {
                        race.resolve(.failure(Self.classify(error)))
                    }
                }
                let timeoutTask = Task {
                    do {
                        let nanos = UInt64(min(timeout, 18_446_744_073) * 1_000_000_000)
                        try await Task.sleep(nanoseconds: nanos)
                        race.resolve(.failure(ModelError.timeout))
                    } catch {
                        // Cancellation means the request won the race.
                    }
                }
                race.attach(requestTask: requestTask, timeoutTask: timeoutTask)
            }
        }, onCancel: {
            race.resolve(.failure(ModelError.cancelled))
        })
    }

    private func performStream(
        _ request: URLRequest,
        onDelta: @escaping @Sendable (String) async -> Void
    ) async throws -> ModelReply {
        let (bytes, response) = try await session.bytes(for: request, delegate: redirectDelegate)
        let httpResponse = try validate(response)
        if httpResponse.expectedContentLength > Int64(maximumResponseBytes) {
            throw ModelError.responseTooLarge
        }

        var raw = Data()
        if httpResponse.expectedContentLength > 0 {
            raw.reserveCapacity(min(Int(httpResponse.expectedContentLength), maximumResponseBytes))
        }
        var parser = SSEParser()
        var text = ""
        var sawTerminalEvent = false
        var truncated = false

        for try await byte in bytes {
            guard raw.count < maximumResponseBytes else {
                throw ModelError.responseTooLarge
            }
            raw.append(byte)
            guard let payload = try parser.consume(byte) else { continue }

            if payload == Data("[DONE]".utf8) {
                sawTerminalEvent = true
                break
            }
            let event: StreamResponseBody
            do {
                event = try JSONDecoder().decode(StreamResponseBody.self, from: payload)
            } catch {
                throw ModelError.invalidResponse
            }
            guard let choice = event.choices.first(where: { $0.index == 0 }) else { continue }
            if let content = choice.delta?.content, !content.isEmpty {
                let combined = text + content
                if combined.count > Self.maximumReplyCharacters {
                    let bounded = String(combined.prefix(Self.maximumReplyCharacters))
                    let acceptedBytes = bounded.utf8.dropFirst(text.utf8.count)
                    let allowed = String(decoding: acceptedBytes, as: UTF8.self)
                    if !allowed.isEmpty {
                        await onDelta(allowed)
                    }
                    text = bounded
                    throw ModelError.responseTooLarge
                }
                text = combined
                await onDelta(content)
            }
            if choice.finishReason == "stop" || choice.finishReason == "length" {
                sawTerminalEvent = true
                truncated = choice.finishReason == "length"
                break
            }
        }

        if !parser.sawDataField {
            let fallback = try decodeReply(from: raw)
            await onDelta(fallback.text)
            return fallback
        }
        guard sawTerminalEvent else { throw ModelError.invalidResponse }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ModelError.invalidResponse
        }
        return ModelReply(text: text, truncated: truncated)
    }

    private func perform(_ request: URLRequest) async throws -> ModelReply {
        let (bytes, urlResponse) = try await session.bytes(for: request, delegate: redirectDelegate)
        let response = try validate(urlResponse)

        if response.expectedContentLength > Int64(maximumResponseBytes) {
            throw ModelError.responseTooLarge
        }

        var data = Data()
        if response.expectedContentLength > 0 {
            data.reserveCapacity(min(Int(response.expectedContentLength), maximumResponseBytes))
        }
        for try await byte in bytes {
            guard data.count < maximumResponseBytes else {
                throw ModelError.responseTooLarge
            }
            data.append(byte)
        }
        return try decodeReply(from: data)
    }

    private func validate(_ response: URLResponse) throws -> HTTPURLResponse {
        guard let response = response as? HTTPURLResponse else { throw ModelError.invalidResponse }
        switch response.statusCode {
        case 200...299:
            break
        case 300...399:
            throw ModelError.redirect
        case 401, 403:
            throw ModelError.authentication
        case 404:
            throw ModelError.endpoint
        case 429:
            throw ModelError.rateLimited
        case 500...599:
            throw ModelError.server
        default:
            throw ModelError.endpoint
        }
        return response
    }

    private func decodeReply(from data: Data) throws -> ModelReply {
        let decoded: ResponseBody
        do {
            decoded = try JSONDecoder().decode(ResponseBody.self, from: data)
        } catch {
            throw ModelError.invalidResponse
        }
        guard let choice = decoded.choices.first else {
            throw ModelError.invalidResponse
        }
        let text = choice.message.content
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ModelError.invalidResponse
        }
        guard text.count <= Self.maximumReplyCharacters else {
            throw ModelError.responseTooLarge
        }
        return ModelReply(text: text, truncated: choice.finishReason == "length")
    }

    private static func classify(_ error: Error) -> ModelError {
        if let modelError = error as? ModelError {
            return modelError
        }
        if error is CancellationError {
            return .cancelled
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                return .cancelled
            case .timedOut:
                return .timeout
            default:
                return .connection
            }
        }
        return .connection
    }
}

private struct SSEParser {
    private var line = Data()
    private var dataLines: [Data] = []
    private(set) var sawDataField = false

    mutating func consume(_ byte: UInt8) throws -> Data? {
        guard byte == 0x0A else {
            line.append(byte)
            return nil
        }
        if line.last == 0x0D { line.removeLast() }
        let completedLine = line
        line.removeAll(keepingCapacity: true)

        if completedLine.isEmpty {
            guard !dataLines.isEmpty else { return nil }
            let payload = dataLines.dropFirst().reduce(into: dataLines[0]) { result, next in
                result.append(0x0A)
                result.append(next)
            }
            dataLines.removeAll(keepingCapacity: true)
            return payload
        }
        if completedLine.first == 0x3A { return nil }
        guard completedLine.starts(with: Data("data:".utf8)) else { return nil }
        sawDataField = true
        var value = completedLine.dropFirst(5)
        if value.first == 0x20 { value = value.dropFirst() }
        dataLines.append(Data(value))
        return nil
    }
}

private struct RequestBody: Encodable {
    let model: String
    let messages: [ChatMessage]
    let stream: Bool
}

private struct ResponseBody: Decodable {
    let choices: [Choice]

    struct Choice: Decodable {
        let message: Message
        let finishReason: String?

        enum CodingKeys: String, CodingKey {
            case message
            case finishReason = "finish_reason"
        }
    }

    struct Message: Decodable {
        let content: String
    }
}

private struct StreamResponseBody: Decodable {
    let choices: [Choice]

    struct Choice: Decodable {
        let index: Int
        let delta: Delta?
        let finishReason: String?

        enum CodingKeys: String, CodingKey {
            case index, delta
            case finishReason = "finish_reason"
        }
    }

    struct Delta: Decodable {
        let content: String?
    }
}

private final class RedirectRejectingDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

private final class ReplyRace: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<ModelReply, Error>?
    private var pendingResult: Result<ModelReply, Error>?
    private var requestTask: Task<Void, Never>?
    private var timeoutTask: Task<Void, Never>?
    private var completed = false

    func install(_ continuation: CheckedContinuation<ModelReply, Error>) {
        lock.lock()
        if let result = pendingResult {
            pendingResult = nil
            lock.unlock()
            continuation.resume(with: result)
        } else {
            self.continuation = continuation
            lock.unlock()
        }
    }

    func attach(requestTask: Task<Void, Never>, timeoutTask: Task<Void, Never>) {
        lock.lock()
        if completed {
            lock.unlock()
            requestTask.cancel()
            timeoutTask.cancel()
        } else {
            self.requestTask = requestTask
            self.timeoutTask = timeoutTask
            lock.unlock()
        }
    }

    func resolve(_ result: Result<ModelReply, Error>) {
        lock.lock()
        guard !completed else {
            lock.unlock()
            return
        }
        completed = true
        let continuation = self.continuation
        if continuation == nil {
            pendingResult = result
        }
        self.continuation = nil
        let requestTask = self.requestTask
        let timeoutTask = self.timeoutTask
        self.requestTask = nil
        self.timeoutTask = nil
        lock.unlock()

        continuation?.resume(with: result)
        requestTask?.cancel()
        timeoutTask?.cancel()
    }
}
