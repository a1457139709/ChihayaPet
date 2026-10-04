// Compile the production adapters unchanged, adding only AppKit event drivers
// to this test binary. These methods are never exported by the shipped addon.
#include <cmath>
#include "../../app/platform/MacMenu.mm"
#undef NAPI_MODULE
#define NAPI_MODULE(name, initializer)
#include "../../app/platform/MacWindow.mm"
#undef NAPI_MODULE

static napi_value Choose(napi_env env, napi_callback_info info) {
    size_t count = 1; napi_value arg; NSArray *path;
    if (napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr) != napi_ok || count != 1 || !ReadItems(env, arg, &path) || !path.count || !host) {
        napi_throw_type_error(env, nullptr, "Expected a nonempty menu label path."); return nullptr;
    }
    NSMenu *menu = host.menu;
    NSMenuItem *selected = nil;
    for (NSUInteger i = 0; i < path.count; i++) {
        if (![path[i] isKindOfClass:NSString.class]) { selected = nil; break; }
        selected = nil;
        for (NSMenuItem *item in menu.itemArray) if ([item.title hasPrefix:path[i]]) { selected = item; break; }
        if (!selected) break;
        if (i + 1 < path.count) { menu = selected.submenu; if (!menu) { selected = nil; break; } }
    }
    if (!selected || !selected.enabled || !selected.action) { napi_throw_error(env, nullptr, "Requested menu command is missing or disabled."); return nullptr; }
    const NSInteger index = [menu indexOfItem:selected];
    // Enter the callback from the AppKit event loop, as a real click does.
    dispatch_async(dispatch_get_main_queue(), ^{ [menu performActionForItemAtIndex:index]; });
    return Undefined(env);
}
static NSSlider *Slider(NSMenu *menu) {
    for (NSMenuItem *item in menu.itemArray) {
        if (item.submenu) { NSSlider *found = Slider(item.submenu); if (found) return found; }
        for (NSView *view in item.view.subviews) if ([view isKindOfClass:NSSlider.class]) return (NSSlider *)view;
    }
    return nil;
}
static napi_value Slide(napi_env env, napi_callback_info info) {
    size_t count = 1; napi_value arg; double value;
    if (napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr) != napi_ok || count != 1 || napi_get_value_double(env, arg, &value) != napi_ok || !std::isfinite(value) || value < 240 || value > 480) {
        napi_throw_type_error(env, nullptr, "Expected a height from 240 to 480."); return nullptr;
    }
    NSSlider *slider = host ? Slider(host.menu) : nil;
    if (!slider) { napi_throw_error(env, nullptr, "Menu slider is unavailable."); return nullptr; }
    slider.doubleValue = value;
    dispatch_async(dispatch_get_main_queue(), ^{ [NSApp sendAction:slider.action to:slider.target from:slider]; });
    return Undefined(env);
}
NAPI_MODULE_INIT() {
    Init(env, exports);
    const napi_property_descriptor properties[] = {
        { "choose", nullptr, Choose, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "slide", nullptr, Slide, nullptr, nullptr, nullptr, napi_default, nullptr },
    };
    napi_define_properties(env, exports, 2, properties);
    return exports;
}
