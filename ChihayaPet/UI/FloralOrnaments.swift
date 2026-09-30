import SwiftUI

/// Original vector paths matching the approved preview, scaled without raster assets.
struct OrnamentPath: Shape {
    let data: String
    var source: CGSize = CGSize(width: 150, height: 200)
    func path(in rect: CGRect) -> Path {
        let tokens = data.replacingOccurrences(of: "([A-Za-z])", with: " $1 ", options: .regularExpression)
            .replacingOccurrences(of: ",", with: " ").split(whereSeparator: { $0.isWhitespace }).map(String.init)
        var result = Path(), cursor = CGPoint.zero, index = 0, command = ""
        func point(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: rect.minX + x / source.width * rect.width, y: rect.minY + y / source.height * rect.height)
        }
        func number() -> Double { defer { index += 1 }; return Double(tokens[index]) ?? 0 }
        while index < tokens.count {
            if tokens[index].first?.isLetter == true { command = tokens[index]; index += 1 }
            if command == "Z" { result.closeSubpath(); command = ""; continue }
            let needed = ["M": 2, "L": 2, "H": 1, "V": 1, "Q": 4, "C": 6][command] ?? 0
            guard needed > 0, index + needed <= tokens.count else { break }
            switch command {
            case "M", "L":
                let x = number(), y = number(); cursor = CGPoint(x: x, y: y)
                if command == "M" { result.move(to: point(x, y)); command = "L" } else { result.addLine(to: point(x, y)) }
            case "H": cursor.x = number(); result.addLine(to: point(cursor.x, cursor.y))
            case "V": cursor.y = number(); result.addLine(to: point(cursor.x, cursor.y))
            case "Q":
                let x = number(), y = number(), endX = number(), endY = number()
                result.addQuadCurve(to: point(endX, endY), control: point(x, y)); cursor = CGPoint(x: endX, y: endY)
            case "C":
                let x = number(), y = number(), x2 = number(), y2 = number(), endX = number(), endY = number()
                result.addCurve(to: point(endX, endY), control1: point(x, y), control2: point(x2, y2)); cursor = CGPoint(x: endX, y: endY)
            default: break
            }
        }
        return result
    }
}

struct DialogueBorder: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 13).stroke(ChihayaStyle.frame.opacity(0.85), lineWidth: 1.5)
            RoundedRectangle(cornerRadius: 9).stroke(ChihayaStyle.frame.opacity(0.55), lineWidth: 0.7).padding(5)
            DialogueCornerLoops()
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

/// Shared corner motifs for both the rectangular dialogue and comic speech bubble.
struct DialogueCornerLoops: View {
    var size: CGFloat = 44
    private let corner = "M 55 6 H 27 C 10 6 6 13 6 28 V 55 M 55 11 H 28 C 17 11 11 17 11 28 V 55 M 40 6 C 33 6 31 13 32 20 C 34 30 40 25 37 19 C 34 13 27 10 21 12 C 11 14 8 24 12 32 C 15 38 25 40 26 35 C 27 29 16 31 11 35 C 7 38 6 43 6 49"
    var body: some View {
        GeometryReader { geo in
            let cornerInset = size * 18 / 44
            ForEach(0..<4) { i in
                OrnamentPath(data: corner, source: CGSize(width: 58, height: 58))
                    .stroke(ChihayaStyle.frame, style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
                    .frame(width: size, height: size).rotationEffect(.degrees(Double(i) * 90))
                    .position(x: i == 0 || i == 3 ? cornerInset : geo.size.width - cornerInset, y: i < 2 ? cornerInset : geo.size.height - cornerInset)
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct IrisOrnament: View {
    private let petals = [
        "M 78 91 C 56 79 45 39 59 24 C 79 15 89 54 78 91 Z",
        "M 78 91 C 73 59 93 12 109 29 C 121 44 99 77 78 91 Z",
        "M 78 91 C 96 67 135 69 135 88 C 128 107 102 106 78 91 Z",
        "M 78 91 C 52 69 20 67 18 87 C 16 107 51 116 78 91 Z",
        "M 78 91 C 83 104 108 112 101 132 C 78 143 66 114 78 91 Z",
        "M 78 91 C 65 102 52 132 35 120 C 27 102 52 91 78 91 Z"
    ]
    var body: some View {
        ZStack {
            OrnamentPath(data: "M 55 198 Q 83 140 79 88 M 59 186 Q 109 159 120 109 Q 86 124 59 186 Z M 63 164 Q 39 123 43 91 Q 69 117 63 164 Z")
                .fill(Color(red: 0.69, green: 0.75, blue: 0.67))
            ForEach(petals.indices, id: \.self) { i in
                OrnamentPath(data: petals[i]).fill(LinearGradient(colors: [Color(red: 0.85, green: 0.83, blue: 0.91), Color(red: 0.56, green: 0.49, blue: 0.66)], startPoint: .top, endPoint: .bottom))
                    .overlay(OrnamentPath(data: petals[i]).stroke(Color(red: 0.58, green: 0.51, blue: 0.66), lineWidth: 0.4))
            }
            OrnamentPath(data: "M 78 91 Q 63 59 63 37 M 80 89 Q 96 58 103 37 M 82 92 Q 111 80 126 87 M 74 93 Q 48 78 27 87")
                .stroke(Color.white.opacity(0.55), lineWidth: 0.5)
            OrnamentPath(data: "M 73 89 L 78 78 L 84 90 L 78 104 Z").fill(Color(red: 0.82, green: 0.73, blue: 0.48))
            OrnamentPath(data: "M 116 69 Q 101 52 113 43 Q 124 39 129 53 Q 137 56 133 65 Q 125 77 116 69 Z").fill(Color(red: 0.95, green: 0.96, blue: 0.89))
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct GardeniaOrnament: View {
    private let layers = [
        "M 68 31 C 86 16 105 26 105 45 C 132 55 127 82 106 89 C 108 115 78 125 64 111 C 41 127 21 108 29 87 C 6 70 23 43 43 45 C 41 29 57 22 68 31 Z",
        "M 67 42 C 91 30 105 46 98 63 C 118 77 99 101 82 96 C 70 115 45 105 45 87 C 24 76 39 50 54 54 C 54 45 60 42 67 42 Z",
        "M 62 53 Q 83 39 93 61 Q 104 78 81 88 Q 59 106 49 79 Q 43 63 62 53 Z",
        "M 63 60 Q 85 50 88 72 Q 86 88 66 84 Q 51 72 63 60 Z",
        "M 67 63 Q 82 59 81 75 Q 70 87 64 74 Q 72 68 76 73"
    ]
    var body: some View {
        ZStack {
            OrnamentPath(data: "M 65 98 Q 16 117 7 81 Q 33 68 65 98 Z M 72 82 Q 94 26 127 39 Q 132 68 72 82 Z M 71 99 Q 114 91 129 122 Q 95 138 71 99 Z", source: CGSize(width: 140, height: 140)).fill(Color(red: 0.72, green: 0.79, blue: 0.68))
            ForEach(layers.indices, id: \.self) { i in
                OrnamentPath(data: layers[i], source: CGSize(width: 140, height: 140))
                    .fill(i % 2 == 0 ? Color(red: 0.99, green: 0.995, blue: 0.94) : Color(red: 0.93, green: 0.95, blue: 0.87))
                    .overlay(OrnamentPath(data: layers[i], source: CGSize(width: 140, height: 140)).stroke(Color(red: 0.70, green: 0.75, blue: 0.66), lineWidth: 0.5))
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}
