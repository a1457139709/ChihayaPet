import AppKit
import QuartzCore

private final class PassthroughRenderView: NSView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

@MainActor
final class PNGRenderer {
    static let margin: CGFloat = 12
    let view: NSView
    private let imageView: NSView
    private let clickLayer = CALayer()
    private let breathLayer = CALayer()
    private let bodyLayer = CALayer()
    private let faceLayer = CALayer()
    private let expansionLibrary: ExpansionLibrary?
    let standingLibrary: StandingCharacterLibrary?
    private(set) var standingOutfit: StandingCharacterOutfit?
    private(set) var numberedExpressionMode: NumberedExpressionMode
    private(set) var standingFrame: StandingCharacterFrame?
    private let allowPendingStandingForQA: Bool
    private var expansionPrepared: ExpansionPreparedVariant?
    private var expansionRenderedPose: CharacterPose = .standing
    private var expansionFaceCache = ExpansionFaceCache()
    private var expansionPrewarmedExpression: ExpandedCharacterExpression?
    private(set) var style: CharacterStyle
    private(set) var expandedStyle: ExpandedCharacterStyle
    private(set) var framing: CharacterFraming
    private(set) var expressionMode: CharacterExpressionMode
    private(set) var expandedExpressionMode: ExpandedCharacterExpressionMode
    private(set) var pose: CharacterPose
    private(set) var imageHeight: CGFloat
    private(set) var expression: CharacterExpression = .neutral
    private(set) var expandedExpression: ExpandedCharacterExpression = .neutral
    var eye: CharacterEye { facePresentation.eye }
    var mouth: CharacterMouth { facePresentation.mouth }
    var isScheduling: Bool { timer != nil }
    var hasImage: Bool { standingFrame != nil || expansionPrepared != nil }
    var usesStanding: Bool { standingFrame != nil }
    var renderedStandingVariantKey: String? { standingFrame?.key }
    var renderedNumberedFaceID: String? { standingFrame?.faceID }
    var numberedExpressions: [StandingCharacterManifest.Result] {
        guard let standingOutfit else { return [] }
        return standingLibrary?.variant(outfit: standingOutfit, framing: framing)?.results ?? []
    }
    var usesExpansion: Bool { expansionPrepared != nil }
    var cachedImageCount: Int { standingFrame != nil ? (standingLibrary?.cachedImageCount ?? 1) : (expansionPrepared != nil ? expansionFaceCache.count + 1 : 0) }
    var renderedExpansionPose: CharacterPose? { expansionPrepared == nil ? nil : expansionRenderedPose }
    var renderedExpansionVariantKey: String? { expansionPrepared?.key }
    private(set) var renderedExpansionFaceState: ExpansionFaceState?
    var nextAnimationDeadline: TimeInterval? { timeline.nextDeadline }
    private var animationsEnabled: Bool
    private var reducedMotion = false
    private var isPresented = false
    private var isAwake = true
    private var didShutdown = false
    private var waitingForReply = false
    private var speaking = false
    private var gaze: CharacterGaze = .center
    private var petReaction: CharacterPetReactionPhase?
    private var facePresentation = CharacterFacePresentation(expression: .neutral, eye: .open, gaze: .center, mouth: .closed)
    private var motionRunning = false
    private var timeline: CharacterAnimationTimeline
    private var timer: Timer?
    private var timerGeneration = UUID()

