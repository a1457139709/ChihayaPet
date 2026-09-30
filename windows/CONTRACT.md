# Module integration contract

CommonJS Node modules; renderers are plain deferred scripts. Main owns authoritative state.

Preload: window.pet.snapshot() -> Promise<snapshot>; window.pet.invoke(action,payload) -> Promise<result>; window.pet.onState(callback) -> unsubscribe. Invocations return {ok:true,value?} or {ok:false,error:string}. snapshot never contains API keys. Renderers escape text via textContent.

Snapshot:
```
{prefs:{style:'a',framing:'full',expression:'automatic',height:256,alwaysOnTop:true,clickThrough:false,animations:true,idleEnabled:true,idleFrequency:'normal',musicVolume:0.2,musicLoop:'list',musicAutoplay:true},
settings:{baseURL:'',model:'',prompt:'',hasKey:false},
chat:{turns:[{id,user,assistant,complete:true}],pending:null|{id,user,assistant,complete:false},busy:false,error:''},
music:{tracks:[{id,name,url}],selectedId:null,playing:false,suspended:false},
visible:true,suspended:false,panelVisible:false,panelTab:'chat',bubble:null|{text,kind:'idle'|'reply',turnId,token},
resourceBaseURL:'file:///.../CharacterSprites/',manifest:{...},error:'',focusTurnId:null,focusToken:0}
```
Actions:
- openPanel payload 'chat'|'settings'|'music'; closePanel; quit; toggleVisible; menu (tray popup)
- dragStart {x:screenX,y:screenY}; dragMove {x,y}; dragEnd; petClick
- preferences patch of known prefs; resetPosition
- panelDraft boolean (suppresses idle while unsent text remains)
- send string; cancel; retry; clear; saveService {baseURL,model,apiKey?} (omission retains stored key for that endpoint, empty deletes); testService same; savePersona string
- bubbleDismiss; bubbleHover boolean; bubbleSpeaking boolean (typing finished signal); bubbleFull (show full reply)
- musicImport (native picker); musicRemove id; musicSelect id; musicToggle; musicNext; musicPrevious; musicEnded; musicError string

Pet renderer must load images relative to resourceBaseURL with main-provided manifest, no fetch. bubbleSpeaking state may be additionally exposed as speaking:boolean to pet. For pet drag use pointerdown/move/up screen coordinates, threshold 4 DIP; main performs actual position. Main emits state on changes; pet doesn't call preferences during drag. Prevent default contextmenu and invoke menu. Pet canvas pixel hit-test may use action petHit boolean to let transparent areas pass through (main honors explicit clickThrough override).

Panel uses one Audio element, persists while hidden. Reconcile source ONLY if selected id changes; play/pause driven by snapshot music.playing && !music.suspended, volume by prefs. On ended invoke musicEnded; error invoke musicError; action results show visible errors. UI must never autoplay based on every state update, must catch play rejections. Audio sources are local file URLs from controlled Music directory. Panel ready even initially hidden to support startup music.

Core storage.cjs exports normalizeService({baseURL,model}) -> {baseURL,model}; DEFAULT_PROMPT; class Storage(root) with getSettings() public (hasKey), getService() -> {baseURL,model,apiKey}; serviceDraft(draft) -> validated endpoint/key; saveService(draft); savePersona(prompt); getPrefs() -> raw object; savePrefs(patch) -> object. Methods synchronous atomic fs; missing config permitted, malformed store throws on construction. Each key keyed by normalized endpoint. preferences separate from config. Do not load project root personal files.

Core chat.cjs exports class ChatController({getService,getPrompt,onChange,request?}); snapshot() -> chat shape; async send(text), async retry(), async test(draft); cancel(); clear(). Request default exported requestCompletion({service,messages,signal,onDelta,stream=true}) -> Promise<{text,truncated:boolean}>. Send/test share busy slot; errors reported by throw and snapshot.error; no unhandled rejection. cancel immediately releases slot, stale callbacks blocked; clear cancels and removes all messages. Main must cancel/clear after successful save service or persona. getService returns {baseURL,model,apiKey}; test receives same validated shape. Complete turns only in subsequent context; retry reuses pending user and replaces failed partial. onChange synchronous no args. Node tests inject only network request boundary.
