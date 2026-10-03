import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import { safeChild } from './paths';
import type { Manifest, SpriteResult, Variant } from '../shared/contracts';
export const approved = (r: SpriteResult) => r.review.status === 'approved' && r.review.sha256 === r.sha256 && Boolean(r.review.message) && Boolean(r.review.recordedAt);
const finite = (values: number[]) => values.every(v => typeof v === 'number' && Number.isFinite(v));
export class StandingLibrary {
  readonly manifest: Manifest;
  constructor(readonly root: string) {
    this.manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as Manifest;
    const m = this.manifest;
    if (m.version !== 1 || !m.outfits.length || !Object.keys(m.variants).length || new Set(m.outfits.map(o => o.id)).size !== m.outfits.length) throw new Error('立绘清单无效。');
    for (const [key, v] of Object.entries(m.variants)) {
      const validRect = (r: number[]) => r.length === 4 && finite(r) && r[0]! >= 0 && r[1]! >= 0 && r[2]! > 0 && r[3]! > 0 && r[0]! + r[2]! <= v.canvas[0]! && r[1]! + r[3]! <= v.canvas[1]!;
      if (!m.outfits.some(o => o.id === v.outfit && o.name) || key !== `${v.outfit}/${v.framing}` || !['full', 'close'].includes(v.framing) || v.canvas.length !== 2 || !finite(v.canvas) || v.canvas[0]! <= 0 || v.canvas[0]! > 16_384 || v.canvas[1] !== (v.framing === 'full' ? 606 : 670) || v.defaultFaceID !== '00' || !['native-original', 'derived-game-features'].includes(v.bindingMethod) || !validRect(v.faceRect) || !validRect(v.headRect) || v.speech.mouth.length !== 2 || !finite([...v.speech.mouth, v.speech.hairLeft, v.speech.hairRight]) || v.speech.hairLeft < 0 || v.speech.hairLeft >= v.speech.mouth[0]! || v.speech.mouth[0]! >= v.speech.hairRight || v.speech.hairRight > v.canvas[0]! || v.speech.mouth[1]! < 0 || v.speech.mouth[1]! > v.canvas[1]!) throw new Error('立绘清单几何无效。');
      if (!v.results.length || new Set(v.results.map(r => r.id)).size !== v.results.length || !v.results.some(r => r.id === '00')) throw new Error('立绘编号无效。');
      for (const r of v.results) {
        if (!/^\d{2}$/.test(r.id) || !/^[a-f0-9]{64}$/.test(r.sha256) || !(r.review.status === 'pending' || approved(r)) || !r.path.startsWith('sprites/') || r.path.includes('\\') || r.path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('立绘审核或路径无效。');
      }
      if (Object.entries(v.automaticMappings).some(([expression, id]) => !['neutral', 'serious', 'smile', 'surprised'].includes(expression) || !v.results.some(r => r.id === id && approved(r)))) throw new Error('自动表情映射无效。');
    }
  }
  mode(key: string, requested: string): string {
    return requested === 'automatic' || this.manifest.variants[key]?.results.some(r => r.id === requested) ? requested : '00';
  }
  number(key: string, mode: string, expression: string, previous?: string): string {
    const v = this.manifest.variants[key];
    if (mode !== 'automatic') return this.mode(key, mode);
    return v?.automaticMappings[expression] ?? (v?.results.some(r => r.id === previous) ? previous! : '00');
  }
  resolve(key: string, faceID: string): { data: Buffer; canvas: number[]; variant: Variant; faceID: string } | undefined {
    try {
      const variant = this.manifest.variants[key], result = variant?.results.find(r => r.id === faceID);
      if (!variant || !result || !approved(result)) return;
      const data = readFileSync(safeChild(this.root, result.path));
      if (createHash('sha256').update(data).digest('hex') !== result.sha256) return;
      // Verify decode and RGBA, then release the bitmap. Only the current renderer image stays decoded.
      const image = PNG.sync.read(data);
      if (data[25] !== 6 || image.width !== variant.canvas[0] || image.height !== variant.canvas[1]) return;
      return { data, canvas: variant.canvas, variant, faceID };
    } catch { return; }
  }
}
