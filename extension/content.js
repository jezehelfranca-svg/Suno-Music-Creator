// Suno Fusion v2.4 - Studio & AutoFill Engine for suno.com & topmediai.com
(function () {
  if (window.__sunoFusionInjected) return;
  window.__sunoFusionInjected = true;

  console.log('[Suno Fusion v2.4] Studio & Settings Engine initialized on ' + window.location.hostname);

  // Custom user-picked selectors
  let userCustomSelectors = {
    styleSelector: null,
    lyricsSelector: null,
    titleSelector: null,
    excludeSelector: null,
    createSelector: null
  };

  chrome.storage?.local?.get(['sf_style_sel', 'sf_lyrics_sel', 'sf_title_sel', 'sf_exclude_sel', 'sf_create_sel'], (res) => {
    if (res) {
      userCustomSelectors.styleSelector = res.sf_style_sel || null;
      userCustomSelectors.lyricsSelector = res.sf_lyrics_sel || null;
      userCustomSelectors.titleSelector = res.sf_title_sel || null;
      userCustomSelectors.excludeSelector = res.sf_exclude_sel || null;
      userCustomSelectors.createSelector = res.sf_create_sel || null;
    }
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.sf_style_sel !== undefined) userCustomSelectors.styleSelector = changes.sf_style_sel.newValue || null;
      if (changes.sf_lyrics_sel !== undefined) userCustomSelectors.lyricsSelector = changes.sf_lyrics_sel.newValue || null;
      if (changes.sf_title_sel !== undefined) userCustomSelectors.titleSelector = changes.sf_title_sel.newValue || null;
      if (changes.sf_exclude_sel !== undefined) userCustomSelectors.excludeSelector = changes.sf_exclude_sel.newValue || null;
      if (changes.sf_create_sel !== undefined) userCustomSelectors.createSelector = changes.sf_create_sel.newValue || null;
    }
  });

  // Robust Multi-Platform Input Value Setter (React 17/18/19 & TopMediai ContentEditable)
  function setInputValueReliably(element, text) {
    if (!element) return false;
    try {
      element.focus();

      // Handle Lexical Rich-Text Editor & ContentEditable nodes (Suno Lexical & TopMediai)
      if (element.isContentEditable || element.getAttribute('contenteditable') === 'true' || element.hasAttribute('data-lexical-editor') || element.getAttribute('role') === 'textbox' || element.tagName === 'DIV' || element.tagName === 'SPAN') {
        const isLexical = element.hasAttribute('data-lexical-editor') ||
                          element.getAttribute('data-lexical-editor') === 'true' ||
                          (element.classList && element.classList.contains('lyrics-editor-content')) ||
                          !!(element.closest && element.closest('[data-lexical-editor]'));

        // AST-Safe Clearance & Caret Prime: Ensure element is 100% emptied before inserting new content
        element.focus();
        try {
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
        } catch (e) {}

        // Full selection wipe across all child nodes if content still persists
        try {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            const fullRange = document.createRange();
            fullRange.selectNodeContents(element);
            sel.addRange(fullRange);
            document.execCommand('delete', false, null);
          }
        } catch (e) {}

        // Lexical AST DOM reset: If text still remains after execCommand, strictly reset container to a single empty paragraph
        if ((element.innerText || element.textContent || '').trim().length > 0) {
          try {
            element.innerHTML = '<p class="lyrics-paragraph"><br></p>';
            element.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (e) {}
        }

        try {
          const p = element.querySelector('p') || element;
          const range = document.createRange();
          range.selectNodeContents(p);
          range.collapse(true);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (e) {}

        if (isLexical) {
          // Lexical Editor Path: Mutually exclusive single native ClipboardEvent paste transaction
          try {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true
            });
            element.dispatchEvent(pasteEvent);
            console.log('[Suno Fusion:Lexical] Dispatched native ClipboardEvent paste transaction');
          } catch (pe) {
            console.warn('[Suno Fusion:Lexical] Failed to dispatch ClipboardEvent', pe);
          }

          // Dispatch only clean input and change events (no insertText InputEvent or keydown/keyup)
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          // Idempotent deferred verification check after 80ms
          setTimeout(() => {
            if (((element.innerText || '').trim().length === 0)) {
              console.warn('[Suno Fusion:Lexical] Paste unhandled by Lexical after 80ms, applying paragraph fallback');
              try {
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
              } catch (e) {}
              const lines = text.split('\n');
              const pNodes = lines.map(line => {
                const escaped = line ? line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<br>';
                return `<p class="lyrics-paragraph" dir="auto">${line ? `<span data-lexical-text="true">${escaped}</span>` : '<br>'}</p>`;
              }).join('');
              element.innerHTML = pNodes;
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, 80);
        } else {
          // Non-Lexical contenteditable targets (e.g. TopMediai)
          try {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, text);
          } catch (e) {}

          if ((element.innerText || element.textContent || '').trim().length === 0) {
            element.textContent = text;
          }

          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        applyGlowFeedback(element);
        return true;
      }

      // Handle standard React Textarea / Input
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : (element instanceof HTMLInputElement ? HTMLInputElement.prototype : Object.getPrototypeOf(element));

      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set ||
                     Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
                     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

      // Ensure field is completely emptied before setting new text
      if (setter) {
        setter.call(element, '');
        setter.call(element, text);
      } else {
        element.value = '';
        element.value = text;
      }

      // Reset internal tracker if present (React _valueTracker)
      if (element._valueTracker) {
        element._valueTracker.setValue('');
      }

      // Dispatch InputEvent, native input, change, and keyboard events for React SyntheticEvent listeners
      try {
        element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      } catch (e) {}
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      applyGlowFeedback(element);
      return true;
    } catch (err) {
      console.error('[Suno Fusion] Error setting input value:', err);
      try {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
      return false;
    }
  }

  // Visual feedback glow
  function applyGlowFeedback(element) {
    if (!element || !element.style) return;
    const origOutline = element.style.outline;
    const origBorder = element.style.borderColor;
    const origBoxShadow = element.style.boxShadow;
    const origTransition = element.style.transition;

    element.style.transition = 'box-shadow 0.3s, border-color 0.3s, outline 0.3s';
    element.style.outline = '3px solid #8b5cf6';
    element.style.borderColor = '#8b5cf6';
    element.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.7)';

    setTimeout(() => {
      element.style.outline = origOutline;
      element.style.borderColor = origBorder;
      element.style.boxShadow = origBoxShadow;
      element.style.transition = origTransition;
    }, 2000);
  }
  const setReactInputValue = setInputValueReliably;

  // Ensure /create view is loaded (Suno-specific)
  function ensureOnCreatePage() {
    if (window.location.hostname.includes('topmediai')) {
      return true;
    }
    if (window.location.pathname.includes('/create')) return true;
    const createBtn = document.querySelector('a[href*="/create"], button[aria-label*="Create" i], nav a[href="/create"]') ||
      Array.from(document.querySelectorAll('a, button')).find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text === 'create' || text === 'create music';
      });

    if (createBtn) {
      createBtn.click();
      console.log('[Suno Fusion] Clicked Create tab');
      return true;
    }
    return false;
  }

  // Ensure Suno Mode (Custom / Advance vs Simple)
  function ensureSunoCustomMode(targetState = true) {
    if (window.location.hostname.includes('topmediai')) {
      return true;
    }

    const isCustomText = (t) => {
      const s = (t || '').trim().toLowerCase();
      return s === 'custom' || s === 'custom mode' || s === 'advanced' || s === 'advanced mode' || s === 'advance' || s === 'advance mode';
    };

    const isSimpleText = (t) => {
      const s = (t || '').trim().toLowerCase();
      return s === 'simple' || s === 'simple mode' || s === 'basic' || s === 'basic mode' || s === 'standard';
    };

    const matcher = targetState ? isCustomText : isSimpleText;
    const modeLabel = targetState ? 'Custom / Advance' : 'Simple';

    // 1. Suno Segmented Tabs (role="tab")
    const tabs = Array.from(document.querySelectorAll('button[role="tab"], [role="tab"]'));
    const matchedTab = tabs.find(b => matcher(b.textContent));
    if (matchedTab) {
      const isSelected = matchedTab.getAttribute('aria-selected') === 'true' ||
                         matchedTab.hasAttribute('data-active') ||
                         matchedTab.hasAttribute('data-composite-item-active');
      if (!isSelected) {
        matchedTab.click();
        console.log('[Suno Fusion] Switched to ' + modeLabel + ' tab');
        return true;
      }
      return true;
    }

    // 2. Switches / Checkboxes (e.g. "Custom" or "Advanced" toggle)
    const allSwitches = Array.from(document.querySelectorAll('button[role="switch"], [data-state], input[type="checkbox"], [aria-checked]'));
    for (const sw of allSwitches) {
      const container = sw.closest('div, label, section') || sw.parentElement;
      const text = (container ? container.textContent : sw.textContent || '').toLowerCase();
      if (text.includes('custom') || text.includes('advance') || text.includes('advanced')) {
        const isChecked = sw.getAttribute('data-state') === 'checked' ||
          sw.getAttribute('aria-checked') === 'true' ||
          (sw.tagName === 'INPUT' && sw.checked);

        if (isChecked !== targetState) {
          sw.click();
          console.log('[Suno Fusion] Toggled ' + modeLabel + ' mode switch');
          return true;
        }
        return true;
      }
    }

    // 3. Regular buttons with matching text
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], span, div')).filter(el => {
      return matcher(el.textContent);
    });

    for (const btn of buttons) {
      if (btn.offsetParent !== null) {
        btn.click();
        console.log('[Suno Fusion] Clicked ' + modeLabel + ' button');
        return true;
      }
    }
    return false;
  }
  const ensureCustomMode = ensureSunoCustomMode;

  // Expand Suno "More Options" Accordion
  function expandMoreOptions() {
    const excludeBox = document.querySelector('input[placeholder*="Exclude" i], textarea[placeholder*="Exclude" i], [aria-label*="Exclude" i]');
    if (excludeBox && excludeBox.offsetParent !== null) {
      return true; // Already expanded
    }

    const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return t === 'more options' || t.includes('more options') || t === 'advanced options';
    });

    for (const el of candidates) {
      if (el.offsetParent !== null) {
        el.click();
        console.log('[Suno Fusion] Clicked "More Options" expander');
        return true;
      }
    }
    return false;
  }

  // Toggle Suno Instrumental Switch
  function toggleInstrumental(targetState = true) {
    const allSwitches = Array.from(document.querySelectorAll('button[role="switch"], [data-state], input[type="checkbox"], [aria-checked]'));
    for (const sw of allSwitches) {
      const container = sw.closest('div, label, section') || sw.parentElement;
      const text = (container ? container.textContent : sw.textContent || '').toLowerCase();
      if (text.includes('instrumental')) {
        const isChecked = sw.getAttribute('data-state') === 'checked' ||
          sw.getAttribute('aria-checked') === 'true' ||
          (sw.tagName === 'INPUT' && sw.checked);

        if (isChecked !== targetState) {
          sw.click();
          return true;
        }
      }
    }
    return false;
  }

  // Set Vocal Gender (Male or Female)
  function setSunoVocalGender(gender) {
    if (!gender || gender === 'None' || gender === 'Duet') return false;
    expandMoreOptions();

    const buttons = Array.from(document.querySelectorAll('button, [role="button"], [role="radio"], span, div')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return t === gender.toLowerCase();
    });

    for (const btn of buttons) {
      const container = btn.closest('div, section, fieldset');
      const containerText = (container ? container.textContent : '').toLowerCase();
      if (containerText.includes('vocal gender') || containerText.includes('gender')) {
        btn.click();
        console.log('[Suno Fusion] Selected Vocal Gender:', gender);
        return true;
      }
    }

    if (buttons[0] && buttons[0].offsetParent !== null) {
      buttons[0].click();
      return true;
    }
    return false;
  }

  // Set Suno Slider by Label (Weirdness, Style Influence, Duration)
  function setSunoSlider(labelName, targetPercent) {
    expandMoreOptions();
    const allLabels = Array.from(document.querySelectorAll('div, label, span, p')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return t.includes(labelName.toLowerCase());
    });

    for (const lbl of allLabels) {
      const row = lbl.closest('div, section, fieldset') || lbl.parentElement;
      if (!row) continue;

      // Check for <input type="range">
      const rangeInput = row.querySelector('input[type="range"]');
      if (rangeInput) {
        const min = parseFloat(rangeInput.min) || 0;
        const max = parseFloat(rangeInput.max) || 100;
        const val = min + ((max - min) * (targetPercent / 100));
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(rangeInput, val);
        else rangeInput.value = val;
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        rangeInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Suno Fusion] Set range slider', labelName, 'to', val);
        return true;
      }

      // Check for Radix UI [role="slider"]
      const radixSlider = row.querySelector('[role="slider"]');
      if (radixSlider) {
        radixSlider.focus();
        radixSlider.setAttribute('aria-valuenow', targetPercent.toString());
        radixSlider.dispatchEvent(new Event('input', { bubbles: true }));
        radixSlider.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // Set Suno Max Mode (On or Off)
  function setSunoMaxMode(state = true) {
    expandMoreOptions();
    const rows = Array.from(document.querySelectorAll('div, section')).filter(el => {
      const t = (el.textContent || '').toLowerCase();
      return t.includes('max mode');
    });

    for (const r of rows) {
      const targetText = state ? 'on' : 'off';
      const btn = Array.from(r.querySelectorAll('button, [role="button"], span')).find(b => (b.textContent || '').trim().toLowerCase() === targetText);
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  // Set Suno Variety (Low, Medium, High)
  function setSunoVariety(variety = 'High') {
    expandMoreOptions();
    const rows = Array.from(document.querySelectorAll('div, section')).filter(el => {
      const t = (el.textContent || '').toLowerCase();
      return t.includes('variety');
    });

    for (const r of rows) {
      const btn = Array.from(r.querySelectorAll('button, [role="button"], span')).find(b => (b.textContent || '').trim().toLowerCase() === variety.toLowerCase());
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  // Set Suno Target Duration (supports preset buttons, range sliders, and text/number inputs)
  function setSunoDuration(durationStr) {
    if (!durationStr) return false;
    expandMoreOptions();

    let totalSeconds = 0;
    const parts = String(durationStr).trim().split(':');
    if (parts.length === 2) {
      totalSeconds = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    } else {
      totalSeconds = parseInt(durationStr, 10) || 0;
    }

    const allLabels = Array.from(document.querySelectorAll('div, label, span, p')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return (t === 'duration' || t === 'target duration' || t === 'song duration' || t === 'track duration' || t === 'clip length' || t === 'length') && el.children.length <= 2;
    });

    for (const lbl of allLabels) {
      const row = lbl.closest('div, section, fieldset') || lbl.parentElement;
      if (!row) continue;

      // 1. Check for matching preset button (e.g. "3:00", "2:30", "3m", "180s")
      const minsLabel = (totalSeconds % 60 === 0) ? (totalSeconds / 60) + 'm' : (totalSeconds / 60).toFixed(1) + 'm';
      const secsLabel = totalSeconds + 's';
      const candidateButtons = Array.from(row.querySelectorAll('button, [role="button"], [role="radio"], span'));
      const matchedBtn = candidateButtons.find(b => {
        const bt = (b.textContent || '').trim().toLowerCase();
        return bt === durationStr.toLowerCase() || bt === minsLabel || bt === secsLabel;
      });
      if (matchedBtn) {
        matchedBtn.click();
        console.log('[Suno Fusion] Selected Duration preset:', durationStr);
        return true;
      }

      // 2. Check for <input type="range">
      const rangeInput = row.querySelector('input[type="range"]');
      if (rangeInput && totalSeconds > 0) {
        const min = parseFloat(rangeInput.min) || 0;
        const max = parseFloat(rangeInput.max) || 300;
        const val = max <= 100
          ? Math.min(100, Math.max(0, Math.round((totalSeconds / 300) * 100)))
          : Math.min(max, Math.max(min, totalSeconds));
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(rangeInput, val);
        else rangeInput.value = val;
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        rangeInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Suno Fusion] Set Duration range slider to', val);
        return true;
      }

      // 3. Check for Radix UI [role="slider"]
      const radixSlider = row.querySelector('[role="slider"]');
      if (radixSlider && totalSeconds > 0) {
        const max = parseFloat(radixSlider.getAttribute('aria-valuemax') || '300');
        const val = max <= 100
          ? Math.min(100, Math.max(0, Math.round((totalSeconds / 300) * 100)))
          : totalSeconds;
        radixSlider.focus();
        radixSlider.setAttribute('aria-valuenow', val.toString());
        radixSlider.dispatchEvent(new Event('input', { bubbles: true }));
        radixSlider.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // 4. Check for text/number input
      const textInput = row.querySelector('input[type="text"], input[type="number"], input:not([type])');
      if (textInput) {
        setInputValueReliably(textInput, durationStr);
        return true;
      }
    }
    return false;
  }

  // Helper: test if an element is explicitly related to Lyrics
  function isExplicitLyricsElement(el) {
    if (!el) return false;
    const testid = (el.getAttribute('data-testid') || '').toLowerCase();
    const p = (el.placeholder || '').toLowerCase();
    const a = (el.getAttribute('aria-label') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const desc = (el.getAttribute('aria-describedby') || '').toLowerCase();
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
    if (cls.includes('lyrics-editor') || desc.includes('lyrics-editor') || a === 'lyrics editor' || a.includes('lyrics editor')) return true;
    if (el.hasAttribute('data-lexical-editor')) return true;
    if (testid.includes('lyric') || name.includes('lyric') || id.includes('lyric') || a.includes('lyric')) return true;
    if (p.includes('write your own lyrics') || p.includes('write your own') || p.includes('lyrics') || p.includes('add your own') || p.includes('enter your lyrics') || p.includes('paste your lyrics') || p.includes('verse')) return true;
    if (a.includes('write your own') || a.includes('your lyrics')) return true;
    if (el.closest?.('[data-testid*="lyrics" i], [data-testid*="lyric" i], .lyrics-editor-content')) return true;
    return false;
  }

  function getOptimalSelector(el) {
    if (!el) return null;
    if (el.hasAttribute && (el.hasAttribute('data-lexical-editor') || (el.className && typeof el.className === 'string' && el.className.includes('lyrics-editor')))) {
      return 'div.lyrics-editor-content[contenteditable="true"]';
    }
    if (el.closest?.('[data-testid="create-form-styles-wrapper"]')) {
      return '[data-testid="create-form-styles-wrapper"] textarea';
    }
    if (el.getAttribute && el.getAttribute('data-testid')) {
      return el.tagName.toLowerCase() + '[data-testid="' + el.getAttribute('data-testid') + '"]';
    }
    if (el.id) return '#' + el.id;
    if (el.getAttribute && el.getAttribute('aria-label')) {
      return el.tagName.toLowerCase() + '[aria-label="' + el.getAttribute('aria-label') + '"]';
    }
    if (el.getAttribute && el.getAttribute('placeholder')) {
      return el.tagName.toLowerCase() + '[placeholder*="' + el.getAttribute('placeholder').slice(0, 15) + '"]';
    }
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/)[0];
      if (cls) return el.tagName.toLowerCase() + '.' + cls;
    }
    return el.tagName ? el.tagName.toLowerCase() : null;
  }

  function isSunoInCustomMode() {
    const activeTab = document.querySelector('button[role="tab"][aria-selected="true"], [role="tab"][aria-selected="true"], button[role="tab"][data-active="true"]');
    const activeTabText = (activeTab?.textContent || '').trim().toLowerCase();
    if (activeTabText.includes('custom') || activeTabText.includes('advance') || activeTabText.includes('advanced')) return true;
    const existingLyrics = document.querySelector('div.lyrics-editor-content, [data-lexical-editor="true"], [aria-label*="Lyrics editor" i], [data-testid*="lyrics" i] textarea, textarea[data-testid*="lyrics" i], textarea[placeholder*="write your own" i], textarea[placeholder*="lyrics" i]');
    return !!existingLyrics;
  }

  // Dedicated Suno Style Input Locator
  function findOrCreateSunoStyleTextarea(excludeLyricsEl = null) {
    // 1. Check if user set a custom style selector
    if (userCustomSelectors.styleSelector) {
      const customStyle = document.querySelector(userCustomSelectors.styleSelector);
      if (customStyle && customStyle !== excludeLyricsEl) return customStyle;
    }

    // 2. Exact data-testid and placeholder targeting for style
    const styleSelectors = [
      '[data-testid="create-form-styles-wrapper"] textarea',
      '[data-testid*="styles-wrapper" i] textarea',
      'textarea[data-testid="style-input"]',
      'textarea[data-testid*="style" i]',
      'textarea[placeholder*="clean electric guitar" i]',
      'textarea[placeholder*="city pop" i]',
      'textarea[aria-label*="Style of Music" i]',
      'textarea[aria-label*="Style" i]'
    ];

    for (const sel of styleSelectors) {
      const found = document.querySelector(sel);
      if (found && found !== excludeLyricsEl && !isExplicitLyricsElement(found)) {
        return found;
      }
    }

    // 3. Traversal inside a container with 'Styles' or 'Style of Music' header
    const styleHeaders = Array.from(document.querySelectorAll('span, label, div, p, h2, h3, h4')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return (t === 'styles' || t === 'style of music' || t === 'style') && !t.includes('lyric');
    });
    for (const h of styleHeaders) {
      const container = h.closest('div.flex, div, section, fieldset') || h.parentElement;
      const ta = container?.querySelector('div.lyrics-editor-content, [data-lexical-editor="true"], [contenteditable="true"][role="textbox"], textarea');
      if (ta && ta !== excludeLyricsEl && !isExplicitLyricsElement(ta)) return ta;
    }

    return null;
  }

  // Dedicated Suno Lyrics Input Locator (Matches Suno Lexical Rich-Text Editor & Textareas)
  function findSunoLyricsTextarea(knownStyleTextarea = null) {
    // 1. Check if user set a custom lyrics selector
    if (userCustomSelectors.lyricsSelector) {
      const customEl = document.querySelector(userCustomSelectors.lyricsSelector);
      if (customEl && customEl !== knownStyleTextarea) return customEl;
    }

    const isStyle = (el) => !el || el === knownStyleTextarea || !!el.closest?.('[data-testid="create-form-styles-wrapper"]');

    const isVisible = (el) => {
      if (!el) return false;
      if (el.offsetParent !== null || el.getBoundingClientRect().height > 0) return true;
      try {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      } catch (e) {
        return false;
      }
    };

    // 2. Direct Suno Lexical Rich-Text Lyrics Editor (Matches <div class="lyrics-editor-content" data-lexical-editor="true">)
    const lexicalSelectors = [
      'div.lyrics-editor-content[contenteditable="true"]',
      '.lyrics-editor-content[contenteditable="true"]',
      'div[aria-label="Lyrics editor"][contenteditable="true"]',
      'div[aria-label*="Lyrics editor" i]',
      '[aria-label="Lyrics editor"]',
      '[aria-describedby*="lyrics-editor" i]',
      'div[data-lexical-editor="true"][aria-label*="Lyrics" i]',
      'div[data-lexical-editor="true"][class*="lyrics" i]',
      'div[data-lexical-editor="true"][aria-describedby*="lyrics" i]',
      '[data-lexical-editor="true"]',
      '.lyrics-editor-content',
      'div[role="textbox"][contenteditable="true"][aria-label*="Lyrics" i]',
      'div[role="textbox"][contenteditable="true"][class*="lyrics" i]',
      '[data-testid="create-form-lyrics-wrapper"] [contenteditable="true"]'
    ];
    for (const sel of lexicalSelectors) {
      const el = document.querySelector(sel);
      if (el && !isStyle(el) && isVisible(el)) {
        return el;
      }
    }

    // 3. Exact data-testid selectors for lyrics (textareas & contenteditables)
    const testidSelectors = [
      '[data-testid="create-form-lyrics-wrapper"] textarea',
      '[data-testid*="lyrics-wrapper" i] textarea',
      'textarea[data-testid="lyrics-input"]',
      'textarea[data-testid*="lyrics" i]',
      'textarea[data-testid*="lyric" i]',
      '[data-testid*="lyric" i] textarea'
    ];
    for (const sel of testidSelectors) {
      const el = document.querySelector(sel);
      if (el && !isStyle(el) && isVisible(el)) {
        return el;
      }
    }

    // 3. Exact placeholder and aria-label matches
    const explicitAttrs = [
      'textarea[placeholder*="write your own lyrics" i]',
      'textarea[placeholder*="write your own" i]',
      'textarea[placeholder*="add your own lyrics" i]',
      'textarea[placeholder*="add your own" i]',
      'textarea[placeholder*="enter your lyrics" i]',
      'textarea[placeholder*="paste your lyrics" i]',
      'textarea[placeholder*="lyrics" i]',
      'textarea[placeholder*="verse" i]',
      'textarea[aria-label*="lyrics" i]',
      'textarea[aria-label*="write your own" i]',
      'textarea[aria-label*="your lyrics" i]',
      'textarea[name="lyrics" i]',
      'textarea[id*="lyrics" i]'
    ];
    for (const sel of explicitAttrs) {
      const el = document.querySelector(sel);
      if (el && !isStyle(el) && isVisible(el)) {
        return el;
      }
    }

    // 4. Header traversal: any section with text "Lyrics" containing a textarea
    const lyricHeadings = Array.from(document.querySelectorAll('label, span, div, h2, h3, h4, p')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return (t === 'lyrics' || t === 'enter your lyrics' || t === 'lyrics (optional)' || t.startsWith('lyrics') || t.includes('write lyrics')) &&
             !t.includes('style') && !el.closest('[data-testid="create-form-styles-wrapper"]');
    });
    for (const h of lyricHeadings) {
      const container = h.closest('div.flex, div, section, fieldset') || h.parentElement;
      const ta = container?.querySelector('div.lyrics-editor-content, [data-lexical-editor="true"], [contenteditable="true"][role="textbox"], textarea');
      if (ta && !isStyle(ta) && isVisible(ta)) {
        return ta;
      }
    }

    // 5. Fallback across all visible lyrics editors & textareas: any non-style element
    const allVisible = Array.from(document.querySelectorAll('div.lyrics-editor-content, [data-lexical-editor="true"], textarea')).filter(
      t => !isStyle(t) && isVisible(t)
    );
    if (allVisible.length > 0) {
      return allVisible[0];
    }

    return null;
  }

  /**
   * PROVEN 4-TIER WATERFALL SUNO INPUT TARGETING
   */
  function findSunoInputs() {
    // 1. Check custom user-picked selectors first
    if (userCustomSelectors.styleSelector || userCustomSelectors.lyricsSelector) {
      const customStyle = userCustomSelectors.styleSelector ? document.querySelector(userCustomSelectors.styleSelector) : null;
      const customLyrics = userCustomSelectors.lyricsSelector ? document.querySelector(userCustomSelectors.lyricsSelector) : null;
      if (customStyle || customLyrics) {
        return {
          styleTextarea: customStyle || findOrCreateSunoStyleTextarea(customLyrics),
          lyricsTextarea: customLyrics || findSunoLyricsTextarea(customStyle),
          titleInput: userCustomSelectors.titleSelector ? document.querySelector(userCustomSelectors.titleSelector) : document.querySelector('input[data-testid="title-input"], input[data-testid*="title" i], input[placeholder*="title" i]'),
          excludeInput: userCustomSelectors.excludeSelector ? document.querySelector(userCustomSelectors.excludeSelector) : document.querySelector('input[placeholder*="Exclude" i], textarea[placeholder*="Exclude" i]'),
          styleInput: customStyle || findOrCreateSunoStyleTextarea(customLyrics),
          lyricsInput: customLyrics || findSunoLyricsTextarea(customStyle)
        };
      }
    }

    // 2. Locate Style Textarea
    let styleTextarea = findOrCreateSunoStyleTextarea();

    // 3. Locate Lyrics Textarea using dedicated locator with strict anti-collision
    let lyricsTextarea = findSunoLyricsTextarea(styleTextarea);

    // 4. If styleTextarea wasn't found initially, re-check excluding lyricsTextarea
    if (!styleTextarea && lyricsTextarea) {
      styleTextarea = findOrCreateSunoStyleTextarea(lyricsTextarea);
      if (!styleTextarea) {
        const other = Array.from(document.querySelectorAll('textarea')).find(
          t => t !== lyricsTextarea && !isExplicitLyricsElement(t) && (t.offsetParent !== null || t.getBoundingClientRect().height > 0)
        );
        if (other) styleTextarea = other;
      }
    }

    // 5. Locate Title & Exclude Inputs
    let titleInput = document.querySelector('input[data-testid="title-input"], input[data-testid*="title" i], input[aria-label*="Title" i], input[placeholder*="title" i], input[placeholder*="give your song" i]');
    let excludeInput = document.querySelector('input[placeholder*="Exclude" i], textarea[placeholder*="Exclude" i], [aria-label*="Exclude" i]');

    // 6. Strict Disambiguation Guard: Ensure style and lyrics NEVER target the exact same element
    if (styleTextarea && lyricsTextarea && styleTextarea === lyricsTextarea) {
      const allTextareas = Array.from(document.querySelectorAll('textarea')).filter(
        t => t.offsetParent !== null || t.getBoundingClientRect().height > 0
      );
      if (allTextareas.length >= 2) {
        const isStyleLike = (t) => {
          const p = (t.placeholder || '').toLowerCase();
          const a = (t.getAttribute('aria-label') || '').toLowerCase();
          return p.includes('style') || p.includes('clean electric') || p.includes('city pop') || a.includes('style') || !!t.closest('[data-testid="create-form-styles-wrapper"]');
        };
        const sMatch = allTextareas.find(isStyleLike);
        if (sMatch) {
          styleTextarea = sMatch;
          lyricsTextarea = allTextareas.find(t => t !== sMatch) || null;
        } else {
          lyricsTextarea = allTextareas[0];
          styleTextarea = allTextareas[1];
        }
      }
    }

    return {
      styleTextarea,
      lyricsTextarea,
      titleInput,
      excludeInput,
      styleInput: styleTextarea,
      lyricsInput: lyricsTextarea
    };
  }

  function findTopMediaInputs() {
    if (userCustomSelectors.styleSelector) {
      const customStyle = document.querySelector(userCustomSelectors.styleSelector);
      if (customStyle) {
        return {
          styleTextarea: customStyle,
          lyricsTextarea: userCustomSelectors.lyricsSelector ? document.querySelector(userCustomSelectors.lyricsSelector) : null,
          titleInput: userCustomSelectors.titleSelector ? document.querySelector(userCustomSelectors.titleSelector) : null,
          excludeInput: userCustomSelectors.excludeSelector ? document.querySelector(userCustomSelectors.excludeSelector) : null,
          styleInput: customStyle,
          lyricsInput: userCustomSelectors.lyricsSelector ? document.querySelector(userCustomSelectors.lyricsSelector) : null
        };
      }
    }

    const textareas = Array.from(document.querySelectorAll('textarea'));
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"], [role="textbox"]'));
    const allCandidates = [...textareas, ...inputs, ...editables].filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 20 && rect.height > 15 && style.visibility !== 'hidden' && style.display !== 'none';
    });

    function matchTopMediaScore(el, keywords) {
      const text = [
        el.getAttribute('placeholder') || '',
        el.getAttribute('aria-label') || '',
        el.getAttribute('name') || '',
        el.id || '',
        el.className || '',
        el.parentElement?.textContent || ''
      ].join(' ').toLowerCase();
      return keywords.some(k => text.includes(k.toLowerCase()));
    }

    let styleInput = allCandidates.find(el => matchTopMediaScore(el, ['prompt', 'style', 'description', 'enter music', 'tags', 'music description']));
    let lyricsInput = allCandidates.find(el => matchTopMediaScore(el, ['lyrics', 'lyric', 'words', 'paste lyrics', 'write lyrics']));
    let titleInput = allCandidates.find(el => matchTopMediaScore(el, ['title', 'song name', 'track name', 'song title']));
    let excludeInput = null;

    if (!styleInput || !lyricsInput) {
      const visibleEditables = [...textareas, ...editables].filter(t => t.offsetHeight > 35 && t.offsetWidth > 100);
      if (visibleEditables.length >= 2) {
        if (!lyricsInput) lyricsInput = visibleEditables[0];
        if (!styleInput) styleInput = visibleEditables[1];
      } else if (visibleEditables.length === 1 && !styleInput) {
        styleInput = visibleEditables[0];
      }
    }

    return {
      styleTextarea: styleInput,
      lyricsTextarea: lyricsInput,
      titleInput: titleInput,
      excludeInput: excludeInput,
      styleInput: styleInput,
      lyricsInput: lyricsInput
    };
  }

  // Master Target Inputs Selector
  function findTargetInputs() {
    if (window.location.hostname.includes('topmediai')) {
      return findTopMediaInputs();
    }
    return findSunoInputs();
  }

  // Locate Suno or TopMediai Create/Generate Button
  function findCreateButton() {
    // 0. Check custom user-picked selector first
    if (userCustomSelectors.createSelector) {
      const customBtn = document.querySelector(userCustomSelectors.createSelector);
      if (customBtn && customBtn.offsetParent !== null) {
        return customBtn;
      }
    }

    const isTopMedia = window.location.hostname.includes('topmediai');

    if (isTopMedia) {
      const explicit = document.querySelector(
        'button[data-testid*="generate" i], button[data-testid*="create" i], button[aria-label*="Generate" i], button[aria-label*="Create" i], .generate-btn, button.btn-generate'
      );
      if (explicit && explicit.offsetParent !== null) return explicit;

      const candidates = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => {
        if (!b.offsetParent) return false;
        const rect = b.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 24) return false;
        const t = (b.textContent || '').trim().toLowerCase();
        return (t.includes('generate') || t.includes('create music')) && !b.closest('nav');
      });
      return candidates[0] || null;
    }

    // --- SUNO AI CREATE BUTTON ---
    // 1. Direct Suno Aura Create Button Match (Matches exact Suno DOM node)
    const exactSunoSelectors = [
      'button[aria-label="Create song"]',
      'button[aria-label*="Create song" i]',
      'button.hxc-btn-variant-aura',
      'button[class*="hxc-btn-variant-aura"]',
      'button[class*="hxc-btn"][aria-label*="Create" i]',
      'button[id^="base-ui-"][aria-label*="Create" i]',
      'button.equcksu0',
      'button[data-testid="create-button"]',
      'button[data-testid*="create" i]:not(nav button)'
    ];

    for (const sel of exactSunoSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && !el.closest('nav')) {
        return el;
      }
    }

    // 2. Buttons containing .hxc-btn-content with "Create"
    const hxcContentBtns = Array.from(document.querySelectorAll('button')).filter(b => {
      if (!b.offsetParent) return false;
      if (b.closest('nav')) return false;
      const contentSpan = b.querySelector('.hxc-btn-content') || b;
      const text = (contentSpan.textContent || '').trim().toLowerCase();
      return text === 'create' || text.startsWith('create');
    });
    if (hxcContentBtns.length > 0) {
      return hxcContentBtns[0];
    }

    // 3. Fallback: Any visible button whose text content is or starts with "Create" (excluding navigation nav)
    const allButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
      if (!btn.offsetParent) return false;
      const rect = btn.getBoundingClientRect();
      if (rect.width < 45 || rect.height < 24) return false;

      // Only exclude actual navigation bar
      if (btn.closest('nav, [role="navigation"]')) return false;

      const t = (btn.textContent || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();

      return aria.includes('create song') ||
             t === 'create' ||
             t.startsWith('create ') ||
             t.startsWith('create\n') ||
             t.includes('create music') ||
             (t.includes('create') && (t.includes('credit') || t.includes('v4') || t.includes('v3.5') || t.includes('v4.5')));
    });

    if (allButtons.length > 0) {
      const auraMatch = allButtons.find(b => b.className && typeof b.className === 'string' && b.className.includes('aura'));
      if (auraMatch) return auraMatch;

      const submitMatch = allButtons.find(b => b.type === 'submit');
      if (submitMatch) return submitMatch;

      allButtons.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });
      return allButtons[0];
    }

    return null;
  }

  let isCreateInProgress = false;

  // Trigger Suno/TopMediai Create Button with intelligent retry polling & duplicate prevention
  function triggerCreateButton(delayMs = 450) {
    if (isCreateInProgress) {
      console.log('[Suno Fusion] Create action already in progress, ignoring duplicate trigger.');
      return Promise.resolve(false);
    }
    isCreateInProgress = true;
    setTimeout(() => { isCreateInProgress = false; }, 3500); // 3.5s mutex cooldown

    return new Promise((resolve) => {
      setTimeout(() => {
        let attempts = 0;
        const maxAttempts = 14; // Poll every 200ms for up to ~3 seconds

        const tryClick = () => {
          attempts++;
          const btn = findCreateButton();

          if (btn) {
            // Check disabled state (only if HTML disabled or aria-disabled="true")
            const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';

            if (isDisabled) {
              if (attempts < maxAttempts) {
                setTimeout(tryClick, 200);
                return;
              }
            }

            try {
              btn.focus();

              // Single clean click on the button element (avoids duplicate event bubbling)
              btn.click();

              applyGlowFeedback(btn);
              console.log('[Suno Fusion] Successfully triggered Create button once!', btn);
              const platformName = window.location.hostname.includes('topmediai') ? 'TopMediai' : 'Suno';
              showToast(`🚀 ${platformName} Create button triggered! Track generating...`, 'success', 4500);
              resolve(true);
              return;
            } catch (err) {
              console.error('[Suno Fusion] Error clicking Create button:', err);
            }
          }

          if (attempts < maxAttempts) {
            setTimeout(tryClick, 200);
          } else {
            console.warn('[Suno Fusion] Create button could not be clicked automatically.');
            showToast("⚠️ Auto-Filled! Please click Suno's Create button to start generation.", 'warn', 5000);
            resolve(false);
          }
        };

        tryClick();
      }, delayMs);
    });
  }

  // Toast Notification
  function showToast(message, type = 'success', duration = 3500) {
    const existing = document.getElementById('suno-fusion-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'suno-fusion-toast';
    toast.className = 'suno-fusion-toast ' + type;
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">${type === 'success' ? '⚡' : type === 'warn' ? '⚠️' : '❌'}</span>
        <span style="font-weight:600;font-size:13px;line-height:1.4;">${message}</span>
      </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -10px)';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // Master AutoFill Execution Function
  function executeAutoFill(promptData) {
    if (!promptData) return { success: false, error: 'No prompt data' };

    const isTopMedia = window.location.hostname.includes('topmediai');

    // 1. Auto-detect if Suno is already in Custom / Advance Mode on screen
    let isSunoCurrentlyCustom = false;
    if (!isTopMedia) {
      const activeTab = document.querySelector('button[role="tab"][aria-selected="true"], [role="tab"][aria-selected="true"], button[role="tab"][data-active="true"]');
      const activeTabText = (activeTab?.textContent || '').trim().toLowerCase();
      isSunoCurrentlyCustom = activeTabText.includes('custom') || activeTabText.includes('advance') || activeTabText.includes('advanced');

      if (!isSunoCurrentlyCustom) {
        const existingLyrics = document.querySelector('div.lyrics-editor-content, [data-lexical-editor="true"], [aria-label*="Lyrics editor" i], [data-testid*="lyrics" i] textarea, textarea[data-testid*="lyrics" i], textarea[placeholder*="write your own" i], textarea[placeholder*="lyrics" i]');
        if (existingLyrics) isSunoCurrentlyCustom = true;
      }
    }

    // Determine target mode:
    // If Suno is already in Custom/Advance mode OR promptData.targetSimpleMode is false, run Custom/Advance Mode!
    const runCustomMode = !isTopMedia && (!promptData.targetSimpleMode || isSunoCurrentlyCustom);

    if (!isTopMedia) {
      ensureOnCreatePage();
      if (runCustomMode) {
        ensureSunoCustomMode(true);
        expandMoreOptions();
        // If track is not instrumental and lyrics exist, ensure Instrumental is OFF so Suno reveals the lyrics box!
        if (promptData.isInstrumental) {
          toggleInstrumental(true);
        } else if (promptData.lyricSnippet || promptData.lyrics) {
          toggleInstrumental(false);
        }
      } else {
        ensureSunoCustomMode(false);
      }
    }

    let hasTriggeredAutoCreate = false;

    const runFill = () => {
      let filledCount = 0;
      let lyricsWereFilled = false;
      const platformName = isTopMedia ? 'TopMediai' : 'Suno';

      // ==========================================
      // BRANCH A: SUNO SIMPLE MODE (V6 WORKFLOW)
      // ==========================================
      if (!isTopMedia && !runCustomMode) {
        // 1. Locate the Simple Prompt / Directive Box
        let simpleInput = document.querySelector(
          'textarea[aria-label*="description" i], ' +
          'textarea[aria-label*="prompt" i], ' +
          'textarea[placeholder*="describe" i], ' +
          'textarea[placeholder*="song" i], ' +
          'textarea[data-testid*="description" i]'
        );
        if (!simpleInput) {
          const nonStyleTextareas = Array.from(document.querySelectorAll('textarea')).filter(
            t => !t.closest('[data-testid="create-form-styles-wrapper"]') && (t.offsetParent !== null || t.getBoundingClientRect().height > 0)
          );
          if (nonStyleTextareas.length > 0) simpleInput = nonStyleTextareas[0];
        }

        let directiveVal = promptData.lyricSnippet || promptData.styleTag;
        if (promptData.duration && directiveVal && !directiveVal.toLowerCase().includes(promptData.duration.toLowerCase())) {
          directiveVal = directiveVal.trim() + ' Target duration: ' + promptData.duration + '.';
        }
        if (simpleInput && directiveVal) {
          setInputValueReliably(simpleInput, directiveVal);
          filledCount++;
          console.log('[Suno Fusion] Simple Mode prompt directive filled (' + directiveVal.length + ' chars)');
        }

        // 2. Also locate and fill the dedicated style field in Simple Mode
        const styleVal = promptData.styleTag || promptData.sunoStyleTag;
        if (styleVal) {
          let styleTextarea = findOrCreateSunoStyleTextarea(simpleInput);
          if (styleTextarea && styleTextarea !== simpleInput) {
            setInputValueReliably(styleTextarea, styleVal);
            filledCount++;
            console.log('[Suno Fusion] Simple Mode dedicated style field filled (' + styleVal.length + ' chars)');
          }
        }

        if (filledCount > 0) {
          if (promptData.autoCreate && !hasTriggeredAutoCreate) {
            hasTriggeredAutoCreate = true;
            showToast(`⚡ Suno Simple Mode Auto-Filled (${filledCount} fields)! Triggering Create...`, 'success', 2500);
            triggerCreateButton(500);
          } else {
            showToast(`✓ Suno Simple Mode Auto-Filled! (${filledCount} fields updated)`, 'success', 3500);
          }
          return { success: true, filledCount, lyricsWereFilled: false, platform: 'Suno Simple Mode' };
        }
        return { success: false, filledCount: 0, lyricsWereFilled: false };
      }

      // ==========================================
      // BRANCH B: CUSTOM / ADVANCE MODE (SUNO & TOPMEDIAI)
      // ==========================================
      const { styleTextarea, lyricsTextarea, titleInput, excludeInput, styleInput, lyricsInput } = findTargetInputs();
      const targetStyle = styleInput || styleTextarea;
      const targetLyrics = lyricsInput || lyricsTextarea;

      const styleVal = promptData.styleTag || promptData.sunoStyleTag;
      if (targetStyle && styleVal) {
        setInputValueReliably(targetStyle, styleVal);
        filledCount++;
        console.log('[Suno Fusion] Style field filled (' + styleVal.length + ' chars)');
      }

      const lyricVal = promptData.lyricSnippet || promptData.lyrics;
      // Strictly ensure lyrics are only written if targetLyrics is distinct from targetStyle!
      if (targetLyrics && lyricVal && targetLyrics !== targetStyle) {
        setInputValueReliably(targetLyrics, lyricVal);
        filledCount++;
        lyricsWereFilled = true;
        console.log('[Suno Fusion] Lyrics field filled (' + lyricVal.length + ' chars)');
      }

      if (titleInput && promptData.title) {
        setInputValueReliably(titleInput, promptData.title);
        filledCount++;
      }

      if (excludeInput && promptData.excludeStyles) {
        setInputValueReliably(excludeInput, promptData.excludeStyles);
        filledCount++;
      }

      if (!isTopMedia) {
        if (promptData.vocalGender) setSunoVocalGender(promptData.vocalGender);
        if (promptData.weirdness !== undefined) setSunoSlider('Weirdness', promptData.weirdness);
        if (promptData.styleInfluence !== undefined) setSunoSlider('Style Influence', promptData.styleInfluence);
        if (promptData.variety) setSunoVariety(promptData.variety);
        if (promptData.duration) setSunoDuration(promptData.duration);
        if (promptData.maxMode !== undefined) setSunoMaxMode(promptData.maxMode);
      }

      if (filledCount > 0) {
        if (promptData.autoCreate && !hasTriggeredAutoCreate) {
          hasTriggeredAutoCreate = true;
          showToast(`⚡ ${platformName} Auto-Filled! Triggering Create button...`, 'success', 2500);
          triggerCreateButton(400);
        } else if (!promptData.autoCreate) {
          showToast(`✓ ${platformName} Auto-Filled! ${filledCount} field${filledCount > 1 ? 's' : ''} updated.`, 'success');
        }
        return { success: true, filledCount, lyricsWereFilled, autoCreate: !!promptData.autoCreate };
      } else {
        return { success: false, filledCount: 0, lyricsWereFilled: false };
      }
    };

    const firstAttempt = runFill();

    // Async polling retry for lyrics box if Custom/Advance mode is active and lyrics haven't mounted yet
    const lyricVal = promptData.lyricSnippet || promptData.lyrics;
    if (runCustomMode && lyricVal && !firstAttempt.lyricsWereFilled) {
      console.log('[Suno Fusion] Advance Mode lyrics box not yet mounted, starting polling retry...');
      let pollAttempts = 0;
      const maxPoll = 10;
      const pollLyrics = () => {
        pollAttempts++;
        const currentStyle = findOrCreateSunoStyleTextarea();
        const lyricsBox = findSunoLyricsTextarea(currentStyle);
        if (lyricsBox && lyricsBox !== currentStyle) {
          setInputValueReliably(lyricsBox, lyricVal);
          console.log('[Suno Fusion] Lyrics box successfully filled on poll attempt ' + pollAttempts);
          showToast(`✓ Suno Advance Mode Lyrics filled!`, 'success', 2500);
          return;
        }
        if (pollAttempts < maxPoll) {
          setTimeout(pollLyrics, 150);
        } else {
          console.warn('[Suno Fusion] Lyrics box could not be located after ' + maxPoll + ' polling attempts.');
        }
      };
      setTimeout(pollLyrics, 120);
    }

    if (!firstAttempt.success) {
      setTimeout(() => {
        if (!isTopMedia) {
          if (runCustomMode) {
            ensureSunoCustomMode(true);
            expandMoreOptions();
          } else {
            ensureSunoCustomMode(false);
          }
        }
        const secondAttempt = runFill();
        if (!secondAttempt.success) {
          setTimeout(() => {
            const thirdAttempt = runFill();
            if (!thirdAttempt.success) {
              const platformName = isTopMedia ? 'TopMediai' : 'Suno';
              showToast(`Could not find all ${platformName} inputs automatically. Click "🎯 Diagnostics" in the Suno Fusion HUD to pick your boxes!`, 'warn', 5000);
            }
          }, 500);
        }
      }, 350);
    }

    return { success: true };
  }

  function startElementPicker(targetBoxType) {
    const isTopMedia = window.location.hostname.includes('topmediai');
    const platformName = isTopMedia ? 'TopMediai' : 'Suno';
    showToast(`🎯 Click directly on ${platformName}'s ${targetBoxType.toUpperCase()} box to select it!`, 'warn', 6000);

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999999';
    overlay.style.cursor = 'crosshair';
    overlay.style.backgroundColor = 'rgba(139, 92, 246, 0.05)';
    document.body.appendChild(overlay);

    let hoveredEl = null;

    function onMouseMove(e) {
      overlay.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';

      if (el && el !== overlay && !el.closest('#suno-fusion-fab')) {
        if (hoveredEl && hoveredEl !== el) {
          hoveredEl.style.outline = '';
        }
        hoveredEl = el.closest('textarea, input, [contenteditable="true"], [role="textbox"], button') || el;
        hoveredEl.style.outline = '3px dashed #fbbf24';
      }
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();

      overlay.style.pointerEvents = 'none';
      const target = (document.elementFromPoint(e.clientX, e.clientY) || {}).closest?.('textarea, input, [contenteditable="true"], [role="textbox"], button') || hoveredEl;
      overlay.remove();

      if (target) {
        target.style.outline = '4px solid #10b981';
        setTimeout(() => target.style.outline = '', 2000);

        let selector = '';
        if (target.closest && target.closest('[data-testid="create-form-styles-wrapper"]')) {
          selector = '[data-testid="create-form-styles-wrapper"] textarea';
        } else if (target.getAttribute && target.getAttribute('data-testid')) {
          selector = target.tagName.toLowerCase() + '[data-testid="' + target.getAttribute('data-testid') + '"]';
        } else if (target.id) {
          selector = '#' + target.id;
        } else if (target.getAttribute('name')) {
          selector = target.tagName.toLowerCase() + '[name="' + target.getAttribute('name') + '"]';
        } else if (target.getAttribute('placeholder')) {
          selector = target.tagName.toLowerCase() + '[placeholder="' + target.getAttribute('placeholder') + '"]';
        } else if (target.getAttribute('aria-label')) {
          selector = target.tagName.toLowerCase() + '[aria-label="' + target.getAttribute('aria-label') + '"]';
        } else if (target.getAttribute('role')) {
          selector = target.tagName.toLowerCase() + '[role="' + target.getAttribute('role') + '"]';
        } else if (target.className && typeof target.className === 'string') {
          const firstClass = target.className.trim().split(/\s+/)[0];
          selector = firstClass ? '.' + firstClass : target.tagName.toLowerCase();
        } else {
          selector = target.tagName.toLowerCase();
        }

        if (target.hasAttribute && (target.hasAttribute('data-lexical-editor') || (target.className && typeof target.className === 'string' && target.className.includes('lyrics-editor')))) {
          selector = 'div.lyrics-editor-content[contenteditable="true"]';
        } else if (target.closest && target.closest('[data-testid="create-form-styles-wrapper"]')) {
          selector = '[data-testid="create-form-styles-wrapper"] textarea';
        }

        if (targetBoxType === 'style') {
          userCustomSelectors.styleSelector = selector;
          chrome.storage?.local?.set({ sf_style_sel: selector });
          showToast('✓ Saved Style Box target: ' + selector, 'success');
        } else if (targetBoxType === 'lyrics') {
          userCustomSelectors.lyricsSelector = selector;
          chrome.storage?.local?.set({ sf_lyrics_sel: selector });
          showToast('✓ Saved Lyrics Box target: ' + selector, 'success');
        } else if (targetBoxType === 'title') {
          userCustomSelectors.titleSelector = selector;
          chrome.storage?.local?.set({ sf_title_sel: selector });
          showToast('✓ Saved Title Input target: ' + selector, 'success');
        } else if (targetBoxType === 'exclude') {
          userCustomSelectors.excludeSelector = selector;
          chrome.storage?.local?.set({ sf_exclude_sel: selector });
          showToast('✓ Saved Exclude Styles target: ' + selector, 'success');
        } else if (targetBoxType === 'create') {
          userCustomSelectors.createSelector = selector;
          chrome.storage?.local?.set({ sf_create_sel: selector });
          showToast('✓ Saved Create Button target: ' + selector, 'success');
        }

        try {
          chrome.runtime?.sendMessage?.({
            action: 'TARGET_PICKED',
            targetType: targetBoxType,
            selector: selector
          });
        } catch (e) {}

        updateHudStatus();
      }
    }

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('click', onClick);
  }

  // Insert Metatag into lyrics box
  function insertMetatagIntoLyrics(tag) {
    const { lyricsTextarea, lyricsInput } = findTargetInputs();
    const targetLyrics = lyricsInput || lyricsTextarea;
    if (!targetLyrics) {
      showToast('Please open Custom mode / lyrics box or click Diagnostics to select it!', 'warn');
      return;
    }

    if (targetLyrics.isContentEditable || targetLyrics.getAttribute('role') === 'textbox' || targetLyrics.hasAttribute('data-lexical-editor') || targetLyrics.getAttribute('contenteditable') === 'true') {
      const current = targetLyrics.innerText || '';
      const insertion = (current.length > 0 && !current.endsWith('\n') ? '\n\n' : '') + tag + '\n';
      setInputValueReliably(targetLyrics, current + insertion);
      showToast(`Inserted ${tag}`, 'success');
      return;
    }

    const current = targetLyrics.value || '';
    const start = targetLyrics.selectionStart || current.length;
    const end = targetLyrics.selectionEnd || current.length;
    const insertion = (start > 0 && current[start - 1] !== '\n' ? '\n\n' : '') + tag + '\n';
    const nextValue = current.slice(0, start) + insertion + current.slice(end);

    setInputValueReliably(targetLyrics, nextValue);
    showToast(`Inserted ${tag}`, 'success');
  }

  // Update Status Badges in HUD
  function updateHudStatus() {
    const statusContainer = document.getElementById('sf-hud-status');
    if (!statusContainer) return;

    const { styleTextarea, lyricsTextarea, titleInput, excludeInput, styleInput, lyricsInput } = findTargetInputs();
    const hasStyle = !!(styleInput || styleTextarea);
    const hasLyrics = !!(lyricsInput || lyricsTextarea);
    statusContainer.innerHTML = `
      <div style="display:flex;gap:6px;font-size:10px;font-family:monospace;flex-wrap:wrap;">
        <span style="color:${hasStyle ? '#34d399' : '#f87171'}">${hasStyle ? '● Style OK' : '○ Style Missing'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:${hasLyrics ? '#34d399' : '#f87171'}">${hasLyrics ? '● Lyrics OK' : '○ Lyrics Missing'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:${titleInput ? '#34d399' : '#a1a1aa'}">${titleInput ? '● Title OK' : '○ Title (Opt)'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:${excludeInput ? '#34d399' : '#a1a1aa'}">${excludeInput ? '● Exclude OK' : '○ Exclude (Opt)'}</span>
      </div>
    `;
  }

  // Built-in list of genres & taxonomy data
  const TAXONOMY_DATA = (typeof window !== 'undefined' && window.SUNO_TAXONOMY) ? window.SUNO_TAXONOMY : {};
  const APP_GENRES = (TAXONOMY_DATA.baseGenres && TAXONOMY_DATA.baseGenres.length)
    ? TAXONOMY_DATA.baseGenres
    : [
      "Ambient", "Ambient House / Chill-Out", "New Age", "Cool & West Coast Jazz", "Smooth Jazz",
      "Nordic Jazz", "Country / Folk Blues", "Boogie Woogie / Piano Blues", "Vaudeville / Classic Blues",
      "Neo / Nu Soul", "Memphis / Deep / Southern Soul", "Philly Soul", "American & British Folk Revival",
      "Dream Pop & Shoegaze", "Indie Pop", "TRAP & DRILL", "Cyber Funk", "Celtic Folk", "Darkwave",
      "Alternative Dance Rock", "Alternative Grunge", "Astral Jazz", "Chillstep Ambient Dub", "ChillwaveFi",
      "City Pop Fusion", "Cosmic Disco", "Dream Pop Trap", "Electro Swing Fusion", "Kawaii Metal", "Vaporwave Metal"
    ];
  const COINED_GENRES = (TAXONOMY_DATA.coinedGenres && TAXONOMY_DATA.coinedGenres.length)
    ? TAXONOMY_DATA.coinedGenres
    : [
      "Alternative Dance Rock", "Alternative Grunge", "Astral Jazz", "Chillstep Ambient Dub", "ChillwaveFi",
      "City Pop Fusion", "City Pop Noir", "ClassicalWave", "Cosmic Disco", "Cyber Funk", "Cyber Soul",
      "Dream Pop Trap", "Electro Swing Fusion", "Electro Swing Metal", "Kawaii Metal", "Vaporwave Metal"
    ];
  const coinedSet = new Set(COINED_GENRES);
  const CURATED_LIBRARY = (typeof window !== 'undefined' && window.SUNO_CURATED_LIBRARY) ? window.SUNO_CURATED_LIBRARY : [];
  const CREATIONS_DB = (typeof window !== 'undefined' && window.SUNO_CREATIONS_DATABASE) ? window.SUNO_CREATIONS_DATABASE : [];
  const creationsMap = new Map();
  CREATIONS_DB.forEach(item => { if (item.id) creationsMap.set(item.id, item); });

  const INSTRUMENTS_DATA = (typeof window !== 'undefined' && window.SUNO_INSTRUMENTS) ? window.SUNO_INSTRUMENTS : {
    categories: ["All", "Guitars & Amps", "Bass & Low-End", "Keys & Pianos", "Drums & Percussion", "Orchestral & Acoustic", "Synthesizers & Patches", "Synth Leads", "Synth Pads", "Synth Plucks", "Arps & Sequences", "Atmos, FX & Cinematic"],
    catalog: [],
    presets: [],
    list: ["Roland Juno-106", "Moog Minimoog", "808 Sub Bass", "Fender Stratocaster", "Acoustic Guitar", "Cello", "Grand Piano", "Saxophone", "TR-909 Drums", "Modular Synth"],
    categoryCounts: {}
  };
  const ALL_APP_INSTRUMENTS = (INSTRUMENTS_DATA.catalog && INSTRUMENTS_DATA.catalog.length > 0)
    ? INSTRUMENTS_DATA.catalog
    : INSTRUMENTS_DATA.list.map(name => ({ name, category: 'All' }));
  const APP_INSTRUMENT_CATEGORIES = INSTRUMENTS_DATA.categories || ["All"];
  const APP_INSTRUMENT_PRESETS = INSTRUMENTS_DATA.presets || [];

  // Full Floating Studio HUD
  // Lightweight Floating Launcher (Triggers Chrome Native Side Panel)
  function injectFloatingHUD() {
    if (document.getElementById('suno-fusion-fab')) return;

    // Ensure any previously saved docked preference is cleared
    chrome.storage?.local?.set({ sf_hud_docked: false });

    const hud = document.createElement('div');
    hud.id = 'suno-fusion-fab';
    hud.className = 'suno-fusion-fab-container';
    hud.style.position = 'fixed';
    hud.style.bottom = '22px';
    hud.style.right = '22px';
    hud.style.zIndex = '999999';

    hud.innerHTML = `
      <button id="sf-toggle-btn" class="sf-fab-btn" title="Open Suno Fusion Studio Side Panel" style="display:flex;align-items:center;gap:7px;background:linear-gradient(135deg, #8b5cf6, #ec4899);color:#ffffff;border:1px solid rgba(255,255,255,0.25);padding:9px 16px;border-radius:9999px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(139,92,246,0.45);transition:transform 0.15s ease;">
        <span style="font-size:14px;">⚡</span>
        <span>Suno Studio Sidekick</span>
        <span class="sf-badge" style="background:rgba(255,255,255,0.2);color:#fff;font-size:9px;padding:2px 6px;border-radius:6px;font-weight:700;">Side Panel</span>
      </button>
    `;

    document.body.appendChild(hud);

    const toggleBtn = document.getElementById('sf-toggle-btn');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        chrome.runtime?.sendMessage?.({ action: 'OPEN_SIDE_PANEL' }, (res) => {
          if (chrome.runtime.lastError || !res?.success) {
            showToast('✨ Click the ⚡ Suno Fusion icon in your Chrome toolbar to open the Side Panel!', 'info', 4000);
          }
        });
      };
    }
  }

  // Runtime Message Listener
  chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'AUTOFILL') {
      const res = executeAutoFill(request.prompt);
      sendResponse(res);
    } else if (request.action === 'TRIGGER_CREATE') {
      triggerCreateButton(50).then(success => {
        sendResponse({ success });
      });
      return true;
    } else if (request.action === 'PING') {
      const inputs = findTargetInputs();
      sendResponse({ active: true, inputsFound: !!(inputs.styleInput || inputs.lyricsInput || inputs.styleTextarea || inputs.lyricsTextarea) });
    } else if (request.action === 'PICK_ELEMENT') {
      startElementPicker(request.target);
      sendResponse({ started: true });
    } else if (request.action === 'INSPECT_TARGETS') {
      const inputs = findTargetInputs();
      const isTopMedia = window.location.hostname.includes('topmediai');
      const isCustomMode = !isTopMedia && isSunoInCustomMode();
      sendResponse({
        active: true,
        platform: isTopMedia ? 'TopMediai' : 'Suno',
        isCustomMode,
        style: {
          found: !!inputs.styleTextarea,
          selector: userCustomSelectors.styleSelector || getOptimalSelector(inputs.styleTextarea),
          isCustom: !!userCustomSelectors.styleSelector
        },
        lyrics: {
          found: !!inputs.lyricsTextarea,
          selector: userCustomSelectors.lyricsSelector || getOptimalSelector(inputs.lyricsTextarea),
          isCustom: !!userCustomSelectors.lyricsSelector,
          isLexical: inputs.lyricsTextarea ? (inputs.lyricsTextarea.hasAttribute('data-lexical-editor') || (inputs.lyricsTextarea.className && typeof inputs.lyricsTextarea.className === 'string' && inputs.lyricsTextarea.className.includes('lyrics-editor'))) : false
        },
        title: {
          found: !!inputs.titleInput,
          selector: userCustomSelectors.titleSelector || getOptimalSelector(inputs.titleInput)
        },
        exclude: {
          found: !!inputs.excludeInput,
          selector: userCustomSelectors.excludeSelector || getOptimalSelector(inputs.excludeInput)
        },
        create: {
          found: !!findCreateButton(),
          selector: userCustomSelectors.createSelector || getOptimalSelector(findCreateButton())
        }
      });
    } else if (request.action === 'TEST_FILL') {
      const targetType = request.target;
      const testText = request.text || (targetType === 'lyrics' ? '[Verse 1]\nTesting Suno Fusion lyrics connection...' : 'Dream Pop, Shoegaze, 140 BPM');
      const inputs = findTargetInputs();
      const el = targetType === 'lyrics' ? (inputs.lyricsInput || inputs.lyricsTextarea) : (inputs.styleInput || inputs.styleTextarea);
      if (el) {
        setInputValueReliably(el, testText);
        applyGlowFeedback(el);
        showToast('🧪 Test Fill succeeded for ' + targetType.toUpperCase() + '!', 'success', 3000);
        sendResponse({ success: true, text: testText });
      } else {
        showToast('❌ Could not locate ' + targetType.toUpperCase() + ' element to test!', 'warn', 4000);
        sendResponse({ success: false, error: 'Element not found on screen' });
      }
    } else if (request.action === 'RESET_TARGETS') {
      userCustomSelectors.styleSelector = null;
      userCustomSelectors.lyricsSelector = null;
      userCustomSelectors.titleSelector = null;
      userCustomSelectors.excludeSelector = null;
      userCustomSelectors.createSelector = null;
      chrome.storage?.local?.remove(['sf_style_sel', 'sf_lyrics_sel', 'sf_title_sel', 'sf_exclude_sel', 'sf_create_sel']);
      showToast('✓ Reset all custom selectors to auto-detect!', 'info');
      sendResponse({ success: true });
    } else if (request.action === 'FORCE_CUSTOM_MODE') {
      ensureSunoCustomMode(true);
      showToast('🎛️ Switched Suno to Custom / Advance Mode', 'success');
      sendResponse({ success: true });
    } else if (request.action === 'FORCE_EXPAND_MORE') {
      expandMoreOptions();
      showToast('📂 Expanded Suno "More Options"', 'success');
      sendResponse({ success: true });
    }
  });

  // Web App Cross-Tab Bridge
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SUNO_FUSION_AUTOFILL') {
      executeAutoFill(event.data.prompt);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingHUD);
  } else {
    injectFloatingHUD();
  }
})();