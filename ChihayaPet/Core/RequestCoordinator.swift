import Foundation
import Combine

enum RequestKind { case chat, test }

@MainActor
final class RequestCoordinator: ObservableObject {
    @Published private(set) var isBusy = false
    private(set) var activeKind: RequestKind?
    private let client: any ModelClient
    private var task: Task<Void, Never>?
    private var activeID: UUID?
    private var configurationGeneration: UInt64 = 0
    private var sessionGeneration: UInt64 = 0
    private var draftGeneration: UInt64 = 0

    init(client: any ModelClient) { self.client = client }
    @discardableResult
    func start(kind: RequestKind, snapshot: RequestSnapshot, messages: [ChatMessage], onDelta: @escaping @MainActor (String) -> Void = { _ in }, completion: @escaping (Result<ModelReply, Error>) -> Void) -> Bool {
        guard activeID == nil else { return false }
        let id = UUID()
        let configuration = configurationGeneration
        let session = sessionGeneration
        let draft = draftGeneration
        activeID = id; activeKind = kind; isBusy = true
        let client = client
        task = Task { [weak self] in
            let result: Result<ModelReply, Error>
            do {
                if kind == .chat {
                    result = .success(try await client.streamReply(to: messages, using: snapshot) { [weak self] delta in
                        await self?.receive(delta, id: id, configuration: configuration, session: session, onDelta: onDelta)
                    })
                } else { result = .success(try await client.reply(to: messages, using: snapshot)) }
            }
            catch { result = .failure(error) }
            guard let self, self.activeID == id,
                  self.configurationGeneration == configuration,
                  (kind == .chat ? self.sessionGeneration == session : self.draftGeneration == draft) else { return }
            self.activeID = nil; self.activeKind = nil; self.task = nil; self.isBusy = false
            completion(result)
        }
        return true
    }
    private func receive(_ text: String, id: UUID, configuration: UInt64, session: UInt64, onDelta: @MainActor (String) -> Void) {
        guard activeID == id, configurationGeneration == configuration, sessionGeneration == session else { return }
        onDelta(text)
    }
    func cancel() {
        // Invalidate before cancellation; an old completion must never release a new slot.
        activeID = nil; activeKind = nil
        let old = task; task = nil; isBusy = false
        old?.cancel()
    }
    func draftChanged() {
        draftGeneration &+= 1
        if activeKind == .test { cancel() }
    }
    func sessionCleared() { sessionGeneration &+= 1; draftGeneration &+= 1; cancel() }
    func configurationChanged() { configurationGeneration &+= 1; sessionCleared() }
}
