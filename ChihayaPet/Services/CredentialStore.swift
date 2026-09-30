import Foundation
import Darwin

@MainActor
protocol CredentialStore {
    func read(service: String) throws -> String?
    func save(_ key: String, service: String) throws
    func saveConnection(_ key: String, config: ConnectionConfig) throws
    func delete(service: String) throws
}

extension CredentialStore {
    func saveConnection(_ key: String, config: ConnectionConfig) throws {
        try save(key, service: config.baseURL)
    }
}

enum CredentialError: Error, LocalizedError, Equatable {
    case invalidService
    case invalidData
    case writeFailed

    var errorDescription: String? {
        switch self {
        case .invalidService: return "凭据服务地址无效，请填写有效的 HTTPS 基础地址。"
        case .invalidData: return "config.json 格式无效，未覆盖原文件。"
        case .writeFailed: return "无法保存 config.json，请检查数据文件夹的写入权限。"
        }
    }
}

struct ProjectConfiguration: Codable {
    var baseURL = ""
    var model = ""
    var apiKeys: [String: String] = [:]
}

/// One atomic document for the service, model and all saved service keys.
struct ProjectConfigFile {
    private let directory: URL
    private var fileURL: URL { directory.appendingPathComponent("config.json") }
    private let files = FileManager.default

    init(directory: URL = ProjectPaths.root) {
        self.directory = directory
    }

    func load() throws -> ProjectConfiguration {
        guard files.fileExists(atPath: fileURL.path) else { return ProjectConfiguration() }
        let data = try Data(contentsOf: fileURL)
        guard let values = try? JSONDecoder().decode(ProjectConfiguration.self, from: data) else {
            throw CredentialError.invalidData
        }
        return values
    }

    func persist(_ values: ProjectConfiguration) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(values)
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        let temporary = directory.appendingPathComponent(".config-\(UUID().uuidString).tmp")
        defer { try? files.removeItem(at: temporary) }
        guard files.createFile(atPath: temporary.path, contents: data, attributes: [.posixPermissions: 0o600]) else {
            throw CredentialError.writeFailed
        }
        guard rename(temporary.path, fileURL.path) == 0 else { throw CredentialError.writeFailed }
    }
}

@MainActor
final class FileCredentialStore: CredentialStore {
    private let file: ProjectConfigFile
    init(directory: URL = ProjectPaths.root) { file = ProjectConfigFile(directory: directory) }

    func read(service: String) throws -> String? {
        let account = try normalizedAccount(service)
        return try file.load().apiKeys[account]
    }

    func save(_ key: String, service: String) throws {
        let account = try normalizedAccount(service)
        var values = try file.load()
        values.apiKeys[account] = key
        try file.persist(values)
    }

    func saveConnection(_ key: String, config: ConnectionConfig) throws {
        let account = try normalizedAccount(config.baseURL)
        var values = try file.load()
        values.baseURL = account
        values.model = config.model
        values.apiKeys[account] = key
        try file.persist(values)
    }

    func delete(service: String) throws {
        let account = try normalizedAccount(service)
        var values = try file.load()
        guard values.apiKeys.removeValue(forKey: account) != nil else { return }
        try file.persist(values)
    }

    private func normalizedAccount(_ service: String) throws -> String {
        do { return try ConnectionConfig.validated(baseURL: service, model: "credential").baseURL }
        catch { throw CredentialError.invalidService }
    }
}
