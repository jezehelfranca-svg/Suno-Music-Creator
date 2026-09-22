import React, { useState } from 'react';
import { Search, Compass, Sparkles, ArrowRight, Music } from 'lucide-react';
import { GENRE_ITEMS, CATEGORIES } from '../data/genres';
import { GenreCategory } from '../types';

interface GenreExplorerProps {
  onSelectForFusion: (genre: string, slot: 1 | 2) => void;
}

export const GenreExplorer: React.FC<GenreExplorerProps> = ({ onSelectForFusion }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<GenreCategory>('All');
  const [activeTab, setActiveTab] = useState<'all' | 'coined' | 'base'>('all');

  const filteredGenres = GENRE_ITEMS.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase().trim());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesTab =
      activeTab === 'all'
        ? true
        : activeTab === 'coined'
        ? item.isCoined
        : !item.isCoined;

    return matchesSearch && matchesCategory && matchesTab;
  });

  const coinedCount = GENRE_ITEMS.filter(g => g.isCoined).length;
  const baseCount = GENRE_ITEMS.filter(g => !g.isCoined).length;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Compass className="w-5 h-5 text-violet-400" />
              <span>Full Genre Taxonomy &amp; Directory</span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Explore 374 music styles. Click any badge to immediately inject it into Custom Fusion.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All (374)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('coined')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                activeTab === 'coined'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Coined ({coinedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('base')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'base'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Base ({baseCount})
            </button>
          </div>
        </div>

        {/* Search and Category Filter */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by genre name (e.g. shoegaze, drill, math rock, bossa nova)..."
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-4 py-2.5 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-violet-950/80 border border-violet-600 text-violet-200'
                    : 'bg-zinc-800/60 border border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Genres Listing Counter */}
      <div className="text-xs text-zinc-400 flex items-center justify-between">
        <span>
          Showing <strong className="text-zinc-200">{filteredGenres.length}</strong> styles
        </span>
        <span className="text-zinc-500">Click &quot;+ Slot A&quot; or &quot;+ Slot B&quot; to build a fusion</span>
      </div>

      {/* Genre Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {filteredGenres.map(item => (
          <div
            key={item.name}
            className={`p-3 rounded-xl border flex flex-col justify-between gap-2 transition-all ${
              item.isCoined
                ? 'bg-violet-950/20 border-violet-800/40 hover:border-violet-600/70'
                : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-100 leading-snug">
                  {item.name}
                </span>
                {item.isCoined && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 flex-shrink-0">
                    Fusion
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                {item.category}
              </span>
            </div>

            <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-800/60">
              <button
                type="button"
                onClick={() => onSelectForFusion(item.name, 1)}
                className="flex-1 text-[11px] py-1 px-2 rounded bg-zinc-800 hover:bg-violet-600 hover:text-white text-zinc-300 font-medium transition-colors text-center"
              >
                + Slot A
              </button>
              <button
                type="button"
                onClick={() => onSelectForFusion(item.name, 2)}
                className="flex-1 text-[11px] py-1 px-2 rounded bg-zinc-800 hover:bg-violet-600 hover:text-white text-zinc-300 font-medium transition-colors text-center"
              >
                + Slot B
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
