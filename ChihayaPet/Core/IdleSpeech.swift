import Foundation

struct IdleSpeechSchedule {
    private var due: Date?
    mutating func reset() { due = nil }
    mutating func advance(now: Date, allowed: Bool, delay: TimeInterval) -> Bool {
        guard allowed else { reset(); return false }
        guard let due else { self.due = now.addingTimeInterval(delay); return false }
        guard now >= due else { return false }
        self.due = now.addingTimeInterval(delay)
        return true
    }
}

enum IdleSpeechFrequency: Int, CaseIterable {
    case frequent, normal, quiet
    var title: String {
        switch self {
        case .frequent: return "经常 · 1–3 分钟"
        case .normal: return "适中 · 3–7 分钟"
        case .quiet: return "安静 · 10–15 分钟"
        }
    }
    var delay: TimeInterval {
        switch self {
        case .frequent: return .random(in: 60...180)
        case .normal: return .random(in: 180...420)
        case .quiet: return .random(in: 600...900)
        }
    }
}

/// Existing companion lines plus separately sourced, verbatim game dialogue.
struct IdleSpeechCatalog {
    // 原文来源：assets/chinese_character_prompt/chihaya_chinese_corpus_clean.jsonl
    // 逐字保留 response.text；每条注释标明脚本、偏移和 record_id。
    private static let originalGameLines: [String] = [
        // 08n.scb:81285 · 90889b78cd47828f
        "贵安。",
        // 02n.scb:196993 · 106df5d44671bb61
        "那么，今天吃什么好呢……",
        // 05n.scb:275464 · cf904da0d129520a
        "……啊，已经这个时间了",
        // 07n.scb:119783 · 7d168bdc274c8e59
        "在这个时间稍微休息一会儿，好像已经变成一种习惯了呢……",
        // 08n.scb:116547 · 9fdf57e85ad28716
        "……去看会书吧。",
        // 08n.scb:116891 · 21e4ff8133eff79f
        "真安静啊……",
        // 08n.scb:211326 · 6e0ab00e04c4a186
        "那么，今天就悠然地喝着茶度过这段时间吧。",
        // 07n.scb:93510 · 39d93eefa59036d6
        "插花……最能欣赏花朵的时候，是什么时候呢？",
        // 08n.scb:84702 · 146f3d8e8c13fcee
        "……能开出漂亮的花就好了呢。",
        // 10k.scb:25841 · 852e470b2f9ca4fe
        "不知道是不是因为发生了很多事的缘故，今年更加让人觉得时间过得很快呢。真的，就是一转眼啊",
    ]

    private static let originalMorningLines: [String] = [
        // 01n.scb:125095 · d801a8aaf8d9bf25
        "早上好。",
        // 01n.scb:227589 · 07db177bcd2880d4
        "……早上好。",
    ]

    private static let originalNightLines: [String] = [
        // 08n.scb:92423 · 18586371ef2edb73
        "晚安。",
        // 08n.scb:212463 · 02c06e8c095fcc6e
        "贵安，祝你有个美好的夜晚。",
        // 04n.scb:101747 · b360ac3370ff5d8a
        "……我要睡了",
    ]

    private var recent: [String] = []
    static func lines(hour: Int) -> [String] {
        let greeting: String
        switch hour {
        case 5..<11: greeting = "早上好。愿今天能有一件让你微笑的小事。"
        case 11..<14: greeting = "中午好。再忙，也请留一点时间好好吃饭。"
        case 14..<18: greeting = "下午好。若是有些疲倦，不妨先喝口水，稍稍歇一会儿。"
        case 18..<23: greeting = "晚上好。忙碌了一天，现在可以稍微放松些了。"
        default: greeting = "夜已经深了。还有事情要做的话，也请照顾好自己。"
        }
        let timeSpecificLines: [String]
        switch hour {
        case 5..<11: timeSpecificLines = originalMorningLines
        case 21..<24, 0..<5: timeSpecificLines = originalNightLines
        default: timeSpecificLines = []
        }
        return [greeting,
            "今天有没有遇到什么有趣的小事？如果愿意，我很乐意听你说。",
            "不必急着把每件事都做得完美。慢慢来，也是一种认真。",
            "偶尔什么都不说，安静地待一会儿，也很好。",
            "如果有一段属于自己的闲暇，你想读书，还是出门散散步呢？",
            "一张小小的书签，能替人记住故事暂停的地方。下次翻开时，就像赴一个约。",
            "茶杯的杯柄虽小，却能让手指避开烫热的杯身。日常物品里的体贴，总是藏在细节中。",
            "红茶的香气不只有一种。有的轻柔，有的浓郁，倒像各有各的性格。",
            "给茶留一点慢慢变温的时间，也给自己留一点不必匆忙的时间吧。",
            "笔记本不一定要写满重要的事。记下一句喜欢的话，也值得。",
            "铅笔写下的字可以修改，这一点很温柔。第一次没有写好，也不必介意。",
            "说到花，干花与鲜花各有美感。一种留住形状，一种让人珍惜眼前。",
            "折伞收起来很小，打开却能替人挡住一场雨。是件让人安心的小物品呢。",
            "方糖会慢慢融进茶里。有些细小的好意，也是这样不声不响地留下来。",
            "如果今天过得不太顺利，也不必勉强自己立刻振作。我可以陪你坐一会儿。",
            "窗边读书、桌旁喝茶……只是想象这样的片刻，心情也会平静一点。",
            "喜欢的故事读到最后一页，总有些舍不得。你会立刻开始下一本吗？",
            "一封手写的信，连停顿和笔迹都能留下来。那份郑重，很动人。",
            "今天也辛苦了。那些别人没有注意到的努力，并不会因此失去意义。",
            "若是一直专注于一件事，不妨让视线离开屏幕片刻。等你回来，我们再聊。"
        ] + originalGameLines + timeSpecificLines
    }
    mutating func next(hour: Int) -> String {
        let lines = Self.lines(hour: hour)
        let line = lines.filter { !recent.contains($0) }.randomElement() ?? lines[0]
        recent.append(line)
        if recent.count > 8 { recent.removeFirst() }
        return line
    }
}
