import Foundation

/// Eject our installer image after launching an installed copy. Never deletes files.
enum InstallerVolumeCleanup {
    static let markerName = ".chihaya-installer"
    static let markerValue = "local.ChihayaPet.installer.v1\n"

    static func start(appURL: URL = Bundle.main.bundleURL, home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        guard isInstalled(appURL, home: home) else { return }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 3) {
            guard let data = run(["info", "-plist"]),
                  let info = (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [String: Any] else { return }
            for mount in candidates(info: info, appURL: appURL, home: home, isInstaller: isInstaller) {
                // No force flag: if the image is still in use, leave it mounted.
                _ = run(["detach", mount])
            }
        }
    }

    static func candidates(info: [String: Any], appURL: URL, home: URL, isInstaller: (String) -> Bool) -> [String] {
        guard isInstalled(appURL, home: home), let images = info["images"] as? [[String: Any]] else { return [] }
        var mounts = Set<String>()
        for image in images {
            for entity in image["system-entities"] as? [[String: Any]] ?? [] {
                guard let mount = entity["mount-point"] as? String else { continue }
                let url = URL(fileURLWithPath: mount).standardizedFileURL
                guard url.path == mount, url.deletingLastPathComponent().path == "/Volumes",
                      isInstaller(mount) else { continue }
                mounts.insert(mount)
            }
        }
        return mounts.sorted()
    }

    static func isInstaller(_ mount: String) -> Bool {
        let root = URL(fileURLWithPath: mount)
        guard (try? String(contentsOf: root.appendingPathComponent(markerName), encoding: .utf8)) == markerValue,
              let data = try? Data(contentsOf: root.appendingPathComponent("ChihayaPet.app/Contents/Info.plist")),
              let info = (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [String: Any],
              info["CFBundleIdentifier"] as? String == "local.ChihayaPet" else { return false }
        return true
    }

    private static func isInstalled(_ appURL: URL, home: URL) -> Bool {
        let app = appURL.resolvingSymlinksInPath().standardizedFileURL
        let parent = app.deletingLastPathComponent().path
        return app.pathExtension == "app" && (parent == "/Applications" || parent == home.appendingPathComponent("Applications").resolvingSymlinksInPath().path)
    }

    private static func run(_ arguments: [String]) -> Data? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        process.arguments = arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return nil }
        let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 15, execute: timeout)
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        timeout.cancel()
        return process.terminationStatus == 0 ? data : nil
    }
}
