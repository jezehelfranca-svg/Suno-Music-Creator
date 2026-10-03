import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPromptForCopy, generateSunoPrompt } from '../src/utils/sunoFormatter';
import { findBannedWords } from '../src/utils/sunoBlueprint.js';
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

test('generated prompts carry a matched Exclude Styles and a cliché-free lyric blueprint', () => {
  const prompt = generateSunoPrompt(['City Pop', 'AOR Funk'], '4/4', 112, 120, '320',
    { ...options, vocals: true }, () => 0, ['Slap Bass', 'Electric Piano', 'Disco Drums']);
  assert.ok(prompt);
  const exclude = (prompt.excludeStyles || '').split(', ');
  assert.ok(exclude.length >= 3 && exclude.length <= 6);
  assert.deepEqual(findBannedWords(prompt.lyricSnippet), []);
  assert.match(prompt.lyricSnippet || '', /\[Bassline Drop\]/);
  assert.ok(prompt.sunoStyleTag.length < 1000);
  assert.match(formatPromptForCopy(prompt, 'complete-bundle'), /=== EXCLUDE STYLES ===\n.+/);
});
