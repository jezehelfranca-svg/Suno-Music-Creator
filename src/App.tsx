import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { CustomFusion } from './components/CustomFusion';
import { RandomGenerator } from './components/RandomGenerator';
import { StyleLibrary } from './components/StyleLibrary';
import { GenreExplorer } from './components/GenreExplorer';
import { SunoMetatagGuide } from './components/SunoMetatagGuide';
import { FavoritesView } from './components/FavoritesView';
import { AICoProducerModal } from './components/AICoProducerModal';
import { PromptHistoryDrawer } from './components/PromptHistoryDrawer';
import { ExtensionModal } from './components/ExtensionModal';
import { getAudioMetronome } from './utils/audioPreview';
import { GeneratedPrompt, CustomTemplateState } from './types';
import { STYLE_LIBRARY } from './data/styleLibrary';
import { RotateCcw, X, CheckCircle2, Download, FileArchive } from 'lucide-react';

const SESSION_HISTORY_KEY = 'suno_fusion_prompt_history_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<'custom' | 'random' | 'library' | 'explore' | 'architect' | 'favorites'>('custom');
  
  // Metronome Groove Player state
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [metronomeMeter, setMetronomeMeter] = useState('4/4');
  const [currentBeat, setCurrentBeat] = useState(0);
  const [totalBeats, setTotalBeats] = useState(4);

  // Favorites persistence
  const [favorites, setFavorites] = useState<GeneratedPrompt[]>(() => {
    try {
      const saved = localStorage.getItem('suno_fusion_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('suno_fusion_favorites', JSON.stringify(favorites));
    } catch (e) {
      console.error(e);
    }
  }, [favorites]);

  const toggleFavorite = (prompt: GeneratedPrompt) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.id === prompt.id || f.fullPrompt === prompt.fullPrompt);
      if (exists) {
        return prev.filter(f => f.id !== prompt.id && f.fullPrompt !== prompt.fullPrompt);
      } else {
        return [prompt, ...prev];
      }
    });
  };

  // Local Session Prompt History (last 10 generated iterations)
  const [promptHistory, setPromptHistory] = useState<GeneratedPrompt[]>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_HISTORY_KEY);
      return saved ? JSON.parse(saved).slice(0, 10) : [];
    } catch {
      return [];
    }
  });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [revertToast, setRevertToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(promptHistory.slice(0, 10)));
    } catch (e) {
      console.error(e);
    }
  }, [promptHistory]);

  const handleAddToHistory = useCallback((newPrompts: GeneratedPrompt[]) => {
    if (!newPrompts || newPrompts.length === 0) return;
    setPromptHistory(prev => {
      const incoming = [...newPrompts].reverse();
      const seen = new Set<string>();
      const combined: GeneratedPrompt[] = [];

      for (const p of incoming) {
        if (!seen.has(p.fullPrompt) && !seen.has(p.id)) {
          seen.add(p.fullPrompt);
          seen.add(p.id);
          combined.push(p);
        }
      }

      for (const p of prev) {
        if (!seen.has(p.fullPrompt) && !seen.has(p.id)) {
          seen.add(p.fullPrompt);
          seen.add(p.id);
          combined.push(p);
        }
      }

      return combined.slice(0, 10);
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    setPromptHistory([]);
    try {
      sessionStorage.removeItem(SESSION_HISTORY_KEY);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Metronome control
  const startOrUpdateMetronome = useCallback((bpm: number, meter: string) => {
    const metronome = getAudioMetronome();
    setMetronomeBpm(bpm);
    setMetronomeMeter(meter);
    metronome.setBpm(bpm);
    metronome.setTimeSignature(meter);
    setTotalBeats(metronome.getBeatCount());

    metronome.setOnBeat((beat, total) => {
      setCurrentBeat(beat);
      setTotalBeats(total);
    });

    metronome.start();
    setIsMetronomePlaying(true);
  }, []);

  const toggleMetronome = () => {
    const metronome = getAudioMetronome();
    if (isMetronomePlaying) {
      metronome.stop();
      setIsMetronomePlaying(false);
      setCurrentBeat(0);
    } else {
      startOrUpdateMetronome(metronomeBpm, metronomeMeter);
    }
  };

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPromptTarget, setAiPromptTarget] = useState<GeneratedPrompt | null>(null);

  const openAiEnhance = (prompt: GeneratedPrompt) => {
    setAiPromptTarget(prompt);
    setAiModalOpen(true);
  };

  const openAiInspire = () => {
    setAiPromptTarget(null);
    setAiModalOpen(true);
  };

  // Extension Modal state
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [extensionPromptTarget, setExtensionPromptTarget] = useState<GeneratedPrompt | null>(null);
  const [showDownloadBanner, setShowDownloadBanner] = useState(true);

  const openExtensionModal = (prompt?: GeneratedPrompt) => {
    setExtensionPromptTarget(prompt || null);
    setExtensionModalOpen(true);
  };

  // Template / routing state
  const [customTemplate, setCustomTemplate] = useState<CustomTemplateState | null>(null);

  const handleRevertToPrompt = useCallback((prompt: GeneratedPrompt) => {
    setCustomTemplate({
      genre1: prompt.genres[0] || '',
      genre2: prompt.genres[1] || '',
      genre3: prompt.genres[2] || '',
      timeSig: prompt.timeSig,
      bpm: prompt.minBpm,
      minBpm: prompt.minBpm,
      maxBpm: prompt.maxBpm,
      instruments: prompt.selectedInstruments || [],
      restoredPrompt: prompt
    });
    if (prompt.minBpm) {
      startOrUpdateMetronome(prompt.minBpm, prompt.timeSig);
    }
    setActiveTab('custom');
    setRevertToast(
      `Reverted to iteration: ${prompt.genres.join(' × ')} (${prompt.timeSig}, ${prompt.minBpm} BPM)`
    );
    setTimeout(() => {
      setRevertToast(prev => (prev?.includes(prompt.genres[0] || '') ? null : prev));
    }, 4500);
  }, [startOrUpdateMetronome]);

  const handleUseAsTemplate = (timeSig: string, bpm: number | null, _promptText: string) => {
    setCustomTemplate({
      timeSig,
      bpm: bpm || undefined
    });
    if (bpm) {
      startOrUpdateMetronome(bpm, timeSig);
    }
    setActiveTab('custom');
  };

  const handleSelectGenreForFusion = (genre: string, slot: 1 | 2) => {
    setCustomTemplate(prev => ({
      ...prev,
      genre1: slot === 1 ? genre : prev?.genre1,
      genre2: slot === 2 ? genre : prev?.genre2
    }));
    setActiveTab('custom');
  };

  const handleApplyInspireGenres = (genres: string[], timeSig: string, minBpm: number, _maxBpm: number) => {
    setCustomTemplate({
      genre1: genres[0] || '',
      genre2: genres[1] || '',
      genre3: genres[2] || '',
      timeSig,
      bpm: minBpm
    });
    startOrUpdateMetronome(minBpm, timeSig);
    setActiveTab('custom');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-violet-600 selection:text-white">
      {/* Studio Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => setActiveTab(tab as any)}
        favoritesCount={favorites.length}
        historyCount={promptHistory.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenExtensionModal={() => openExtensionModal()}
        isMetronomePlaying={isMetronomePlaying}
        toggleMetronome={toggleMetronome}
        metronomeBpm={metronomeBpm}
        metronomeMeter={metronomeMeter}
        currentBeat={currentBeat}
        totalBeats={totalBeats}
        onOpenAiInspire={openAiInspire}
      />

      {/* Revert Notification Toast */}
      {revertToast && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-violet-950/80 border border-violet-700/60 text-violet-200 px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm shadow-lg shadow-violet-950/50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{revertToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setRevertToast(null)}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-violet-900/40 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Prominent Direct Extension ZIP Download Banner */}
      {showDownloadBanner && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-gradient-to-r from-violet-950/90 via-indigo-950/70 to-zinc-900/90 border border-violet-500/50 rounded-2xl p-4 sm:p-5 shadow-xl shadow-violet-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-violet-800/50 mt-0.5">
                <FileArchive className="w-5 h-5 text-amber-300" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Suno AutoFill Extension ZIP (Edge &amp; Chrome)
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    Ready to Download
                  </span>
                </div>
                <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed">
                  Automatically fills Style of Music, Structure Metatags, Lyrics, and Title straight into <strong className="text-violet-300">suno.com/create</strong> with 1 click.
                </p>
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-zinc-400 pt-1 flex-wrap">
                  <span><strong className="text-zinc-200">1.</strong> Click Download ZIP</span>
                  <span>•</span>
                  <span><strong className="text-zinc-200">2.</strong> Right-click Extract ZIP</span>
                  <span>•</span>
                  <span><strong className="text-zinc-200">3.</strong> In Edge/Chrome Extensions, click "Load unpacked"</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <a
                href="/api/download-extension-zip"
                download="suno-fusion-extension.zip"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/40 transition-all hover:scale-[1.02] active:scale-95"
              >
                <Download className="w-4 h-4 text-amber-300" />
                <span>Download Extension (.ZIP)</span>
              </a>

              <button
                type="button"
                onClick={() => openExtensionModal()}
                className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 transition-colors cursor-pointer"
                title="View step-by-step install guide"
              >
                Install Guide
              </button>

              <button
                type="button"
                onClick={() => setShowDownloadBanner(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900/80 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'custom' && (
          <CustomFusion
            key={customTemplate ? JSON.stringify(customTemplate) : 'default-custom'}
            onTestMetronome={startOrUpdateMetronome}
            onAiEnhance={openAiEnhance}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            initialTemplate={customTemplate}
            promptHistory={promptHistory}
            onAddToHistory={handleAddToHistory}
            onRevertToPrompt={handleRevertToPrompt}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenExtensionModal={openExtensionModal}
          />
        )}

        {activeTab === 'random' && (
          <RandomGenerator
            onTestMetronome={startOrUpdateMetronome}
            onAiEnhance={openAiEnhance}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            promptHistory={promptHistory}
            onAddToHistory={handleAddToHistory}
            onRevertToPrompt={handleRevertToPrompt}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenExtensionModal={openExtensionModal}
          />
        )}

        {activeTab === 'library' && (
          <StyleLibrary
            onUseAsTemplate={handleUseAsTemplate}
            onTestMetronome={startOrUpdateMetronome}
          />
        )}

        {activeTab === 'explore' && (
          <GenreExplorer
            onSelectForFusion={handleSelectGenreForFusion}
          />
        )}

        {activeTab === 'architect' && (
          <SunoMetatagGuide />
        )}

        {activeTab === 'favorites' && (
          <FavoritesView
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onTestMetronome={startOrUpdateMetronome}
            onAiEnhance={openAiEnhance}
            onBackToCustom={() => setActiveTab('custom')}
            onOpenExtensionModal={openExtensionModal}
          />
        )}
      </main>

      {/* Prompt History Drawer */}
      <PromptHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={promptHistory}
        currentPromptId={customTemplate?.restoredPrompt?.id}
        onRevertToPrompt={handleRevertToPrompt}
        onClearHistory={handleClearHistory}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onTestMetronome={startOrUpdateMetronome}
        onAiEnhance={openAiEnhance}
      />

      {/* AI Co-Producer Modal */}
      <AICoProducerModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        promptToEnhance={aiPromptTarget}
        onApplyInspireGenres={handleApplyInspireGenres}
      />

      {/* Chrome & Edge Suno AutoFill Extension Modal */}
      <ExtensionModal
        isOpen={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
        activePrompt={extensionPromptTarget}
      />

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Suno Fusion Prompt Generator — Optimized for Suno AI v4 and v3.5
          </span>
          <span className="font-mono text-zinc-600">
            374 Genres • {STYLE_LIBRARY.reduce((s, c) => s + c.prompts.length, 0)} Curated Prompts ({STYLE_LIBRARY.length} Sets) • Audio Metronome Synthesizer
          </span>
        </div>
      </footer>
    </div>
  );
}

