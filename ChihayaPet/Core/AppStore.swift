import Foundation
import Combine

enum PromptSaveAlert: Identifiable, Equatable {
    case success
    case failure(String)
    var id: String {
        switch self { case .success: return "success"; case .failure: return "failure" }
    }
    var title: String {
        switch self { case .success: return "保存成功"; case .failure: return "保存失败" }
    }
    var message: String {
        switch self {
        case .success: return "角色设定已保存，会话已清空。"
        case .failure(let message): return message
        }
    }
}

@MainActor
final class AppStore: ObservableObject {
    @Published private(set) var settings: SavedSettings
    @Published private(set) var history = ConversationHistory()
    @Published var input = ""
    @Published private(set) var pendingInput: String?
    @Published private(set) var chatError: String?
    @Published private(set) var streamingText = ""
    @Published private(set) var displayedChatText = ""
    @Published private(set) var displayedChatTurnID: UUID?
    @Published private(set) var chatReplyFocus: UUID?
    @Published private(set) var chatReplyFocusRequest = UUID()
    func focusChatReply(_ id: UUID) { chatReplyFocus = id; chatReplyFocusRequest = UUID() }
    @Published var bubble: ModelReply?
    @Published private(set) var testStatus: String?
    @Published private(set) var settingsError: String?
    @Published private(set) var draftAddress = ""
    @Published private(set) var draftModel = ""
    @Published private(set) var draftKey = ""
    @Published var draftPrompt = ""
    @Published var settingsTab = 0
    @Published private(set) var connectionFocusRequest = UUID()
    @Published private(set) var settingsNotice: String?
    @Published var promptSaveAlert: PromptSaveAlert?
    let coordinator: RequestCoordinator
    var onNeedsSettings: (() -> Void)?
    var onRequestCancelled: ((RequestKind) -> Void)?
    private let credentials: any CredentialStore
    private let preferences: any PreferencesStore
    private var changes: AnyCancellable?
    private var receivedText = ""
    private var refreshTask: Task<Void, Never>?
    private var displayTask: Task<Void, Never>?
    private var displayTarget = ""
    init(client: any ModelClient, credentials: any CredentialStore, preferences: any PreferencesStore, greetingIndex: (Int) -> Int = { Int.random(in: 0..<$0) }) {
        let index = greetingIndex(Self.greetings.count)
        greeting = Self.greetings[Self.greetings.indices.contains(index) ? index : 0]
        self.credentials = credentials; self.preferences = preferences
        settings = preferences.load(); coordinator = RequestCoordinator(client: client)
        changes = coordinator.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    }
    var isBusy: Bool { coordinator.isBusy }
    let greeting: String
    private static let greetings = [
        "你好，我是妃宫千早。今天过得怎么样？",
        "来了呀。先坐一会儿吧，今天想聊些什么？",
        "忙到现在，辛苦了。要不要稍微歇一歇？",
        "今天也请多关照。有什么想说的，我听着。",
        "一直这样看着我……是有什么话想说吗？"
    ]
    func send() { sendText(input, clearEditor: true) }
    func retry() { if let pendingInput { sendText(pendingInput, clearEditor: false) } }
    private func sendText(_ text: String, clearEditor: Bool) {
        guard !isBusy else { return }
        do {
            try ConversationHistory.validateInput(text)
            let config = try ConnectionConfig.validated(baseURL: settings.baseURL, model: settings.model)
            guard let key = try credentials.read(service: config.baseURL), !key.isEmpty else { throw ModelError.missingKey }
            let messages = [ChatMessage(role: "system", content: settings.prompt)] + history.context.flatMap { [ChatMessage(role: "user", content: $0.user), ChatMessage(role: "assistant", content: $0.assistant)] } + [ChatMessage(role: "user", content: text)]
            let accepted = coordinator.start(kind: .chat, snapshot: RequestSnapshot(config: config, apiKey: key), messages: messages, onDelta: { [weak self] delta in
                guard let self else { return }
                self.receive(delta)
            }) { [weak self] result in
                guard let self else { return }
                switch result {
                case .success(let reply):
                    do {
                        try self.history.append(user: text, reply: reply)
                        self.displayedChatTurnID = self.history.turns.last?.id
                        self.presentChatText(reply.text)
                        self.clearProgress(); self.pendingInput = nil; self.chatError = nil; self.bubble = reply
                    } catch { self.chatError = error.localizedDescription }
                case .failure(let error): self.finishChatDisplay(); self.flushProgress(); self.chatError = error.localizedDescription
                }
            }
            if accepted { resetChatDisplay(); clearProgress(); pendingInput = text; chatError = nil; if clearEditor { input = "" } }
        } catch {
            chatError = error.localizedDescription
            if let error = error as? ModelError, [.invalidURL, .missingModel, .missingKey].contains(error) {
                settingsTab = 0; connectionFocusRequest = UUID(); onNeedsSettings?()
            }
        }
    }
    private func receive(_ delta: String) {
        receivedText = String((receivedText + delta).prefix(20_000))
        presentChatText(receivedText)
        if streamingText.isEmpty { streamingText = receivedText; return }
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 40_000_000) } catch { return }
            self?.flushProgress()
        }
    }
    // Network completion commits history immediately; visual playback may finish later.
    // Keeping its turn ID preserves the same displayed prefix across that transition.
    private func presentChatText(_ text: String) {
        displayTarget = text
        if displayedChatText.isEmpty { displayedChatText = String(text.prefix(1)) }
        guard displayTask == nil, displayedChatText != displayTarget else { return }
        displayTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 25_000_000) } catch { return }
                guard let self else { return }
                let remaining = self.displayTarget.count - self.displayedChatText.count
                let step = max(1, (remaining + 79) / 80)
                self.displayedChatText = String(self.displayTarget.prefix(self.displayedChatText.count + step))
                if self.displayedChatText == self.displayTarget {
                    self.displayTask = nil
                    return
                }
            }
        }
    }
    private func finishChatDisplay() {
        displayTask?.cancel(); displayTask = nil
        displayedChatText = displayTarget
    }
    private func resetChatDisplay() {
        displayTask?.cancel(); displayTask = nil
        displayTarget = ""; displayedChatText = ""; displayedChatTurnID = nil
    }
    private func flushProgress() {
        refreshTask?.cancel(); refreshTask = nil
        streamingText = receivedText
    }
    private func clearProgress() {
        refreshTask?.cancel(); refreshTask = nil
        receivedText = ""; streamingText = ""
    }
    func cancelRequest() {
        let kind = coordinator.activeKind
        coordinator.cancel()
        flushProgress()
        if kind == .chat { finishChatDisplay() }
        if let kind { onRequestCancelled?(kind) }
        if kind == .chat { chatError = "已取消，可手动重试。" }
        if kind == .test { testStatus = nil }
    }
    func clearConversation() {
        coordinator.sessionCleared(); resetConversation()
    }
    private func resetConversation() {
        chatReplyFocus = nil; resetChatDisplay(); clearProgress(); history.clear(); pendingInput = nil; chatError = nil; bubble = nil; input = ""; testStatus = nil
    }
    func beginSettings() {
        coordinator.draftChanged()
        draftAddress = settings.baseURL; draftModel = settings.model; draftPrompt = settings.prompt
        draftKey = ""; testStatus = nil; settingsError = preferences.loadError; settingsNotice = nil
        loadDraftKey()
    }
    func setDraftAddress(_ value: String) {
        guard draftAddress != value else { return }
        draftAddress = value; draftKey = ""; draftChanged(); loadDraftKey()
    }
    func setDraftModel(_ value: String) { guard draftModel != value else { return }; draftModel = value; draftChanged() }
    func setDraftKey(_ value: String) { guard draftKey != value else { return }; draftKey = value; draftChanged() }
    private func draftChanged() {
        coordinator.draftChanged(); testStatus = nil; settingsError = nil; settingsNotice = nil
    }
    private func loadDraftKey() {
        guard let config = try? ConnectionConfig.validated(baseURL: draftAddress, model: "credential-lookup") else { return }
        do { draftKey = try credentials.read(service: config.baseURL) ?? "" }
        catch { settingsError = error.localizedDescription }
    }
    func testConnection() {
        guard !isBusy else { return }
        do {
            let config = try ConnectionConfig.validated(baseURL: draftAddress, model: draftModel)
            guard !draftKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ModelError.missingKey }
            settingsError = nil; testStatus = nil
            _ = coordinator.start(kind: .test, snapshot: RequestSnapshot(config: config, apiKey: draftKey), messages: [ChatMessage(role: "user", content: "请回复：连接成功")]) { [weak self] result in
                switch result {
                case .success(let reply):
                    self?.testStatus = reply.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || reply.text.count > 20_000 ? "当前填写配置测试失败：未收到可用文本回复。" : "当前填写配置测试成功。"
                case .failure(let error): self?.testStatus = "当前填写配置测试失败：\(error.localizedDescription)"
                }
            }
        } catch { settingsError = error.localizedDescription }
    }
    func saveConnection() {
        do {
            let config = try ConnectionConfig.validated(baseURL: draftAddress, model: draftModel)
            guard !draftKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ModelError.missingKey }
            invalidateConfiguration()
            try credentials.saveConnection(draftKey, config: config)
            settings.baseURL = config.baseURL; settings.model = config.model
            draftAddress = config.baseURL; draftModel = config.model
            settingsError = nil; settingsNotice = "服务配置已保存，会话已清空。"
        } catch { settingsError = error.localizedDescription }
    }
    func savePrompt(restoringDefault: Bool = false) {
        let prompt = restoringDefault ? SavedSettings.defaultPrompt : draftPrompt
        var proposed = settings
        proposed.prompt = prompt
        do {
            try preferences.save(proposed)
            invalidateConfiguration()
            settings = proposed; draftPrompt = prompt
            settingsError = nil; settingsNotice = "角色设定已保存，会话已清空。"
            promptSaveAlert = .success
        } catch {
            settingsError = error.localizedDescription
            settingsNotice = nil
            promptSaveAlert = .failure(error.localizedDescription)
        }
    }
    func deleteCurrentKey() {
        do {
            let config = try ConnectionConfig.validated(baseURL: settings.baseURL, model: settings.model)
            invalidateConfiguration()
            try credentials.delete(service: config.baseURL)
            draftKey = ""; settingsError = nil; settingsNotice = "已删除当前已保存服务的密钥。"
        } catch { settingsError = error.localizedDescription }
    }
    private func invalidateConfiguration() {
        coordinator.configurationChanged(); resetConversation(); settingsNotice = nil
    }
    func shutdown() { coordinator.cancel(); resetConversation(); draftKey = "" }
}
