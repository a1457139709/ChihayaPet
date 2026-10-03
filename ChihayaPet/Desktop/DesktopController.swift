import AppKit
import CoreGraphics

private final class PetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private final class PetInteractionView: NSView {
    var imageFrame: (() -> CGRect)?
    var onClick: (() -> Void)?
    var onFrameChanged: (() -> Void)?
    var onDragEnded: (() -> Void)?
    var onDragStateChanged: ((Bool) -> Void)?
    var onPointerMotion: ((CGPoint, Bool) -> Void)?
    var onPointerExit: (() -> Void)?

    private var mouseDownScreenPoint: CGPoint?
    private var mouseDownWindowOrigin: CGPoint?
    private var beganInsideImage = false
    private var exceededDragThreshold = false

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseMoved, .mouseEnteredAndExited, .inVisibleRect],
            owner: self,
            userInfo: nil
        ))
        super.updateTrackingAreas()
    }

    override func mouseMoved(with event: NSEvent) {
        onPointerMotion?(convert(event.locationInWindow, from: nil), NSEvent.pressedMouseButtons != 0)
    }

    override func mouseExited(with event: NSEvent) { onPointerExit?() }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        beganInsideImage = imageFrame?().contains(point) ?? false
        mouseDownScreenPoint = NSEvent.mouseLocation
        mouseDownWindowOrigin = window?.frame.origin
        exceededDragThreshold = false
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window,
              let startPoint = mouseDownScreenPoint,
              let startOrigin = mouseDownWindowOrigin else { return }

        let currentPoint = NSEvent.mouseLocation
        let deltaX = currentPoint.x - startPoint.x
        let deltaY = currentPoint.y - startPoint.y
        if hypot(deltaX, deltaY) > 4 {
            if !exceededDragThreshold { onDragStateChanged?(true) }
            exceededDragThreshold = true
        }

        if exceededDragThreshold {
            window.setFrameOrigin(CGPoint(x: startOrigin.x + deltaX, y: startOrigin.y + deltaY))
            onFrameChanged?()
        }
    }

    override func mouseUp(with event: NSEvent) {
        defer {
            mouseDownScreenPoint = nil
            mouseDownWindowOrigin = nil
        }

        if exceededDragThreshold {
            onDragStateChanged?(false)
            onDragEnded?()
        } else if beganInsideImage {
            onClick?()
        }
    }
}

@MainActor
final class DesktopController {
    var onOpenChat: (() -> Void)?
    var onGeometryChange: (() -> Void)?
    var onHide: (() -> Void)?
    var onAnimationPolicyChanged: (() -> Void)?

    var frame: CGRect { panel.frame }
    var visibleFrame: CGRect { screen(for: panel.frame)?.visibleFrame ?? .zero }
    var isVisible: Bool { panel.isVisible }
    var style: CharacterStyle { currentStyle }
    var expandedStyle: ExpandedCharacterStyle { currentExpandedStyle }
    var standingOutfit: StandingCharacterOutfit { currentStandingOutfit }
    var numberedExpressionMode: NumberedExpressionMode { renderer.numberedExpressionMode }
    var numberedExpressions: [StandingCharacterManifest.Result] { renderer.numberedExpressions }
    var renderedStandingVariantKey: String? { renderer.renderedStandingVariantKey }
    var renderedNumberedFaceID: String? { renderer.renderedNumberedFaceID }
    var isStandingImageUnavailable: Bool {
        renderer.renderedStandingVariantKey != "\(currentStandingOutfit.rawValue)/\(currentFraming.rawValue)" ||
        numberedExpressionMode != .automatic && renderer.renderedNumberedFaceID != numberedExpressionMode.rawValue
    }
    var framing: CharacterFraming { currentFraming }
    var expressionMode: CharacterExpressionMode { currentExpressionMode }
    var expandedExpressionMode: ExpandedCharacterExpressionMode { currentExpandedExpressionMode }
    var poseMode: CharacterPoseMode { currentPoseMode }
    var currentPose: CharacterPose { poseScheduler.presentedPose }
    var poseDeadline: TimeInterval? { poseScheduler.deadline }
    var gazeEnabled: Bool { currentGazeEnabled }
    var headPettingEnabled: Bool { currentHeadPettingEnabled }
    var imageHeight: Double { Double(currentImageHeight) }
    var isOnTop: Bool { currentOnTop }
    var animationsEnabled: Bool { currentAnimationsEnabled }
    var effectiveAnimationsEnabled: Bool { currentAnimationsEnabled && !currentReducedMotion }
    var clickThrough: Bool { currentClickThrough }
    var currentExpression: CharacterExpression { renderer.expression }
    var speechAttachment: CharacterSpeechAttachment {
        renderer.speechAttachment.translated(by: panel.frame.origin)
    }

