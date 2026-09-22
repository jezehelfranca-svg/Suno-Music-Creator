import React, { useState } from 'react';
import { BookOpen, Search, Copy, Check, Sparkles, Sliders, Volume2, Filter, Music, Disc } from 'lucide-react';
import { STYLE_LIBRARY, parsePromptMeta } from '../data/styleLibrary';
import { StyleCollection, GenreCategory } from '../types';

interface StyleLibraryProps {
  onUseAsTemplate: (timeSig: string, bpm: number | null, promptText: string) => void;
  onTestMetronome: (bpm: number, timeSig: string) => void;
}

const INSTRUMENT_SHORTCUTS = [
  { label: 'All Instruments', filter: '' },
  { label: '🎸 Acoustic & Fingerstyle', filter: 'acoustic' },
  { label: '🎹 Keys & Vintage Synths', filter: 'keys' },
  { label: '🎷 Brass, Reeds & Horns', filter: 'brass' },
  { label: '🎸 Bass & Low-End', filter: 'bass' },
  { label: '🎻 Chamber Strings & Cello', filter: 'strings' },
  { label: '🌍 Global & Traditional', filter: 'traditional' },
  { label: '🎛️ Modular & Sound Design', filter: 'modular' },
  { label: '⚡ Electric Guitar & Shred', filter: 'electric' },
];

