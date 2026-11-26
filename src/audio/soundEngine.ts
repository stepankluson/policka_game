export type SoundViewMode = 'exterior' | 'interior' | 'bellChamber' | 'churchAttic' | 'churchNave';

const DEFAULT_MASTER_VOLUME = 0.45;
const WHISTLE_COOLDOWN_MS = 18_000;

/**
 * 100% Procedural Web Audio API soundscape engine for Polička (~1900).
 * Zero external audio files, lazy AudioContext initialization on first user gesture,
 * smooth click-free gain ramping, and full cleanup on dispose().
 */
class PolickaSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;

  // Continuous exterior wind chain
  private windSource: AudioBufferSourceNode | null = null;
  private windBandpass: BiquadFilterNode | null = null;
  private windMuffle: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windLfo: OscillatorNode | null = null;
  private windLfoGain: GainNode | null = null;

  // Continuous distant marketplace & town murmur chain
  private murmurSource: AudioBufferSourceNode | null = null;
  private murmurGain: GainNode | null = null;
  private murmurLfo: OscillatorNode | null = null;
  private murmurLfoGain: GainNode | null = null;

  // Dedicated solo violin bus (fades smoothly in/out when entering/exiting Birth Room)
  private violinBus: GainNode | null = null;
  private violinTimeoutId: number | null = null;
  private violinStepIdx = 0;

  // Shared procedural noise buffers
  private whiteNoiseBuffer: AudioBuffer | null = null;

  // Timers for scheduled organic events (clock ticks, crickets)
  private clockIntervalId: number | null = null;
  private clockIsTick = true;
  private cricketTimeoutId: number | null = null;

  // Runtime state
  private isMuted = false;
  private masterVolume = 0.75;
  private sfxVolume = 1.0;
  private musicVolume = 1.0;
  private isFireWatchActive = false;
  private viewMode: SoundViewMode = 'exterior';
  private nightFactor = 0;
  private clockworkProximity = 0.35;
  private lastEnvUpdateMs = 0;
  private lastWhistleMs = 0;
  private creakTimeoutId: number | null = null;
  private activeOrganBus: GainNode | null = null;
  private activeOrganOscs: OscillatorNode[] = [];
  private activeOrganEndTimer: number | null = null;
  private lastFootstepMs = 0;

  private computeMasterGain(): number {
    if (this.isMuted) return 0;
    return DEFAULT_MASTER_VOLUME * (this.masterVolume / 0.75);
  }

  /** Lazily creates & resumes AudioContext on the first user interaction */
  public ensureStarted(): void {
    if (typeof window === 'undefined') return;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.setValueAtTime(this.computeMasterGain(), ctx.currentTime);

      const sfxBus = ctx.createGain();
      sfxBus.gain.setValueAtTime(this.sfxVolume, ctx.currentTime);
      sfxBus.connect(master);

      const musicBus = ctx.createGain();
      musicBus.gain.setValueAtTime(this.musicVolume, ctx.currentTime);
      musicBus.connect(master);

      // Gentle master dynamics compressor / soft limiter so boosted bronze church bells stay rich & clip-free
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-6, ctx.currentTime);
      limiter.knee.setValueAtTime(12, ctx.currentTime);
      limiter.ratio.setValueAtTime(6, ctx.currentTime);
      limiter.attack.setValueAtTime(0.004, ctx.currentTime);
      limiter.release.setValueAtTime(0.14, ctx.currentTime);

      master.connect(limiter);
      limiter.connect(ctx.destination);
      this.masterGain = master;
      this.sfxBus = sfxBus;
      this.musicBus = musicBus;
      this.masterLimiter = limiter;

      this.setupNoiseAndAmbience(ctx, sfxBus, musicBus);
      this.startSchedulers();
      this.applyEnvironmentGains(true);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /**
   * Unlocks Web Audio on clicking "Vstoupit na ochoz", fades in the tower wind & town ambience
   * smoothly over ~1.5s, sounds one deep majestic St. James bronze church bell toll, and follows
   * with a brief distant jackdaw chorus as the camera swoops onto the gallery.
   */
  public playTitleIntroSequence(): void {
    this.ensureStarted();
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Smooth ~1.5s ambience fade-in on wind & town murmur so the world breathes in warmly
    if (this.windGain && this.murmurGain) {
      this.windGain.gain.cancelScheduledValues(now);
      this.windGain.gain.setValueAtTime(0.0001, now);
      this.windGain.gain.linearRampToValueAtTime(0.24, now + 1.5);

      this.murmurGain.gain.cancelScheduledValues(now);
      this.murmurGain.gain.setValueAtTime(0.0001, now);
      this.murmurGain.gain.linearRampToValueAtTime(0.14, now + 1.6);
    }

    // One deep, authoritative resonant bronze toll of St. James Church bell (boosted presence)
    const triggerBell = () => {
      if (!this.ctx || !this.sfxBus || this.isMuted) return;
      const t0 = this.ctx.currentTime + 0.04;
      const f0 = 185.0; // F#3 grand tower bell fundamental
      const partials: readonly { ratio: number; amp: number; decay: number }[] = [
        { ratio: 0.5, amp: 0.34, decay: 5.2 },   // Deep bronze hum
        { ratio: 1.0, amp: 0.42, decay: 4.6 },   // Prime
        { ratio: 1.183, amp: 0.25, decay: 3.4 }, // Minor third tierce
        { ratio: 1.506, amp: 0.17, decay: 2.6 }, // Quint
        { ratio: 2.0, amp: 0.14, decay: 2.0 },   // Nominal
        { ratio: 2.514, amp: 0.07, decay: 1.3 }, // Shimmer
      ];

      const bus = this.ctx.createGain();
      bus.gain.setValueAtTime(0.76, t0);
      bus.connect(this.sfxBus);

      for (const p of partials) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * p.ratio, t0);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(p.amp, t0 + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);

        osc.connect(g);
        g.connect(bus);
        osc.start(t0);
        osc.stop(t0 + p.decay + 0.1);
      }

      // Subtle distant jackdaw calls ~0.65s into the swoop
      window.setTimeout(() => {
        if (!this.isMuted && this.viewMode === 'exterior') {
          this.playJackdawCaws();
        }
      }, 650);
    };

    if (ctx.state === 'suspended') {
      void ctx.resume().then(triggerBell);
    } else {
      triggerBell();
    }
  }

  private createPinkNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private createBrownNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 1.8;
    }
    return buffer;
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private setupNoiseAndAmbience(
    ctx: AudioContext,
    sfxBus: GainNode,
    musicBus: GainNode,
  ): void {
    const pinkBuf = this.createPinkNoiseBuffer(ctx, 4);
    const brownBuf = this.createBrownNoiseBuffer(ctx, 4);
    this.whiteNoiseBuffer = this.createWhiteNoiseBuffer(ctx, 2);

    // 1. High-Altitude Tower Wind (pink noise -> resonant LFO bandpass -> muffle lowpass -> gain)
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = pinkBuf;
    windSrc.loop = true;

    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 420;
    windBp.Q.value = 1.6;

    const windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.11;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 185;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windBp.frequency);

    const windMuffle = ctx.createBiquadFilter();
    windMuffle.type = 'lowpass';
    windMuffle.frequency.value = 1600;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.0001;

    windSrc.connect(windBp);
    windBp.connect(windMuffle);
    windMuffle.connect(windGain);
    windGain.connect(sfxBus);

    windSrc.start();
    windLfo.start();

    this.windSource = windSrc;
    this.windBandpass = windBp;
    this.windMuffle = windMuffle;
    this.windGain = windGain;
    this.windLfo = windLfo;
    this.windLfoGain = windLfoGain;

    // 2. Distant Daytime Marketplace & Town Murmur (brown noise -> warm lowpass -> gentle AM)
    const murmurSrc = ctx.createBufferSource();
    murmurSrc.buffer = brownBuf;
    murmurSrc.loop = true;

    const murmurLp = ctx.createBiquadFilter();
    murmurLp.type = 'lowpass';
    murmurLp.frequency.value = 340;

    const murmurBp = ctx.createBiquadFilter();
    murmurBp.type = 'bandpass';
    murmurBp.frequency.value = 210;
    murmurBp.Q.value = 0.85;

    const murmurModGain = ctx.createGain();
    murmurModGain.gain.value = 0.85;
    const murmurLfo = ctx.createOscillator();
    murmurLfo.type = 'sine';
    murmurLfo.frequency.value = 0.23;
    const murmurLfoGain = ctx.createGain();
    murmurLfoGain.gain.value = 0.15;
    murmurLfo.connect(murmurLfoGain);
    murmurLfoGain.connect(murmurModGain.gain);

    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0.0001;

    murmurSrc.connect(murmurLp);
    murmurLp.connect(murmurBp);
    murmurBp.connect(murmurModGain);
    murmurModGain.connect(murmurGain);
    murmurGain.connect(sfxBus);

    murmurSrc.start();
    murmurLfo.start();

    this.murmurSource = murmurSrc;
    this.murmurGain = murmurGain;
    this.murmurLfo = murmurLfo;
    this.murmurLfoGain = murmurLfoGain;

    // 3. Dedicated Solo Violin Bus for Young Bohuslav Martinů inside the Birth Room
    const violinBus = ctx.createGain();
    violinBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    violinBus.connect(musicBus);
    this.violinBus = violinBus;
  }

  private startSchedulers(): void {
    // Pendulum clock tick-tock every 1.0s (wooden clock in Birth Room; brass escapement in Bell Chamber)
    this.clockIntervalId = window.setInterval(() => {
      if (this.isMuted) return;
      if (this.viewMode === 'interior') {
        this.playClockTick(this.clockIsTick);
        this.clockIsTick = !this.clockIsTick;
      } else if (this.viewMode === 'bellChamber') {
        this.playTowerClockworkTick(this.clockIsTick, this.clockworkProximity);
        this.clockIsTick = !this.clockIsTick;
      } else if (this.viewMode === 'churchAttic') {
        // Very faint, heavily muffled tower-clock ticking drifting through the west stone wall
        this.playDistantAtticClockTick(this.clockIsTick);
        this.clockIsTick = !this.clockIsTick;
      }
    }, 1000);

    // Occasional quiet old-timber creaks inside the Church Attic
    const scheduleTimberCreak = () => {
      const delayMs = 5500 + Math.random() * 7500;
      this.creakTimeoutId = window.setTimeout(() => {
        if (this.viewMode === 'churchAttic' && !this.isMuted) {
          this.playTimberCreak();
        }
        scheduleTimberCreak();
      }, delayMs);
    };
    scheduleTimberCreak();

    // Subtle nighttime crickets (plays outdoors when nightFactor > 0.65)
    const scheduleCricket = () => {
      const delayMs = 2400 + Math.random() * 3400;
      this.cricketTimeoutId = window.setTimeout(() => {
        if (this.viewMode === 'exterior' && this.nightFactor > 0.65 && !this.isMuted) {
          this.playCricketChirp();
        }
        scheduleCricket();
      }, delayMs);
    };
    scheduleCricket();

    // Nostalgic ~14.5s Czech folk-inspired solo violin practice melody (D minor)
    // Played by young Bohuslav Martinů inside Rodná světnička
    const melody: readonly { freq: number; dur: number; gap: number; vel?: number }[] = [
      // Phrase 1: tender Vysočina folk opening
      { freq: 293.66, dur: 0.62, gap: 0.06, vel: 0.85 }, // D4
      { freq: 349.23, dur: 0.44, gap: 0.05, vel: 0.9 },  // F4
      { freq: 440.0, dur: 0.72, gap: 0.06, vel: 1.0 },   // A4
      { freq: 392.0, dur: 0.42, gap: 0.05, vel: 0.9 },   // G4
      { freq: 349.23, dur: 0.44, gap: 0.05, vel: 0.85 }, // F4
      { freq: 329.63, dur: 0.46, gap: 0.05, vel: 0.82 }, // E4
      { freq: 293.66, dur: 0.82, gap: 0.48, vel: 0.78 }, // D4 + breath
      // Phrase 2: lyrical upward reach
      { freq: 440.0, dur: 0.52, gap: 0.05, vel: 0.92 },  // A4
      { freq: 466.16, dur: 0.46, gap: 0.05, vel: 0.96 }, // Bb4
      { freq: 523.25, dur: 0.76, gap: 0.06, vel: 1.0 },  // C5
      { freq: 440.0, dur: 0.54, gap: 0.05, vel: 0.92 },  // A4
      { freq: 392.0, dur: 0.46, gap: 0.05, vel: 0.86 },  // G4
      { freq: 349.23, dur: 0.46, gap: 0.05, vel: 0.82 }, // F4
      { freq: 329.63, dur: 0.76, gap: 0.52, vel: 0.76 }, // E4 + breath
      // Phrase 3: gentle classical practice turn
      { freq: 349.23, dur: 0.44, gap: 0.05, vel: 0.85 }, // F4
      { freq: 392.0, dur: 0.44, gap: 0.05, vel: 0.9 },   // G4
      { freq: 440.0, dur: 0.64, gap: 0.05, vel: 0.95 },  // A4
      { freq: 392.0, dur: 0.42, gap: 0.05, vel: 0.88 },  // G4
      { freq: 349.23, dur: 0.44, gap: 0.05, vel: 0.84 }, // F4
      { freq: 329.63, dur: 0.42, gap: 0.05, vel: 0.8 },  // E4
      { freq: 293.66, dur: 0.5, gap: 0.05, vel: 0.82 },  // D4
      { freq: 277.18, dur: 0.56, gap: 0.34, vel: 0.78 }, // C#4 + breath
      // Phrase 4: warm resolved home cadence
      { freq: 293.66, dur: 0.46, gap: 0.05, vel: 0.86 }, // D4
      { freq: 329.63, dur: 0.44, gap: 0.05, vel: 0.88 }, // E4
      { freq: 349.23, dur: 0.56, gap: 0.06, vel: 0.92 }, // F4
      { freq: 440.0, dur: 0.62, gap: 0.08, vel: 0.9 },   // A4
      { freq: 293.66, dur: 1.05, gap: 1.55, vel: 0.8 },  // D4 + pause before loop
    ];

    const scheduleViolinStep = () => {
      const note = melody[this.violinStepIdx % melody.length];
      this.violinStepIdx = (this.violinStepIdx + 1) % melody.length;

      if (this.viewMode === 'interior' && !this.isMuted && !this.isFireWatchActive) {
        this.playViolinNote(note.freq, note.dur, note.vel ?? 0.88);
      }

      const nextDelayMs = Math.max(120, Math.round((note.dur + note.gap) * 1000));
      this.violinTimeoutId = window.setTimeout(scheduleViolinStep, nextDelayMs);
    };
    scheduleViolinStep();
  }

  public setFireWatchActive(active: boolean): void {
    this.isFireWatchActive = active;
    this.applyEnvironmentGains(true);
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (!muted && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Smooth fade to prevent any click/pop
    this.masterGain.gain.setTargetAtTime(this.computeMasterGain(), now, 0.04);
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.computeMasterGain(), this.ctx.currentTime, 0.04);
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.sfxBus) return;
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.04);
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.04);
  }

  /** Updates proximity [0..1] to the mechanical tower clockwork inside the Bell Chamber */
  public setClockworkProximity(prox01: number): void {
    this.clockworkProximity = Math.max(0.12, Math.min(1, prox01));
  }

  public updateEnvironment(viewMode: SoundViewMode, nightFactor: number): void {
    const modeChanged = viewMode !== this.viewMode;
    this.viewMode = viewMode;
    this.nightFactor = nightFactor;

    if (!this.ctx) return;
    const nowMs = performance.now();
    if (!modeChanged && nowMs - this.lastEnvUpdateMs < 100) return;
    this.lastEnvUpdateMs = nowMs;

    this.applyEnvironmentGains(modeChanged);
  }

  private applyEnvironmentGains(isModeTransition: boolean): void {
    if (!this.ctx || !this.windGain || !this.windMuffle || !this.murmurGain) return;
    const now = this.ctx.currentTime;
    const tau = isModeTransition ? 0.18 : 0.25; // ~0.5s smooth crossfade

    if (this.viewMode === 'interior') {
      // Muffle exterior wind deeply and silence exterior town murmur
      this.windMuffle.frequency.setTargetAtTime(200, now, tau);
      this.windGain.gain.setTargetAtTime(0.04, now, tau);
      this.murmurGain.gain.setTargetAtTime(0.0001, now, tau);
      if (this.violinBus) {
        this.violinBus.gain.cancelScheduledValues(now);
        this.violinBus.gain.setValueAtTime(Math.max(0.0001, this.violinBus.gain.value), now);
        this.violinBus.gain.linearRampToValueAtTime(
          this.isFireWatchActive ? 0.0001 : 0.24,
          now + 0.85,
        );
      }
    } else if (this.viewMode === 'bellChamber') {
      // Bell Chamber: airy louver-filtered tower breeze + gentle distant town murmur, no violin
      const dayFactor = Math.max(0, 1 - this.nightFactor * 1.15);
      this.windMuffle.frequency.setTargetAtTime(680 - this.nightFactor * 140, now, tau);
      this.windGain.gain.setTargetAtTime(0.11 - this.nightFactor * 0.02, now, tau);
      this.murmurGain.gain.setTargetAtTime(0.0001 + dayFactor * 0.065, now, tau);
      if (this.violinBus) {
        this.violinBus.gain.cancelScheduledValues(now);
        this.violinBus.gain.setValueAtTime(Math.max(0.0001, this.violinBus.gain.value), now);
        this.violinBus.gain.linearRampToValueAtTime(0.0001, now + 0.45);
      }
    } else if (this.viewMode === 'churchAttic') {
      // Church Attic: soft muffled wind brushing the steep tiled roof; faint clock & timber creaks handled by schedulers
      this.windMuffle.frequency.setTargetAtTime(320 - this.nightFactor * 55, now, tau);
      this.windGain.gain.setTargetAtTime(0.095 - this.nightFactor * 0.015, now, tau);
      this.murmurGain.gain.setTargetAtTime(0.0001, now, tau);
      if (this.violinBus) {
        this.violinBus.gain.cancelScheduledValues(now);
        this.violinBus.gain.setValueAtTime(Math.max(0.0001, this.violinBus.gain.value), now);
        this.violinBus.gain.linearRampToValueAtTime(0.0001, now + 0.45);
      }
    } else if (this.viewMode === 'churchNave') {
      // Church Nave: deep acoustic hush of thick stone walls
      this.windMuffle.frequency.setTargetAtTime(160, now, tau);
      this.windGain.gain.setTargetAtTime(0.022, now, tau);
      this.murmurGain.gain.setTargetAtTime(0.0001, now, tau);
      if (this.violinBus) {
        this.violinBus.gain.cancelScheduledValues(now);
        this.violinBus.gain.setValueAtTime(Math.max(0.0001, this.violinBus.gain.value), now);
        this.violinBus.gain.linearRampToValueAtTime(0.0001, now + 0.45);
      }
    } else {
      // Exterior gallery: crisp wind + daytime town murmur that fades to 0 at night
      const dayFactor = Math.max(0, 1 - this.nightFactor * 1.15);
      this.windMuffle.frequency.setTargetAtTime(1650 - this.nightFactor * 350, now, tau);
      this.windGain.gain.setTargetAtTime(0.24 - this.nightFactor * 0.04, now, tau);
      this.murmurGain.gain.setTargetAtTime(0.0001 + dayFactor * 0.14, now, tau);
      if (this.violinBus) {
        this.violinBus.gain.cancelScheduledValues(now);
        this.violinBus.gain.setValueAtTime(Math.max(0.0001, this.violinBus.gain.value), now);
        this.violinBus.gain.linearRampToValueAtTime(0.0001, now + 0.7);
      }
    }
  }

  /** Wooden pendulum clock tick / tock inside Rodná světnička */
  private playClockTick(isTick: boolean): void {
    if (!this.ctx || !this.sfxBus || !this.whiteNoiseBuffer || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Short wood-body bandpass noise impulse
    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isTick ? 1320 : 980, now);
    bp.Q.setValueAtTime(6.5, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isTick ? 0.095 : 0.08, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random() * 1.2, 0.055);

    // Subtle wooden resonant body tap
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isTick ? 620 : 490, now);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.linearRampToValueAtTime(0.025, now + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    osc.connect(og);
    og.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** Mechanical brass-and-iron tower clockwork escapement tick-tock inside Zvonové patro */
  private playTowerClockworkTick(isTick: boolean, proximity: number): void {
    if (!this.ctx || !this.sfxBus || !this.whiteNoiseBuffer || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gainScale = 0.22 + proximity * 0.78;

    // Crisp brass escapement click
    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isTick ? 1850 : 1420, now);
    bp.Q.setValueAtTime(9.0, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime((isTick ? 0.11 : 0.09) * gainScale, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random() * 1.2, 0.055);

    // Subtle deep iron pendulum frame thud
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isTick ? 390 : 320, now);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.linearRampToValueAtTime(0.045 * gainScale, now + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(og);
    og.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  /** Very faint, heavily muffled tower-clock ticking drifting into the Church Attic from the west tower wall */
  private playDistantAtticClockTick(isTick: boolean): void {
    if (!this.ctx || !this.sfxBus || !this.whiteNoiseBuffer || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(isTick ? 640 : 520, now);
    lp.Q.setValueAtTime(2.4, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(isTick ? 0.024 : 0.019, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    src.start(now, Math.random() * 1.2, 0.065);
  }

  /** Occasional quiet old-oak roof truss creak inside the Church Attic */
  private playTimberCreak(): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.45 + Math.random() * 0.45;
    const baseFreq = 105 + Math.random() * 55;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (0.68 + Math.random() * 0.14), now + dur);

    // Subtle woody stick-slip modulation
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(14 + Math.random() * 10, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(9, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(280 + Math.random() * 140, now);
    bp.Q.setValueAtTime(4.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.022, now + dur * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxBus);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + dur + 0.02);
    lfo.stop(now + dur + 0.02);
  }

  /** Delicate distant high-pitched rhythmic cricket chirp (4.2–4.6 kHz) */
  private playCricketChirp(): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const nightScale = Math.max(0, Math.min(1, (this.nightFactor - 0.65) / 0.25));
    const baseFreq = 4220 + Math.random() * 340;
    const pulses = 3 + Math.floor(Math.random() * 2);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);

    for (let i = 0; i < pulses; i++) {
      const start = now + i * 0.075;
      gain.gain.linearRampToValueAtTime(0.014 * nightScale, start + 0.012);
      gain.gain.linearRampToValueAtTime(0.0001, start + 0.048);
    }

    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + pulses * 0.075 + 0.05);
  }

  /**
   * Warm, expressive bowed solo violin note (blended sawtooth + triangle through resonant
   * wooden-body filters with 5.4 Hz pitch vibrato and smooth bowed ADSR envelope).
   */
  private playViolinNote(freq: number, durationSec: number, velocity = 0.88): void {
    if (!this.ctx || !this.violinBus || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const sawOsc = ctx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.setValueAtTime(freq, now);

    const triOsc = ctx.createOscillator();
    triOsc.type = 'triangle';
    triOsc.frequency.setValueAtTime(freq, now);

    // Subtle expressive pitch vibrato (~5.4 Hz) that blooms gently after the bow attack
    const vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.setValueAtTime(5.4, now);
    const vibGain = ctx.createGain();
    vibGain.gain.setValueAtTime(0.0001, now);
    vibGain.gain.linearRampToValueAtTime(freq * 0.0085, now + Math.min(0.28, durationSec * 0.45));
    vibLfo.connect(vibGain);
    vibGain.connect(sawOsc.frequency);
    vibGain.connect(triOsc.frequency);

    const sawMix = ctx.createGain();
    sawMix.gain.setValueAtTime(0.52, now);
    const triMix = ctx.createGain();
    triMix.gain.setValueAtTime(0.48, now);

    // Wooden violin body formant + soft lowpass to eliminate harsh high harmonics
    const bodyPeak = ctx.createBiquadFilter();
    bodyPeak.type = 'peaking';
    bodyPeak.frequency.setValueAtTime(520, now);
    bodyPeak.Q.setValueAtTime(1.4, now);
    bodyPeak.gain.setValueAtTime(3.2, now);

    const warmthLp = ctx.createBiquadFilter();
    warmthLp.type = 'lowpass';
    warmthLp.frequency.setValueAtTime(1550, now);
    warmthLp.Q.setValueAtTime(1.1, now);

    // Bowed ADSR envelope
    const attack = Math.min(0.16, durationSec * 0.28);
    const release = 0.22;
    const peakAmp = 0.16 * velocity;
    const sustainAmp = peakAmp * 0.82;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peakAmp, now + attack);
    env.gain.linearRampToValueAtTime(sustainAmp, now + Math.max(attack + 0.05, durationSec));
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationSec + release);

    sawOsc.connect(sawMix);
    triOsc.connect(triMix);
    sawMix.connect(bodyPeak);
    triMix.connect(bodyPeak);
    bodyPeak.connect(warmthLp);
    warmthLp.connect(env);
    env.connect(this.violinBus);

    const stopAt = now + durationSec + release + 0.04;
    sawOsc.start(now);
    triOsc.start(now);
    vibLfo.start(now);
    sawOsc.stop(stopAt);
    triOsc.stop(stopAt);
    vibLfo.stop(stopAt);
  }

  /** Rich bronze St. James Church bell strike using authentic inharmonic bell partials */
  public playChurchBell(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f0 = 220; // A3 bronze bell fundamental
    const partials: readonly { ratio: number; amp: number; decay: number }[] = [
      { ratio: 0.5, amp: 0.24, decay: 3.8 },   // Hum
      { ratio: 1.0, amp: 0.32, decay: 3.4 },   // Prime
      { ratio: 1.183, amp: 0.2, decay: 2.6 },  // Minor third tierce
      { ratio: 1.506, amp: 0.14, decay: 2.1 }, // Quint
      { ratio: 2.0, amp: 0.11, decay: 1.6 },   // Nominal
      { ratio: 2.514, amp: 0.06, decay: 1.1 }, // Superquint
    ];

    const bellBus = ctx.createGain();
    bellBus.gain.setValueAtTime(0.68, now);
    bellBus.connect(this.sfxBus);

    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0 * p.ratio, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(p.amp, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(g);
      g.connect(bellBus);
      osc.start(now);
      osc.stop(now + p.decay + 0.08);
    }
  }

  /** Mellow, distant ~1900 two-tone steam train whistle with steam hiss & countryside echo */
  public playTrainWhistle(): void {
    if (this.isMuted || this.viewMode !== 'exterior') return;
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const nowMs = performance.now();
    if (nowMs - this.lastWhistleMs < WHISTLE_COOLDOWN_MS) return;
    this.lastWhistleMs = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const whistleBus = ctx.createGain();
    whistleBus.gain.setValueAtTime(0.0001, now);
    whistleBus.gain.linearRampToValueAtTime(0.11, now + 0.22);
    whistleBus.gain.setValueAtTime(0.1, now + 0.78);
    whistleBus.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1350, now);
    whistleBus.connect(lp);
    lp.connect(this.sfxBus);

    // Subtle distant countryside echo
    const delay = ctx.createDelay(0.6);
    delay.delayTime.setValueAtTime(0.36, now);
    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0.3, now);
    lp.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(this.sfxBus);

    // Harmonized two-tone steam whistle (~392 Hz G4 & ~494 Hz B4) with slight warm pitch bend
    for (const freq of [392, 494]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 0.985, now);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.18);
      osc.frequency.linearRampToValueAtTime(freq * 0.992, now + 1.4);
      osc.connect(whistleBus);
      osc.start(now);
      osc.stop(now + 1.55);
    }

    // Hint of filtered white-noise steam hiss
    if (this.whiteNoiseBuffer) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1600, now);
      bp.Q.setValueAtTime(1.5, now);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.16, now);
      hiss.connect(bp);
      bp.connect(hg);
      hg.connect(whistleBus);
      hiss.start(now, 0, 1.5);
    }
  }

  /** Soft wooden door latch & subtle creak when entering/exiting Rodná světnička */
  public playDoorFoley(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Mechanical wooden latch click
    if (this.whiteNoiseBuffer) {
      const latch = ctx.createBufferSource();
      latch.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(920, now);
      bp.Q.setValueAtTime(4.0, now);
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0.0001, now);
      lg.gain.linearRampToValueAtTime(0.16, now + 0.006);
      lg.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      latch.connect(bp);
      bp.connect(lg);
      lg.connect(this.sfxBus);
      latch.start(now, 0.1, 0.08);
    }

    // Subtle wooden creak resonance
    const creak = ctx.createOscillator();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(170, now + 0.04);
    creak.frequency.linearRampToValueAtTime(245, now + 0.16);
    creak.frequency.linearRampToValueAtTime(145, now + 0.3);

    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(420, now + 0.04);
    lp.Q.setValueAtTime(3.2, now + 0.04);

    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, now + 0.04);
    cg.gain.linearRampToValueAtTime(0.055, now + 0.1);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    creak.connect(lp);
    lp.connect(cg);
    cg.connect(this.sfxBus);
    creak.start(now + 0.04);
    creak.stop(now + 0.36);
  }

  /** Crisp mechanical brass click when entering or exiting [E] Telescope mode */
  public playTelescopeClick(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (const [freq, amp, dur] of [
      [1950, 0.075, 0.04],
      [3400, 0.045, 0.028],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    }

    if (this.whiteNoiseBuffer) {
      const snap = ctx.createBufferSource();
      snap.buffer = this.whiteNoiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2200, now);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.linearRampToValueAtTime(0.09, now + 0.002);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
      snap.connect(hp);
      hp.connect(sg);
      sg.connect(this.sfxBus);
      snap.start(now, 0.3, 0.035);
    }
  }

  /** Smoothly fades out and stops any currently playing church pipe-organ melody */
  public stopChurchOrgan(): void {
    if (this.activeOrganEndTimer !== null) {
      window.clearTimeout(this.activeOrganEndTimer);
      this.activeOrganEndTimer = null;
    }
    if (this.ctx && this.activeOrganBus) {
      const now = this.ctx.currentTime;
      const bus = this.activeOrganBus;
      const oscs = this.activeOrganOscs;
      try {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
        bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        for (let i = 0; i < oscs.length; i++) {
          oscs[i].stop(now + 0.28);
        }
      } catch {
        // Ignore already-stopped oscillators
      }
    }
    this.activeOrganBus = null;
    this.activeOrganOscs = [];
  }

  /**
   * Synthesizes 3 distinct period ~1900 church pipe-organ melodies inside St. Jacob's Church:
   * - 0: Solemn Baroque Chorale / Prelude (D minor -> Bb -> C -> A7 -> D minor)
   * - 1: Gentle Lyrical Pastoral Motif (Czech/Martinů-inspired F major flute-stop cantabile)
   * - 2: Majestic Neo-Gothic Full-Organ Cadence (Grand C-major plenum registration)
   */
  public playChurchOrganMelody(melodyIndex: 0 | 1 | 2, onEnded?: () => void): void {
    this.stopChurchOrgan();
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.musicBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const baseNow = ctx.currentTime + 0.04;

    type OrganChord = { start: number; dur: number; notes: readonly number[] };
    let chords: readonly OrganChord[];
    let cutoffHz = 1450;
    let busGain = 0.24;
    let stops: readonly (readonly [number, OscillatorType, number])[];

    if (melodyIndex === 0) {
      // Melody 1: Solemn Baroque Chorale / Prelude (D minor)
      chords = [
        { start: 0.0, dur: 1.7, notes: [146.83, 293.66, 349.23, 440.0] },
        { start: 1.62, dur: 1.65, notes: [116.54, 233.08, 349.23, 466.16] },
        { start: 3.2, dur: 1.55, notes: [130.81, 261.63, 392.0, 523.25] },
        { start: 4.68, dur: 1.55, notes: [110.0, 277.18, 329.63, 440.0] },
        { start: 6.15, dur: 2.45, notes: [146.83, 293.66, 349.23, 587.33] },
      ];
      cutoffHz = 1350;
      busGain = 0.24;
      stops = [
        [0.5, 'sine', 0.14],
        [1, 'triangle', 0.22],
        [2, 'sine', 0.09],
      ];
    } else if (melodyIndex === 1) {
      // Melody 2: Gentle Lyrical Pastoral Motif (Czech/Martinů-inspired F-major cantabile)
      chords = [
        { start: 0.0, dur: 1.5, notes: [174.61, 261.63, 349.23, 440.0] },
        { start: 1.42, dur: 1.25, notes: [174.61, 261.63, 392.0, 523.25] },
        { start: 2.6, dur: 1.4, notes: [146.83, 293.66, 349.23, 587.33] },
        { start: 3.92, dur: 1.35, notes: [196.0, 293.66, 392.0, 493.88] },
        { start: 5.2, dur: 1.3, notes: [130.81, 261.63, 329.63, 440.0] },
        { start: 6.42, dur: 2.3, notes: [174.61, 261.63, 349.23, 523.25] },
      ];
      cutoffHz = 1150;
      busGain = 0.22;
      stops = [
        [1, 'sine', 0.24],
        [2, 'sine', 0.11],
        [1.003, 'triangle', 0.08],
      ];
    } else {
      // Melody 3: Majestic Neo-Gothic Full-Organ Cadence (Radiant C-major plenum)
      chords = [
        { start: 0.0, dur: 1.45, notes: [130.81, 261.63, 329.63, 392.0, 523.25] },
        { start: 1.38, dur: 1.4, notes: [174.61, 261.63, 349.23, 440.0, 523.25] },
        { start: 2.7, dur: 1.4, notes: [196.0, 246.94, 392.0, 493.88, 587.33] },
        { start: 4.02, dur: 1.35, notes: [220.0, 261.63, 329.63, 440.0, 659.25] },
        { start: 5.3, dur: 1.35, notes: [196.0, 293.66, 349.23, 493.88, 587.33] },
        { start: 6.58, dur: 2.55, notes: [130.81, 261.63, 329.63, 392.0, 523.25] },
      ];
      cutoffHz = 2150;
      busGain = 0.25;
      stops = [
        [0.5, 'triangle', 0.14],
        [1, 'sawtooth', 0.11],
        [1, 'triangle', 0.14],
        [2, 'sine', 0.09],
      ];
    }

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoffHz, baseNow);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(busGain, baseNow);
    lp.connect(bus);
    bus.connect(this.musicBus);

    const oscs: OscillatorNode[] = [];
    let maxEnd = 0;

    for (const ch of chords) {
      const t0 = baseNow + ch.start;
      const tEnd = ch.start + ch.dur + 0.5;
      if (tEnd > maxEnd) maxEnd = tEnd;
      for (const freq of ch.notes) {
        for (const [mult, type, amp] of stops) {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.setValueAtTime(freq * mult, t0);

          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(amp, t0 + 0.13);
          g.gain.setValueAtTime(amp * 0.88, t0 + ch.dur - 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + ch.dur + 0.45);

          osc.connect(g);
          g.connect(lp);
          osc.start(t0);
          osc.stop(t0 + ch.dur + 0.52);
          oscs.push(osc);
        }
      }
    }

    this.activeOrganBus = bus;
    this.activeOrganOscs = oscs;
    this.activeOrganEndTimer = window.setTimeout(() => {
      if (this.activeOrganBus === bus) {
        this.activeOrganBus = null;
        this.activeOrganOscs = [];
        this.activeOrganEndTimer = null;
        onEnded?.();
      }
    }, Math.round((maxEnd + 0.15) * 1000));
  }

  /** Soft, resonant ~1900 church pipe-organ chorale progression (wrapper for collectible preview) */
  public playChurchOrganChorale(): void {
    this.playChurchOrganMelody(0);
  }

  /** Soft wooden match strike & warm candle wick ignition sound */
  public playCandleIgnite(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || !this.whiteNoiseBuffer || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const strike = ctx.createBufferSource();
    strike.buffer = this.whiteNoiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, now);
    bp.Q.setValueAtTime(2.2, now);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.linearRampToValueAtTime(0.085, now + 0.012);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    strike.connect(bp);
    bp.connect(sg);
    sg.connect(this.sfxBus);
    strike.start(now, Math.random() * 1.1, 0.13);

    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.whiteNoiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(620, now + 0.03);
    lp.frequency.exponentialRampToValueAtTime(210, now + 0.28);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, now + 0.025);
    wg.gain.linearRampToValueAtTime(0.095, now + 0.075);
    wg.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    whoosh.connect(lp);
    lp.connect(wg);
    wg.connect(this.sfxBus);
    whoosh.start(now + 0.025, Math.random() * 1.1, 0.3);
  }

  /**
   * Subtle surface-aware procedural footsteps synced to walk/sprint cadence:
   * - 'wood': warm hollow wooden plank thud (Birth Room, Bell Chamber, Attic, Spiral Stairs & Organ Loft)
   * - 'stone': crisper stone-tile tap, with optional subtle cathedral hall echo inside St. Jacob's Nave
   */
  public playFootstep(surface: 'wood' | 'stone', isSprinting: boolean, reverbHall = false): void {
    if (this.isMuted || !this.ctx || !this.sfxBus || !this.whiteNoiseBuffer || this.ctx.state !== 'running') {
      return;
    }
    const nowMs = performance.now();
    const minIntervalMs = isSprinting ? 185 : 275;
    if (nowMs - this.lastFootstepMs < minIntervalMs) return;
    this.lastFootstepMs = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;
    const ampScale = isSprinting ? 1.28 : 1.0;

    if (surface === 'wood') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(118 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(64 * jitter, now + 0.068);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.linearRampToValueAtTime(0.075 * ampScale, now + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.078);
      osc.connect(og);
      og.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.085);

      const noise = ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(340 * jitter, now);
      bp.Q.setValueAtTime(1.8, now);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(0.042 * ampScale, now + 0.006);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxBus);
      noise.start(now, Math.random() * 1.2, 0.07);
    } else {
      const triggerStoneTap = (delaySec: number, gainMult: number, cutoff: number) => {
        const t0 = now + delaySec;
        const noise = ctx.createBufferSource();
        noise.buffer = this.whiteNoiseBuffer!;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(cutoff * jitter, t0);
        bp.Q.setValueAtTime(2.6, t0);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t0);
        ng.gain.linearRampToValueAtTime(0.055 * ampScale * gainMult, t0 + 0.004);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + (delaySec > 0 ? 0.095 : 0.048));
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(this.sfxBus!);
        noise.start(t0, Math.random() * 1.2, 0.11);
      };

      triggerStoneTap(0, 1.0, 1180);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(175 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(92 * jitter, now + 0.04);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.linearRampToValueAtTime(0.036 * ampScale, now + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      osc.connect(og);
      og.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.05);

      if (reverbHall) {
        triggerStoneTap(0.085, 0.34, 820);
        triggerStoneTap(0.185, 0.16, 560);
      }
    }
  }

  /** Rich, resonant double bronze church bell toll (with boosted stone-chamber resonance when inside Bell Chamber) */
  public playChurchBellToll(inBellChamber = false): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const baseNow = ctx.currentTime;
    const f0 = 196.0; // G3 deep warm St. James tower bell fundamental
    const decayMult = inBellChamber ? 1.32 : 1.0;
    const partials: readonly { ratio: number; amp: number; decay: number }[] = [
      { ratio: 0.5, amp: inBellChamber ? 0.34 : 0.26, decay: 4.4 * decayMult },
      { ratio: 1.0, amp: inBellChamber ? 0.42 : 0.34, decay: 3.9 * decayMult },
      { ratio: 1.183, amp: inBellChamber ? 0.25 : 0.21, decay: 3.0 * decayMult },
      { ratio: 1.506, amp: 0.14, decay: 2.3 * decayMult },
      { ratio: 2.0, amp: 0.11, decay: 1.8 * decayMult },
    ];

    // Two stately resonant tolls spaced 1.35s apart; add subtle stone-chamber slapback echo inside Bell Chamber
    const strikes = inBellChamber
      ? [
          { offset: 0, gain: 0.92 },
          { offset: 0.13, gain: 0.24 },
          { offset: 1.35, gain: 0.9 },
          { offset: 1.48, gain: 0.22 },
        ]
      : [
          { offset: 0, gain: 0.72 },
          { offset: 1.35, gain: 0.72 },
        ];

    for (const strike of strikes) {
      const t0 = baseNow + strike.offset;
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(strike.gain, t0);
      bus.connect(this.sfxBus);

      for (const p of partials) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * p.ratio, t0);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(p.amp, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);

        osc.connect(g);
        g.connect(bus);
        osc.start(t0);
        osc.stop(t0 + p.decay + 0.08);
      }
    }
  }

  /** Short burst of startled jackdaw (kavka) caws when the tower bell rings */
  public playJackdawCaws(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const baseNow = ctx.currentTime + 0.18;
    const cawOffsets = [0, 0.22, 0.48, 0.78, 1.15];

    for (let i = 0; i < cawOffsets.length; i++) {
      const t0 = baseNow + cawOffsets[i];
      const baseF = 1120 + ((i * 197) % 360);
      const dur = 0.14 + (i % 2) * 0.04;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseF * 1.12, t0);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.78, t0 + dur);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(baseF * 1.25, t0);
      bp.Q.setValueAtTime(3.6, t0);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.055, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);

      osc.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    }
  }

  /** Urgent rapid bronze fire alarm bell strikes (5 quick clangs with authentic partials) */
  public playFireAlarmBell(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const baseNow = ctx.currentTime;
    const f0 = 261.63; // C4 sharper alarm bell fundamental
    const partials: readonly { ratio: number; amp: number; decay: number }[] = [
      { ratio: 0.5, amp: 0.2, decay: 2.0 },
      { ratio: 1.0, amp: 0.34, decay: 1.8 },
      { ratio: 1.183, amp: 0.22, decay: 1.45 },
      { ratio: 1.506, amp: 0.16, decay: 1.15 },
      { ratio: 2.0, amp: 0.14, decay: 0.9 },
      { ratio: 2.756, amp: 0.08, decay: 0.65 },
    ];

    const strikeOffsets = [0, 0.34, 0.68, 1.04, 1.42];
    for (let s = 0; s < strikeOffsets.length; s++) {
      const t0 = baseNow + strikeOffsets[s];
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.64, t0);
      bus.connect(this.sfxBus);

      for (const p of partials) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * p.ratio, t0);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(p.amp, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);

        osc.connect(g);
        g.connect(bus);
        osc.start(t0);
        osc.stop(t0 + p.decay + 0.06);
      }
    }
  }

  /** Subtle wood/cloth/iron hook latch foley when hanging the red flag or red signal lantern */
  public playSignalHangFoley(kind: 'flag' | 'lantern'): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Iron hook metallic clink
    const clink = ctx.createOscillator();
    clink.type = 'triangle';
    clink.frequency.setValueAtTime(kind === 'lantern' ? 1480 : 880, now);
    clink.frequency.exponentialRampToValueAtTime(kind === 'lantern' ? 920 : 520, now + 0.08);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, now);
    cg.gain.linearRampToValueAtTime(0.11, now + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    clink.connect(cg);
    cg.connect(this.sfxBus);
    clink.start(now);
    clink.stop(now + 0.12);

    // Cloth flutter (for flag) or warm wooden thud (for lantern)
    if (this.whiteNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(kind === 'flag' ? 760 : 420, now + 0.03);
      bp.Q.setValueAtTime(kind === 'flag' ? 1.8 : 3.4, now + 0.03);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now + 0.03);
      ng.gain.linearRampToValueAtTime(kind === 'flag' ? 0.12 : 0.09, now + 0.07);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'flag' ? 0.28 : 0.16));
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxBus);
      src.start(now + 0.03, 0.2, 0.3);
    }
  }

  /** Gentle warm resolved chime when the fire brigade extinguishes a fire */
  public playFireExtinguishedChime(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [392.0, 493.88, 587.33]; // G4 - B4 - D5 warm triad
    for (let i = 0; i < notes.length; i++) {
      const t0 = now + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.085, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + 1.5);
    }
  }

  /** ~1900 black-powder hunting rifle shot: punchy filtered crack + low-mid thump + town-square echo */
  public playRifleShot(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Sharp filtered white-noise crack
    if (this.whiteNoiseBuffer) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1550, now);
      bp.frequency.exponentialRampToValueAtTime(380, now + 0.16);
      bp.Q.setValueAtTime(0.85, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.55, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);

      crack.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus);
      crack.start(now, Math.random() * 0.6, 0.25);

      // 2. Subtle open-air town-square echoes
      for (const [delay, peak, lpFreq] of [
        [0.21, 0.13, 720],
        [0.46, 0.055, 480],
      ] as const) {
        const echo = ctx.createBufferSource();
        echo.buffer = this.whiteNoiseBuffer;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lpFreq, now + delay);
        const eg = ctx.createGain();
        eg.gain.setValueAtTime(0.0001, now + delay);
        eg.gain.linearRampToValueAtTime(peak, now + delay + 0.025);
        eg.gain.exponentialRampToValueAtTime(0.0005, now + delay + 0.32);
        echo.connect(lp);
        lp.connect(eg);
        eg.connect(this.sfxBus);
        echo.start(now + delay, Math.random() * 0.5, 0.35);
      }
    }

    // 3. Low-mid black-powder punch/thump
    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(175, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.001, now);
    tg.gain.linearRampToValueAtTime(0.42, now + 0.008);
    tg.gain.exponentialRampToValueAtTime(0.0008, now + 0.17);
    thump.connect(tg);
    tg.connect(this.sfxBus);
    thump.start(now);
    thump.stop(now + 0.19);
  }

  /** Subtle metallic bolt-action reload click-clack as the rifle finishes cycling */
  public playRifleReloadClick(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (const [offset, freq, gainPeak] of [
      [0, 2150, 0.09],
      [0.075, 2900, 0.11],
    ] as const) {
      const t0 = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + 0.032);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq, t0);
      bp.Q.setValueAtTime(4.0, t0);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.04);

      osc.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + 0.045);
    }
  }

  /** Crisp hit confirmation tick + short startled jackdaw caw */
  public playJackdawHitFeedback(): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Crisp wooden/chime hit tick
    const tick = ctx.createOscillator();
    tick.type = 'sine';
    tick.frequency.setValueAtTime(1380, now);
    tick.frequency.exponentialRampToValueAtTime(920, now + 0.055);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, now);
    tg.gain.linearRampToValueAtTime(0.16, now + 0.005);
    tg.gain.exponentialRampToValueAtTime(0.0005, now + 0.07);
    tick.connect(tg);
    tg.connect(this.sfxBus);
    tick.start(now);
    tick.stop(now + 0.08);

    // 2. Short startled jackdaw caw
    const caw = ctx.createOscillator();
    caw.type = 'sawtooth';
    caw.frequency.setValueAtTime(940 + Math.random() * 140, now + 0.02);
    caw.frequency.exponentialRampToValueAtTime(560, now + 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1320, now + 0.02);
    bp.Q.setValueAtTime(2.6, now + 0.02);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, now + 0.02);
    cg.gain.linearRampToValueAtTime(0.13, now + 0.045);
    cg.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
    caw.connect(bp);
    bp.connect(cg);
    cg.connect(this.sfxBus);
    caw.start(now + 0.02);
    caw.stop(now + 0.19);
  }

  /** Subtle, crisp metallic brass latch/bail click when pulling out or stowing the handheld lantern */
  public playLanternToggle(isOut: boolean): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Crisp metallic latch transient (short filtered noise burst)
    if (this.whiteNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isOut ? 2750 : 2050, now);
      bp.Q.setValueAtTime(5.2, now);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(0.085, now + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxBus);
      src.start(now, Math.random() * 1.2, 0.045);
    }

    // 2. Subtle iron/brass lantern handle clink (slightly brighter when raising, lower when stowing)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isOut ? 1360 : 1120, now + 0.014);
    osc.frequency.exponentialRampToValueAtTime(isOut ? 1740 : 820, now + 0.056);

    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now + 0.014);
    og.gain.linearRampToValueAtTime(0.07, now + 0.019);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);

    osc.connect(og);
    og.connect(this.sfxBus);
    osc.start(now + 0.014);
    osc.stop(now + 0.075);
  }

  /**
   * Plays a tailored, subtle ~1900 synthesized Web Audio cue for each of Polička's 8
   * landmark historical micro-scenes (zero external audio files, respects mute).
   */
  public playMicroSceneCue(
    poiId:
      | 'market'
      | 'town-hall'
      | 'plague-column'
      | 'medieval-gate'
      | 'brewery'
      | 'synsky-pond'
      | 'st-michael-cemetery'
      | 'railway',
  ): void {
    if (this.isMuted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const scheduleTone = (
      freq: number,
      startOffset: number,
      dur: number,
      amp: number,
      type: OscillatorType = 'sine',
      endFreq?: number,
    ) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      if (endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + startOffset + dur);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + startOffset);
      g.gain.linearRampToValueAtTime(amp, now + startOffset + Math.min(0.03, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
      osc.connect(g);
      g.connect(this.sfxBus!);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.03);
    };

    const scheduleNoiseBurst = (
      startOffset: number,
      dur: number,
      bpFreq: number,
      q: number,
      amp: number,
    ) => {
      if (!this.whiteNoiseBuffer) return;
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(bpFreq, now + startOffset);
      bp.Q.setValueAtTime(q, now + startOffset);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + startOffset);
      g.gain.linearRampToValueAtTime(amp, now + startOffset + Math.min(0.035, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxBus!);
      src.start(now + startOffset, Math.random() * 1.1, dur + 0.04);
    };

    switch (poiId) {
      case 'railway': {
        // Two-tone ~1900 steam whistle + 6 rhythmic chugging bursts
        scheduleTone(587.3, 0.05, 1.05, 0.055, 'triangle');
        scheduleTone(739.9, 0.08, 1.0, 0.045, 'sine');
        for (let i = 0; i < 6; i++) {
          scheduleNoiseBurst(0.25 + i * 0.42, 0.22, 680 + (i % 2) * 140, 2.2, 0.075);
        }
        break;
      }
      case 'town-hall': {
        // Warm bronze double town-hall clock chime (grounded on open pavement)
        scheduleTone(392.0, 0.08, 1.55, 0.08, 'sine');
        scheduleTone(784.0, 0.08, 0.95, 0.028, 'sine');
        scheduleTone(329.6, 0.85, 1.95, 0.085, 'sine');
        scheduleTone(659.2, 0.85, 1.15, 0.028, 'sine');
        break;
      }
      case 'market': {
        // Warm bustling market crowd murmur swell (no bird sounds)
        scheduleNoiseBurst(0.05, 1.65, 760, 0.9, 0.048);
        scheduleNoiseBurst(1.15, 1.55, 980, 1.0, 0.042);
        scheduleNoiseBurst(2.2, 1.35, 680, 0.95, 0.036);
        break;
      }
      case 'plague-column': {
        // Reverent soft triad bell shimmer + animated pigeon wing flutters
        scheduleTone(523.25, 0.05, 1.7, 0.05, 'sine');
        scheduleTone(659.25, 0.24, 1.6, 0.045, 'sine');
        scheduleTone(783.99, 0.44, 1.8, 0.04, 'sine');
        for (let i = 0; i < 5; i++) {
          scheduleNoiseBurst(0.45 + i * 0.16, 0.12, 1620 + i * 70, 2.4, 0.042);
        }
        break;
      }
      case 'medieval-gate': {
        // Crisp rhythmic watchman footsteps along outer footpath + subtle brass lantern clink
        for (let i = 0; i < 6; i++) {
          scheduleNoiseBurst(0.18 + i * 0.44, 0.065, 480 + (i % 2) * 70, 2.8, 0.05);
        }
        scheduleTone(1460, 0.36, 0.08, 0.042, 'triangle', 1760);
        scheduleTone(1380, 1.68, 0.075, 0.034, 'triangle', 1640);
        break;
      }
      case 'brewery': {
        // Horse-drawn dray hooves + wooden barrel clatter outside brewery gate
        for (let i = 0; i < 7; i++) {
          scheduleNoiseBurst(0.14 + i * 0.34, 0.07, 520 + (i % 2) * 90, 2.8, 0.052);
        }
        scheduleTone(170, 0.38, 0.16, 0.07, 'triangle', 112);
        scheduleTone(155, 0.94, 0.16, 0.06, 'triangle', 102);
        break;
      }
      case 'synsky-pond': {
        // Gentle oar ripples + crisp fish-jump water splashes (zero bird sounds)
        scheduleNoiseBurst(0.15, 0.32, 1080, 2.8, 0.042);
        const splashTimes = [0.72, 1.92, 3.22, 4.32];
        for (const st of splashTimes) {
          scheduleNoiseBurst(st, 0.22, 1420, 2.2, 0.058);
          scheduleTone(460, st + 0.02, 0.12, 0.032, 'sine', 240);
        }
        break;
      }
      case 'st-michael-cemetery': {
        // Soft, distant low bronze church bell toll (respectful & atmospheric)
        scheduleTone(146.83, 0.1, 3.4, 0.085, 'sine'); // D3 fundamental
        scheduleTone(293.66, 0.1, 2.4, 0.04, 'sine');  // D4 octave
        scheduleTone(174.61, 0.1, 2.0, 0.028, 'sine'); // F3 minor tierce
        scheduleTone(146.83, 2.85, 3.2, 0.072, 'sine'); // Second distant toll
        scheduleTone(293.66, 2.85, 2.1, 0.032, 'sine');
        break;
      }
    }
  }

  /** Cleanly stops all schedulers, oscillators, sources, and closes AudioContext */
  public dispose(): void {
    this.stopChurchOrgan();
    if (this.clockIntervalId !== null) {
      window.clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
    if (this.cricketTimeoutId !== null) {
      window.clearTimeout(this.cricketTimeoutId);
      this.cricketTimeoutId = null;
    }
    if (this.creakTimeoutId !== null) {
      window.clearTimeout(this.creakTimeoutId);
      this.creakTimeoutId = null;
    }
    if (this.violinTimeoutId !== null) {
      window.clearTimeout(this.violinTimeoutId);
      this.violinTimeoutId = null;
    }

    try {
      this.windSource?.stop();
      this.windLfo?.stop();
      this.murmurSource?.stop();
      this.murmurLfo?.stop();
    } catch {
      // Ignore already-stopped nodes
    }

    this.windSource?.disconnect();
    this.windBandpass?.disconnect();
    this.windMuffle?.disconnect();
    this.windGain?.disconnect();
    this.windLfo?.disconnect();
    this.windLfoGain?.disconnect();
    this.murmurSource?.disconnect();
    this.murmurGain?.disconnect();
    this.murmurLfo?.disconnect();
    this.murmurLfoGain?.disconnect();
    this.violinBus?.disconnect();
    this.sfxBus?.disconnect();
    this.musicBus?.disconnect();
    this.masterGain?.disconnect();
    this.masterLimiter?.disconnect();

    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }

    this.masterGain = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.masterLimiter = null;
    this.windSource = null;
    this.windBandpass = null;
    this.windMuffle = null;
    this.windGain = null;
    this.windLfo = null;
    this.windLfoGain = null;
    this.murmurSource = null;
    this.murmurGain = null;
    this.murmurLfo = null;
    this.murmurLfoGain = null;
    this.violinBus = null;
    this.whiteNoiseBuffer = null;
  }
}

export const soundEngine = new PolickaSoundEngine();
