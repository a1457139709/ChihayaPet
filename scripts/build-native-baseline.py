#!/usr/bin/env python3
"""Build the fixed native baseline with disposable-data/command instrumentation only."""
import io, os, pathlib, subprocess, tarfile, shutil
root = pathlib.Path(__file__).resolve().parent.parent
base = 'b6a2f10f759de40665b7d7ab664c33a0004ea244'
source = root / 'build/benchmark-native-source'
if source.exists(): shutil.rmtree(source)
source.mkdir(parents=True)
archive = subprocess.check_output(['git', 'archive', base], cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for member in tar.getmembers():
        target = (source / member.name).resolve()
        if source not in target.parents or member.issym() or member.islnk(): raise ValueError('Unsafe baseline archive path')
    tar.extractall(source)
delegate = source / 'ChihayaPet/AppDelegate.swift'
text = delegate.read_text().replace('let desktop = DesktopController()', 'let desktop = DesktopController(defaults: QABenchmark.preferences)')
text = text.replace('client: URLSessionModelClient()', 'client: QAModelClient()').replace('preferences: LocalPreferencesStore()', 'preferences: LocalPreferencesStore(defaults: QABenchmark.preferences)')
text = text.replace('let music = MusicController()', 'let music = MusicController(defaults: QABenchmark.preferences)').replace('music: music)', 'music: music, defaults: QABenchmark.preferences)')
text = text.replace('InstallerVolumeCleanup.start()', 'QABenchmark.start(desktop: desktop, store: store, music: music, windows: windows)')
delegate.write_text(text)
project_paths = source / 'ChihayaPet/Core/ProjectPaths.swift'
project_paths.write_text(project_paths.read_text().replace('static var root: URL { root(for: Bundle.main.bundleURL) }', 'static var root: URL { URL(fileURLWithPath: ProcessInfo.processInfo.environment["CHIHAYA_QA_DATA"]!) }'))
desktop = source / 'ChihayaPet/Desktop/DesktopController.swift'
text = desktop.read_text().replace('    func show() {', '    func qaMove(x: CGFloat, y: CGFloat) { panel.setFrameOrigin(CGPoint(x: x, y: y)); onGeometryChange?() }\n    func show() {')
desktop.write_text(text)
(source / 'ChihayaPet/QABenchmark.swift').write_text(r'''
import AppKit
import Foundation
struct QAModelClient: ModelClient {
    func reply(to messages: [ChatMessage], using snapshot: RequestSnapshot) async throws -> ModelReply { ModelReply(text: "连接成功", truncated: false) }
    func streamReply(to messages: [ChatMessage], using snapshot: RequestSnapshot, onDelta: @escaping @Sendable (String) async -> Void) async throws -> ModelReply {
        let text = String(repeating: "这是一段用于运行验证的虚构回复。请稍作休息，照顾好自己。", count: 100)
        var index = text.startIndex
        while index < text.endIndex {
            let end = text.index(index, offsetBy: 60, limitedBy: text.endIndex) ?? text.endIndex
            await onDelta(String(text[index..<end])); index = end
            if index < text.endIndex { try await Task.sleep(nanoseconds: 100_000_000) }
        }
        return ModelReply(text: text, truncated: false)
    }
}
@MainActor enum QABenchmark {
    static var preferences: UserDefaults { UserDefaults(suiteName: ProcessInfo.processInfo.environment["CHIHAYA_QA_DOMAIN"]!)! }
    static var buffer = ""
    static func emit(_ values: [String: Any]) {
        let data = try! JSONSerialization.data(withJSONObject: values)
        FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
    }
    static func start(desktop: DesktopController, store: AppStore, music: MusicController, windows: InteractionWindows) {
        FileHandle.standardInput.readabilityHandler = { handle in
            let data = handle.availableData
            if data.isEmpty { return }
            Task { @MainActor in
                buffer += String(decoding: data, as: UTF8.self)
                while let newline = buffer.firstIndex(of: "\n") {
                    let line = String(buffer[..<newline]); buffer.removeSubrange(...newline)
                    guard let c = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else { continue }
                    switch c["type"] as? String {
                    case "animations": desktop.setAnimations(c["value"] as? Bool ?? true)
                    case "expression": desktop.setNumberedExpressionMode(NumberedExpressionMode(rawValue: c["value"] as? String))
                    case "outfit": if let value = c["value"] as? String, let outfit = StandingCharacterOutfit(rawValue: value) { desktop.setStandingOutfit(outfit) }
                    case "framing": desktop.setFraming(c["value"] as? String == "close" ? .close : .full)
                    case "move": desktop.qaMove(x: c["x"] as? Double ?? 900, y: c["y"] as? Double ?? 30)
                    case "chat": windows.openChat()
                    case "settings": windows.openSettings()
                    case "close": windows.closeChat(showReply: false); NSApp.windows.filter { $0.title == "千早桌宠 · 设置" }.forEach { $0.close() }
                    case "request": store.input = "虚构验证消息"; store.send()
                    case "music": music.toggle()
                    case "hide": desktop.hide(); windows.refreshVisibility()
                    case "show": desktop.show(); windows.refreshVisibility()
                    case "sleep": NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.willSleepNotification, object: nil)
                    case "wake": NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
                    case "clear": store.clearConversation()
                    case "quit": NSApp.terminate(nil)
                    default: break
                    }
                    emit(["ack": true, "busy": store.isBusy, "playing": music.playing])
                }
            }
        }
        emit(["ready": true, "pid": ProcessInfo.processInfo.processIdentifier])
    }
}
''')
env = dict(os.environ, DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer')
subprocess.run(['./scripts/build.sh'], cwd=source, env=env, check=True)
output = root / 'build/benchmark-native/ChihayaPet.app'
output.parent.mkdir(parents=True, exist_ok=True)
if output.exists(): shutil.rmtree(output)
subprocess.run(['/usr/bin/ditto', str(source / 'build/ChihayaPet.app'), str(output)], check=True)
print(f'Instrumented native Release baseline {base}: {output}')
