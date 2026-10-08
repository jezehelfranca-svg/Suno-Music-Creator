/**
 * ACE Songwriting Framework — Lyric Seed Humanizer & Two-Pass /ace-audit Engine
 * Pass 1: Anti-Cliché Mandate (Meaning, Specificity, Conversational Test, Banned Phrases)
 * Pass 2: Lyric Craft (Singability, Vowel Sustains, Breath Fit, Slant Rhyme, V1/V2 Syllable Budget)
 */

const BANNED_PHRASES = [
  'through the storm', 'i will rise', 'never fade', 'from the ashes',
  'broken wings', 'lost my way', 'find the light', 'stand tall',
  'touch the sky', 'forevermore', 'in the shadows', 'tears fall like rain',
  'burning bright', 'against all odds', 'heart of gold', 'chains that bind',
  'echoes of the past', 'whisper in the wind', 'dance in the rain', 'love conquers all',
  'rise above', 'shattered dreams', 'fading away', 'into the night',
  'hold on tight', 'let it go', 'bleeding heart', 'wings to fly',
  'darkness falls', 'light the way', 'scars remind me', 'ghosts of yesterday',
  'concrete jungle', 'sea of faces', 'weight of the world', 'edge of tomorrow',
  'fire in my soul', 'written in the stars', 'two worlds colliding', 'time stands still',
  'drowning in', 'chasing shadows', 'pieces of me', 'walls closing in',
  'screaming inside', 'wearing a mask', 'castle of glass', 'bridge over troubled',
  'phoenix rising', 'footprints in the sand',
  'echoes rising from the deep', 'voices drift through the silence',
  'counting down every heartbeat', 'electric currents pulse in the dark',
  'neon shadows flicker in the haze', 'before the stars collide',
  'midnight shadows through the glowing rain', 'washing out the pain'
];

const AI_GENERIC_WORDS = [
  'neon', 'shadows', 'echoes', 'heartbeat', 'collide', 'colliding',
  'abyss', 'void', 'ethereal', 'symphony', 'tapestry', 'kaleidoscope',
  'vortex', 'cosmos', 'celestial', 'labyrinth', 'phantoms', 'whispers'
];

const BANNED_RHYME_PAIRS = [
  ['fire', 'desire'], ['love', 'above'], ['heart', 'apart'], ['night', 'light'],
  ['pain', 'rain'], ['eyes', 'lies'], ['tears', 'fears'], ['soul', 'whole'],
  ['free', 'me'], ['stay', 'away'], ['fly', 'sky'], ['dream', 'seem'],
  ['burn', 'turn'], ['fall', 'all'], ['hand', 'stand'], ['mind', 'find'],
  ['time', 'mine'], ['die', 'cry'], ['strong', 'wrong'], ['alone', 'stone'],
  ['world', 'unfurled'], ['breath', 'death'], ['air', 'there'], ['place', 'face'],
  ['glow', 'know'], ['deep', 'sleep'], ['chains', 'remains'], ['grace', 'embrace'],
  ['storm', 'warm'], ['true', 'you'], ['high', 'sky'], ['wings', 'things'],
  ['gold', 'cold'], ['bright', 'night'], ['fade', 'made'], ['voice', 'choice'],
  ['stars', 'scars'], ['past', 'last'], ['ground', 'sound'], ['name', 'flame'],
  ['dark', 'spark'], ['floor', 'more'], ['broken', 'unspoken'], ['forever', 'together'],
  ['healing', 'feeling'], ['sorrow', 'tomorrow'], ['inside', 'hide'], ['beating', 'fleeting'],
  ['shadow', 'meadow'], ['rising', 'shining']
];

const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'but', 'my', 'your', 'his', 'her',
  'our', 'their', 'its', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'as'
]);

const PHONETIC_HARD_STOP = /(?:[tkpbdg]|[aeiouy][tkpbdg]e)$/i;

export function countSyllablesInWord(word) {
  const clean = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const trimmed = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length) : 1;
}

