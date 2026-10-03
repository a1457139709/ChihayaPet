#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <node_api.h>
#include <cstring>

// Electron's macOS native handle contains NSView*. This module runs in its main
// process; an external helper cannot apply NSWindow collection behavior.
static NSWindow *Window(napi_env env, napi_value handle) {
    bool buffer = false;
    void *bytes = nullptr;
    size_t length = 0;
    if (!NSThread.isMainThread || napi_is_buffer(env, handle, &buffer) != napi_ok || !buffer ||
        napi_get_buffer_info(env, handle, &bytes, &length) != napi_ok || length != sizeof(void *)) {
        napi_throw_type_error(env, nullptr, "Expected a live Electron window handle on the main thread.");
        return nil;
    }
    void *pointer = nullptr;
    std::memcpy(&pointer, bytes, sizeof(pointer));
    NSView *view = (__bridge NSView *)pointer;
    if (!view || !view.window) {
        napi_throw_error(env, nullptr, "The Electron window has no native view.");
        return nil;
    }
    return view.window;
}

static napi_value Configure(napi_env env, napi_callback_info info) {
    size_t count = 2;
    napi_value args[2];
    bool allSpaces = false;
    if (napi_get_cb_info(env, info, &count, args, nullptr, nullptr) != napi_ok || count != 2 ||
        napi_get_value_bool(env, args[1], &allSpaces) != napi_ok) {
        napi_throw_type_error(env, nullptr, "Expected window handle and allSpaces boolean.");
        return nullptr;
    }
    @autoreleasepool {
        NSWindow *window = Window(env, args[0]);
        if (!window) return nullptr;
        const auto behavior = NSWindowCollectionBehaviorFullScreenNone |
            (allSpaces ? NSWindowCollectionBehaviorCanJoinAllSpaces : NSWindowCollectionBehaviorMoveToActiveSpace);
        // ElectronNSPanel's override unconditionally adds FullScreenAuxiliary.
        // Invoke the public NSWindow setter to preserve the native FullScreenNone
        // policy without changing Electron's class or installing a swizzle.
        const SEL setter = @selector(setCollectionBehavior:);
        const auto apply = reinterpret_cast<void (*)(id, SEL, NSWindowCollectionBehavior)>(class_getMethodImplementation(NSWindow.class, setter));
        apply(window, setter, behavior);
    }
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value Behavior(napi_env env, napi_callback_info info) {
    size_t count = 1;
    napi_value handle;
    if (napi_get_cb_info(env, info, &count, &handle, nullptr, nullptr) != napi_ok || count != 1) {
        napi_throw_type_error(env, nullptr, "Expected window handle.");
        return nullptr;
    }
    @autoreleasepool {
        NSWindow *window = Window(env, handle);
        if (!window) return nullptr;
        napi_value result;
        napi_create_uint32(env, static_cast<uint32_t>(window.collectionBehavior), &result);
        return result;
    }
}

static napi_value Init(napi_env env, napi_value exports) {
    const napi_property_descriptor properties[] = {
        { "configure", nullptr, Configure, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "behavior", nullptr, Behavior, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    napi_define_properties(env, exports, 2, properties);
    return exports;
}
NAPI_MODULE(MacWindow, Init)
