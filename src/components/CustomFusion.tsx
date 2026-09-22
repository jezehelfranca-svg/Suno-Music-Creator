import React, { useState, useRef } from 'react';
import { Sparkles, Sliders, RefreshCw, Shuffle, Copy, Check, Volume2, ArrowLeftRight, HelpCircle } from 'lucide-react';
import { GenreCombobox } from './GenreCombobox';
import { PromptCard } from './PromptCard';
import { InstrumentSelector } from './InstrumentSelector';
import { ALL_GENRES } from '../data/genres';
import { TIME_SIGNATURES } from '../data/pools';
import { CATALOGUED_INSTRUMENTS, InstrumentCategory } from '../data/instruments';
import { VariationOptions, GeneratedPrompt, SunoPromptFormat } from '../types';
import { generateSunoPrompt, formatPromptForCopy } from '../utils/sunoFormatter';

interface CustomFusionProps {
  onTestMetronome: (bpm: number, timeSig: string) => void;
  onAiEnhance: (prompt: GeneratedPrompt) => void;
  favorites: GeneratedPrompt[];
  onToggleFavorite: (prompt: GeneratedPrompt) => void;
  initialTemplate?: {
    genre1?: string;
    genre2?: string;
    genre3?: string;
    timeSig?: string;
    bpm?: number;
  } | null;
}

const QUICK_CLASHES = [
  { name: 'Cyberpunk × Celtic', g1: 'Cyber Funk', g2: 'Celtic (Irish & Scottish Folk)', g3: 'Darkwave & Coldwave' },
  { name: 'Shoegaze × Trap', g1: 'Dream Pop & Shoegaze', g2: 'TRAP & DRILL', g3: '' },
  { name: 'Babymetal × Idol', g1: 'J-Metal Idol Fusion', g2: 'POWER METAL', g3: 'ASIAN POP' },
  { name: 'Vaporwave × Metal', g1: 'Vaporwave Metal', g2: 'DOOM METAL', g3: '' },
  { name: 'Flamenco × Trance', g1: 'Trance Flamenco', g2: 'GOA TRANCE & PSYTRANCE', g3: '' },
  { name: 'Math Rock × Goth', g1: 'Math Rock Goth Rock', g2: 'POST-PUNK', g3: '' },
  { name: 'City Pop × Lo-Fi', g1: 'Neo-City Pop', g2: 'Neo-Tokyo Lo-Fi', g3: '' },
  { name: 'Baroque × Glitch', g1: 'ClassicalWave', g2: 'Glitch Hop IDM', g3: '' },
];