export function countLineSyllables(line) {
  const words = String(line || '')
    .replace(/\[.*?\]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.reduce((sum, w) => sum + countSyllablesInWord(w), 0);
}

export function getLastWord(line) {
  const cleaned = String(line || '').replace(/\[.*?\]/g, '').replace(/[^a-zA-Z\s'-]/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

export function auditLyrics(lyricsText, options = {}) {
  const bpm = Number(options.bpm) || 120;
  const rawLines = String(lyricsText || '').split(/\r?\n/);

  let currentSection = 'Intro';
  const sections = {};
  const lineReports = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const tagMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (tagMatch) {
      currentSection = tagMatch[1].trim();
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }
    if (/^\(.*\)$/.test(trimmed)) continue;

    if (!sections[currentSection]) sections[currentSection] = [];
    sections[currentSection].push(trimmed);
  }

  let pass1Flags = 0;
  let pass1Warns = 0;
  let pass2Flags = 0;
  let pass2Warns = 0;
  let hardestLine = { line: '', reason: 'None — all lines sit cleanly in breath and vowel pocket', score: 0 };

  const allLyricLines = [];
  for (const [secName, lines] of Object.entries(sections)) {
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      const syllables = countLineSyllables(line);
      const lastWord = getLastWord(line);

      let p1Verdict = '✅';
      const p1Issues = [];
      for (const banned of BANNED_PHRASES) {
        if (lower.includes(banned)) {
          p1Verdict = '🚩';
          p1Issues.push(`Banned phrase "${banned}"`);
        }
      }
      const foundAiWords = AI_GENERIC_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));
      if (foundAiWords.length >= 2) {
        p1Verdict = '🚩';
        p1Issues.push(`Multiple AI cliché tokens (${foundAiWords.join(', ')})`);
      } else if (foundAiWords.length === 1 && p1Verdict !== '🚩') {
        p1Verdict = '⚠️';
        p1Issues.push(`Generic AI word "${foundAiWords[0]}"`);
      }

      let p2Verdict = '✅';
      const p2Issues = [];

      if (FUNCTION_WORDS.has(lastWord)) {
        p2Verdict = '🚩';
        p2Issues.push(`Ends on weak function word "${lastWord}"`);
      }

      const maxSyllablesForTempo = bpm >= 170 ? 13 : bpm >= 130 ? 15 : 17;
      if (syllables > maxSyllablesForTempo) {
        p2Verdict = '🚩';
        p2Issues.push(`Breath overflow (${syllables} syllables at ${bpm} BPM)`);
      } else if (syllables < 3) {
        p2Verdict = '⚠️';
        p2Issues.push(`Fragment too short (${syllables} syllables)`);
      }

      const isChorusOrOutro = /chorus|outro/i.test(secName) && !/pre-chorus/i.test(secName);
      const isLandingLine = isChorusOrOutro && idx === lines.length - 1;
      if (isLandingLine && PHONETIC_HARD_STOP.test(lastWord)) {
        if (p2Verdict !== '🚩') p2Verdict = '⚠️';
        p2Issues.push(`Peak sustain ends on closed stop consonant ("${lastWord}")`);
      }

      if (p1Verdict === '🚩') pass1Flags++;
      else if (p1Verdict === '⚠️') pass1Warns++;

      if (p2Verdict === '🚩') pass2Flags++;
      else if (p2Verdict === '⚠️') pass2Warns++;

      const difficultyScore = (p2Verdict === '🚩' ? 10 : p2Verdict === '⚠️' ? 5 : 0) + syllables * 0.25;
      if (difficultyScore > hardestLine.score) {
        hardestLine = {
          line,
          section: secName,
          syllables,
          reason: p2Issues[0] || `Longest phrasing line (${syllables} syllables at ${bpm} BPM)`,
          score: difficultyScore
        };
      }

      const entry = {
        section: secName,
        index: idx,
        line,
        syllables,
        lastWord,
        p1Verdict,
        p1Issues,
        p2Verdict,
        p2Issues
      };
      lineReports.push(entry);
      allLyricLines.push(entry);
    });
  }

  for (let i = 0; i < allLyricLines.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 3, allLyricLines.length - 1); j++) {
      const w1 = allLyricLines[i].lastWord;
      const w2 = allLyricLines[j].lastWord;
      if (!w1 || !w2 || w1 === w2) continue;
      for (const [b1, b2] of BANNED_RHYME_PAIRS) {
        if ((w1 === b1 && w2 === b2) || (w1 === b2 && w2 === b1)) {
          allLyricLines[j].p2Verdict = '🚩';
          allLyricLines[j].p2Issues.push(`Banned rhyme pair "${w1}/${w2}"`);
          pass2Flags++;
        }
      }
    }
  }

  const v1 = sections['Verse 1'] || sections['Verse'] || [];
  const v2 = sections['Verse 2'] || [];
  const syllableBudget = [];
  const pairCount = Math.max(v1.length, v2.length);
  for (let i = 0; i < pairCount; i++) {
    const l1 = v1[i] || '';
    const l2 = v2[i] || '';
    const s1 = l1 ? countLineSyllables(l1) : null;
    const s2 = l2 ? countLineSyllables(l2) : null;
    const delta = s1 !== null && s2 !== null ? Math.abs(s1 - s2) : null;
    const ok = delta === null ? true : delta <= 2;
    if (!ok) {
      pass2Warns++;
    }
    syllableBudget.push({ lineIndex: i + 1, v1Syllables: s1, v2Syllables: s2, delta, withinBudget: ok });
  }

  const passed = pass1Flags === 0 && pass2Flags === 0 && pass1Warns === 0 && pass2Warns === 0;
  return {
    passed,
    strictPass: pass1Flags === 0 && pass2Flags === 0,
    pass1: { flags: pass1Flags, warnings: pass1Warns, status: pass1Flags === 0 ? 'PASS' : 'FAIL' },
    pass2: { flags: pass2Flags, warnings: pass2Warns, status: pass2Flags === 0 ? 'PASS' : 'FAIL' },
    hardestLine,
    syllableBudget,
    lineReports
  };
}