    private enum Key {
        static let outfit = "desktop.outfit"
        static let style = "desktop.style"
        static let framing = "desktop.framing"
        static let expressionMode = "desktop.expressionMode"
        static let expandedStyle = "desktop.expandedStyle"
        static let standingOutfit = "desktop.standingOutfit"
        static let numberedExpression = "desktop.numberedExpression"
        static let expandedExpressionMode = "desktop.expandedExpressionMode"
        static let poseMode = "desktop.poseMode"
        static let gazeEnabled = "desktop.gazeEnabled"
        static let headPettingEnabled = "desktop.headPettingEnabled"
        static let imageHeight = "desktop.imageHeight"
        static let frameX = "desktop.frameX"
        static let frameY = "desktop.frameY"
        static let displayUUID = "desktop.displayUUID"
        static let onTop = "desktop.isOnTop"
        static let animations = "desktop.animationsEnabled"
    }

    private static let minimumHeight: CGFloat = 240
    private static let maximumHeight: CGFloat = 480
    private static let defaultHeight: CGFloat = 256
    private static let initialRightInset: CGFloat = 16

    private let defaults: UserDefaults
    private let panel: PetPanel
    private let renderer: PNGRenderer
    private let interactionView: PetInteractionView
    private let useNumberedSprites: Bool

    private var currentStyle: CharacterStyle
    private var currentExpandedStyle: ExpandedCharacterStyle
    private var currentStandingOutfit: StandingCharacterOutfit
    private var currentFraming: CharacterFraming
    private var currentExpressionMode: CharacterExpressionMode
    private var currentExpandedExpressionMode: ExpandedCharacterExpressionMode
    private var currentPoseMode: CharacterPoseMode
    private var currentGazeEnabled: Bool
    private var currentHeadPettingEnabled: Bool
    private var currentImageHeight: CGFloat
    private var currentOnTop: Bool
    private var currentAnimationsEnabled: Bool
    private var currentReducedMotion: Bool
    private var currentClickThrough = false
    private var poseScheduler: CharacterPoseScheduler
    private var poseTimer: Timer?
    private var poseTimerGeneration = CharacterDeadlineGeneration()
    private var gazeFilter: CharacterGazeFilter
    private var pettingDetector = HeadPettingDetector()
    private var petReaction = CharacterPetReactionTimeline()
    private var petTimer: Timer?
    private var petTimerGeneration = CharacterDeadlineGeneration()
    private let poseNow: () -> TimeInterval
    private var workspaceObserverTokens: [NSObjectProtocol] = []
    private var appObserverTokens: [NSObjectProtocol] = []
    private var didShutdown = false

