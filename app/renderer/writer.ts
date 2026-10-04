import { bubbleCharacterDelay, characters, characterCount } from '../shared/text';

export class Writer {
  private timer?: ReturnType<typeof setTimeout>;
  private target = '';
  private parts: string[] = [];
  private shown = '';
  private completed = false;
  private paused = false;
  private animate = true;
  constructor(private draw: (text: string) => void, private onComplete = () => {}, private speed: 'chat' | 'bubble' = 'chat', initial = '') {
    this.shown = initial;
    this.draw(initial);
  }
  displayed(): string { return this.shown; }
  set(text: string, animate: boolean): void {
    if (!text.startsWith(this.shown)) this.shown = '';
    if (this.target !== text) { this.target = text; this.parts = characters(text); this.completed = false; }
    this.animate = animate;
    if (!this.paused) {
      if (!animate) this.complete();
      else if (!this.timer && this.shown !== text) this.tick();
    }
  }
  pause(value: boolean): void {
    if (this.paused === value) return;
    this.paused = value;
    if (value) this.stop(); else this.set(this.target, this.animate);
  }
  private tick(): void {
    const count = characterCount(this.shown), remaining = this.parts.length - count;
    const step = this.speed === 'bubble' ? 1 : Math.max(1, Math.ceil(remaining / 80));
    this.shown = this.parts.slice(0, count + step).join('');
    this.draw(this.shown);
    if (this.shown === this.target) { this.timer = undefined; this.finish(); }
    else this.timer = setTimeout(() => this.tick(), this.speed === 'bubble' ? bubbleCharacterDelay(this.parts[count]!) : 25);
  }
  complete(): void { this.stop(); this.shown = this.target; this.draw(this.shown); this.finish(); }
  private finish(): void { if (!this.completed && this.parts.length) { this.completed = true; this.onComplete(); } }
  stop(): void { clearTimeout(this.timer); this.timer = undefined; }
}
