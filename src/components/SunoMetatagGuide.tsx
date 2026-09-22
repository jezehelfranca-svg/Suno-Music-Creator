import React, { useState } from 'react';
import { Radio, Copy, Check, Plus, Trash2, ArrowUp, ArrowDown, Sparkles, BookOpen, Layers } from 'lucide-react';
import { SUNO_METATAGS } from '../data/pools';

export const SunoMetatagGuide: React.FC = () => {
  const [selectedTags, setSelectedTags] = useState<string[]>([
    "[Intro]",
    "[Verse 1]",
    "[Pre-Chorus]",
    "[Chorus]",
    "[Verse 2]",
    "[Pre-Chorus]",
    "[Chorus]",
    "[Bridge / Guitar Solo]",
    "[Drop]",
    "[Chorus]",
    "[Outro: Fade Out]"
  ]);

  const [copied, setCopied] = useState(false);

  const addTag = (tag: string) => {
    setSelectedTags(prev => [...prev, tag]);
  };

  const removeTag = (index: number) => {
    setSelectedTags(prev => prev.filter((_, i) => i !== index));
  };

  const moveTag = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= selectedTags.length) return;
    const next = [...selectedTags];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setSelectedTags(next);
  };

  const generateLyricsTemplate = (): string => {
    return selectedTags
      .map(tag => `${tag}\n(Lyrics or instrumental cue here...)\n`)
      .join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateLyricsTemplate());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Suno v4 Prompting Guide */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-bold text-zinc-100">
            Suno Song Architect &amp; Metatag Cheatsheet
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-zinc-400">
          In Suno AI, prompt engineering is divided into two distinct boxes: <strong>Style of Music</strong> and <strong>Lyrics (Custom Mode)</strong>.
          Using bracketed metatags inside the lyrics field directs song arrangement, dynamic shifts, vocal drops, and instrumental breaks!
        </p>

        {/* Pro Tips Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <h4 className="font-bold text-violet-300 mb-1 flex items-center gap-1.5">
              <span>1. Style of Music Box</span>
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              Keep under 180 characters. Use comma-separated genre tokens, mood, key, tempo, and vocal characteristics (e.g. <code>Shoegaze, Trap, 130 BPM, G minor, lush reverb, whispered female vocals</code>).
            </p>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <h4 className="font-bold text-amber-300 mb-1 flex items-center gap-1.5">
              <span>2. Bracket Metatags</span>
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              Place <code>[Intro]</code>, <code>[Verse]</code>, <code>[Chorus]</code>, <code>[Drop]</code> in brackets on their own line. You can add performance notes like <code>[Chorus: anthemic explosion]</code> or <code>[Guitar Solo: fast shredding]</code>.
            </p>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <h4 className="font-bold text-rose-300 mb-1 flex items-center gap-1.5">
              <span>3. Parenthetical Cues</span>
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              Parentheses like <code>(ad-lib echoes)</code> or <code>(bass drops out)</code> indicate backing vocals or subtle performance directions that shouldn&apos;t be sung as primary lyrics.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Song Flow Arranger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Tag Palette */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
          <h3 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet-400" />
            <span>Available Metatag Blocks</span>
          </h3>
          <p className="text-xs text-zinc-400 mb-3">
            Click any metatag block below to append it to your song timeline:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUNO_METATAGS.map((meta, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => addTag(meta.tag)}
                className="p-2.5 rounded-lg bg-zinc-950 hover:bg-violet-950/40 border border-zinc-800 hover:border-violet-600/50 text-left transition-all flex flex-col justify-between group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-violet-300 group-hover:text-violet-200">
                    {meta.tag}
                  </span>
                  <Plus className="w-3.5 h-3.5 text-zinc-500 group-hover:text-violet-400" />
                </div>
                <span className="text-[11px] text-zinc-500 mt-1">
                  {meta.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Song Timeline & Scaffold */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Your Song Structure ({selectedTags.length} Blocks)</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="text-xs text-zinc-500 hover:text-rose-400 transition-colors"
              >
                Clear All
              </button>
            </div>

            {/* Reorderable List */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {selectedTags.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                  No metatags in your timeline. Click blocks on the left to build your song structure!
                </div>
              ) : (
                selectedTags.map((tag, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 text-xs font-mono text-zinc-200"
                  >
                    <span className="font-semibold text-violet-300">
                      {idx + 1}. {tag}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveTag(idx, 'up')}
                        className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === selectedTags.length - 1}
                        onClick={() => moveTag(idx, 'down')}
                        className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTag(idx)}
                        className="p-1 text-zinc-500 hover:text-rose-400"
                        title="Remove block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Copy Scaffold Action */}
          <div className="mt-4 pt-3 border-t border-zinc-800">
            <button
              type="button"
              disabled={selectedTags.length === 0}
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Copied Lyrics Scaffold to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Song Structure Template</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
