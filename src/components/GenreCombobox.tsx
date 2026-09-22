import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Sparkles } from 'lucide-react';
import { GENRE_ITEMS, CATEGORIES } from '../data/genres';
import { GenreCategory } from '../types';

interface GenreComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  required?: boolean;
}

export const GenreCombobox: React.FC<GenreComboboxProps> = ({
  id,
  value,
  onChange,
  placeholder,
  label,
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [selectedCategory, setSelectedCategory] = useState<GenreCategory>('All');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredGenres = GENRE_ITEMS.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase().trim());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSelect = (genreName: string) => {
    onChange(genreName);
    setSearchTerm(genreName);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = prev < filteredGenres.length - 1 ? prev + 1 : 0;
        scrollIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = prev > 0 ? prev - 1 : filteredGenres.length - 1;
        scrollIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < filteredGenres.length) {
      e.preventDefault();
      handleSelect(filteredGenres[highlightIndex].name);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const scrollIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.genre-option');
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-zinc-300 mb-1.5">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          value={searchTerm}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all pr-16"
        />
        <div className="absolute right-1.5 flex items-center gap-1">
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                onChange('');
                setHighlightIndex(-1);
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Toggle dropdown"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180 text-violet-400' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Category filter pills inside dropdown */}
          <div className="p-2 border-b border-zinc-800 bg-zinc-950/60 overflow-x-auto flex gap-1 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[11px] rounded-md font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Matches status bar */}
          <div className="px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800/80 text-[11px] font-mono text-zinc-400 flex justify-between items-center">
            <span>
              {filteredGenres.length} {filteredGenres.length === 1 ? 'genre' : 'genres'}
            </span>
            <span className="text-zinc-500">↑↓ to navigate · Enter to pick</span>
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain divide-y divide-zinc-800/40">
            {filteredGenres.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500">
                No matching genres found. You can still use your custom text!
              </div>
            ) : (
              filteredGenres.map((item, idx) => {
                const isSelected = item.name.toLowerCase() === value.toLowerCase();
                const isHighlighted = idx === highlightIndex;
                return (
                  <div
                    key={item.name}
                    className={`genre-option px-3.5 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-violet-900/30 text-violet-200 font-medium'
                        : isHighlighted
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-300 hover:bg-zinc-800/70'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(item.name);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <span className="truncate pr-2">{item.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.isCoined && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
                          <Sparkles className="w-2.5 h-2.5" />
                          fusion
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500 hidden sm:inline">
                        {item.category}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
