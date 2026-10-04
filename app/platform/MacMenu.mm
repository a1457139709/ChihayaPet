#import <AppKit/AppKit.h>
#include <node_api.h>
#include <string>

// A public AppKit menu adapter: NSMenuItem.view supplies the native NSSlider
// that Electron's MenuItem API cannot represent. Business actions stay in TS.
@interface ChihayaMenuHost : NSObject <NSMenuDelegate> {
@public
    napi_env env;
    napi_ref callback;
    napi_async_context context;
}
@property(nonatomic, strong) NSStatusItem *status;
@property(nonatomic, strong) NSMenu *menu;
@property(nonatomic, copy) NSArray *items;
@property(nonatomic) NSInteger tracking;
- (void)rebuild;
- (void)emit:(NSDictionary *)action;
@end

@implementation ChihayaMenuHost
- (void)emit:(NSDictionary *)action {
    if (!callback || !action) return;
    NSData *data = [NSJSONSerialization dataWithJSONObject:action options:0 error:nil];
    if (!data) return;
    napi_handle_scope scope;
    if (napi_open_handle_scope(env, &scope) != napi_ok) return;
    napi_value listener, receiver, value, result;
    napi_get_reference_value(env, callback, &listener);
    napi_get_undefined(env, &receiver);
    napi_create_string_utf8(env, static_cast<const char *>(data.bytes), data.length, &value);
    napi_make_callback(env, context, receiver, listener, 1, &value, &result);
    napi_close_handle_scope(env, scope);
}
- (void)select:(NSMenuItem *)sender { [self emit:sender.representedObject]; }
- (void)slide:(NSSlider *)sender {
    NSDictionary *descriptor = sender.identifier ? [NSJSONSerialization JSONObjectWithData:[sender.identifier dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
    NSMutableDictionary *action = [descriptor mutableCopy];
    action[@"value"] = @(round(sender.doubleValue));
    [self emit:action];
    // Preserve the live tracking view; reflect its value without rebuilding it.
    for (NSMenuItem *parent in self.menu.itemArray) if (parent.submenu) {
        for (NSMenuItem *item in parent.submenu.itemArray) if (item.view == sender.superview) {
            parent.title = [NSString stringWithFormat:@"角色大小 · %.0f 点", sender.doubleValue];
            for (NSMenuItem *preset in parent.submenu.itemArray) if (preset.representedObject[@"field"] && [preset.representedObject[@"field"] isEqual:@"height"]) {
                preset.state = [preset.representedObject[@"value"] doubleValue] == round(sender.doubleValue) ? NSControlStateValueOn : NSControlStateValueOff;
            }
        }
    }
}
- (NSMenu *)build:(NSArray *)items {
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"千早桌宠"];
    menu.autoenablesItems = NO; menu.delegate = self;
    for (NSDictionary *descriptor in items) {
        NSString *type = descriptor[@"type"];
        if ([type isEqual:@"separator"]) { [menu addItem:NSMenuItem.separatorItem]; continue; }
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:descriptor[@"label"] ?: @"" action:nil keyEquivalent:@""];
        item.enabled = descriptor[@"enabled"] ? [descriptor[@"enabled"] boolValue] : YES;
        item.state = [descriptor[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
        if ([type isEqual:@"slider"]) {
            NSView *container = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 200, 40)];
            NSSlider *slider = [NSSlider sliderWithValue:[descriptor[@"value"] doubleValue] minValue:240 maxValue:480 target:self action:@selector(slide:)];
            slider.continuous = YES; slider.frame = NSMakeRect(12, 8, 176, 24);
            NSData *action = [NSJSONSerialization dataWithJSONObject:descriptor[@"action"] options:0 error:nil];
            slider.identifier = [[NSString alloc] initWithData:action encoding:NSUTF8StringEncoding];
            [slider setAccessibilityLabel:@"角色显示高度"];
            [container addSubview:slider]; item.view = container;
        } else if (descriptor[@"submenu"]) item.submenu = [self build:descriptor[@"submenu"]];
        else if (descriptor[@"action"]) { item.representedObject = descriptor[@"action"]; item.target = self; item.action = @selector(select:); }
        [menu addItem:item];
    }
    return menu;
}
- (void)rebuild {
    if (self.tracking) return;
    self.menu = [self build:self.items]; self.status.menu = self.menu;
}
- (void)menuWillOpen:(NSMenu *)menu { self.tracking++; }
- (void)menuDidClose:(NSMenu *)menu {
    self.tracking = MAX(0, self.tracking - 1);
    if (!self.tracking) {
        // AppKit still owns the closing menu on this stack.
        __weak ChihayaMenuHost *host = self;
        dispatch_async(dispatch_get_main_queue(), ^{ [host rebuild]; });
    }
}
@end

