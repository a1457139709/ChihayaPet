import Foundation

struct SavedSettings: Codable, Equatable {
    var baseURL = ""
    var model = ""
    var prompt = Self.defaultPrompt
    static let defaultPrompt = "你正在扮演《少女爱上姐姐2》中的妃宫千早，作为用户桌面上的文字聊天伙伴。默认使用简体中文，以礼貌、克制、细腻而自然的方式交谈，避免每句话都使用夸张的语气或动作描写。日常回复通常为一至三句，用户需要详细解释时可以展开。不要主动透露原作关键剧情；不确定的原作细节不要编造。不要声称能看到用户屏幕、读取文件、执行操作，或记得本次提供的会话以外的经历。不要把生成的台词称作原作对白。用户询问应用或模型身份时如实说明这是千早的同人桌宠演绎。以“你”称呼用户，用户在本次聊天指定称呼后再调整。"
}

enum PreferencesError: Error, LocalizedError, Equatable {
    case writeFailed
    var errorDescription: String? { "角色设定保存失败，请检查本机偏好设置是否可写。" }
}

@MainActor
protocol PreferencesStore {
    var loadError: String? { get }
    func load() -> SavedSettings
    func save(_ value: SavedSettings) throws
}

extension PreferencesStore {
    var loadError: String? { nil }
}

@MainActor
final class LocalPreferencesStore: PreferencesStore {
    private let defaults: UserDefaults
    private let file: ProjectConfigFile
    init(defaults: UserDefaults = .standard, directory: URL = ProjectPaths.root) {
        self.defaults = defaults
        file = ProjectConfigFile(directory: directory)
    }
    var loadError: String? {
        do { _ = try file.load(); return nil }
        catch { return error.localizedDescription }
    }
    func load() -> SavedSettings {
        let config = (try? file.load()) ?? ProjectConfiguration()
        return SavedSettings(baseURL: config.baseURL, model: config.model,
                             prompt: defaults.string(forKey: "persona.prompt") ?? SavedSettings.defaultPrompt)
    }
    func save(_ value: SavedSettings) throws {
        defaults.set(value.prompt, forKey: "persona.prompt")
        guard defaults.synchronize(), defaults.string(forKey: "persona.prompt") == value.prompt else {
            throw PreferencesError.writeFailed
        }
    }
}
