import AppKit
import SwiftUI
import Combine

private final class ChatPanel: NSPanel {
    var closeAction: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func cancelOperation(_ sender: Any?) { closeAction?() }
}

@MainActor
final class InteractionWindows: NSObject, NSWindowDelegate {
    private let store: AppStore
    private let desktop: DesktopController
    private let music: MusicController?
    private let defaults: UserDefaults
    private var chatPanel: ChatPanel?
    private var settingsWindow: NSWindow?
    private var bubblePanel: NSPanel?
    private var previousApplication: NSRunningApplication?
    private var subscriptions: Set<AnyCancellable> = []
    private enum SpeechKind { case idle, reply }
    private var speechKind: SpeechKind?
    private var speechPresentation: DialoguePresentation?
    private var speechPosition: IdleBubblePosition?
    private var speechExpires: Date?
    private var speechID = UUID()
    private var displayedReply: ModelReply?
    private var replyTurnID: UUID?
    private var hasReadMore = false
    private var interactionsSuppressed = false
    var currentIdlePresentation: DialoguePresentation? { speechKind == .idle ? speechPresentation : nil }
    var currentReplyPresentation: DialoguePresentation? { speechKind == .reply ? speechPresentation : nil }
    var speechWindowNumber: Int? { bubblePanel?.windowNumber }
    var isChatVisible: Bool { chatPanel?.isVisible == true }
    var isSpeechBubbleVisible: Bool { bubblePanel?.isVisible == true }
    private var idleSchedule = IdleSpeechSchedule()
    private var idleCatalog = IdleSpeechCatalog()
    private var idleTimer: Timer?
    private var idleAwake = true
    private var idleObservers: [NSObjectProtocol] = []
    private var latestCoordinatorBusy = false
    private var latestDraft = ""
    private(set) var isWaitingForReply = false
    private(set) var isSpeaking = false
    var idleEnabled: Bool { defaults.object(forKey: "idle.enabled") as? Bool ?? true }
    var idleFrequency: IdleSpeechFrequency { IdleSpeechFrequency(rawValue: defaults.integer(forKey: "idle.frequency") - 1) ?? .normal }
    private var idleAllowed: Bool {
        idleAwake && !interactionsSuppressed && desktop.isVisible && !desktop.clickThrough && chatPanel?.isVisible != true && settingsWindow?.isVisible != true && !store.isBusy && store.bubble == nil && store.input.isEmpty
    }

