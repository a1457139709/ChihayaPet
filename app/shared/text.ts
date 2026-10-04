const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
export const characters = (text: string): string[] => Array.from(segmenter.segment(text), value => value.segment);
export function characterCount(text: string): number { let count = 0; for (const _ of segmenter.segment(text)) count++; return count; }
export function canSend(text: string, busy: boolean): boolean { return !busy && Boolean(text.trim()) && characterCount(text) <= 2_000; }
export function validateInput(text: string): void {
  if (!text.trim()) throw new Error('请输入消息，不能只包含空白。');
  if (characterCount(text) > 2_000) throw new Error('单次输入最多 2,000 个字符。');
}
export function replyExcerpt(source: string, fits: (text: string) => boolean, truncated = false): { text: string; needsReadMore: boolean } {
  const parts = characters(source);
  if (parts.length <= 60 && fits(source)) return { text: source, needsReadMore: truncated };
  const prefix = parts.slice(0, 59);
  while (prefix.length && !fits(prefix.join('') + '…')) prefix.pop();
  return { text: prefix.join('') + '…', needsReadMore: true };
}
export function excerpt(text: string): string { return replyExcerpt(text, () => true).text; }
export function bubbleCharacterDelay(character: string): number {
  if ('。！？!?…\n'.includes(character)) return 240;
  if ('，、；：,;:'.includes(character)) return 130;
  return 42;
}
export function inputCommand(event: { key: string; shiftKey: boolean; isComposing: boolean; keyCode?: number }, composing: boolean): 'send' | 'close' | undefined {
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter' && !event.shiftKey) return 'send';
  if (event.key === 'Escape') return 'close';
}
