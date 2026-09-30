import XCTest
@testable import ChihayaPet

@MainActor
final class MusicTests: XCTestCase {
    func testFreshPreferencesAutomaticallyStartSelectedTrack() async throws {
        let (root, library) = try await populatedLibrary()
        let suite = "music.autoplay.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        let audio = TestMusicAudio()
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in audio })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        XCTAssertTrue(music.wantsPlayback)
    }
    func testRemovalRejectsConcurrentPlayAndKeepsPlaybackPaused() async throws {
        let (root, library) = try await populatedLibrary()
        let suite = "music.remove.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(false, forKey: "music.autoplayEnabled")
        let audio = TestMusicAudio()
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in audio })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        music.play(); try await wait { music.playing }
        music.removeSelected(); music.play()
        XCTAssertFalse(music.wantsPlayback)
        try await wait { !music.busy }
        XCTAssertTrue(music.tracks.isEmpty)
        XCTAssertFalse(music.playing)
    }
    func testNativeAudioCanPlayAndPauseTemporarySilentWav() async throws {
        let (root, library) = try await populatedLibrary()
        let suite = "music.native.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(false, forKey: "music.autoplayEnabled")
        let music = MusicController(library: library, defaults: defaults)
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        XCTAssertFalse(music.playing)
        music.play(); try await wait { music.playing }
        XCTAssertNil(music.error)
        music.pause()
        XCTAssertFalse(music.wantsPlayback)
        try await Task.sleep(nanoseconds: 380_000_000)
        XCTAssertFalse(music.playing)
    }
    func testOldTrackCompletionCannotSkipNewSelection() async throws {
        let (root, library) = try await populatedLibrary()
        _ = await library.importFiles([root.appendingPathComponent("sample.wav"), root.appendingPathComponent("sample.wav")])
        let suite = "music.switch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(false, forKey: "music.autoplayEnabled")
        var audios: [TestMusicAudio] = []
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in
            let audio = TestMusicAudio(); audios.append(audio); return audio
        })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        music.loop = .list; music.play(); try await wait { music.playing }
        let oldCallback = audios[0].onFinish
        let nextID = music.tracks[1].id
        music.select(nextID)
        oldCallback?(true)
        XCTAssertEqual(music.selectedID, nextID)
        try await Task.sleep(nanoseconds: 430_000_000)
        XCTAssertEqual(music.selectedID, nextID)
        XCTAssertTrue(music.playing)
    }
    func testLateAudioLoadAfterPauseNeverStartsPlaying() async throws {
        let (root, library) = try await populatedLibrary()
        let suite = "music.race.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(false, forKey: "music.autoplayEnabled")
        let audio = TestMusicAudio()
        var release: (() -> Void)?
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in
            await withCheckedContinuation { continuation in release = { continuation.resume(returning: audio) } }
        })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        XCTAssertFalse(music.wantsPlayback)
        music.play()
        try await wait { release != nil }
        music.pause(); release?()
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertFalse(music.playing)
        XCTAssertEqual(audio.playCount, 0)
    }
    func testOldPauseCannotStopResumedPlaybackAndSuspensionsCompose() async throws {
        let (root, library) = try await populatedLibrary()
        let suite = "music.resume.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(false, forKey: "music.autoplayEnabled")
        let audio = TestMusicAudio()
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in audio })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        music.play(); try await wait { music.playing }
        music.pause(); music.play()
        try await Task.sleep(nanoseconds: 430_000_000)
        XCTAssertTrue(music.playing)
        XCTAssertEqual(audio.pauseCount, 0)
        music.suspend(.hidden); music.suspend(.sleep); music.resume(.hidden)
        XCTAssertFalse(music.playing)
        music.pause(); music.resume(.sleep)
        try await Task.sleep(nanoseconds: 380_000_000)
        XCTAssertFalse(music.playing)
        XCTAssertFalse(music.wantsPlayback)
    }
    func testStartupPauseAndDisabledPreferencePreventAutoplay() async throws {
        for disable in [false, true] {
            let (root, library) = try await populatedLibrary()
            let suite = "music.startup.\(UUID())"
            let defaults = UserDefaults(suiteName: suite)!
            let audio = TestMusicAudio()
            let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in audio })
            if disable { music.autoplayEnabled = false } else { music.pause() }
            try await wait { !music.busy }
            XCTAssertFalse(music.wantsPlayback)
            XCTAssertEqual(audio.playCount, 0)
            if disable { XCTAssertEqual(defaults.object(forKey: "music.autoplayEnabled") as? Bool, false) }
            music.shutdown(); defaults.removePersistentDomain(forName: suite)
            try FileManager.default.removeItem(at: root)
        }
    }
    func testPreviousWrapsAndPreservesPause() async throws {
        let (root, library) = try await populatedLibrary()
        _ = await library.importFiles([root.appendingPathComponent("sample.wav"), root.appendingPathComponent("sample.wav")])
        let suite = "music.previous.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(false, forKey: "music.autoplayEnabled")
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in TestMusicAudio() })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { !music.busy }
        music.previous()
        XCTAssertEqual(music.selectedID, music.tracks.last?.id)
        music.previous()
        XCTAssertEqual(music.selectedID, music.tracks[1].id)
        music.next()
        XCTAssertEqual(music.selectedID, music.tracks.last?.id)
        XCTAssertFalse(music.wantsPlayback)
    }
    func testSavedSelectionAndMissingSelectionFallback() async throws {
        let (root, library) = try await populatedLibrary()
        let imported = await library.importFiles([root.appendingPathComponent("sample.wav")])
        let suite = "music.selected.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        for saved in [imported.tracks.last!.id, UUID()] {
            defaults.set(saved.uuidString, forKey: "music.selected")
            let audio = TestMusicAudio()
            let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in audio })
            try await wait { music.playing }
            XCTAssertEqual(music.selectedID, imported.tracks.first(where: { $0.id == saved })?.id ?? imported.tracks.first!.id)
            music.autoplayEnabled = false
            XCTAssertTrue(music.playing, "Changing next-start preference must not stop current playback")
            music.shutdown()
            defaults.removeObject(forKey: "music.autoplayEnabled")
        }
    }
    func testSinglePreviousRewindsAndEmptyLibraryStaysSilent() async throws {
        let (root, library) = try await populatedLibrary()
        let suite = "music.single.\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        let audio = TestMusicAudio()
        let music = MusicController(library: library, defaults: defaults, makeAudio: { _ in audio })
        defer { music.shutdown(); defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        try await wait { music.playing }
        music.previous()
        XCTAssertEqual(audio.rewindCount, 1)
        XCTAssertTrue(music.wantsPlayback)
        music.pause(); music.previous()
        XCTAssertEqual(audio.rewindCount, 2)
        XCTAssertFalse(music.wantsPlayback)
        let empty = MusicController(library: MusicLibrary(directory: root.appendingPathComponent("empty")), defaults: defaults, makeAudio: { _ in XCTFail("Empty library loaded audio"); return audio })
        try await wait { !empty.busy }
        XCTAssertFalse(empty.wantsPlayback)
        XCTAssertNil(empty.selectedID)
        empty.previous(); empty.shutdown()
    }
    private func populatedLibrary() async throws -> (URL, MusicLibrary) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let source = root.appendingPathComponent("sample.wav"); try wav().write(to: source)
        let library = MusicLibrary(directory: root.appendingPathComponent("library"))
        let result = await library.importFiles([source]); XCTAssertEqual(result.tracks.count, 1)
        return (root, library)
    }
    private func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<100 { if condition() { return }; try await Task.sleep(nanoseconds: 5_000_000) }
        XCTFail("Timed out waiting for music state")
    }
    func testPlaybackIntentHandlesOverlappingSuspensionsAndManualPause() {
        var intent = MusicPlaybackIntent()
        XCTAssertFalse(intent.shouldPlay)
        intent.wantsPlayback = true
        XCTAssertTrue(intent.shouldPlay)
        intent.suspended.insert(.hidden); intent.suspended.insert(.sleep)
        XCTAssertFalse(intent.shouldPlay)
        intent.suspended.remove(.hidden)
        XCTAssertFalse(intent.shouldPlay)
        intent.wantsPlayback = false
        intent.suspended.remove(.sleep)
        XCTAssertFalse(intent.shouldPlay)
    }
    func testLibraryCopiesAndSeparatesSameNamesWithoutTouchingOriginal() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let source = root.appendingPathComponent("sample.wav")
        let bytes = wav()
        try bytes.write(to: source)
        let library = MusicLibrary(directory: root.appendingPathComponent("library"))
        let a = await library.importFiles([source])
        let b = await library.importFiles([source])
        XCTAssertEqual(a.tracks.count, 1)
        XCTAssertEqual(b.tracks.count, 2)
        XCTAssertNotEqual(b.tracks[0].fileName, b.tracks[1].fileName)
        XCTAssertEqual(try Data(contentsOf: source), bytes)
        let removed = try await library.remove(b.tracks[0].id)
        XCTAssertEqual(removed.count, 1)
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
        let loaded = await MusicLibrary(directory: root.appendingPathComponent("library")).list()
        XCTAssertEqual(loaded.count, 1)
    }
    func testBadImportDoesNotEnterCatalog() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let source = root.appendingPathComponent("invalid.mp3")
        try Data("not audio".utf8).write(to: source)
        let result = await MusicLibrary(directory: root.appendingPathComponent("library")).importFiles([source])
        XCTAssertTrue(result.tracks.isEmpty)
        XCTAssertEqual(result.failures.count, 1)
    }
    private func wav() -> Data {
        var data = Data()
        func ascii(_ s: String) { data.append(contentsOf: s.utf8) }
        func u16(_ v: UInt16) { data.append(UInt8(v & 255)); data.append(UInt8(v >> 8)) }
        func u32(_ v: UInt32) { u16(UInt16(v & 65535)); u16(UInt16(v >> 16)) }
        let size: UInt32 = 4410 * 2
        ascii("RIFF"); u32(36 + size); ascii("WAVEfmt "); u32(16); u16(1); u16(1)
        u32(44100); u32(88200); u16(2); u16(16); ascii("data"); u32(size)
        data.append(Data(count: Int(size)))
        return data
    }
}

@MainActor
private final class TestMusicAudio: MusicAudio {
    var onFinish: ((Bool) -> Void)?
    var volume: Float = 0
    var playCount = 0
    var pauseCount = 0
    var rewindCount = 0
    func fade(to volume: Float, duration: TimeInterval) { self.volume = volume }
    func play() -> Bool { playCount += 1; return true }
    func pause() { pauseCount += 1 }
    func stop() {}
    func rewind() { rewindCount += 1 }
}
