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
export type DesktopSettings = { outfit: string; framing: Framing; expression: string; height: number; onTop: boolean; animations: boolean; headPetting: boolean };
export type SettingsTab = 'service' | 'persona' | 'music' | 'portrait';
export type MusicState = { tracks: Track[]; selected?: string; wantsPlayback: boolean; playing: boolean; volume: number; loop: 'single' | 'playlist'; autoplay: boolean; suspended: boolean; suspensionReasons: string[]; source?: string; revision: number; playbackID: number; error?: string; notice?: string; busy: boolean; operation?: 'import' | 'remove' };
export type Bubble = { id: string; kind: 'idle' | 'reply'; text: string; fullText: string; turnID?: string; side?: 'left' | 'right'; tailY?: number; truncated?: boolean };
export type Snapshot = {
  menuSession?: number;
  greeting: string; turns: Turn[]; didTrim: boolean; input: string; pending?: string; pendingID?: string; partial: string;
  cancelled?: boolean; error?: string; busy?: 'chat' | 'test'; settingsError?: string; settingsNotice?: string; testStatus?: string;
  draft: { baseURL: string; model: string; key: string; prompt: string };
  savedService?: { baseURL: string; model: string };
  desktop: DesktopSettings; clickThrough: boolean; visible: boolean; awake: boolean; reducedMotion: boolean;
  sprite?: { url: string; canvas: number[]; key: string; faceID: string; speech: Speech };
  resourceError?: string; outfits: { id: string; name: string }[]; expressions: { id: string; approved: boolean }[];
  canSay: boolean; idleEnabled: boolean; idleFrequency: number; bubble?: Bubble; chatVisible: boolean; settingsVisible: boolean;
  chatFocus?: { id: string; turnID: string }; settingsTab: SettingsTab; settingsFocus?: { id: string; field?: SettingsField }; music: MusicState;
};
export type Action =
  | { type: 'input'; text: string }
  | { type: 'send' | 'retry' | 'cancel' | 'clear' | 'chat' | 'quit' | 'say' | 'bubble-dismiss' | 'bubble-complete' | 'read-more' | 'music-import' | 'music-remove' | 'music-toggle' | 'music-next' | 'music-previous' | 'test' | 'save-service' | 'delete-key' | 'save-prompt' | 'restore-prompt' | 'context-menu' }
  | { type: 'settings'; tab?: SettingsTab }
  | { type: 'settings-tab'; tab: SettingsTab }
  | { type: 'chat-focus-consumed'; id: string }
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
  | { type: 'menu-size'; height: number }
  | { type: 'close'; window: 'chat' | 'settings' | 'menu' };
export interface Bridge {
  snapshot(): Promise<Snapshot>;
  act(action: Action): Promise<void>;
  onState(listener: (state: Snapshot) => void): () => void;
}
