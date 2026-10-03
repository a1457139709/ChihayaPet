import AppKit
import CryptoKit
import ImageIO

// Separate identifiers keep the legacy CaseIterable/menu/resource contract intact.
enum ExpandedCharacterStyle: String, Codable, CaseIterable {
    case winterFront = "a", summerFront = "a_", winterSide = "b", summerSide = "b_"
    case casual = "c", pink = "d", gym = "e"
    case blueRose = "blue_rose", redSkirt = "red_skirt", longShirt = "long_shirt"
    var legacyStyle: CharacterStyle? { CharacterStyle(rawValue: rawValue) }
    var title: String {
        if let legacyStyle { return legacyStyle.title }
        switch self { case .blueRose: return "蓝白玫瑰礼装"; case .redSkirt: return "白衬衫红裙"; default: return "宽松长衬衫" }
    }
}
enum ExpandedCharacterExpression: String, Codable, CaseIterable {
    case neutral, serious, smile, surprised, shy, pout, sleepy, proud
    var title: String {
        switch self {
        case .neutral: "日常"; case .serious: "认真"; case .smile: "微笑"; case .surprised: "惊讶"
        case .shy: "害羞"; case .pout: "轻嗔"; case .sleepy: "困倦"; case .proud: "得意"
        }
    }
}
struct ExpansionFaceState: Codable, Hashable {
    var expression: ExpandedCharacterExpression
    var eye: CharacterEye
    var gaze: CharacterGaze
    var mouth: CharacterMouth
    static var all: [Self] {
        ExpandedCharacterExpression.allCases.flatMap { expression in CharacterEye.allCases.flatMap { eye in
            CharacterGaze.allCases.flatMap { gaze in CharacterMouth.allCases.map { mouth in
                Self(expression: expression, eye: eye, gaze: gaze, mouth: mouth)
            } }
        } }
    }
}
// All stored coordinates are integer image pixels measured from TOP LEFT.
// CGRect destinations for unflipped CoreGraphics/AppKit are converted explicitly.
struct ExpansionPixelRect: Codable, Equatable {
    var x: Double; var y: Double; var width: Double; var height: Double
    func bottomLeftRect(canvasHeight: Double) -> CGRect {
        CGRect(x: x, y: canvasHeight - y - height, width: width, height: height)
    }
    func fits(width w: Int, height h: Int) -> Bool {
        [x, y, width, height].allSatisfy { $0.isFinite && $0.rounded() == $0 } &&
        x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= Double(w) && y + height <= Double(h)
    }
}
struct ExpansionPixelPoint: Codable {
    var x: Double; var y: Double
    func bottomLeftPoint(canvasHeight: Double) -> CGPoint { CGPoint(x: x, y: canvasHeight - y) }
}
struct ExpansionAsset: Codable {
    enum Origin: String, Codable { case extensionPack, legacy }
    var origin: Origin
    var path: String
    var sha256: String
    var width: Int
    var height: Int
}
struct ExpansionSourceArtwork: Codable {
    let id: String
    var projectRelativePath: String
    var sha256: String
    var width: Int
    var height: Int
}
struct ExpansionPatch: Codable {
    var asset: String
    // Face-local rectangle. Patches must be fully opaque and exactly this size.
    var destination: ExpansionPixelRect
}
struct ExpansionFaceRecipe: Codable {
    var state: ExpansionFaceState
    // Ordered replacement pieces permit expression/eyes/gaze/mouth factoring.
    var patches: [ExpansionPatch]
}
struct ExpansionVariant: Codable {
    var base: String // Complete default-face character image.
    var source: String // Metadata ID of immutable source artwork in sourceArtworks.
    var sourceCrop: ExpansionPixelRect
    var face: ExpansionPixelRect // In base image coordinates.
    var head: ExpansionPixelRect
    var mouth: ExpansionPixelPoint
    var hairLeft: Double
    var hairRight: Double
    var recipes: [ExpansionFaceRecipe]
    var runtimeAssets: Set<String> { Set([base] + recipes.flatMap { $0.patches.map(\.asset) }) }
}
struct ExpansionManifest: Codable {
    var version: Int
    var assets: [String: ExpansionAsset]
    var sourceArtworks: [ExpansionSourceArtwork]
    var declaredStates: [ExpansionFaceState]
    var variants: [String: ExpansionVariant]
}

enum ExpansionResourceError: Error, Equatable {
    case invalidManifest(String), unsafePath(String), invalidAsset(String), invalidSource(String), invalidVariant(String), undeclaredState
}
enum ExpansionValidationMode { case staged, complete }
enum ExpansionResolution: Equatable { case exact, standing, unavailable }

