import AppKit
import CoreFoundation

// Small operating-system adapter, not a second application implementation.
func emit(_ value: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed]) {
        FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
    }
}
func fail(_ text: String) -> Never {
    FileHandle.standardError.write(Data(text.utf8)); exit(1)
}
let args = Array(CommandLine.arguments.dropFirst())
let command = args.first ?? ""
switch command {
case "preferences-read", "preferences-write":
    let domain = (args.count > 1 ? args[1] : "local.ChihayaPet") as CFString
    if command == "preferences-read" {
        let values = CFPreferencesCopyMultiple(nil, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) as? [String: Any] ?? [:]
        emit(values.filter { $0.key == "persona.prompt" || ["desktop.", "idle.", "music."].contains(where: $0.key.hasPrefix) })
    } else {
        do {
            guard let values = try JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as? [String: Any],
                  values.keys.allSatisfy({ $0 == "persona.prompt" || ["desktop.", "idle.", "music."].contains(where: $0.hasPrefix) }) else { fail("偏好数据无效。") }
            CFPreferencesSetMultiple(values as CFDictionary, nil, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
            guard CFPreferencesSynchronize(domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) else { fail("偏好保存失败。") }
            emit(true)
        } catch { fail("偏好保存失败。") }
    }
case "focus-read": emit(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0)
case "focus-restore":
    if args.count > 1, let pid = Int32(args[1]), let app = NSRunningApplication(processIdentifier: pid) {
        emit(app.activate(options: []))
    } else { emit(false) }
case "displays":
    emit(NSScreen.screens.compactMap { screen -> [String: Any]? in
        guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber,
              let uuid = CGDisplayCreateUUIDFromDisplayID(number.uint32Value)?.takeRetainedValue() else { return nil }
        return ["id": number.intValue, "uuid": CFUUIDCreateString(nil, uuid) as String]
    })
case "watch":
    // The parent's pipe closes on exit, including a crash or a killed QA run.
    FileHandle.standardInput.readabilityHandler = { handle in
        if handle.availableData.isEmpty { exit(0) }
    }
    func report() { emit(["reducedMotion": NSWorkspace.shared.accessibilityDisplayShouldReduceMotion]) }
    report()
    let token = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main) { _ in report() }
    RunLoop.main.run(); withExtendedLifetime(token) {}
default: fail("未知平台操作。")
}
