import React, { useState } from 'react';
import { Copy, Check, Heart, Sparkles, Volume2, ChevronDown, ChevronUp, Layers, Music, FileText, Zap } from 'lucide-react';
import { GeneratedPrompt, SunoPromptFormat } from '../types';
import { formatPromptForCopy } from '../utils/sunoFormatter';
import { syncCreationToExtension } from '../utils/extensionSync';

interface PromptCardProps {
  prompt: GeneratedPrompt;
  isFavorite: boolean;
  onToggleFavorite: (prompt: GeneratedPrompt) => void;
  onTestMetronome: (bpm: number, timeSig: string) => void;
  onAiEnhance: (prompt: GeneratedPrompt) => void;
  onOpenExtensionModal?: (prompt: GeneratedPrompt) => void;
}

export const PromptCard: React.FC<PromptCardProps> = ({
  prompt,
  isFavorite,
  onToggleFavorite,
  onTestMetronome,
  onAiEnhance,
  onOpenExtensionModal
}) => {
  const [copiedFormat, setCopiedFormat] = useState<SunoPromptFormat | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [activeTab, setActiveTab] = useState<'suno-tag' | 'full'>('suno-tag');

  const handleCopy = (format: SunoPromptFormat) => {
    const text = formatPromptForCopy(prompt, format);
    navigator.clipboard.writeText(text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const bpmValue = prompt.minBpm === prompt.maxBpm ? prompt.minBpm : Math.round((prompt.minBpm + prompt.maxBpm) / 2);

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 sm:p-5 shadow-lg shadow-black/40 transition-all flex flex-col justify-between group">
      <div>
        {/* Top title & Favorite action */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2 flex-wrap">
              <span>{prompt.genres.join(' × ')}</span>
            </h3>
            {prompt.title && (
              <span className="text-xs text-violet-400 font-mono italic">
                “{prompt.title}”
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleFavorite(prompt)}
              title={isFavorite ? "Remove from saved" : "Save to favorites"}
              className={`p-1.5 rounded-lg border transition-all ${
                isFavorite
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                  : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-rose-400 hover:bg-zinc-700"
              }`}
            >
              <Heart className={`w-4 h-4 ${isFavorite ? "fill-rose-400" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => onTestMetronome(bpmValue, prompt.timeSig)}
              title="Test groove tempo in metronome"
              className="p-1.5 rounded-lg border bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-amber-300 hover:bg-zinc-700 transition-all"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Component breakdown */}
        <div className="space-y-1 bg-zinc-950/60 rounded-lg p-2.5 border border-zinc-800/80 text-xs mb-3 font-mono">
          {prompt.genres.map((genre, idx) => (
            <div key={idx} className="flex justify-between items-center text-zinc-400">
              <span className="text-violet-400 font-medium">Part {String.fromCharCode(65 + idx)}:</span>
              <span className="text-zinc-200 text-right truncate pl-2">{genre}</span>
            </div>
          ))}
          <div className="pt-1.5 mt-1 border-t border-zinc-800/60 flex justify-between items-center text-zinc-500 text-[11px]">
            <span>METER &amp; TEMPO:</span>
            <span className="text-amber-400 font-semibold">
              {prompt.timeSig} • {prompt.minBpm === prompt.maxBpm ? `${prompt.minBpm} BPM` : `${prompt.minBpm}–${prompt.maxBpm} BPM`} • {prompt.key}
            </span>
          </div>
          {prompt.selectedInstruments && prompt.selectedInstruments.length > 0 && (
            <div className="pt-1.5 mt-1 border-t border-zinc-800/60">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
                <span>FEATURED GEAR &amp; PATCHES:</span>
                <span className="text-amber-400 font-mono text-[10px]">{prompt.selectedInstruments.length} items</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {prompt.selectedInstruments.map((inst, i) => (
                  <span
                    key={i}
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/25"
                  >
                    {inst}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab switch between Suno Style Box Tag and Full Cinematic Prompt */}
        <div className="flex border-b border-zinc-800 mb-2">
          <button
            type="button"
            onClick={() => setActiveTab('suno-tag')}
            className={`pb-1.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'suno-tag'
                ? 'border-violet-500 text-violet-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Suno Style Box Tag</span>
            <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400">v4/v3.5</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('full')}
            className={`pb-1.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'full'
                ? 'border-violet-500 text-violet-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Full Metaprompt</span>
          </button>
        </div>

        {/* Prompt Output Box */}
        {activeTab === 'suno-tag' ? (
          <div className="relative">
            <div className="bg-zinc-950 rounded-lg p-3 border border-violet-900/40 text-xs font-mono text-zinc-200 leading-relaxed max-h-36 overflow-y-auto mb-3 selection:bg-violet-600 selection:text-white">
              {prompt.sunoStyleTag}
            </div>
            <div className="text-[11px] text-zinc-400 mb-3 flex items-center justify-between">
              <span className="text-zinc-500">Character count: {prompt.sunoStyleTag.length} (Ideal for Suno &lt;180)</span>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 text-xs font-mono text-zinc-300 leading-relaxed max-h-36 overflow-y-auto mb-3 selection:bg-violet-600 selection:text-white">
              {prompt.fullPrompt}
            </div>
          </div>
        )}

        {/* Optional Lyrics Scaffold Accordion */}
        {prompt.lyricSnippet && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowLyrics(!showLyrics)}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-medium transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>{showLyrics ? 'Hide' : 'View'} Suno Lyric &amp; Song Scaffold</span>
              {showLyrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showLyrics && (
              <pre className="mt-2 p-3 bg-zinc-950/90 border border-zinc-800/80 rounded-lg text-[11px] font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {prompt.lyricSnippet}
              </pre>
            )}
          </div>
        )}

        {/* Suno Settings & Parameters Pill Row */}
        {(prompt.vocalGender || prompt.weirdness !== undefined || prompt.excludeStyles || prompt.duration) && (
          <div className="mb-3 p-2 bg-zinc-950/60 rounded-lg border border-zinc-800/80 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="text-zinc-500 font-sans font-semibold">⚙️ Suno Params:</span>
            {prompt.vocalGender && (
              <span className="px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-300">
                🎤 {prompt.vocalGender}
              </span>
            )}
            {prompt.duration && (
              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                ⏱️ {prompt.duration}
              </span>
            )}
            {prompt.weirdness !== undefined && (
              <span className="px-2 py-0.5 rounded bg-pink-500/15 border border-pink-500/30 text-pink-300">
                🌀 Weirdness: {prompt.weirdness}%
              </span>
            )}
            {prompt.styleInfluence !== undefined && (
              <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                🎚️ Influence: {prompt.styleInfluence}%
              </span>
            )}
            {prompt.excludeStyles && (
              <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 truncate max-w-[200px]" title={prompt.excludeStyles}>
                🚫 Exclude: {prompt.excludeStyles}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleCopy('suno-tag')}
          className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-md shadow-violet-900/20"
        >
          {copiedFormat === 'suno-tag' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>Copied Style Tag!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Suno Tag</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleCopy('full-prompt')}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all border border-zinc-700/60"
        >
          {copiedFormat === 'full-prompt' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>Copied Full!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Full</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onAiEnhance(prompt)}
          className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg text-xs font-medium bg-gradient-to-r from-amber-500/10 to-violet-500/10 hover:from-amber-500/20 hover:to-violet-500/20 text-amber-300 border border-amber-500/30 transition-all"
          title="Enhance with AI Co-Producer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>AI Polish</span>
        </button>

        {onOpenExtensionModal && (
          <button
            type="button"
            onClick={() => {
              syncCreationToExtension(prompt);
              onOpenExtensionModal(prompt);
            }}
            className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all cursor-pointer shadow-sm"
            title="1-Click AutoFill on Suno.com via Edge & Chrome Extension"
          >
            <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
            <span>Suno AutoFill</span>
          </button>
        )}
      </div>
    </div>
  );
};
