import type { SimEvent } from '@yeonmu/sim';

type Sound = 'slash' | 'spin' | 'dash' | 'talisman' | 'cleave' | 'ward' | 'hit' | 'block' | 'kill' | 'hurt' | 'loot' | 'legend' | 'level' | 'boss';
interface Voice { oscillator: OscillatorNode; gain: GainNode; until: number }
interface Tone { frequency: number; end: number; length: number; volume: number; gap: number; wave: OscillatorType }
const TONES: Record<Sound, Tone> = {
  slash: { frequency: 420, end: 70, length: .13, volume: .035, gap: .09, wave: 'sawtooth' },
  spin: { frequency: 640, end: 90, length: .3, volume: .045, gap: .1, wave: 'triangle' },
  dash: { frequency: 120, end: 600, length: .16, volume: .025, gap: .1, wave: 'sawtooth' },
  talisman: { frequency: 130, end: 35, length: .45, volume: .07, gap: .1, wave: 'sawtooth' },
  cleave: { frequency: 180, end: 40, length: .3, volume: .06, gap: .15, wave: 'sawtooth' },
  ward: { frequency: 330, end: 660, length: .5, volume: .035, gap: .3, wave: 'sine' },
  hit: { frequency: 240, end: 75, length: .07, volume: .025, gap: .045, wave: 'triangle' },
  block: { frequency: 1300, end: 550, length: .12, volume: .035, gap: .08, wave: 'square' },
  kill: { frequency: 200, end: 40, length: .16, volume: .025, gap: .06, wave: 'triangle' },
  hurt: { frequency: 85, end: 40, length: .2, volume: .045, gap: .15, wave: 'triangle' },
  loot: { frequency: 900, end: 1400, length: .14, volume: .025, gap: .08, wave: 'sine' },
  legend: { frequency: 523, end: 1568, length: .9, volume: .065, gap: .4, wave: 'sine' },
  level: { frequency: 392, end: 1175, length: .8, volume: .05, gap: .4, wave: 'triangle' },
  boss: { frequency: 180, end: 28, length: 1, volume: .08, gap: .5, wave: 'sawtooth' },
};

/** Eight persistent voices: no audio files or node creation in the combat loop. */
export class CombatAudio {
  private context: AudioContext | null = null;
  private voices: Voice[] = [];
  private last: Partial<Record<Sound, number>> = {};
  private peak = 0;
  private abort = new AbortController();
  constructor(readonly muted: boolean) {
    if (muted) return;
    const unlock = (event: Event): void => { if (event.isTrusted) this.unlock(); };
    window.addEventListener('pointerdown', unlock, { signal: this.abort.signal });
    window.addEventListener('keydown', unlock, { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.silence();
    }, { signal: this.abort.signal });
  }
  private unlock(): void {
    if (!this.context) {
      try {
        this.context = new AudioContext();
        const master = this.context.createGain(); master.gain.value = 1.6; // 합성음 기본 음량이 너무 작아 들리지 않던 문제 master.connect(this.context.destination);
        for (let i = 0; i < 8; i++) {
          const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
          gain.gain.value = 0; oscillator.connect(gain); gain.connect(master); oscillator.start();
          this.voices.push({ oscillator, gain, until: 0 });
        }
      } catch { return; }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }
  private play(sound: Sound): void {
    const context = this.context;
    if (!context || context.state !== 'running' || document.hidden) return;
    const tone = TONES[sound]; const now = context.currentTime;
    if (now - (this.last[sound] ?? -100) < tone.gap) return;
    let voice = this.voices[0]!;
    for (const v of this.voices) if (v.until < voice.until) voice = v;
    // Important reward/boss cues can steal the voice nearest its end.
    if (voice.until > now && sound !== 'legend' && sound !== 'boss' && sound !== 'level') return;
    this.last[sound] = now;
    const pitch = .94 + Math.random() * .12;
    voice.oscillator.type = tone.wave;
    const frequency = voice.oscillator.frequency; const gain = voice.gain.gain;
    frequency.cancelScheduledValues(now); frequency.setValueAtTime(tone.frequency * pitch, now);
    frequency.exponentialRampToValueAtTime(tone.end * pitch, now + tone.length);
    gain.cancelScheduledValues(now); gain.setValueAtTime(.0001, now);
    gain.exponentialRampToValueAtTime(tone.volume, now + .008);
    gain.exponentialRampToValueAtTime(.0001, now + tone.length);
    gain.setValueAtTime(0, now + tone.length + .01); voice.until = now + tone.length + .01;
    this.peak = Math.max(this.peak, this.active);
  }
  events(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'cast' && e.skill !== 'spin' && e.skill !== 'talisman') this.play(e.skill);
      else if (e.type === 'blast') this.play(e.source === 'spin' || e.source === 'echo_spin' ? 'spin' : 'talisman');
      else if (e.type === 'hit') this.play('hit');
      else if (e.type === 'blocked') this.play('block');
      else if (e.type === 'kill') this.play('kill');
      else if (e.type === 'player_hit') this.play('hurt');
      else if (e.type === 'drop') this.play(e.rarity === 'legendary' ? 'legend' : 'loot');
      else if (e.type === 'pickup' || e.type === 'globe') this.play('loot');
      else if (e.type === 'level_up') this.play('level');
      else if (e.type === 'boss_dead') this.play('boss');
    }
  }
  silence(): void {
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices) { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(0, now); voice.until = 0; }
    this.last = {};
  }
  get active(): number { let n = 0; const now = this.context?.currentTime ?? 0; for (const v of this.voices) if (v.until > now) n++; return n; }
  get stats(): { active: number; peak: number; state: string } { return { active: this.active, peak: this.peak, state: this.muted ? 'muted' : this.context?.state ?? 'locked' }; }
  dispose(): void { this.abort.abort(); this.silence(); for (const v of this.voices) v.oscillator.stop(); void this.context?.close(); }
}