static ChihayaMenuHost *host;
static bool ReadItems(napi_env env, napi_value value, NSArray **items) {
    size_t length = 0;
    if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) return false;
    std::string json(length + 1, '\0');
    if (napi_get_value_string_utf8(env, value, &json[0], json.size(), &length) != napi_ok) return false;
    id parsed = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:json.data() length:length] options:0 error:nil];
    if (![parsed isKindOfClass:NSArray.class]) return false;
    *items = parsed; return true;
}
static napi_value Undefined(napi_env env) { napi_value result; napi_get_undefined(env, &result); return result; }
static void DisposeMenu() {
    if (!host) return;
    [host.menu cancelTracking]; [NSStatusBar.systemStatusBar removeStatusItem:host.status];
    if (host->callback) napi_delete_reference(host->env, host->callback);
    if (host->context) napi_async_destroy(host->env, host->context);
    host->callback = nullptr; host->context = nullptr; host = nil;
}
static napi_value InstallMenu(napi_env env, napi_callback_info info) {
    size_t count = 2; napi_value args[2]; NSArray *items;
    napi_valuetype type;
    if (!NSThread.isMainThread || napi_get_cb_info(env, info, &count, args, nullptr, nullptr) != napi_ok || count != 2 ||
        !ReadItems(env, args[0], &items) || napi_typeof(env, args[1], &type) != napi_ok || type != napi_function) {
        napi_throw_type_error(env, nullptr, "Expected menu JSON and callback on the main thread."); return nullptr;
    }
    DisposeMenu(); host = [ChihayaMenuHost new]; host->env = env;
    napi_create_reference(env, args[1], 1, &host->callback);
    napi_value resource, name; napi_create_object(env, &resource); napi_create_string_utf8(env, "ChihayaMenu", NAPI_AUTO_LENGTH, &name);
    napi_async_init(env, resource, name, &host->context);
    host.status = [NSStatusBar.systemStatusBar statusItemWithLength:NSSquareStatusItemLength];
    host.status.button.image = [NSImage imageWithSystemSymbolName:@"leaf" accessibilityDescription:@"千早桌宠"];
    [host.status.button.image setTemplate:YES]; host.status.button.toolTip = @"千早桌宠";
    host.items = items; [host rebuild]; return Undefined(env);
}
static napi_value UpdateMenu(napi_env env, napi_callback_info info) {
    size_t count = 1; napi_value arg; NSArray *items;
    if (napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr) != napi_ok || count != 1 || !ReadItems(env, arg, &items)) {
        napi_throw_type_error(env, nullptr, "Expected menu JSON."); return nullptr;
    }
    if (host) { host.items = items; [host rebuild]; } return Undefined(env);
}
static napi_value PopupMenu(napi_env env, napi_callback_info info) {
    if (host) [host.menu popUpMenuPositioningItem:nil atLocation:NSEvent.mouseLocation inView:nil];
    return Undefined(env);
}
static napi_value DestroyMenu(napi_env env, napi_callback_info info) { DisposeMenu(); return Undefined(env); }
void RegisterMenus(napi_env env, napi_value exports) {
    const napi_property_descriptor properties[] = {
        { "installMenu", nullptr, InstallMenu, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "updateMenu", nullptr, UpdateMenu, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "popupMenu", nullptr, PopupMenu, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "destroyMenu", nullptr, DestroyMenu, nullptr, nullptr, nullptr, napi_default, nullptr },
    };
    napi_define_properties(env, exports, 4, properties);
}