struct ExpansionLibrary {
    let rootURL: URL
    let manifest: ExpansionManifest
    let legacyRootURL: URL?
    // Trusted caller provides paths + hashes from the immutable bundled legacy manifest.
    // An extension manifest cannot grant itself access to arbitrary legacy files.
    let allowedLegacyHashes: [String: String]
    init(rootURL: URL, manifest: ExpansionManifest, legacyRootURL: URL? = nil, allowedLegacyHashes: [String: String] = [:]) throws {
        guard manifest.version == 1 else { throw ExpansionResourceError.invalidManifest("version") }
        self.rootURL = rootURL; self.manifest = manifest
        self.legacyRootURL = legacyRootURL; self.allowedLegacyHashes = allowedLegacyHashes
    }
    init(rootURL: URL, legacyRootURL: URL? = nil, allowedLegacyHashes: [String: String] = [:]) throws {
        try self.init(rootURL: rootURL, manifest: JSONDecoder().decode(ExpansionManifest.self,
            from: Data(contentsOf: rootURL.appendingPathComponent("manifest.json"))),
            legacyRootURL: legacyRootURL, allowedLegacyHashes: allowedLegacyHashes)
    }
    private static var variantKeys: Set<String> {
        Set(ExpandedCharacterStyle.allCases.flatMap { style in CharacterPose.allCases.flatMap { pose in
            CharacterFraming.allCases.map { "\(style.rawValue)/\(pose.rawValue)/\($0.rawValue)" }
        } })
    }
    private static func validateRelativePath(_ path: String) throws {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !path.isEmpty, !path.contains("\\"), !path.contains("\0"),
              parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            throw ExpansionResourceError.unsafePath(path)
        }
    }
    private static func hasValidHash(_ hash: String) -> Bool {
        hash.count == 64 && hash.allSatisfy { "0123456789abcdef".contains($0) }
    }
    private func validateSchema(_ mode: ExpansionValidationMode) throws {
        // Bound every asset before rectangle arithmetic or Double-to-Int conversion.
        // Double(Int.max) rounds beyond Int.max and is not safely convertible.
        for (id, asset) in manifest.assets {
            guard asset.width > 0, asset.height > 0,
                  asset.width <= 16384, asset.height <= 16384 else {
                throw ExpansionResourceError.invalidAsset(id)
            }
        }
        var sources: [String: ExpansionSourceArtwork] = [:]
        for source in manifest.sourceArtworks {
            guard !source.id.isEmpty, sources[source.id] == nil else {
                throw ExpansionResourceError.invalidManifest("duplicate source artwork ID")
            }
            try Self.validateRelativePath(source.projectRelativePath)
            guard Self.hasValidHash(source.sha256), source.width > 0, source.height > 0,
                  source.width <= 16384, source.height <= 16384 else {
                throw ExpansionResourceError.invalidSource(source.id)
            }
            sources[source.id] = source
        }
        let states = Set(manifest.declaredStates)
        guard !states.isEmpty, states.count == manifest.declaredStates.count,
              !manifest.variants.isEmpty, Set(manifest.variants.keys).isSubset(of: Self.variantKeys) else {
            throw ExpansionResourceError.invalidManifest("states or variant keys")
        }
        if mode == .complete {
            guard Set(manifest.variants.keys) == Self.variantKeys, states == Set(ExpansionFaceState.all) else {
                throw ExpansionResourceError.invalidManifest("complete pack requires 80 variants and all facial states")
            }
        }
        for (key, v) in manifest.variants {
            guard let base = manifest.assets[v.base], let source = sources[v.source],
                  v.sourceCrop.fits(width: source.width, height: source.height),
                  v.face.fits(width: base.width, height: base.height), v.head.fits(width: base.width, height: base.height),
                  [v.mouth.x, v.mouth.y, v.hairLeft, v.hairRight].allSatisfy({ $0.isFinite }),
                  v.mouth.x >= 0, v.mouth.x <= Double(base.width), v.mouth.y >= 0, v.mouth.y <= Double(base.height),
                  v.hairLeft >= 0, v.hairRight <= Double(base.width), v.hairLeft < v.hairRight,
                  Set(v.recipes.map(\.state)) == states, v.recipes.count == states.count else {
                throw ExpansionResourceError.invalidVariant(key)
            }
            for patch in v.recipes.flatMap(\.patches) {
                guard let asset = manifest.assets[patch.asset],
                      patch.destination.fits(width: Int(v.face.width), height: Int(v.face.height)),
                      patch.destination.width == Double(asset.width), patch.destination.height == Double(asset.height) else {
                    throw ExpansionResourceError.invalidVariant(key)
                }
            }
        }
        if mode == .complete {
            let referencedAssets = Set(manifest.variants.values.flatMap(\.runtimeAssets))
            let referencedExtensionAssets = Set(referencedAssets.filter {
                manifest.assets[$0]?.origin == .extensionPack
            })
            let declaredExtensionAssets = Set(manifest.assets.compactMap { id, asset in
                asset.origin == .extensionPack ? id : nil
            })
            guard declaredExtensionAssets == referencedExtensionAssets else {
                throw ExpansionResourceError.invalidManifest("unreferenced extension assets")
            }
        }
    }
    private func assetURL(_ asset: ExpansionAsset) throws -> URL {
        try Self.validateRelativePath(asset.path)
        let root: URL
        if asset.origin == .legacy {
            guard let legacyRootURL, allowedLegacyHashes[asset.path] == asset.sha256 else {
                throw ExpansionResourceError.unsafePath(asset.path)
            }
            root = legacyRootURL
        } else { root = rootURL }
        let canonicalRoot = root.resolvingSymlinksInPath().standardizedFileURL
        let url = canonicalRoot.appendingPathComponent(asset.path).resolvingSymlinksInPath().standardizedFileURL
        guard url.path.hasPrefix(canonicalRoot.path + "/") else { throw ExpansionResourceError.unsafePath(asset.path) }
        return url
    }
    private func decode(_ id: String) throws -> CGImage {
        guard let asset = manifest.assets[id], asset.width > 0, asset.height > 0,
              asset.width <= 16384, asset.height <= 16384,
              Self.hasValidHash(asset.sha256) else {
            throw ExpansionResourceError.invalidAsset(id)
        }
        let data = try Data(contentsOf: assetURL(asset))
        guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == asset.sha256,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              (props[kCGImagePropertyPixelWidth] as? Int) == asset.width,
              (props[kCGImagePropertyPixelHeight] as? Int) == asset.height,
              let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else {
            throw ExpansionResourceError.invalidAsset(id)
        }
        return image
    }
    private func validateOpaquePatch(_ image: CGImage, id: String) throws {
        let rep = NSBitmapImageRep(cgImage: image)
        for y in 0..<image.height { for x in 0..<image.width {
            guard let color = rep.colorAt(x: x, y: y), color.alphaComponent >= 1 else {
                throw ExpansionResourceError.invalidAsset("transparent replacement: " + id)
            }
        } }
    }
    func validate(_ mode: ExpansionValidationMode) throws {
        try validateSchema(mode)
        let patches = Set(manifest.variants.values.flatMap { $0.recipes.flatMap { $0.patches.map(\.asset) } })
        // Decode one asset at a time: validation never becomes a whole-pack image cache.
        for id in manifest.assets.keys {
            let image = try decode(id)
            if patches.contains(id) { try validateOpaquePatch(image, id: id) }
        }
    }
    func verifySources(at projectRootURL: URL) throws {
        try validateSchema(.staged)
        let canonicalRoot = projectRootURL.resolvingSymlinksInPath().standardizedFileURL
        for source in manifest.sourceArtworks {
            let url = canonicalRoot.appendingPathComponent(source.projectRelativePath)
                .resolvingSymlinksInPath().standardizedFileURL
            guard url.path.hasPrefix(canonicalRoot.path + "/") else {
                throw ExpansionResourceError.unsafePath(source.projectRelativePath)
            }
            guard let data = try? Data(contentsOf: url),
                  SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == source.sha256,
                  let imageSource = CGImageSourceCreateWithData(data as CFData, nil),
                  let props = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
                  (props[kCGImagePropertyPixelWidth] as? Int) == source.width,
                  (props[kCGImagePropertyPixelHeight] as? Int) == source.height else {
                throw ExpansionResourceError.invalidSource(source.id)
            }
        }
    }
    func prepare(style: ExpandedCharacterStyle, pose: CharacterPose, framing: CharacterFraming) throws -> (resolution: ExpansionResolution, prepared: ExpansionPreparedVariant?) {
        try validateSchema(.staged)
        let exact = "\(style.rawValue)/\(pose.rawValue)/\(framing.rawValue)"
        let standing = "\(style.rawValue)/standing/\(framing.rawValue)"
        let key = manifest.variants[exact] != nil ? exact : standing
        guard let variant = manifest.variants[key] else { return (.unavailable, nil) }
        var images: [String: CGImage] = [:]
        for id in variant.runtimeAssets { images[id] = try decode(id) }
        for id in Set(variant.recipes.flatMap { $0.patches.map(\.asset) }) {
            try validateOpaquePatch(images[id]!, id: id)
        }
        guard let base = images[variant.base], let face = base.cropping(to: CGRect(x: variant.face.x, y: variant.face.y, width: variant.face.width, height: variant.face.height)) else {
            throw ExpansionResourceError.invalidVariant(key)
        }
        return (key == exact ? .exact : .standing, ExpansionPreparedVariant(key: key, variant: variant, images: images, defaultFace: face))
    }
}

final class ExpansionPreparedVariant {
    let identity = UUID()
    let key: String
    let variant: ExpansionVariant
    let images: [String: CGImage]
    let defaultFace: CGImage
    fileprivate init(key: String, variant: ExpansionVariant, images: [String: CGImage], defaultFace: CGImage) {
        self.key = key; self.variant = variant; self.images = images; self.defaultFace = defaultFace
    }
}
// Caller serializes usage (normally on the main actor). Preparation either fully
// succeeds before assignment, or throws while current remains untouched.
final class ExpansionActiveVariant {
    private(set) var current: ExpansionPreparedVariant?
    func switchTo(style: ExpandedCharacterStyle, pose: CharacterPose, framing: CharacterFraming, library: ExpansionLibrary) throws -> ExpansionResolution {
        let result = try library.prepare(style: style, pose: pose, framing: framing)
        if let prepared = result.prepared { current = prepared }
        return result.resolution
    }
    func clear() { current = nil }
}
