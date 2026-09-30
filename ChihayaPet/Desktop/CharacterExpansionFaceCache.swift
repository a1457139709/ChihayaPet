import CoreGraphics
import Foundation

// Serial-use, face-only LRU. Keys contain UUIDs, never strong variant references.
final class ExpansionFaceCache {
    static let maximumBytes = 64 * 1024 * 1024
    private struct Key: Hashable { let variant: UUID; let state: ExpansionFaceState }
    private struct Entry { let image: CGImage; let cost: Int }
    private var entries: [Key: Entry] = [:]
    private var recency: [Key] = [] // oldest first
    private let byteLimit: Int
    private(set) var decodedBytes = 0
    var count: Int { entries.count }
    init(byteLimit: Int = maximumBytes) { self.byteLimit = max(0, min(byteLimit, Self.maximumBytes)) }

    func removeAll() { entries.removeAll(); recency.removeAll(); decodedBytes = 0 }
    func image(for prepared: ExpansionPreparedVariant, state: ExpansionFaceState) throws -> CGImage {
        let key = Key(variant: prepared.identity, state: state)
        if let entry = entries[key] {
            recency.removeAll { $0 == key }; recency.append(key)
            return entry.image
        }
        guard let recipe = prepared.variant.recipes.first(where: { $0.state == state }) else {
            throw ExpansionResourceError.undeclaredState
        }
        let width = prepared.defaultFace.width, height = prepared.defaultFace.height
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw ExpansionResourceError.invalidVariant(prepared.key)
        }
        context.interpolationQuality = .none
        context.setBlendMode(.copy)
        context.clear(CGRect(x: 0, y: 0, width: width, height: height))
        for patch in recipe.patches {
            guard let image = prepared.images[patch.asset] else { throw ExpansionResourceError.invalidAsset(patch.asset) }
            context.draw(image, in: patch.destination.bottomLeftRect(canvasHeight: Double(height)))
        }
        guard let image = context.makeImage() else { throw ExpansionResourceError.invalidVariant(prepared.key) }
        let cost = image.bytesPerRow * image.height
        if cost <= byteLimit {
            while decodedBytes > byteLimit - cost, let oldest = recency.first {
                recency.removeFirst()
                if let removed = entries.removeValue(forKey: oldest) { decodedBytes -= removed.cost }
            }
            entries[key] = Entry(image: image, cost: cost); recency.append(key); decodedBytes += cost
        }
        return image
    }
}
