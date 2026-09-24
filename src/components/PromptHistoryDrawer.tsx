import React, { useState } from 'react';
import {
  History,
  X,
  RotateCcw,
  Copy,
  Check,
  Volume2,
  Sparkles,
  Heart,
  Trash2,
  Search,
  Layers,
  Clock,
  ArrowRight,
  Disc,
  Info
} from 'lucide-react';
import { GeneratedPrompt, SunoPromptFormat } from '../types';
import { formatPromptForCopy } from '../utils/sunoFormatter';

interface PromptHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: GeneratedPrompt[];
  currentPromptId?: string;
  onRevertToPrompt: (prompt: GeneratedPrompt) => void;
  onClearHistory: () => void;
  favorites: GeneratedPrompt[];
  onToggleFavorite: (prompt: GeneratedPrompt) => void;
  onTestMetronome: (bpm: number, timeSig: string) => void;
  onAiEnhance: (prompt: GeneratedPrompt) => void;
}

export const PromptHistoryDrawer: React.FC<PromptHistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  currentPromptId,
  onRevertToPrompt,
  onClearHistory,
  favorites,
  onToggleFavorite,
  onTestMetronome,
  onAiEnhance
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedFullPromptId, setExpandedFullPromptId] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const filteredHistory = history.filter(p => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.genres.some(g => g.toLowerCase().includes(term)) ||
      p.fullPrompt.toLowerCase().includes(term) ||
      p.sunoStyleTag.toLowerCase().includes(term) ||
      (p.title && p.title.toLowerCase().includes(term))
    );
  });

  const handleCopyTag = (prompt: GeneratedPrompt) => {
    const text = formatPromptForCopy(prompt, 'suno-tag');
    navigator.clipboard.writeText(text);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleRevert = (prompt: GeneratedPrompt) => {
    onRevertToPrompt(prompt);
    onClose();
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diff < 30) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop click to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                  Prompt Session History
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  {history.length}/10
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Last 10 generated iterations in this local session — revert anytime without saving.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <>
                {showConfirmClear ? (
                  <div className="flex items-center gap-1.5 bg-rose-950/60 border border-rose-800/60 px-2 py-1 rounded-lg">
                    <span className="text-[11px] text-rose-300 font-medium">Clear all?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClearHistory();
                        setShowConfirmClear(false);
                      }}
                      className="px-2 py-0.5 text-xs rounded bg-rose-600 text-white font-semibold hover:bg-rose-500 cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConfirmClear(false)}
                      className="px-1.5 py-0.5 text-xs rounded text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmClear(true)}
                    title="Clear history for this session"
                    className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="px-4 py-2.5 bg-violet-950/20 border-b border-violet-900/30 flex items-center gap-2 text-xs text-violet-300/90">
          <Info className="w-4 h-4 shrink-0 text-violet-400" />
          <span>
            Reverting to any iteration restores its <strong>genres</strong>, <strong>instruments</strong>, <strong>tempo</strong>, and <strong>metaprompt</strong> straight into the Studio.
          </span>
        </div>

        {/* Filter bar */}
        {history.length > 2 && (
          <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/30">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search history by genre or style..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        )}

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin">
          {history.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-600 mb-3">
                <Clock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-zinc-300">
                No Prompt Iterations Yet
              </h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Generate any custom fusion or roulette roll. Your last 10 iterations will be automatically recorded here so you can easily step back and forth.
              </p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              No previous iterations match "{searchTerm}".
            </div>
          ) : (
            filteredHistory.map((prompt, index) => {
              const isCurrent = prompt.id === currentPromptId;
              const isFav = favorites.some(
                f => f.id === prompt.id || f.fullPrompt === prompt.fullPrompt
              );
              const isExpanded = expandedFullPromptId === prompt.id;
              const iterationNumber = history.length - index;

              return (
                <div
                  key={prompt.id || `${prompt.createdAt}-${index}`}
                  className={`rounded-xl border transition-all p-4 ${
                    isCurrent
                      ? 'bg-violet-950/20 border-violet-600/50 shadow-lg shadow-violet-950/30 ring-1 ring-violet-500/30'
                      : 'bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700/80'
                  }`}
                >
                  {/* Top Bar: Iteration Number, Timestamp, Status & Primary Revert Action */}
                  <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                        #{iterationNumber}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {formatRelativeTime(prompt.createdAt)}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Active in Studio</span>
                        </span>
                      )}
                    </div>

                    {/* Revert Action Button */}
                    <button
                      type="button"
                      onClick={() => handleRevert(prompt)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                        isCurrent
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                          : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20 hover:scale-[1.02]'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isCurrent ? 'Reload into Studio' : 'Revert to this Iteration'}</span>
                    </button>
                  </div>

                  {/* Genres collision & title */}
                  <div className="mb-2">
                    <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5 flex-wrap">
                      <span>{prompt.genres.join(' × ')}</span>
                      {prompt.title && (
                        <span className="text-xs text-violet-400 font-normal italic font-mono">
                          “{prompt.title}”
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Badges: Meter, BPM, Key, Bitrate */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-zinc-300 border border-zinc-800 font-mono">
                      {prompt.timeSig}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-amber-300 border border-amber-900/40 font-mono">
                      {prompt.minBpm === prompt.maxBpm
                        ? `${prompt.minBpm} BPM`
                        : `${prompt.minBpm}–${prompt.maxBpm} BPM`}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-zinc-300 border border-zinc-800 font-mono">
                      {prompt.key}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-950/80 text-zinc-400 border border-zinc-800 font-mono">
                      {prompt.bitrate} kbps
                    </span>
                    {prompt.selectedInstruments && prompt.selectedInstruments.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 font-mono text-[10px]">
                        {prompt.selectedInstruments.length} gear locked
                      </span>
                    )}
                  </div>

                  {/* Featured Instruments (if any) */}
                  {prompt.selectedInstruments && prompt.selectedInstruments.length > 0 && (
                    <div className="mb-2.5 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-[11px]">
                      <div className="text-[10px] text-zinc-500 font-mono mb-1">
                        LOCKED RIG:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {prompt.selectedInstruments.map((inst, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-200 border border-amber-500/20 font-mono text-[10px]"
                          >
                            {inst}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suno Style Box Tag Preview */}
                  <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/90 text-xs font-mono text-zinc-300 leading-relaxed relative group/box mb-2">
                    <p className="line-clamp-2 pr-12">{prompt.sunoStyleTag}</p>
                    <button
                      type="button"
                      onClick={() => handleCopyTag(prompt)}
                      className="absolute right-2 top-2 p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Copy Suno Style Box Tag"
                    >
                      {copiedId === prompt.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Expandable Metaprompt */}
                  {isExpanded && (
                    <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/80 text-xs text-zinc-300 mb-2 leading-relaxed italic">
                      <span className="text-[10px] font-mono text-violet-400 not-italic block mb-1">
                        FULL METAPROMPT:
                      </span>
                      {prompt.fullPrompt}
                    </div>
                  )}

                  {/* Card bottom toolbar */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedFullPromptId(isExpanded ? null : prompt.id)
                      }
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      {isExpanded ? 'Hide Metaprompt' : 'View Metaprompt'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onTestMetronome(prompt.minBpm, prompt.timeSig)
                        }
                        title="Test groove in metronome"
                        className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-amber-300 border border-zinc-700/60 transition-colors cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAiEnhance(prompt);
                          onClose();
                        }}
                        title="AI Co-Producer Polish"
                        className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-violet-300 border border-zinc-700/60 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(prompt)}
                        title={isFav ? 'Remove from saved' : 'Save to favorites'}
                        className={`p-1 rounded border transition-colors cursor-pointer ${
                          isFav
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                            : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-rose-400 hover:bg-zinc-700'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-400' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between text-xs text-zinc-500">
          <span>Session history persists until tab close</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
