import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: AppStore
    var music: MusicController? = nil
    @FocusState private var focused: Field?
    private enum Field { case address, model, key }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 13) {
                ChihayaHeaderFlowers()
                VStack(alignment: .leading, spacing: 3) {
                    Text("千早桌宠").font(ChihayaStyle.nameFont).foregroundStyle(ChihayaStyle.rose)
                    Text("在熟悉的桌面，留一点陪伴。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                }
                Spacer()
            }.padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 10)
            TabView(selection: $store.settingsTab) {
                service.tabItem { Label("模型服务", systemImage: "network") }.tag(0)
                persona.tabItem { Label("角色设定", systemImage: "text.bubble") }.tag(1)
                if let music { MusicSettingsView(music: music).tabItem { Label("背景音乐", systemImage: "music.note") }.tag(2) }
            }.padding(.horizontal, 20)
            VStack(alignment: .leading, spacing: 5) {
                if let error = store.settingsError { Text(error).foregroundStyle(.red) }
                if let notice = store.settingsNotice { Text(notice).foregroundStyle(ChihayaStyle.secondaryInk) }
            }.font(ChihayaStyle.captionFont).frame(maxWidth: .infinity, alignment: .leading)
                .frame(minHeight: 22).padding(.horizontal, 26).padding(.top, 8).padding(.bottom, 20)
        }.frame(width: 520, height: 580).background(ChihayaPanelChrome()).chihayaTheme()
            .alert(item: $store.promptSaveAlert) { result in
                Alert(title: Text(result.title), message: Text(result.message), dismissButton: .default(Text("好")))
            }
            .onAppear { focusMissingField() }
            .onChange(of: store.settingsError) { _, _ in focusMissingField() }
            .onChange(of: store.connectionFocusRequest) { _, _ in
                DispatchQueue.main.async { focusMissingField() }
            }
    }
    private var service: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("连接模型服务").font(ChihayaStyle.sectionFont).foregroundStyle(ChihayaStyle.rose)
                field("HTTPS API 基础地址") {
                    TextField("https://example.com/v1", text: Binding(get: { store.draftAddress }, set: store.setDraftAddress))
                        .focused($focused, equals: .address)
                }
                Text("填写服务提供的基础地址，保留地址中的版本路径。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                field("模型名称") { TextField("填写服务提供的模型名", text: Binding(get: { store.draftModel }, set: store.setDraftModel)).focused($focused, equals: .model) }
                field("API Key") { SecureField("填写服务密钥", text: Binding(get: { store.draftKey }, set: store.setDraftKey)).focused($focused, equals: .key) }
                Text("密钥以明文保存在本机。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                HStack {
                    Button("测试连接") { store.testConnection() }.disabled(store.isBusy)
                    if store.coordinator.activeKind == .test { ProgressView().controlSize(.small); Button("取消") { store.cancelRequest() } }
                    Spacer()
                    Button("保存服务") { store.saveConnection() }.buttonStyle(.borderedProminent)
                }
                if let status = store.testStatus { Text(status).font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk) }
                Text("测试当前填写的配置，可能产生一次请求费用；测试不会保存设置。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                ChihayaDivider()
                Text("消息将发送给你配置的服务，其数据保留政策由服务方决定。本应用不在磁盘保存聊天。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
                Button("删除当前已保存服务的密钥", role: .destructive) { store.deleteCurrentKey() }
                    .font(ChihayaStyle.captionFont).foregroundStyle(.red).disabled(store.settings.baseURL.isEmpty)
            }.textFieldStyle(.roundedBorder).padding(16)
        }.background(ChihayaStyle.paper)
    }
    private var persona: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("角色设定").font(ChihayaStyle.sectionFont).foregroundStyle(ChihayaStyle.rose)
            Text("调整千早说话的方式与性格。保存成功后，将结束当前对话并开始新的对话。").font(ChihayaStyle.captionFont).foregroundStyle(ChihayaStyle.secondaryInk)
            ThemedPlainTextEditor(text: $store.draftPrompt, accessibilityLabel: "角色设定提示词")
                .padding(2)
                .background(ChihayaStyle.fieldFill, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(ChihayaStyle.divider, lineWidth: 0.7).allowsHitTesting(false))
            HStack {
                Button("恢复默认并保存") { store.savePrompt(restoringDefault: true) }
                Spacer()
                Button("保存角色设定") { store.savePrompt() }.buttonStyle(.borderedProminent)
            }
        }.padding(16).background(ChihayaStyle.paper)
    }
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(ChihayaStyle.captionFont.weight(.medium))
            content().font(ChihayaStyle.editorFont)
        }
    }
    private func focusMissingField() {
        if (try? ConnectionConfig.validated(baseURL: store.draftAddress, model: "validation")) == nil { focused = .address }
        else if store.draftModel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { focused = .model }
        else if store.draftKey.isEmpty { focused = .key }
    }
}
