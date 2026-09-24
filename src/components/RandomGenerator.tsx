import React, { useState } from 'react';
import { Shuffle, Sparkles, Copy, Check, Dices, History, RotateCcw, ArrowRight } from 'lucide-react';
import { PromptCard } from './PromptCard';
import { ALL_GENRES, COINED_GENRES, BASE_GENRES } from '../data/genres';
import { TIME_SIGNATURES } from '../data/pools';
import { GeneratedPrompt, SunoPromptFormat } from '../types';
import { generateSunoPrompt, formatPromptForCopy } from '../utils/sunoFormatter';

interface RandomGeneratorProps {
  onTestMetronome: (bpm: number, timeSig: string) => void;
  onAiEnhance: (prompt: GeneratedPrompt) => void;
  favorites: GeneratedPrompt[];
  onToggleFavorite: (prompt: GeneratedPrompt) => void;
  promptHistory: GeneratedPrompt[];
  onAddToHistory: (prompts: GeneratedPrompt[]) => void;
  onRevertToPrompt: (prompt: GeneratedPrompt) => void;
  onOpenHistory: () => void;
  onOpenExtensionModal?: (prompt: GeneratedPrompt) => void;
}

export const RandomGenerator: React.FC<RandomGeneratorProps> = ({
  onTestMetronome,
  onAiEnhance,
  favorites,
  onToggleFavorite,
  promptHistory,
  onAddToHistory,
  onRevertToPrompt,
  onOpenHistory,
  onOpenExtensionModal
}) => {
  const [results, setResults] = useState<GeneratedPrompt[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [comboType, setComboType] = useState<'2-genre' | '3-genre' | 'mixed'>('mixed');
  const [genrePool, setGenrePool] = useState<'all' | 'coined-only' | 'base-only'>('all');
  const [allCopied, setAllCopied] = useState(false);

  const rollFusions = (count: number) => {
    setIsRolling(true);

    const sourcePool = genrePool === 'coined-only'
      ? COINED_GENRES
      : genrePool === 'base-only'
      ? BASE_GENRES
      : ALL_GENRES;

    const generated: GeneratedPrompt[] = [];

    for (let i = 0; i < count; i++) {
      let isTrio = comboType === '3-genre';
      if (comboType === 'mixed') {
        isTrio = Math.random() > 0.45;
      }

      const neededCount = isTrio ? 3 : 2;
      const picked: string[] = [];
      while (picked.length < neededCount) {
        const g = sourcePool[Math.floor(Math.random() * sourcePool.length)];
        if (!picked.includes(g)) picked.push(g);
      }

      const ts = TIME_SIGNATURES[Math.floor(Math.random() * TIME_SIGNATURES.length)];
      const lo = 65 + Math.floor(Math.random() * 95);
      const hi = lo + 10 + Math.floor(Math.random() * 50);

      const prompt = generateSunoPrompt(picked, ts, lo, hi, '320', {
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

      if (prompt) {
        generated.push(prompt);
      }
    }

    setTimeout(() => {
      setResults(generated);
      if (generated.length > 0) {
        onAddToHistory(generated);
      }
      setIsRolling(false);
    }, 200);
  };

  const handleCopyAll = (format: SunoPromptFormat = 'suno-tag') => {
    if (results.length === 0) return;
    const text = results.map(r => formatPromptForCopy(r, format)).join('\n\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-amber-400" />
              <span>Instant Fusion Roulette</span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Roll surprising collisions across 374 genres with algorithmic variety.
            </p>
          </div>

          {/* Generator Preset Triggers */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isRolling}
              onClick={() => rollFusions(1)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-md shadow-violet-900/20 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Dices className="w-4 h-4" />
              <span>1 Random</span>
            </button>
            <button
              type="button"
              disabled={isRolling}
              onClick={() => rollFusions(5)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white transition-all shadow-md shadow-violet-900/20 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>5 Random</span>
            </button>
            <button
              type="button"
              disabled={isRolling}
              onClick={() => rollFusions(10)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span>10 Random</span>
            </button>

            {/* Session Prompt History Trigger */}
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Open session prompt history (Last 10 iterations)"
            >
              <History className="w-3.5 h-3.5 text-violet-400" />
              <span>History</span>
              {promptHistory.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-violet-600/30 text-violet-300 border border-violet-500/30">
                  {promptHistory.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-zinc-800/80 text-xs">
          <div>
            <span className="block text-zinc-400 mb-1 font-medium">Genre Count:</span>
            <div className="flex gap-2">
              {[
                { id: 'mixed', label: 'Mixed (2 or 3)' },
                { id: '2-genre', label: '2-Genre Clashes' },
                { id: '3-genre', label: '3-Genre Trios' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setComboType(opt.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                    comboType === opt.id
                      ? 'bg-violet-950/60 border-violet-600 text-violet-200'
                      : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-zinc-400 mb-1 font-medium">Genre Pool:</span>
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'All 374 Genres' },
                { id: 'coined-only', label: 'Coined Styles Only (98)' },
                { id: 'base-only', label: 'Canonical Base (276)' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGenrePool(opt.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                    genrePool === opt.id
                      ? 'bg-violet-950/60 border-violet-600 text-violet-200'
                      : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Session Prompt History Quick Timeline Bar */}
      {promptHistory.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-zinc-200">Recent Iterations</span>
              <span className="text-[11px] font-mono text-zinc-500">
                ({promptHistory.length}/10 in session)
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>View Full History</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {promptHistory.map((item, idx) => {
              const iterNum = promptHistory.length - idx;
              return (
                <button
                  key={item.id || idx}
                  type="button"
                  onClick={() => onRevertToPrompt(item)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-950/80 text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  title={`Revert & load into Studio: ${item.genres.join(' × ')} (${item.timeSig}, ${item.minBpm} BPM)`}
                >
                  <span className="font-mono text-[10px] text-zinc-500">#{iterNum}</span>
                  <span className="truncate max-w-[140px] sm:max-w-[200px]">{item.genres.join(' × ')}</span>
                  <span className="text-[10px] font-mono text-amber-400/80">{item.minBpm} BPM</span>
                  <RotateCcw className="w-3 h-3 text-violet-400/80 ml-0.5" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Copy All Header Bar */}
      {results.length > 0 && (
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>
            Displaying <strong className="text-zinc-200">{results.length}</strong> random hybrid {results.length === 1 ? 'prompt' : 'prompts'}
          </span>
          <button
            type="button"
            onClick={() => handleCopyAll('suno-tag')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs transition-colors cursor-pointer"
          >
            {allCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{allCopied ? 'Copied!' : 'Copy All Suno Tags'}</span>
          </button>
        </div>
      )}

      {/* Results Grid */}
      {results.length === 0 ? (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
          <Dices className="w-10 h-10 mx-auto text-zinc-600 mb-3 animate-bounce" />
          <p className="text-sm font-medium text-zinc-400">No random fusions generated yet.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Click <strong>1 Random</strong>, <strong>5 Random</strong>, or <strong>10 Random</strong> above to start spinning!
          </p>
        </div>
      ) : (
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
                onOpenExtensionModal={onOpenExtensionModal}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
