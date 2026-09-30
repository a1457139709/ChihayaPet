import SwiftUI

struct ChatView: View {
    @ObservedObject var store: AppStore
    var onClose: () -> Void
    var onSettings: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var followsBottom = true
    private let accent = ChihayaStyle.rose
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                ChihayaHeaderFlowers()
                VStack(alignment: .leading, spacing: 2) {
                    Text("妃宫千早").font(ChihayaStyle.nameFont).foregroundStyle(accent)
                    Text("片刻相伴").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                }
                Spacer(minLength: 4)
                Button(action: onSettings) { Image(systemName: "gearshape").frame(width: 24, height: 28) }
                    .help("设置").accessibilityLabel("设置")
                Button(action: onClose) { Image(systemName: "xmark").frame(width: 24, height: 28) }
                    .help("收起聊天 · Escape").accessibilityLabel("收起聊天")
            }.buttonStyle(.plain).foregroundStyle(accent).padding(.horizontal, 20).padding(.vertical, 9)
            ChihayaDivider().padding(.horizontal, 18)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(store.greeting).font(ChihayaStyle.editorFont)
                        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                            .background(accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                        if store.history.didTrim {
                            Text("较早消息已从本次内存记录中移除").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                        }
                        ForEach(store.history.turns) { turn in
                            message(turn.user, author: "你", user: true)
                            message(!reduceMotion && store.displayedChatTurnID == turn.id ? store.displayedChatText : turn.assistant, author: "千早", user: false).id(turn.id)
                            if turn.truncated { Text("回复因服务长度限制而截断").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk) }
                        }
                        if let pending = store.pendingInput { message(pending, author: "你 · 待完成", user: true) }
                        if !store.streamingText.isEmpty {
                            message(reduceMotion ? store.streamingText : store.displayedChatText, author: store.coordinator.activeKind == .chat ? "千早" : "千早 · 未完成", user: false)
                        }
                        if store.coordinator.activeKind == .chat && store.streamingText.isEmpty {
                            HStack(spacing: 8) { ProgressView().controlSize(.small); Text("思考ing…").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk) }
                        }
                        if let error = store.chatError {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(error).font(ChihayaStyle.captionFont).foregroundStyle(.red)
                                if store.pendingInput != nil { Button("重试") { store.retry() }.disabled(store.isBusy) }
                            }
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }.padding(.horizontal, 20).padding(.vertical, 14)
                }
                .onScrollPhaseChange { _, phase, context in
                    if phase == .idle {
                        let geometry = context.geometry
                        followsBottom = geometry.contentSize.height - geometry.visibleRect.maxY < 48
                    } else if phase == .interacting { followsBottom = false }
                }
                .onChange(of: store.chatReplyFocusRequest) { _, _ in
                    if let target = store.chatReplyFocus { followsBottom = false; proxy.scrollTo(target, anchor: .top) }
                }
                .onChange(of: store.chatError) { _, _ in if followsBottom { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: store.displayedChatText) { _, _ in if followsBottom { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: store.streamingText) { _, _ in if followsBottom { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: store.history.turns.count) { _, _ in if followsBottom { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: store.pendingInput) { _, value in
                    if value != nil { followsBottom = true; proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
            ChihayaDivider().padding(.horizontal, 18)
            VStack(spacing: 8) {
                MessageInput(text: $store.input, onSend: { store.send() }, onClose: onClose)
                    .frame(height: 64)
                    .background(ChihayaStyle.fieldFill, in: RoundedRectangle(cornerRadius: 9))
                    .overlay(RoundedRectangle(cornerRadius: 9).stroke(ChihayaStyle.divider, lineWidth: 0.7).allowsHitTesting(false))
                    .overlay(alignment: .topLeading) {
                        if store.input.isEmpty { Text("想和我聊些什么？").font(ChihayaStyle.editorFont).foregroundStyle(ChihayaStyle.quietInk).padding(10).allowsHitTesting(false) }
                    }
                HStack {
                    Button("清空") { store.clearConversation() }.buttonStyle(.plain).foregroundStyle(ChihayaStyle.secondaryInk)
                    Spacer()
                    Text("\(store.input.count)/2000").font(ChihayaStyle.footnoteFont).monospacedDigit()
                        .foregroundStyle(store.input.count > 2_000 ? Color.red : ChihayaStyle.secondaryInk)
                    if store.isBusy { Button("取消") { store.cancelRequest() } }
                    Button("发送") { store.send() }
                        .buttonStyle(.borderedProminent).tint(accent)
                        .disabled(store.isBusy || store.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.input.count > 2_000)
                }.font(ChihayaStyle.captionFont)
                Text("仅本次运行保留 · Shift+Enter 换行").font(ChihayaStyle.footnoteFont).foregroundStyle(ChihayaStyle.quietInk)
            }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 18)
        }.frame(width: 360, height: 420).background(ChihayaPanelChrome()).chihayaTheme()
    }
    private func message(_ text: String, author: String, user: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(author).font(ChihayaStyle.footnoteFont.weight(.medium)).foregroundStyle(user ? ChihayaStyle.secondaryInk : accent)
            Text(text).font(ChihayaStyle.editorFont).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(user ? ChihayaStyle.frame.opacity(0.10) : accent.opacity(0.055), in: RoundedRectangle(cornerRadius: 10))
    }
}
