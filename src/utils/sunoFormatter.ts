import { VariationOptions, GeneratedPrompt, SunoPromptFormat } from '../types';
import { POOLS, KEYS, TITLE_A, TITLE_B, LEADS, OPENERS, SUNO_METATAGS } from '../data/pools';
import { designGroove } from './grooveDesign.js';
import { generateLyricSeed } from './lyricSeed.js';

function pick<T>(arr: T[], rng = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickMany<T>(arr: T[], n: number, rng = Math.random): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

function listPhrase(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shuffle<T>(arr: T[], rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function segment(category: string, value: string, rng = Math.random): string {
  const leadList = LEADS[category] || ['{v}.'];
  const lead = pick(leadList, rng);
  return lead.replace('{v}', value);
}

function vocalSegment(value: string): string {
  if (value === 'no vocals, instrumental only') return 'Instrumental only, no vocals.';
  return `Vocals: ${value}.`;
}

function buildGenreText(validGenres: string[], verb: string): string {
  const lower = validGenres.map(g => g.toLowerCase());
  if (verb === 'Filter') return `${lower[0]} through ${listPhrase(lower.slice(1))}`;
  if (verb === 'Anchor') return `${lower[0]} in the rhythmic language of ${listPhrase(lower.slice(1))}`;
  if (verb === 'Dissolve') return `${lower[0]} into ${listPhrase(lower.slice(1))}`;
  if (verb === 'Morph fluidly between') return listPhrase(lower);
  return listPhrase(lower);
}

// ---------------------------------------------------------------------------
// Stem-friendly (dry tracking) mode
// ---------------------------------------------------------------------------

/** Phrases appended to the Suno style tag when `opts.stemFriendly` is on. */
export const STEM_FRIENDLY_TAG_PHRASES = [
  'dry studio tracking',
  'close-mic vocal',
  'minimal reverb',
  'tight transients',
  'clear instrument separation'
] as const;

const WET_ADJ = '(?:cavernous|lush|huge|massive|big|vast|wide|stereo|long|deep|heavy|thick|dense|cathedral|hall|plate|spring|shimmer(?:ing)?|ambient|epic|airy|washy)';

// Order matters: the longer "drenched in reverb" forms run before the bare reverb pattern.
const WET_DESCRIPTOR_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:drenched|soaked|swimming|bathed|awash|lost)\\s+in\\s+(?:${WET_ADJ}[\\s-]+)*(?:reverb|echo|delay)s?\\b`, 'gi'),
  new RegExp(`(?:\\b(?:an?|the|some)\\s+)?\\b(?:${WET_ADJ}[\\s-]+){0,3}reverbs?(?:[\\s-]+(?:tails?|drenched|soaked|heavy|wash(?:es)?))?\\b`, 'gi'),
  /\b(?:wash(?:ed|ing)?[\s-]+out|washy|(?:ambient|echo|delay)\s+wash(?:es)?)\b/gi,
  /\b(?:dub-style\s+)?(?:long\s+)?(?:delay|echo)\s+(?:throws|tails|washes)\b/gi,
  /\bcavernous(?:\s+(?:space|room|hall|ambience|echo))?\b/gi
];

/** A wet phrase preceded by one of these (e.g. "minimal reverb", "rather than washing out") is kept. */
const NEGATED_BEFORE = /\b(?:no|minimal|minimum|little|less|without|avoid(?:ing)?|rather than|instead of|not|dry)\s+(?:[\w’'-]+\s+)?$/i;

function tidyFragment(s: string): string {
  let out = s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/[,;:]\s*\./g, '.')
    .replace(/\b(?:and|with|plus)\s+(?=(?:and|with|plus)\b|[,.;:]|$)/gi, '')
    .trim();
  out = out.replace(/^(?:(?:and|with|plus|&)\b|[,;:&])\s*/i, '').replace(/\s*(?:\b(?:and|with|plus)|[,;:&])$/i, '').trim();
  return /^[\s.,;:&-]*$/.test(out) ? '' : out;
}

/**
 * Remove reverb / wash descriptors that would contradict a dry, stem-friendly request.
 * Negated mentions ("minimal reverb", "rather than washing out their edges") are kept,
 * and any `protectedTerms` (e.g. user-chosen instrument names) are never altered.
 * Pure and deterministic: never touches the rng. Returns '' when nothing meaningful is left.
 */
export function stripWetDescriptors(text: string, protectedTerms: readonly string[] = []): string {
  if (!text) return text;
  const terms = protectedTerms.filter(Boolean).sort((a, b) => b.length - a.length);
  let out = text;
  terms.forEach((term, i) => { out = out.split(term).join(`\u0000${i}\u0000`); });
  let changed = false;
  for (const re of WET_DESCRIPTOR_PATTERNS) {
    out = out.replace(re, (match: string, ...rest: unknown[]) => {
      const offset = rest[rest.length - 2] as number;
      const whole = rest[rest.length - 1] as string;
      if (NEGATED_BEFORE.test(whole.slice(Math.max(0, offset - 32), offset))) return match;
      changed = true;
      return ' ';
    });
  }
  if (!changed) return text;
  out = tidyFragment(out);
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => terms[Number(i)]);
}

function stemFriendlyPhrases(instrumental: boolean): string[] {
  return STEM_FRIENDLY_TAG_PHRASES.filter(p => !(instrumental && p === 'close-mic vocal'));
}

export function generateSunoPrompt(
  genres: string[],
  timeSig: string,
  minBpm: number,
  maxBpm: number,
  bitrate: string,
  opts: VariationOptions,
  rng = Math.random,
  customInstruments?: string[]
): GeneratedPrompt | null {
  const validGenres = genres.filter(g => g && g.trim());
  if (validGenres.length < 2) return null;
  const stemFriendly = opts.stemFriendly === true;
  // Identity when off, so output is byte-identical to the non-stem-friendly path.
  const dry = (t: string, keep: readonly string[] = []) => (stemFriendly ? stripWetDescriptors(t, keep) : t);

  const key = opts.key ? pick(KEYS, rng) : pick(KEYS, rng);
  const title = opts.title ? `${pick(TITLE_A, rng)} ${pick(TITLE_B, rng)}` : `${pick(TITLE_A, rng)} ${pick(TITLE_B, rng)}`;
  const verb = pick(POOLS.blendVerb, rng);
  const genreText = buildGenreText(validGenres, verb);
  const plainList = listPhrase(validGenres.map(g => g.toLowerCase()));

  const CONNECTOR_VERBS = ['Filter', 'Anchor', 'Dissolve', 'Morph fluidly between'];
  const isConnector = CONNECTOR_VERBS.includes(verb);
  const opener = isConnector ? '{verb} {genres}.' : pick(OPENERS, rng);
  const isVerbLed = opener.indexOf('{verb}') === 0;
  const opening = opener
    .replace('{verb}', verb)
    .replace('{genresCap}', cap(plainList))
    .replace('{genres}', isVerbLed ? genreText : plainList);

  const core: string[] = [];
  let selectedInstruments: string[] = [];
  if (customInstruments && customInstruments.length > 0) {
    selectedInstruments = [...customInstruments];
  } else if (opts.instruments) {
    selectedInstruments = pickMany(POOLS.instruments, 2 + Math.floor(rng() * 2), rng);
  }

  const groove = designGroove({ genres: validGenres, instruments: selectedInstruments, timeSig, bpm: (minBpm + maxBpm) / 2, rng });
  const selectedVocals = opts.vocals ? pick(POOLS.vocals, rng) : '';
  const selectedMood = opts.mood ? pick(POOLS.mood, rng) : '';

  // Instrument names the user picked are protected; only descriptive wording is filtered.
  const grooveText = dry(groove.description, selectedInstruments);
  const productionText = dry(groove.production, selectedInstruments);
  if (opts.rhythm && (!stemFriendly || grooveText)) core.push(`Groove: ${grooveText}`);
  if (opts.harmony) core.push(segment('harmony', pick(POOLS.harmony, rng), rng));
  if ((opts.instruments || (customInstruments && customInstruments.length > 0)) && selectedInstruments.length > 0) {
    core.push(segment('instruments', listPhrase(selectedInstruments), rng));
  }
  if (opts.production && (!stemFriendly || productionText)) core.push(`Sound design: ${productionText}`);

  const tail: string[] = [];
  if (opts.structure) tail.push(segment('structure', pick(POOLS.structure, rng), rng));
  if (opts.vocals && selectedVocals) tail.push(vocalSegment(selectedVocals));
  if (opts.mood && selectedMood) tail.push(segment('mood', selectedMood, rng));
  if (opts.scene) tail.push(segment('scene', pick(POOLS.scene, rng), rng));
  if (opts.usecase) tail.push(segment('usecase', pick(POOLS.usecase, rng), rng));
  if (opts.highlight) tail.push(`Highlight the interplay between ${groove.anchor} and ${groove.pulse}.`);

  const instrumental = selectedVocals.includes('no vocals');
  const stemPhrases = stemFriendly ? stemFriendlyPhrases(instrumental) : [];
  // Appended after the shuffle so the rng sequence is unchanged by the flag.
  const stemLine = stemFriendly ? [`Stem-friendly mix: ${stemPhrases.join(', ')}.`] : [];
  const body = [opening, ...shuffle(core, rng), ...tail, ...stemLine].join(' ');
  const fusionName = `${validGenres.join(' × ')} Fusion`;

  const bpmLabel = minBpm === maxBpm ? `${minBpm} BPM` : `${minBpm}–${maxBpm} BPM`;
  const headerParts = [
    timeSig,
    bpmLabel,
    `${bitrate}kbps`,
    opts.key ? key : null,
    opts.title ? `"${title}"` : null,
    fusionName
  ].filter(Boolean);

  const fullPrompt = `${headerParts.join(', ')}: ${body}`;

  // Suno Style Tag: carries genre + groove instructions for the extension auto-fill
  const tagComponents = [
    ...validGenres,
    bpmLabel,
    ...(opts.key ? [key] : []),
    ...selectedInstruments,
    ...(opts.rhythm ? [grooveText] : []),
    ...(opts.production ? [productionText] : [])
  ].filter(t => Boolean(t && t.trim()));
  tagComponents.push(...[
    instrumental ? 'instrumental' : dry(selectedVocals.replace(' vocals', '').replace('vocals', '')),
    selectedMood ? dry(selectedMood.split(' and ')[0]) : ''
  ].filter(Boolean));

  if (stemFriendly) {
    const existing = tagComponents.join(', ').toLowerCase();
    tagComponents.push(...stemPhrases.filter(p => !existing.includes(p)));
  }

  const sunoStyleTag = tagComponents.join(', ');

  // Standard Suno song structure metatags
  const structureTags = [
    "[Intro]",
    "[Verse 1]",
    "[Pre-Chorus]",
    "[Chorus]",
    "[Verse 2]",
    "[Chorus]",
    "[Bridge / Breakdown]",
    "[Drop / Climax]",
    "[Outro]"
  ];

  const lyricSnippet = generateLyricSeed({
    title,
    bandName: fusionName,
    category: validGenres[0] || 'Fusion',
    bpm: Math.round((minBpm + maxBpm) / 2),
    instruments: selectedInstruments
  }).lyricSnippet;

  return {
    id: `fusion-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    title,
    genres: validGenres,
    timeSig,
    minBpm,
    maxBpm,
    bitrate,
    key,
    fullPrompt,
    sunoStyleTag,
    selectedInstruments,
    lyricSnippet,
    structureTags,
    ...(stemFriendly ? { stemFriendly: true } : {}),
    createdAt: Date.now()
  };
}

export function formatPromptForCopy(item: GeneratedPrompt, format: SunoPromptFormat): string {
  if (format === 'suno-tag') {
    return item.sunoStyleTag;
  }
  if (format === 'full-prompt') {
    return item.fullPrompt;
  }
  // Complete bundle
  return `=== SUNO STYLE OF MUSIC TAG ===
${item.sunoStyleTag}

=== FULL CINEMATIC SPECIFICATION ===
${item.fullPrompt}

=== SUGGESTED SONG STRUCTURE & LYRIC SCAFFOLD ===
${item.lyricSnippet || ''}`;
}
