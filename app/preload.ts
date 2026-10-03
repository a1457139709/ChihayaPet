import { contextBridge, ipcRenderer } from 'electron';
import type { Action, Bridge, Snapshot } from './shared/contracts';
const bridge: Bridge = {
  snapshot: () => ipcRenderer.invoke('chihaya:snapshot') as Promise<Snapshot>,
  act: (action: Action) => ipcRenderer.invoke('chihaya:action', action) as Promise<void>,
  onState: listener => {
    const callback = (_event: Electron.IpcRendererEvent, state: Snapshot) => listener(state);
    ipcRenderer.on('chihaya:state', callback); return () => ipcRenderer.removeListener('chihaya:state', callback);
  },
};
contextBridge.exposeInMainWorld('chihaya', bridge);
