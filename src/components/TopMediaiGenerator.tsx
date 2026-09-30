import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  Music,
  Mic2,
  Radio,
  Sliders,
  Play,
  Pause,
  Download,
  FileText,
  RefreshCw,
  Zap,
  Check,
  Disc3,
  Flame,
  Volume2,
  Share2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { TopMediaiTrack, TopMediaiConfig, TopMediaiPrefillData } from '../types';
import CREATIONS_DATA from '../data/creations.json';
import { Search, X, BookOpen } from 'lucide-react';

interface TopMediaiGeneratorProps {
  onGenerated: (track: TopMediaiTrack) => void;
  config: TopMediaiConfig;
  onOpenKeyModal: () => void;
  currentPlayingTrack: TopMediaiTrack | null;
  isPlaying: boolean;
  onTogglePlayTrack: (track: TopMediaiTrack) => void;
  onOpenLyrics: (track: TopMediaiTrack) => void;
  onSendToPromptLab?: (style: string, bpm?: number, key?: string) => void;
  prefilledPrompt?: TopMediaiPrefillData | null;
  onClearPrefill?: () => void;
}

const STYLE_PRESETS = [
  {
    name: 'Cyberpunk Synthwave',
    prompt: 'Darksynth, Cyberpunk, 128 BPM, analog arpeggios, vocoder vocals, heavy 808 sub bass, retro-futuristic soundstage',
    bpm: 128,
    key: 'A Minor',
    icon: '⚡',
  },
  {
    name: 'Lo-Fi Midnight Chill',
    prompt: 'Lo-Fi Chillhop, 82 BPM, dusty vinyl crackle, warm Rhodes piano, laidback acoustic drums, nostalgic melancholic mood',
    bpm: 82,
    key: 'E Flat Major',
    icon: '☕',
  },
  {
    name: 'Melodic Tech House',
    prompt: 'Tech House, Melodic Techno, 126 BPM, driving four-on-the-floor kick, rolling sub bass, hypnotic synth stabs',
    bpm: 126,
    key: 'F Minor',
    icon: '🎛️',
  },
  {
    name: 'Anthemic Dark Trap',
    prompt: 'Trap & Drill, 140 BPM, rattling triplet hi-hats, cavernous 808 glide, cinematic brass stabs, aggressive dark vibe',
    bpm: 140,
    key: 'C Minor',
    icon: '🔥',
  },
  {
    name: 'Dream Pop Ethereal',
    prompt: 'Dream Pop, Shoegaze, 96 BPM, reverb-drenched guitars, ethereal breathy female vocals, lush analog synth pads',
    bpm: 96,
    key: 'D Major',
    icon: '✨',
  },
  {
    name: 'Modern Alternative Rock',
    prompt: 'Alternative Rock, 135 BPM, crunchy overdriven electric guitars, dynamic live drum fills, raw energetic vocal delivery',
    bpm: 135,
    key: 'E Minor',
    icon: '🎸',
  },
  {
    name: 'Japanese City Pop',
    prompt: 'Neo-City Pop, Funk Disco, 112 BPM, slap bass, sparkling Rhodes, tight horn section, bright 80s anime aesthetics',
    bpm: 112,
    key: 'B Minor',
    icon: '🌸',
  },
  {
    name: 'Celtic Cinematic Folk',
    prompt: 'Celtic Folk, Epic Cinematic, 108 BPM, uilleann pipes, tin whistle, bodhrán percussion, haunting choral vocal harmonies',
    bpm: 108,
    key: 'D Minor',
    icon: '🛡️',
  },
];

const RANDOM_PROMPT_IDEAS = [
  'Futuristic neon highway chase with heavy analog synths and aggressive percussion at 134 BPM',
  'Warm summer evening rooftop party with groovy French house basslines and soulful vocal hooks',
  'Misty Scandinavian forest journey with acoustic 12-string guitar, subtle cello, and ambient river sounds',
  'Underwater bioluminescent metropolis with deep sub bass drops and sparkling crystalline arpeggios',
  'Rain-soaked Shibuya midnight street with melancholic jazz saxophone and lo-fi hip hop drum breaks',
  'Epic orchestral metal battle anthem with fast double-kick drums and heroic brass section',
];

