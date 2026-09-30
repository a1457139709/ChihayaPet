import AppKit
import SwiftUI
import Combine
import CoreText

struct ReplyBubbleExcerpt {
    let text: String
    let needsReadMore: Bool

    init(_ source: String) {
        let prefix = String(source.prefix(60))
        if prefix == source && Self.fits(prefix) {
            text = source
            needsReadMore = false
            return
        }
        var excerpt = String(source.prefix(59))
        while !excerpt.isEmpty && !Self.fits(excerpt + "…") {
            excerpt.removeLast()
        }
        text = excerpt + "…"
        needsReadMore = true
    }

    private static func fits(_ text: String) -> Bool {
        let height = IdleBubbleLayout.textHeight(text)
        let frame = DialogueTextLayout.frame(text, width: IdleBubbleLayout.textWidth, height: height, style: .idle)
        return (CTFrameGetLines(frame) as NSArray).count <= 4
            && CTFrameGetVisibleStringRange(frame).length == text.utf16.count
    }
}

struct IdleBubbleLayout {
    let frame: CGRect
    let tailOnRight: Bool
    let tailY: CGFloat
    let hasReadMore: Bool
    static let textWidth: CGFloat = 184
    private static let outlineInsetX: CGFloat = 12
    // Include the flower overhangs in the window so screen clamping keeps them visible.
    var outlineFrame: CGRect { CGRect(x: Self.outlineInsetX, y: 16, width: frame.width - Self.outlineInsetX * 2, height: frame.height - 40) }
    var bodyFrame: CGRect {
        CGRect(x: outlineFrame.minX + (tailOnRight ? 0 : 18), y: outlineFrame.minY, width: outlineFrame.width - 18, height: outlineFrame.height)
    }
    var textFrame: CGRect { CGRect(x: bodyFrame.minX + 26, y: 62, width: Self.textWidth, height: frame.height - 110 - (hasReadMore ? 24 : 0)) }
    var footerFrame: CGRect { CGRect(x: textFrame.minX, y: textFrame.maxY + 2, width: textFrame.width, height: hasReadMore ? 22 : 0) }
    init(
        pet _: CGRect,
        screen: CGRect,
        textHeight: CGFloat,
        attachment: CharacterSpeechAttachment,
        hasReadMore: Bool = false
    ) {
        self.hasReadMore = hasReadMore
        let mouth = attachment.mouth
        let size = CGSize(width: 278, height: textHeight + 110 + (hasReadMore ? 24 : 0))
        let leftTipX = attachment.hairLeft - 4
        let rightTipX = attachment.hairRight + 4
        // Anchor the visible tip, accounting for the transparent ornament margin.
        let leftX = leftTipX - size.width + Self.outlineInsetX
        tailOnRight = leftX >= screen.minX || screen.maxX - mouth.x < mouth.x - screen.minX
        let x = tailOnRight ? leftX : rightTipX - Self.outlineInsetX
        let preferredTailY = min(size.height - 62, max(54, size.height * 0.65))
        frame = Geometry.clamped(CGRect(x: x, y: mouth.y - size.height + preferredTailY, width: size.width, height: size.height), to: screen)
        tailY = min(size.height - 62, max(54, frame.maxY - mouth.y))
    }

    static func textHeight(_ text: String) -> CGFloat {
        DialogueTextLayout.height(text, width: textWidth, style: .idle)
    }
}

@MainActor
final class IdleBubblePosition: ObservableObject {
    @Published var layout: IdleBubbleLayout
    init(_ layout: IdleBubbleLayout) { self.layout = layout }
}

