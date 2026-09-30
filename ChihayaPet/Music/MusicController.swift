import AppKit
import AVFoundation
import Combine
import UniformTypeIdentifiers

enum MusicSuspension: Hashable { case hidden, sleep }
struct MusicPlaybackIntent {
    var wantsPlayback = false
    var suspended: Set<MusicSuspension> = []
    var shouldPlay: Bool { wantsPlayback && suspended.isEmpty }
}
enum MusicLoop: String, CaseIterable { case single, list
    var title: String { self == .single ? "单曲循环" : "列表循环" }
}

@MainActor
protocol MusicAudio: AnyObject {
    var onFinish: ((Bool) -> Void)? { get set }
    var volume: Float { get set }
    func fade(to volume: Float, duration: TimeInterval)
    func play() -> Bool
    func pause()
    func stop()
    func rewind()
}

private struct PreparedAudio: @unchecked Sendable {
    let player: AVAudioPlayer
    init(url: URL) throws { player = try AVAudioPlayer(contentsOf: url); player.prepareToPlay() }
}
@MainActor
private final class NativeMusicAudio: NSObject, MusicAudio, AVAudioPlayerDelegate {
    private let player: AVAudioPlayer
    var onFinish: ((Bool) -> Void)?
    init(player: AVAudioPlayer) { self.player = player; super.init(); player.delegate = self }
    var volume: Float { get { player.volume } set { player.volume = newValue } }
    func fade(to volume: Float, duration: TimeInterval) { player.setVolume(volume, fadeDuration: duration) }
    func play() -> Bool { player.play() }
    func pause() { player.pause() }
    func stop() { player.stop() }
    func rewind() { player.currentTime = 0 }
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { onFinish?(flag) }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { onFinish?(false) }
}

@MainActor
final class MusicController: ObservableObject {
    @Published private(set) var tracks: [MusicTrack] = []
    @Published private(set) var selectedID: UUID?
    @Published private(set) var playing = false
    @Published private(set) var busy = true
    @Published private(set) var removing = false
    @Published private(set) var notice: String?
    @Published private(set) var error: String?
    @Published var volume: Double { didSet {
        let normalized = volume.isFinite ? min(1, max(0, volume)) : 0.2
        if volume != normalized { volume = normalized }
        defaults.set(normalized, forKey: "music.volume")
        if intent.shouldPlay { audio?.fade(to: Float(normalized), duration: 0.1) }
    } }
    @Published var loop: MusicLoop { didSet { defaults.set(loop.rawValue, forKey: "music.loop") } }
    @Published var autoplayEnabled: Bool {
        didSet {
            defaults.set(autoplayEnabled, forKey: "music.autoplayEnabled")
            if !autoplayEnabled { startupPlaybackPending = false }
        }
    }
    private let library: MusicLibrary
    private let defaults: UserDefaults
    private let makeAudio: (URL) async throws -> any MusicAudio
    private var audio: (any MusicAudio)?
    private var audioID: UUID?
    private var intent = MusicPlaybackIntent()
    private var generation = UUID()
    private var playbackTask: Task<Void, Never>?
    private var libraryTask: Task<Void, Never>?
    private var closed = false
    private var startupPlaybackPending = true
    var currentTitle: String { tracks.first { $0.id == selectedID }?.title ?? "尚未导入音乐" }
    var wantsPlayback: Bool { intent.wantsPlayback }
    var isSuspended: Bool { !intent.suspended.isEmpty }

