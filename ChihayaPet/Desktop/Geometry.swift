import CoreGraphics

enum Geometry {
    private static let panelGap: CGFloat = 8

    static func nearbyPanel(size: CGSize, pet: CGRect, screen: CGRect) -> CGRect {
        let centeredY = pet.midY - size.height / 2
        let leftX = pet.minX - panelGap - size.width
        let rightX = pet.maxX + panelGap

        let preferredX: CGFloat
        if leftX >= screen.minX {
            preferredX = leftX
        } else {
            preferredX = rightX
        }

        return CGRect(
            x: clamp(preferredX, lower: screen.minX, upper: screen.maxX - size.width),
            y: clamp(centeredY, lower: screen.minY, upper: screen.maxY - size.height),
            width: size.width,
            height: size.height
        )
    }

    static func clamped(_ frame: CGRect, to screen: CGRect) -> CGRect {
        CGRect(
            x: clamp(frame.minX, lower: screen.minX, upper: screen.maxX - frame.width),
            y: clamp(frame.minY, lower: screen.minY, upper: screen.maxY - frame.height),
            width: frame.width,
            height: frame.height
        )
    }

    private static func clamp(_ value: CGFloat, lower: CGFloat, upper: CGFloat) -> CGFloat {
        guard upper >= lower else { return lower }
        return min(max(value, lower), upper)
    }
}
