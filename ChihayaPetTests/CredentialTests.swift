import Foundation
import XCTest
@testable import ChihayaPet

@MainActor
final class CredentialTests: XCTestCase {
    func testLocalKeysPersistNormalizeAndIsolateServices() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = FileCredentialStore(directory: folder)
        XCTAssertNil(try store.read(service: "https://example.com/v1"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.path))
        try store.save("first-secret", service: "https://EXAMPLE.com/v1/")
        try store.save("second-secret", service: "https://other.example/v1")
        let restarted = FileCredentialStore(directory: folder)
        XCTAssertEqual(try restarted.read(service: "https://example.com/v1"), "first-secret")
        XCTAssertEqual(try restarted.read(service: "https://other.example/v1"), "second-secret")
        try restarted.save("replacement", service: "https://example.com/v1")
        XCTAssertEqual(try store.read(service: "https://example.com/v1"), "replacement")
        try restarted.delete(service: "https://example.com/v1/")
        XCTAssertNil(try store.read(service: "https://example.com/v1"))
        XCTAssertEqual(try store.read(service: "https://other.example/v1"), "second-secret")
        let path = folder.appendingPathComponent("config.json")
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: path.path)
        XCTAssertEqual((fileAttributes[.posixPermissions] as? NSNumber)?.intValue, 0o600)
        let contents = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: path)) as? [String: Any])
        XCTAssertEqual(contents["apiKeys"] as? [String: String], ["https://other.example/v1": "second-secret"])
    }
    func testInvalidServiceAndCorruptFileNeverOverwriteData() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = FileCredentialStore(directory: folder)
        XCTAssertThrowsError(try store.save("secret", service: "http://example.com"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.path))
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("config.json")
        let original = Data("not-json".utf8)
        try original.write(to: file)
        XCTAssertThrowsError(try store.read(service: "https://example.com"))
        XCTAssertThrowsError(try store.save("secret", service: "https://example.com"))
        XCTAssertThrowsError(try store.delete(service: "https://example.com"))
        XCTAssertEqual(try Data(contentsOf: file), original)
    }
    func testWriteFailureLeavesExistingFileUntouched() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let original = Data("ordinary-file".utf8)
        try original.write(to: folder)
        let store = FileCredentialStore(directory: folder)
        XCTAssertThrowsError(try store.save("secret", service: "https://example.com"))
        XCTAssertEqual(try Data(contentsOf: folder), original)
    }
}