    init(style: CharacterStyle, framing: CharacterFraming, imageHeight: CGFloat, animationsEnabled: Bool,
         expressionMode: CharacterExpressionMode = .automatic,
         expandedStyle: ExpandedCharacterStyle? = nil,
         pose: CharacterPose = .standing,
         expandedExpressionMode: ExpandedCharacterExpressionMode? = nil,
         expansionResourceURL: URL? = Bundle.main.url(forResource: "CharacterExpansion", withExtension: nil),
         expansionLibrary injectedExpansionLibrary: ExpansionLibrary? = nil,
         standingOutfit: StandingCharacterOutfit? = nil,
         numberedExpressionMode: NumberedExpressionMode = .automatic,
         standingResourceURL: URL? = Bundle.main.url(forResource: "Standing", withExtension: nil, subdirectory: "Characters"),
         standingLibrary injectedStandingLibrary: StandingCharacterLibrary? = nil,
         allowPendingStandingForQA: Bool = false,
         animationRandom: @escaping (ClosedRange<Double>) -> Double = { Double.random(in: $0) }) {
        self.style = style; self.framing = framing; self.imageHeight = imageHeight
        self.expandedStyle = expandedStyle ?? ExpandedCharacterStyle(rawValue: style.rawValue) ?? .winterFront
        self.pose = pose
        // A standalone renderer uses the same numbered images as the desktop.
        self.standingOutfit = standingOutfit ?? (expansionResourceURL == nil && injectedExpansionLibrary == nil
            ? StandingCharacterOutfit(rawValue: style.rawValue) : nil)
        self.numberedExpressionMode = numberedExpressionMode
        self.allowPendingStandingForQA = allowPendingStandingForQA
        standingLibrary = injectedStandingLibrary ?? standingResourceURL.flatMap { try? StandingCharacterLibrary(rootURL: $0) }
        self.animationsEnabled = animationsEnabled; self.expressionMode = expressionMode
        self.expandedExpressionMode = expandedExpressionMode ?? ExpandedCharacterExpressionMode(rawValue: expressionMode.rawValue) ?? .automatic
        timeline = CharacterAnimationTimeline(random: animationRandom)
        expansionLibrary = injectedExpansionLibrary ?? expansionResourceURL.flatMap { try? ExpansionLibrary(rootURL: $0) }
        view = PassthroughRenderView(frame: .zero)
        imageView = PassthroughRenderView(frame: .zero)
        view.wantsLayer = true; imageView.wantsLayer = true
        view.layer?.backgroundColor = NSColor.clear.cgColor
        view.layer?.masksToBounds = false
        view.addSubview(imageView)
        imageView.layer?.addSublayer(clickLayer)
        clickLayer.addSublayer(breathLayer)
        breathLayer.addSublayer(bodyLayer); breathLayer.addSublayer(faceLayer)
        for layer in [imageView.layer!, clickLayer, breathLayer, bodyLayer, faceLayer] {
            layer.masksToBounds = false
            layer.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull(), "hidden": NSNull(), "transform": NSNull()]
            layer.contentsGravity = .resize
            layer.minificationFilter = .linear; layer.magnificationFilter = .linear
        }
        loadCharacter()
    }
    convenience init(outfit: String, imageHeight: CGFloat, animationsEnabled: Bool) {
        self.init(style: outfit == "summer" ? .summerFront : .winterFront, framing: .full, imageHeight: imageHeight, animationsEnabled: animationsEnabled)
    }
    var contentSize: CGSize { CGSize(width: imageFrame.width + 2 * Self.margin, height: imageHeight + 2 * Self.margin) }
    var imageFrame: CGRect {
        let size: CGSize
        if let standingFrame {
            size = standingFrame.variant.size
        } else if let expansionPrepared, let base = expansionPrepared.images[expansionPrepared.variant.base] {
            size = CGSize(width: base.width, height: base.height)
        } else {
            size = standingOutfit.flatMap { standingLibrary?.variant(outfit: $0, framing: framing)?.size }
                ?? CGSize(width: 1, height: 1)
        }
        return CGRect(x: Self.margin, y: Self.margin, width: imageHeight * size.width / size.height, height: imageHeight)
    }
    var speechAttachment: CharacterSpeechAttachment {
        if let standingFrame { return standingFrame.variant.attachment(imageHeight: imageHeight, margin: Self.margin) }
        if let expansionPrepared, let base = expansionPrepared.images[expansionPrepared.variant.base] {
            let scale = imageHeight / CGFloat(base.height)
            let point = expansionPrepared.variant.mouth.bottomLeftPoint(canvasHeight: Double(base.height))
            return CharacterSpeechAttachment(
                mouth: CGPoint(x: Self.margin + point.x * scale, y: Self.margin + point.y * scale),
                hairLeft: Self.margin + expansionPrepared.variant.hairLeft * scale,
                hairRight: Self.margin + expansionPrepared.variant.hairRight * scale
            )
        }
        return CharacterSpeechAttachment(mouth: CGPoint(x: imageFrame.midX, y: imageFrame.midY),
            hairLeft: imageFrame.minX, hairRight: imageFrame.maxX)
    }
    func setCharacter(style: CharacterStyle, framing: CharacterFraming) {
        guard !didShutdown,
              self.style != style || self.framing != framing || expandedStyle.rawValue != style.rawValue else { return }
        self.style = style; self.framing = framing
        if standingOutfit != nil { standingOutfit = StandingCharacterOutfit(rawValue: style.rawValue) }
        expandedStyle = ExpandedCharacterStyle(rawValue: style.rawValue) ?? expandedStyle
        loadCharacter()
    }
    func setExpandedCharacter(style: ExpandedCharacterStyle, pose: CharacterPose, framing: CharacterFraming) {
        guard !didShutdown, expandedStyle != style || self.pose != pose || self.framing != framing else { return }
        expandedStyle = style; self.pose = pose; self.framing = framing
        if let legacyStyle = style.legacyStyle { self.style = legacyStyle }
        loadCharacter()
    }
    func setStandingCharacter(outfit: StandingCharacterOutfit, framing: CharacterFraming) {
        guard !didShutdown, standingOutfit != outfit || self.framing != framing else { return }
        standingOutfit = outfit; self.framing = framing
        if let legacyStyle = outfit.legacyStyle { style = legacyStyle }
        numberedExpressionMode = numberedExpressionMode.validated(in: standingLibrary?.variant(outfit: outfit, framing: framing))
        loadCharacter()
    }
    func setNumberedExpressionMode(_ value: NumberedExpressionMode) {
        guard !didShutdown, let standingOutfit else { return }
        numberedExpressionMode = value.validated(in: standingLibrary?.variant(outfit: standingOutfit, framing: framing))
        withoutActions { updateStandingExpression() }
    }
    func setPose(_ value: CharacterPose) { setExpandedCharacter(style: expandedStyle, pose: value, framing: framing) }
    func setOutfit(_ value: String) { setCharacter(style: value == "summer" ? .summerFront : .winterFront, framing: framing) }
    func setExpressionMode(_ value: CharacterExpressionMode) {
        expressionMode = value
        expandedExpressionMode = ExpandedCharacterExpressionMode(rawValue: value.rawValue) ?? .automatic
        refresh()
    }
    func setExpandedExpressionMode(_ value: ExpandedCharacterExpressionMode) {
        expandedExpressionMode = value
        if let legacy = value.legacyMode { expressionMode = legacy }
        refresh()
    }
    func setGaze(_ value: CharacterGaze) { gaze = value; refresh() }
    func setPetReaction(_ value: CharacterPetReactionPhase?) { petReaction = value; refresh() }
    func setActivity(waitingForReply: Bool, speaking: Bool) {
        self.waitingForReply = waitingForReply; self.speaking = speaking; refresh()
    }
    func setHeight(_ value: CGFloat) {
        guard !didShutdown, value != imageHeight else { return }
        imageHeight = value; withoutActions { layout() }
    }
    func setAnimationsEnabled(_ value: Bool) { animationsEnabled = value; refresh() }
    func setReducedMotion(_ value: Bool) { reducedMotion = value; refresh() }
    func setPresented(_ value: Bool) { isPresented = value; refresh() }
    func setAwake(_ value: Bool) { isAwake = value; refresh() }
    func animateClick() {
        guard motionAllowed else { return }
        let animation = CAKeyframeAnimation(keyPath: "transform.scale")
        animation.values = [1.0, 1.02, 1.0]; animation.keyTimes = [0, 0.5, 1]
        animation.duration = 0.15; animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        clickLayer.add(animation, forKey: "pet.click")
    }
    func shutdown() {
        guard !didShutdown else { return }
        didShutdown = true; refresh()
        withoutActions { bodyLayer.contents = nil; faceLayer.contents = nil }
        expansionPrepared = nil; expansionFaceCache.removeAll(); expansionPrewarmedExpression = nil
        standingFrame = nil; standingLibrary?.removeAllCachedImages()
        renderedExpansionFaceState = nil
    }
    private var motionAllowed: Bool { !didShutdown && animationsEnabled && !reducedMotion && isPresented && isAwake }
    private func loadCharacter() {
        if let standingOutfit {
            let variant = standingLibrary?.variant(outfit: standingOutfit, framing: framing)
            numberedExpressionMode = numberedExpressionMode.validated(in: variant)
            let id: String
            switch numberedExpressionMode { case .automatic: id = "00"; case .numbered(let value): id = value }
            let key = "\(standingOutfit.rawValue)/\(framing.rawValue)"
            let next: StandingCharacterFrame?
            if allowPendingStandingForQA {
                next = try? standingLibrary?.image(key: key, faceID: id, allowPendingForQA: true)
            } else {
                next = standingLibrary?.resolve(outfit: standingOutfit, framing: framing, faceID: id)
            }
            withoutActions {
                standingFrame = next
                expansionPrepared = nil; expansionFaceCache.removeAll()
                expansionPrewarmedExpression = nil; renderedExpansionFaceState = nil
                bodyLayer.contents = next?.image
                bodyLayer.isHidden = false; faceLayer.contents = nil; faceLayer.isHidden = true
                layout(); refresh()
            }
            return
        }
        standingFrame = nil
        if let presentation = prepareExpansionPresentation() {
            withoutActions {
                expansionPrepared = presentation.prepared
                expansionRenderedPose = presentation.renderedPose
                if presentation.renderedPose != pose { gaze = presentation.renderedPose.defaultGaze }
                expansionFaceCache = presentation.cache
                expansionPrewarmedExpression = presentation.initialState.expression
                renderedExpansionFaceState = presentation.initialState
                ExpansionNativeFaceAdapter.install(
                    base: presentation.base, face: presentation.face,
                    bodyLayer: bodyLayer, faceLayer: faceLayer
                )
                layout()
                refresh()
            }
            return
        }

        withoutActions {
            expansionPrepared = nil; expansionFaceCache.removeAll(); expansionPrewarmedExpression = nil
            renderedExpansionFaceState = nil
            bodyLayer.contents = nil; faceLayer.contents = nil
            layout(); refresh()
        }
    }

    private typealias ExpansionPresentation = (
        prepared: ExpansionPreparedVariant,
        renderedPose: CharacterPose,
        cache: ExpansionFaceCache,
        base: CGImage,
        face: CGImage,
        initialState: ExpansionFaceState
    )
    private func prepareExpansionPresentation() -> ExpansionPresentation? {
        guard let expansionLibrary else { return nil }
        do {
            return try prepareExpansionCandidate(pose: pose, library: expansionLibrary)
        } catch {
            NSLog("Character expansion unavailable: %@", String(describing: error))
            return nil
        }
    }
    private func prepareExpansionCandidate(pose candidatePose: CharacterPose, library: ExpansionLibrary) throws -> ExpansionPresentation {
        let result = try library.prepare(style: expandedStyle, pose: candidatePose, framing: framing)
        let renderedPose: CharacterPose = result.resolution == .standing ? .standing : candidatePose
        guard let prepared = result.prepared,
              let base = prepared.images[prepared.variant.base] else {
            throw ExpansionResourceError.invalidVariant("\(expandedStyle.rawValue)/\(candidatePose.rawValue)/\(framing.rawValue)")
        }
        let presentation = resolvedFacePresentation(
            pose: renderedPose,
            gaze: renderedPose == pose ? gaze : renderedPose.defaultGaze
        )
        let initialState = ExpansionFaceState(
            expression: presentation.expression, eye: presentation.eye,
            gaze: presentation.gaze, mouth: presentation.mouth
        )
        let cache = ExpansionFaceCache()
        let initial = try cache.image(for: prepared, state: initialState)
        for state in library.manifest.declaredStates where state.expression == presentation.expression {
            _ = try cache.image(for: prepared, state: state)
        }
        return (prepared, renderedPose, cache, base, initial, initialState)
    }
    private func layout() {
        view.frame = CGRect(origin: .zero, size: contentSize)
        imageView.frame = imageFrame
        // Nested layers keep sway, breath and click transforms independent.
        let bounds = CGRect(origin: .zero, size: imageFrame.size)
        for layer in [imageView.layer!, clickLayer, breathLayer] {
            layer.anchorPoint = CGPoint(x: 0.5, y: 0)
            layer.bounds = bounds
            layer.position = layer === imageView.layer ? CGPoint(x: imageFrame.midX, y: imageFrame.minY) : CGPoint(x: bounds.midX, y: 0)
        }
        bodyLayer.frame = bounds
        if let expansionPrepared, let base = expansionPrepared.images[expansionPrepared.variant.base] {
            ExpansionNativeFaceAdapter.layout(
                variant: expansionPrepared.variant, base: base, in: bounds,
                bodyLayer: bodyLayer, faceLayer: faceLayer
            )
        } else {
            faceLayer.frame = bounds
        }
    }
    private func refresh() {
        let active = motionAllowed
        timeline.update(active: active && expansionPrepared != nil, speaking: speaking, now: CACurrentMediaTime())
        resolveAndRenderFace()
        updateBodyMotion(active: active && hasImage)
        scheduleNextEvent()
    }
    private func resolveAndRenderFace() {
        facePresentation = resolvedFacePresentation()
        expandedExpression = facePresentation.expression
        expression = legacyExpression(for: expandedExpression)
        prewarmResolvedExpressionIfNeeded()
        withoutActions { updateFace() }
    }
    private func prewarmResolvedExpressionIfNeeded() {
        guard let expansionPrepared, let expansionLibrary,
              expansionPrewarmedExpression != facePresentation.expression else { return }
        do {
            for state in expansionLibrary.manifest.declaredStates where state.expression == facePresentation.expression {
                _ = try expansionFaceCache.image(for: expansionPrepared, state: state)
            }
            expansionPrewarmedExpression = facePresentation.expression
        } catch {
            NSLog("Character expression prewarm unavailable: %@", String(describing: error))
        }
    }
    private func updateFace() {
        if standingOutfit != nil { updateStandingExpression(); return }
        if let expansionPrepared {
            let state = ExpansionFaceState(
                expression: facePresentation.expression, eye: facePresentation.eye,
                gaze: facePresentation.gaze, mouth: facePresentation.mouth
            )
            let image = try? expansionFaceCache.image(for: expansionPrepared, state: state)
            faceLayer.contents = image
            renderedExpansionFaceState = image == nil ? nil : state
            if image == nil {
                self.expansionPrepared = nil; expansionFaceCache.removeAll()
                bodyLayer.contents = nil
                timeline.update(active: false, speaking: false, now: CACurrentMediaTime())
                layout()
            }
            return
        }
        renderedExpansionFaceState = nil
        faceLayer.contents = nil
    }
    private func updateStandingExpression() {
        guard let standingOutfit, let standingLibrary else { return }
        let variant = standingLibrary.variant(outfit: standingOutfit, framing: framing)
        let id: String
        switch numberedExpressionMode {
        case .numbered(let value): id = value
        case .automatic:
            id = variant?.automaticMappings[expression.rawValue] ??
                (standingFrame?.key == "\(standingOutfit.rawValue)/\(framing.rawValue)" ? standingFrame?.faceID : nil) ?? "00"
        }
        guard standingFrame?.faceID != id || standingFrame?.key != "\(standingOutfit.rawValue)/\(framing.rawValue)" else { return }
        let next = allowPendingStandingForQA
            ? try? standingLibrary.image(key: "\(standingOutfit.rawValue)/\(framing.rawValue)", faceID: id, allowPendingForQA: true)
            : standingLibrary.resolve(outfit: standingOutfit, framing: framing, faceID: id)
        let changedSize = standingFrame?.variant.canvas != next?.variant.canvas
        standingFrame = next; bodyLayer.contents = next?.image
        if changedSize { layout() }
        updateBodyMotion(active: motionAllowed && hasImage)
    }
    private func resolvedFacePresentation(
        pose resolvedPose: CharacterPose? = nil,
        gaze resolvedGaze: CharacterGaze? = nil
    ) -> CharacterFacePresentation {
        CharacterFacePolicy.resolve(
            mode: expandedExpressionMode,
            pose: resolvedPose ?? (expansionPrepared == nil ? pose : expansionRenderedPose),
            visibleTyping: speaking && motionAllowed,
            waiting: waitingForReply,
            petReaction: petReaction,
            animatedEye: timeline.eye,
            animatedMouth: timeline.mouth,
            gaze: resolvedGaze ?? gaze
        )
    }
    private func legacyExpression(for value: ExpandedCharacterExpression) -> CharacterExpression {
        if let exact = CharacterExpression(rawValue: value.rawValue) { return exact }
        switch value {
        case .shy, .proud: return .smile
        case .pout, .sleepy: return .neutral
        case .neutral, .serious, .smile, .surprised: return .neutral
        }
    }
    var faceRegion: CGRect {
        if let standingFrame { return standingFrame.variant.rect(standingFrame.variant.faceRect, imageHeight: imageHeight, margin: Self.margin) }
        guard let expansionPrepared, let base = expansionPrepared.images[expansionPrepared.variant.base] else { return .zero }
        let rect = expansionPrepared.variant.face.bottomLeftRect(canvasHeight: Double(base.height))
        let scale = imageHeight / CGFloat(base.height)
        return CGRect(x: Self.margin + rect.minX * scale, y: Self.margin + rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
    }
    var headRegion: CGRect {
        if let standingFrame { return standingFrame.variant.rect(standingFrame.variant.headRect, imageHeight: imageHeight, margin: Self.margin) }
        guard let expansionPrepared, let base = expansionPrepared.images[expansionPrepared.variant.base] else { return .zero }
        let rect = expansionPrepared.variant.head.bottomLeftRect(canvasHeight: Double(base.height))
        let scale = imageHeight / CGFloat(base.height)
        return CGRect(x: Self.margin + rect.minX * scale, y: Self.margin + rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
    }
    private func updateBodyMotion(active: Bool) {
        guard active != motionRunning else { return }
        motionRunning = active
        imageView.layer?.removeAllAnimations(); clickLayer.removeAllAnimations(); breathLayer.removeAllAnimations()
        guard active else { return }
        let breath = CAKeyframeAnimation(keyPath: "transform.scale.y")
        breath.values = [1.0, 1.003, 1.0]; breath.keyTimes = [0, 0.5, 1]
        breath.duration = 4; breath.repeatCount = .infinity
        breath.timingFunctions = [.init(name: .easeInEaseOut), .init(name: .easeInEaseOut)]
        breathLayer.add(breath, forKey: "pet.breathe")
        let sway = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        let angle = 0.25 * Double.pi / 180
        sway.values = [0, angle, 0, -angle, 0]; sway.keyTimes = [0, 0.25, 0.5, 0.75, 1]
        sway.duration = 6; sway.repeatCount = .infinity
        sway.timingFunctions = Array(repeating: .init(name: .easeInEaseOut), count: 4)
        imageView.layer?.add(sway, forKey: "pet.sway")
    }
    private func scheduleNextEvent() {
        timer?.invalidate(); timer = nil; timerGeneration = UUID()
        guard let next = timeline.nextDeadline else { return }
        let token = timerGeneration
        let event = Timer(timeInterval: max(0.001, next - CACurrentMediaTime()), repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.timerGeneration == token, self.motionAllowed else { return }
                self.advanceAnimation(now: CACurrentMediaTime())
            }
        }
        event.tolerance = 0.005
        timer = event; RunLoop.main.add(event, forMode: .common)
    }
    func advanceAnimation(now: TimeInterval) {
        guard motionAllowed else { return }
        timeline.advance(now: now)
        resolveAndRenderFace()
        scheduleNextEvent()
    }
    private func withoutActions(_ body: () -> Void) { CATransaction.begin(); CATransaction.setDisableActions(true); body(); CATransaction.commit() }
    deinit { timer?.invalidate() }
}