export const TopMediaiGenerator: React.FC<TopMediaiGeneratorProps> = ({
  onGenerated,
  config,
  onOpenKeyModal,
  currentPlayingTrack,
  isPlaying,
  onTogglePlayTrack,
  onOpenLyrics,
  onSendToPromptLab,
  prefilledPrompt,
  onClearPrefill,
}) => {
  // Mode: 1 = Auto / Prompt Mode, 0 = Custom Lyrics Mode
  const [mode, setMode] = useState<1 | 0>(1);

  // Form State
  const [prompt, setPrompt] = useState(
    'Cyberpunk Synthwave, 128 BPM, analog arpeggios, vocoder vocals, heavy 808 sub bass, retro-futuristic soundstage'
  );
  const [customLyrics, setCustomLyrics] = useState(
    `[Intro: Atmospheric Build]\n(Pulsing analog arpeggio cuts through digital rain)\n\n[Verse 1]\nStreets of chrome in ultraviolet haze\nElectric shadows in the neon maze\nLost in frequencies of steel and light\nChasing the signals of the velvet night\n\n[Chorus: Vocoder Leads]\nRise above the grid!\nBreak through what they hid!\nWe are the rhythm of the cyber sky\nNeon pulses that will never die!\n\n[Outro: Fade Out]\nDigital echoes into twilight...`
  );
  const [title, setTitle] = useState('Neon Horizon');
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [bpm, setBpm] = useState(128);
  const [keySignature, setKeySignature] = useState('A Minor');

  // Generation status state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI Lyrics Writer state
  const [isWritingLyrics, setIsWritingLyrics] = useState(false);
  const [lyricTopic, setLyricTopic] = useState('neon dreams in a cyber city');

  // Suno Creations Database browser state (1,447 created bands)
  const [isCreationsModalOpen, setIsCreationsModalOpen] = useState(false);
  const [creationsSearch, setCreationsSearch] = useState('');
  const [creationsCategory, setCreationsCategory] = useState('All');

  // Handle incoming prefill from Suno generators
  React.useEffect(() => {
    if (prefilledPrompt) {
      if (prefilledPrompt.prompt) setPrompt(prefilledPrompt.prompt);
      if (prefilledPrompt.title) setTitle(prefilledPrompt.title);
      if (prefilledPrompt.bpm) setBpm(prefilledPrompt.bpm);
      if (prefilledPrompt.key) setKeySignature(prefilledPrompt.key);
      if (typeof prefilledPrompt.isInstrumental === 'boolean') {
        setIsInstrumental(prefilledPrompt.isInstrumental);
      }
      if (prefilledPrompt.lyrics && prefilledPrompt.lyrics.trim().length > 0) {
        setCustomLyrics(prefilledPrompt.lyrics);
      }
    }
  }, [prefilledPrompt]);

  // Latest generated track inside the studio
  const [latestTrack, setLatestTrack] = useState<TopMediaiTrack | null>(null);

  const handleSelectPreset = (preset: typeof STYLE_PRESETS[0]) => {
    setPrompt(preset.prompt);
    setTitle(preset.name);
    setBpm(preset.bpm);
    setKeySignature(preset.key);
  };

  const handleRandomPrompt = () => {
    const picked = RANDOM_PROMPT_IDEAS[Math.floor(Math.random() * RANDOM_PROMPT_IDEAS.length)];
    setPrompt(picked);
    setTitle(picked.split(' ').slice(0, 3).join(' '));
  };

  const handleInsertMetatag = (tag: string) => {
    setCustomLyrics((prev) => `${prev}\n\n${tag}\n`);
  };

  // Generate AI Lyrics via /api/topmediai/lyrics
  const handleGenerateLyrics = async () => {
    setIsWritingLyrics(true);
    try {
      const res = await fetch('/api/topmediai/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: lyricTopic,
          style: prompt,
          userApiKey: config.apiKey,
        }),
      });

      const data = await res.json();
      if (data.success && data.lyrics) {
        setCustomLyrics(data.lyrics);
        if (data.title && !title) setTitle(data.title);
      }
    } catch (e) {
      console.warn('Lyrics generation error:', e);
    } finally {
      setIsWritingLyrics(false);
    }
  };

  // Generate Music via /api/topmediai/generate (v1-generate-music)
  const handleGenerateMusic = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    setGenerationProgress(10);
    setGenerationStep('Initializing sound parameters...');

    const timer1 = setTimeout(() => {
      setGenerationProgress(35);
      setGenerationStep('Calling TopMediai AI Music Generator (POST /v1/music)...');
    }, 400);

    const timer2 = setTimeout(() => {
      setGenerationProgress(70);
      setGenerationStep('Synthesizing vocals, harmonies & master stems...');
    }, 900);

    try {
      const res = await fetch('/api/topmediai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          lyrics: mode === 0 ? customLyrics.trim() : (isInstrumental ? '' : customLyrics.trim()),
          title: title.trim() || 'TopMediai Track',
          is_auto: mode,
          instrumental: isInstrumental ? 1 : 0,
          userApiKey: config.apiKey,
          bpm,
          key: keySignature,
        }),
      });

      const data = await res.json();

      setGenerationProgress(100);
      setGenerationStep('Mastering audio stream completed!');

      if (data.success && data.track) {
        setLatestTrack(data.track);
        onGenerated(data.track);
        if (data.raw?.status === 400015) {
          setErrorMsg("⚠️ TopMediai Notice: Insufficient account balance (0 credits). TopMediai returned code 400015. Please top up credits at docs.topmediai.com, or continue testing with studio previews.");
        }
      } else {
        setErrorMsg(data.error || 'Music generation failed. Please try again.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error communicating with generator endpoint.');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Header Card */}
      <div className="bg-gradient-to-r from-violet-950/80 via-zinc-900 to-indigo-950/80 border border-violet-500/30 rounded-3xl p-5 sm:p-7 shadow-xl shadow-violet-950/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>TopMediai v1 Music API</span>
              </span>

              {config.isConnected && config.apiKey ? (
                <button
                  onClick={onOpenKeyModal}
                  className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                >
                  🟢 Live API Active
                </button>
              ) : (
                <button
                  onClick={onOpenKeyModal}
                  className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>🟡 Preview Mode</span>
                  <span className="underline decoration-dotted ml-1">Add Key</span>
                </button>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              TopMediai AI Music Studio
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-2xl leading-relaxed">
              Create studio-grade songs with AI. Choose{' '}
              <strong className="text-violet-300">Auto Mode (is_auto: 1)</strong> for instant prompt-driven production, or{' '}
              <strong className="text-pink-300">Custom Mode (is_auto: 0)</strong> to direct custom lyrics and structural metatags.
            </p>
          </div>

          {/* Quick Stats or Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={onOpenKeyModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700 transition-colors"
            >
              <Sliders className="w-4 h-4 text-violet-400" />
              <span>API Settings</span>
            </button>

            <a
              href="https://docs.topmediai.com/api-reference/ai-music-generator/v1-generate-music"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <span>API Docs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Active Suno Prompt Loaded Banner */}
      {prefilledPrompt && (
        <div className="bg-gradient-to-r from-amber-500/15 via-violet-600/20 to-pink-500/15 border border-amber-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xl animate-in fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold shrink-0 text-base">
              ⚡
            </span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-2 truncate">
                <span>Filled from {prefilledPrompt.source || 'Suno Prompt Lab'}:</span>
                <span className="text-white underline decoration-amber-400 font-semibold">{prefilledPrompt.title || 'Created Prompt'}</span>
                {prefilledPrompt.bpm && (
                  <span className="font-mono text-[10px] text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
                    {prefilledPrompt.bpm} BPM
                  </span>
                )}
                {prefilledPrompt.key && (
                  <span className="font-mono text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                    {prefilledPrompt.key}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-300 truncate mt-0.5">
                All parameters filled into TopMediai form below. Click "Generate Music with TopMediai" to render audio!
              </p>
            </div>
          </div>
          {onClearPrefill && (
            <button
              type="button"
              onClick={onClearPrefill}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Main Studio Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Generator Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMode(1)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mode === 1
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Auto Generation (is_auto: 1)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode(0)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mode === 0
                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-900/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Mic2 className="w-4 h-4 text-pink-300" />
              <span>Custom Lyrics (is_auto: 0)</span>
            </button>
          </div>

          {/* Form Box */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
            {/* Song Title & Instrumental Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Track Title:
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Neon Sunset"
                  className="w-full bg-zinc-950 border border-zinc-700/80 focus:border-violet-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Vocals:
                </label>
                <button
                  type="button"
                  onClick={() => setIsInstrumental(!isInstrumental)}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isInstrumental
                      ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 shadow-sm'
                      : 'bg-indigo-950/40 border-indigo-500/60 text-indigo-300 shadow-sm'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>{isInstrumental ? 'Instrumental Only' : 'Include Vocals'}</span>
                </button>
              </div>
            </div>

            {/* Prompt Mode View (is_auto: 1) */}
            {mode === 1 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Style of Music &amp; Prompt (TopMediai Prompt):
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreationsModalOpen(true)}
                      className="text-xs text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors"
                      title={`Browse ${CREATIONS_DATA.length.toLocaleString()} created Suno AI band and fusion prompts`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Browse {CREATIONS_DATA.length.toLocaleString()} Suno Creations</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRandomPrompt}
                      className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Surprise Prompt</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe genres, mood, instrumentation, tempo, and vocal characteristics..."
                  className="w-full bg-zinc-950 border border-zinc-700/80 focus:border-violet-500 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none font-sans"
                />

                {/* Quick Genre Chips */}
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
                    Instant Style Recipes:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handleSelectPreset(p)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-violet-500/50 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>{p.icon}</span>
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Custom Mode View (is_auto: 0) */}
            {mode === 0 && (
              <div className="space-y-3">
                {/* AI Lyrics Generator Assistant Bar */}
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={lyricTopic}
                      onChange={(e) => setLyricTopic(e.target.value)}
                      placeholder="Topic: e.g. midnight motorcycle drive through neon rain"
                      className="w-full bg-transparent text-xs text-white placeholder-zinc-500 border-0 focus:ring-0 p-1"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateLyrics}
                    disabled={isWritingLyrics}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isWritingLyrics ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>{isWritingLyrics ? 'Writing...' : 'Write AI Lyrics'}</span>
                  </button>
                </div>

                {/* Lyrics Structure Tag Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-zinc-400">Add Tags:</span>
                  {[
                    '[Intro]',
                    '[Verse 1]',
                    '[Pre-Chorus]',
                    '[Chorus]',
                    '[Verse 2]',
                    '[Bridge]',
                    '[Drop]',
                    '[Outro]',
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleInsertMetatag(tag)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 hover:bg-violet-900/40 text-violet-300 border border-zinc-700 hover:border-violet-500 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* Lyrics Editor */}
                <textarea
                  rows={8}
                  value={customLyrics}
                  onChange={(e) => setCustomLyrics(e.target.value)}
                  placeholder="[Verse 1]&#10;Write your verses here...&#10;&#10;[Chorus]&#10;Catchy explosive chorus..."
                  className="w-full bg-zinc-950 border border-zinc-700/80 focus:border-pink-500 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-pink-500 font-mono leading-relaxed"
                />

                {/* Style Tags for Custom Mode */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Musical Style &amp; Genre Guidance:
                  </label>
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Female vocals, 120 BPM, punchy 808s, acoustic rhythm guitar"
                    className="w-full bg-zinc-950 border border-zinc-700/80 focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Tempo (BPM) & Key Signature Controls */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800/80">
              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-1">
                  <span>Tempo (BPM):</span>
                  <span className="text-violet-400 font-mono">{bpm} BPM</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={200}
                  step={1}
                  value={bpm}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Key Signature:
                </label>
                <select
                  value={keySignature}
                  onChange={(e) => setKeySignature(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="A Minor">A Minor (Melancholic / Dark)</option>
                  <option value="C Major">C Major (Bright / Euphoric)</option>
                  <option value="D Minor">D Minor (Cinematic / Epic)</option>
                  <option value="E Minor">E Minor (Driving / Rock)</option>
                  <option value="F Minor">F Minor (Heavy / Club)</option>
                  <option value="G Major">G Major (Uplifting / Summer)</option>
                  <option value="E Flat Major">E Flat Major (Warm / Soulful)</option>
                  <option value="B Minor">B Minor (City Pop / Groove)</option>
                </select>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs">
                {errorMsg}
              </div>
            )}

            {/* Big Glow Action Button */}
            <button
              type="button"
              onClick={handleGenerateMusic}
              disabled={isGenerating}
              className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm sm:text-base text-white shadow-2xl transition-all flex items-center justify-center gap-3 cursor-pointer ${
                isGenerating
                  ? 'bg-zinc-800 opacity-80 cursor-wait'
                  : mode === 1
                  ? 'bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-900/50 hover:scale-[1.01] active:scale-98'
                  : 'bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-900/50 hover:scale-[1.01] active:scale-98'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-300" />
                  <span>Synthesizing Audio via TopMediai...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
                  <span>Generate Music with TopMediai (v1/music)</span>
                </>
              )}
            </button>

            {/* Generation Progress Ticker */}
            {isGenerating && (
              <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                  <div
                    className="bg-gradient-to-r from-violet-500 via-pink-500 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                    <span>{generationStep}</span>
                  </span>
                  <span className="font-mono">{generationProgress}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Latest Track Showcase & Studio Monitor (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {latestTrack ? (
            /* Latest Generated Track Card */
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-violet-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Master Ready</span>
                </span>
                <span className="text-[11px] font-mono text-zinc-500">
                  UUID: {latestTrack.item_uuid.slice(0, 12)}...
                </span>
              </div>

              {/* Cover Art Artwork */}
              <div className="relative group w-full aspect-video sm:aspect-square rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-xl">
                {latestTrack.image_file ? (
                  <img
                    src={latestTrack.image_file}
                    alt={latestTrack.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-violet-950 to-indigo-950">
                    <Disc3 className="w-16 h-16 text-violet-400 animate-spin" />
                  </div>
                )}

                {/* Floating Big Play Button */}
                <button
                  type="button"
                  onClick={() => onTogglePlayTrack(latestTrack)}
                  className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-violet-600/90 hover:bg-violet-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform active:scale-90 hover:scale-110 cursor-pointer"
                >
                  {currentPlayingTrack?.item_uuid === latestTrack.item_uuid && isPlaying ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8 ml-1" />
                  )}
                </button>
              </div>

              {/* Track Metadata */}
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{latestTrack.title}</span>
                  {latestTrack.demoMode && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Preview
                    </span>
                  )}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                  {latestTrack.prompt}
                </p>
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mt-2">
                  <span>{latestTrack.bpm || bpm} BPM</span>
                  <span>•</span>
                  <span>{latestTrack.key || keySignature}</span>
                  <span>•</span>
                  <span>{latestTrack.instrumental ? 'Instrumental' : 'Vocal Master'}</span>
                </div>
              </div>

              {/* Actions Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => onOpenLyrics(latestTrack)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-violet-400" />
                  <span>View Lyrics</span>
                </button>

                <a
                  href={latestTrack.audio_file}
                  download={`${latestTrack.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp3`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border border-violet-500/40 text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download MP3</span>
                </a>
              </div>

              {/* Send to Fusion / Prompt Lab */}
              {onSendToPromptLab && (
                <button
                  type="button"
                  onClick={() => onSendToPromptLab(latestTrack.prompt, latestTrack.bpm, latestTrack.key)}
                  className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/60 border border-zinc-800 transition-colors text-center cursor-pointer"
                >
                  Load into 374-Genre Prompt Lab →
                </button>
              )}
            </div>
          ) : (
            /* Studio Monitor Idle Placeholder */
            <div className="bg-zinc-900/60 border border-dashed border-zinc-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center min-h-[360px] space-y-4 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-zinc-950 flex items-center justify-center border border-zinc-800 text-violet-400 shadow-inner">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1 max-w-xs">
                <h4 className="text-sm font-bold text-zinc-200">
                  TopMediai Audio Studio Ready
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Enter your prompt or custom lyrics and click{' '}
                  <strong className="text-violet-300">Generate Music</strong> to produce high-fidelity AI audio.
                </p>
              </div>

              {/* Tips */}
              <div className="w-full bg-zinc-950/60 border border-zinc-800/70 rounded-2xl p-3.5 text-left text-xs space-y-1.5 text-zinc-400">
                <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-300" />
                  <span>Pro Production Tips:</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  • In <strong>Auto Mode</strong>, specify vocal descriptors (e.g. <em>ethereal breathy female vocals</em> or <em>raspy baritone lead</em>).
                </p>
                <p className="text-[11px] leading-relaxed">
                  • In <strong>Custom Mode</strong>, use structural metatags like <code>[Verse]</code>, <code>[Chorus]</code>, and <code>[Drop]</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Suno Creations Ingestion Modal */}
      {isCreationsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-4xl w-full p-5 sm:p-7 text-zinc-100 shadow-2xl max-h-[88vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-violet-600/30 border border-violet-500/40 text-violet-300 flex items-center justify-center font-bold text-base">
                  🎵
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Suno Creations Database</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40">
                      {CREATIONS_DATA.length} AI Bands &amp; Fusions
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Pick any created Suno prompt and fill it with 1 click directly into TopMediai
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreationsModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Category Filter */}
            <div className="py-3 flex flex-col sm:flex-row gap-2 border-b border-zinc-800/80">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={creationsSearch}
                  onChange={(e) => setCreationsSearch(e.target.value)}
                  placeholder={`Search ${CREATIONS_DATA.length.toLocaleString()} bands, genres, vibes (e.g. Cyberpunk, Shoegaze, Neon, Trap)...`}
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <select
                value={creationsCategory}
                onChange={(e) => setCreationsCategory(e.target.value)}
                className="bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
              >
                <option value="All">All Categories</option>
                <option value="Rock & Metal">Rock &amp; Metal</option>
                <option value="Electronic & Dance">Electronic &amp; Dance</option>
                <option value="Hip-Hop & Urban">Hip-Hop &amp; Urban</option>
                <option value="Pop & Vocal">Pop &amp; Vocal</option>
                <option value="Jazz & Blues">Jazz &amp; Blues</option>
                <option value="Folk & World">Folk &amp; World</option>
                <option value="Ambient & Cinematic">Ambient &amp; Cinematic</option>
                <option value="Coined Fusion">Coined Fusion</option>
              </select>
            </div>

            {/* Creations List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1 scrollbar-thin">
              {CREATIONS_DATA.filter((c: any) => {
                const matchCat = creationsCategory === 'All' || c.category === creationsCategory;
                if (!matchCat) return false;
                if (!creationsSearch.trim()) return true;
                const term = creationsSearch.toLowerCase();
                return (
                  (c.title || '').toLowerCase().includes(term) ||
                  (c.bandName || '').toLowerCase().includes(term) ||
                  (c.genreName || '').toLowerCase().includes(term) ||
                  (c.sunoStyleTag || '').toLowerCase().includes(term) ||
                  (c.vibe || '').toLowerCase().includes(term)
                );
              }).slice(0, 50).map((item: any) => (
                <div
                  key={item.id}
                  className="bg-zinc-950/80 border border-zinc-800 hover:border-violet-500/50 rounded-2xl p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors">
                        {item.bandName || item.title}
                      </span>
                      {item.title && item.bandName && (
                        <span className="text-xs text-zinc-400 italic">“{item.title}”</span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-violet-950/80 text-violet-300 border border-violet-800/60">
                        {item.genreName || item.category || 'Fusion'}
                      </span>
                      {item.formattedDate && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 ${item.isNew ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
                          <span>{item.isNew ? '??' : '??'}</span>
                          <span>{item.formattedDate}</span>
                        </span>
                      )}
                      {item.bpm && (
                        <span className="text-[10px] font-mono text-amber-400">
                          {item.bpm} BPM
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 line-clamp-2 mt-1 leading-relaxed">
                      {item.sunoStyleTag || item.fullPrompt}
                    </p>
                    {item.vibe && (
                      <p className="text-[11px] text-zinc-500 italic mt-0.5">
                        Vibe: {item.vibe}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(item.sunoStyleTag || item.fullPrompt);
                      setTitle(item.title || item.bandName || 'TopMediai Track');
                      if (item.bpm) setBpm(item.bpm);
                      if (item.lyricSnippet) setCustomLyrics(item.lyricSnippet);
                      setIsCreationsModalOpen(false);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-900/30 transition-all shrink-0 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>⚡ Fill into Studio</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
