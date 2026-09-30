import XCTest
@testable import ChihayaPet

@MainActor
final class ProjectStorageTests: XCTestCase {
    func testServiceSaveAndRestartUseOneFileAndKeepPersonaInPreferences() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "ProjectStorageTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { try? FileManager.default.removeItem(at: root); defaults.removePersistentDomain(forName: suite) }
        let keys = FileCredentialStore(directory: root)
        let preferences = LocalPreferencesStore(defaults: defaults, directory: root)
        let store = AppStore(client: ControlledClient(), credentials: keys, preferences: preferences)
        store.beginSettings()
        store.setDraftAddress("https://EXAMPLE.com/v1/")
        store.setDraftModel("new-model")
        store.setDraftKey("fixture-secret")
        store.saveConnection()
        XCTAssertNil(store.settingsError)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("config.json"))) as? [String: Any])
        XCTAssertEqual(json["baseURL"] as? String, "https://example.com/v1")
        XCTAssertEqual(json["model"] as? String, "new-model")
        XCTAssertEqual(json["apiKeys"] as? [String: String], ["https://example.com/v1": "fixture-secret"])
        XCTAssertNil(defaults.object(forKey: "service.settings"))
        store.draftPrompt = "保留角色设定"
        store.savePrompt()
        let restarted = AppStore(client: ControlledClient(), credentials: FileCredentialStore(directory: root), preferences: LocalPreferencesStore(defaults: defaults, directory: root))
        restarted.beginSettings()
        XCTAssertEqual(restarted.settings.baseURL, "https://example.com/v1")
        XCTAssertEqual(restarted.settings.model, "new-model")
        XCTAssertEqual(restarted.draftKey, "fixture-secret")
        XCTAssertEqual(restarted.settings.prompt, "保留角色设定")
        restarted.deleteCurrentKey()
        XCTAssertNil(try keys.read(service: "https://example.com/v1"))
        XCTAssertEqual(preferences.load().model, "new-model")
    }

    func testFailedFileSaveKeepsPreviousServiceAndReportsCorruptionOnReopen() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "ProjectStorageTests.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { try? FileManager.default.removeItem(at: root); defaults.removePersistentDomain(forName: suite) }
        let keys = FileCredentialStore(directory: root)
        let original = try ConnectionConfig.validated(baseURL: "https://example.com/v1", model: "original")
        try keys.saveConnection("original-key", config: original)
        let store = AppStore(client: ControlledClient(), credentials: keys, preferences: LocalPreferencesStore(defaults: defaults, directory: root))
        store.beginSettings()
        store.setDraftModel("new-model")
        let file = root.appendingPathComponent("config.json")
        let corrupt = Data("invalid-json".utf8)
        try corrupt.write(to: file)
        store.saveConnection()
        XCTAssertEqual(store.settings.model, "original")
        XCTAssertNotNil(store.settingsError)
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
        let restarted = AppStore(client: ControlledClient(), credentials: keys, preferences: LocalPreferencesStore(defaults: defaults, directory: root))
        restarted.beginSettings()
        XCTAssertNotNil(restarted.settingsError)
    }

    func testRootDiscoverySupportsNestedBuildAndMovedPortableFolder() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root.appendingPathComponent("ChihayaPet.xcodeproj"), withIntermediateDirectories: true)
        let builtApp = root.appendingPathComponent("build/DerivedData/Build/Products/Release/ChihayaPet.app")
        XCTAssertEqual(ProjectPaths.root(for: builtApp).path, root.path)
        let portable = root.appendingPathComponent("build/portable")
        try FileManager.default.createDirectory(at: portable, withIntermediateDirectories: true)
        try Data().write(to: portable.appendingPathComponent(".chihaya-root"))
        XCTAssertEqual(ProjectPaths.root(for: portable.appendingPathComponent("ChihayaPet.app")).path, portable.path)
        let relocated = root.appendingPathComponent("relocated")
        try FileManager.default.moveItem(at: portable, to: relocated)
        XCTAssertEqual(ProjectPaths.root(for: relocated.appendingPathComponent("ChihayaPet.app")).path, relocated.path)
    }

    func testDistributedAppUsesUserApplicationSupportInsteadOfAppParent() throws {
        let expected = try FileManager.default.url(for: .applicationSupportDirectory,
                                                  in: .userDomainMask,
                                                  appropriateFor: nil, create: false)
            .appendingPathComponent("ChihayaPet", isDirectory: true)
        for path in ["/Applications/ChihayaPet.app",
                     "/Volumes/ChihayaPet/ChihayaPet.app",
                     "/private/tmp/\(UUID().uuidString)/ChihayaPet.app"] {
            XCTAssertEqual(ProjectPaths.root(for: URL(fileURLWithPath: path)).path, expected.path)
        }
    }
}
