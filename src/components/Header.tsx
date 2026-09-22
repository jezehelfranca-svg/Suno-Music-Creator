import React from 'react';
import { Sparkles, Sliders, Volume2, VolumeX, Heart, BookOpen, Shuffle, Compass, Music, Radio } from 'lucide-react';
import { STYLE_LIBRARY } from '../data/styleLibrary';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  favoritesCount: number;
  isMetronomePlaying: boolean;
  toggleMetronome: () => void;
  metronomeBpm: number;
  metronomeMeter: string;
  currentBeat: number;
  totalBeats: number;
  onOpenAiInspire: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  favoritesCount,
  isMetronomePlaying,
  toggleMetronome,
  metronomeBpm,
  metronomeMeter,
  currentBeat,
  totalBeats,
  onOpenAiInspire
}) => {
  const totalPromptsCount = STYLE_LIBRARY.reduce((sum, s) => sum + s.prompts.length, 0);
  const totalSetsCount = STYLE_LIBRARY.length;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
      {/* Top Banner & Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20 text-white">
              <Music className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
                  Suno Fusion Prompt Generator
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  v4 &amp; v3.5 Pro
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400">
                374 Genres · 1,561 Exact Instruments &amp; Patches · {totalPromptsCount} Curated Prompts · 8.6M+ Combinations
              </p>
            </div>
          </div>

          {/* Quick Metronome & AI Action */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Metronome Beat Preview */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 shadow-inner">
              <button
                type="button"
                onClick={toggleMetronome}
                title={isMetronomePlaying ? "Stop groove metronome" : "Listen to tempo groove pulse"}
                className={`p-1.5 rounded-md transition-colors ${
                  isMetronomePlaying
                    ? "bg-rose-500 text-white animate-pulse"
                    : "bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700"
                }`}
              >
                {isMetronomePlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <div className="text-xs font-mono">
                <div className="flex items-center gap-1 text-zinc-300">
                  <span>{metronomeBpm} BPM</span>
                  <span className="text-zinc-600">•</span>
                  <span>{metronomeMeter}</span>
                </div>
                {isMetronomePlaying && (
                  <div className="flex gap-1 mt-0.5">
                    {Array.from({ length: totalBeats }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-2 rounded-sm transition-all ${
                          i === currentBeat
                            ? i === 0
                              ? "bg-amber-400 scale-110"
                              : "bg-violet-400"
                            : "bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI Idea to Prompt Button */}
            <button
              type="button"
              onClick={onOpenAiInspire}
              className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-medium px-3 py-2 rounded-lg shadow-md shadow-violet-900/30 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>AI Idea Matcher</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mt-4 pt-3 border-t border-zinc-800/60 text-xs">
          <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/80">
            <span className="text-zinc-500">Taxonomy:</span>{" "}
            <span className="font-semibold text-zinc-200">374 Genres</span>{" "}
            <span className="text-violet-400 font-mono">(98 Coined)</span>
          </div>
          <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/80">
            <span className="text-zinc-500">2-Genre Pairs:</span>{" "}
            <span className="font-semibold text-zinc-200 font-mono">69,751</span>
          </div>
          <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/80">
            <span className="text-zinc-500">3-Genre Combos:</span>{" "}
            <span className="font-semibold text-zinc-200 font-mono">8.6 Million</span>
          </div>
          <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/80">
            <span className="text-zinc-500">Curated Library:</span>{" "}
            <span className="font-semibold text-zinc-200">{totalPromptsCount} Prompts ({totalSetsCount} Sets)</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-4 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Custom Fusion</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('random')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'random'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Shuffle className="w-4 h-4" />
            <span>Random Generator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'library'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Style Library (34)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'explore'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Genre Explorer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('architect')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'architect'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Song Metatags</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'favorites'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Heart className={`w-4 h-4 ${favoritesCount > 0 ? "fill-rose-400 text-rose-400" : ""}`} />
            <span>Saved ({favoritesCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
};
