import AppKit
import ImageIO

// These identifiers are shared by preferences and the self-contained resource manifest.
enum CharacterStyle: String, CaseIterable, Codable {
    case winterFront = "a", summerFront = "a_", winterSide = "b", summerSide = "b_", casual = "c", pink = "d", gym = "e"
    var title: String {
        switch self {
        case .winterFront: return "冬服正面"
        case .summerFront: return "夏服正面"
        case .winterSide: return "冬服侧身"
        case .summerSide: return "夏服侧身"
        case .casual: return "米色便服"
        case .pink: return "粉色裙装"
        case .gym: return "体操服"
        }
    }
    var fallbackOutfit: String { self == .summerFront || self == .summerSide ? "summer" : "winter" }
}
enum CharacterFraming: String, CaseIterable, Codable {
    case full, close
    var title: String { self == .full ? "全景" : "近景" }
}
enum CharacterExpression: String, CaseIterable, Codable {
    case neutral, serious, smile, surprised
    var title: String {
        switch self { case .neutral: return "日常"; case .serious: return "认真"; case .smile: return "微笑"; case .surprised: return "惊讶" }
    }
}
enum CharacterExpressionMode: String, CaseIterable, Codable {
    case automatic, neutral, serious, smile, surprised
    var expression: CharacterExpression? { CharacterExpression(rawValue: rawValue) }
    var title: String { expression?.title ?? "自动" }
    func resolved(waitingForReply: Bool, speaking: Bool) -> CharacterExpression {
        expression ?? (speaking ? .smile : (waitingForReply ? .serious : .neutral))
    }
}
enum CharacterEye: String, CaseIterable, Codable { case open, half, closed }
enum CharacterMouth: String, CaseIterable, Codable { case closed, small, medium }

struct CharacterSpeechAttachment: Equatable {
    var mouth: CGPoint
    var hairLeft: CGFloat
    var hairRight: CGFloat
    func translated(by offset: CGPoint) -> Self {
        Self(mouth: CGPoint(x: mouth.x + offset.x, y: mouth.y + offset.y), hairLeft: hairLeft + offset.x, hairRight: hairRight + offset.x)
    }
}

struct CharacterManifest: Decodable {
    struct Variant: Decodable {
        struct Speech: Decodable { let mouth: [CGFloat]; let hairLeft: CGFloat; let hairRight: CGFloat }
        let width: CGFloat
        let height: CGFloat
        let body: String
        let faceOffset: [CGFloat]
        let faceSize: [CGFloat]
        let frames: [String: [String: [String: String]]]
        let speech: Speech
        var facePaths: Set<String> { Set(frames.values.flatMap { $0.values.flatMap { $0.values } }) }
        var paths: Set<String> { facePaths.union([body]) }
        func face(_ expression: CharacterExpression, _ eye: CharacterEye, _ mouth: CharacterMouth) -> String? {
            frames[expression.rawValue]?[eye.rawValue]?[mouth.rawValue]
        }
        func attachment(imageHeight: CGFloat, margin: CGFloat) -> CharacterSpeechAttachment {
            let scale = imageHeight / height
            return CharacterSpeechAttachment(
                mouth: CGPoint(x: margin + speech.mouth[0] * scale, y: margin + (height - speech.mouth[1]) * scale),
                hairLeft: margin + speech.hairLeft * scale, hairRight: margin + speech.hairRight * scale)
        }
    }
    let version: Int
    let variants: [String: Variant]
    let assetHashes: [String: String]
}

struct LoadedCharacter {
    let variant: CharacterManifest.Variant
    let images: [String: CGImage]
}

struct RenderedCharacter {
    let variant: CharacterManifest.Variant
    let frames: [String: CGImage]
}

struct CharacterSpriteLibrary {
    enum LoadError: Error { case invalidManifest, missingVariant, invalidImage(String), compositionFailed(String) }
    let rootURL: URL
    let manifest: CharacterManifest
    init(rootURL: URL) throws {
        self.rootURL = rootURL
        manifest = try JSONDecoder().decode(CharacterManifest.self, from: Data(contentsOf: rootURL.appendingPathComponent("manifest.json")))
        guard manifest.version == 1 else { throw LoadError.invalidManifest }
    }
    func load(style: CharacterStyle, framing: CharacterFraming) throws -> LoadedCharacter {
        guard let variant = manifest.variants["\(style.rawValue)/\(framing.rawValue)"],
              variant.width > 0, variant.height > 0, variant.faceOffset.count == 2,
              variant.faceSize.count == 2, variant.speech.mouth.count == 2 else { throw LoadError.missingVariant }
        for expression in CharacterExpression.allCases {
            for eye in CharacterEye.allCases {
                for mouth in CharacterMouth.allCases {
                    guard variant.face(expression, eye, mouth) != nil else { throw LoadError.invalidManifest }
                }
            }
        }
        var images: [String: CGImage] = [:]
        for path in variant.paths {
            guard path.hasPrefix("assets/"), !path.contains(".."), manifest.assetHashes[path] != nil,
                  let source = CGImageSourceCreateWithURL(rootURL.appendingPathComponent(path) as CFURL, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { throw LoadError.invalidImage(path) }
            let size = path == variant.body ? [variant.width, variant.height] : variant.faceSize
            guard image.width == Int(size[0]), image.height == Int(size[1]) else { throw LoadError.invalidImage(path) }
            images[path] = image
        }
        return LoadedCharacter(variant: variant, images: images)
    }

    func loadRendered(style: CharacterStyle, framing: CharacterFraming) throws -> RenderedCharacter {
        let loaded = try load(style: style, framing: framing)
        guard let body = loaded.images[loaded.variant.body] else { throw LoadError.invalidImage(loaded.variant.body) }
        let width = Int(loaded.variant.width), height = Int(loaded.variant.height)
        let colorSpace = body.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
        let faceRect = CGRect(
            x: loaded.variant.faceOffset[0],
            y: loaded.variant.height - loaded.variant.faceOffset[1] - loaded.variant.faceSize[1],
            width: loaded.variant.faceSize[0],
            height: loaded.variant.faceSize[1]
        )
        var frames: [String: CGImage] = [:]
        for path in loaded.variant.facePaths {
            guard let face = loaded.images[path],
                  let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width * 4, space: colorSpace, bitmapInfo: bitmapInfo) else {
                throw LoadError.compositionFailed(path)
            }
            context.interpolationQuality = .none
            context.draw(body, in: CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(face, in: faceRect)
            guard let frame = context.makeImage() else { throw LoadError.compositionFailed(path) }
            frames[path] = frame
        }
        return RenderedCharacter(variant: loaded.variant, frames: frames)
    }
}
