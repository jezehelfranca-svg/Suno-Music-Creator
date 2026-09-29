import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSunoPrompt } from '../src/utils/sunoFormatter';
import type { VariationOptions } from '../src/types';

const options: VariationOptions = {
  rhythm: true, harmony: false, production: true, instruments: true,
  structure: false, vocals: false, mood: false, scene: false,
  usecase: false, key: false, title: false, highlight: false
};

test('copyable Suno style preserves seed instruments and the slow grunge groove', () => {
  const names = ['detuned 7-string baritone guitars', 'haunting piano', 'industrial drums'];
  const prompt = generateSunoPrompt(['Grunge', 'Experimental Fusion'], '4/4', 65, 88, '320', options, () => 0, names);
  assert.ok(prompt);
  for (const name of names) assert.ok(prompt.sunoStyleTag.includes(name));
  assert.match(prompt.sunoStyleTag, /half-time pace.*industrial drums|industrial drums.*half-time pace/);
  assert.match(prompt.fullPrompt, /Groove:.*half-time pace/);
  assert.doesNotMatch(prompt.sunoStyleTag, /808|sub synth|four-on-the-floor/i);
});

test('rhythm and production toggles omit the related direction', () => {
  const prompt = generateSunoPrompt(['Modal Jazz', 'Ambient'], '5/4', 82, 82, '320',
    { ...options, rhythm: false, production: false }, () => 0, ['Upright Bass', 'brush drums']);
  assert.ok(prompt);
  assert.doesNotMatch(prompt.sunoStyleTag, /Phrase the accents|Keep Upright Bass/);
  assert.doesNotMatch(prompt.fullPrompt, /Groove:|Sound design:/);
});
