import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to extract setInputValueReliably and applyGlowFeedback from extension/content.js
function loadContentJsFunctions() {
  const contentPath = path.resolve(__dirname, '../extension/content.js');
  const content = fs.readFileSync(contentPath, 'utf8');

  const matchSetInput = content.match(/function setInputValueReliably\([\s\S]*?\n  \}\n/);
  const matchApplyGlow = content.match(/function applyGlowFeedback\([\s\S]*?\n  \}\n/);

  if (!matchSetInput) {
    throw new Error('Could not find setInputValueReliably in extension/content.js');
  }
  if (!matchApplyGlow) {
    throw new Error('Could not find applyGlowFeedback in extension/content.js');
  }

  return {
    source: `${matchApplyGlow[0]}\n${matchSetInput[0]}`
  };
}

class MockDataTransfer {
  constructor() {
    this.data = {};
  }
  setData(format, data) {
    this.data[format] = String(data);
  }
  getData(format) {
    return this.data[format] || '';
  }
}

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.target = null;
  }
}

class MockClipboardEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.clipboardData = init.clipboardData || new MockDataTransfer();
  }
}

class MockElement {
  constructor(tag = 'div', attributes = {}, classList = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attributes };
    this._classes = new Set(classList);
    this.classList = {
      contains: (name) => this._classes.has(name),
      add: (name) => this._classes.add(name),
      remove: (name) => this._classes.delete(name)
    };
    this.style = {};
    this.listeners = {};
    this._innerText = '';
    this._innerHTML = '';
    this.isContentEditable = attributes['contenteditable'] === 'true';
    this.children = [];
  }

  getAttribute(attr) {
    return this.attributes[attr] !== undefined ? this.attributes[attr] : null;
  }

  hasAttribute(attr) {
    return attr in this.attributes;
  }

  setAttribute(attr, val) {
    this.attributes[attr] = String(val);
    if (attr === 'contenteditable') this.isContentEditable = (val === 'true');
  }

  focus() {
    this._focused = true;
  }

  closest(selector) {
    if (selector === '[data-lexical-editor]' && this.hasAttribute('data-lexical-editor')) {
      return this;
    }
    return null;
  }

  querySelector(selector) {
    if (selector === 'p') {
      return this.children.find(c => c.tagName === 'P') || null;
    }
    return null;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    event.target = this;
    if (this.listeners[event.type]) {
      for (const listener of this.listeners[event.type]) {
        listener(event);
      }
    }
    return true;
  }

  get innerText() {
    return this._innerText;
  }
  set innerText(val) {
    this._innerText = val;
  }

  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val) {
    this._innerHTML = val;
  }

  get textContent() {
    return this._innerText;
  }
  set textContent(val) {
    this._innerText = val;
  }
}

function createDOMEnvironment() {
  const execCommands = [];
  const dispatchedEvents = [];

  const mockDocument = {
    execCommand: (cmd, showUI, value) => {
      execCommands.push({ cmd, showUI, value });
      return true;
    },
    createRange: () => ({
      selectNodeContents: () => {},
      collapse: () => {}
    })
  };

  const mockWindow = {
    getSelection: () => ({
      removeAllRanges: () => {},
      addRange: () => {}
    }),
    location: { hostname: 'suno.com' }
  };

  const sandbox = {
    document: mockDocument,
    window: mockWindow,
    DataTransfer: MockDataTransfer,
    ClipboardEvent: MockClipboardEvent,
    Event: MockEvent,
    InputEvent: MockEvent,
    KeyboardEvent: MockEvent,
    HTMLTextAreaElement: class {},
    HTMLInputElement: class {},
    setTimeout,
    clearTimeout,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  };

  const context = vm.createContext(sandbox);
  const { source } = loadContentJsFunctions();
  vm.runInContext(source, context);

  return {
    setInputValueReliably: context.setInputValueReliably,
    execCommands,
    dispatchedEvents
  };
}

