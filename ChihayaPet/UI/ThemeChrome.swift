import SwiftUI

private struct ChihayaTheme: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(ChihayaStyle.interfaceFont)
            .foregroundStyle(ChihayaStyle.ink)
            .tint(ChihayaStyle.rose)
            .environment(\.colorScheme, .light)
    }
}

extension View {
    func chihayaTheme() -> some View { modifier(ChihayaTheme()) }
}

/// The same looped double frame used by Chihaya's dialogue panels.
struct ChihayaPanelChrome: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 14)
            .fill(ChihayaStyle.paper)
            .overlay { DialogueBorder().padding(2) }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Reserves its own header space so the flowers never cover text or controls.
struct ChihayaHeaderFlowers: View {
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            IrisOrnament()
                .frame(width: 44, height: 58)
                .rotationEffect(.degrees(8))
                .offset(x: 12, y: -1)
            GardeniaOrnament()
                .frame(width: 33, height: 33)
                .rotationEffect(.degrees(-12))
        }
        .frame(width: 57, height: 59)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct ChihayaDivider: View {
    var body: some View {
        Rectangle().fill(ChihayaStyle.divider).frame(height: 1)
            .accessibilityHidden(true)
    }
}
