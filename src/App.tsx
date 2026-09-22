import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { CustomFusion } from './components/CustomFusion';
import { RandomGenerator } from './components/RandomGenerator';
import { StyleLibrary } from './components/StyleLibrary';
import { GenreExplorer } from './components/GenreExplorer';
import { SunoMetatagGuide } from './components/SunoMetatagGuide';
import { FavoritesView } from './components/FavoritesView';
import { AICoProducerModal } from './components/AICoProducerModal';
import { getAudioMetronome } from './utils/audioPreview';
import { GeneratedPrompt } from './types';
import { STYLE_LIBRARY } from './data/styleLibrary';

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

  // Template / routing state
  const [customTemplate, setCustomTemplate] = useState<{
    genre1?: string;
    genre2?: string;
    genre3?: string;
    timeSig?: string;
    bpm?: number;
  } | null>(null);

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
        isMetronomePlaying={isMetronomePlaying}
        toggleMetronome={toggleMetronome}
        metronomeBpm={metronomeBpm}
        metronomeMeter={metronomeMeter}
        currentBeat={currentBeat}
        totalBeats={totalBeats}
        onOpenAiInspire={openAiInspire}
      />

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
          />
        )}

        {activeTab === 'random' && (
          <RandomGenerator
            onTestMetronome={startOrUpdateMetronome}
            onAiEnhance={openAiEnhance}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
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
          />
        )}
      </main>

      {/* AI Co-Producer Modal */}
      <AICoProducerModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        promptToEnhance={aiPromptTarget}
        onApplyInspireGenres={handleApplyInspireGenres}
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
