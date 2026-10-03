import { EXACT_INSTRUMENTS } from './instruments';

export const POOLS = {
  blendVerb: [
    'Seamlessly blend', 'Fuse', 'Weave together', 'Interlace', 'Splice',
    'Cross-pollinate', 'Collide', 'Layer', 'Marry', 'Graft',
    'Morph fluidly between', 'Filter', 'Anchor', 'Dissolve'
  ],
  rhythm: [
    'syncopated polyrhythms', 'half-time breakdowns', 'a driving four-on-the-floor pulse',
    'a shuffled swing feel', 'odd-meter grooves', 'ghost-note-heavy drumming',
    'broken-beat programming', 'a tight in-the-pocket groove', 'double-time transitions',
    'a rubato intro resolving into strict tempo', 'cross-stick brushwork',
    'tribal floor-tom patterns', 'skittering hi-hat rolls', 'a laid-back behind-the-beat feel',
    'stop-time hits punctuating each phrase', 'motorik krautrock propulsion'
  ],
  harmony: [
    'modal interchange', 'extended jazz voicings', 'drone-based tonality',
    'chromatic passing chords', 'pentatonic riffing', 'quartal harmony',
    'suspended, unresolved cadences', 'minor-key verses lifting to major choruses',
    'microtonal bends', 'parallel fourths and fifths', 'tritone substitutions',
    'a descending chromatic bassline', 'open-tuned resonance', 'polytonal layering'
  ],
  production: [
    'tape saturation and analog warmth', 'wide stereo reverb', 'gritty lo-fi character',
    'pristine modern mastering', 'heavy sidechain compression', 'dusty vinyl crackle',
    'cavernous plate reverb', 'close-mic’d intimacy', 'granular texture beds',
    'bit-crushed digital artifacts', 'dub-style delay throws', 'heavily parallel-compressed drums',
    'a raw single-room live mix', 'spring reverb and tremolo', 'sub-heavy low end with scooped mids'
  ],
  instruments: EXACT_INSTRUMENTS,
  structure: [
    'building from a sparse intro to a full-band climax',
    'with an extended instrumental breakdown at the midpoint',
    'trading call-and-response between sections',
    'with a false ending followed by an outro reprise',
    'escalating in intensity from first bar to last',
    'bookended by an ambient intro and outro',
    'alternating between restraint and full-force release',
    'with a key change lifting the final section',
    'cycling through three distinct movements',
    'opening cold on the hook, then deconstructing it'
  ],
  vocals: [
    'no vocals, instrumental only', 'layered harmony vocals', 'spoken-word passages',
    'wordless vocal textures', 'a gritty lead vocal with doubled choruses',
    'call-and-response group chants', 'whispered close-mic’d verses',
    'a soaring belted chorus', 'vocoded and pitch-shifted lines', 'chopped vocal samples',
    'female soulful lead vocals', 'male gravelly baritone vocals', 'ethereal female soprano vocals'
  ],
  mood: [
    'brooding and cinematic', 'euphoric and uplifting', 'melancholic and restrained',
    'aggressive and confrontational', 'hypnotic and meditative', 'playful and irreverent',
    'nostalgic and warm', 'tense and claustrophobic', 'triumphant and expansive',
    'eerie and dislocated', 'sultry and slow-burning', 'frantic and unhinged'
  ],
  scene: [
    'a futuristic city skyline at night', 'a neon-lit rain-slicked street',
    'an ancient temple half-reclaimed by forest', 'a post-apocalyptic desert highway',
    'a crowded underground club at 3am', 'a windswept coastal cliff at dawn',
    'a derelict industrial warehouse', 'a mythic battlefield reimagined in the modern era',
    'a cramped analog studio filled with tape machines', 'a snowbound northern village',
    'a dense tropical marketplace', 'a cathedral interior lit by candlelight',
    'a high-speed chase through narrow city streets', 'a slow drive through empty farmland',
    'a carnival winding down after closing', 'a space station orbiting a dying star',
    'a smoke-filled 1950s jazz basement', 'a sun-bleached desert festival stage'
  ],
  usecase: [
    'an animated action sequence', 'a film title sequence', 'a video game boss battle',
    'a late-night driving playlist', 'a runway show', 'a documentary montage',
    'a high-energy live performance with full stage theatrics', 'a meditation or focus playlist',
    'a dance routine', 'a trailer cut', 'an art installation loop', 'a closing-credits roll'
  ],
  highlight: [
    'the bassline', 'the drum programming', 'the lead synth', 'the guitar solo',
    'the vocal hook', 'the horn section', 'the chord voicings', 'the percussion break',
    'the atmospheric pads', 'the rhythm section lock', 'the key change',
    'the breakdown', 'the intro build', 'the counter-melody', 'the outro fade',
    'the sub-bass weight', 'the sample chops', 'the harmonic tension'
  ]
};

