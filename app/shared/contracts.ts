export const defaultPrompt = '你正在扮演《少女爱上姐姐2》中的妃宫千早，作为用户桌面上的文字聊天伙伴。默认使用简体中文，以礼貌、克制、细腻而自然的方式交谈，避免每句话都使用夸张的语气或动作描写。日常回复通常为一至三句，用户需要详细解释时可以展开。不要主动透露原作关键剧情；不确定的原作细节不要编造。不要声称能看到用户屏幕、读取文件、执行操作，或记得本次提供的会话以外的经历。不要把生成的台词称作原作对白。用户询问应用或模型身份时如实说明这是千早的同人桌宠演绎。以“你”称呼用户，用户在本次聊天指定称呼后再调整。';
export type Configuration = { baseURL: string; model: string; apiKeys: Record<string, string> };
export type SettingsField = 'baseURL' | 'model' | 'key';
export type Preferences = Record<string, string | number | boolean>;
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type Reply = { text: string; truncated: boolean };
export type Turn = { id: string; user: string; assistant: string; truncated: boolean };
export type Track = { id: string; title: string; fileName: string };
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Framing = 'full' | 'close';
export type Speech = { mouth: number[]; hairLeft: number; hairRight: number };
export type SpriteResult = { id: string; path: string; sha256: string; review: { status: string; sha256?: string; message?: string; recordedAt?: string } };
export type Variant = {
  outfit: string; framing: Framing; canvas: number[]; defaultFaceID: string;
  faceRect: number[]; headRect: number[]; speech: Speech; bindingMethod: string;
  automaticMappings: Record<string, string>; results: SpriteResult[];
};
export type Manifest = { version: number; outfits: { id: string; name: string }[]; variants: Record<string, Variant> };
export type DesktopSettings = { outfit: string; framing: Framing; expression: string; height: number; onTop: boolean; animations: boolean };
export type MusicState = { tracks: Track[]; selected?: string; wantsPlayback: boolean; playing: boolean; volume: number; loop: 'single' | 'playlist'; autoplay: boolean; suspended: boolean; source?: string; revision: number; error?: string; notice?: string; busy: boolean };
export type Bubble = { id: string; kind: 'idle' | 'reply'; text: string; fullText: string; turnID?: string; side?: 'left' | 'right' };
export type Snapshot = {
  greeting: string; turns: Turn[]; didTrim: boolean; input: string; pending?: string; partial: string;
  error?: string; busy?: 'chat' | 'test'; settingsError?: string; settingsNotice?: string; testStatus?: string;
  draft: { baseURL: string; model: string; key: string; prompt: string };
  desktop: DesktopSettings; clickThrough: boolean; visible: boolean; awake: boolean; reducedMotion: boolean;
  sprite?: { url: string; canvas: number[]; key: string; faceID: string; speech: Speech };
  resourceError?: string; outfits: { id: string; name: string }[]; expressions: string[];
  idleEnabled: boolean; idleFrequency: number; bubble?: Bubble; chatVisible: boolean; settingsVisible: boolean;
  focusTurnID?: string; settingsFocus?: { id: string; field?: SettingsField }; music: MusicState;
};
export type Action =
  | { type: 'input'; text: string }
  | { type: 'send' | 'retry' | 'cancel' | 'clear' | 'chat' | 'settings' | 'files' | 'quit' | 'say' | 'bubble-dismiss' | 'bubble-complete' | 'read-more' | 'music-import' | 'music-remove' | 'music-toggle' | 'music-next' | 'music-previous' | 'test' | 'save-service' | 'delete-key' | 'save-prompt' | 'restore-prompt' | 'context-menu' }
  | { type: 'draft'; field: 'baseURL' | 'model' | 'key' | 'prompt'; text: string }
  | { type: 'desktop'; field: keyof DesktopSettings; value: string | number | boolean }
  | { type: 'visible' | 'click-through' | 'idle-enabled' | 'bubble-hover'; value: boolean }
  | { type: 'idle-frequency'; value: number }
  | { type: 'music-select'; id: string }
  | { type: 'music-volume'; value: number }
  | { type: 'music-loop'; value: 'single' | 'playlist' }
  | { type: 'music-autoplay'; value: boolean }
  | { type: 'music-status'; revision: number; playing: boolean; ended?: boolean; error?: boolean }
  | { type: 'hit'; opaque: boolean }
  | { type: 'drag'; phase: 'start' | 'move' | 'end' }
  | { type: 'bubble-size'; width: number; height: number }
  | { type: 'close'; window: 'chat' | 'settings' };
export interface Bridge {
  snapshot(): Promise<Snapshot>;
  act(action: Action): Promise<void>;
  onState(listener: (state: Snapshot) => void): () => void;
}
