import AppKit
import XCTest
@testable import ChihayaPet

@MainActor
final class DialogueTests: XCTestCase {
    func testMeasuredPagesPreserveAllUnicodeAndWhitespace() {
        let text = String(repeating: "千早 👨‍👩‍👧‍👦 e\u{301} 🇨🇳\n  下一行。", count: 40)
        let pages = DialoguePaginator.pages(text, width: 180, height: 80)
        XCTAssertGreaterThan(pages.count, 2)
        XCTAssertEqual(pages.joined(), text)
        XCTAssertEqual(pages.flatMap { Array($0) }, Array(text))
        XCTAssertTrue(pages.allSatisfy { !$0.isEmpty })
        XCTAssertLessThan(DialoguePaginator.pages(text, width: 360, height: 150).count, pages.count)
    }
    func testSkipThenAdvanceAndPreviousDoNotLoseText() {
        let model = DialoguePresentation(text: String(repeating: "可以慢慢说。", count: 80), width: 180, animated: true)
        model.start()
        XCTAssertFalse(model.pageComplete)
        model.advance()
        XCTAssertTrue(model.pageComplete)
        XCTAssertEqual(model.pageIndex, 0)
        model.advance()
        XCTAssertEqual(model.pageIndex, 1)
        model.previous()
        XCTAssertEqual(model.pageIndex, 0)
        XCTAssertTrue(model.pageComplete)
        model.stop()
    }
    func testDisabledAnimationCompletesAndCancelledTaskCannotMutate() async throws {
        let model = DialoguePresentation(text: "你好，千早。", width: 356, animated: true)
        model.start(); model.setAnimated(false)
        XCTAssertEqual(model.visibleText, "你好，千早。")
        XCTAssertTrue(model.finished)
        model.stop()
        let before = model.visibleText
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(model.visibleText, before)
    }
    func testReflowPreservesAlreadyReadCharacterPosition() {
        let model = DialoguePresentation(text: String(repeating: "千早，愿与你一起度过。", count: 40), width: 180, animated: true)
        model.start(); model.advance()
        let read = model.visibleText.count
        model.reflow(width: 356)
        let after = model.pages.prefix(model.pageIndex).reduce(0) { $0 + $1.count } + model.visibleText.count
        XCTAssertEqual(after, read)
        model.stop()
    }
    func testPlaybackNotificationClosesMouthForEveryImmediateCompletionPath() {
        let model = DialoguePresentation(text: String(repeating: "慢慢说。", count: 80), width: 180, animated: true)
        var playback: [Bool] = []
        model.onPlaybackChanged = { playback.append($0) }

        model.start()
        XCTAssertTrue(model.isPlaying)
        XCTAssertEqual(playback, [true])

        model.advance()
        XCTAssertFalse(model.isPlaying)
        XCTAssertEqual(playback, [true, false])

        model.advance()
        XCTAssertTrue(model.isPlaying)
        model.previous()
        XCTAssertFalse(model.isPlaying)

        model.advance()
        XCTAssertTrue(model.isPlaying)
        model.setAnimated(false)
        XCTAssertFalse(model.isPlaying)

        model.stop()
        XCTAssertFalse(model.isPlaying)
    }
    func testCompletedPagesStayCompleteWhenNavigatingBackAndForward() {
        let model = DialoguePresentation(text: String(repeating: "已经读完的对白。", count: 80), width: 180, animated: true)
        XCTAssertGreaterThan(model.pages.count, 1)

        model.start()
        model.advance()
        model.advance()
        model.advance()
        XCTAssertTrue(model.pageComplete)
        XCTAssertFalse(model.isPlaying)

        model.previous()
        XCTAssertTrue(model.pageComplete)
        XCTAssertFalse(model.isPlaying)

        model.advance()
        XCTAssertTrue(model.pageComplete)
        XCTAssertFalse(model.isPlaying)
        model.stop()
    }
    func testPartiallyReadPageResumesAfterVisitingPreviousPage() async throws {
        let model = DialoguePresentation(text: String(repeating: "下一页继续。", count: 80), width: 180, animated: true)
        model.start()
        model.advance()
        model.advance()
        try await Task.sleep(nanoseconds: 50_000_000)
        let page = model.pageIndex
        let prefix = model.visibleText
        XCTAssertFalse(prefix.isEmpty)
        XCTAssertFalse(model.pageComplete)

        model.previous()
        model.advance()

        XCTAssertEqual(model.pageIndex, page)
        XCTAssertTrue(model.visibleText.hasPrefix(prefix))
        XCTAssertTrue(model.isPlaying)
        model.stop()
    }
    func testNaturalPageEndStopsPlaybackAsSoonAsFinalCharacterAppears() async throws {
        let model = DialoguePresentation(text: "千", animated: true)
        model.start()
        for _ in 0..<100 {
            if model.visibleText == "千" { break }
            await Task.yield()
        }

        XCTAssertEqual(model.visibleText, "千")
        XCTAssertTrue(model.pageComplete)
        XCTAssertFalse(model.isPlaying)
    }
}