export const KEYS = [
  'A minor', 'E minor', 'D minor', 'G minor', 'C minor', 'F minor', 'B minor',
  'F# minor', 'C# minor', 'G# minor', 'D# minor', 'A# minor',
  'Eb minor', 'Ab minor', 'Bb minor', 'Db minor', 'Gb minor',
  'C major', 'G major', 'D major', 'A major', 'E major', 'B major', 'F major',
  'F# major', 'Db major', 'Ab major', 'Eb major', 'Bb major'
];

export const TITLE_A = [
  'Tin', 'Cosmic', 'Midnight', 'Spectral', 'Velvet', 'Cobalt', 'Retro', 'Quantum',
  'Fractal', 'Lunar', 'Solar', 'Electric', 'Phantom', 'Crimson', 'Azure', 'Golden',
  'Hollow', 'Liquid', 'Copper', 'Chrome', 'Sapphire', 'Obsidian', 'Paper', 'Iron',
  'Glass', 'Amber', 'Twilight', 'Nocturne', 'Ember', 'Marble', 'Feral', 'Sacred',
  'Broken', 'Endless', 'Hidden', 'Distant', 'Silent', 'Wired', 'Faded', 'Drifting'
];

export const TITLE_B = [
  'Ledger', 'Drift', 'Mirage', 'Cascade', 'Horizon', 'Postcard', 'Reverie', 'Vortex',
  'Serenade', 'Odyssey', 'Circuit', 'Bloom', 'Requiem', 'Parade', 'Lament', 'Machine',
  'Dialect', 'Anatomy', 'Gospel', 'Ritual', 'Archive', 'Signal', 'Fracture', 'Meridian',
  'Threshold', 'Interlude', 'Momentum', 'Cadence', 'Spiral', 'Tide', 'Chapel',
  'Lullaby', 'Procession', 'Engine', 'Garden', 'Corridor', 'Sermon', 'Telegram'
];

export const LEADS: Record<string, string[]> = {
  rhythm: ['Built on {v}.', 'Lock the groove to {v}.', 'Rhythmically, lean on {v}.', 'The foundation is {v}.'],
  harmony: ['Voice the changes with {v}.', 'Harmonically, reach for {v}.', 'Underpinned by {v}.', 'Let {v} carry the melodic weight.'],
  instruments: ['Feature {v}.', 'Lead with {v}.', 'Instrumentation: {v}.', 'Foreground {v}.'],
  production: ['Mix for {v}.', 'Production: {v}.', 'Render with {v}.', 'Treat the master with {v}.'],
  structure: ['Arrange the track {v}.', 'Structure it {v}.', 'Shape the arc {v}.'],
  mood: ['Overall mood: {v}.', 'Keep it {v}.', 'The result should feel {v}.', 'Aim for something {v}.'],
  scene: ['Set it in {v}.', 'Evoke {v}.', 'The setting: {v}.', 'It should sound like {v}.'],
  usecase: ['Suited to {v}.', 'Built for {v}.', 'Intended use: {v}.'],
  highlight: ['Highlight: {v}.', 'Let {v} be the standout element.', 'Foreground {v} above all.']
};

export const OPENERS = [
  '{verb} {genres}.',
  '{verb} {genres} into a single coherent track.',
  'A fusion of {genres}.',
  '{genresCap} — pushed into one hybrid form.'
];

export const TIME_SIGNATURES = [
  "4/4", "3/4", "6/8", "5/4", "7/8", "5/8", "6/4", "7/4", "9/8", "10/8", "12/8",
  "4/4→7/8→4/4", "3/4→5/4→3/4"
];

// Curated Suno structural tags
export const SUNO_METATAGS = [
  { tag: "[Intro]", desc: "Establishes mood, ambient chords, or rhythmic hook" },
  { tag: "[Verse 1]", desc: "Narrative storytelling, rhythmic pacing" },
  { tag: "[Pre-Chorus]", desc: "Tension riser, lifting tempo and anticipation" },
  { tag: "[Chorus]", desc: "Main melodic hook, anthemic energy, full instrumentation" },
  { tag: "[Verse 2]", desc: "Deeper narrative progression, secondary elements" },
  { tag: "[Pre-Chorus]", desc: "Second build-up" },
  { tag: "[Chorus]", desc: "Re-energized hook" },
  { tag: "[Bridge]", desc: "Contrast section, alternate chord progression or tempo shift" },
  { tag: "[Guitar Solo]", desc: "Showcase shredding, emotive bends, or expressive phrasing" },
  { tag: "[Synthesizer Solo]", desc: "Lead arpeggios, filter sweeps, pitch bends" },
  { tag: "[Drop]", desc: "EDM/Bass impact, heavy rhythm section release" },
  { tag: "[Breakdown]", desc: "Sparse instrumentation, heavy bass or drum focus" },
  { tag: "[Outro]", desc: "Concluding theme or climactic resolution" },
  { tag: "[Fade Out]", desc: "Gradual decay into silence" },
  { tag: "[Spoken Word]", desc: "Intimate voiceover, speech, or sampled dialogue" }
];
