'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const actions=new Set(['openPanel','closePanel','quit','toggleVisible','menu','dragStart','dragMove','dragEnd','petClick','petHit','preferences','resetPosition','send','cancel','retry','clear','saveService','testService','savePersona','bubbleDismiss','bubbleHover','bubbleSpeaking','bubbleFull','musicImport','musicRemove','musicSelect','musicToggle','musicNext','musicPrevious','musicEnded','musicError','panelDraft']);
contextBridge.exposeInMainWorld('pet',Object.freeze({
 snapshot:()=>ipcRenderer.invoke('pet:snapshot'),
 invoke:(action,payload)=>actions.has(action)?ipcRenderer.invoke('pet:action',action,payload):Promise.resolve({ok:false,error:'不支持的操作。'}),
 onState:callback=>{
  if(typeof callback!=='function')throw TypeError('State callback required');
  const listener=(_event,state)=>callback(state);ipcRenderer.on('pet:state',listener);
  return ()=>ipcRenderer.removeListener('pet:state',listener);
 }
}));
