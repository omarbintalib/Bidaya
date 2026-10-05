import type { SoundKind } from '../data/types';

/**
 * The story's background sound: field recordings only, no music (public/sounds/CREDITS.md).
 * A scene is a few quiet layers — desert wind under everything, then footsteps, the sea or the clash of swords —
 * plus occasional single sounds (a camel's groan, horses passing). Scenes cross-fade as the reader moves through
 * the story. Nothing loads or plays until the reader turns sound on.
 */
export type Scene = 'calm' | SoundKind;

type Loop = 'wind' | 'steps' | 'sea' | 'swords';
type Shot = 'camel' | 'horses';
const FILES: (Loop | Shot)[] = ['wind', 'steps', 'sea', 'swords', 'camel', 'horses'];

/** Each scene's loops (with their volume) and its occasional sound (every `every` seconds, give or take). */
const SCENES: Record<Scene, { loops: Partial<Record<Loop, number>>; shot?: { name: Shot; gain: number; every: [number, number] } }> = {
  calm: { loops: { wind: .55 } },
  walk: { loops: { wind: .45, steps: .5 } },
  caravan: { loops: { wind: .45, steps: .42 }, shot: { name: 'camel', gain: .32, every: [16, 28] } },
  sea: { loops: { wind: .3, sea: .7 } },
  march: { loops: { wind: .5 }, shot: { name: 'horses', gain: .5, every: [14, 24] } },
  'march+sea': { loops: { wind: .3, sea: .55 }, shot: { name: 'horses', gain: .45, every: [16, 26] } },
  battle: { loops: { wind: .35, swords: .32 }, shot: { name: 'horses', gain: .5, every: [12, 20] } },
};
const FADE = 1.6; // seconds

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loops = new Map<Loop, { src: AudioBufferSourceNode; gain: GainNode }>();
  private scene: Scene = 'calm';
  private shotTimer = 0;
  private on = false;
  private loading: Promise<void> | null = null;
  private volume = 0.35;

  constructor(private base: string) {}

  /** Turn sound on (must be called from a click or key press, as browsers require). */
  async enable() {
    this.on = true;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    await this.ctx.resume();
    this.loading ??= this.load();
    await this.loading;
    if (!this.on) return;
    this.apply();
    this.master!.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.4);
  }

  /** Turn sound off: fade out, then let the audio device rest. */
  disable() {
    this.on = false;
    window.clearTimeout(this.shotTimer);
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    const ctx = this.ctx;
    window.setTimeout(() => { if (!this.on) void ctx.suspend(); }, 1200);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.on && this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
  }

  /** Move to another scene; its layers fade in as the last scene's fade out. */
  setScene(scene: Scene) {
    if (scene === this.scene) return;
    this.scene = scene;
    if (this.on && this.buffers.size) this.apply();
  }

  /** Pause while the page is hidden, and carry on when it comes back. */
  setHidden(hidden: boolean) {
    if (!this.ctx || !this.on) return;
    if (hidden) { window.clearTimeout(this.shotTimer); void this.ctx.suspend(); }
    else { void this.ctx.resume(); this.scheduleShot(true); }
  }

  private async load() {
    const ctx = this.ctx!;
    await Promise.all(FILES.map(async name => {
      try {
        const res = await fetch(`${this.base}sounds/${name}.mp3`);
        this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* a missing sound only leaves its layer silent */ }
    }));
  }

  private apply() {
    const ctx = this.ctx!, now = ctx.currentTime, want = SCENES[this.scene].loops;
    for (const name of ['wind', 'steps', 'sea', 'swords'] as Loop[]) {
      const target = want[name] ?? 0;
      let layer = this.loops.get(name);
      if (!layer && target > 0) layer = this.startLoop(name) ?? undefined;
      if (!layer) continue;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(target, now + FADE);
      if (target === 0) {
        // Stop a silent layer once it has faded, so nothing plays that cannot be heard.
        const gone = layer;
        window.setTimeout(() => { if (gone.gain.gain.value < 0.001 && this.loops.get(name) === gone) { gone.src.stop(); this.loops.delete(name); } }, FADE * 1000 + 200);
      }
    }
    this.scheduleShot(true);
  }

  private startLoop(name: Loop) {
    const ctx = this.ctx!, buffer = this.buffers.get(name);
    if (!buffer) return null;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buffer;
    src.loop = true;
    // MP3 files carry a few milliseconds of silence at each end; loop between the first and last real sound.
    const [start, end] = audibleSpan(buffer);
    src.loopStart = start;
    src.loopEnd = end;
    gain.gain.value = 0;
    src.connect(gain).connect(this.master!);
    src.start(0, start + Math.random() * (end - start)); // start anywhere, so a scene never sounds the same twice
    const layer = { src, gain };
    this.loops.set(name, layer);
    return layer;
  }

  private scheduleShot(soon = false) {
    window.clearTimeout(this.shotTimer);
    const shot = SCENES[this.scene].shot;
    if (!shot || !this.on) return;
    const [lo, hi] = shot.every, wait = soon ? 2 + Math.random() * 4 : lo + Math.random() * (hi - lo);
    this.shotTimer = window.setTimeout(() => { this.playShot(shot.name, shot.gain); this.scheduleShot(); }, wait * 1000);
  }

  private playShot(name: Shot, level: number) {
    const ctx = this.ctx, buffer = this.buffers.get(name);
    if (!ctx || !buffer || !this.on) return;
    const src = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner?.();
    src.buffer = buffer;
    gain.gain.value = level * (0.75 + Math.random() * 0.25);
    if (pan) { pan.pan.value = Math.random() * 1.2 - 0.6; src.connect(gain).connect(pan).connect(this.master!); }
    else src.connect(gain).connect(this.master!);
    src.start();
  }
}

/** The first and last moments of real sound in a buffer (seconds), skipping the silent padding MP3 adds. */
export function audibleSpan(buffer: { duration: number; sampleRate: number; getChannelData(c: number): Float32Array }): [number, number] {
  const data = buffer.getChannelData(0), limit = 1e-4;
  let a = 0, b = data.length - 1;
  while (a < b && Math.abs(data[a]) < limit) a++;
  while (b > a && Math.abs(data[b]) < limit) b--;
  return b > a ? [a / buffer.sampleRate, (b + 1) / buffer.sampleRate] : [0, buffer.duration];
}
