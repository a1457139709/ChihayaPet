import AppKit
import CoreText

struct DialogueTextStyle {
    let font: NSFont
    let lineSpacing: CGFloat
    let kern: CGFloat
    static let reply = DialogueTextStyle(font: ChihayaStyle.bodyNSFont, lineSpacing: 5, kern: 0.4)
    static let idle = DialogueTextStyle(font: NSFont(descriptor: ChihayaStyle.bodyNSFont.fontDescriptor, size: 15) ?? .systemFont(ofSize: 15), lineSpacing: 4, kern: 0.4)

    func attributed(_ text: String) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = lineSpacing
        paragraph.lineBreakMode = .byWordWrapping
        return NSAttributedString(string: text, attributes: [.font: font, .paragraphStyle: paragraph, .kern: kern, .foregroundColor: NSColor(ChihayaStyle.ink)])
    }
}

enum DialogueTextLayout {
    static func frame(_ text: String, width: CGFloat, height: CGFloat, style: DialogueTextStyle) -> CTFrame {
        let setter = CTFramesetterCreateWithAttributedString(style.attributed(text))
        return CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), CGPath(rect: CGRect(x: 0, y: 0, width: max(1, width), height: max(1, height)), transform: nil), nil)
    }
    static func height(_ text: String, width: CGFloat, style: DialogueTextStyle) -> CGFloat {
        let setter = CTFramesetterCreateWithAttributedString(style.attributed(text))
        let size = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(location: 0, length: 0), nil, CGSize(width: max(1, width), height: .greatestFiniteMagnitude), nil)
        return max(38, ceil(size.height) + 2)
    }
}
