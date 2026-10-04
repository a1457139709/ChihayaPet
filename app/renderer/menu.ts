import type { Action, Snapshot } from '../shared/contracts';
import { desktopMenu, type DesktopMenuItem } from '../shared/menu';

// Windows native menus have no custom-view slot; this menu uses the shared tree
// and keeps the continuous height slider inside its size submenu.
export function mountMenu(root: HTMLElement, act: (action: Action) => void): { render(state: Snapshot): void } {
  document.body.className = 'desktop-menu';
  const panel = document.createElement('div'); panel.className = 'menu-panel'; panel.setAttribute('role', 'menu'); root.append(panel);
  let state: Snapshot, path: number[] = [], signature = '', height = 0, session: number | undefined;
  const build = (navigating = false) => {
    let items = desktopMenu(state);
    for (const i of path) items = items[i]?.submenu ?? items;
    const nextSignature = JSON.stringify([path, items]);
    if (signature === nextSignature) return;
    const active = document.activeElement as HTMLElement | null, focusedIndex = active?.dataset.index;
    const adjustingSlider = active?.classList.contains('menu-slider');
    // Preserve slider focus during state updates; explicit navigation must
    // still replace the submenu, including Escape from the focused range.
    if (adjustingSlider && !navigating) return;
    signature = nextSignature;
    panel.replaceChildren();
    if (path.length) {
      const back = document.createElement('button'); back.className = 'menu-item'; back.textContent = '‹ 返回'; back.setAttribute('role', 'menuitem');
      back.onclick = () => { path.pop(); signature = ''; build(true); panel.querySelector<HTMLButtonElement>('button')?.focus(); }; panel.append(back);
    }
    items.forEach((item, i) => append(item, i));
    if (focusedIndex) panel.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)?.focus();
    const nextHeight = Math.min(2000, Math.max(60, Math.ceil(panel.scrollHeight + 2)));
    if (height !== nextHeight) { height = nextHeight; act({ type: 'menu-size', height }); }
  };
  const append = (item: DesktopMenuItem, i: number) => {
    if (item.type === 'separator') { const hr = document.createElement('hr'); hr.className = 'divider'; hr.setAttribute('role', 'separator'); panel.append(hr); return; }
    if (item.type === 'slider') {
      const label = document.createElement('label'); label.textContent = `${item.label} · ${Math.round(state.desktop.height)} 点`;
      const slider = document.createElement('input'); slider.className = 'menu-slider'; slider.type = 'range'; slider.min = '240'; slider.max = '480'; slider.step = '1'; slider.value = String(item.value); slider.ariaLabel = item.label ?? '角色显示高度';
      slider.oninput = () => {
        label.firstChild!.textContent = `${item.label} · ${slider.value} 点`;
        panel.querySelectorAll<HTMLButtonElement>('[data-height]').forEach(button => { const checked = button.dataset.height === slider.value; button.setAttribute('aria-checked', String(checked)); button.querySelector('.mark')!.textContent = checked ? '✓' : ''; });
        act({ type: 'desktop', field: 'height', value: Number(slider.value) });
      };
      label.append(slider); panel.append(label); return;
    }
    const button = document.createElement('button'); button.className = 'menu-item'; button.dataset.index = String(i); button.disabled = item.enabled === false;
    button.setAttribute('role', item.type === 'checkbox' ? 'menuitemcheckbox' : item.type === 'radio' ? 'menuitemradio' : 'menuitem');
    if (item.type === 'checkbox' || item.type === 'radio') button.setAttribute('aria-checked', String(Boolean(item.checked)));
    if (item.action?.type === 'desktop' && item.action.field === 'height') button.dataset.height = String(item.action.value);
    const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = item.checked ? '✓' : ''; mark.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.className = 'spacer'; label.textContent = item.label ?? ''; button.append(mark, label);
    if (item.submenu) { const arrow = document.createElement('span'); arrow.textContent = '›'; arrow.setAttribute('aria-hidden', 'true'); button.append(arrow); button.setAttribute('aria-haspopup', 'menu'); }
    button.onclick = () => {
      if (item.submenu) { path.push(i); signature = ''; build(true); panel.querySelector<HTMLButtonElement>('button')?.focus(); }
      else if (item.action) { act(item.action); act({ type: 'close', window: 'menu' }); }
    };
    panel.append(button);
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); if (path.length) { path.pop(); signature = ''; build(true); panel.querySelector<HTMLButtonElement>('button')?.focus(); } else act({ type: 'close', window: 'menu' }); }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !(document.activeElement instanceof HTMLInputElement)) {
      event.preventDefault(); const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
    if (event.key === 'ArrowLeft' && path.length && !(document.activeElement instanceof HTMLInputElement)) { event.preventDefault(); path.pop(); signature = ''; build(true); panel.querySelector<HTMLButtonElement>('button')?.focus(); }
    if (event.key === 'ArrowRight' && document.activeElement instanceof HTMLButtonElement && document.activeElement.hasAttribute('aria-haspopup')) { event.preventDefault(); document.activeElement.click(); }
  });
  return { render(next) {
    const opened = session !== next.menuSession;
    if (opened) {
      session = next.menuSession; path = []; signature = ''; height = 0;
      (document.activeElement as HTMLElement | null)?.blur();
    }
    state = next; build(opened);
  } };
}
