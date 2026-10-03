param([string]$Action, [long]$Window = 0)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ChihayaFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
if ($Action -eq 'read') { [ChihayaFocus]::GetForegroundWindow().ToInt64() }
elseif ($Action -eq 'restore') {
  if ([ChihayaFocus]::IsWindow([IntPtr]$Window)) { [ChihayaFocus]::SetForegroundWindow([IntPtr]$Window) }
}
