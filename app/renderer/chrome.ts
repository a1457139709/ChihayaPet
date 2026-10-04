// Original paths from b6a2f10, FloralOrnaments.swift.
const petals = [
  'M78 91 C56 79 45 39 59 24 C79 15 89 54 78 91 Z',
  'M78 91 C73 59 93 12 109 29 C121 44 99 77 78 91 Z',
  'M78 91 C96 67 135 69 135 88 C128 107 102 106 78 91 Z',
  'M78 91 C52 69 20 67 18 87 C16 107 51 116 78 91 Z',
  'M78 91 C83 104 108 112 101 132 C78 143 66 114 78 91 Z',
  'M78 91 C65 102 52 132 35 120 C27 102 52 91 78 91 Z',
];
export function iris(id: string, className = ''): string {
  return `<svg class="iris ornament ${className}" viewBox="0 0 150 200" aria-hidden="true"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#d9d4e8"/><stop offset="1" stop-color="#8f7da8"/></linearGradient></defs><path d="M55 198 Q83 140 79 88 M59 186 Q109 159 120 109 Q86 124 59 186 Z M63 164 Q39 123 43 91 Q69 117 63 164 Z" fill="#b0bfab"/>${petals.map(d => `<path d="${d}" fill="url(#${id})" stroke="#9482a8" stroke-width=".4"/>`).join('')}<path d="M78 91 Q63 59 63 37 M80 89 Q96 58 103 37 M82 92 Q111 80 126 87 M74 93 Q48 78 27 87" fill="none" stroke="#ffffff8c" stroke-width=".5"/><path d="M73 89 L78 78 L84 90 L78 104 Z" fill="#d1ba7a"/><path d="M116 69 Q101 52 113 43 Q124 39 129 53 Q137 56 133 65 Q125 77 116 69 Z" fill="#f2f5e3"/></svg>`;
}
const layers = [
  'M68 31 C86 16 105 26 105 45 C132 55 127 82 106 89 C108 115 78 125 64 111 C41 127 21 108 29 87 C6 70 23 43 43 45 C41 29 57 22 68 31 Z',
  'M67 42 C91 30 105 46 98 63 C118 77 99 101 82 96 C70 115 45 105 45 87 C24 76 39 50 54 54 C54 45 60 42 67 42 Z',
  'M62 53 Q83 39 93 61 Q104 78 81 88 Q59 106 49 79 Q43 63 62 53 Z',
  'M63 60 Q85 50 88 72 Q86 88 66 84 Q51 72 63 60 Z',
  'M67 63 Q82 59 81 75 Q70 87 64 74 Q72 68 76 73',
];
export function gardenia(): string {
  return `<svg class="gardenia ornament" viewBox="0 0 140 140" aria-hidden="true"><path d="M65 98 Q16 117 7 81 Q33 68 65 98 Z M72 82 Q94 26 127 39 Q132 68 72 82 Z M71 99 Q114 91 129 122 Q95 138 71 99 Z" fill="#b8c9ad"/>${layers.map((d, i) => `<path d="${d}" fill="${i % 2 === 0 ? '#fcfef0' : '#edf2de'}" stroke="#b3bfa8" stroke-width=".5"/>`).join('')}</svg>`;
}
export const headerFlowers = `<div class="header-flowers" aria-hidden="true">${iris('header-iris')}${gardenia()}</div>`;
const corner = 'M55 6 H27 C10 6 6 13 6 28 V55 M55 11 H28 C17 11 11 17 11 28 V55 M40 6 C33 6 31 13 32 20 C34 30 40 25 37 19 C34 13 27 10 21 12 C11 14 8 24 12 32 C15 38 25 40 26 35 C27 29 16 31 11 35 C7 38 6 43 6 49';
export const cornerLoops = `<div class="corner-loops" aria-hidden="true">${[0, 1, 2, 3].map(i => `<svg class="corner corner-${i}" viewBox="0 0 58 58"><path d="${corner}" fill="none" stroke="currentColor" stroke-width="1.19" stroke-linecap="round"/></svg>`).join('')}</div>`;
export const panelChrome = `<div class="panel-chrome" aria-hidden="true">${cornerLoops}</div>`;
const icons: Record<string, string> = {
  settings: '<path d="m9 3 1-2h4l1 2 2 1 2-.2 2 3-1 2v2l1 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1-2V9L3 7l2-3 2 .2Z"/><circle cx="12" cy="10" r="3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  service: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  persona: '<path d="M4 4h16v12H9l-5 4Z M8 8h8M8 12h5"/>',
  music: '<path d="M10 17V5l10-2v12M10 9l10-2"/><ellipse cx="6.5" cy="18" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="16" rx="3.5" ry="2.5"/>',
  portrait: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M7 19v-2a5 5 0 0 1 10 0v2"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3Z M16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
};
export function icon(name: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
}
export function iconButton(id: string, name: string, label: string, help = label): string {
  return `<button id="${id}" class="icon-button plain" aria-label="${label}" title="${help}">${icon(name)}</button>`;
}
