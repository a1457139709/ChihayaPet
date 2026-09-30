import AppKit
import XCTest
import CoreText
@testable import ChihayaPet

final class IdleBubbleTests: XCTestCase {
    func testReplyExcerptKeepsShortTextAndBoundsLongUnicodeText() {
        let short = "来喝杯茶吧。"
        XCTAssertEqual(ReplyBubbleExcerpt(short).text, short)
        XCTAssertFalse(ReplyBubbleExcerpt(short).needsReadMore)
        for source in [String(repeating: "千早陪你聊聊今天的事情。", count: 12),
                       String(repeating: "👩🏽‍💻一家人👨‍👩‍👧‍👦", count: 20),
                       "第一行\n第二行\n第三行\n第四行\n第五行\n第六行"] {
            let excerpt = ReplyBubbleExcerpt(source)
            XCTAssertTrue(excerpt.needsReadMore)
            XCTAssertTrue(excerpt.text.hasSuffix("…"))
            XCTAssertLessThanOrEqual(excerpt.text.count, 60)
            XCTAssertTrue(source.hasPrefix(String(excerpt.text.dropLast())))
            let height = IdleBubbleLayout.textHeight(excerpt.text)
            let frame = DialogueTextLayout.frame(excerpt.text, width: IdleBubbleLayout.textWidth, height: height, style: .idle)
            XCTAssertLessThanOrEqual((CTFrameGetLines(frame) as NSArray).count, 4)
            XCTAssertEqual(CTFrameGetVisibleStringRange(frame).length, excerpt.text.utf16.count)
        }
    }

    func testReadMoreFooterReservesSpaceWithoutChangingTextBounds() {
        let pet = CGRect(x: 500, y: 100, width: 200, height: 272)
        let screen = CGRect(x: 0, y: 0, width: 1400, height: 1000)
        let attachment = CharacterSpeechAttachment(mouth: CGPoint(x: 600, y: 284), hairLeft: 570, hairRight: 630)
        let plain = IdleBubbleLayout(pet: pet, screen: screen, textHeight: 80, attachment: attachment)
        let more = IdleBubbleLayout(pet: pet, screen: screen, textHeight: 80, attachment: attachment, hasReadMore: true)
        XCTAssertEqual(more.frame.height, plain.frame.height + 24)
        XCTAssertEqual(more.textFrame, plain.textFrame)
        XCTAssertGreaterThanOrEqual(more.footerFrame.minY, more.textFrame.maxY)
        XCTAssertTrue(more.bodyFrame.contains(more.footerFrame))
        XCTAssertTrue(screen.contains(more.frame))
    }

    func testTailStaysCloseToSuppliedHairEdges() {
        for x in [0.0, 600] {
            let pet = CGRect(x: x, y: 100, width: 220, height: 272)
            let attachment = CharacterSpeechAttachment(
                mouth: CGPoint(x: x + 111, y: 286),
                hairLeft: x + 73,
                hairRight: x + 151
            )
            let layout = IdleBubbleLayout(
                pet: pet,
                screen: CGRect(x: 0, y: 0, width: 2000, height: 1200),
                textHeight: 72,
                attachment: attachment
            )
            let gap = layout.tailOnRight
                ? attachment.hairLeft - (layout.frame.minX + layout.outlineFrame.maxX)
                : layout.frame.minX + layout.outlineFrame.minX - attachment.hairRight
            XCTAssertEqual(gap, 4, accuracy: 0.001)
            XCTAssertEqual(layout.frame.maxY - layout.tailY, attachment.mouth.y, accuracy: 0.001)
        }
    }

    func testAttachmentTranslationMovesEveryAnchor() {
        let attachment = CharacterSpeechAttachment(
            mouth: CGPoint(x: 12, y: 30),
            hairLeft: 4,
            hairRight: 22
        )

        let translated = attachment.translated(by: CGPoint(x: 100, y: 200))

        XCTAssertEqual(translated.mouth, CGPoint(x: 112, y: 230))
        XCTAssertEqual(translated.hairLeft, 104)
        XCTAssertEqual(translated.hairRight, 122)
    }

    func testBubbleClampsAtScreenEdgesWithSuppliedAttachment() {
        let screen = CGRect(x: -1000, y: 0, width: 1000, height: 700)
        for mouth in [CGPoint(x: -985, y: 20), CGPoint(x: -15, y: 685)] {
            let pet = CGRect(x: mouth.x - 80, y: mouth.y - 180, width: 160, height: 260)
            let attachment = CharacterSpeechAttachment(
                mouth: mouth,
                hairLeft: mouth.x - 35,
                hairRight: mouth.x + 35
            )
            let layout = IdleBubbleLayout(pet: pet, screen: screen, textHeight: 96, attachment: attachment)
            XCTAssertTrue(screen.contains(layout.frame))
            XCTAssertGreaterThanOrEqual(layout.tailY, 54)
            XCTAssertLessThanOrEqual(layout.tailY, layout.frame.height - 62)
        }
    }

