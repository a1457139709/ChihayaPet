import AppKit
import CryptoKit
import ImageIO

// Source IDs remain distinct from the retired expansion pack's style/state IDs.
enum StandingCharacterOutfit: String, CaseIterable {
    case winterFront = "a", summerFront = "a_", winterSide = "b", summerSide = "b_"
    case casual = "c", pink = "d", gym = "e"
    case rose = "blue-white-rose", maid = "red-white-anime-maid"
    case exam = "loose-long-shirt-experiment-v1", examInner = "loose-long-shirt-experiment-v4"
    case maidWork = "red-white-anime-maid-work", roseHands = "blue-white-rose-princess-hands"

    var legacyStyle: CharacterStyle? { CharacterStyle(rawValue: rawValue) }
    var title: String {
        if let legacyStyle { return legacyStyle.title }
        switch self {
        case .rose: return "蓝白玫瑰礼装"
        case .maid: return "日式动漫女仆服"
        case .exam: return "体检服"
        case .examInner: return "体检服-里"
        case .maidWork: return "女仆装-工"
        case .roseHands: return "蓝白礼装·叠手"
        default: return "冬服正面"
        }
    }
    static func migrated(_ raw: String?) -> Self? {
        guard let raw else { return nil }
        if let exact = Self(rawValue: raw) { return exact }
        return ["blue_rose": .rose, "red_skirt": .maid, "long_shirt": .exam][raw]
    }
}

enum NumberedExpressionMode: Equatable {
    case automatic, numbered(String)
    var rawValue: String {
        switch self { case .automatic: return "automatic"; case .numbered(let id): return id }
    }
    var title: String {
        switch self { case .automatic: return "自动"; case .numbered(let id): return id }
    }
    init(rawValue: String?) {
        if rawValue == nil || rawValue == "automatic" { self = .automatic }
        else if let rawValue, Self.validID(rawValue) { self = .numbered(rawValue) }
        else { self = .numbered("00") }
    }
    private static func validID(_ value: String) -> Bool {
        value.count == 2 && value.utf8.allSatisfy { (48...57).contains($0) }
    }
    func validated(in variant: StandingCharacterManifest.Variant?) -> Self {
        guard case .numbered(let id) = self else { return .automatic }
        return variant?.results.contains(where: { $0.id == id }) == true ? self : .numbered("00")
    }
}

struct StandingCharacterManifest: Codable {
    struct Outfit: Codable { let id: String; let name: String }
    struct Review: Codable {
        let status: String
        let sha256: String?
        let message: String?
        let recordedAt: String?
    }
    struct Result: Codable {
        let id: String
        let path: String
        let sha256: String
        let review: Review
        var isApproved: Bool {
            review.status == "approved" && review.sha256 == sha256 &&
            !(review.message ?? "").isEmpty && !(review.recordedAt ?? "").isEmpty
        }
    }
    struct Speech: Codable { let mouth: [CGFloat]; let hairLeft: CGFloat; let hairRight: CGFloat }
    struct Variant: Codable {
        let outfit: String
        let framing: String
        let canvas: [Int]
        let defaultFaceID: String
        let faceRect: [CGFloat]
        let headRect: [CGFloat]
        let speech: Speech
        let bindingMethod: String
        let automaticMappings: [String: String]
        let results: [Result]
        var size: CGSize { CGSize(width: canvas[0], height: canvas[1]) }
        func result(_ id: String) -> Result? { results.first { $0.id == id } }
        func rect(_ values: [CGFloat], imageHeight: CGFloat, margin: CGFloat) -> CGRect {
            let scale = imageHeight / CGFloat(canvas[1])
            return CGRect(x: margin + values[0] * scale,
                          y: margin + (CGFloat(canvas[1]) - values[1] - values[3]) * scale,
                          width: values[2] * scale, height: values[3] * scale)
        }
        func attachment(imageHeight: CGFloat, margin: CGFloat) -> CharacterSpeechAttachment {
            let scale = imageHeight / CGFloat(canvas[1])
            return CharacterSpeechAttachment(
                mouth: CGPoint(x: margin + speech.mouth[0] * scale, y: margin + (CGFloat(canvas[1]) - speech.mouth[1]) * scale),
                hairLeft: margin + speech.hairLeft * scale, hairRight: margin + speech.hairRight * scale)
        }
    }
    let version: Int
    let outfits: [Outfit]
    let variants: [String: Variant]
}

struct StandingCharacterFrame {
    let key: String
    let variant: StandingCharacterManifest.Variant
    let faceID: String
    let image: CGImage
}

final class StandingCharacterLibrary {
    enum LoadError: Error { case invalidManifest, unsafePath, unapprovedImage, invalidImage }
    let rootURL: URL
    let manifest: StandingCharacterManifest
    // Only the active view is cached. Switching views releases the previous images.
    private var cacheKey: String?
    private var cache: [String: CGImage] = [:]
    var cachedImageCount: Int { cache.count }