    init(store: AppStore, desktop: DesktopController, music: MusicController? = nil, defaults: UserDefaults = .standard) {
        self.store = store; self.desktop = desktop; self.music = music; self.defaults = defaults
        latestCoordinatorBusy = store.coordinator.isBusy
        latestDraft = store.input
        super.init()
        store.$bubble.sink { [weak self] reply in
            guard let self else { return }
            self.showBubble(reply)
        }.store(in: &subscriptions)
        store.coordinator.$isBusy.sink { [weak self] busy in
            self?.recomputeActivity(coordinatorBusy: busy)
            if busy && self?.store.coordinator.activeKind == .chat { self?.hideSpeech() }
        }.store(in: &subscriptions)
        store.$input.sink { [weak self] draft in
            self?.recomputeActivity(draft: draft)
        }.store(in: &subscriptions)
        desktop.onAnimationPolicyChanged = { [weak self] in
            self?.applyAnimationPolicy()
        }
        store.onRequestCancelled = { [weak self] kind in
            self?.requestCancelled(kind)
        }
        idleTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tickIdle() }
        }
        idleTimer?.tolerance = 0.5
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.didWakeNotification] {
            idleObservers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                MainActor.assumeIsolated {
                    self?.idleAwake = note.name == NSWorkspace.didWakeNotification
                    self?.dismissIdle()
                    self?.idleSchedule.reset()
                    if self?.idleAwake == true {
                        self?.music?.resume(.sleep)
                        if let self { self.showBubble(self.store.bubble) }
                    } else {
                        self?.hideSpeech()
                        self?.music?.suspend(.sleep)
                    }
                }
            })
        }
    }
    func setIdleEnabled(_ enabled: Bool) {
        defaults.set(enabled, forKey: "idle.enabled")
        dismissIdle(); idleSchedule.reset()
    }
    func setIdleFrequency(_ frequency: IdleSpeechFrequency) {
        defaults.set(frequency.rawValue + 1, forKey: "idle.frequency")
        idleSchedule.reset()
    }
    var canSayIdleLine: Bool { idleAllowed }
    func sayIdleLine() {
        guard idleAllowed else { return }
        showSpeech(idleCatalog.next(hour: Calendar.current.component(.hour, from: Date())), kind: .idle)
    }
    func tickIdle(now: Date = Date()) {
        if speechKind == .idle && !idleAllowed { dismissIdle() }
        if isSpeechBubbleVisible, speechPresentation?.hovered != true,
           let deadline = speechExpires, now >= deadline {
            dismissSpeech()
        }
        if idleSchedule.advance(now: now, allowed: idleEnabled && idleAllowed && !isSpeechBubbleVisible, delay: idleFrequency.delay) { sayIdleLine() }
    }
    private var dialogueAnimated: Bool { desktop.effectiveAnimationsEnabled }
    private func dismissIdle() {
        if speechKind == .idle { clearSpeech() }
    }
    private func hideSpeech() {
        speechExpires = nil
        speechPresentation?.stop()
        bubblePanel?.orderOut(nil)
        recomputeActivity()
    }
    private func clearSpeech() {
        speechID = UUID()
        let previous = speechPresentation
        speechPresentation = nil; speechKind = nil
        previous?.stop()
        bubblePanel?.orderOut(nil)
        speechPosition = nil; speechExpires = nil; displayedReply = nil; replyTurnID = nil
        hasReadMore = false
        idleSchedule.reset()
        recomputeActivity()
    }
    func dismissSpeech() {
        let wasReply = speechKind == .reply
        clearSpeech()
        if wasReply { store.bubble = nil }
    }
    private func showSpeech(_ text: String, kind: SpeechKind, readMore: Bool = false) {
        clearSpeech()
        if bubblePanel == nil {
            let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.isReleasedWhenClosed = false; panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenNone]
            panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
            panel.hidesOnDeactivate = false
            bubblePanel = panel
        }
        speechKind = kind; hasReadMore = readMore
        let presentation = DialoguePresentation(text: text, width: IdleBubbleLayout.textWidth, style: .idle, paginated: false, animated: dialogueAnimated)
        speechPresentation = presentation
        let position = IdleBubblePosition(IdleBubbleLayout(pet: desktop.frame, screen: desktop.visibleFrame, textHeight: presentation.height, attachment: desktop.speechAttachment, hasReadMore: readMore))
        speechPosition = position
        let id = speechID
        presentation.onPlaybackChanged = { [weak self] _ in
            guard let self, self.speechID == id else { return }
            self.recomputeActivity()
        }
        presentation.onReadStateChanged = { [weak self] complete in
            guard let self, self.speechID == id else { return }
            self.speechExpires = complete ? Date().addingTimeInterval(12) : nil
        }
        presentation.onHoverChanged = { [weak self, weak presentation] in
            guard let self, self.speechID == id else { return }
            self.speechExpires = presentation?.finished == true ? Date().addingTimeInterval(12) : nil
        }
        let more: (() -> Void)? = readMore ? { [weak self] in
            guard let self, self.speechID == id else { return }
            self.readFullReply()
        } : nil
        bubblePanel?.contentView = NSHostingView(rootView: IdleBubbleView(presentation: presentation, position: position, onClose: { [weak self] in
            guard let self, self.speechID == id else { return }
            self.dismissSpeech()
        }, onReadMore: more))
        if let bubblePanel { ChihayaStyle.configureWindow(bubblePanel) }
        positionBubble()
        if idleAwake { bubblePanel?.orderFrontRegardless(); presentation.start() }
        idleSchedule.reset(); recomputeActivity()
    }
    func readFullReply() {
        guard let turnID = replyTurnID else { return }
        openChat()
        store.focusChatReply(turnID)
    }
    func shutdown() {
        idleTimer?.invalidate(); idleTimer = nil; dismissIdle()
        clearSpeech()
        for token in idleObservers { NSWorkspace.shared.notificationCenter.removeObserver(token) }
        idleObservers.removeAll()
        subscriptions.removeAll()
        store.onRequestCancelled = nil
        desktop.onAnimationPolicyChanged = nil
        isWaitingForReply = false
        isSpeaking = false
        desktop.setActivity(waitingForReply: false, speaking: false)
    }
    func openChat() {
        interactionsSuppressed = false
        hideSpeech()
        dismissIdle(); idleSchedule.reset()
        rememberFocus()
        desktop.show()
        music?.resume(.hidden)
        if chatPanel == nil {
            let panel = ChatPanel(contentRect: .zero, styleMask: [.borderless], backing: .buffered, defer: false)
            panel.isReleasedWhenClosed = false; panel.level = .floating
            panel.collectionBehavior = [.moveToActiveSpace, .fullScreenNone]
            panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
            panel.closeAction = { [weak self] in self?.closeChat() }
            let host = NSHostingView(rootView: ChatView(store: store, onClose: { [weak self] in self?.closeChat() }, onSettings: { [weak self] in self?.openSettings() }))
            host.wantsLayer = true; host.layer?.cornerRadius = 16; host.layer?.masksToBounds = true
            panel.contentView = host
            chatPanel = panel
        }
        if let chatPanel { ChihayaStyle.configureWindow(chatPanel) }
        reposition()
        NSApp.activate(ignoringOtherApps: true)
        chatPanel?.makeKeyAndOrderFront(nil)
        if let composer = findComposer(in: chatPanel?.contentView) { chatPanel?.makeFirstResponder(composer) }
        hideSpeech()
        recomputeActivity()
    }
    func closeChat(restoreFocus: Bool = true, showReply: Bool = true) {
        chatPanel?.orderOut(nil)
        if showReply { showBubble(store.bubble) }
        recomputeActivity()
        if restoreFocus { restorePreviousFocus() }
    }
    func openSettings() {
        hideSpeech()
        dismissIdle(); idleSchedule.reset()
        rememberFocus()
        if settingsWindow == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 580), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
            window.title = "千早桌宠 · 设置"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SettingsView(store: store, music: music))
            window.delegate = self
            settingsWindow = window
        }
        if let settingsWindow { ChihayaStyle.configureWindow(settingsWindow) }
        if settingsWindow?.isVisible != true { store.beginSettings() }
        settingsWindow?.center()
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
        recomputeActivity()
    }
    func hideInteractions() {
        interactionsSuppressed = true
        hideSpeech()
        dismissIdle(); idleSchedule.reset()
        currentReplyPresentation?.stop()
        closeChat(restoreFocus: false, showReply: false); settingsWindow?.orderOut(nil); bubblePanel?.orderOut(nil)
        recomputeActivity()
        restorePreviousFocus()
    }
    func reposition() {
        let screen = desktop.visibleFrame
        chatPanel?.setFrame(Geometry.nearbyPanel(size: CGSize(width: 360, height: 420), pet: desktop.frame, screen: screen), display: true)
        positionBubble()
    }
    func refreshVisibility() {
        if desktop.isVisible { interactionsSuppressed = false; music?.resume(.hidden); showBubble(store.bubble) }
        else { music?.suspend(.hidden); hideInteractions() }
    }
    func openMusicSettings() { openSettings(); store.settingsTab = 2 }
    func windowWillClose(_ notification: Notification) {
        if notification.object as? NSWindow === settingsWindow {
            // A closed settings draft can no longer display a useful test result.
            store.coordinator.draftChanged()
            DispatchQueue.main.async { [weak self] in
                self?.restorePreviousFocus()
                if let self { self.showBubble(self.store.bubble) }
                self?.recomputeActivity()
            }
        }
    }
    private func showBubble(_ reply: ModelReply?) {
        guard let reply else {
            if speechKind == .reply { clearSpeech() }
            return
        }
        guard desktop.isVisible, !desktop.clickThrough, !interactionsSuppressed,
              chatPanel?.isVisible != true, settingsWindow?.isVisible != true,
              store.pendingInput == nil, !store.isBusy else {
            hideSpeech()
            return
        }
        if displayedReply != reply || currentReplyPresentation == nil || replyTurnID != store.history.turns.last?.id {
            let excerpt = ReplyBubbleExcerpt(reply.text)
            showSpeech(excerpt.text, kind: .reply, readMore: excerpt.needsReadMore || reply.truncated)
            displayedReply = reply
            replyTurnID = store.history.turns.last?.id
        } else if idleAwake {
            positionBubble()
            bubblePanel?.orderFrontRegardless()
            currentReplyPresentation?.start()
            if currentReplyPresentation?.finished == true { speechExpires = Date().addingTimeInterval(12) }
            recomputeActivity()
        }
    }
    private func positionBubble() {
        guard let presentation = speechPresentation else { return }
        let layout = IdleBubbleLayout(pet: desktop.frame, screen: desktop.visibleFrame, textHeight: presentation.height, attachment: desktop.speechAttachment, hasReadMore: hasReadMore)
        speechPosition?.layout = layout
        bubblePanel?.setFrame(layout.frame, display: true)
    }
    private func rememberFocus() {
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != ProcessInfo.processInfo.processIdentifier { previousApplication = front }
    }
    private func restorePreviousFocus() {
        guard settingsWindow?.isVisible != true, chatPanel?.isVisible != true else { return }
        if let previousApplication, !previousApplication.isTerminated { previousApplication.activate(options: []) }
        previousApplication = nil
    }
    private func applyAnimationPolicy() {
        let animated = dialogueAnimated
        currentIdlePresentation?.setAnimated(animated)
        currentReplyPresentation?.setAnimated(animated)
        recomputeActivity()
    }
    private func requestCancelled(_ kind: RequestKind) {
        guard case .chat = kind,
              currentReplyPresentation?.isPlaying == true else { return }
        currentReplyPresentation?.advance()
        recomputeActivity()
    }
    private func recomputeActivity(coordinatorBusy: Bool? = nil, draft: String? = nil) {
        if let coordinatorBusy { latestCoordinatorBusy = coordinatorBusy }
        if let draft { latestDraft = draft }
        let waiting = latestCoordinatorBusy && store.coordinator.activeKind == .chat
        let speaking = idleAwake && isSpeechBubbleVisible && speechPresentation?.isPlaying == true
        isWaitingForReply = waiting
        isSpeaking = speaking
        desktop.setActivity(waitingForReply: waiting, speaking: speaking)
        desktop.setInteractionContext(
            chatVisible: chatPanel?.isVisible == true,
            settingsVisible: settingsWindow?.isVisible == true,
            draftActive: !latestDraft.isEmpty,
            requestActive: latestCoordinatorBusy,
            bubbleVisible: isSpeechBubbleVisible
        )
    }
    private func findComposer(in view: NSView?) -> ComposerTextView? {
        if let editor = view as? ComposerTextView { return editor }
        for child in view?.subviews ?? [] { if let found = findComposer(in: child) { return found } }
        return nil
    }
}