test('Suno Lexical Rich-Text Editor: dispatches paste once, zero execCommand(insertText), zero duplication with async reconciliation', async () => {
  const { setInputValueReliably, execCommands } = createDOMEnvironment();

  // Simulating Suno's Lexical Rich-Text Editor:
  // <div aria-label="Lyrics editor" class="lyrics-editor-content" contenteditable="true" data-lexical-editor="true"><p class="lyrics-paragraph"><br></p></div>
  const lexicalEditor = new MockElement('div', {
    'aria-label': 'Lyrics editor',
    'contenteditable': 'true',
    'data-lexical-editor': 'true'
  }, ['lyrics-editor-content']);

  const initialParagraph = new MockElement('p', { class: 'lyrics-paragraph' }, ['lyrics-paragraph']);
  lexicalEditor.children.push(initialParagraph);
  lexicalEditor.innerHTML = '<p class="lyrics-paragraph"><br></p>';
  lexicalEditor.innerText = '';

  let pasteEventCount = 0;
  let receivedPastedText = null;

  // Lexical simulates async reconciliation (e.g. React 18 / Lexical transaction scheduled at 10ms)
  lexicalEditor.addEventListener('paste', (event) => {
    pasteEventCount++;
    receivedPastedText = event.clipboardData.getData('text/plain');

    setTimeout(() => {
      // Reconciled DOM after 10ms
      lexicalEditor.innerText = receivedPastedText;
      const lines = receivedPastedText.split('\n');
      lexicalEditor.innerHTML = lines.map(line => `<p class="lyrics-paragraph">${line}</p>`).join('');
    }, 10);
  });

  const testLyrics = '[Verse 1]\nNeon shadows in the midnight rain\nLost inside the digital domain\n[Chorus]\nPulse of the groove';

  const result = setInputValueReliably(lexicalEditor, testLyrics);
  assert.equal(result, true, 'setInputValueReliably should return true');

  // Verify immediate state:
  // 1. paste event dispatched exactly once
  assert.equal(pasteEventCount, 1, 'Expected paste event to be dispatched exactly once');
  assert.equal(receivedPastedText, testLyrics, 'ClipboardData text should match target lyrics');

  // 2. execCommand('insertText') must NEVER be called on Lexical editor
  const insertTextCalls = execCommands.filter(c => c.cmd === 'insertText');
  assert.equal(insertTextCalls.length, 0, 'execCommand("insertText") must NEVER be called on Lexical editor');

  // Wait 100ms so both the Lexical async reconciliation (10ms) and the fallback timeout (80ms) finish
  await new Promise(resolve => setTimeout(resolve, 100));

  // 3. Verify final state after reconciliation & fallback check:
  // Text should match testLyrics exactly (zero duplication)
  assert.equal(lexicalEditor.innerText, testLyrics, 'Lyrics text in editor should match exactly once');

  // Verify intro/verse count to ensure no stacked/duplicated sections
  const verseMatches = (lexicalEditor.innerText.match(/\[Verse 1\]/g) || []).length;
  assert.equal(verseMatches, 1, 'Section tags must never be duplicated');

  const chorusMatches = (lexicalEditor.innerText.match(/\[Chorus\]/g) || []).length;
  assert.equal(chorusMatches, 1, 'Chorus tags must never be duplicated');

  // Verify execCommands still has zero insertText calls
  const finalInsertTextCalls = execCommands.filter(c => c.cmd === 'insertText');
  assert.equal(finalInsertTextCalls.length, 0, 'execCommand("insertText") remained 0 after deferred check');
});

test('Fallback path: if Lexical paste does not reconcile within 80ms, deferred fallback populates content cleanly', async () => {
  const { setInputValueReliably, execCommands } = createDOMEnvironment();

  // Simulating an unhandled Lexical editor where paste listener is inert
  const unhandledLexical = new MockElement('div', {
    'contenteditable': 'true',
    'data-lexical-editor': 'true'
  }, ['lyrics-editor-content']);
  unhandledLexical.innerText = '';
  unhandledLexical.innerHTML = '<p class="lyrics-paragraph"><br></p>';

  const lyrics = '[Intro]\nSilent night';
  setInputValueReliably(unhandledLexical, lyrics);

  // Before 80ms, innerText is empty because no paste listener ran
  assert.equal(unhandledLexical.innerText, '');

  // Wait 100ms for the 80ms fallback timeout to execute
  await new Promise(resolve => setTimeout(resolve, 100));

  // The fallback should have set the innerHTML with lexical paragraphs
  assert.match(unhandledLexical.innerHTML, /<p class="lyrics-paragraph"/, 'Fallback should inject lexical paragraphs');
  assert.match(unhandledLexical.innerHTML, /\[Intro\]/, 'Fallback should contain text');
  // execCommand insertText was still not called
  const insertTextCalls = execCommands.filter(c => c.cmd === 'insertText');
  assert.equal(insertTextCalls.length, 0, 'Fallback uses DOM paragraph reconstruction, not execCommand insertText');
});

test('Non-Lexical contenteditable editor (TopMediai): uses execCommand(insertText)', async () => {
  const { setInputValueReliably, execCommands } = createDOMEnvironment();

  // Plain contenteditable div without data-lexical-editor or lyrics-editor-content
  const topMediaiEditor = new MockElement('div', {
    'contenteditable': 'true',
    'role': 'textbox'
  }, ['plain-editor']);

  const text = 'TopMediai prompt text';
  setInputValueReliably(topMediaiEditor, text);

  // For non-Lexical contenteditable, execCommand('insertText') SHOULD be called
  const insertTextCalls = execCommands.filter(c => c.cmd === 'insertText');
  assert.equal(insertTextCalls.length, 1, 'Non-Lexical contenteditable editor should use execCommand insertText');
  assert.equal(insertTextCalls[0].value, text);
});

test("Clearance before insertion", async () => {
  const { setInputValueReliably } = createDOMEnvironment();
  const editor = new MockElement("div", { "contenteditable": "true", "data-lexical-editor": "true" }, ["lyrics-editor-content"]);
  editor.innerText = "[Intro]\nOld discarded";
  editor.addEventListener("paste", (e) => {
    const t = e.clipboardData.getData("text/plain");
    setTimeout(() => { editor.innerText = t; }, 10);
  });
  setInputValueReliably(editor, "[Intro]\nNew pristine");
  await new Promise(r => setTimeout(r, 80));
  assert.equal(editor.innerText, "[Intro]\nNew pristine");
  assert.equal(editor.innerText.includes("Old"), false);
});