const CONCRETE_REPLACEMENTS = {
  neon: 'amber',
  shadow: 'corner',
  shadows: 'corners',
  echo: 'aftertone',
  echoes: 'aftertones',
  heartbeat: 'wrist-pulse',
  collide: 'cross',
  colliding: 'crossing',
  abyss: 'trench',
  void: 'hollow',
  ethereal: 'weightless',
  symphony: 'overtone',
  tapestry: 'weave',
  kaleidoscope: 'prism',
  vortex: 'undertow',
  cosmos: 'stratosphere',
  celestial: 'high-range',
  labyrinth: 'hallway',
  phantoms: 'footsteps',
  whispers: 'murmurs'
};

export function sanitizeConcretePhrase(raw, maxWords = 5) {
  let clean = String(raw || '')
    .replace(/^["'\s#*_-]+|["'\s#*_-]+$/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();
  if (!clean || /^[a-z0-9]+(-[a-z0-9]+)+$/i.test(clean)) {
    return 'the copper wire';
  }
  for (const [bad, good] of Object.entries(CONCRETE_REPLACEMENTS)) {
    clean = clean.replace(new RegExp(`\\b${bad}\\b`, 'gi'), good);
  }
  const words = clean.split(/\s+/).slice(0, maxWords);
  return words.join(' ');
}

const VERSE_PAIRS = [
  {
    v1: [
      'Two-fifteen beside the radiator valve',
      'You left a clementine upon the window ledge'
    ],
    v2: [
      'Four-forty-five across the empty parking lane',
      'I fold the warm receipt and step toward the train'
    ]
  },
  {
    v1: [
      'Cold coffee sitting by the studio mixing board',
      'You taped a polaroid above the patch-bay cord'
    ],
    v2: [
      'First daylight creeping underneath the loading door',
      'We lock the flight-cases across the plywood floor'
    ]
  },
  {
    v1: [
      'Three dollars remaining on a scratched-up transit pass',
      'You tuned the baritone behind the frosted glass'
    ],
    v2: [
      'Last harbor ferry blowing through the morning gray',
      'I tighten down the pegs for what is left to say'
    ]
  },
  {
    v1: [
      'Fluorescent flicker in the basement laundry room',
      'You wrote the gate code on my wrist in ballpoint blue'
    ],
    v2: [
      'Delivery diesel idling by the corner store',
      'I leave the brass key resting on the cellar door'
    ]
  },
  {
    v1: [
      'Warm solder smoke above a cracked ceramic mug',
      'You kicked the braided cable over the woven rug'
    ],
    v2: [
      'Street-sweeper brushing down the curb at six a-m',
      'I coil the copper leads and count to four again'
    ]
  },
  {
    v1: [
      'A cracked phone glowing on the dusty dashboard tray',
      'The wipers push the wet pine needles out the way'
    ],
    v2: [
      'Mile-marker ninety-four in early highway glare',
      'I roll the window down to taste the river air'
    ]
  },
  {
    v1: [
      'Check-out was noon and both my shoelaces are frayed',
      'You underlined a sentence on the folded page'
    ],
    v2: [
      'The elevator bell rings down the quiet hall',
      'I lift the canvas bag and step out from the wall'
    ]
  },
  {
    v1: [
      'Grease-pencil markings on the spinning quarter-reel',
      'You hummed the bassline just to see how it would feel'
    ],
    v2: [
      'First delivery trucks rattle the bakery stall',
      'I pull the fader down and let the room-tone fall'
    ]
  }
];

const PRE_CHORUS_POOL = [
  [
    'Hands steady on the grain',
    'Say it clear and plain'
  ],
  [
    'Count four upon the rim',
    'Before the bulbs go dim'
  ],
  [
    'Short breath inside the throat',
    'Lean into every note'
  ],
  [
    'Thumb resting on the fret',
    'We are not finished yet'
  ],
  [
    'Red needle on the meter',
    'Make the middle sweeter'
  ],
  [
    'Step closer to the wire',
    'Pull the tension higher'
  ]
];

const CHORUS_FRAMES = [
  (motif, inst) => [
    `${motif} in the room below`,
    `Keep the ${inst} warm and let it go`
  ],
  (motif, inst) => [
    `${motif}, hanging in the air`,
    `While the ${inst} answers from the stair`
  ],
  (motif, inst) => [
    `${motif}, calling out again`,
    `While the ${inst} holds the wooden frame`
  ],
  (motif, inst) => [
    `${motif} across the concrete floor`,
    `Let the ${inst} open up the door`
  ],
  (motif, inst) => [
    `${motif}, pulling us right now`,
    `Let the ${inst} cool the copper down`
  ],
  (motif, inst) => [
    `${motif}, breaking into two`,
    `Let the ${inst} carry us on through`
  ]
];

const OUTRO_LINES = [
  (motif) => `Leave the porch bulb glowing while ${motif.toLowerCase()} settles slow`,
  (motif) => `Just the room-tone breathing where ${motif.toLowerCase()} used to go`,
  () => `Hold that final chord until the windowpanes stop shaking now`,
  () => `Let the tape reel spin until the copper wire cools down`
];

function hashString(str) {
  let h = 2166136261;
  const s = String(str || 'seed');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function generateLyricSeed(profile = {}) {
  const title = profile.title || profile.bandName || 'The Taproot Swallows Altitude';
  const bpm = Number(profile.bpm) || 120;
  const rawInst = Array.isArray(profile.instruments) && profile.instruments.length > 0
    ? profile.instruments[0]
    : 'low baritone';
  let cleanInst = sanitizeConcretePhrase(
    String(rawInst).replace(/\(.*?\)/g, '').trim(),
    2
  ).toLowerCase() || 'copper wire';
  if (countLineSyllables(cleanInst) > 4) {
    cleanInst = sanitizeConcretePhrase(cleanInst, 1).toLowerCase() || 'low wire';
  }

  let motif = sanitizeConcretePhrase(title, 4);
  if (countLineSyllables(motif) > 8) {
    motif = sanitizeConcretePhrase(title, 3);
  }
  if (countLineSyllables(motif) > 8) {
    motif = sanitizeConcretePhrase(title, 2);
  }
  if (countLineSyllables(motif) > 8) {
    motif = 'The taproot';
  }

  const baseHash = hashString(`${title}::${ profile.bandName || '' }::${ profile.category || '' }`);

  for (let attempt = 0; attempt < VERSE_PAIRS.length * 2; attempt++) {
    const vIdx = (baseHash + attempt) % VERSE_PAIRS.length;
    const pcIdx = (baseHash + attempt * 3) % PRE_CHORUS_POOL.length;
    const chIdx = (baseHash + attempt * 5) % CHORUS_FRAMES.length;
    const outIdx = (baseHash + attempt * 7) % OUTRO_LINES.length;

    const versePair = VERSE_PAIRS[vIdx];
    const preChorus = PRE_CHORUS_POOL[pcIdx];
    const chorus = CHORUS_FRAMES[chIdx](motif, cleanInst);
    const outroLine = OUTRO_LINES[outIdx](motif);

    const candidate = [
      '[Intro]',
      '[Verse 1]',
      versePair.v1[0],
      versePair.v1[1],
      '',
      '[Pre-Chorus]',
      preChorus[0],
      preChorus[1],
      '',
      '[Chorus]',
      chorus[0],
      chorus[1],
      '',
      '[Verse 2]',
      versePair.v2[0],
      versePair.v2[1],
      '',
      '[Drop]',
      '',
      '[Outro]',
      outroLine,
      '[Fade Out]'
    ].join('\n');

    const audit = auditLyrics(candidate, { bpm });
    if (audit.passed) {
      return {
        lyricSnippet: candidate,
        audit
      };
    }
  }

  const fallback = [
    '[Intro]',
    '[Verse 1]',
    'Two-fifteen beside the radiator valve',
    'You left a clementine upon the window ledge',
    '',
    '[Pre-Chorus]',
    'Hands steady on the grain',
    'Say it clear and plain',
    '',
    '[Chorus]',
    'The taproot swallows altitude below',
    'Keep the low wire warm and let it go',
    '',
    '[Verse 2]',
    'Four-forty-five across the empty parking lane',
    'I fold the warm receipt and step toward the train',
    '',
    '[Drop]',
    '',
    '[Outro]',
    'Let the tape reel spin until the copper wire cools down',
    '[Fade Out]'
  ].join('\n');

  return {
    lyricSnippet: fallback,
    audit: auditLyrics(fallback, { bpm })
  };
}
