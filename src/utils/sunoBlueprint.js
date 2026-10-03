/**
 * GMIV+P+Era rules for Suno output: a Style of Music prompt strictly under
 * 1,000 characters, an Exclude Styles negative prompt that never contradicts it,
 * and lyric blueprints free of the words that mark a lyric as machine-written.
 * Keep this module self-contained (no imports) so Node build scripts, the
 * server and the web app all share it. The exclusion tables mirror
 * Fictional-Bands/tools/add_suno_blueprint.py; change both together.
 */

export const STYLE_LIMIT = 999;

export const BANNED_LYRIC_WORDS = [
  'neon', 'shadows', 'static', 'whisper', 'ignite', 'heartbeat',
  'overdrive', 'echo', 'digital', 'symphony', 'pulse'
];

// Stems so plurals and verb forms ("echoes", "whispering", "ignited") are caught too.
const BANNED_STEMS = /\b(neon|shadow|static|whisper|ignit|heartbeat|overdriv|echo|digital|symphon|puls)\w*/gi;

/** Banned words found in a lyric, lower-cased and de-duplicated, in order of appearance. */
export function findBannedWords(text = '') {
  const found = (String(text).match(BANNED_STEMS) || []).map(w => w.toLowerCase());
  return [...new Set(found)];
}

/** Cut a style prompt at the last clean clause boundary that fits Suno's field. */
export function clampStyle(prompt = '', limit = STYLE_LIMIT) {
  const text = String(prompt).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit - 1);
  for (const [sep, floor] of [['. ', 600], [', ', 750], [' ', 0]]) {
    const i = cut.lastIndexOf(sep);
    if (i > floor) { cut = cut.slice(0, i); break; }
  }
  return cut.replace(/[\s,;:-]+$/, '') + '.';
}

const AVOID = /(?:^|(?<=[.!?] ))Avoid\b([^.]*)\.\s*/g;

