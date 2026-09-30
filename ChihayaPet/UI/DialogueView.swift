import AppKit
import SwiftUI
import CoreText

struct DialogueView: View {
    @ObservedObject var presentation: DialoguePresentation
    var local = false
    var truncated = false
    var onClose: () -> Void
    var body: some View {
        GeometryReader { geo in
            let width = max(200, geo.size.width - 52)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 13).fill(ChihayaStyle.paper)
                    .overlay(DialogueBorder()).shadow(color: .black.opacity(0.10), radius: 5, y: 3)
                    .frame(width: width, height: 236).offset(x: 26, y: 40)
                VStack(alignment: .leading, spacing: 12) {
                    Text("妃宫千早").font(ChihayaStyle.nameFont).tracking(1.5).foregroundStyle(ChihayaStyle.rose)
                    DialogueTextSurface(text: presentation.visibleText, accessibleText: presentation.pages[presentation.pageIndex], style: presentation.style, onAdvance: { presentation.advance() })
                        .frame(height: ChihayaStyle.bodyHeight)
                        .accessibilityAction(named: "显示全文或下一页") { presentation.advance() }
                    HStack(spacing: 10) {
                        Text(local ? "片刻闲话" : (truncated ? "回复已截断" : "与你相伴"))
                            .font(.system(size: 9)).foregroundStyle(ChihayaStyle.frame)
                        Spacer(minLength: 0)
                        if presentation.pageIndex > 0 {
                            Button { presentation.previous() } label: { Image(systemName: "chevron.left") }.help("上一页")
                        }
                        Button { presentation.advance() } label: {
                            Text(!presentation.pageComplete ? "显示全文 ◇" : (presentation.finished ? "读毕 ◇" : "继续 ◆"))
                        }.help("点击正文也可显示全文或翻页")
                        if presentation.pages.count > 1 { Text("\(presentation.pageIndex + 1)/\(presentation.pages.count)").monospacedDigit() }
                        Button(action: onClose) { Image(systemName: "xmark") }.help("关闭对白")
                    }.font(.system(size: 10)).foregroundStyle(ChihayaStyle.rose).buttonStyle(.plain)
                }.frame(width: width - 64, alignment: .leading).offset(x: 58, y: 62)
                IrisOrnament().frame(width: 82, height: 107).rotationEffect(.degrees(9)).offset(x: geo.size.width - 90, y: 0)
                GardeniaOrnament().frame(width: 85, height: 85).rotationEffect(.degrees(-12)).offset(x: 0, y: 211)
            }
            .onAppear { presentation.reflow(width: width - 64) }
            .onChange(of: width) { _, value in presentation.reflow(width: value - 64) }
            .onDisappear { presentation.stop() }
            .onHover { presentation.setHovered($0) }
        }
        .chihayaTheme()
    }
}

struct DialogueTextSurface: NSViewRepresentable {
    let text: String
    let accessibleText: String
    var style: DialogueTextStyle = .reply
    let onAdvance: () -> Void
    func makeNSView(context: Context) -> DialogueTextDrawing { DialogueTextDrawing() }
    func updateNSView(_ view: DialogueTextDrawing, context: Context) {
        view.text = text; view.style = style; view.onAdvance = onAdvance; view.setAccessibilityLabel(accessibleText); view.needsDisplay = true
    }
}

final class DialogueTextDrawing: NSView {
    var text = ""
    var style: DialogueTextStyle = .reply
    var onAdvance: (() -> Void)?
    override var acceptsFirstResponder: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { onAdvance?() }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true); setAccessibilityRole(.staticText)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func draw(_ dirtyRect: NSRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let frame = DialogueTextLayout.frame(text, width: bounds.width, height: bounds.height, style: style)
        context.saveGState(); context.textMatrix = .identity; CTFrameDraw(frame, context); context.restoreGState()
    }
}
