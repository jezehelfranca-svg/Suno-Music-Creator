class AudioMetronome {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private timerId: number | null = null;
  private bpm: number = 120;
  private beatsPerBar: number = 4;
  private currentBeat: number = 0;
  private onBeatCallback?: (beat: number, totalBeats: number) => void;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setBpm(bpm: number) {
    this.bpm = Math.max(30, Math.min(320, bpm));
  }

  public setTimeSignature(timeSignatureStr: string) {
    const match = timeSignatureStr.match(/^(\d+)\//);
    if (match) {
      this.beatsPerBar = parseInt(match[1], 10) || 4;
      if (this.beatsPerBar < 1 || this.beatsPerBar > 16) {
        this.beatsPerBar = 4;
      }
    } else {
      this.beatsPerBar = 4;
    }
  }

  public setParams(bpm: number, timeSignatureStr: string) {
    this.setBpm(bpm);
    this.setTimeSignature(timeSignatureStr);
  }

  public setOnBeat(onBeat?: (beat: number, totalBeats: number) => void) {
    this.onBeatCallback = onBeat;
  }

  public getBeatCount(): number {
    return this.beatsPerBar;
  }

  public start(bpm?: number, timeSignatureStr?: string, onBeat?: (beat: number, totalBeats: number) => void) {
    this.initContext();
    this.stop();
    if (bpm !== undefined) this.setBpm(bpm);
    if (timeSignatureStr !== undefined) this.setTimeSignature(timeSignatureStr);
    if (onBeat !== undefined) this.onBeatCallback = onBeat;
    
    this.isPlaying = true;
    this.currentBeat = 0;

    const tick = () => {
      if (!this.isPlaying || !this.ctx) return;
      
      const isAccent = this.currentBeat === 0;
      this.playClick(isAccent);
      
      if (this.onBeatCallback) {
        this.onBeatCallback(this.currentBeat, this.beatsPerBar);
      }

      this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar;
      const intervalMs = (60 / this.bpm) * 1000;
      this.timerId = window.setTimeout(tick, intervalMs);
    };

    tick();
  }

  private playClick(isAccent: boolean) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isAccent ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isAccent ? 1200 : 750, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(isAccent ? 0.35 : 0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioMetronome = new AudioMetronome();
export function getAudioMetronome(): AudioMetronome {
  return audioMetronome;
}