private struct SpeechOutline: InsettableShape {
    var tailY: CGFloat
    var insetAmount: CGFloat = 0
    func inset(by amount: CGFloat) -> SpeechOutline {
        var outline = self
        outline.insetAmount += amount
        return outline
    }
    func path(in rect: CGRect) -> Path {
        let bounds = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let w = bounds.width - 18, h = bounds.height, r = 27 - insetAmount
        let y = min(h - 20, max(20, tailY - insetAmount))
        var p = Path()
        p.move(to: CGPoint(x: r, y: 0))
        p.addLine(to: CGPoint(x: w-r, y: 0))
        p.addQuadCurve(to: CGPoint(x: w, y: r), control: CGPoint(x: w, y: 0))
        p.addLine(to: CGPoint(x: w, y: y-10))
        p.addQuadCurve(to: CGPoint(x: bounds.width, y: y), control: CGPoint(x: w+5, y: y-1))
        p.addQuadCurve(to: CGPoint(x: w, y: y+7), control: CGPoint(x: w+8, y: y+8))
        p.addLine(to: CGPoint(x: w, y: h-r))
        p.addQuadCurve(to: CGPoint(x: w-r, y: h), control: CGPoint(x: w, y: h))
        p.addLine(to: CGPoint(x: r, y: h))
        p.addQuadCurve(to: CGPoint(x: 0, y: h-r), control: CGPoint(x: 0, y: h))
        p.addLine(to: CGPoint(x: 0, y: r))
        p.addQuadCurve(to: CGPoint(x: r, y: 0), control: .zero)
        p.closeSubpath()
        return p.offsetBy(dx: bounds.minX, dy: bounds.minY)
    }
}

struct IdleBubbleView: View {
    @ObservedObject var presentation: DialoguePresentation
    @ObservedObject var position: IdleBubblePosition
    var onClose: () -> Void
    var onReadMore: (() -> Void)? = nil
    @State private var hovered = false
    var body: some View {
        let layout = position.layout
        let outline = SpeechOutline(tailY: layout.tailY - layout.outlineFrame.minY)
        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                outline.fill(ChihayaStyle.paper)
                outline.stroke(ChihayaStyle.frame.opacity(0.85), lineWidth: 1.5)
                outline.inset(by: 5).stroke(ChihayaStyle.frame.opacity(0.55), lineWidth: 0.7)
                DialogueCornerLoops(size: 28)
                    .frame(width: layout.bodyFrame.width - 12, height: layout.bodyFrame.height - 12)
                    .offset(x: 6, y: 6)
            }
            .frame(width: layout.outlineFrame.width, height: layout.outlineFrame.height)
            .scaleEffect(x: layout.tailOnRight ? 1 : -1, y: 1)
            .offset(x: layout.outlineFrame.minX, y: layout.outlineFrame.minY)
            .allowsHitTesting(false).accessibilityHidden(true)
            Text("妃宫千早")
                .font(ChihayaStyle.nameFont).tracking(1)
                .foregroundStyle(ChihayaStyle.rose)
                .frame(width: IdleBubbleLayout.textWidth, height: 30, alignment: .leading)
                .offset(x: layout.textFrame.minX, y: 26)
            DialogueTextSurface(text: presentation.visibleText, accessibleText: presentation.text, style: presentation.style, onAdvance: { presentation.advance() })
                .frame(width: layout.textFrame.width, height: layout.textFrame.height)
                .offset(x: layout.textFrame.minX, y: layout.textFrame.minY)
                .accessibilityAction(named: "显示全文") { presentation.advance() }
            IrisOrnament().frame(width: 48, height: 58)
                .offset(x: layout.bodyFrame.maxX - 38, y: 0)
            GardeniaOrnament().frame(width: 40, height: 40)
                .offset(x: layout.bodyFrame.minX - 10, y: layout.bodyFrame.maxY - 17)
            if let onReadMore, layout.hasReadMore {
                Button("查看全文", action: onReadMore)
                    .font(.system(size: 11, design: .rounded))
                    .buttonStyle(.plain).foregroundStyle(ChihayaStyle.rose)
                    .frame(width: layout.footerFrame.width, height: layout.footerFrame.height, alignment: .leading)
                    .offset(x: layout.footerFrame.minX, y: layout.footerFrame.minY)
            }
            if hovered {
                Button(action: onClose) { Image(systemName: "xmark").font(.system(size: 9)) }
                    .buttonStyle(.plain).foregroundStyle(ChihayaStyle.rose)
                    .frame(width: 18, height: 18)
                    .help("关闭气泡").accessibilityLabel("关闭气泡")
                    .offset(x: layout.bodyFrame.maxX - 44, y: layout.bodyFrame.maxY - 24)
            }
        }
        .frame(width: layout.frame.width, height: layout.frame.height, alignment: .topLeading)
        .onDisappear { presentation.stop() }
        .onHover { hovered = $0; presentation.setHovered($0) }
        .chihayaTheme()
    }
}
