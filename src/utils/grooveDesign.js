/**
 * Turn the supplied genres and instruments into a concrete rhythmic relationship.
 * Keep this function self-contained: the extension builder embeds the same source
 * in its content script and popup, so all three prompt paths use the same rules.
 *
 * @param {{ genres?: string[], instruments?: string[], timeSig?: string, bpm?: number, rng?: () => number }} seed
 */
export function designGroove(seed = {}) {
  const genres = (seed.genres || []).filter(Boolean);
  const instruments = (seed.instruments || []).filter(Boolean);
  const firstGenre = (genres[0] || '').toLowerCase();
  const allGenres = genres.join(' ').toLowerCase();
  const has = (pattern, text) => pattern.test(text);
  const families = [
    ['afro', /afro|highlife|amapiano|salsa|timba|samba|cumbia|reggaet[oó]n|bossa|latin|rumba/],
    ['hiphop', /trap|drill|hip.?hop|rap|boom bap|trip hop|glitch hop/],
    ['jazz', /jazz|swing|bebop|blues/],
    ['funk', /funk|disco|city pop|r&b|rhythm 'n' blues|soul/],
    ['rock', /rock|metal|grunge|sludge|punk|shoegaze|djent|hardcore/],
    ['ambient', /ambient|classical|minimalism|new age|drone|orchestral/],
    ['folk', /folk|country|bluegrass|celtic|acoustic|americana/],
    ['club', /house|techno|trance|edm|dance|electro|garage|dubstep|jungle|drum.?n.?bass|breakbeat|synthwave/]
  ];
  const family = families.find(([, pattern]) => has(pattern, firstGenre))?.[0]
    || families.find(([, pattern]) => has(pattern, allGenres))?.[0] || 'open';
  const slow = Number(seed.bpm) > 0 && Number(seed.bpm) < 95;

  const find = pattern => instruments.find(name => has(pattern, name.toLowerCase()));
  const low = find(/\b(?:bass|sub|808|contrabass|double bass|upright bass|baritone guitar|low synth|moog)\b/);
  const drums = find(/drum|kick|snare|tom|percussion|conga|tabla|riq|djembe|hi.?hat|shaker|caj[oó]n|breakbeat/);
  const guitar = find(/guitar|banjo|mandolin|oud|lute/);
  const keys = find(/piano|rhodes|keys|keyboard|organ|clav|juno|synth|arpeggiator/);
  const other = instruments.find(name => name !== low && name !== drums);
  const anchor = low || guitar || keys || drums || other || 'the low end';
  const pulse = drums || (instruments.length ? 'the rhythmic accents' : 'the drums');
  const voice = instruments.find(name => name !== anchor && name !== drums && name !== low);
  const oddMeter = seed.timeSig && seed.timeSig !== '4/4'
    ? `Phrase the accents in ${seed.timeSig}; leave a gap at the turn of the meter.` : '';
  const choose = variants => variants[Math.min(variants.length - 1, Math.floor((seed.rng || Math.random)() * variants.length))];

  const patterns = {
    afro: [
      `${anchor} answers ${pulse} in the open spaces between syncopated accents; let the percussion finish each phrase.`,
      `Give ${anchor} a short repeating figure while ${pulse} shifts the accents around it; leave a rest before the response.`
    ],
    hiphop: [
      `${anchor} lands after the main drum hit, then cuts off early so ${pulse} and the next downbeat stay clear.`,
      `Alternate held low notes from ${anchor} with short pickups; keep a pocket of silence for ${pulse}.`
    ],
    jazz: [
      `Let ${anchor} outline the changes with varied note lengths while ${pulse} answers in the spaces between phrases.`,
      `Keep ${anchor} conversational with ${pulse}: one longer grounding note, then a brief pickup before the next chord.`
    ],
    funk: [
      `${anchor} plays clipped offbeat answers to ${pulse}; use short rests and occasional ghosted pickups instead of filling every subdivision.`,
      `Set a repeating low figure on ${anchor}; move its final accent around ${pulse} and stop cleanly before the next phrase.`
    ],
    rock: [
      `${anchor} holds the weight under ${pulse}; offset the riff accents and cut a brief hole before the backbeat.`,
      `Lock ${anchor} to the heavy hits from ${pulse}, then break the riff with a short rest before it returns.`
    ],
    ambient: [
      `Let ${anchor} sustain a low motif, with measured silences that give the next phrase room to enter.`,
      `Use sparse, unequal pulses from ${anchor}; allow their tails to decay before the next accent.`
    ],
    folk: [
      `Keep ${anchor} as a repeating acoustic pulse, varied by a short pickup and a breath at each phrase end.`,
      `Let ${anchor} mark the downbeats while ${pulse} answers lightly between them; leave space for the melody.`
    ],
    club: [
      `Place short offbeat notes from ${anchor} between the hits of ${pulse}; vary note lengths and leave one 16th-note pocket empty.`,
      `Use syncopated 16th-note pickups from ${anchor}, alternating with ${pulse} so the downbeat stays uncluttered.`
    ],
    open: [
      `Give ${anchor} a recurring motif that trades accents with ${pulse}; let short rests define the groove.`,
      `Vary the length of ${anchor}'s repeated notes and leave a deliberate gap before ${pulse} answers.`
    ]
  };
  const pattern = slow && family === 'rock'
    ? `${anchor} sustains the low riff against ${pulse} at a half-time pace; leave a full beat of air before the next heavy accent.`
    : slow && family === 'club'
      ? `${anchor} plays sparse offbeat notes between ${pulse}; let each note decay before the next pickup.`
      : choose(patterns[family]);
  const response = voice ? `Give ${voice} a response in the space after the anchor phrase.` : '';
  const synthLow = low && has(/808|sub|synth|moog|wavetable|sine|saw/, low.toLowerCase());
  const production = synthLow
    ? `Keep ${low}'s deepest layer centered and clean; put saturation or stereo width only on its upper harmonics.`
    : low
      ? `Keep ${low} focused in the center, with its attack distinct from ${pulse}.`
      : guitar && family === 'rock'
        ? `Keep ${guitar}'s low attack distinct from ${pulse}; place ambience behind the hits rather than washing out their edges.`
      : family === 'club' || family === 'hiphop'
        ? `Keep the lowest frequencies centered; put grit and width above them without masking ${pulse}.`
        : `Preserve the attack and decay of the named instruments; leave low-frequency space for ${pulse}.`;
  const tag = ({
    afro: 'interlocking syncopation and rests', hiphop: 'low-note pickups with drum gaps',
    jazz: 'conversational low-end phrasing', funk: 'clipped offbeats and ghost pickups',
    rock: 'weighty riffs with backbeat gaps', ambient: 'sparse pulses and long decays',
    folk: 'acoustic pulse with phrase-end rests', club: 'offbeat 16th-note gaps',
    open: 'interlocking accents and rests'
  })[family];
  return { family, anchor, pulse, description: [pattern, response, oddMeter].filter(Boolean).join(' '), production, tag };
}
