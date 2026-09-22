import React, { useState, useMemo } from 'react';
import { Music, Search, Plus, X, Sparkles, Shuffle, Check, Disc, Guitar, Piano, Drum, Radio, Layers } from 'lucide-react';
import {
  EXACT_INSTRUMENTS,
  CATALOGUED_INSTRUMENTS,
  INSTRUMENT_CATEGORIES,
  INSTRUMENT_PRESETS,
  InstrumentCategory,
  InstrumentItem
} from '../data/instruments';

interface InstrumentSelectorProps {
  selectedInstruments: string[];
  onToggleInstrument: (name: string) => void;
  onClearInstruments: () => void;
  onSelectPreset: (instruments: string[]) => void;
  onRandomizeInstruments: (count?: number, category?: InstrumentCategory) => void;
}

export const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({
  selectedInstruments,
  onToggleInstrument,
  onClearInstruments,
  onSelectPreset,
  onRandomizeInstruments
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<InstrumentCategory>('All');
  const [isOpen, setIsOpen] = useState(false);

  // Filter instruments based on search and category
  const filteredInstruments = useMemo(() => {
    let list = CATALOGUED_INSTRUMENTS;

    if (selectedCategory !== 'All') {
      list = list.filter(item => item.category === selectedCategory);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter(item => item.name.toLowerCase().includes(term));
    }

    return list;
  }, [searchTerm, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: CATALOGUED_INSTRUMENTS.length };
    for (const item of CATALOGUED_INSTRUMENTS) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, []);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-bold text-zinc-100">
              Exact Instrument &amp; VST Patch Selection
            </h3>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono">
              1,561 Available
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Pick specific hardware synths, VST plugins, amp modelers, and drum kits to lock into your Suno prompt.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onRandomizeInstruments(3, selectedCategory !== 'All' ? selectedCategory : undefined)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-400" />
            <span>Random 3</span>
          </button>
          {selectedInstruments.length > 0 && (
            <button
              type="button"
              onClick={onClearInstruments}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-zinc-700 transition-colors cursor-pointer"
            >
              Clear All ({selectedInstruments.length})
            </button>
          )}
        </div>
      </div>

      {/* Selected Instruments Active Tray */}
      <div className="bg-zinc-950/80 rounded-lg p-3 border border-zinc-800/90">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <span>Locked In Prompts:</span>
            <span className="text-amber-400 font-mono">
              {selectedInstruments.length > 0 ? `${selectedInstruments.length} selected` : 'None (Randomized on generate)'}
            </span>
          </span>
          {selectedInstruments.length > 0 && (
            <span className="text-[11px] text-emerald-400 font-medium">
              ✓ Will be featured in your generated prompts
            </span>
          )}
        </div>

        {selectedInstruments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedInstruments.map(inst => (
              <span
                key={inst}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-amber-500/15 text-amber-200 border border-amber-500/40 shadow-sm"
              >
                <span>{inst}</span>
                <button
                  type="button"
                  onClick={() => onToggleInstrument(inst)}
                  className="hover:text-white transition-colors cursor-pointer"
                  title={`Remove ${inst}`}
                >
                  <X className="w-3.5 h-3.5 text-amber-400 hover:text-rose-300" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic py-1">
            No instruments locked yet. Select below or choose a Quick Rig preset to explicitly include them in every prompt.
          </p>
        )}
      </div>

      {/* Preset Rigs */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>Curated Studio Rigs:</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {INSTRUMENT_PRESETS.map(preset => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onSelectPreset(preset.instruments)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-violet-950/50 text-zinc-300 hover:text-violet-200 border border-zinc-700 hover:border-violet-600/40 transition-all whitespace-nowrap cursor-pointer"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search & Category Filter Section */}
      <div className="space-y-3 pt-2 border-t border-zinc-800/80">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search box */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search 1,561 instruments (e.g. Gojira X, V-METAL, Bosendorfer, J60, Rhodes, TB-303, TR-808, Clav)..."
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Toggle browser view */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>{isOpen ? 'Collapse Catalog' : `Browse Catalog (${filteredInstruments.length})`}</span>
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {INSTRUMENT_CATEGORIES.map(cat => {
            const count = categoryCounts[cat] || 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                {cat} <span className="opacity-70 font-mono text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Catalog Items Grid (shown when search is active or browser is toggled open) */}
        {(isOpen || searchTerm.trim().length > 0) && (
          <div className="mt-2 bg-zinc-950 rounded-lg p-3 border border-zinc-800 max-h-64 overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2 pb-1 border-b border-zinc-800/80">
              <span>
                Showing <strong className="text-zinc-200">{filteredInstruments.length}</strong> instruments in{' '}
                <strong className="text-amber-400">{selectedCategory}</strong>
              </span>
              <span>Click to add or remove</span>
            </div>

            {filteredInstruments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {filteredInstruments.slice(0, 150).map(item => {
                  const isSelected = selectedInstruments.includes(item.name);
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => onToggleInstrument(item.name)}
                      className={`text-left px-2.5 py-1.5 rounded-md text-xs font-mono transition-all flex items-center justify-between gap-2 border cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 font-semibold'
                          : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 border-zinc-800/70 hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate">{item.name}</span>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-zinc-500 opacity-60 hover:opacity-100 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-4">
                No instruments match "{searchTerm}". Try another keyword or clear search.
              </p>
            )}

            {filteredInstruments.length > 150 && (
              <div className="text-center pt-2 text-[11px] text-zinc-500">
                Displaying first 150 results. Use the search bar above to narrow down specific patches.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