export const CustomFusion: React.FC<CustomFusionProps> = ({
  onTestMetronome,
  onAiEnhance,
  favorites,
  onToggleFavorite,
  initialTemplate
}) => {
  const [genre1, setGenre1] = useState(initialTemplate?.genre1 || 'Dream Pop & Shoegaze');
  const [genre2, setGenre2] = useState(initialTemplate?.genre2 || 'TRAP & DRILL');
  const [genre3, setGenre3] = useState(initialTemplate?.genre3 || '');
  const [timeSig, setTimeSig] = useState(initialTemplate?.timeSig || '4/4');
  const [randomizeTime, setRandomizeTime] = useState(false);
  const [minBpm, setMinBpm] = useState(initialTemplate?.bpm ? Math.max(40, initialTemplate.bpm - 15) : 85);
  const [maxBpm, setMaxBpm] = useState(initialTemplate?.bpm ? Math.min(280, initialTemplate.bpm + 15) : 175);
  const [bitrate, setBitrate] = useState('320');
  const [generateCount, setGenerateCount] = useState(3);
  const [allCopied, setAllCopied] = useState(false);

  // Tap-tempo feature
  const tapTimesRef = useRef<number[]>([]);
  const [tappedBpm, setTappedBpm] = useState<number | null>(null);

  const [variations, setVariations] = useState<VariationOptions>({
    rhythm: true,
    harmony: true,
    production: true,
    instruments: true,
    structure: true,
    vocals: true,
    mood: true,
    scene: true,
    usecase: false,
    key: true,
    title: true,
    highlight: true
  });

  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);

  const handleToggleInstrument = (name: string) => {
    setSelectedInstruments(prev =>
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    );
  };

  const handleClearInstruments = () => {
    setSelectedInstruments([]);
  };

  const handleSelectPreset = (instruments: string[]) => {
    setSelectedInstruments(instruments);
  };

  const handleRandomizeInstruments = (count = 3, category?: InstrumentCategory) => {
    let pool = CATALOGUED_INSTRUMENTS;
    if (category && category !== 'All') {
      pool = pool.filter(i => i.category === category);
    }
    const picked: string[] = [];
    const poolNames = pool.map(p => p.name);
    while (picked.length < count && picked.length < poolNames.length) {
      const r = poolNames[Math.floor(Math.random() * poolNames.length)];
      if (!picked.includes(r)) picked.push(r);
    }
    setSelectedInstruments(picked);
  };

  const [results, setResults] = useState<GeneratedPrompt[]>(() => {
    // Generate initial prompt on mount
    const initial = generateSunoPrompt(
      ['Dream Pop & Shoegaze', 'TRAP & DRILL'],
      '4/4',
      85,
      175,
      '320',
      {
        rhythm: true,
        harmony: true,
        production: true,
        instruments: true,
        structure: true,
        vocals: true,
        mood: true,
        scene: true,
        usecase: false,
        key: true,
        title: true,
        highlight: true
      }
    );
    return initial ? [initial] : [];
  });

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    
    // Clear taps if more than 2 seconds since last tap
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      taps.length = 0;
    }

    taps.push(now);
    if (taps.length > 4) taps.shift();

    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calcBpm = Math.round(60000 / avgInterval);
      if (calcBpm >= 40 && calcBpm <= 300) {
        setTappedBpm(calcBpm);
        setMinBpm(Math.max(40, calcBpm - 10));
        setMaxBpm(Math.min(300, calcBpm + 10));
      }
    }
  };

  const swapGenres = () => {
    const temp = genre1;
    setGenre1(genre2);
    setGenre2(temp);
  };

  const rollRandomGenres = (count: 2 | 3) => {
    const picked: string[] = [];
    while (picked.length < count) {
      const g = ALL_GENRES[Math.floor(Math.random() * ALL_GENRES.length)];
      if (!picked.includes(g)) picked.push(g);
    }
    setGenre1(picked[0]);
    setGenre2(picked[1]);
    setGenre3(count === 3 ? picked[2] : '');
  };

  const toggleAllVariations = (state: boolean) => {
    setVariations({
      rhythm: state,
      harmony: state,
      production: state,
      instruments: state,
      structure: state,
      vocals: state,
      mood: state,
      scene: state,
      usecase: state,
      key: state,
      title: state,
      highlight: state
    });
  };

  const handleGenerate = () => {
    if (!genre1.trim() || !genre2.trim()) {
      alert('Please enter at least Genre 1 and Genre 2');
      return;
    }

    const inputGenres = [genre1.trim(), genre2.trim(), genre3.trim()].filter(Boolean);
    const unique = new Set(inputGenres.map(g => g.toLowerCase()));
    if (unique.size !== inputGenres.length) {
      alert('Each genre in the fusion must be unique');
      return;
    }

    const safeMin = Math.min(minBpm, maxBpm);
    const safeMax = Math.max(minBpm, maxBpm);
    const span = safeMax - safeMin;
    const generated: GeneratedPrompt[] = [];
    const seenBodies = new Set<string>();

    for (let i = 0; i < generateCount; i++) {
      const selectedMeter = randomizeTime
        ? TIME_SIGNATURES[Math.floor(Math.random() * TIME_SIGNATURES.length)]
        : timeSig;

      let lo = safeMin;
      let hi = safeMax;
      if (generateCount > 1 && span >= 4) {
        const slice = Math.max(2, Math.floor(span / generateCount));
        lo = safeMin + i * slice;
        hi = Math.min(safeMax, lo + slice);
      }

      let promptObj: GeneratedPrompt | null = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidate = generateSunoPrompt(
          inputGenres,
          selectedMeter,
          lo,
          hi,
          bitrate,
          variations,
          Math.random,
          selectedInstruments.length > 0 ? selectedInstruments : undefined
        );
        if (!candidate) break;
        if (!seenBodies.has(candidate.fullPrompt)) {
          seenBodies.add(candidate.fullPrompt);
          promptObj = candidate;
          break;
        }
        promptObj = candidate;
      }

      if (promptObj) {
        generated.push(promptObj);
      }
    }

    setResults(generated);
  };

  const handleCopyAll = (format: SunoPromptFormat = 'suno-tag') => {
    if (results.length === 0) return;
    const combined = results.map(r => formatPromptForCopy(r, format)).join('\n\n');
    navigator.clipboard.writeText(combined);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Description & Quick Clashes */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-violet-400" />
              <span>Custom Suno Fusion Architect</span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Select 2 to 3 genres from the 374 pool, tune meter, tempo &amp; style tags, and synthesize production-ready Suno prompts.
            </p>
          </div>

          {/* Quick randomizers */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => rollRandomGenres(2)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700/60"
            >
              <Shuffle className="w-3.5 h-3.5 text-violet-400" />
              <span>Random Pair</span>
            </button>
            <button
              type="button"
              onClick={() => rollRandomGenres(3)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700/60"
            >
              <Shuffle className="w-3.5 h-3.5 text-amber-400" />
              <span>Random Trio</span>
            </button>
            <button
              type="button"
              onClick={swapGenres}
              title="Swap Genre 1 and Genre 2"
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700/60"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick Clash Preset Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-zinc-500 font-medium whitespace-nowrap mr-1">Trending:</span>
          {QUICK_CLASHES.map(clash => (
            <button
              key={clash.name}
              type="button"
              onClick={() => {
                setGenre1(clash.g1);
                setGenre2(clash.g2);
                setGenre3(clash.g3);
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-violet-950/60 text-zinc-300 hover:text-violet-300 border border-zinc-700/60 hover:border-violet-600/40 transition-all whitespace-nowrap"
            >
              {clash.name}
            </button>
          ))}
        </div>
      </div>

      {/* Genre Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <GenreCombobox
          id="genreInput1"
          label="Primary Genre A"
          required
          value={genre1}
          onChange={setGenre1}
          placeholder="e.g. Dream Pop & Shoegaze"
        />
        <GenreCombobox
          id="genreInput2"
          label="Secondary Genre B"
          required
          value={genre2}
          onChange={setGenre2}
          placeholder="e.g. TRAP & DRILL"
        />
        <GenreCombobox
          id="genreInput3"
          label="Tertiary Genre C (Optional)"
          value={genre3}
          onChange={setGenre3}
          placeholder="e.g. Darkwave & Coldwave"
        />
      </div>

      {/* Rhythmic & Acoustic Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        {/* Time Signature */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-300">Time Signature</label>
            <label className="flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeTime}
                onChange={(e) => setRandomizeTime(e.target.checked)}
                className="rounded text-violet-600 focus:ring-0 bg-zinc-800 border-zinc-700"
              />
              <span>Randomize</span>
            </label>
          </div>
          <select
            value={timeSig}
            onChange={(e) => setTimeSig(e.target.value)}
            disabled={randomizeTime}
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
          >
            {TIME_SIGNATURES.map(ts => (
              <option key={ts} value={ts}>{ts}</option>
            ))}
          </select>
        </div>

        {/* BPM Range + Tap Tempo */}
        <div className="sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-300">
              Tempo: <span className="text-amber-400 font-mono">{minBpm} – {maxBpm} BPM</span>
            </label>
            <button
              type="button"
              onClick={handleTapTempo}
              className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-violet-300 border border-violet-500/30 font-mono transition-colors active:scale-95"
            >
              👆 Tap Tempo {tappedBpm ? `(${tappedBpm})` : ''}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                type="number"
                min="40"
                max="300"
                value={minBpm}
                onChange={(e) => setMinBpm(parseInt(e.target.value, 10) || 40)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-sm text-zinc-200"
                placeholder="Min BPM"
              />
            </div>
            <div>
              <input
                type="number"
                min="40"
                max="300"
                value={maxBpm}
                onChange={(e) => setMaxBpm(parseInt(e.target.value, 10) || 180)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-sm text-zinc-200"
                placeholder="Max BPM"
              />
            </div>
          </div>
        </div>

        {/* Bitrate & Prompt Count */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-300">Batch Variations</label>
            <span className="text-[11px] font-mono text-zinc-400">{generateCount} prompts</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="1"
              max="20"
              value={generateCount}
              onChange={(e) => setGenerateCount(parseInt(e.target.value, 10))}
              className="w-full accent-violet-500"
            />
          </div>
        </div>
      </div>

      {/* Exact Instrument & VST Patch Selection */}
      <InstrumentSelector
        selectedInstruments={selectedInstruments}
        onToggleInstrument={handleToggleInstrument}
        onClearInstruments={handleClearInstruments}
        onSelectPreset={handleSelectPreset}
        onRandomizeInstruments={handleRandomizeInstruments}
      />

      {/* Variation Toggles Panel */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Prompt Detail &amp; Descriptors:
            </span>
            <span className="text-xs text-zinc-500">
              (Checked elements are integrated into the prompt)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleAllVariations(true)}
              className="text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => toggleAllVariations(false)}
              className="text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              None
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
          {[
            { id: 'rhythm', label: 'Rhythm & Groove' },
            { id: 'harmony', label: 'Harmonic Flow' },
            { id: 'instruments', label: 'Instrumentation' },
            { id: 'production', label: 'Mix & Production' },
            { id: 'structure', label: 'Song Arc' },
            { id: 'vocals', label: 'Vocal Styling' },
            { id: 'mood', label: 'Emotional Mood' },
            { id: 'scene', label: 'Scene & Setting' },
            { id: 'usecase', label: 'Intended Use' },
            { id: 'key', label: 'Musical Key' },
            { id: 'title', label: 'Track Title' },
            { id: 'highlight', label: 'Highlight Element' }
          ].map(opt => (
            <label
              key={opt.id}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all select-none ${
                variations[opt.id as keyof VariationOptions]
                  ? 'bg-violet-950/40 border-violet-700/50 text-violet-200'
                  : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <input
                type="checkbox"
                checked={variations[opt.id as keyof VariationOptions]}
                onChange={(e) => setVariations({ ...variations, [opt.id]: e.target.checked })}
                className="rounded text-violet-600 focus:ring-0 bg-zinc-800 border-zinc-700"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Main Action Trigger */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleGenerate}
          className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/30 transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Generate {generateCount} Fusion {generateCount === 1 ? 'Prompt' : 'Prompts'}</span>
        </button>

        {results.length > 0 && (
          <button
            type="button"
            onClick={() => handleCopyAll('suno-tag')}
            className="flex items-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition-all cursor-pointer"
          >
            {allCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{allCopied ? 'Copied All!' : 'Copy All Suno Tags'}</span>
          </button>
        )}
      </div>

      {/* Generated Results Grid */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 text-xs text-zinc-400">
            <span>
              Generated <strong className="text-zinc-200">{results.length}</strong> prompts for{' '}
              <strong className="text-violet-400">{[genre1, genre2, genre3].filter(Boolean).join(' × ')}</strong>
            </span>
            <span className="font-mono text-zinc-500">Ready to paste in Suno AI</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((prompt) => {
              const isFav = favorites.some(f => f.id === prompt.id || f.fullPrompt === prompt.fullPrompt);
              return (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isFavorite={isFav}
                  onToggleFavorite={onToggleFavorite}
                  onTestMetronome={onTestMetronome}
                  onAiEnhance={onAiEnhance}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