export const StyleLibrary: React.FC<StyleLibraryProps> = ({
  onUseAsTemplate,
  onTestMetronome
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [activeInstrumentFilter, setActiveInstrumentFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  // Filter collections based on category
  const categoryCollections = STYLE_LIBRARY.filter(set => {
    if (selectedCategory === 'All') return true;
    return set.category === selectedCategory;
  });

  // Filter collections and prompts
  const visiblePrompts = STYLE_LIBRARY
    .filter(set => {
      if (selectedCategory !== 'All' && set.category !== selectedCategory) return false;
      if (selectedSetId && set.id !== selectedSetId) return false;
      return true;
    })
    .flatMap(set =>
      set.prompts
        .filter(p => {
          // Check instrument shortcut
          if (activeInstrumentFilter) {
            const lowerP = p.toLowerCase();
            const lowerSet = set.name.toLowerCase();
            switch (activeInstrumentFilter) {
              case 'acoustic':
                if (!lowerP.includes('acoustic') && !lowerP.includes('fingerstyle') && !lowerP.includes('nylon') && !lowerP.includes('resonator') && !lowerP.includes('12-string')) return false;
                break;
              case 'keys':
                if (!lowerP.includes('rhodes') && !lowerP.includes('hammond') && !lowerP.includes('piano') && !lowerP.includes('synth') && !lowerP.includes('organ') && !lowerP.includes('clavinet') && !lowerP.includes('juno') && !lowerP.includes('prophet') && !lowerP.includes('mellotron')) return false;
                break;
              case 'brass':
                if (!lowerP.includes('sax') && !lowerP.includes('trumpet') && !lowerP.includes('brass') && !lowerP.includes('flute') && !lowerP.includes('horn') && !lowerP.includes('trombone') && !lowerP.includes('flugelhorn') && !lowerP.includes('clarinet')) return false;
                break;
              case 'bass':
                if (!lowerP.includes('bass') && !lowerP.includes('808') && !lowerP.includes('fretless') && !lowerP.includes('upright') && !lowerP.includes('slap')) return false;
                break;
              case 'strings':
                if (!lowerP.includes('cello') && !lowerP.includes('violin') && !lowerP.includes('viola') && !lowerP.includes('marimba') && !lowerP.includes('harp') && !lowerP.includes('string') && !lowerP.includes('vibraphone') && !lowerP.includes('glockenspiel')) return false;
                break;
              case 'traditional':
                if (!lowerP.includes('sitar') && !lowerP.includes('koto') && !lowerP.includes('shamisen') && !lowerP.includes('pipes') && !lowerP.includes('steelpan') && !lowerP.includes('accordion') && !lowerP.includes('djembe') && !lowerP.includes('oud') && !lowerP.includes('guzheng') && !lowerP.includes('dulcimer')) return false;
                break;
              case 'modular':
                if (!lowerP.includes('modular') && !lowerP.includes('buchla') && !lowerP.includes('tb-303') && !lowerP.includes('acid') && !lowerP.includes('granular') && !lowerP.includes('wavetable') && !lowerP.includes('eurorack') && !lowerP.includes('drum machine')) return false;
                break;
              case 'electric':
                if (!lowerP.includes('electric guitar') && !lowerP.includes('shred') && !lowerP.includes('djent') && !lowerP.includes('stratocaster') && !lowerP.includes('riff') && !lowerP.includes('whammy') && !lowerP.includes('fuzz') && !lowerP.includes('chug')) return false;
                break;
            }
          }

          // Check text search
          if (!searchTerm) return true;
          const term = searchTerm.toLowerCase().trim();
          return p.toLowerCase().includes(term) || set.name.toLowerCase().includes(term);
        })
        .map(prompt => ({ set, prompt }))
    );

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    if (visiblePrompts.length === 0) return;
    const allText = visiblePrompts.map(p => p.prompt).join('\n\n');
    navigator.clipboard.writeText(allText);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  const totalPromptsInLibrary = STYLE_LIBRARY.reduce((sum, s) => sum + s.prompts.length, 0);

  return (
    <div className="space-y-6">
      {/* Search & Collection Selector */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-violet-400" />
              <span>Curated Style Library</span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                +160 Instrument Prompts
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              {totalPromptsInLibrary} reference prompts across {STYLE_LIBRARY.length} master collections, including dedicated Instrument Showcases. Copy directly or load into Custom Fusion.
            </p>
          </div>

          {visiblePrompts.length > 0 && (
            <button
              type="button"
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
            >
              {allCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{allCopied ? 'Copied Visible!' : `Copy Visible (${visiblePrompts.length})`}</span>
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-thin">
          {[
            'All',
            'Instrument Showcases',
            'Rock & Metal',
            'Electronic & Dance',
            'Jazz & Blues',
            'World & Traditional',
            'Coined Fusion',
            'Pop & Vocal'
          ].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setSelectedSetId('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? cat === 'Instrument Showcases'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm font-semibold'
                    : 'bg-violet-600 text-white shadow-sm'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              {cat === 'Instrument Showcases' ? '✨ ' + cat : cat}
            </button>
          ))}
        </div>

        {/* Quick Instrument Filter Chips */}
        <div className="mb-4 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            <Music className="w-3.5 h-3.5 text-amber-400" />
            <span>Filter by Instrument / Focus:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {INSTRUMENT_SHORTCUTS.map(inst => (
              <button
                key={inst.label}
                type="button"
                onClick={() => {
                  setActiveInstrumentFilter(inst.filter);
                  if (inst.filter) {
                    // If user selects an instrument, also show instrument showcases if not already on All
                    if (selectedCategory !== 'All' && selectedCategory !== 'Instrument Showcases') {
                      setSelectedCategory('All');
                    }
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  activeInstrumentFilter === inst.filter
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                }`}
              >
                {inst.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label htmlFor="collectionSelect" className="block text-xs font-semibold text-zinc-300 mb-1">
              Select Collection:
            </label>
            <select
              id="collectionSelect"
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              <option value="">
                {selectedCategory === 'All' 
                  ? `All ${STYLE_LIBRARY.length} Collections (${totalPromptsInLibrary} prompts)`
                  : `All ${selectedCategory} Collections (${categoryCollections.reduce((sum, s) => sum + s.prompts.length, 0)} prompts)`}
              </option>
              {categoryCollections.map(set => (
                <option key={set.id} value={set.id}>
                  {set.name} ({set.prompts.length})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="librarySearch" className="block text-xs font-semibold text-zinc-300 mb-1">
              Search Prompts:
            </label>
            <div className="relative">
              <input
                id="librarySearch"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by instrument (e.g. Rhodes, Fretless, Tenor Sax, DADGAD, Koto, TB-303, Sitar)..."
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-4 py-2.5 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
            </div>
          </div>
        </div>

        {/* Collection Note pill if selected */}
        {selectedSetId && (
          <div className="mt-3 p-2.5 rounded-lg bg-violet-950/30 border border-violet-800/40 text-xs text-violet-200 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <strong>{STYLE_LIBRARY.find(s => s.id === selectedSetId)?.name}:</strong>{" "}
              {STYLE_LIBRARY.find(s => s.id === selectedSetId)?.note}
            </div>
          </div>
        )}
      </div>

      {/* Prompts Count bar */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>Showing <strong className="text-zinc-200">{visiblePrompts.length}</strong> matching prompts</span>
        {(searchTerm || activeInstrumentFilter || selectedSetId || selectedCategory !== 'All') && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setActiveInstrumentFilter('');
              setSelectedSetId('');
              setSelectedCategory('All');
            }}
            className="text-violet-400 hover:text-violet-300 underline cursor-pointer"
          >
            Reset all filters
          </button>
        )}
      </div>

      {/* Prompts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visiblePrompts.map((item, idx) => {
          const meta = parsePromptMeta(item.prompt);
          
          // Extract Highlight if available
          const highlightMatch = item.prompt.match(/Highlight:\s*([^.]+)/i);
          const highlightText = highlightMatch ? highlightMatch[1].trim() : null;

          const isInstrumentShowcase = item.set.category === 'Instrument Showcases';

          return (
            <div
              key={idx}
              className={`bg-zinc-900/90 border rounded-xl p-4 shadow-lg shadow-black/40 flex flex-col justify-between transition-all ${
                isInstrumentShowcase 
                  ? 'border-amber-500/30 hover:border-amber-500/60 bg-gradient-to-b from-amber-950/10 to-zinc-900/90' 
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div>
                {/* Collection Badge & Meta Header */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                    isInstrumentShowcase
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                  }`}>
                    {item.set.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
                    <span className="text-amber-400 font-medium">{meta.timeSig}</span>
                    {meta.bpm && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span>{meta.bpm} BPM</span>
                      </>
                    )}
                    {meta.key && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="text-emerald-400">{meta.key}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Highlight Tag Pill */}
                {highlightText && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <Music className="w-2.5 h-2.5" />
                      {highlightText}
                    </span>
                  </div>
                )}

                {/* Prompt Text Body */}
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/80 text-xs font-mono text-zinc-300 leading-relaxed max-h-36 overflow-y-auto mb-3 selection:bg-violet-600 selection:text-white">
                  {item.prompt}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(item.prompt, idx)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-md shadow-violet-900/20"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Prompt</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onUseAsTemplate(meta.timeSig, meta.bpm, item.prompt)}
                  title="Load BPM &amp; meter into Custom Fusion"
                  className="flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Use as Template</span>
                </button>

                {meta.bpm && (
                  <button
                    type="button"
                    onClick={() => onTestMetronome(meta.bpm!, meta.timeSig)}
                    title="Test tempo pulse"
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 border border-zinc-700/60 transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
