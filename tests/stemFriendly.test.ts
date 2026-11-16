import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSunoPrompt,
  stripWetDescriptors,
  STEM_FRIENDLY_TAG_PHRASES
} from '../src/utils/sunoFormatter';
import type { GeneratedPrompt, VariationOptions } from '../src/types';

const ALL: VariationOptions = {
  rhythm: true, harmony: true, production: true, instruments: true,
  structure: true, vocals: true, mood: true, scene: true,
  usecase: true, key: true, title: true, highlight: true
};

const SUFFIX = STEM_FRIENDLY_TAG_PHRASES.join(', ');
const WET = /cavernous|lush reverb|washed[- ]out|reverb-drenched|drenched in|stereo reverb|plate reverb/i;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function counted(seed: number) {
  const inner = mulberry32(seed);
  const rng = () => { rng.calls++; return inner(); };
  rng.calls = 0;
  return rng;
}

/** Drop the fields that are random/time based regardless of the seeded rng. */
function stable(p: GeneratedPrompt | null) {
  assert.ok(p);
  const { id: _id, createdAt: _createdAt, ...rest } = p;
  return rest;
}

const CASES: Array<[string[], string, number, number, string[] | undefined]> = [
  [['Grunge', 'Ambient'], '4/4', 70, 90, undefined],
  [['Modal Jazz', 'Trap & Drill', 'Afrobeat'], '7/8', 95, 140, undefined],
  [['Grunge', 'Experimental Fusion'], '4/4', 65, 88, ['detuned 7-string baritone guitars', 'industrial drums']],
  [['Dream Pop & Shoegaze', 'Techno'], '4/4', 120, 128, ['808 sub bass', 'shimmering synth pad']]
];

test('off: output matches the pre-feature snapshot', () => {
  const p = generateSunoPrompt(['Grunge', 'Ambient'], '4/4', 70, 90, '320', ALL, mulberry32(42));
  assert.ok(p);
  assert.equal(p.sunoStyleTag, 'Grunge, Ambient, 70–90 BPM, C major, PLK Guzheng Secret, Hexanus Piccolo, Primordial, PLK Guzheng Secret sustains the low riff against the rhythmic accents at a half-time pace; leave a full beat of air before the next heavy accent. Give Hexanus Piccolo a response in the space after the anchor phrase., Preserve the attack and decay of the named instruments; leave low-frequency space for the rhythmic accents., whispered close-mic’d verses, melancholic');
  assert.equal(p.fullPrompt, '4/4, 70–90 BPM, 320kbps, C major, "Liquid Procession", Grunge × Ambient Fusion: Graft grunge and ambient. Lead with PLK Guzheng Secret, Hexanus Piccolo and Primordial. Sound design: Preserve the attack and decay of the named instruments; leave low-frequency space for the rhythmic accents. Underpinned by open-tuned resonance. Groove: PLK Guzheng Secret sustains the low riff against the rhythmic accents at a half-time pace; leave a full beat of air before the next heavy accent. Give Hexanus Piccolo a response in the space after the anchor phrase. Structure it with an extended instrumental breakdown at the midpoint. Vocals: whispered close-mic’d verses. The result should feel melancholic and restrained. Set it in a dense tropical marketplace. Intended use: a documentary montage. Highlight the interplay between PLK Guzheng Secret and the rhythmic accents.');
  assert.equal('stemFriendly' in p, false);
});

test('off: omitted, undefined and false produce identical output and rng usage', () => {
  for (const [genres, ts, lo, hi, inst] of CASES) {
    for (const seed of [1, 7, 42, 1234]) {
      const a = counted(seed), b = counted(seed), c = counted(seed);
      const pa = generateSunoPrompt(genres, ts, lo, hi, '320', ALL, a, inst);
      const pb = generateSunoPrompt(genres, ts, lo, hi, '320', { ...ALL, stemFriendly: undefined }, b, inst);
      const pc = generateSunoPrompt(genres, ts, lo, hi, '320', { ...ALL, stemFriendly: false }, c, inst);
      assert.deepEqual(stable(pb), stable(pa));
      assert.deepEqual(stable(pc), stable(pa));
      assert.equal(b.calls, a.calls);
      assert.equal(c.calls, a.calls);
    }
  }
});

test('on: suffix appended, everything else unchanged, rng call count unchanged', () => {
  for (const [genres, ts, lo, hi, inst] of CASES) {
    for (const seed of [1, 7, 42, 1234]) {
      const offRng = counted(seed), onRng = counted(seed);
      const off = generateSunoPrompt(genres, ts, lo, hi, '320', ALL, offRng, inst);
      const on = generateSunoPrompt(genres, ts, lo, hi, '320', { ...ALL, stemFriendly: true }, onRng, inst);
      assert.ok(off && on);
      assert.equal(onRng.calls, offRng.calls, 'stem-friendly must not consume the rng');
      assert.equal(on.stemFriendly, true);
      assert.equal(on.title, off.title);
      assert.equal(on.key, off.key);
      assert.deepEqual(on.selectedInstruments, off.selectedInstruments);
      assert.equal(on.lyricSnippet, off.lyricSnippet);
      // Current pools carry no wet descriptors into the tag, so the non-suffix part is identical.
      assert.ok(on.sunoStyleTag.startsWith(off.sunoStyleTag + ', '), on.sunoStyleTag);
      assert.ok(on.sunoStyleTag.includes('dry studio tracking'));
      assert.ok(on.sunoStyleTag.includes('minimal reverb'));
      assert.ok(on.sunoStyleTag.includes('clear instrument separation'));
      assert.ok(on.fullPrompt.startsWith(off.fullPrompt + ' '));
      assert.match(on.fullPrompt, /Stem-friendly mix: dry studio tracking, .*minimal reverb.*\.$/);
    }
  }
});

