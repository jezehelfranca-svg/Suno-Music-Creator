import React, { useEffect, useRef, useMemo } from 'react';
import { Volume2, VolumeX, Activity } from 'lucide-react';

interface WaveformPulseVisualizerProps {
  isPlaying: boolean;
  bpm: number;
  meter: string;
  currentBeat: number;
  totalBeats: number;
  onTogglePlay: () => void;
}

export const WaveformPulseVisualizer: React.FC<WaveformPulseVisualizerProps> = ({
  isPlaying,
  bpm,
  meter,
  currentBeat,
  totalBeats,
  onTogglePlay
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastBeatTimeRef = useRef<number>(performance.now());
  const prevBeatRef = useRef<number>(currentBeat);
  const impulseRef = useRef<number>(0);
  const isAccentRef = useRef<boolean>(false);

  // Determine musical tempo marking
  const tempoMarking = useMemo(() => {
    if (bpm < 60) return 'Largo';
    if (bpm < 76) return 'Adagio';
    if (bpm < 108) return 'Andante';
    if (bpm < 128) return 'Moderato';
    if (bpm < 156) return 'Allegro';
    if (bpm < 176) return 'Vivace';
    return 'Presto';
  }, [bpm]);

  // Track beat changes to trigger shockwave impulse
  useEffect(() => {
    if (isPlaying) {
      lastBeatTimeRef.current = performance.now();
      impulseRef.current = 1.0;
      isAccentRef.current = currentBeat === 0;
      prevBeatRef.current = currentBeat;
    }
  }, [currentBeat, isPlaying]);

  // High-performance canvas waveform animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;
    const width = 112;
    const height = 34;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const numBars = 16;
    const barWidth = 3;
    const gap = 3.5;
    const startX = (width - (numBars * barWidth + (numBars - 1) * gap)) / 2;
    const centerY = height / 2;

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const beatDurationMs = (60 / Math.max(30, bpm)) * 1000;
      const elapsedSinceBeat = time - lastBeatTimeRef.current;
      const beatProgress = Math.min(1, Math.max(0, elapsedSinceBeat / beatDurationMs));

      // Decay impulse smoothly
      impulseRef.current *= 0.94;
      const energy = impulseRef.current;
      const isAccent = isAccentRef.current;

      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + gap);
        const distFromCenter = Math.abs(i - (numBars - 1) / 2);
        const centerFactor = 1 - distFromCenter / (numBars / 2);

        let barHeight = 4;

        if (isPlaying) {
          // Wave phase calculation based on BPM frequency
          const wavePhase = (time / beatDurationMs) * Math.PI * 2;
          const spatialOffset = (i / numBars) * Math.PI * 3;
          const sineMod = (Math.sin(wavePhase + spatialOffset) + 1) / 2;

          // Shockwave ripple radiating outward from center upon each beat
          const rippleDelay = distFromCenter * 35;
          const rippleTime = Math.max(0, elapsedSinceBeat - rippleDelay);
          const rippleDecay = Math.max(0, 1 - rippleTime / (beatDurationMs * 0.7));
          const rippleImpulse = Math.sin(rippleTime * 0.03) * rippleDecay * (isAccent ? 1.4 : 1.0);

          const baseAmp = 5 + centerFactor * 10;
          const dynamicAmp = (energy * 14 + rippleImpulse * 8) * (centerFactor * 0.6 + 0.4);
          barHeight = Math.max(3, Math.min(height - 4, baseAmp * sineMod + dynamicAmp));
        } else {
          // Resting baseline pulse: gentle breathing wave previewing the tempo
          const idlePhase = (time / beatDurationMs) * Math.PI * 1.5;
          const idleWave = (Math.sin(idlePhase + i * 0.35) + 1) / 2;
          barHeight = 4 + centerFactor * 5 * idleWave;
        }

        const y = centerY - barHeight / 2;

        // Color grading: Golden amber for downbeat/accent, cyan-violet for groove beats, muted zinc for idle
        let gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        if (isPlaying) {
          if (isAccent && energy > 0.3) {
            gradient.addColorStop(0, '#fde68a'); // amber-200
            gradient.addColorStop(0.5, '#f59e0b'); // amber-500
            gradient.addColorStop(1, '#b45309'); // amber-700
          } else {
            gradient.addColorStop(0, '#a78bfa'); // violet-400
            gradient.addColorStop(0.5, '#8b5cf6'); // violet-500
            gradient.addColorStop(1, '#06b6d4'); // cyan-500
          }
        } else {
          gradient.addColorStop(0, '#71717a'); // zinc-500
          gradient.addColorStop(1, '#3f3f46'); // zinc-700
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1.5);
        ctx.fill();

        // Subtle glow peak cap on downbeat
        if (isPlaying && isAccent && energy > 0.4 && centerFactor > 0.5) {
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 6;
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y - 1, barWidth, 1.5);
          ctx.shadowBlur = 0;
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, bpm]);

  return (
    <div
      className={`group relative flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-all shadow-sm select-none ${
        isPlaying
          ? 'bg-zinc-900/90 border-violet-500/40 shadow-violet-950/40 ring-1 ring-violet-500/20'
          : 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      {/* Play/Stop Audio Button with Real-Time Pulse Ring */}
      <button
        type="button"
        onClick={onTogglePlay}
        title={isPlaying ? 'Stop groove metronome' : `Audition ${bpm} BPM groove metronome`}
        className={`relative p-2 rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0 ${
          isPlaying
            ? currentBeat === 0
              ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/30 scale-105'
              : 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
        }`}
      >
        {isPlaying ? (
          <VolumeX className="w-3.5 h-3.5" />
        ) : (
          <Volume2 className="w-3.5 h-3.5" />
        )}

        {/* Dynamic Beat Ripple Ring */}
        {isPlaying && (
          <span
            className={`absolute inset-0 rounded-lg pointer-events-none animate-ping opacity-60 ${
              currentBeat === 0 ? 'bg-amber-400' : 'bg-violet-400'
            }`}
            style={{ animationDuration: `${(60 / bpm) * 1000}ms`, animationIterationCount: 'infinite' }}
          />
        )}
      </button>

      {/* Numerical Tempo & Meter Readout */}
      <div className="flex flex-col justify-center min-w-[72px]">
        <div className="flex items-center gap-1.5 text-xs font-mono font-semibold">
          <span className={isPlaying ? (currentBeat === 0 ? 'text-amber-300' : 'text-zinc-100') : 'text-zinc-200'}>
            {bpm}
          </span>
          <span className="text-[10px] text-zinc-500 font-normal">BPM</span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400 text-[11px]">{meter}</span>
        </div>

        {/* Tempo Marking & Active Status */}
        <div className="flex items-center gap-1 text-[10px] font-mono leading-none mt-0.5">
          <span
            className={`transition-colors ${
              isPlaying
                ? currentBeat === 0
                  ? 'text-amber-400 font-semibold'
                  : 'text-violet-400 font-medium'
                : 'text-zinc-500'
            }`}
          >
            {tempoMarking}
          </span>
          {isPlaying && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-[9px] text-emerald-400 font-medium">LIVE</span>
            </>
          )}
        </div>
      </div>

      {/* Reactive Visual Waveform Canvas */}
      <div
        className="relative cursor-pointer flex items-center"
        onClick={onTogglePlay}
        title={isPlaying ? 'Click waveform to pause' : `Click waveform to play ${bpm} BPM groove`}
      >
        <canvas
          ref={canvasRef}
          style={{ width: 112, height: 34 }}
          className="block"
        />

        {/* Ambient glow behind waveform when active */}
        {isPlaying && (
          <div
            className={`absolute inset-0 blur-md pointer-events-none transition-opacity duration-150 ${
              currentBeat === 0
                ? 'bg-amber-500/20 opacity-100'
                : 'bg-violet-600/15 opacity-60'
            }`}
          />
        )}
      </div>

      {/* Beat Position Stepper Indicator */}
      <div className="flex flex-col justify-center gap-1 pl-1 border-l border-zinc-800/80">
        <div className="flex gap-1 items-center">
          {Array.from({ length: Math.min(8, totalBeats) }).map((_, i) => {
            const isCurrent = isPlaying && i === currentBeat;
            const isAccent = i === 0;

            return (
              <span
                key={i}
                className={`h-2.5 w-1.5 rounded-sm transition-all duration-75 ${
                  isCurrent
                    ? isAccent
                      ? 'bg-amber-400 shadow-sm shadow-amber-400/80 scale-125'
                      : 'bg-violet-400 shadow-sm shadow-violet-400/80 scale-110'
                    : isPlaying
                    ? 'bg-zinc-800'
                    : 'bg-zinc-800/60'
                }`}
                title={`Beat ${i + 1} of ${totalBeats}`}
              />
            );
          })}
        </div>
        <span className="text-[9px] font-mono text-zinc-500 leading-none text-right">
          {isPlaying ? `${currentBeat + 1}/${totalBeats}` : 'GROOVE'}
        </span>
      </div>
    </div>
  );
};
