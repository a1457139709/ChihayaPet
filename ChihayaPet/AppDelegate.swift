import AppKit

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSMenuItemValidation {
    private var desktop: DesktopController?
    private var store: AppStore?
    private var windows: InteractionWindows?
    private var statusItem: NSStatusItem?
    private var music: MusicController?

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
        withExtendedLifetime(delegate) {}
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Hosted XCTest must not launch desktop UI or touch the user's saved configuration.
        guard ProcessInfo.processInfo.environment["CHIHAYA_TESTING"] != "1", ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil, NSClassFromString("XCTestCase") == nil else { return }
        installApplicationMenu()
        let desktop = DesktopController()
        let store = AppStore(client: URLSessionModelClient(), credentials: FileCredentialStore(), preferences: LocalPreferencesStore())
        let music = MusicController()
        let windows = InteractionWindows(store: store, desktop: desktop, music: music)
        self.music = music
        self.desktop = desktop; self.store = store; self.windows = windows
        desktop.onOpenChat = { [weak windows] in windows?.openChat() }
        desktop.onGeometryChange = { [weak windows] in windows?.reposition() }
        desktop.onHide = { [weak windows] in windows?.hideInteractions() }
        store.onNeedsSettings = { [weak windows] in windows?.openSettings() }
        let status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = NSImage(systemSymbolName: "leaf", accessibilityDescription: "千早桌宠")
        status.button?.toolTip = "千早桌宠"
        let menu = NSMenu(); menu.delegate = self; status.menu = menu
        statusItem = status
        rebuildMenu(menu)
        desktop.show()
        InstallerVolumeCleanup.start()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        windows?.openChat()
        return true
    }
    private func installApplicationMenu() {
        let main = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu(title: "千早桌宠")
        let quitItem = NSMenuItem(title: "退出千早桌宠", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self; applicationMenu.addItem(quitItem)
        applicationItem.submenu = applicationMenu; main.addItem(applicationItem)
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        let edit = NSMenu(title: "编辑")
        for (title, selector, key) in [("撤销", "undo:", "z"), ("重做", "redo:", "Z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            edit.addItem(NSMenuItem(title: title, action: NSSelectorFromString(selector), keyEquivalent: key))
        }
        editItem.submenu = edit; main.addItem(editItem)
        NSApp.mainMenu = main
    }
    func applicationWillTerminate(_ notification: Notification) { music?.shutdown(); windows?.shutdown(); store?.shutdown(); desktop?.shutdown() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func menuNeedsUpdate(_ menu: NSMenu) { rebuildMenu(menu) }
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        if menuItem.action == #selector(sayIdle) { return windows?.canSayIdleLine == true }
        if menuItem.action == #selector(toggleMusic) || menuItem.action == #selector(nextMusic) || menuItem.action == #selector(previousMusic) { return music?.selectedID != nil && music?.removing != true }
        return true
    }
    private func rebuildMenu(_ menu: NSMenu) {
        guard let desktop else { return }
        menu.removeAllItems()
        item("打开聊天", action: #selector(openChat), to: menu)
        menu.addItem(.separator())
        let styleItem = NSMenuItem(title: "造型 · \(desktop.expandedStyle.title)", action: nil, keyEquivalent: "")
        let styles = NSMenu()
        for value in ExpandedCharacterStyle.allCases {
            let entry = NSMenuItem(title: value.title, action: #selector(changeStyle(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = value.rawValue
            entry.state = desktop.expandedStyle == value ? .on : .off
            styles.addItem(entry)
        }
        styleItem.submenu = styles
        menu.addItem(styleItem)

        let framingItem = NSMenuItem(title: "取景 · \(desktop.framing.title)", action: nil, keyEquivalent: "")
        let framings = NSMenu()
        for value in CharacterFraming.allCases {
            let entry = NSMenuItem(title: value.title, action: #selector(changeFraming(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = value.rawValue
            entry.state = desktop.framing == value ? .on : .off
            framings.addItem(entry)
        }
        framingItem.submenu = framings
        menu.addItem(framingItem)

        let poseItem = NSMenuItem(title: "姿势 · \(desktop.poseMode.title)", action: nil, keyEquivalent: "")
        let poses = NSMenu()
        for value in CharacterPoseMode.allCases {
            let entry = NSMenuItem(title: value.title, action: #selector(changePoseMode(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = value.rawValue
            entry.state = desktop.poseMode == value ? .on : .off
            poses.addItem(entry)
        }
        poseItem.submenu = poses
        menu.addItem(poseItem)

        let expressionItem = NSMenuItem(title: "表情 · \(desktop.expandedExpressionMode.title)", action: nil, keyEquivalent: "")
        let expressions = NSMenu()
        for value in ExpandedCharacterExpressionMode.allCases {
            let entry = NSMenuItem(title: value.title, action: #selector(changeExpressionMode(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = value.rawValue
            entry.state = desktop.expandedExpressionMode == value ? .on : .off
            expressions.addItem(entry)
        }
        expressionItem.submenu = expressions
        menu.addItem(expressionItem)
        let scale = NSMenuItem(title: "角色大小 · \(Int(desktop.imageHeight)) 点", action: nil, keyEquivalent: "")
        let sizes = NSMenu()
        for height in [240, 256, 320, 400, 480] {
            let entry = NSMenuItem(title: "\(height) 点" + (height == 256 ? "（默认）" : ""), action: #selector(resize(_:)), keyEquivalent: "")
            entry.tag = height; entry.target = self; entry.state = Int(desktop.imageHeight) == height ? .on : .off
            sizes.addItem(entry)
        }
        let sliderItem = NSMenuItem()
        let slider = NSSlider(value: desktop.imageHeight, minValue: 240, maxValue: 480, target: self, action: #selector(slideSize(_:)))
        slider.frame = NSRect(x: 12, y: 8, width: 176, height: 24)
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 200, height: 40)); container.addSubview(slider)
        slider.setAccessibilityLabel("角色显示高度")
        sliderItem.view = container; sizes.addItem(sliderItem)
        scale.submenu = sizes; menu.addItem(scale)
        item("置顶", action: #selector(toggleOnTop), checked: desktop.isOnTop, to: menu)
        item("鼠标穿透", action: #selector(toggleClickThrough), checked: desktop.clickThrough, to: menu)
        item("启用动效", action: #selector(toggleAnimations), checked: desktop.animationsEnabled, to: menu)
        item("视线跟随", action: #selector(toggleGaze), checked: desktop.gazeEnabled, to: menu)
        item("摸头互动", action: #selector(toggleHeadPetting), checked: desktop.headPettingEnabled, to: menu)
        menu.addItem(.separator())
        item("主动闲话", action: #selector(toggleIdle), checked: windows?.idleEnabled == true, to: menu)
        let say = NSMenuItem(title: "说一句", action: #selector(sayIdle), keyEquivalent: "")
        say.target = self; say.isEnabled = windows?.canSayIdleLine == true
        menu.addItem(say)
        let frequency = NSMenuItem(title: "闲话频率", action: nil, keyEquivalent: "")
        let frequencies = NSMenu()
        for value in IdleSpeechFrequency.allCases {
            let entry = NSMenuItem(title: value.title, action: #selector(changeIdleFrequency(_:)), keyEquivalent: "")
            entry.target = self; entry.tag = value.rawValue
            entry.state = windows?.idleFrequency == value ? .on : .off
            frequencies.addItem(entry)
        }
        frequency.submenu = frequencies; menu.addItem(frequency)
        menu.addItem(.separator())
        item(music?.wantsPlayback == true ? "暂停背景音乐" : "播放背景音乐", action: #selector(toggleMusic), to: menu)
        item("上一首", action: #selector(previousMusic), to: menu)
        item("下一首", action: #selector(nextMusic), to: menu)
        item("背景音乐…", action: #selector(openMusic), to: menu)
        menu.addItem(.separator())
        item(desktop.isVisible ? "隐藏桌宠" : "显示桌宠", action: #selector(toggleVisible), to: menu)
        item("设置…", action: #selector(openSettings), to: menu)
        menu.addItem(.separator())
        item("退出千早桌宠", action: #selector(quit), to: menu)
    }
    private func item(_ title: String, action: Selector, checked: Bool = false, to menu: NSMenu) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self; item.state = checked ? .on : .off; menu.addItem(item)
    }
    @objc private func openChat() { windows?.openChat() }
    @objc private func toggleMusic() { music?.toggle() }
    @objc private func nextMusic() { music?.next() }
    @objc private func previousMusic() { music?.previous() }
    @objc private func openMusic() { windows?.openMusicSettings() }
    @objc private func toggleIdle() { if let windows { windows.setIdleEnabled(!windows.idleEnabled) } }
    @objc private func sayIdle() { windows?.sayIdleLine() }
    @objc private func changeIdleFrequency(_ sender: NSMenuItem) {
        if let value = IdleSpeechFrequency(rawValue: sender.tag) { windows?.setIdleFrequency(value) }
    }
    @objc private func openSettings() { windows?.openSettings() }
    @objc private func changeStyle(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let value = ExpandedCharacterStyle(rawValue: rawValue) else { return }
        desktop?.setExpandedStyle(value)
    }
    @objc private func changeFraming(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let value = CharacterFraming(rawValue: rawValue) else { return }
        desktop?.setFraming(value)
    }
    @objc private func changeExpressionMode(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let value = ExpandedCharacterExpressionMode(rawValue: rawValue) else { return }
        desktop?.setExpandedExpressionMode(value)
    }
    @objc private func changePoseMode(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let value = CharacterPoseMode(rawValue: rawValue) else { return }
        desktop?.setPoseMode(value)
    }
    @objc private func resize(_ sender: NSMenuItem) { desktop?.setHeight(Double(sender.tag)) }
    @objc private func slideSize(_ sender: NSSlider) { desktop?.setHeight(sender.doubleValue.rounded()) }
    @objc private func toggleOnTop() { if let desktop { desktop.setOnTop(!desktop.isOnTop) } }
    @objc private func toggleClickThrough() { if let desktop { desktop.setClickThrough(!desktop.clickThrough) } }
    @objc private func toggleAnimations() { if let desktop { desktop.setAnimations(!desktop.animationsEnabled) } }
    @objc private func toggleGaze() { if let desktop { desktop.setGazeEnabled(!desktop.gazeEnabled) } }
    @objc private func toggleHeadPetting() { if let desktop { desktop.setHeadPettingEnabled(!desktop.headPettingEnabled) } }
    @objc private func toggleVisible() {
        if let desktop { if desktop.isVisible { desktop.hide(); music?.suspend(.hidden) } else { desktop.show(); windows?.refreshVisibility() } }
    }
    @objc private func quit() { NSApp.terminate(nil) }
}