    init(rootURL: URL) throws {
        self.rootURL = rootURL.resolvingSymlinksInPath().standardizedFileURL
        manifest = try JSONDecoder().decode(StandingCharacterManifest.self,
            from: Data(contentsOf: rootURL.appendingPathComponent("manifest.json")))
        try validateSchema()
    }
    func variant(outfit: StandingCharacterOutfit, framing: CharacterFraming) -> StandingCharacterManifest.Variant? {
        manifest.variants["\(outfit.rawValue)/\(framing.rawValue)"]
    }
    private func validateSchema() throws {
        guard manifest.version == 1, !manifest.variants.isEmpty, !manifest.outfits.isEmpty,
              Set(manifest.outfits.map(\.id)).count == manifest.outfits.count,
              manifest.outfits.allSatisfy({ StandingCharacterOutfit(rawValue: $0.id) != nil && !$0.name.isEmpty }) else {
            throw LoadError.invalidManifest
        }
        let outfits = Set(manifest.outfits.map(\.id))
        for (key, v) in manifest.variants {
            guard outfits.contains(v.outfit), let framing = CharacterFraming(rawValue: v.framing),
                  key == "\(v.outfit)/\(v.framing)", v.canvas.count == 2,
                  v.canvas[0] > 0, v.canvas[0] <= 16384, v.canvas[1] == (framing == .full ? 606 : 670),
                  v.defaultFaceID == "00", !v.results.isEmpty,
                  v.bindingMethod == "native-original" || v.bindingMethod == "derived-game-features",
                  Set(v.results.map(\.id)).count == v.results.count,
                  v.result("00") != nil,
                  validRect(v.faceRect, canvas: v.canvas), validRect(v.headRect, canvas: v.canvas),
                  v.speech.mouth.count == 2, v.speech.mouth.allSatisfy(\.isFinite),
                  v.speech.hairLeft.isFinite, v.speech.hairRight.isFinite,
                  v.speech.hairLeft >= 0, v.speech.hairLeft < v.speech.mouth[0],
                  v.speech.mouth[0] < v.speech.hairRight, v.speech.hairRight <= CGFloat(v.canvas[0]),
                  v.speech.mouth[1] >= 0, v.speech.mouth[1] <= CGFloat(v.canvas[1]) else {
                throw LoadError.invalidManifest
            }
            for result in v.results {
                guard result.id.count == 2, result.id.utf8.allSatisfy({ (48...57).contains($0) }),
                      result.sha256.count == 64, result.sha256.allSatisfy({ "0123456789abcdef".contains($0) }),
                      result.review.status == "pending" || result.isApproved else { throw LoadError.invalidManifest }
                _ = try assetURL(result.path)
            }
            guard v.automaticMappings.allSatisfy({ CharacterExpression(rawValue: $0.key) != nil && v.result($0.value)?.isApproved == true }) else {
                throw LoadError.invalidManifest
            }
        }
    }
    private func validRect(_ rect: [CGFloat], canvas: [Int]) -> Bool {
        rect.count == 4 && rect.allSatisfy(\.isFinite) && rect[0] >= 0 && rect[1] >= 0 && rect[2] > 0 && rect[3] > 0 &&
        rect[0] + rect[2] <= CGFloat(canvas[0]) && rect[1] + rect[3] <= CGFloat(canvas[1])
    }
    private func assetURL(_ path: String) throws -> URL {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard path.hasPrefix("sprites/"), !path.contains("\\"), !path.contains("\0"),
              parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else { throw LoadError.unsafePath }
        let url = rootURL.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        guard url.path.hasPrefix(rootURL.path + "/") else { throw LoadError.unsafePath }
        return url
    }
    func image(key: String, faceID: String, allowPendingForQA: Bool = false) throws -> StandingCharacterFrame {
        guard let variant = manifest.variants[key], let result = variant.result(faceID) else { throw LoadError.invalidManifest }
        guard result.isApproved || allowPendingForQA else { throw LoadError.unapprovedImage }
        if cacheKey != key { cache.removeAll(); cacheKey = key }
        if let image = cache[faceID] { return StandingCharacterFrame(key: key, variant: variant, faceID: faceID, image: image) }
        let data = try Data(contentsOf: assetURL(result.path))
        guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == result.sha256,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
              image.width == variant.canvas[0], image.height == variant.canvas[1],
              [.premultipliedLast, .premultipliedFirst, .last, .first].contains(image.alphaInfo) else { throw LoadError.invalidImage }
        cache[faceID] = image
        return StandingCharacterFrame(key: key, variant: variant, faceID: faceID, image: image)
    }
    func resolve(outfit: StandingCharacterOutfit, framing: CharacterFraming, faceID: String) -> StandingCharacterFrame? {
        let key = "\(outfit.rawValue)/\(framing.rawValue)"
        // A damaged/missing expression first falls back to its own approved 00.
        // An unavailable view then uses this outfit's full view, then winter 00.
        let candidates = [(key, faceID), (key, "00"), ("\(outfit.rawValue)/full", "00"), ("a/full", "00")]
        for (key, id) in candidates {
            if let result = try? image(key: key, faceID: id) { return result }
        }
        return nil
    }
    func removeAllCachedImages() { cache.removeAll(); cacheKey = nil }
}
