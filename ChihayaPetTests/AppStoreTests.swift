import XCTest
@testable import ChihayaPet

@MainActor
final class MemoryCredentials: CredentialStore {
    var values: [String: String] = [:]
    var failWrites = false
    func read(service: String) throws -> String? { values[service] }
    func save(_ key: String, service: String) throws { if failWrites { throw ModelError.authentication }; values[service] = key }
    func delete(service: String) throws { if failWrites { throw ModelError.authentication }; values[service] = nil }
}
@MainActor
final class MemoryPreferences: PreferencesStore {
    var value = SavedSettings(baseURL: "https://example.com/v1", model: "test", prompt: "角色")
    var failWrites = false
    func load() -> SavedSettings { value }
    func save(_ value: SavedSettings) throws {
        if failWrites { throw PreferencesError.writeFailed }
        self.value = value
    }
}

@MainActor
final class AppStoreTests: XCTestCase {
    func waitFor(_ client: ControlledClient, count: Int) async {
        for _ in 0..<1000 { if await client.count() == count { return }; await Task.yield() }
        XCTFail("No request")
    }
    func settle() async { for _ in 0..<50 { await Task.yield() } }
    func make(_ client: ControlledClient) -> (AppStore, MemoryCredentials, MemoryPreferences) {
        let keys = MemoryCredentials(); keys.values["https://example.com/v1"] = "fixture"
        let prefs = MemoryPreferences()
        return (AppStore(client: client, credentials: keys, preferences: prefs), keys, prefs)
    }
    func testMissingConfigurationRoutesFromPersonaToServiceSettings() {
        let client = ControlledClient(); let (store, keys, _) = make(client)
        keys.values = [:]
        store.settingsTab = 1
        var opened = false
        store.onNeedsSettings = { opened = true }
        store.input = "你好"
        store.send()
        XCTAssertTrue(opened)
        XCTAssertEqual(store.settingsTab, 0)
        XCTAssertFalse(store.isBusy)
    }
    func testConnectionUsesUnsavedDraftWithoutPersonaOrConversation() async throws {
        let client = ControlledClient(); let (store, _, prefs) = make(client)
        store.beginSettings()
        store.setDraftAddress("https://draft.example/api")
        store.setDraftModel("draft-model")
        store.setDraftKey("draft-key")
        store.testConnection()
        await waitFor(client, count: 1)
        let snapshots = await client.snapshots
        let messages = await client.received
        XCTAssertEqual(snapshots.first?.config.baseURL, "https://draft.example/api")
        XCTAssertEqual(snapshots.first?.config.model, "draft-model")
        XCTAssertEqual(snapshots.first?.apiKey, "draft-key")
        XCTAssertEqual(messages.first, [ChatMessage(role: "user", content: "请回复：连接成功")])
        XCTAssertEqual(prefs.value.baseURL, "https://example.com/v1")
        await client.succeed(0, "连接正常"); await settle()
        XCTAssertTrue(store.history.turns.isEmpty)
    }
    func testPromptRestoreInvalidatesPendingRequestAndPersistsDefaultOnly() async {
        let client = ControlledClient(); let (store, keys, prefs) = make(client)
        store.input = "你好"; store.send(); await waitFor(client, count: 1)
        store.savePrompt(restoringDefault: true)
        await client.succeed(0, "旧设定回复"); await settle()
        XCTAssertEqual(prefs.value.prompt, SavedSettings.defaultPrompt)
        XCTAssertEqual(keys.values["https://example.com/v1"], "fixture")
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertNil(store.bubble)
        XCTAssertNil(store.pendingInput)
    }
    func testSavingPromptShowsSuccessAlert() {
        let (store, _, prefs) = make(ControlledClient())
        store.beginSettings()
        store.draftPrompt = "新的角色设定"
        store.savePrompt()
        XCTAssertEqual(prefs.value.prompt, "新的角色设定")
        XCTAssertEqual(store.promptSaveAlert, PromptSaveAlert.success)
    }
    func testFailedPromptSaveShowsFailureAlertAndPreservesActiveState() async {
        let client = ControlledClient(); let (store, _, prefs) = make(client)
        store.input = "问题"; store.send(); await waitFor(client, count: 1)
        await client.succeed(0, "原会话回复"); await settle()
        let oldPrompt = store.settings.prompt
        store.beginSettings()
        store.draftPrompt = "无法保存的新设定"
        prefs.failWrites = true
        store.savePrompt()
        XCTAssertEqual(store.settings.prompt, oldPrompt)
        XCTAssertEqual(prefs.value.prompt, oldPrompt)
        XCTAssertEqual(store.history.turns.count, 1)
        XCTAssertEqual(store.bubble?.text, "原会话回复")
        XCTAssertEqual(store.promptSaveAlert, PromptSaveAlert.failure(PreferencesError.writeFailed.localizedDescription))
    }
    func testDeletingCurrentKeyInvalidatesInFlightConnectionTest() async {
        let client = ControlledClient(); let (store, keys, _) = make(client)
        store.beginSettings(); store.testConnection(); await waitFor(client, count: 1)
        store.deleteCurrentKey()
        await client.succeed(0, "迟到成功"); await settle()
        XCTAssertNil(keys.values["https://example.com/v1"])
        XCTAssertTrue(store.draftKey.isEmpty)
        XCTAssertNil(store.testStatus)
        XCTAssertFalse(store.isBusy)
    }
    func testFailureRetryDoesNotDuplicateHistoryAndPreservesNewEditing() async {
        let client = ControlledClient(); let (store, _, _) = make(client)
        store.input = "你好"; store.send()
        await waitFor(client, count: 1)
        store.input = "下一条草稿"
        await client.fail(0); await settle()
        XCTAssertEqual(store.pendingInput, "你好")
        XCTAssertEqual(store.input, "下一条草稿")
        XCTAssertTrue(store.history.turns.isEmpty)
        store.retry(); await waitFor(client, count: 2)
        await client.succeed(1, "你好呀"); await settle()
        XCTAssertEqual(store.history.turns.count, 1)
        XCTAssertNil(store.pendingInput)
        XCTAssertEqual(store.input, "下一条草稿")
    }
    func testFailedSaveInvalidatesResultButKeepsSavedConfiguration() async {
        let client = ControlledClient(); let (store, keys, prefs) = make(client)
        store.input = "问"; store.send(); await waitFor(client, count: 1)
        store.beginSettings(); store.setDraftModel("new-model"); keys.failWrites = true
        store.saveConnection()
        XCTAssertEqual(store.settings.model, "test")
        XCTAssertEqual(prefs.value.model, "test")
        XCTAssertNotNil(store.settingsError)
        await client.succeed(0, "旧回复"); await settle()
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertNil(store.bubble)
    }
    func testChangingServiceNeverReusesOldKey() {
        let (store, _, _) = make(ControlledClient())
        store.beginSettings()
        XCTAssertEqual(store.draftKey, "fixture")
        store.setDraftAddress("https://other.example/v1")
        XCTAssertTrue(store.draftKey.isEmpty)
    }
    func testTestConnectionDoesNotChangeRetryInputOrBubble() async {
        let client = ControlledClient(); let (store, _, _) = make(client)
        store.input = "问"; store.send(); await waitFor(client, count: 1)
        await client.fail(0); await settle()
        store.beginSettings(); store.testConnection(); await waitFor(client, count: 2)
        await client.succeed(1, "连通"); await settle()
        XCTAssertEqual(store.pendingInput, "问")
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertNil(store.bubble)
        XCTAssertNotNil(store.testStatus)
    }
    func testClearDropsLateReplyAndDoesNotPersistConversation() async {
        let client = ControlledClient(); let (store, _, prefs) = make(client)
        let saved = prefs.value
        store.input = "问"; store.send(); await waitFor(client, count: 1)
        store.clearConversation()
        await client.succeed(0, "迟到"); await settle()
        XCTAssertNil(store.pendingInput); XCTAssertNil(store.bubble)
        XCTAssertTrue(store.history.turns.isEmpty)
        XCTAssertEqual(prefs.value, saved)
    }
}
