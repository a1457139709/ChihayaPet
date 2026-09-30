import AppKit
import XCTest
@testable import ChihayaPet

@MainActor
final class ThemeTests: XCTestCase {
    func testPlainEditorThemePreservesParagraphAttributesAndNativeNewlines() throws {
        let editor = NSTextView()
        editor.isRichText = false
        editor.string = "第一行"
        editor.setSelectedRange(NSRange(location: 3, length: 0))
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 4
        editor.typingAttributes[.paragraphStyle] = paragraph

        ChihayaStyle.configureEditor(editor)
        editor.insertNewline(nil)
        editor.insertText("第二行", replacementRange: editor.selectedRange())

        XCTAssertEqual(editor.string, "第一行\n第二行")
        let attributes = try XCTUnwrap(editor.textStorage).attributes(at: 4, effectiveRange: nil)
        XCTAssertEqual((attributes[.paragraphStyle] as? NSParagraphStyle)?.lineSpacing, 4)
        XCTAssertEqual(attributes[.font] as? NSFont, ChihayaStyle.editorNSFont)
        XCTAssertEqual(attributes[.foregroundColor] as? NSColor, ChihayaStyle.inkNSColor)
    }

    func testEditorThemeDoesNotDisturbActiveComposition() {
        let editor = ComposerTextView()
        editor.isRichText = false
        editor.string = "今天"
        ChihayaStyle.configureEditor(editor)
        editor.setMarkedText("nihao", selectedRange: NSRange(location: 5, length: 0), replacementRange: NSRange(location: 2, length: 0))
        let markedRange = editor.markedRange()
        let selectedRange = editor.selectedRange()
        XCTAssertTrue(editor.hasMarkedText())

        ChihayaStyle.configureEditor(editor)

        XCTAssertTrue(editor.hasMarkedText())
        XCTAssertEqual(editor.string, "今天nihao")
        XCTAssertEqual(editor.markedRange(), markedRange)
        XCTAssertEqual(editor.selectedRange(), selectedRange)
    }

    func testEditorThemeKeepsTextSelectionAndNewTextLegibleInDarkAppearance() throws {
        let editor = ComposerTextView()
        editor.isRichText = false
        editor.appearance = NSAppearance(named: .darkAqua)
        editor.string = "今天也请多关照。"
        editor.setSelectedRange(NSRange(location: 2, length: 2))

        ChihayaStyle.configureEditor(editor)

        XCTAssertEqual(editor.string, "今天也请多关照。")
        XCTAssertEqual(editor.selectedRange(), NSRange(location: 2, length: 2))
        XCTAssertEqual(editor.font, ChihayaStyle.editorNSFont)
        XCTAssertEqual(editor.textColor, ChihayaStyle.inkNSColor)
        XCTAssertEqual(editor.insertionPointColor, ChihayaStyle.roseNSColor)
        XCTAssertEqual(editor.selectedTextAttributes[.backgroundColor] as? NSColor, ChihayaStyle.selectionNSColor)
        XCTAssertEqual(editor.selectedTextAttributes[.foregroundColor] as? NSColor, ChihayaStyle.inkNSColor)
        XCTAssertEqual(editor.typingAttributes[.font] as? NSFont, ChihayaStyle.editorNSFont)
        XCTAssertEqual(editor.typingAttributes[.foregroundColor] as? NSColor, ChihayaStyle.inkNSColor)

        editor.insertText("你好", replacementRange: editor.selectedRange())
        XCTAssertEqual(editor.string, "今天你好多关照。")
        let inserted = try XCTUnwrap(editor.textStorage).attributes(at: 2, effectiveRange: nil)
        XCTAssertEqual(inserted[.font] as? NSFont, ChihayaStyle.editorNSFont)
        XCTAssertEqual(inserted[.foregroundColor] as? NSColor, ChihayaStyle.inkNSColor)
    }
}
