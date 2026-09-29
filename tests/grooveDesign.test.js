import test from 'node:test';
import assert from 'node:assert/strict';
import { designGroove } from '../src/utils/grooveDesign.js';

test('slow grunge follows the named guitars, piano, and drums', () => {
  const result = designGroove({
    genres: ['Velvet Rigging (Grunge + Experimental Fusion)'],
    instruments: ['detuned 7-string baritone guitars', 'haunting piano', 'industrial drums'],
    bpm: 76, timeSig: '4/4'
  });
  assert.equal(result.family, 'rock');
  assert.match(result.description, /baritone guitars.*industrial drums.*half-time/);
  assert.match(result.description, /haunting piano/);
  assert.doesNotMatch(result.description + result.production, /808|synth|offbeat 16th/i);
});

test('tech house separates a named synth sub from its mid layer', () => {
  const result = designGroove({
    genres: ['Tech House'], instruments: ['Sine Sub Bass', 'Wavetable Mid Bass', 'Drum Machine'],
    bpm: 128, timeSig: '4/4', rng: () => 0
  });
  assert.equal(result.family, 'club');
  assert.match(result.description, /16th-note pocket/);
  assert.match(result.production, /Sine Sub Bass.*centered and clean.*upper harmonics/);
});

test('highlife uses percussion interplay in the requested meter', () => {
  const result = designGroove({
    genres: ['Highlife', 'plant bio-data'], instruments: ['Rhodes MK1', 'shekere percussion'],
    bpm: 128, timeSig: '12/8', rng: () => 0
  });
  assert.equal(result.family, 'afro');
  assert.match(result.description, /Rhodes MK1.*shekere percussion/);
  assert.match(result.description, /12\/8/);
  assert.doesNotMatch(result.description, /16th-note|4\/4|808/);
});

test('jazz and ambient do not inherit a club bass pattern', () => {
  const jazz = designGroove({ genres: ['Modal Jazz'], instruments: ['Upright Bass', 'brush drums'], timeSig: '5/4' });
  const ambient = designGroove({ genres: ['Ambient'], instruments: ['cello', 'piano'], timeSig: '3/4' });
  assert.equal(jazz.family, 'jazz');
  assert.match(jazz.description, /Upright Bass.*brush drums/);
  assert.equal(ambient.family, 'ambient');
  assert.match(ambient.description, /cello.*3\/4/);
  assert.doesNotMatch(jazz.description + ambient.description, /16th-note|four-on-the-floor|808/);
});
