import AppKit
import SwiftUI

enum ChihayaStyle {
    static let paperNSColor = NSColor(srgbRed: 0.969, green: 0.969, blue: 0.941, alpha: 1)
    static let inkNSColor = NSColor(srgbRed: 0.40, green: 0.341, blue: 0.416, alpha: 1)
    static let roseNSColor = NSColor(srgbRed: 0.627, green: 0.435, blue: 0.569, alpha: 1)
    static let selectionNSColor = roseNSColor.withAlphaComponent(0.23)
    static let paper = Color(nsColor: paperNSColor)
    static let ink = Color(nsColor: inkNSColor)
    static let rose = Color(nsColor: roseNSColor)
    static let frame = Color(red: 0.537, green: 0.588, blue: 0.557)
    static let secondaryInk = ink.opacity(0.78)
    static let quietInk = ink.opacity(0.65)
    static let fieldFill = Color.white.opacity(0.44)
    static let divider = frame.opacity(0.35)
    static let bodyNSFont = font(["Yuanti SC", "Yuanti SC Regular"], size: 18)
    static let nameNSFont = font(["Hannotate SC", "HannotateSC-W5", "HanziPen SC", "Yuanti SC"], size: 24)
    static let editorNSFont = font(["Yuanti SC", "Yuanti SC Regular"], size: 15)
    static var bodyFont: Font { Font(bodyNSFont) }
    static var nameFont: Font { Font(nameNSFont) }
    static var editorFont: Font { Font(editorNSFont) }
    static let interfaceFont = Font(font(["Yuanti SC", "Yuanti SC Regular"], size: 13))
    static let captionFont = Font(font(["Yuanti SC", "Yuanti SC Regular"], size: 12))
    static let footnoteFont = Font(font(["Yuanti SC", "Yuanti SC Regular"], size: 11))
    static let sectionFont = Font(font(["Yuanti SC", "Yuanti SC Regular"], size: 16)).weight(.medium)

    /// Apply visual attributes without replacing the text storage or selection.
    @MainActor
    static func configureEditor(_ editor: NSTextView) {
        guard !editor.hasMarkedText() else { return }
        var typing = editor.typingAttributes
        editor.font = editorNSFont
        editor.textColor = inkNSColor
        editor.backgroundColor = paperNSColor
        editor.drawsBackground = false
        editor.insertionPointColor = roseNSColor
        editor.selectedTextAttributes = [
            .backgroundColor: selectionNSColor,
            .foregroundColor: inkNSColor
        ]
        typing[.font] = editorNSFont
        typing[.foregroundColor] = inkNSColor
        editor.typingAttributes = typing
    }

    @MainActor
    static func configureWindow(_ window: NSWindow) {
        let appearance = NSAppearance(named: .aqua)
        window.appearance = appearance
        window.contentView?.appearance = appearance
    }

    private static func font(_ names: [String], size: CGFloat) -> NSFont {
        for name in names { if let font = NSFont(name: name, size: size) { return font } }
        return .systemFont(ofSize: size)
    }
    static let bodyHeight: CGFloat = 96
    static let panelSize = CGSize(width: 472, height: 296)
}
