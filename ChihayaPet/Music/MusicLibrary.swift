import Foundation
import AVFoundation

struct MusicTrack: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let title: String
    let fileName: String
}
struct MusicImportResult: Sendable {
    let tracks: [MusicTrack]
    let failures: [String]
    let imported: Int
}

actor MusicLibrary {
    nonisolated let directory: URL
    private var tracks: [MusicTrack]
    init(directory: URL = ProjectPaths.music) {
        self.directory = directory
        if let data = try? Data(contentsOf: directory.appendingPathComponent("library.json")),
           let saved = try? JSONDecoder().decode([MusicTrack].self, from: data) {
            tracks = saved.filter { Self.safe($0) }
        } else { tracks = [] }
    }
    private static func safe(_ track: MusicTrack) -> Bool {
        let ext = (track.fileName as NSString).pathExtension.lowercased()
        return extensions.contains(ext) && track.fileName == track.id.uuidString + "." + ext
    }
    private static let extensions: Set<String> = ["wav", "aiff", "aif", "mp3", "m4a", "aac"]
    func list() -> [MusicTrack] { tracks }
    nonisolated func url(for track: MusicTrack) -> URL { directory.appendingPathComponent(track.fileName) }
    func importFiles(_ urls: [URL]) -> MusicImportResult {
        var failures: [String] = [], imported = 0
        for url in urls {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let ext = url.pathExtension.lowercased()
            guard url.isFileURL, Self.extensions.contains(ext) else {
                failures.append("\(url.lastPathComponent)：暂不支持，请转换为 WAV 或 M4A 后导入。")
                continue
            }
            let id = UUID()
            let track = MusicTrack(id: id, title: url.deletingPathExtension().lastPathComponent, fileName: id.uuidString + "." + ext)
            let destination = self.url(for: track)
            do {
                // Actor executor keeps file I/O and audio inspection off the main actor.
                let audio = try AVAudioPlayer(contentsOf: url)
                guard audio.duration.isFinite, audio.duration > 0 else { throw CocoaError(.fileReadCorruptFile) }
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try FileManager.default.copyItem(at: url, to: destination)
                var proposed = tracks; proposed.append(track)
                try persist(proposed)
                tracks = proposed; imported += 1
            } catch {
                // Only this newly allocated copy can be removed on rollback.
                try? FileManager.default.removeItem(at: destination)
                failures.append("\(url.lastPathComponent)：无法导入，请检查文件是否可播放以及存储空间。")
            }
        }
        return MusicImportResult(tracks: tracks, failures: failures, imported: imported)
    }
    func remove(_ id: UUID) throws -> [MusicTrack] {
        let proposed = tracks.filter { $0.id != id }
        try persist(proposed); tracks = proposed
        return tracks
    }
    private func persist(_ proposed: [MusicTrack]) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(proposed).write(to: directory.appendingPathComponent("library.json"), options: .atomic)
    }
}