test('on: exact suffix for a vocal prompt; close-mic vocal dropped for instrumentals', () => {
  const opts: VariationOptions = { ...ALL, vocals: false, stemFriendly: true };
  const p = generateSunoPrompt(['Grunge', 'Ambient'], '4/4', 70, 90, '320', opts, () => 0);
  assert.ok(p);
  assert.ok(p.sunoStyleTag.endsWith(SUFFIX), p.sunoStyleTag);

  // Find a seed whose vocal pick is instrumental.
  let found = false;
  for (let seed = 0; seed < 400 && !found; seed++) {
    const q = generateSunoPrompt(['Grunge', 'Ambient'], '4/4', 70, 90, '320', { ...ALL, stemFriendly: true }, mulberry32(seed));
    assert.ok(q);
    if (/(^|, )instrumental(, |$)/.test(q.sunoStyleTag)) {
      found = true;
      assert.doesNotMatch(q.sunoStyleTag, /close-mic vocal/);
      assert.match(q.sunoStyleTag, /dry studio tracking, minimal reverb, tight transients, clear instrument separation$/);
    }
  }
  assert.ok(found, 'expected at least one instrumental pick across seeds');
});

test('on: style tag carries no wet descriptors outside protected instrument names', () => {
  for (const [genres, ts, lo, hi, inst] of CASES) {
    for (const seed of [1, 7, 42, 1234]) {
      const on = generateSunoPrompt(genres, ts, lo, hi, '320', { ...ALL, stemFriendly: true }, mulberry32(seed), inst);
      assert.ok(on);
      let tag = on.sunoStyleTag;
      for (const name of on.selectedInstruments ?? []) tag = tag.split(name).join('');
      assert.doesNotMatch(tag, WET, tag);
    }
  }
});

test('on: user-chosen instrument names are protected; negated ambience wording is kept', () => {
  const opts: VariationOptions = { ...ALL, harmony: false, structure: false, vocals: false, mood: false, scene: false, usecase: false, key: false, title: false, highlight: false, stemFriendly: true };
  const wetName = generateSunoPrompt(['Grunge', 'Experimental Fusion'], '4/4', 65, 88, '320', opts, () => 0, ['cavernous reverb bass', 'industrial drums']);
  assert.ok(wetName);
  assert.ok(wetName.sunoStyleTag.includes('cavernous reverb bass, industrial drums'));
  assert.ok(wetName.sunoStyleTag.includes('Keep cavernous reverb bass focused in the center'));

  const guitar = generateSunoPrompt(['Grunge', 'Metal'], '4/4', 120, 130, '320', opts, () => 0, ['distorted guitar', 'acoustic drums']);
  assert.ok(guitar);
  assert.match(guitar.sunoStyleTag, /rather than washing out their edges/);
});

test('stripWetDescriptors: removes wet phrases and tidies leftovers', () => {
  const cases: Array<[string, string]> = [
    ['cavernous plate reverb', ''],
    ['lush reverb', ''],
    ['wide stereo reverb', ''],
    ['washed-out guitars', 'guitars'],
    ['washed out synths', 'synths'],
    ['spring reverb and tremolo', 'tremolo'],
    ['tape saturation and lush reverb', 'tape saturation'],
    ['vocals drenched in lush reverb', 'vocals'],
    ['reverb-drenched pads, tight kick', 'pads, tight kick'],
    ['dub-style delay throws', ''],
    ['a raw room with a cavernous reverb and gritty drums', 'a raw room and gritty drums'],
    ['Keep the snare punchy; huge hall reverb.', 'Keep the snare punchy.']
  ];
  for (const [input, expected] of cases) {
    assert.equal(stripWetDescriptors(input), expected, input);
    assert.doesNotMatch(stripWetDescriptors(input), WET);
  }
});

test('stripWetDescriptors: leaves negated and unrelated text untouched', () => {
  const keep = [
    'minimal reverb',
    'no reverb on the drums',
    'tape saturation and analog warmth',
    "Keep the guitar's low attack distinct from the kick; place ambience behind the hits rather than washing out their edges.",
    'close-mic’d intimacy',
    ''
  ];
  for (const text of keep) assert.equal(stripWetDescriptors(text), text);
});

test('stripWetDescriptors: protected terms survive', () => {
  assert.equal(
    stripWetDescriptors('Keep lush reverb pad wide, drums with lush reverb', ['lush reverb pad']),
    'Keep lush reverb pad wide, drums'
  );
});
