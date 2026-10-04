// Only this boundary knows Win32. HWND values stay pointer-sized, never rounded
// through JavaScript numbers. The DLL is loaded once, not per menu opening.
export type WindowHandle = bigint | null;
export interface WindowsWindowAPI {
  foreground(): WindowHandle;
  isWindow(window: WindowHandle): boolean;
  processID(window: WindowHandle): number;
  activate(window: WindowHandle): void;
}
export function loadWindowsWindowAPI(modulePath: string): WindowsWindowAPI {
  const koffi = require(modulePath);
  const user32 = koffi.load('user32.dll');
  const foreground = user32.func('void * __stdcall GetForegroundWindow()');
  const isWindow = user32.func('int __stdcall IsWindow(void *window)');
  const processID = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *window, _Out_ uint32_t *pid)');
  const activate = user32.func('int __stdcall SetForegroundWindow(void *window)');
  return {
    foreground: () => { const window = foreground(); return window ? koffi.address(window) : null; },
    isWindow: window => Boolean(isWindow(window)),
    processID: window => { const pid = [0]; processID(window, pid); return pid[0]!; },
    activate: window => { activate(window); },
  };
}
export class WindowsFocus {
  private previous?: { window: WindowHandle; pid: number };
  constructor(private readonly api: WindowsWindowAPI, private readonly ownPID = process.pid) {}
  remember(): void {
    this.previous = undefined;
    const window = this.api.foreground();
    if (!window) return;
    const pid = this.api.processID(window);
    if (pid && pid !== this.ownPID) this.previous = { window, pid };
  }
  restore(): void {
    const previous = this.previous; this.previous = undefined;
    if (!previous || !this.api.isWindow(previous.window) || this.api.processID(previous.window) !== previous.pid) return;
    const current = this.api.foreground();
    // A click into another application is the user's choice. Never steal it.
    if (current && this.api.processID(current) !== this.ownPID) return;
    this.api.activate(previous.window);
  }
}
