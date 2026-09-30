'use strict';
const {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,screen,powerMonitor,dialog,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {Storage}=require('./core/storage.cjs');const {ChatController}=require('./core/chat.cjs');
const {DEFAULT_PREFS,STYLES,validatePreferences,clampBounds,petBounds,bubbleBounds}=require('./core/desktop.cjs');
const {MusicLibrary}=require('./core/music.cjs');const {IdleSpeech}=require('./core/idle.cjs');
app.setName('ChihayaPet');app.setPath('userData',path.join(app.getPath('appData'),'ChihayaPet'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
 let desktop;
 app.on('second-instance',()=>desktop?.openPanel('chat'));
 app.whenReady().then(()=>{desktop=new DesktopApp();return desktop.start();}).catch(error=>{
  dialog.showErrorBox('千早桌宠无法启动',`${error.message}\n\n数据目录：${app.getPath('userData')}\n原有文件不会被重置。`);app.quit();
 });
 app.on('activate',()=>desktop?.openPanel('chat'));
 app.on('window-all-closed',()=>{});
 app.on('before-quit',()=>desktop?.shutdown());
}
class DesktopApp{
 constructor(){
  this.store=new Storage(app.getPath('userData'));this.library=new MusicLibrary(app.getPath('userData'));
  const saved=this.store.getPrefs();const publicPrefs={};
  for(const key of Object.keys(DEFAULT_PREFS)){if(Object.hasOwn(saved,key)){try{Object.assign(publicPrefs,validatePreferences({[key]:saved[key]}));}catch{}}}
  this.prefs={...DEFAULT_PREFS,...publicPrefs};this.position=saved.position;
  this.visible=true;this.suspended=false;this.panelTab='chat';this.bubble=null;this.speaking=false;this.error='';
  this.windows=new Map();this.readyWindows=new Set();this.idle=new IdleSpeech();this.quitting=false;
  const tracks=this.library.tracks();this.selectedId=tracks.some(t=>t.id===saved.musicTrackId)?saved.musicTrackId:tracks[0]?.id||null;
  this.playing=!!this.selectedId&&this.prefs.musicAutoplay;
  this.resources=path.join(app.getAppPath(),'resources','CharacterSprites');
  this.manifest=JSON.parse(fs.readFileSync(path.join(this.resources,'manifest.json'),'utf8'));
  this.chat=new ChatController({getService:()=>this.store.getService(),getPrompt:()=>this.store.getSettings().prompt,onChange:()=>this.queueBroadcast()});
 }
 variant(){const variant=this.manifest.variants[`${this.prefs.style}/${this.prefs.framing}`];if(!variant)throw Error('缺少角色造型资源。');return variant;}
 areas(){const primary=screen.getPrimaryDisplay();return [primary,...screen.getAllDisplays().filter(d=>d.id!==primary.id)].map(d=>d.workArea);}
 snapshot(){return {
  prefs:this.prefs,settings:this.store.getSettings(),chat:this.chat.snapshot(),
  music:{tracks:this.library.tracks(),selectedId:this.selectedId,playing:this.playing,suspended:!this.visible||this.suspended},
  visible:this.visible,suspended:this.suspended,panelVisible:!!this.panel?.isVisible(),panelTab:this.panelTab,
  bubble:this.bubble,speaking:this.speaking,focusTurnId:this.focusTurnId||null,focusToken:this.focusToken||0,resourceBaseURL:pathToFileURL(this.resources+path.sep).href,manifest:this.manifest,error:this.error
 };}
 broadcast(){
  if(this.quitting)return;const value=this.snapshot();
  for(const win of this.readyWindows)if(!win.isDestroyed())win.webContents.send('pet:state',value);
 }
 queueBroadcast(){if(this.emitTimer||this.quitting)return;this.emitTimer=setTimeout(()=>{this.emitTimer=null;this.broadcast();},35);}
 async createWindow(kind,options){
  const win=new BrowserWindow({show:false,backgroundColor:'#fffdf5',icon:path.join(app.getAppPath(),'resources','tray.png'),autoHideMenuBar:true,...options,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  const contentsId=win.webContents.id;this.windows.set(contentsId,kind);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('render-process-gone',()=>{if(!this.quitting){this.playing=false;this.error='界面进程意外退出，请从托盘退出后重新打开应用。';this.broadcast();}});
  win.on('closed',()=>{this.windows.delete(contentsId);this.readyWindows.delete(win);});
  await win.loadFile(path.join(__dirname,'renderer',`${kind}.html`));
  this.readyWindows.add(win);return win;
 }
 async start(){
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  // Network belongs exclusively to the Node HTTPS client, never a renderer.
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  ipcMain.handle('pet:snapshot',event=>{this.role(event);return this.snapshot();});
  ipcMain.handle('pet:action',async(event,action,payload)=>{
   try{const role=this.role(event);const value=await this.action(role,action,payload);return {ok:true,value};}
   catch(error){return {ok:false,error:this.safeError(error)};}
  });
  const initial=clampBounds(petBounds(this.variant(),this.prefs.height,this.validPosition()),this.areas());
  this.pet=await this.createWindow('pet',{...initial,transparent:true,backgroundColor:'#00000000',frame:false,hasShadow:false,resizable:false,skipTaskbar:true,focusable:false,thickFrame:false,title:'千早桌宠'});
  this.panel=await this.createWindow('panel',{width:680,height:800,minWidth:540,minHeight:580,title:'千早 · 紫苑夜奏'});
  this.panel.on('close',event=>{if(!this.quitting){event.preventDefault();this.closePanel();}});
  this.bubbleWindow=await this.createWindow('bubble',{width:340,height:210,transparent:true,backgroundColor:'#00000000',frame:false,hasShadow:false,resizable:false,skipTaskbar:true,focusable:false,thickFrame:false,title:'千早的对白'});
  this.pet.on('move',()=>this.repositionBubble());
  this.pet.on('close',event=>{if(!this.quitting){event.preventDefault();this.setVisible(false);}});
  const icon=nativeImage.createFromPath(path.join(app.getAppPath(),'resources','tray.png')).resize({width:24,height:24});
  this.tray=new Tray(icon);this.tray.setToolTip('千早桌宠 · 双击打开聊天');
  this.tray.on('double-click',()=>this.openPanel('chat'));this.rebuildTray();
  this.applyWindowPrefs();this.pet.showInactive();
  this.timer=setInterval(()=>{
   const line=this.idle.tick(Date.now(),this.prefs.idleEnabled&&this.canIdle(),this.prefs.idleFrequency);
   if(line)this.showBubble(line,'idle');
  },1000);
  powerMonitor.on('suspend',()=>this.setSuspended(true));powerMonitor.on('resume',()=>this.setSuspended(false));
  powerMonitor.on('lock-screen',()=>this.setSuspended(true));powerMonitor.on('unlock-screen',()=>this.setSuspended(false));
  screen.on('display-removed',()=>this.recoverPosition());screen.on('display-metrics-changed',()=>this.recoverPosition());
  screen.on('display-added',()=>this.recoverPosition());
  this.broadcast();
 }
 validPosition(){const p=this.position;return p&&['x','y','width','height'].every(k=>Number.isFinite(p[k]))&&p.width>0&&p.height>0?p:undefined;}
 safeError(error){
  let text=typeof error?.message==='string'?error.message:'操作失败，请重试。';
  try{const key=this.store.getService().apiKey;if(key)text=text.split(key).join('[已隐藏]');}catch{}
  return text.slice(0,600);
 }
 role(event){const role=this.windows.get(event.sender.id);if(!role||event.senderFrame!==event.sender.mainFrame)throw Error('无效的界面请求。');return role;}
 async action(role,action,payload){
  const common=new Set(['openPanel','preferences','menu']);
  const roles={pet:new Set(['dragStart','dragMove','dragEnd','petClick','petHit']),bubble:new Set(['bubbleDismiss','bubbleHover','bubbleSpeaking','bubbleFull']),panel:new Set(['closePanel','quit','toggleVisible','resetPosition','send','cancel','retry','clear','saveService','testService','savePersona','musicImport','musicRemove','musicSelect','musicToggle','musicNext','musicPrevious','musicEnded','musicError','panelDraft'])};
  if(!common.has(action)&&!roles[role].has(action))throw Error('此窗口不允许该操作。');
  switch(action){
   case 'openPanel':this.openPanel(payload);break;
   case 'closePanel':this.closePanel();break;
   case 'panelDraft':this.hasDraft=!!payload;if(this.hasDraft)this.idle.reset();break;
   case 'quit':app.quit();break;
   case 'menu':this.rebuildTray();this.tray.popUpContextMenu();break;
   case 'petClick':this.openPanel('chat');break;
   case 'toggleVisible':this.setVisible(!this.visible);break;
   case 'preferences':this.updatePrefs(payload);break;
   case 'resetPosition':this.position=undefined;this.pet.setBounds(clampBounds(petBounds(this.variant(),this.prefs.height),this.areas()));this.savePosition();break;
   case 'dragStart':this.startDrag(payload);break;
   case 'dragMove':this.moveDrag(payload);break;
   case 'dragEnd':if(this.drag){this.drag=null;this.savePosition();this.applyWindowPrefs();}break;
   case 'petHit':this.pet.setIgnoreMouseEvents(this.prefs.clickThrough||(!payload&&!this.drag),{forward:true});break;
   case 'send':await this.send(payload);break;
   case 'retry':await this.send(undefined,true);break;
   case 'cancel':this.chat.cancel();break;
   case 'clear':this.chat.clear();this.dismissBubble();break;
   case 'saveService':this.store.saveService(payload);this.chat.clear();this.dismissBubble();this.broadcast();return this.store.getSettings();
   case 'savePersona':this.store.savePersona(payload);this.chat.clear();this.dismissBubble();this.broadcast();return this.store.getSettings();
   case 'testService':await this.chat.test(this.store.serviceDraft(payload));break;
   case 'bubbleDismiss':this.dismissBubble();break;
   case 'bubbleHover':this.hovering=!!payload;if(this.hovering)clearTimeout(this.bubbleTimer);else if(!this.speaking)this.armBubble();break;
   case 'bubbleSpeaking':this.speaking=!!payload&&!!this.bubble;if(!this.speaking)this.armBubble();this.broadcast();break;
   case 'bubbleFull':this.focusTurnId=this.bubble?.turnId||null;this.focusToken=(this.focusToken||0)+1;this.openPanel('chat');break;
   case 'musicImport':{
    const result=await dialog.showOpenDialog(this.panel,{title:'导入背景音乐',properties:['openFile','multiSelections'],filters:[{name:'音乐',extensions:['wav','mp3','m4a','aac','ogg','flac']}]});
    if(!result.canceled){const tracks=this.library.import(result.filePaths);if(!this.selectedId)this.selectTrack(tracks[0]?.id,false);this.broadcast();}break;
   }
   case 'musicRemove':this.library.remove(payload);if(payload===this.selectedId)this.selectTrack(this.library.tracks()[0]?.id,false);this.broadcast();break;
   case 'musicSelect':this.selectTrack(payload,true);break;
   case 'musicToggle':if(!this.selectedId)throw Error('请先导入音乐。');this.playing=!this.playing;this.broadcast();break;
   case 'musicNext':this.advanceTrack(1);break;
   case 'musicPrevious':this.advanceTrack(-1);break;
   case 'musicEnded':if(this.playing){if(this.prefs.musicLoop==='single')this.broadcast();else this.advanceTrack(1);}break;
   case 'musicError':this.playing=false;this.error='这首音乐无法播放。请检查文件，或转换为 WAV / MP3 后重新导入。';this.broadcast();break;
  }
  this.rebuildTray();return undefined;
 }
 openPanel(tab='chat'){
  if(!['chat','settings','music'].includes(tab))tab='chat';this.panelTab=tab;
  this.setVisible(true);this.dismissBubble();this.panel?.show();this.panel?.focus();this.idle.reset();this.broadcast();
 }
 closePanel(){
  this.panel.hide();this.idle.reset();const latest=this.chat.snapshot().turns.at(-1);
  if(latest&&latest.id!==this.lastDismissedReply&&this.visible&&!this.suspended&&!this.prefs.clickThrough)this.replyBubble(latest);
  this.broadcast();
 }
 setVisible(value){
  this.visible=value;this.idle.reset();this.drag=null;
  if(value)this.pet?.showInactive();else{this.pet?.hide();this.panel?.hide();this.dismissBubble();}
  this.broadcast();this.rebuildTray();
 }
 setSuspended(value){this.suspended=value;this.drag=null;this.idle.reset();this.dismissBubble();this.broadcast();}
 applyWindowPrefs(){
  this.pet.setAlwaysOnTop(this.prefs.alwaysOnTop,'floating');this.bubbleWindow?.setAlwaysOnTop(this.prefs.alwaysOnTop,'floating');
  this.pet.setIgnoreMouseEvents(this.prefs.clickThrough,{forward:true});
 }
 updatePrefs(patch){
  const clean=validatePreferences(patch);this.store.savePrefs(clean);this.prefs={...this.prefs,...clean};
  if(['height','style','framing'].some(k=>k in clean)){this.pet.setBounds(clampBounds(petBounds(this.variant(),this.prefs.height,this.pet.getBounds()),this.areas()));this.savePosition();}
  if(this.prefs.clickThrough)this.dismissBubble();this.applyWindowPrefs();this.idle.reset();this.broadcast();this.rebuildTray();
 }
 startDrag(point){this.validatePoint(point);if(this.prefs.clickThrough)return;this.drag={cursor:point,bounds:this.pet.getBounds()};this.dismissBubble();}
 moveDrag(point){
  this.validatePoint(point);if(!this.drag)return;
  const {cursor,bounds}=this.drag;const b=clampBounds({...bounds,x:bounds.x+point.x-cursor.x,y:bounds.y+point.y-cursor.y},this.areas());
  this.pet.setPosition(b.x,b.y);
 }
 validatePoint(p){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6)throw Error('位置无效。');}
 savePosition(){this.position=this.pet.getBounds();this.store.savePrefs({position:this.position});}
 recoverPosition(){
  if(!this.pet)return;try{this.pet.setBounds(clampBounds(this.pet.getBounds(),this.areas()));this.savePosition();this.repositionBubble();}catch(e){this.error=this.safeError(e);this.broadcast();}
 }
 canIdle(){return this.visible&&!this.suspended&&!this.prefs.clickThrough&&!this.panel?.isVisible()&&!this.chat.snapshot().busy&&!this.bubble&&!this.drag&&!this.hasDraft;}
 showBubble(text,kind,turnId){
  this.dismissBubble(false);this.bubble={text,kind,turnId,token:Date.now()};this.speaking=true;this.hovering=false;
  this.repositionBubble();this.bubbleWindow.showInactive();this.broadcast();
  // A failed renderer must never leave a permanent bubble or talking animation.
  this.bubbleWatchdog=setTimeout(()=>{this.speaking=false;this.armBubble();this.broadcast();},15000);
 }
 replyBubble(turn){
  const chars=Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(turn.assistant),s=>s.segment);
  this.showBubble(chars.slice(0,60).join('')+(chars.length>60?'…':''),'reply',turn.id);
 }
 repositionBubble(){
  if(!this.bubble||!this.bubbleWindow)return;
  const bounds=bubbleBounds(this.pet.getBounds(),this.variant(),this.prefs.height,screen.getDisplayMatching(this.pet.getBounds()).workArea);
  this.bubble.side=bounds.side;const {side,...rect}=bounds;this.bubbleWindow.setBounds(rect);
 }
 armBubble(){clearTimeout(this.bubbleTimer);clearTimeout(this.bubbleWatchdog);if(this.bubble&&!this.hovering)this.bubbleTimer=setTimeout(()=>this.dismissBubble(),12000);}
 dismissBubble(remember=true){
  if(remember&&this.bubble?.kind==='reply')this.lastDismissedReply=this.bubble.turnId;
  clearTimeout(this.bubbleTimer);clearTimeout(this.bubbleWatchdog);this.bubble=null;this.speaking=false;this.bubbleWindow?.hide();this.broadcast();
 }
 async send(text,retry=false){
  this.dismissBubble();if(retry)await this.chat.retry();else await this.chat.send(text);
  const latest=this.chat.snapshot().turns.at(-1);if(latest&&!this.panel.isVisible()&&this.visible&&!this.suspended&&!this.prefs.clickThrough)this.replyBubble(latest);
 }
 selectTrack(id,play){
  if(id&&!this.library.tracks().some(t=>t.id===id))throw Error('曲目文件不存在。');
  this.store.savePrefs({musicTrackId:id||null});this.selectedId=id||null;this.playing=!!id&&play;this.error='';this.broadcast();
 }
 advanceTrack(direction){
  const tracks=this.library.tracks();if(!tracks.length){this.selectTrack(null,false);return;}
  const index=tracks.findIndex(t=>t.id===this.selectedId);this.selectTrack(tracks[(index+direction+tracks.length)%tracks.length].id,true);
 }
 rebuildTray(){
  if(!this.tray)return;const safe=fn=>()=>{try{fn();}catch(e){this.error=this.safeError(e);this.openPanel('settings');}};
  const pref=(key,value)=>safe(()=>this.updatePrefs({[key]:value}));
  this.tray.setContextMenu(Menu.buildFromTemplate([
   {label:'打开聊天',click:()=>this.openPanel('chat')},
   {label:this.visible?'隐藏桌宠':'显示桌宠',click:()=>this.setVisible(!this.visible)},
   {type:'separator'},
   {label:'造型',submenu:Object.entries(STYLES).map(([id,label])=>({label,type:'radio',checked:this.prefs.style===id,click:pref('style',id)}))},
   {label:'取景',submenu:[['full','全景'],['close','近景']].map(([id,label])=>({label,type:'radio',checked:this.prefs.framing===id,click:pref('framing',id)}))},
   {label:'表情',submenu:[['automatic','自动'],['neutral','日常'],['serious','认真'],['smile','微笑'],['surprised','惊讶']].map(([id,label])=>({label,type:'radio',checked:this.prefs.expression===id,click:pref('expression',id)}))},
   {label:'大小',submenu:[240,256,320,400,480].map(n=>({label:`${n} 点`,type:'radio',checked:this.prefs.height===n,click:pref('height',n)}))},
   {label:'始终置顶',type:'checkbox',checked:this.prefs.alwaysOnTop,click:pref('alwaysOnTop',!this.prefs.alwaysOnTop)},
   {label:'鼠标穿透（在此取消）',type:'checkbox',checked:this.prefs.clickThrough,click:pref('clickThrough',!this.prefs.clickThrough)},
   {label:'人物动效',type:'checkbox',checked:this.prefs.animations,click:pref('animations',!this.prefs.animations)},
   {label:'恢复人物位置',click:safe(()=>{this.pet.setBounds(clampBounds(petBounds(this.variant(),this.prefs.height),this.areas()));this.savePosition();})},
   {type:'separator'},
   {label:'主动闲话',type:'checkbox',checked:this.prefs.idleEnabled,click:pref('idleEnabled',!this.prefs.idleEnabled)},
   {label:'闲话频率',submenu:[['frequent','经常 · 1–3 分钟'],['normal','适中 · 3–7 分钟'],['quiet','安静 · 10–15 分钟']].map(([id,label])=>({label,type:'radio',checked:this.prefs.idleFrequency===id,click:pref('idleFrequency',id)}))},
   {label:'说一句',enabled:this.canIdle(),click:()=>{if(this.canIdle())this.showBubble(this.idle.next(),'idle');}},
   {type:'separator'},
   {label:'背景音乐',submenu:[{label:this.playing?'暂停':'播放',enabled:!!this.selectedId,click:()=>{this.playing=!this.playing;this.broadcast();this.rebuildTray();}},{label:'上一首',enabled:!!this.selectedId,click:safe(()=>this.advanceTrack(-1))},{label:'下一首',enabled:!!this.selectedId,click:safe(()=>this.advanceTrack(1))},{label:'管理曲库',click:()=>this.openPanel('music')}]},
   {label:'设置',click:()=>this.openPanel('settings')},{type:'separator'},{label:'退出千早桌宠',click:()=>app.quit()}
  ]));
 }
 shutdown(){this.quitting=true;clearInterval(this.timer);clearTimeout(this.emitTimer);clearTimeout(this.bubbleTimer);clearTimeout(this.bubbleWatchdog);this.chat?.cancel();this.tray?.destroy();}
}
