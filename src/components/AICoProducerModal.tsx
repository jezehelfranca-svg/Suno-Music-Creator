import React, { useState } from 'react';
import { X, Sparkles, Copy, Check, Music, Wand2, Lightbulb, RefreshCw, Send } from 'lucide-react';
import { GeneratedPrompt } from '../types';

interface AICoProducerModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptToEnhance?: GeneratedPrompt | null;
  onApplyInspireGenres?: (genres: string[], timeSig: string, minBpm: number, maxBpm: number) => void;
}

export const AICoProducerModal: React.FC<AICoProducerModalProps> = ({
  isOpen,
  onClose,
  promptToEnhance,
  onApplyInspireGenres
}) => {
  const [activeTab, setActiveTab] = useState<'enhance' | 'inspire'>(promptToEnhance ? 'enhance' : 'inspire');
  
  // Enhance state
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedResult, setEnhancedResult] = useState<{
    enhancedSunoTag?: string;
    arrangementNotes?: string[];
    suggestedMetatags?: string[];
    customLyrics?: string;
    aiPowered?: boolean;
    notice?: string;
  } | null>(null);

  // Inspire state
  const [ideaInput, setIdeaInput] = useState('');
  const [isInspiring, setIsInspiring] = useState(false);
  const [inspireResult, setInspireResult] = useState<{
    suggestedGenres?: string[];
    timeSig?: string;
    minBpm?: number;
    maxBpm?: number;
    conceptTitle?: string;
    vibeDescription?: string;
    aiPowered?: boolean;
    notice?: string;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const runEnhance = async () => {
    if (!promptToEnhance) return;
    setIsEnhancing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToEnhance.fullPrompt,
          genres: promptToEnhance.genres,
          timeSig: promptToEnhance.timeSig,
          bpm: promptToEnhance.minBpm,
          key: promptToEnhance.key
        })
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      setEnhancedResult(data);
    } catch (err: unknown) {
      console.warn("Enhance request error:", err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to complete enhancement request');
    } finally {
      setIsEnhancing(false);
    }
  };

  const runInspire = async () => {
    if (!ideaInput.trim()) return;
    setIsInspiring(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/ai/inspire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: ideaInput.trim() })
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      setInspireResult(data);
    } catch (err: unknown) {
      console.warn("Inspire request error:", err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to complete inspiration request');
    } finally {
      setIsInspiring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-900/30">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>AI Co-Producer &amp; Studio Polish</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Gemini Powered
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Suno AI v4 prompting optimization &amp; musical idea translation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/30">
          <button
            type="button"
            onClick={() => setActiveTab('enhance')}
            className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'enhance'
                ? 'border-violet-500 text-violet-300 bg-violet-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            <span>Suno V4 Prompt Polish</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inspire')}
            className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'inspire'
                ? 'border-violet-500 text-violet-300 bg-violet-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lightbulb className="w-4 h-4" />
            <span>Concept Idea to Fusion Matcher</span>
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'enhance' && (
            <div className="space-y-4">
              {promptToEnhance ? (
                <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                  <div className="text-xs text-zinc-400 mb-1">Target Fusion:</div>
                  <div className="text-sm font-bold text-zinc-200">{promptToEnhance.genres.join(' × ')}</div>
                  <div className="text-xs text-zinc-400 mt-1 font-mono">{promptToEnhance.sunoStyleTag}</div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-950/60 rounded-xl border border-zinc-800">
                  No prompt selected. You can trigger polish from any Prompt Card, or click below to polish a sample prompt!
                </div>
              )}

              <button
                type="button"
                disabled={isEnhancing}
                onClick={runEnhance}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isEnhancing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing &amp; Polishing for Suno V4...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate Suno V4 Production Upgrade</span>
                  </>
                )}
              </button>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                  <span>{errorMessage}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-rose-400 hover:text-white text-xs px-1.5 py-0.5 rounded"
                  >
                    ✕
                  </button>
                </div>
              )}

              {enhancedResult?.notice && (
                <div className="text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25 flex items-center gap-1.5">
                  <span className="font-semibold">⚡ Note:</span>
                  <span>{enhancedResult.notice}</span>
                </div>
              )}

              {/* Enhanced Output */}
              {enhancedResult && (
                <div className="space-y-3 pt-2">
                  {/* Optimized Style Tag */}
                  <div className="bg-zinc-950 p-3.5 rounded-xl border border-violet-700/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5" />
                        <span>Optimized Suno V4 Style Box Tag</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(enhancedResult.enhancedSunoTag || '', 'tag')}
                        className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white"
                      >
                        {copiedKey === 'tag' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'tag' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="text-xs font-mono text-zinc-100 leading-relaxed bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                      {enhancedResult.enhancedSunoTag}
                    </p>
                  </div>

                  {/* Production & Arrangement Notes */}
                  {enhancedResult.arrangementNotes && (
                    <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                      <div className="text-xs font-bold text-amber-300 mb-2">
                        Tactical Arrangement &amp; Sound Design:
                      </div>
                      <ul className="space-y-1 text-xs text-zinc-300 list-disc list-inside leading-relaxed">
                        {enhancedResult.arrangementNotes.map((note, i) => (
                          <li key={i}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Custom Lyrics Template */}
                  {enhancedResult.customLyrics && (
                    <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-zinc-200">Suggested Suno Lyric Template:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(enhancedResult.customLyrics || '', 'lyrics')}
                          className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white"
                        >
                          {copiedKey === 'lyrics' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'lyrics' ? 'Copied' : 'Copy Lyrics'}</span>
                        </button>
                      </div>
                      <pre className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                        {enhancedResult.customLyrics}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'inspire' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Describe the song concept, cinematic scene, or mood:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ideaInput}
                    onChange={(e) => setIdeaInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runInspire()}
                    placeholder="e.g. A cyberpunk motorcycle race through a rainy Neo-Tokyo night with screaming guitar solos"
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                  <button
                    type="button"
                    disabled={isInspiring || !ideaInput.trim()}
                    onClick={runInspire}
                    className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isInspiring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Match</span>
                  </button>
                </div>
              </div>

              {/* Quick inspiration examples */}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="text-zinc-500 mr-1">Try ideas:</span>
                {[
                  "Neon noir detective walking down rain-soaked alleys",
                  "Anime battle theme with Babymetal guitars and K-Pop chorus",
                  "Ancient Celtic warrior dance with deep 808 club sub-bass",
                  "Chill late night 3AM lo-fi drive through Yokohama"
                ].map((eg, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setIdeaInput(eg);
                    }}
                    className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors text-left"
                  >
                    {eg}
                  </button>
                ))}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                  <span>{errorMessage}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-rose-400 hover:text-white text-xs px-1.5 py-0.5 rounded"
                  >
                    ✕
                  </button>
                </div>
              )}

              {inspireResult?.notice && (
                <div className="text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25 flex items-center gap-1.5">
                  <span className="font-semibold">⚡ Note:</span>
                  <span>{inspireResult.notice}</span>
                </div>
              )}

              {/* Match Result */}
              {inspireResult && (
                <div className="bg-zinc-950 p-4 rounded-xl border border-violet-800/50 space-y-3 animate-in fade-in">
                  <div>
                    <span className="text-xs text-violet-400 font-mono font-medium">RECOMMENDED FUSION:</span>
                    <h4 className="text-base font-bold text-zinc-100">
                      {inspireResult.suggestedGenres?.join(' × ')}
                    </h4>
                    {inspireResult.vibeDescription && (
                      <p className="text-xs text-zinc-400 mt-1">{inspireResult.vibeDescription}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono text-zinc-300 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                    <span>Meter: <strong className="text-amber-400">{inspireResult.timeSig}</strong></span>
                    <span>•</span>
                    <span>Tempo: <strong className="text-amber-400">{inspireResult.minBpm}–{inspireResult.maxBpm} BPM</strong></span>
                  </div>

                  {onApplyInspireGenres && (
                    <button
                      type="button"
                      onClick={() => {
                        if (inspireResult.suggestedGenres) {
                          onApplyInspireGenres(
                            inspireResult.suggestedGenres,
                            inspireResult.timeSig || '4/4',
                            inspireResult.minBpm || 90,
                            inspireResult.maxBpm || 140
                          );
                          onClose();
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-violet-900/30"
                    >
                      Load into Custom Fusion Architect →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
