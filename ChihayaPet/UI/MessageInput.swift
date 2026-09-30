import AppKit
import SwiftUI

enum InputKeyAction { case send, close, system }
enum InputKeyPolicy {
    static func action(keyCode: UInt16, shift: Bool, marked: Bool) -> InputKeyAction {
        guard !marked else { return .system }
        if (keyCode == 36 || keyCode == 76) && !shift { return .send }
        if keyCode == 53 { return .close }
        return .system
    }
}

final class ComposerTextView: NSTextView {
    var onSend: (() -> Void)?
    var onClose: (() -> Void)?
    override func keyDown(with event: NSEvent) {
        switch InputKeyPolicy.action(keyCode: event.keyCode, shift: event.modifierFlags.contains(.shift), marked: hasMarkedText()) {
        case .send: onSend?()
        case .close: onClose?()
        case .system: super.keyDown(with: event)
        }
    }
}

struct MessageInput: NSViewRepresentable {
    @Binding var text: String
    var onSend: () -> Void
    var onClose: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true; scroll.drawsBackground = false
        let editor = ComposerTextView()
        editor.isRichText = false; editor.importsGraphics = false
        editor.isAutomaticQuoteSubstitutionEnabled = false
        editor.isAutomaticDashSubstitutionEnabled = false
        editor.textContainerInset = NSSize(width: 8, height: 8)
        editor.isVerticallyResizable = true; editor.isHorizontallyResizable = false
        editor.autoresizingMask = [.width]
        editor.textContainer?.widthTracksTextView = true
        editor.setAccessibilityLabel("消息输入")
        editor.setAccessibilityIdentifier("messageInput")
        editor.delegate = context.coordinator
        editor.onSend = onSend; editor.onClose = onClose
        editor.string = text
        ChihayaStyle.configureEditor(editor)
        scroll.documentView = editor
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let editor = scroll.documentView as? ComposerTextView else { return }
        editor.onSend = onSend; editor.onClose = onClose
        if editor.string != text && !editor.hasMarkedText() {
            editor.string = text
            editor.setSelectedRange(NSRange(location: (text as NSString).length, length: 0))
            ChihayaStyle.configureEditor(editor)
        }
    }
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MessageInput
        init(_ parent: MessageInput) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let editor = notification.object as? NSTextView else { return }
            parent.text = editor.string
        }
    }
}

/// A native multiline editor for settings, with no chat keyboard shortcuts.
struct ThemedPlainTextEditor: NSViewRepresentable {
    @Binding var text: String
    var accessibilityLabel: String

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.drawsBackground = false
        let editor = NSTextView()
        editor.isRichText = false
        editor.importsGraphics = false
        editor.allowsUndo = true
        editor.isVerticallyResizable = true
        editor.isHorizontallyResizable = false
        editor.autoresizingMask = [.width]
        editor.textContainer?.widthTracksTextView = true
        editor.textContainerInset = NSSize(width: 8, height: 8)
        editor.setAccessibilityLabel(accessibilityLabel)
        editor.delegate = context.coordinator
        editor.string = text
        ChihayaStyle.configureEditor(editor)
        scroll.documentView = editor
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let editor = scroll.documentView as? NSTextView else { return }
        editor.setAccessibilityLabel(accessibilityLabel)
        guard editor.string != text, !editor.hasMarkedText() else { return }
        let selection = editor.selectedRange()
        let length = (text as NSString).length
        editor.string = text
        let location = min(selection.location, length)
        editor.setSelectedRange(NSRange(location: location, length: min(selection.length, length - location)))
        ChihayaStyle.configureEditor(editor)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ThemedPlainTextEditor
        init(_ parent: ThemedPlainTextEditor) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let editor = notification.object as? NSTextView else { return }
            parent.text = editor.string
        }
    }
}
