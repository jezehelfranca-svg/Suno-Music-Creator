import React, { useState } from 'react';
import { Heart, Copy, Check, Download, Trash2, Search, ArrowLeft } from 'lucide-react';
import { PromptCard } from './PromptCard';
import { GeneratedPrompt, SunoPromptFormat } from '../types';
import { formatPromptForCopy } from '../utils/sunoFormatter';

interface FavoritesViewProps {
  favorites: GeneratedPrompt[];
  onToggleFavorite: (prompt: GeneratedPrompt) => void;
  onTestMetronome: (bpm: number, timeSig: string) => void;
  onAiEnhance: (prompt: GeneratedPrompt) => void;
  onBackToCustom: () => void;
  onOpenExtensionModal?: (prompt: GeneratedPrompt) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  favorites,
  onToggleFavorite,
  onTestMetronome,
  onAiEnhance,
  onBackToCustom,
  onOpenExtensionModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);

  const filteredFavorites = favorites.filter(p =>
    p.genres.some(g => g.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.fullPrompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sunoStyleTag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCopyAll = (format: SunoPromptFormat = 'suno-tag') => {
    if (favorites.length === 0) return;
    const text = favorites.map(f => formatPromptForCopy(f, format)).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportJson = () => {
    if (favorites.length === 0) return;
    const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suno-fusion-favorites-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    if (favorites.length === 0) return;
    let md = `# Suno Fusion Prompt Generator — Saved Favorites\n\n`;
    md += `Exported: ${new Date().toLocaleDateString()}\nTotal Prompts: ${favorites.length}\n\n---\n\n`;
    favorites.forEach((p, idx) => {
      md += `## ${idx + 1}. ${p.genres.join(' × ')} (${p.timeSig}, ${p.minBpm}-${p.maxBpm} BPM, ${p.key})\n\n`;
      md += `### Suno Style Box Tag:\n\`\`\`\n${p.sunoStyleTag}\n\`\`\`\n\n`;
      md += `### Full Cinematic Metaprompt:\n> ${p.fullPrompt}\n\n`;
      if (p.lyricSnippet) {
        md += `### Lyrics Structure Scaffold:\n\`\`\`\n${p.lyricSnippet}\n\`\`\`\n\n`;
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suno-prompts-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToCustom}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Back to Generator"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
                <span>Saved Favorites ({favorites.length})</span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Your bookmarked fusions. Export as JSON or Markdown, or copy all at once.
              </p>
            </div>
          </div>

          {favorites.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleCopyAll('suno-tag')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? 'Copied!' : 'Copy All Tags'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Markdown</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        {favorites.length > 0 && (
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter saved prompts by genre or keywords..."
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-4 py-2.5 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          </div>
        )}
      </div>

      {/* Grid or Empty state */}
      {favorites.length === 0 ? (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
          <Heart className="w-10 h-10 mx-auto text-zinc-700 mb-3" />
          <p className="text-sm font-medium text-zinc-400">No favorite prompts saved yet.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Click the heart icon on any prompt card across the generator to save it for later!
          </p>
          <button
            type="button"
            onClick={onBackToCustom}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
          >
            Create Your First Fusion
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFavorites.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              isFavorite={true}
              onToggleFavorite={onToggleFavorite}
              onTestMetronome={onTestMetronome}
              onAiEnhance={onAiEnhance}
              onOpenExtensionModal={onOpenExtensionModal}
            />
          ))}
        </div>
      )}
    </div>
  );
};
