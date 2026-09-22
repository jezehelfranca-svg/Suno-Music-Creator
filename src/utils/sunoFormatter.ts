import { VariationOptions, GeneratedPrompt, SunoPromptFormat } from '../types';
import { POOLS, KEYS, TITLE_A, TITLE_B, LEADS, OPENERS, SUNO_METATAGS } from '../data/pools';

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

  const selectedRhythm = opts.rhythm ? pick(POOLS.rhythm, rng) : '';
  const selectedProd = opts.production ? pick(POOLS.production, rng) : '';
  const selectedVocals = opts.vocals ? pick(POOLS.vocals, rng) : '';
  const selectedMood = opts.mood ? pick(POOLS.mood, rng) : '';

  if (opts.rhythm && selectedRhythm) core.push(segment('rhythm', selectedRhythm, rng));
  if (opts.harmony) core.push(segment('harmony', pick(POOLS.harmony, rng), rng));
  if ((opts.instruments || (customInstruments && customInstruments.length > 0)) && selectedInstruments.length > 0) {
    core.push(segment('instruments', listPhrase(selectedInstruments), rng));
  }
  if (opts.production && selectedProd) core.push(segment('production', selectedProd, rng));

  const tail: string[] = [];
  if (opts.structure) tail.push(segment('structure', pick(POOLS.structure, rng), rng));
  if (opts.vocals && selectedVocals) tail.push(vocalSegment(selectedVocals));
  if (opts.mood && selectedMood) tail.push(segment('mood', selectedMood, rng));
  if (opts.scene) tail.push(segment('scene', pick(POOLS.scene, rng), rng));
  if (opts.usecase) tail.push(segment('usecase', pick(POOLS.usecase, rng), rng));
  if (opts.highlight) tail.push(segment('highlight', pick(POOLS.highlight, rng), rng));

  const body = [opening, ...shuffle(core, rng), ...tail].join(' ');
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

  // Suno Style Tag (compact, comma-separated tokens optimal for Suno's "Style of Music" box limit)
  const tagComponents = [
    ...validGenres,
    bpmLabel,
    key,
    selectedMood ? selectedMood.split(' and ')[0] : '',
    selectedInstruments.slice(0, 2).join(', '),
    selectedVocals.includes('no vocals') ? 'instrumental' : selectedVocals.replace(' vocals', '').replace('vocals', ''),
    selectedProd ? selectedProd.split(' and ')[0] : ''
  ].filter(t => Boolean(t && t.trim()));

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

  const lyricSnippet = `[Intro: ${timeSig}, atmospheric build]
(Guitar riffs gently echo against soft analog pads)

[Verse 1]
Midnight shadows through the glowing rain
Neon reflections washing out the pain
Underneath the pulse of an electric sky
We leave the heavy city hours behind

[Chorus: ${bpmLabel}, full drive]
Feel the rhythm start to collide
Two worlds colliding in the neon light!
Nothing holds us in this gravity
Lost inside this hybrid symmetry!

[Outro]
(Fading into silence)`;

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
