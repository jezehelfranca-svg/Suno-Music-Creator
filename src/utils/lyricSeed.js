/**
 * Suno Structural & Instrument Cue Scaffold Generator
 * Generates pure [Section] + [Instrument / Musical Direction] scaffolds
 * with zero pre-filled sung lyrics.
 */

const REQUIRED_SECTIONS = [
  '[Intro]',
  '[Verse 1]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Verse 2]',
  '[Drop]',
  '[Outro]',
  '[Fade Out]'
];

export function cleanInstrumentName(raw) {
  const s = String(raw || '')
    .replace(/[*_`#]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  return s || '';
}

export function extractInstrumentsFromPrompt(promptStr = '') {
  const parts = String(promptStr || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const filtered = parts.filter((p) => {
    const low = p.toLowerCase();
    if (/\b\d+\s*bpm\b/i.test(low)) return false;
    if (/\b\d+\/\d+\b/.test(low)) return false;
    if (low.includes('vocals') || low.includes('production') || low.includes('groove') || low.includes('duration')) return false;
    return p.length >= 3 && p.length <= 42;
  });
  return filtered.slice(2, 5);
}

const INTRO_CUES = [
  (i1, i2) => `[${i1} and ${i2} establish the opening groove]`,
  (i1, i2) => `[Atmospheric ${i1} motif over a warm ${i2} bed]`,
  (i1, i2) => `[Solo ${i1} riff introduces the main theme before ${i2} enters]`,
  (i1, i2) => `[Syncopated ${i1} figure locked in with ${i2}]`
];

const VERSE1_CUES = [
  (i1, i2) => `[Sparse ${i1} pulse with muted ${i2} accompaniment]`,
  (i1, i2) => `[Stripped-back ${i2} rhythm leaving space around ${i1} accents]`,
  (i1, i2) => `[Low-register ${i1} groove and restrained ${i2} chords]`,
  (i1, i2) => `[Intimate ${i1} phrasing over a steady ${i2} pocket]`
];

const PRE_CHORUS_CUES = [
  (i2, i3) => `[Rising ${i2} tension with ${i3} building momentum]`,
  (i2, i3) => `[Swelling ${i2} harmonics and tightening ${i3} drive]`,
  (i2, i3) => `[Staccato ${i2} build and ascending ${i3} fills]`,
  (i2, i3) => `[Layered ${i2} crescendos pushing into the hook]`
];

const CHORUS_CUES = [
  (i1, i2, i3) => `[Full arrangement: soaring ${i1} lead over driving ${i2} and ${i3}]`,
  (i1, i2, i3) => `[Wide ensemble hook led by ${i1}, ${i2}, and ${i3}]`,
  (i1, i2, i3) => `[High-energy ${i1} melody locked with ${i2} and ${i3}]`,
  (i1, i2, i3) => `[Anthemic ${i1} and ${i2} interplay at full dynamic weight]`
];

const VERSE2_CUES = [
  (i1, i2, i3) => `[Groove deepens: syncopated ${i2} with ${i1} and ${i3} counter-melody]`,
  (i1, i2, i3) => `[Stripped-back ${i1} variation with subtle ${i3} textures]`,
  (i1, i2, i3) => `[Walking ${i2} line beneath conversational ${i1} fills]`,
  (i1, i2, i3) => `[Tighter rhythmic pocket with ${i1} and ${i3} call-and-response]`
];

const DROP_CUES = [
  (i1, i2, i3) => `[Heavy instrumental breakdown: ${i1} and ${i2} trading solo phrases]`,
  (i1, i2, i3) => `[Featured ${i1} lead showcase over ${i2} and ${i3} rhythm section]`,
  (i1, i2, i3) => `[Polyrhythmic ${i1}, ${i2}, and ${i3} drop]`,
  (i1, i2, i3) => `[Dynamic instrumental drop led by ${i1} and ${i2}]`
];

const OUTRO_CUES = [
  (i1, i2) => `[Gradual decompression as ${i1} and ${i2} harmonics ring out]`,
  (i1, i2) => `[Arrangement strips back to a lone ${i1} and warm ${i2} decay]`,
  (i1, i2) => `[ lingering ${i1} motif fading over soft ${i2} resonance]`.replace('[ lingering', '[Lingering'),
  (i1, i2) => `[Final sustained ${i1} and ${i2} chord resolving cleanly]`
];

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str || 'scaffold');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function auditLyrics(lyricsText) {
  const lines = String(lyricsText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const unbracketedLines = lines.filter((l) => !(l.startsWith('[') && l.endsWith(']')));
  const missingSections = REQUIRED_SECTIONS.filter((sec) => !lines.includes(sec));

  const passed = unbracketedLines.length === 0 && missingSections.length === 0;
  return {
    passed,
    strictPass: passed,
    pass1: { flags: unbracketedLines.length, warnings: 0, status: unbracketedLines.length === 0 ? 'PASS' : 'FAIL' },
    pass2: { flags: missingSections.length, warnings: 0, status: missingSections.length === 0 ? 'PASS' : 'FAIL' },
    unbracketedLines,
    missingSections
  };
}

export function generateLyricSeed(profile = {}) {
  let rawList = Array.isArray(profile.instruments) && profile.instruments.length > 0
    ? profile.instruments
    : extractInstrumentsFromPrompt(profile.sunoStyleTag || profile.fullPrompt || '');

  const cleaned = rawList.map(cleanInstrumentName).filter(Boolean);
  const i1 = cleaned[0] || 'Lead Guitar';
  const i2 = (cleaned[1] && cleaned[1] !== i1) ? cleaned[1] : 'Rhythm Section';
  const i3 = (cleaned[2] && cleaned[2] !== i1 && cleaned[2] !== i2) ? cleaned[2] : 'Percussion';

  const h = hashSeed(`${profile.title || ''}::${profile.bandName || ''}::${i1}::${i2}`);
  const idx = h % INTRO_CUES.length;

  const lyricSnippet = [
    '[Intro]',
    INTRO_CUES[idx](i1, i2),
    '[Verse 1]',
    VERSE1_CUES[idx](i1, i2),
    '',
    '[Pre-Chorus]',
    PRE_CHORUS_CUES[idx](i2, i3),
    '',
    '[Chorus]',
    CHORUS_CUES[idx](i1, i2, i3),
    '',
    '[Verse 2]',
    VERSE2_CUES[idx](i1, i2, i3),
    '',
    '[Drop]',
    DROP_CUES[idx](i1, i2, i3),
    '[Outro]',
    OUTRO_CUES[idx](i1, i2),
    '',
    '[Fade Out]'
  ].join('\n');

  return {
    lyricSnippet,
    audit: auditLyrics(lyricSnippet)
  };
}