    init(
        defaults: UserDefaults = .standard,
        expansionResourceURL: URL? = Bundle.main.url(forResource: "CharacterExpansion", withExtension: nil),
        standingResourceURL: URL? = Bundle.main.url(forResource: "Standing", withExtension: nil, subdirectory: "Characters"),
        useNumberedSprites: Bool = true,
        poseNow: @escaping () -> TimeInterval = { CACurrentMediaTime() },
        poseRandomDelay: @escaping () -> TimeInterval = { Double.random(in: 300...600) },
        choosePose: @escaping ([CharacterPose]) -> CharacterPose = { $0.randomElement()! }
    ) {
        self.defaults = defaults
        self.poseNow = poseNow
        self.useNumberedSprites = useNumberedSprites

        if let savedStyle = defaults.string(forKey: Key.style).flatMap(CharacterStyle.init(rawValue:)) {
            currentStyle = savedStyle
        } else {
            currentStyle = defaults.string(forKey: Key.outfit) == "summer" ? .summerFront : .winterFront
            defaults.set(currentStyle.rawValue, forKey: Key.style)
        }
        if let saved = defaults.string(forKey: Key.expandedStyle).flatMap(ExpandedCharacterStyle.init(rawValue:)) {
            currentExpandedStyle = saved
        } else {
            currentExpandedStyle = ExpandedCharacterStyle(rawValue: currentStyle.rawValue) ?? .winterFront
            defaults.set(currentExpandedStyle.rawValue, forKey: Key.expandedStyle)
        }
        currentFraming = defaults.string(forKey: Key.framing).flatMap(CharacterFraming.init(rawValue:)) ?? .full
        let savedOutfit = defaults.string(forKey: Key.standingOutfit)
        currentStandingOutfit = savedOutfit.flatMap(StandingCharacterOutfit.init(rawValue:)) ??
            (savedOutfit == nil ? StandingCharacterOutfit.migrated(currentExpandedStyle.rawValue) : nil) ?? .winterFront
        var numberedMode = NumberedExpressionMode(rawValue: defaults.string(forKey: Key.numberedExpression))
        let invalidOutfit = savedOutfit.map { StandingCharacterOutfit(rawValue: $0) == nil } ?? false
        let invalidFraming = defaults.string(forKey: Key.framing).map { CharacterFraming(rawValue: $0) == nil } ?? false
        if invalidOutfit || invalidFraming {
            numberedMode = .numbered("00")
        }
        currentExpressionMode = defaults.string(forKey: Key.expressionMode).flatMap(CharacterExpressionMode.init(rawValue:)) ?? .automatic
        if let saved = defaults.string(forKey: Key.expandedExpressionMode).flatMap(ExpandedCharacterExpressionMode.init(rawValue:)) {
            currentExpandedExpressionMode = saved
        } else {
            currentExpandedExpressionMode = ExpandedCharacterExpressionMode(rawValue: currentExpressionMode.rawValue) ?? .automatic
            defaults.set(currentExpandedExpressionMode.rawValue, forKey: Key.expandedExpressionMode)
        }
        currentPoseMode = useNumberedSprites ? .standing : (defaults.string(forKey: Key.poseMode).flatMap(CharacterPoseMode.init(rawValue:)) ?? .automatic)
        currentGazeEnabled = defaults.object(forKey: Key.gazeEnabled) == nil ? true : defaults.bool(forKey: Key.gazeEnabled)
        currentHeadPettingEnabled = defaults.object(forKey: Key.headPettingEnabled) == nil ? true : defaults.bool(forKey: Key.headPettingEnabled)

        if defaults.object(forKey: Key.imageHeight) != nil {
            currentImageHeight = Self.clampedHeight(CGFloat(defaults.double(forKey: Key.imageHeight)))
        } else {
            currentImageHeight = Self.defaultHeight
        }
        currentOnTop = defaults.object(forKey: Key.onTop) == nil
            ? true
            : defaults.bool(forKey: Key.onTop)
        currentAnimationsEnabled = defaults.object(forKey: Key.animations) == nil
            ? true
            : defaults.bool(forKey: Key.animations)
        currentReducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        var initialContext = CharacterPoseContext()
        initialContext.motionEnabled = currentAnimationsEnabled
        initialContext.reduceMotion = currentReducedMotion
        initialContext.isVisible = false
        poseScheduler = CharacterPoseScheduler(
            mode: currentPoseMode,
            context: initialContext,
            now: poseNow(),
            randomDelay: poseRandomDelay,
            choosePose: choosePose
        )
        gazeFilter = CharacterGazeFilter(defaultGaze: poseScheduler.presentedPose.defaultGaze)

        renderer = PNGRenderer(
            style: currentStyle,
            framing: currentFraming,
            imageHeight: currentImageHeight,
            animationsEnabled: currentAnimationsEnabled,
            expressionMode: currentExpressionMode,
            expandedStyle: currentExpandedStyle,
            pose: poseScheduler.presentedPose,
            expandedExpressionMode: currentExpandedExpressionMode,
            expansionResourceURL: useNumberedSprites ? nil : expansionResourceURL,
            standingOutfit: useNumberedSprites ? currentStandingOutfit : nil,
            numberedExpressionMode: numberedMode,
            standingResourceURL: standingResourceURL
        )
        if useNumberedSprites {
            defaults.set(currentStandingOutfit.rawValue, forKey: Key.standingOutfit)
            defaults.set(currentFraming.rawValue, forKey: Key.framing)
            defaults.set(renderer.numberedExpressionMode.rawValue, forKey: Key.numberedExpression)
        }
        interactionView = PetInteractionView(frame: CGRect(origin: .zero, size: renderer.contentSize))

        let restoredFrame = Self.restoredFrame(
            defaults: defaults,
            windowSize: renderer.contentSize,
            screens: NSScreen.screens,
            primaryScreen: NSScreen.screens.first
        )
        panel = PetPanel(
            contentRect: restoredFrame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        renderer.setReducedMotion(currentReducedMotion)
        configurePanel()
        configureInteraction()
        observeSystemChanges()
        renderer.setPresented(false)
    }

    func show() {
        guard !didShutdown else { return }
        panel.orderFrontRegardless()
        renderer.setPresented(true)
        updatePoseContext { $0.isVisible = true }
        onGeometryChange?()
    }

    func setContextMenu(_ menu: NSMenu) { interactionView.menu = menu }

    func hide() {
        guard !didShutdown else { return }
        onHide?()
        renderer.setPresented(false)
        updatePoseContext { $0.isVisible = false }
        panel.orderOut(nil)
    }

    func setOutfit(_ value: String) {
        guard value == "winter" || value == "summer" else { return }
        defaults.set(value, forKey: Key.outfit)
        setStyle(value == "summer" ? .summerFront : .winterFront)
    }

    func setStyle(_ value: CharacterStyle) {
        guard value != currentStyle || currentExpandedStyle.rawValue != value.rawValue else { return }
        currentStyle = value
        currentExpandedStyle = ExpandedCharacterStyle(rawValue: value.rawValue) ?? currentExpandedStyle
        currentStandingOutfit = StandingCharacterOutfit(rawValue: value.rawValue) ?? .winterFront
        defaults.set(value.rawValue, forKey: Key.style)
        defaults.set(currentExpandedStyle.rawValue, forKey: Key.expandedStyle)
        refreshCharacter()
    }

    func setExpandedStyle(_ value: ExpandedCharacterStyle) {
        guard value != currentExpandedStyle else { return }
        currentExpandedStyle = value
        currentStandingOutfit = StandingCharacterOutfit.migrated(value.rawValue) ?? .winterFront
        defaults.set(value.rawValue, forKey: Key.expandedStyle)
        if let legacy = value.legacyStyle {
            currentStyle = legacy
            defaults.set(legacy.rawValue, forKey: Key.style)
        }
        refreshCharacter()
    }

    func setStandingOutfit(_ value: StandingCharacterOutfit) {
        guard useNumberedSprites, currentStandingOutfit != value else { return }
        currentStandingOutfit = value
        if let legacy = value.legacyStyle {
            currentStyle = legacy
            currentExpandedStyle = ExpandedCharacterStyle(rawValue: legacy.rawValue) ?? .winterFront
            defaults.set(legacy.rawValue, forKey: Key.style)
            defaults.set(currentExpandedStyle.rawValue, forKey: Key.expandedStyle)
        }
        refreshCharacter()
    }

    func setNumberedExpressionMode(_ value: NumberedExpressionMode) {
        guard useNumberedSprites else { return }
        let previousSize = renderer.contentSize
        renderer.setNumberedExpressionMode(value)
        defaults.set(renderer.numberedExpressionMode.rawValue, forKey: Key.numberedExpression)
        if renderer.contentSize != previousSize { resizePanel(to: renderer.contentSize) }
        else { onGeometryChange?() }
    }

    func setFraming(_ value: CharacterFraming) {
        guard value != currentFraming else { return }
        currentFraming = value
        defaults.set(value.rawValue, forKey: Key.framing)
        refreshCharacter()
    }

    func setExpressionMode(_ value: CharacterExpressionMode) {
        guard value != currentExpressionMode || currentExpandedExpressionMode.rawValue != value.rawValue else { return }
        currentExpressionMode = value
        currentExpandedExpressionMode = ExpandedCharacterExpressionMode(rawValue: value.rawValue) ?? .automatic
        defaults.set(value.rawValue, forKey: Key.expressionMode)
        defaults.set(currentExpandedExpressionMode.rawValue, forKey: Key.expandedExpressionMode)
        renderer.setExpressionMode(value)
    }

    func setExpandedExpressionMode(_ value: ExpandedCharacterExpressionMode) {
        guard value != currentExpandedExpressionMode else { return }
        currentExpandedExpressionMode = value
        defaults.set(value.rawValue, forKey: Key.expandedExpressionMode)
        if let legacy = value.legacyMode {
            currentExpressionMode = legacy
            defaults.set(legacy.rawValue, forKey: Key.expressionMode)
        }
        renderer.setExpandedExpressionMode(value)
    }

    func setPoseMode(_ value: CharacterPoseMode) {
        guard value != currentPoseMode else { return }
        currentPoseMode = value
        defaults.set(value.rawValue, forKey: Key.poseMode)
        poseScheduler.setMode(value, now: poseNow())
        applyPresentedPose()
        schedulePoseDeadline()
    }

    func setGazeEnabled(_ value: Bool) {
        guard value != currentGazeEnabled else { return }
        currentGazeEnabled = value
        defaults.set(value, forKey: Key.gazeEnabled)
        resetGaze()
    }

    func setHeadPettingEnabled(_ value: Bool) {
        guard value != currentHeadPettingEnabled else { return }
        currentHeadPettingEnabled = value
        defaults.set(value, forKey: Key.headPettingEnabled)
        if !value { cancelPetReaction() }
    }

    func setActivity(waitingForReply: Bool, speaking: Bool) {
        renderer.setActivity(waitingForReply: waitingForReply, speaking: speaking)
    }

    private func refreshCharacter() {
        let previousSize = renderer.contentSize
        if useNumberedSprites {
            renderer.setStandingCharacter(outfit: currentStandingOutfit, framing: currentFraming)
            defaults.set(currentStandingOutfit.rawValue, forKey: Key.standingOutfit)
            defaults.set(renderer.numberedExpressionMode.rawValue, forKey: Key.numberedExpression)
        } else {
            renderer.setExpandedCharacter(style: currentExpandedStyle, pose: poseScheduler.presentedPose, framing: currentFraming)
        }
        if renderer.contentSize != previousSize {
            resizePanel(to: renderer.contentSize)
        } else {
            onGeometryChange?()
        }
    }

    func setHeight(_ value: Double) {
        let height = Self.clampedHeight(CGFloat(value))
        guard height != currentImageHeight else { return }
        currentImageHeight = height
        defaults.set(Double(height), forKey: Key.imageHeight)
        renderer.setHeight(height)
        resizePanel(to: renderer.contentSize)
    }

    func setOnTop(_ value: Bool) {
        guard value != currentOnTop else { return }
        currentOnTop = value
        defaults.set(value, forKey: Key.onTop)
        panel.level = value ? .floating : .normal
    }

    func setAnimations(_ value: Bool) {
        guard value != currentAnimationsEnabled else { return }
        currentAnimationsEnabled = value
        defaults.set(value, forKey: Key.animations)
        renderer.setAnimationsEnabled(value)
        updatePoseContext { $0.motionEnabled = value }
        onAnimationPolicyChanged?()
    }

    func setClickThrough(_ value: Bool) {
        guard value != currentClickThrough else { return }
        currentClickThrough = value
        panel.ignoresMouseEvents = value
        if value {
            onHide?()
        }
        updatePoseContext { $0.clickThrough = value }
    }

    func shutdown() {
        guard !didShutdown else { return }
        didShutdown = true
        poseTimer?.invalidate(); poseTimer = nil; poseTimerGeneration.cancel()
        petTimer?.invalidate(); petTimer = nil; petTimerGeneration.cancel()
        workspaceObserverTokens.forEach(NSWorkspace.shared.notificationCenter.removeObserver)
        workspaceObserverTokens.removeAll()
        appObserverTokens.forEach(NotificationCenter.default.removeObserver)
        appObserverTokens.removeAll()
        renderer.shutdown()
        panel.orderOut(nil)
        panel.close()
        onOpenChat = nil
        onGeometryChange = nil
        onHide = nil
        onAnimationPolicyChanged = nil
    }

    private func configurePanel() {
        panel.title = "千早桌宠"
        panel.setAccessibilityLabel("千早桌宠 · 点击聊天，拖动移动")
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.isMovable = false
        panel.isMovableByWindowBackground = false
        panel.animationBehavior = .none
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenNone]
        panel.level = currentOnTop ? .floating : .normal
        panel.ignoresMouseEvents = false
        panel.acceptsMouseMovedEvents = true

        interactionView.autoresizingMask = [.width, .height]
        renderer.view.frame = interactionView.bounds
        renderer.view.autoresizingMask = [.width, .height]
        interactionView.addSubview(renderer.view)
        panel.contentView = interactionView
    }

