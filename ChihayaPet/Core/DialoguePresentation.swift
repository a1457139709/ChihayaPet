import AppKit
import Combine
import CoreText

enum DialoguePaginator {
    static func pages(_ text: String, width: CGFloat, height: CGFloat, style: DialogueTextStyle = .reply) -> [String] {
        guard !text.isEmpty else { return [""] }
        let setter = CTFramesetterCreateWithAttributedString(style.attributed(text))
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: max(1, width), height: max(1, height)), transform: nil)
        var boundaries = [0]
        for char in text { boundaries.append(boundaries.last! + String(char).utf16.count) }
        let ns = text as NSString
        var start = 0, result: [String] = []
        while start < boundaries.count - 1 {
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: boundaries[start], length: 0), path, nil)
            let range = CTFrameGetVisibleStringRange(frame)
            let end = boundaries[start] + range.length
            var low = start + 1, high = boundaries.count - 1
            while low <= high {
                let mid = (low + high) / 2
                if boundaries[mid] <= end { low = mid + 1 } else { high = mid - 1 }
            }
            let next = max(start + 1, high)
            result.append(ns.substring(with: NSRange(location: boundaries[start], length: boundaries[next] - boundaries[start])))
            start = next
        }
        return result
    }
}

@MainActor
final class DialoguePresentation: ObservableObject {
    let text: String
    @Published private(set) var height: CGFloat
    let style: DialogueTextStyle
    private let paginated: Bool
    @Published private(set) var pages: [String]
    @Published private(set) var pageIndex = 0
    @Published private(set) var visibleText = ""
    @Published private(set) var pageComplete = false
    @Published private(set) var isPlaying = false
    var onReadStateChanged: ((Bool) -> Void)?
    var onPlaybackChanged: ((Bool) -> Void)?
    var hovered = false
    var onHoverChanged: (() -> Void)?
    private var animated: Bool
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private var revealedCounts: [Int]
    private var running = false
    private var width: CGFloat
    var finished: Bool { pageComplete && pageIndex == pages.count - 1 }

    init(text: String, width: CGFloat = 356, height: CGFloat = ChihayaStyle.bodyHeight, style: DialogueTextStyle = .reply, paginated: Bool = true, animated: Bool) {
        self.text = text; self.width = width; self.style = style; self.paginated = paginated; self.animated = animated
        self.height = paginated ? height : DialogueTextLayout.height(text, width: width, style: style)
        let initialPages = paginated ? DialoguePaginator.pages(text, width: width, height: height, style: style) : [text]
        pages = initialPages
        revealedCounts = Array(repeating: 0, count: initialPages.count)
    }
    func start() { running = true; reveal() }
    func stop() { running = false; cancelTask(); setPlaying(false) }
    func setAnimated(_ value: Bool) {
        guard animated != value else { return }
        animated = value
        if running { reveal() }
    }
    func reflow(width: CGFloat) {
        guard abs(width - self.width) > 1 else { return }
        cancelTask()
        let oldStart = pages.prefix(pageIndex).reduce(0) { $0 + $1.count }
        let readPosition = oldStart + revealed
        let anchor = max(oldStart, readPosition - 1)
        var offset = 0
        var furthestReadPosition = 0
        for index in pages.indices {
            if revealedCounts[index] > 0 {
                furthestReadPosition = max(furthestReadPosition, offset + revealedCounts[index])
            }
            offset += pages[index].count
        }
        self.width = width
        if !paginated { height = DialogueTextLayout.height(text, width: width, style: style) }
        pages = paginated ? DialoguePaginator.pages(text, width: width, height: height, style: style) : [text]
        offset = 0
        revealedCounts = pages.map { page in
            defer { offset += page.count }
            return min(page.count, max(0, furthestReadPosition - offset))
        }
        offset = 0
        pageIndex = 0
        for index in pages.indices {
            pageIndex = index
            if offset + pages[index].count > anchor { break }
            offset += pages[index].count
        }
        revealed = max(revealed, max(0, min(pages[pageIndex].count, readPosition - offset)))
        loadPageState()
        onReadStateChanged?(finished)
        if running { reveal() }
        else { setPlaying(false) }
    }
    func advance() {
        guard running else { return }
        if !pageComplete { completePage(); return }
        guard pageIndex + 1 < pages.count else { return }
        cancelTask(); pageIndex += 1; loadPageState()
        onReadStateChanged?(finished); reveal()
    }
    func previous() {
        guard running, pageIndex > 0 else { return }
        cancelTask(); pageIndex -= 1; completePage()
    }
    func setHovered(_ value: Bool) { hovered = value; onHoverChanged?() }
    private func cancelTask() { generation = UUID(); task?.cancel(); task = nil }
    private func completePage() {
        cancelTask(); visibleText = pages[pageIndex]; revealed = visibleText.count; pageComplete = true; setPlaying(false)
        onReadStateChanged?(finished)
    }
    private func reveal() {
        cancelTask()
        guard running else { setPlaying(false); return }
        guard !pageComplete else { setPlaying(false); onReadStateChanged?(finished); return }
        guard revealed < pages[pageIndex].count else { completePage(); return }
        if !animated { completePage(); return }
        setPlaying(true)
        let token = generation
        let characters = Array(pages[pageIndex])
        task = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.running, self.generation == token else { return }
                guard self.revealed < characters.count else { self.completePage(); return }
                let character = characters[self.revealed]
                self.visibleText.append(character); self.revealed += 1
                if self.revealed == characters.count { self.completePage(); return }
                let delay: UInt64 = "，、,；;".contains(character) ? 130_000_000 : ("。！？…\n".contains(character) ? 240_000_000 : 42_000_000)
                do { try await Task.sleep(nanoseconds: delay) } catch { return }
            }
        }
    }
    private var revealed: Int {
        get { revealedCounts[pageIndex] }
        set { revealedCounts[pageIndex] = newValue }
    }
    private func loadPageState() {
        visibleText = String(pages[pageIndex].prefix(revealed))
        pageComplete = revealed == pages[pageIndex].count
    }
    private func setPlaying(_ value: Bool) {
        guard isPlaying != value else { return }
        isPlaying = value
        onPlaybackChanged?(value)
    }
    deinit { task?.cancel() }
}