    init(library: MusicLibrary = MusicLibrary(), defaults: UserDefaults = .standard, makeAudio: ((URL) async throws -> any MusicAudio)? = nil) {
        self.library = library; self.defaults = defaults
        autoplayEnabled = defaults.object(forKey: "music.autoplayEnabled") as? Bool ?? true
        let saved = defaults.object(forKey: "music.volume") as? Double ?? 0.2
        volume = saved.isFinite ? min(1, max(0, saved)) : 0.2
        loop = MusicLoop(rawValue: defaults.string(forKey: "music.loop") ?? "") ?? .single
        self.makeAudio = makeAudio ?? { url in
            let prepared = try await Task.detached(priority: .userInitiated) { try PreparedAudio(url: url) }.value
            return NativeMusicAudio(player: prepared.player)
        }
        libraryTask = Task { [weak self, library] in
            let tracks = await library.list()
            guard let self, !self.closed else { return }
            self.tracks = tracks
            let saved = UUID(uuidString: defaults.string(forKey: "music.selected") ?? "")
            self.selectedID = tracks.first(where: { $0.id == saved })?.id ?? tracks.first?.id
            self.busy = false
            let shouldAutoplay = self.startupPlaybackPending && self.autoplayEnabled
            self.startupPlaybackPending = false
            if shouldAutoplay { self.play() }
        }
    }
    func chooseFiles() {
        guard !busy else { return }
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = true; panel.canChooseDirectories = false
        panel.title = "导入背景音乐"; panel.prompt = "导入"
        panel.allowedContentTypes = [.audio]
        panel.begin { [weak self] result in
            guard result == .OK else { return }
            self?.importFiles(panel.urls)
        }
    }
    func importFiles(_ urls: [URL]) {
        guard !busy, !closed, !urls.isEmpty else { return }
        busy = true; error = nil; notice = nil
        libraryTask = Task { [weak self, library] in
            let result = await library.importFiles(urls)
            guard let self, !self.closed else { return }
            self.tracks = result.tracks
            if self.selectedID == nil { self.selectedID = result.tracks.first?.id }
            self.notice = "已导入 \(result.imported) 首音乐。"
            self.error = result.failures.isEmpty ? nil : result.failures.joined(separator: "\n")
            self.busy = false
        }
    }
    func select(_ id: UUID) {
        guard !removing, !closed, tracks.contains(where: { $0.id == id }), selectedID != id else { return }
        selectedID = id; defaults.set(id.uuidString, forKey: "music.selected")
        // A deliberate track change while hidden/sleeping must not auto-resume.
        if isSuspended { intent.wantsPlayback = false }
        reconcile()
    }
    func toggle() { intent.wantsPlayback ? pause() : play() }
    func play() {
        guard !removing, !closed, selectedID != nil else { return }
        intent.wantsPlayback = true; error = nil; reconcile()
    }
    func pause() { startupPlaybackPending = false; intent.wantsPlayback = false; reconcile() }
    func previous() {
        guard !removing, !closed, !tracks.isEmpty else { return }
        if isSuspended { intent.wantsPlayback = false }
        let current = tracks.firstIndex { $0.id == selectedID } ?? 0
        let previous = tracks[(current - 1 + tracks.count) % tracks.count].id
        if previous == selectedID { audio?.rewind(); reconcile() } else { select(previous) }
    }
    func next() {
        guard !removing, !closed, !tracks.isEmpty else { return }
        if isSuspended { intent.wantsPlayback = false }
        let current = tracks.firstIndex { $0.id == selectedID } ?? -1
        let next = tracks[(current + 1) % tracks.count].id
        if next == selectedID { audio?.rewind(); reconcile() } else { select(next) }
    }
    func removeSelected() {
        guard !busy, let id = selectedID else { return }
        pause(); busy = true; removing = true
        libraryTask = Task { [weak self, library] in
            do {
                let tracks = try await library.remove(id)
                guard let self, !self.closed else { return }
                self.tracks = tracks; self.selectedID = tracks.first?.id
                self.defaults.set(self.selectedID?.uuidString, forKey: "music.selected")
                self.notice = "已从曲库移除，原文件未改动。"; self.busy = false; self.removing = false
            } catch { self?.error = "无法保存曲库，请检查存储空间。"; self?.busy = false; self?.removing = false }
        }
    }
    func suspend(_ reason: MusicSuspension) { intent.suspended.insert(reason); reconcile() }
    func resume(_ reason: MusicSuspension) { intent.suspended.remove(reason); reconcile() }
    private func reconcile() {
        generation = UUID(); let token = generation
        playbackTask?.cancel(); playbackTask = nil
        audio?.onFinish = nil
        guard !closed else { return }
        guard intent.shouldPlay, let track = tracks.first(where: { $0.id == selectedID }) else {
            playing = false; audio?.fade(to: 0, duration: 0.35)
            playbackTask = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 350_000_000) } catch { return }
                guard let self, self.generation == token else { return }
                self.audio?.pause()
            }
            return
        }
        playbackTask = Task { [weak self] in
            guard let self else { return }
            if self.audioID != track.id {
                self.playing = false
                if let old = self.audio {
                    old.fade(to: 0, duration: 0.35)
                    do { try await Task.sleep(nanoseconds: 350_000_000) } catch { return }
                    guard self.generation == token else { return }
                    old.stop(); old.onFinish = nil; self.audio = nil; self.audioID = nil
                }
                do {
                    let prepared = try await self.makeAudio(self.library.url(for: track))
                    guard !Task.isCancelled, self.generation == token, !self.closed else { prepared.stop(); return }
                    self.audio = prepared; self.audioID = track.id
                } catch {
                    guard self.generation == token else { return }
                    self.fail(); return
                }
            }
            guard self.generation == token, self.intent.shouldPlay, let audio = self.audio else { return }
            audio.onFinish = { [weak self, weak audio] success in
                guard let self, let audio, self.generation == token, self.audio === audio, self.selectedID == track.id else { return }
                self.finished(success)
            }
            audio.volume = 0
            guard audio.play() else { self.fail(); return }
            audio.fade(to: Float(self.volume), duration: 0.5); self.playing = true
        }
    }
    private func finished(_ success: Bool) {
        guard success else { fail(); return }
        playing = false
        guard intent.shouldPlay else { return }
        if loop == .single { audio?.rewind(); reconcile() } else { next() }
    }
    private func fail() {
        intent.wantsPlayback = false; playing = false; audio?.stop()
        error = "无法播放这首音乐，请检查文件或选择下一首。"
    }
    func shutdown() {
        closed = true; generation = UUID(); intent.wantsPlayback = false
        playbackTask?.cancel(); libraryTask?.cancel(); audio?.onFinish = nil; audio?.stop(); audio = nil; playing = false
    }
}