    private func configureInteraction() {
        interactionView.imageFrame = { [weak renderer] in
            renderer?.imageFrame ?? .zero
        }
        interactionView.onClick = { [weak self] in
            guard let self else { return }
            self.renderer.animateClick()
            self.onOpenChat?()
        }
        interactionView.onFrameChanged = { [weak self] in
            self?.onGeometryChange?()
        }
        interactionView.onDragStateChanged = { [weak self] dragging in
            self?.updatePoseContext { $0.dragging = dragging }
        }
        interactionView.onDragEnded = { [weak self] in
            self?.finishDragging()
        }
        interactionView.onPointerMotion = { [weak self] point, buttonDown in
            self?.handlePointerMotion(point: point, buttonDown: buttonDown)
        }
        interactionView.onPointerExit = { [weak self] in self?.resetGaze() }
    }

    private func observeSystemChanges() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        workspaceObserverTokens.append(workspaceCenter.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.renderer.setAwake(false)
                self?.updatePoseContext { $0.isAwake = false }
            }
        })
        workspaceObserverTokens.append(workspaceCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.renderer.setAwake(true)
                self?.updatePoseContext { $0.isAwake = true }
            }
        })
        workspaceObserverTokens.append(workspaceCenter.addObserver(
            forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.currentReducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
                self.renderer.setReducedMotion(self.currentReducedMotion)
                self.updatePoseContext { $0.reduceMotion = self.currentReducedMotion }
                self.onAnimationPolicyChanged?()
            }
        })
        appObserverTokens.append(NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.handleScreenParametersChanged()
            }
        })
    }

    private func resizePanel(to size: CGSize) {
        let oldFrame = panel.frame
        var resized = CGRect(
            x: oldFrame.midX - size.width / 2,
            y: oldFrame.minY,
            width: size.width,
            height: size.height
        )
        resized = Geometry.clamped(resized, to: visibleFrame)
        panel.setFrame(resized, display: true)
        interactionView.frame = CGRect(origin: .zero, size: size)
        savePosition()
        onGeometryChange?()
    }

    func setInteractionContext(
        chatVisible: Bool,
        settingsVisible: Bool,
        draftActive: Bool,
        requestActive: Bool,
        bubbleVisible: Bool
    ) {
        updatePoseContext {
            $0.chatVisible = chatVisible
            $0.settingsVisible = settingsVisible
            $0.draftActive = draftActive
            $0.requestActive = requestActive
            $0.bubbleVisible = bubbleVisible
        }
    }

    private func updatePoseContext(_ update: (inout CharacterPoseContext) -> Void) {
        var context = poseScheduler.context
        update(&context)
        let wasHardSuspended = poseScheduler.context.isHardSuspended
        poseScheduler.update(context: context, now: poseNow())
        if context.isHardSuspended {
            cancelPetReaction()
            resetGaze()
        } else if wasHardSuspended {
            resetGaze()
        }
        applyPresentedPose()
        schedulePoseDeadline()
    }

    private func applyPresentedPose() {
        guard !useNumberedSprites else { return }
        let presented = poseScheduler.presentedPose
        let poseChanged = renderer.pose != presented
        gazeFilter.setDefaultGaze(presented.defaultGaze)
        if poseChanged || !currentGazeEnabled {
            renderer.setGaze(gazeFilter.mouseExited())
        }
        let previousSize = renderer.contentSize
        renderer.setPose(presented)
        guard poseChanged else { return }
        if renderer.contentSize != previousSize {
            resizePanel(to: renderer.contentSize)
        } else {
            onGeometryChange?()
        }
    }

    private func schedulePoseDeadline() {
        poseTimer?.invalidate(); poseTimer = nil
        poseTimerGeneration.cancel()
        guard let deadline = poseScheduler.deadline else { return }
        let token = poseTimerGeneration.issue()
        let timer = Timer(timeInterval: max(0.001, deadline - poseNow()), repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.poseTimerGeneration.accepts(token) else { return }
                self.poseScheduler.advance(now: self.poseNow())
                self.applyPresentedPose()
                self.schedulePoseDeadline()
            }
        }
        timer.tolerance = 0.05
        poseTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func handlePointerMotion(point: CGPoint, buttonDown: Bool) {
        let now = poseNow()
        if currentGazeEnabled, !renderer.faceRegion.isEmpty {
            let value = gazeFilter.update(point: point, in: renderer.faceRegion, eyesClosed: renderer.eye == .closed, now: now)
            renderer.setGaze(value)
        }
        if pettingDetector.sample(
            point: point,
            in: renderer.headRegion,
            buttonDown: buttonDown,
            enabled: currentHeadPettingEnabled && !poseScheduler.context.isHardSuspended,
            now: now
        ) {
            petReaction.start(now: now)
            renderer.setPetReaction(petReaction.phase)
            updatePoseContext { $0.petting = true }
            schedulePetDeadline()
        }
    }

    private func resetGaze() {
        renderer.setGaze(gazeFilter.mouseExited())
        pettingDetector.reset()
    }

    private func schedulePetDeadline() {
        petTimer?.invalidate(); petTimer = nil
        petTimerGeneration.cancel()
        guard let deadline = petReaction.deadline else { return }
        let token = petTimerGeneration.issue()
        let timer = Timer(timeInterval: max(0.001, deadline - poseNow()), repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.petTimerGeneration.accepts(token) else { return }
                self.petReaction.advance(now: self.poseNow())
                self.renderer.setPetReaction(self.petReaction.phase)
                if self.petReaction.phase == nil {
                    self.updatePoseContext { $0.petting = false }
                } else {
                    self.schedulePetDeadline()
                }
            }
        }
        timer.tolerance = 0.01
        petTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func cancelPetReaction() {
        petTimer?.invalidate(); petTimer = nil; petTimerGeneration.cancel()
        petReaction.cancel(); pettingDetector.reset(); renderer.setPetReaction(nil)
        if poseScheduler.context.petting {
            var context = poseScheduler.context
            context.petting = false
            poseScheduler.update(context: context, now: poseNow())
            applyPresentedPose()
            schedulePoseDeadline()
        }
    }

    private func finishDragging() {
        guard let target = screen(for: panel.frame) ?? NSScreen.screens.first else { return }
        let adjusted = Geometry.clamped(panel.frame, to: target.visibleFrame)
        panel.setFrame(adjusted, display: true)
        savePosition(on: target)
        onGeometryChange?()
    }

    private func handleScreenParametersChanged() {
        let allScreens = NSScreen.screens
        guard !allScreens.isEmpty else { return }

        if allScreens.contains(where: { $0.visibleFrame.contains(panel.frame) }) {
            savePosition()
            onGeometryChange?()
            return
        }

        let target = screen(for: panel.frame) ?? allScreens[0]
        let adjusted = Geometry.clamped(panel.frame, to: target.visibleFrame)
        panel.setFrame(adjusted, display: true)
        savePosition(on: target)
        onGeometryChange?()
    }

    private func savePosition(on explicitScreen: NSScreen? = nil) {
        defaults.set(Double(panel.frame.minX), forKey: Key.frameX)
        defaults.set(Double(panel.frame.minY), forKey: Key.frameY)
        let target = explicitScreen ?? screen(for: panel.frame)
        if let identifier = target.flatMap(Self.identifier(for:)) {
            defaults.set(identifier, forKey: Key.displayUUID)
        }
    }

    private func screen(for frame: CGRect) -> NSScreen? {
        Self.screen(for: frame, among: NSScreen.screens) ?? NSScreen.screens.first
    }

    private static func restoredFrame(
        defaults: UserDefaults,
        windowSize: CGSize,
        screens: [NSScreen],
        primaryScreen: NSScreen?
    ) -> CGRect {
        guard let primary = primaryScreen ?? screens.first else {
            return CGRect(origin: .zero, size: windowSize)
        }

        let hasSavedOrigin = defaults.object(forKey: Key.frameX) != nil
            && defaults.object(forKey: Key.frameY) != nil
        guard hasSavedOrigin else {
            let initial = CGRect(
                x: primary.visibleFrame.maxX - windowSize.width - initialRightInset,
                y: primary.visibleFrame.minY,
                width: windowSize.width,
                height: windowSize.height
            )
            return Geometry.clamped(initial, to: primary.visibleFrame)
        }

        let saved = CGRect(
            x: defaults.double(forKey: Key.frameX),
            y: defaults.double(forKey: Key.frameY),
            width: windowSize.width,
            height: windowSize.height
        )
        if let savedIdentifier = defaults.string(forKey: Key.displayUUID),
           let savedScreen = screens.first(where: { identifier(for: $0) == savedIdentifier }),
           savedScreen.visibleFrame.contains(saved) {
            return saved
        }

        return Geometry.clamped(saved, to: primary.visibleFrame)
    }

    private static func screen(for frame: CGRect, among screens: [NSScreen]) -> NSScreen? {
        screens.max { first, second in
            intersectionArea(frame, first.visibleFrame) < intersectionArea(frame, second.visibleFrame)
        }.flatMap { intersectionArea(frame, $0.visibleFrame) > 0 ? $0 : nil }
    }

    private static func intersectionArea(_ first: CGRect, _ second: CGRect) -> CGFloat {
        let intersection = first.intersection(second)
        guard !intersection.isNull else { return 0 }
        return intersection.width * intersection.height
    }

    private static func identifier(for screen: NSScreen) -> String? {
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        guard let number = screen.deviceDescription[key] as? NSNumber,
              let unmanagedUUID = CGDisplayCreateUUIDFromDisplayID(CGDirectDisplayID(number.uint32Value)) else {
            return nil
        }
        let uuid = unmanagedUUID.takeRetainedValue()
        return CFUUIDCreateString(nil, uuid) as String
    }

    private static func clampedHeight(_ value: CGFloat) -> CGFloat {
        min(max(value, minimumHeight), maximumHeight)
    }
}
