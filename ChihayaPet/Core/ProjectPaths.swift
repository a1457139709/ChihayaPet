import Foundation

/// Resolve from the app location, independent of Finder's working directory.
enum ProjectPaths {
    static var root: URL { root(for: Bundle.main.bundleURL) }
    static var music: URL { root.appendingPathComponent("Music", isDirectory: true) }

    static func root(for application: URL) -> URL {
        let parent = application.standardizedFileURL.deletingLastPathComponent()
        var candidate = parent
        while candidate.path != "/" {
            if FileManager.default.fileExists(atPath: candidate.appendingPathComponent(".chihaya-root").path)
                || FileManager.default.fileExists(atPath: candidate.appendingPathComponent("ChihayaPet.xcodeproj").path) {
                return candidate
            }
            candidate.deleteLastPathComponent()
        }
        // Installed apps (including copies launched from a read-only DMG) use user data.
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ChihayaPet", isDirectory: true)
    }
}
