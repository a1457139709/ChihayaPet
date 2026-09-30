import SwiftUI

struct MusicSettingsView: View {
    @ObservedObject var music: MusicController
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("夜奏 · 背景音乐").font(ChihayaStyle.sectionFont).foregroundStyle(ChihayaStyle.rose)
                    Spacer()
                    Button("导入音乐…") { music.chooseFiles() }.disabled(music.busy)
                }
                Text("导入喜欢的音乐，在相伴时播放。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                Toggle("启动时播放背景音乐", isOn: $music.autoplayEnabled)
                    .font(ChihayaStyle.editorFont)
                if music.tracks.isEmpty {
                    VStack(spacing: 9) {
                        Image(systemName: "music.note.list").font(.system(size: 28)).foregroundStyle(ChihayaStyle.frame)
                        Text("曲库还是空的")
                        Text("支持 WAV、AIFF、MP3、M4A、AAC").font(ChihayaStyle.captionFont)
                    }.foregroundStyle(ChihayaStyle.secondaryInk).frame(maxWidth: .infinity, minHeight: 130)
                        .background(ChihayaStyle.frame.opacity(0.055), in: RoundedRectangle(cornerRadius: 8))
                } else {
                    ScrollView {
                        LazyVStack(spacing: 4) {
                            ForEach(music.tracks) { track in
                                Button { music.select(track.id) } label: {
                                    HStack {
                                        Image(systemName: music.selectedID == track.id ? "music.note" : "circle")
                                            .foregroundStyle(music.selectedID == track.id ? ChihayaStyle.rose : ChihayaStyle.frame).frame(width: 16)
                                        Text(track.title).lineLimit(2).multilineTextAlignment(.leading)
                                        Spacer()
                                    }.padding(9).background(music.selectedID == track.id ? ChihayaStyle.rose.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 5))
                                }.buttonStyle(.plain).disabled(music.removing)
                            }
                        }
                    }.frame(height: 140)
                        .background(ChihayaStyle.fieldFill, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(ChihayaStyle.divider, lineWidth: 0.7).allowsHitTesting(false))
                }
                HStack {
                    Button("上一首") { music.previous() }.disabled(music.tracks.isEmpty || music.removing)
                    Button(music.wantsPlayback ? "暂停" : "播放") { music.toggle() }.disabled(music.selectedID == nil || music.removing)
                    Button("下一首") { music.next() }.disabled(music.tracks.isEmpty || music.removing)
                    Spacer()
                    Picker("循环", selection: $music.loop) {
                        ForEach(MusicLoop.allCases, id: \.self) { Text($0.title).tag($0) }
                    }.labelsHidden().frame(width: 110)
                }
                HStack {
                    Image(systemName: "speaker.wave.1")
                    Slider(value: $music.volume, in: 0...1).accessibilityLabel("背景音乐音量")
                    Text("\(Int(music.volume * 100))% ").monospacedDigit().frame(width: 44)
                }
                if music.wantsPlayback && music.isSuspended { Text("桌宠隐藏或休眠中，音乐已暂停。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk) }
                if music.busy { ProgressView().controlSize(.small) }
                if let notice = music.notice { Text(notice).font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk) }
                if let error = music.error { Text(error).font(ChihayaStyle.captionFont).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
                Button("从曲库移除所选曲目", role: .destructive) { music.removeSelected() }
                    .font(ChihayaStyle.captionFont).foregroundStyle(.red).disabled(music.selectedID == nil || music.busy)
                Text("隐藏桌宠或电脑休眠时，音乐会暂停。")
                    .font(ChihayaStyle.footnoteFont).foregroundStyle(ChihayaStyle.secondaryInk)
            }.padding(16)
        }.background(ChihayaStyle.paper).chihayaTheme()
    }
}