    @MainActor
    func testAllCatalogLinesAreCompleteSinglePage() {
        let lines = (0..<24).flatMap { IdleSpeechCatalog.lines(hour: $0) }
        for text in Set(lines) {
            let model = DialoguePresentation(text: text, width: IdleBubbleLayout.textWidth, style: .idle, paginated: false, animated: true)
            XCTAssertEqual(model.pages, [text])
            XCTAssertEqual(model.style.font.pointSize, 15)
            XCTAssertEqual(model.style.lineSpacing, 4)
            let frame = DialogueTextLayout.frame(text, width: IdleBubbleLayout.textWidth, height: model.height, style: model.style)
            XCTAssertEqual(CTFrameGetVisibleStringRange(frame).length, text.utf16.count)
            let count = (CTFrameGetLines(frame) as NSArray).count
            XCTAssertLessThanOrEqual(count, 4, text)
            model.start(); model.advance()
            XCTAssertTrue(model.finished)
            XCTAssertEqual(model.visibleText, text)
            model.advance()
            XCTAssertEqual(model.visibleText, text)
            XCTAssertEqual(model.pageIndex, 0)
            model.stop()
        }
    }
    func testChineseClosingPunctuationDoesNotStartLine() {
        let text = "红茶的香气不只有一种。有的轻柔，有的浓郁，倒像各有各的性格。"
        for width in [160.0, 174, 184, 196] {
            let height = DialogueTextLayout.height(text, width: width, style: .idle)
            let frame = DialogueTextLayout.frame(text, width: width, height: height, style: .idle)
            for line in CTFrameGetLines(frame) as! [CTLine] {
                let range = CTLineGetStringRange(line)
                let content = (text as NSString).substring(with: NSRange(location: range.location, length: range.length))
                XCTAssertFalse("，。！？；：、）】》”".contains(content.first!), content)
            }
        }
    }
    func testBubbleSwitchesSideAndStaysInsideScreen() {
        let screen = CGRect(x: 0, y: 0, width: 1200, height: 800)
        for x in [0.0, 500, 1050] {
            let pet = CGRect(x: x, y: 120, width: 150, height: 272)
            let attachment = CharacterSpeechAttachment(
                mouth: CGPoint(x: pet.midX, y: pet.minY + 184),
                hairLeft: pet.midX - 26,
                hairRight: pet.midX + 26
            )
            let layout = IdleBubbleLayout(pet: pet, screen: screen, textHeight: 72, attachment: attachment)
            XCTAssertTrue(screen.contains(layout.frame))
            XCTAssertLessThan(layout.frame.width, 300)
            XCTAssertLessThan(layout.frame.height, 220)
            XCTAssertEqual(layout.tailOnRight, x > 300)
            let tipY = layout.frame.maxY - layout.tailY
            XCTAssertEqual(tipY, attachment.mouth.y, accuracy: 1)
        }
    }
    func testVerticalEdgesClampTailInsideBubble() {
        let screen = CGRect(x: -1000, y: 0, width: 1000, height: 700)
        let pet = CGRect(x: -500, y: 610, width: 180, height: 272)
        let attachment = CharacterSpeechAttachment(mouth: CGPoint(x: -410, y: 800), hairLeft: -445, hairRight: -375)
        let layout = IdleBubbleLayout(pet: pet, screen: screen, textHeight: 96, attachment: attachment)
        XCTAssertTrue(screen.contains(layout.frame))
        XCTAssertGreaterThanOrEqual(layout.tailY, 20)
        XCTAssertLessThanOrEqual(layout.tailY, layout.frame.height - 20)
    }
    func testShortBubbleMouthAlignmentAtEachPetSize() {
        for height in [240.0, 256, 480] {
            let pet = CGRect(x: 500, y: 100, width: height * 0.85 + 16, height: height + 16)
            let attachment = CharacterSpeechAttachment(
                mouth: CGPoint(x: pet.midX, y: pet.minY + 8 + height * 0.7),
                hairLeft: pet.midX - 30,
                hairRight: pet.midX + 30
            )
            let layout = IdleBubbleLayout(pet: pet, screen: CGRect(x: 0, y: 0, width: 1400, height: 1000), textHeight: 38, attachment: attachment)
            XCTAssertEqual(layout.frame.maxY - layout.tailY, attachment.mouth.y, accuracy: 1)
        }
    }
}
