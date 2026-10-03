const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
export const characters = (text: string): string[] => Array.from(segmenter.segment(text), value => value.segment);
export function characterCount(text: string): number { let count = 0; for (const _ of segmenter.segment(text)) count++; return count; }
export function validateInput(text: string): void {
  if (!text.trim()) throw new Error('请输入消息，不能只包含空白。');
  if (characterCount(text) > 2_000) throw new Error('单次输入最多 2,000 个字符。');
}
export function excerpt(text: string): string { const parts = characters(text); return parts.length > 60 ? parts.slice(0, 59).join('') + '…' : text; }
export function inputCommand(event: { key: string; shiftKey: boolean; isComposing: boolean; keyCode?: number }, composing: boolean): 'send' | 'close' | undefined {
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter' && !event.shiftKey) return 'send';
  if (event.key === 'Escape') return 'close';
}
