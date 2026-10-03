import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLyricBlueprint, clampStyle, deriveExcludeStyles, findBannedWords, splitAvoids, STYLE_LIMIT
} from '../src/utils/sunoBlueprint.js';

const items = list => list.split(', ');

test('banned AI words are caught in any inflection', () => {
  assert.deepEqual(findBannedWords('Echoes whispering under neon, my heartbeat ignited'),
    ['echoes', 'whispering', 'neon', 'heartbeat', 'ignited']);
  assert.deepEqual(findBannedWords('The station radio pulped a receipt'), []);
});

test('every lyric blueprint is free of banned words and sings nothing in parentheses', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
    const lyric = buildLyricBlueprint({ anchor: 'Upright Bass', pulse: 'brush drums', rng: () => r });
    assert.deepEqual(findBannedWords(lyric), [], `sketch ${r}`);
    assert.doesNotMatch(lyric, /[()]/);
    assert.match(lyric, /^\[Intro - Upright Bass alone\]/);
    assert.match(lyric, /\[Bassline Drop\]/);
    assert.match(lyric, /\[Outro - Fade\]$/);
  }
});

test('blueprint tags fall back to generic directions without named instruments', () => {
  const lyric = buildLyricBlueprint({ anchor: 'the low end', pulse: 'the drums', rng: () => 0 });
  assert.match(lyric, /\[Intro - Instrumental\]/);
  assert.match(lyric, /\[Breakdown - Rhythm Section Only\]/);
});

test('exclusions never remove what the seed asks for', () => {
  const trap = items(deriveExcludeStyles({ genres: ['Trap & Drill', 'Dream Pop & Shoegaze'], instruments: ['808 Bass'] }));
  assert.ok(!trap.includes('trap hi-hats'));
  assert.ok(trap.length >= 3 && trap.length <= 6);

  const metal = items(deriveExcludeStyles({ genres: ['Black Metal', 'Djent'], style: 'growled vocals over 8-string riffs' }));
  assert.ok(!metal.some(i => /death growls|distorted guitar|sludge metal/.test(i)));
  assert.ok(metal.includes('pop rock'));
});

test('authored avoid items lead the list and instrumental seeds exclude vocals', () => {
  const list = items(deriveExcludeStyles({ genres: ['Ambient'], style: 'instrumental only drift', avoid: ['trap hats', 'lush pads'] }));
  assert.deepEqual(list.slice(0, 2), ['trap hats', 'lush pads']);
  assert.ok(!list.includes('trap hi-hats'));
  assert.ok(list.includes('vocals'));
});

test('avoid sentences move out of the style prompt', () => {
  const { style, avoided } = splitAvoids('Dry acid house at 124 BPM. Avoid trap hats, EDM builds and lush pads. Keep the 303 short.');
  assert.equal(style, 'Dry acid house at 124 BPM. Keep the 303 short.');
  assert.deepEqual(avoided, ['trap hats', 'EDM builds', 'lush pads']);
});

test('style prompts are clamped under Suno\'s 1,000-character field at a clause boundary', () => {
  const long = Array.from({ length: 60 }, (_, i) => `layer ${i} of warm tape-saturated electric piano`).join(', ');
  const clamped = clampStyle(long);
  assert.ok(clamped.length <= STYLE_LIMIT && clamped.length > 750);
  assert.match(clamped, /piano\.$/);
  assert.equal(clampStyle('short prompt'), 'short prompt');
});