/** Move "Avoid X, Y and Z." sentences out of a style prompt: Suno reads every style it is shown as a request. */
export function splitAvoids(style = '') {
  const avoided = [];
  for (const m of String(style).matchAll(AVOID)) {
    for (const raw of m[1].split(/,\s*|\s+and\s+|\s+or\s+/)) {
      const part = raw.replace(/["“”]/g, '').trim();
      if (part && part.split(/\s+/).length <= 5 && !avoided.some(a => a.toLowerCase() === part.toLowerCase())) {
        avoided.push(part);
      }
    }
  }
  return { style: String(style).replace(AVOID, '').trim(), avoided };
}

const FAMILIES = {
  metal: /metal|djent|thrash|\bdoom|sludge|grind|deathcore|hardcore|growl|breakdown|shred/gi,
  rock: /\brock\b|punk|grunge|shoegaze|post-rock|garage rock|surf|krautrock|britpop|new wave|riffs?\b/gi,
  electronic: /techno|\bhouse\b|trance|\bedm\b|electro|synthwave|\bidm\b|dubstep|jungle|drum ?'?n'? ?bass|gabber|hardstyle|\bebm\b|\brave\b|breakbeat|footwork|future bass|bass music/gi,
  hiphop: /\brap\b|hip[- ]?hop|\btrap\b|\bdrill\b|grime|boom[- ]bap|turntabl|scratch/gi,
  jazz: /jazz|bebop|\bbop\b|\bswing\b|bossa|lounge|big band|saxophone/gi,
  folk: /\bfolk|bluegrass|country|americana|celtic|banjo|fiddle|singer[-/ ]?songwriter|hillbilly/gi,
  ambient: /ambient|drone|new age|meditative|432 ?hz|relaxing|ethereal|dreamy/gi,
  orchestral: /orchestra|cinematic|classical|baroque|chamber|symphonic|opera|choir|choral/gi,
  pop: /\bpop\b|k-pop|j-pop|city pop|synthpop|electropop|dance-pop|\bidol/gi,
  soul: /\bsoul\b|funk|r&b|gospel|disco|motown|blues|new jack/gi,
  world: /highlife|afrobeat|amapiano|cumbia|salsa|zouk|bhangra|tropicalia|dancehall|reggae|\bdub\b|\bska\b|timba|moombahton|raga|flamenco|samba|gnawa|tropical/gi,
  lofi: /lo-?fi|chillwave|\bchill\b|cozy|vinyl crackle|cassette/gi
};

const FOILS = {
  metal: ['pop rock', 'trap hi-hats', 'smooth jazz', 'acoustic ballad'],
  rock: ['EDM drops', 'trap hi-hats', 'smooth jazz', 'bubblegum pop'],
  electronic: ['acoustic folk', 'country twang', 'acoustic ballad', 'smooth jazz'],
  hiphop: ['country twang', 'operatic vocals', 'acoustic folk', 'power ballad'],
  jazz: ['EDM drops', 'trap hi-hats', 'distorted guitar', 'four-on-the-floor kick'],
  folk: ['EDM drops', 'trap hi-hats', 'dubstep wobble', 'synth bass'],
  ambient: ['trap hi-hats', 'EDM drops', 'aggressive rap', 'busy drum fills'],
  orchestral: ['trap hi-hats', 'EDM drops', 'pop punk', 'lo-fi hiss'],
  pop: ['death growls', 'lo-fi hiss', 'sludge metal', 'free jazz'],
  soul: ['EDM drops', 'death growls', 'dubstep wobble', 'trap hi-hats'],
  world: ['generic pop EDM', 'stadium rock', 'dubstep wobble', 'trap hi-hats'],
  lofi: ['EDM drops', 'death growls', 'stadium rock', 'hyperpop']
};
const FALLBACK_FOILS = ['generic pop EDM', 'stadium rock', 'country twang', 'trap hi-hats'];
const VOCAL_ARTIFACTS = ['autotune', 'chipmunk vocals', 'vocal fry'];
const PRODUCTION_ARTIFACTS = ['lo-fi hiss', 'muddy mix'];

// A candidate is dropped when the seed mentions anything it would remove.
const CLASHES = {
  'pop rock': /pop[- ]?rock|power pop|pop[- ]?punk/i,
  'trap hi-hats': /\btrap\b|\bdrill\b|phonk|hi-?hat rolls?|rattling hi-?hats/i,
  'smooth jazz': /jazz|\bsax|lounge|bossa|\bswing\b/i,
  'acoustic ballad': /ballad|acoustic|unplugged/i,
  'EDM drops': /\bedm\b|\bdrops?\b|dubstep|brostep|festival|big room|riddim|trance|hardstyle/i,
  'bubblegum pop': /bubblegum|\bpop\b|\bidol/i,
  'acoustic folk': /\bfolk|acoustic|bluegrass|celtic|americana|banjo|fiddle|singer[-/ ]?songwriter/i,
  'country twang': /country|twang|bluegrass|americana|honky|pedal steel|banjo|western|hillbilly|rockabilly/i,
  'operatic vocals': /opera|soprano|\baria\b|choir|choral|classical|bel canto|symphonic/i,
  'power ballad': /ballad|arena/i,
  'distorted guitar': /distort|metal|djent|\brock\b|grunge|punk|shoegaze|fuzz|overdrive|noise|thrash|\bdoom|sludge|riff/i,
  'four-on-the-floor kick': /\bhouse\b|techno|disco|four[- ]on[- ]the[- ]floor|\bdance|\bedm\b|trance|garage|hi-?nrg|eurobeat|electro swing|nu rave/i,
  'dubstep wobble': /dubstep|wobble|brostep|riddim|bass music|glitch hop|neurofunk|future bass/i,
  'synth bass': /synth|808|sub[- ]?bass|reese|electronic|moog|bass music/i,
  'aggressive rap': /\brap|hip[- ]?hop|\bdrill\b|grime|\btrap\b|spoken|\bmc\b|toasting/i,
  'busy drum fills': /math rock|\bprog|drum ?'?n'? ?bass|jungle|breakcore|fusion|technical|polyrhythm|djent|blast ?beat|footwork|juke/i,
  'pop punk': /punk/i,
  'lo-fi hiss': /lo-?fi|hiss|tape|vinyl|cassette|crackle|dusty|degraded|bit-?crush|\bvhs\b|warble|flutter/i,
  'death growls': /growl|death|metal|grind|hardcore|scream|guttural|harsh vocal|djent/i,
  'sludge metal': /sludge|\bdoom|stoner|metal/i,
  'free jazz': /jazz|avant|improvis|\bfree\b/i,
  'generic pop EDM': /\bpop\b|\bedm\b|dance[- ]pop|electropop/i,
  'stadium rock': /stadium|arena|\brock\b|anthem/i,
  'hyperpop': /hyperpop|pc music|bubblegum bass|glitchcore|nightcore/i,
  'autotune': /auto-?tune|vocoder|pitch[- ]correct|robotic|talk ?box|cyber|android|synthetic voc|vocal chops?|glitch(?:ed)? vocal/i,
  'chipmunk vocals': /chipmunk|pitched[- ]up|nightcore|helium|kawaii|hyperpop/i,
  'vocal fry': /vocal fry|\bfry\b|whisper|breathy|murmur|asmr|spoken/i,
  'muddy mix': /\bmud|murk|sludge|swamp|smear/i
};
// Near-synonyms: once one is chosen, the other adds nothing.
const OVERLAPS = [['EDM drops', 'generic pop EDM'], ['acoustic folk', 'acoustic ballad'], ['death growls', 'sludge metal']];
// What an author-written exclusion already covers, so derived items don't repeat it.
const COVERS = {
  'trap hi-hats': /\btrap\b/i,
  'EDM drops': /\bedm\b|\bdrops?\b|risers?/i,
  'generic pop EDM': /\bedm\b/i,
  'autotune': /auto-?tune|pitch[- ]correct/i,
  'lo-fi hiss': /lo-?fi|hiss|vinyl/i,
  'distorted guitar': /distort|fuzz/i,
  'stadium rock': /stadium|arena/i
};
const INSTRUMENTAL = /instrumental only|\bno vocals\b|without vocals|purely instrumental/i;

function rankFamilies(signal) {
  return Object.entries(FAMILIES)
    .map(([name, pattern]) => [name, (signal.match(pattern) || []).length])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

/**
 * 3–6 comma-separated items for Suno's Exclude Styles field: authored items first,
 * then opposing genres, textures and vocal artifacts for the seed's genre families.
 *
 * @param {{ genres?: string[], instruments?: string[], style?: string, avoid?: string[], instrumental?: boolean }} seed
 */
export function deriveExcludeStyles(seed = {}) {
  const genres = (seed.genres || []).filter(Boolean).join(' ');
  const style = seed.style || '';
  const owned = [genres, (seed.instruments || []).join(' '), style].join(' ');
  const chosen = (seed.avoid || []).filter(Boolean).slice(0, 5);
  const covered = chosen.join(' ');

  const usable = item => {
    if (chosen.includes(item)) return false;
    if (OVERLAPS.some(pair => pair.includes(item) && pair.some(p => chosen.includes(p)))) return false;
    const cover = COVERS[item] || new RegExp(`\\b${item.split(' ')[0].replace(/[^\w-]/g, '')}`, 'i');
    if (cover.test(covered)) return false;
    return !CLASHES[item]?.test(owned);
  };

  const families = rankFamilies(`${genres} ${style}`);
  // Two foils from the primary family and one from the secondary family,
  // topped up from the primary family and then the fallbacks.
  families.slice(0, 2).forEach((family, i) => {
    let quota = i === 0 ? 2 : 1;
    for (const item of FOILS[family]) {
      if (quota && chosen.length < 3 && usable(item)) { chosen.push(item); quota--; }
    }
  });
  for (const item of [...(FOILS[families[0]] || []), ...FALLBACK_FOILS]) {
    if (chosen.length < 3 && usable(item)) chosen.push(item);
  }
  if (seed.instrumental || INSTRUMENTAL.test(style)) chosen.push('vocals');
  else {
    const vocal = VOCAL_ARTIFACTS.find(usable);
    if (vocal) chosen.push(vocal);
  }
  const production = PRODUCTION_ARTIFACTS.find(usable);
  if (production) chosen.push(production);
  return chosen.slice(0, 6).join(', ');
}

// Lyric sketches: concrete nouns, mixed line lengths, ABAB/ABCB slant rhyme,
// and a final chorus that changes one detail. No banned words.
const SKETCHES = [
  {
    verse1: ['Dryer number six eats another quarter,', 'your hoodie rolling over in the glass again.', 'I fold the towels the way you never liked them,', 'corners in, the tags turned toward the drain.'],
    pre: ['The attendant locks the soap machine at ten.', 'I still have three loads left.'],
    chorus: ['Leave the quarters in the cup by the door,', "I'm folding what's still warm and leaving what's cold,", 'the lint screen keeps a year of what we wore,', 'I carry one basket out to the road.'],
    verse2: ['Sunday, the sign says under new management,', 'they painted over the dryer that never worked.', "Somebody's red sock turned my whites pink", 'and I laughed out loud for the first time since March.'],
    finalChorus: ['Leave the quarters in the cup by the door,', "I'm folding what's still warm and keeping what's mine,", 'the lint screen keeps a year of what we wore,', 'I carry both baskets out this time.']
  },
  {
    verse1: ['Four a.m., the proofing drawer is humming,', 'flour in the creases of my phone.', 'The radio says rain on the coastal highway,', "I shape the rolls the way your mother showed."],
    pre: ['The first bus passes empty.', 'I wave at it anyway.'],
    chorus: ['Sixty loaves before the shutters rise,', 'my apron double-knotted at the back,', 'I set your stool beside the cooling racks', 'and burn the first tray every time.'],
    verse2: ["The new girl asks why there's a stool no one sits on,", "I tell her it's for the deliveries.", "By June she's the one who sets it out,", 'dusting it off with the back of her hand.'],
    finalChorus: ['Sixty loaves before the shutters rise,', 'my apron double-knotted at the back,', 'she sets the stool beside the cooling racks', "and I don't burn a single tray this time."]
  },
  {
    verse1: ['Level four, the ticket in my teeth,', "the elevator's out of order since the spring,", 'your sunglasses still folded under the seat,', "one arm bent like it's waiting for something."],
    pre: ['I could pay the twelve dollars.', 'I could sit here one more hour.'],
    chorus: ['The gate arm lifts at the bottom of the ramp,', 'I turn left where we always turned right,', 'the attendant waves with half a sandwich in his hand,', "and the street comes in brighter than I'm ready for tonight."],
    verse2: ['Three weeks later I find the ticket in the wash,', 'pulped into a soft gray coin.', 'I keep it on the sill beside the spare keys', 'and the sunglasses I finally put on.'],
    finalChorus: ['The gate arm lifts at the bottom of the ramp,', 'I turn right, the way you always did,', 'the attendant waves with half a sandwich in his hand,', 'and I wave back with the window down this time.']
  },
  {
    verse1: ["Twenty-two boxes and the kettle's still out,", 'masking tape on anything that rings,', 'your handwriting on the one that says KITCHEN,', 'an arrow pointing up at everything.'],
    pre: ['The landlord wants the keys by noon.', 'I make one more cup.'],
    chorus: ['Leave the nail holes in the hallway wall,', 'let the next ones guess what used to hang there,', "I'm keeping the chipped blue mug and the cereal bowl", 'and leaving the folding chair at the top of the stairs.'],
    verse2: ["The new place smells like someone else's soap.", 'I unpack the radio first.', 'It finds the same station on its own,', "the traffic for a city I don't drive in anymore."],
    finalChorus: ["I'm putting one new nail in the hallway wall,", 'let the next ones guess what hangs there,', "I'm keeping the chipped blue mug and the cereal bowl", 'and buying a second folding chair.']
  }
];

/**
 * A full Suno lyric with functional arrangement tags. Directions sit in square
 * brackets because Suno sings anything in parentheses.
 *
 * @param {{ anchor?: string, pulse?: string, rng?: () => number }} seed
 */
export function buildLyricBlueprint(seed = {}) {
  const rng = seed.rng || Math.random;
  const sketch = SKETCHES[Math.min(SKETCHES.length - 1, Math.floor(rng() * SKETCHES.length))];
  const anchor = seed.anchor && !/^the /.test(seed.anchor) ? seed.anchor : '';
  const pulse = seed.pulse && !/^the /.test(seed.pulse) ? seed.pulse : '';
  const lowEnd = /bass|sub|808|contrabass/i.test(anchor);
  return [
    `[Intro - ${anchor ? `${anchor} alone` : 'Instrumental'}]`,
    '',
    '[Verse 1]', ...sketch.verse1,
    '',
    `[Pre-Chorus - ${pulse ? `${pulse} Out` : 'Strip Back'}]`, ...sketch.pre,
    '',
    '[Chorus - Full Band]', ...sketch.chorus,
    '',
    lowEnd ? '[Bassline Drop]' : `[Breakdown - ${anchor && pulse ? `${anchor} and ${pulse} only` : 'Rhythm Section Only'}]`,
    '',
    '[Verse 2]', ...sketch.verse2,
    '',
    '[Instrumental Bridge]',
    '',
    '[Final Chorus - Stacked Harmonies]', ...sketch.finalChorus,
    '',
    '[Outro - Fade]'
  ].join('\n');
}
