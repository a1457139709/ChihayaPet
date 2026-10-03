import type { Point, Rect, Speech } from './contracts';
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
export function clamped(frame: Rect, workArea: Rect): Rect {
  return { ...frame, x: Math.round(clamp(frame.x, workArea.x, workArea.x + workArea.width - frame.width)), y: Math.round(clamp(frame.y, workArea.y, workArea.y + workArea.height - frame.height)) };
}
export function initialFrame(width: number, height: number, workArea: Rect): Rect { return clamped({ x: workArea.x + workArea.width - width - 16, y: workArea.y + workArea.height - height, width, height }, workArea); }
export function fromMacOrigin(origin: Point, size: { width: number; height: number }, primaryHeight: number): Rect { return { x: origin.x, y: primaryHeight - origin.y - size.height, ...size }; }
export function toMacOrigin(frame: Rect, primaryHeight: number): Point { return { x: frame.x, y: primaryHeight - frame.y - frame.height }; }
export function bubbleFrame(pet: Rect, area: Rect, speech: Speech, canvasHeight: number, imageHeight: number, size: { width: number; height: number }): Rect & { side: 'left' | 'right' } {
  const scale = imageHeight / canvasHeight;
  const mouthY = pet.y + 12 + speech.mouth[1]! * scale;
  const left = pet.x + 12 + speech.hairLeft * scale - 4 - size.width;
  const right = pet.x + 12 + speech.hairRight * scale + 4;
  const side = left >= area.x ? 'left' : 'right';
  return { ...clamped({ x: side === 'left' ? left : right, y: mouthY - size.height / 2, ...size }, area), side };
}
export function nearbyPanel(pet: Rect, area: Rect, size: { width: number; height: number }): Rect {
  const left = pet.x - size.width - 8;
  return clamped({ x: left >= area.x ? left : pet.x + pet.width + 8, y: pet.y + (pet.height - size.height) / 2, ...size }, area);
}
