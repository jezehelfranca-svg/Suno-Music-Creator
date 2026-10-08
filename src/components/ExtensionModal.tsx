import React, { useState } from 'react';
import {
  Download,
  Check,
  Copy,
  ExternalLink,
  X,
  Code2,
  Puzzle,
  Zap,
  Layers,
  Sparkles,
  ArrowRight,
  Info,
  Laptop,
  CheckCircle2,
  FileCode,
  Globe
} from 'lucide-react';
import { GeneratedPrompt } from '../types';
import { getExtensionSourceCode, downloadExtensionZip } from '../utils/extensionGenerator';
import { syncCreationToExtension } from '../utils/extensionSync';

interface ExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePrompt?: GeneratedPrompt | null;
}

type GuideTab = 'edge' | 'chrome' | 'simulator' | 'code';
type CodeTab = 'manifest.json' | 'content.js' | 'content.css' | 'popup.html' | 'popup.js' | 'README.md';

export const ExtensionModal: React.FC<ExtensionModalProps> = ({
  isOpen,
  onClose,
  activePrompt
}) => {
  const [activeGuideTab, setActiveGuideTab] = useState<GuideTab>('edge');
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>('content.js');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copiedFile, setCopiedFile] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [copyJsonSuccess, setCopyJsonSuccess] = useState(false);

  // Simulator state
  const [simCustomMode, setSimCustomMode] = useState(true);
  const [simStyle, setSimStyle] = useState('');
  const [simLyrics, setSimLyrics] = useState('');
  const [simTitle, setSimTitle] = useState('');
  const [simFilled, setSimFilled] = useState(false);

  if (!isOpen) return null;

  const sourceCode = getExtensionSourceCode(activePrompt);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadExtensionZip(activePrompt);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3500);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyCode = () => {
    const code = sourceCode[activeCodeTab];
    navigator.clipboard.writeText(code);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const handleRunSimulator = () => {
    setSimCustomMode(true);
    const styleVal = activePrompt?.sunoStyleTag || 'Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass, Roland Juno-106';
    const lyricsVal = activePrompt?.lyricSnippet || '[Intro]\n[808 Sub Bass and Roland Juno-106 establish the opening groove]\n[Verse 1]\n[Sparse 808 Sub Bass pulse with muted Roland Juno-106 accompaniment]\n\n[Pre-Chorus]\n[Rising Roland Juno-106 tension with Percussion building momentum]\n\n[Chorus]\n[Full arrangement: soaring Roland Juno-106 lead over driving 808 Sub Bass]\n\n[Verse 2]\n[Groove deepens: syncopated 808 Sub Bass with Roland Juno-106 counter-melody]\n\n[Drop]\n[Heavy instrumental breakdown: 808 Sub Bass and Roland Juno-106 trading solo phrases]\n[Outro]\n[Gradual decompression as Roland Juno-106 harmonics ring out]\n\n[Fade Out]';
    const titleVal = activePrompt?.title || 'Nebula Drift';

    setSimStyle(styleVal);
    setSimLyrics(lyricsVal);
    setSimTitle(titleVal);
    setSimFilled(true);
    setTimeout(() => setSimFilled(false), 3000);
  };

  const handleResetSimulator = () => {
    setSimStyle('');
    setSimLyrics('');
    setSimTitle('');
    setSimFilled(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-violet-900/40">
              <Zap className="w-5 h-5 fill-amber-300 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                  Suno 1-Click AutoFill Extension
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Edge &amp; Chrome (Manifest V3)
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Automatically fill Style of Music, Lyrics, Structure Tags &amp; Titles straight into <strong className="text-violet-300">suno.com/create</strong>.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Download Action Banner */}
        <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-violet-950/40 via-indigo-950/30 to-zinc-900/50 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Puzzle className="w-5 h-5 text-violet-400 shrink-0" />
            <div className="text-xs text-zinc-300">
              <span>Ready-to-load extension package with manifest, content scripts, and floating Suno widget.</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Downloaded ZIP!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{isDownloading ? 'Packaging...' : 'Download Extension (.ZIP)'}</span>
                </>
              )}
            </button>

            <a
              href="https://suno.com/create"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all"
            >
              <span>Open Suno</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </a>
          </div>
        </div>

        {/* Active Studio Song Banner */}
        <div className="mx-4 sm:mx-6 mt-3 p-3.5 rounded-xl bg-gradient-to-r from-violet-950/40 via-purple-950/30 to-zinc-900 border border-violet-500/30 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base">🎵</span>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-violet-300">Active Studio Song:</span>
                <span className="text-xs sm:text-sm font-extrabold text-white">"{activePrompt?.title || 'Nebula Drift'}"</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  ● Synced to Extension
                </span>
              </div>
              <p className="text-xs text-zinc-400 line-clamp-1">
                <strong className="text-zinc-300">Style:</strong> {activePrompt?.sunoStyleTag || activePrompt?.fullPrompt || 'Dream Pop, TRAP & DRILL, 140 BPM, female vocals'}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  Gender: <strong className="text-violet-300">{activePrompt?.vocalGender || 'Female'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  Weirdness: <strong className="text-amber-300">{activePrompt?.weirdness ?? 50}%</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  Influence: <strong className="text-pink-300">{activePrompt?.styleInfluence ?? 85}%</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (activePrompt) {
                    syncCreationToExtension(activePrompt);
                    setPushSuccess(true);
                    setTimeout(() => setPushSuccess(false), 2500);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-900/30 transition-all cursor-pointer"
              >
                {pushSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Pushed to Extension!</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    <span>Push to Extension Popup</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activePrompt) {
                    navigator.clipboard.writeText(JSON.stringify(activePrompt, null, 2));
                    setCopyJsonSuccess(true);
                    setTimeout(() => setCopyJsonSuccess(false), 2000);
                  }
                }}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all cursor-pointer"
              >
                {copyJsonSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copyJsonSuccess ? 'Copied!' : 'Copy JSON'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-zinc-800 bg-zinc-900/20 flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveGuideTab('edge')}
            className={`px-3 py-2 rounded-t-lg text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeGuideTab === 'edge'
                ? 'border-violet-500 text-violet-300 bg-zinc-900/60'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Microsoft Edge Guide</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveGuideTab('chrome')}
            className={`px-3 py-2 rounded-t-lg text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeGuideTab === 'chrome'
                ? 'border-violet-500 text-violet-300 bg-zinc-900/60'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Google Chrome Guide</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveGuideTab('simulator')}
            className={`px-3 py-2 rounded-t-lg text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeGuideTab === 'simulator'
                ? 'border-violet-500 text-violet-300 bg-zinc-900/60'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Suno AutoFill Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveGuideTab('code')}
            className={`px-3 py-2 rounded-t-lg text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeGuideTab === 'code'
                ? 'border-violet-500 text-violet-300 bg-zinc-900/60'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Inspect Source Code</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin space-y-6">
          {/* Microsoft Edge Installation Guide */}
          {activeGuideTab === 'edge' && (
            <div className="space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                  <span>How to install in Microsoft Edge (Under 10 Seconds)</span>
                </h3>

                <ol className="space-y-3 text-xs text-zinc-300">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">A</span>
                    <div>
                      Click <strong>"Download Extension (.ZIP)"</strong> above and unzip the downloaded <code className="px-1 py-0.5 rounded bg-zinc-950 text-violet-300 font-mono">suno-fusion-extension.zip</code> to a folder on your computer.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">B</span>
                    <div>
                      Open a new tab in Microsoft Edge and type in the address bar:{' '}
                      <code className="px-1.5 py-0.5 rounded bg-zinc-950 text-amber-300 font-mono font-bold select-all">edge://extensions</code>
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">C</span>
                    <div>
                      In the left sidebar of the Extensions page, turn <strong>ON</strong> the toggle switch labeled <strong>"Developer mode"</strong>.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">D</span>
                    <div>
                      Click the <strong>"Load unpacked"</strong> button that appears at the top, and select your unzipped <code className="px-1 py-0.5 rounded bg-zinc-950 text-violet-300 font-mono">suno-fusion-extension</code> folder.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">E</span>
                    <div>
                      <strong>You're ready!</strong> Pin the extension to your Edge toolbar. Now navigate to{' '}
                      <a href="https://suno.com/create" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline font-semibold">
                        suno.com/create
                      </a>
                      . A glowing <strong>⚡ Suno Fusion</strong> floating widget will appear on Suno, allowing 1-click autofill!
                    </div>
                  </li>
                </ol>
              </div>

              {/* Feature Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="text-violet-400 font-semibold text-xs flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto Custom Mode</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Automatically clicks the "Custom" mode toggle on Suno so the Style of Music and Lyrics fields are always accessible.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>React-Safe Dispatch</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Dispatches native HTML prototype setters and synthetic input events so Suno's React state immediately updates without losing text.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="text-amber-400 font-semibold text-xs flex items-center gap-1.5 mb-1">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Floating Suno Widget</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Subtle corner button on suno.com lets you swap genre fusions or paste prompts without leaving Suno's tab.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Google Chrome Installation Guide */}
          {activeGuideTab === 'chrome' && (
            <div className="space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                  <span>How to install in Google Chrome (Under 10 Seconds)</span>
                </h3>

                <ol className="space-y-3 text-xs text-zinc-300">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">A</span>
                    <div>
                      Click <strong>"Download Extension (.ZIP)"</strong> above and unzip the <code className="px-1 py-0.5 rounded bg-zinc-950 text-violet-300 font-mono">suno-fusion-extension.zip</code> file.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">B</span>
                    <div>
                      Open a new tab in Google Chrome and type in the address bar:{' '}
                      <code className="px-1.5 py-0.5 rounded bg-zinc-950 text-amber-300 font-mono font-bold select-all">chrome://extensions</code>
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">C</span>
                    <div>
                      In the top-right corner of the Extensions page, turn <strong>ON</strong> the toggle switch labeled <strong>"Developer mode"</strong>.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">D</span>
                    <div>
                      Click the <strong>"Load unpacked"</strong> button in the top-left corner, and select your unzipped <code className="px-1 py-0.5 rounded bg-zinc-950 text-violet-300 font-mono">suno-fusion-extension</code> folder.
                    </div>
                  </li>

                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold">E</span>
                    <div>
                      Open <a href="https://suno.com/create" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline font-semibold">suno.com/create</a>, click the extension icon or use the floating <strong>⚡ Suno Fusion</strong> button to fill prompts in 1 click!
                    </div>
                  </li>
                </ol>
              </div>

              {/* Note on Brave / Opera / Chromium */}
              <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-900/40 text-xs text-violet-300 flex items-center gap-2.5">
                <Info className="w-4 h-4 shrink-0 text-violet-400" />
                <span>
                  <strong>Also works on Brave, Opera, Arc, and Vivaldi!</strong> All Chromium browsers use the exact same Manifest V3 unpacked loader.
                </span>
              </div>
            </div>
          )}

          {/* Interactive Suno Form AutoFill Simulator */}
          {activeGuideTab === 'simulator' && (
            <div className="space-y-4">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <span>Simulated Suno Creation Form</span>
                      {simFilled && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                          ✓ Auto-Filled!
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Test how the extension finds and injects values into Suno's React inputs safely.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunSimulator}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-violet-900/30 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                      <span>Simulate AutoFill</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetSimulator}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Simulated Suno UI */}
                <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-4 space-y-4 font-sans">
                  {/* Suno Header bar */}
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800 text-xs">
                    <span className="font-bold text-zinc-200">Suno Studio Mockup (suno.com/create)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 text-[11px]">Custom Mode:</span>
                      <button
                        type="button"
                        onClick={() => setSimCustomMode(!simCustomMode)}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                          simCustomMode ? 'bg-violet-600' : 'bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                            simCustomMode ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Suno Form Fields */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                          <span>Style of Music</span>
                          <span className="text-[10px] text-violet-400 font-mono font-normal">(Extension Target 1)</span>
                        </label>
                        <span className="text-[10px] text-zinc-500 font-mono">120 chars max / style tags</span>
                      </div>
                      <textarea
                        rows={3}
                        value={simStyle}
                        onChange={e => setSimStyle(e.target.value)}
                        placeholder="Enter style of music or genre fusion..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                          <span>Lyrics &amp; Structure Tags</span>
                          <span className="text-[10px] text-violet-400 font-mono font-normal">(Extension Target 2)</span>
                        </label>
                        <span className="text-[10px] text-zinc-500 font-mono">[Verse], [Chorus] scaffold</span>
                      </div>
                      <textarea
                        rows={3}
                        value={simLyrics}
                        onChange={e => setSimLyrics(e.target.value)}
                        placeholder="[Verse 1]&#10;Write custom lyrics or let Suno create..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-300 mb-1">
                        <span>Title (Optional)</span>
                        <span className="text-[10px] text-violet-400 font-mono font-normal ml-2">(Extension Target 3)</span>
                      </label>
                      <input
                        type="text"
                        value={simTitle}
                        onChange={e => setSimTitle(e.target.value)}
                        placeholder="Song Title"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Source Code Inspector */}
          {activeGuideTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
                  {(['manifest.json', 'content.js', 'content.css', 'popup.html', 'popup.js', 'README.md'] as CodeTab[]).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveCodeTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        activeCodeTab === tab
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                >
                  {copiedFile ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFile ? 'Copied File!' : `Copy ${activeCodeTab}`}</span>
                </button>
              </div>

              {/* Code display block */}
              <div className="relative rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
                  <span>{activeCodeTab}</span>
                  <span>Manifest V3</span>
                </div>
                <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed max-h-[380px] scrollbar-thin">
                  {sourceCode[activeCodeTab]}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-zinc-400">
            Compatible with <strong>Microsoft Edge</strong>, <strong>Google Chrome</strong>, <strong>Brave</strong> &amp; all Chromium browsers.
          </span>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors cursor-pointer shadow-md shadow-violet-900/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .ZIP</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
