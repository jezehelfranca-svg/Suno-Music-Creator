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

  // Robust Multi-Platform Input Value Setter (React 17/18/19 & TopMediai ContentEditable)
  function setInputValueReliably(element, text) {
    if (!element) return false;
    try {
      element.focus();

      // Handle contenteditable nodes / custom textboxes (common in TopMediai)
      if (element.isContentEditable || element.getAttribute('role') === 'textbox' || element.tagName === 'DIV' || element.tagName === 'SPAN') {
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
          if (!document.execCommand('insertText', false, text)) {
            element.innerText = text;
          }
        } catch (e) {
          element.innerText = text;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        } catch (e) {}
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

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

      if (setter) {
        setter.call(element, text);
      } else {
        element.value = text;
      }

      // Reset internal tracker if present (React _valueTracker)
      if (element._valueTracker) {
        element._valueTracker.setValue('');
      }

      // Dispatch InputEvent and change event
      try {
        element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      } catch (e) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      element.dispatchEvent(new Event('change', { bubbles: true }));

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

  // Ensure Suno Custom Mode is Active (Suno-Specific Safeguard)
  function ensureSunoCustomMode(targetState = true) {
    if (window.location.hostname.includes('topmediai')) {
      return true; // Not required on TopMediai
    }

    const allSwitches = Array.from(document.querySelectorAll('button[role="switch"], [data-state], input[type="checkbox"], [aria-checked]'));
    for (const sw of allSwitches) {
      const container = sw.closest('div, label, section') || sw.parentElement;
      const text = (container ? container.textContent : sw.textContent || '').toLowerCase();
      if (text.includes('custom')) {
        const isChecked = sw.getAttribute('data-state') === 'checked' ||
          sw.getAttribute('aria-checked') === 'true' ||
          (sw.tagName === 'INPUT' && sw.checked);

        if (isChecked !== targetState) {
          sw.click();
          console.log('[Suno Fusion] Toggled Custom mode switch');
          return true;
        }
        return true;
      }
    }

    const buttons = Array.from(document.querySelectorAll('button, [role="button"], span, div')).filter(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return t === 'custom' || t === 'custom mode';
    });

    for (const btn of buttons) {
      if (btn.offsetParent !== null) {
        btn.click();
        console.log('[Suno Fusion] Clicked Custom button');
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

  /**
   * PROVEN 4-TIER WATERFALL SUNO INPUT TARGETING (Retained from v2.0/v2.1)
   */
  function findSunoInputs() {
    // 1. Check custom user-picked selectors first
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

    // 2. Explicit data-testid, aria-label & placeholder selectors
    let styleTextarea = document.querySelector('[data-testid="create-form-styles-wrapper"] textarea, textarea[data-testid="style-input"], textarea[data-testid*="style" i], textarea[placeholder*="clean electric guitar" i], textarea[placeholder*="city pop" i], textarea[aria-label*="Style of Music" i], textarea[aria-label*="Style" i]');
    let lyricsTextarea = document.querySelector('textarea[data-testid="lyrics-input"], textarea[data-testid*="lyrics" i], textarea[aria-label*="Lyrics" i]');
    let titleInput = document.querySelector('input[data-testid="title-input"], input[data-testid*="title" i], input[aria-label*="Title" i]');
    let excludeInput = document.querySelector('input[placeholder*="Exclude" i], textarea[placeholder*="Exclude" i], [aria-label*="Exclude" i]');

    // 3. Exact Leaf Label Traversal (only text nodes with children.length === 0)
    if (!styleTextarea || !lyricsTextarea || !excludeInput) {
      const labels = Array.from(document.querySelectorAll('label, div, span, p')).filter(el => el.children.length === 0 && (el.textContent || '').trim().length > 0);

      for (const el of labels) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (!styleTextarea && (t === 'style of music' || t.includes('style of music') || t === 'music style' || t === 'styles')) {
          const parent = el.closest('div, section, fieldset') || el.parentElement;
          styleTextarea = parent?.querySelector('textarea');
        }
        if (!lyricsTextarea && (t === 'lyrics' || t.includes('enter your lyrics') || t.includes('lyrics & prompt'))) {
          const parent = el.closest('div, section, fieldset') || el.parentElement;
          lyricsTextarea = parent?.querySelector('textarea');
        }
        if (!titleInput && (t === 'title' || t === 'song title' || t.includes('title (optional)'))) {
          const parent = el.closest('div, section, fieldset') || el.parentElement;
          titleInput = parent?.querySelector('input');
        }
        if (!excludeInput && (t.includes('exclude styles') || t === 'exclude')) {
          const parent = el.closest('div, section, fieldset') || el.parentElement;
          excludeInput = parent?.querySelector('input, textarea');
        }
      }
    }

    // 4. Semantic placeholder and aria-label fallback on visible textareas
    const allTextareas = Array.from(document.querySelectorAll('textarea')).filter(t => t.offsetParent !== null || t.getBoundingClientRect().height > 0);
    if (!styleTextarea) {
      styleTextarea = allTextareas.find(t => {
        const p = (t.placeholder || '').toLowerCase();
        const a = (t.getAttribute('aria-label') || '').toLowerCase();
        return p.includes('style') || p.includes('genre') || p.includes('pop') || p.includes('acoustic') ||
               p.includes('upbeat') || p.includes('tempo') || p.includes('vibe') || a.includes('style');
      });
    }

    if (!lyricsTextarea) {
      lyricsTextarea = allTextareas.find(t => {
        const p = (t.placeholder || '').toLowerCase();
        const a = (t.getAttribute('aria-label') || '').toLowerCase();
        return p.includes('lyric') || p.includes('verse') || p.includes('chorus') || p.includes('words') ||
               p.includes('write') || p.includes('enter your own') || a.includes('lyric');
      });
    }

    if (!titleInput) {
      const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).filter(i => i.offsetParent !== null);
      titleInput = allInputs.find(i => {
        const p = (i.placeholder || '').toLowerCase();
        const a = (i.getAttribute('aria-label') || '').toLowerCase();
        return p.includes('title') || p.includes('name') || a.includes('title') || p.includes('give your song');
      });
    }

    // 5. Positional fallback: In Suno Custom Mode, index 0 is Lyrics, index 1 is Style of Music
    if (!styleTextarea || !lyricsTextarea) {
      if (allTextareas.length >= 2) {
        if (!lyricsTextarea) lyricsTextarea = allTextareas[0];
        if (!styleTextarea) styleTextarea = allTextareas[1];
      } else if (allTextareas.length === 1) {
        if (!styleTextarea) styleTextarea = allTextareas[0];
      }
    }

    // Collision safeguard: ensure style and lyrics never target the exact same element
    if (styleTextarea && lyricsTextarea && styleTextarea === lyricsTextarea) {
      if (allTextareas.length >= 2) {
        lyricsTextarea = allTextareas[0];
        styleTextarea = allTextareas[1];
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

  /**
   * TopMediai Specific Input Locator (Isolated from Suno to prevent false positives)
   */
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

    if (!isTopMedia) {
      ensureOnCreatePage();
      if (!promptData.targetSimpleMode) {
        ensureSunoCustomMode(true);
        expandMoreOptions();
      } else {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const simpleTab = tabs.find(b => b.textContent.trim().toLowerCase() === 'simple');
        if (simpleTab && simpleTab.getAttribute('aria-selected') !== 'true') {
          simpleTab.click();
        }
      }

      if (promptData.isInstrumental) {
        toggleInstrumental(true);
      }
    }

    let hasTriggeredAutoCreate = false;

    const runFill = () => {
      if (promptData.targetSimpleMode) {
        const simpleInput = document.querySelector(
          'textarea[aria-label*="description" i], textarea[aria-label*="prompt" i], textarea[placeholder*="describe" i], textarea[placeholder*="song" i], textarea[data-testid*="description" i], textarea'
        );
        if (simpleInput) {
          const directiveVal = promptData.lyricSnippet || promptData.styleTag;
          setInputValueReliably(simpleInput, directiveVal);
          showToast('?? Suno Simple Mode prompt directive injected!', 'success', 4000);
          if (promptData.autoCreate && !hasTriggeredAutoCreate) {
            hasTriggeredAutoCreate = true;
            triggerCreateButton(500);
          }
        }
        return { success: true, count: 1, platform: 'Suno Simple Mode' };
      }

      const { styleTextarea, lyricsTextarea, titleInput, excludeInput, styleInput, lyricsInput } = findTargetInputs();
      const targetStyle = styleInput || styleTextarea;
      const targetLyrics = lyricsInput || lyricsTextarea;
      let filledCount = 0;

      const styleVal = promptData.styleTag || promptData.sunoStyleTag;
      if (targetStyle && styleVal) {
        setInputValueReliably(targetStyle, styleVal);
        filledCount++;
      }

      const lyricVal = promptData.lyricSnippet || promptData.lyrics;
      if (targetLyrics && lyricVal) {
        setInputValueReliably(targetLyrics, lyricVal);
        filledCount++;
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
        // Settings: Vocal Gender
        if (promptData.vocalGender) {
          setSunoVocalGender(promptData.vocalGender);
        }

        // Settings: Weirdness
        if (promptData.weirdness !== undefined) {
          setSunoSlider('Weirdness', promptData.weirdness);
        }

        // Settings: Style Influence
        if (promptData.styleInfluence !== undefined) {
          setSunoSlider('Style Influence', promptData.styleInfluence);
        }

        // Settings: Variety
        if (promptData.variety) {
          setSunoVariety(promptData.variety);
        }

        // Settings: Max Mode
        if (promptData.maxMode !== undefined) {
          setSunoMaxMode(promptData.maxMode);
        }
      }

      const platformName = isTopMedia ? 'TopMediai' : 'Suno';
      if (filledCount > 0) {
        if (promptData.autoCreate && !hasTriggeredAutoCreate) {
          hasTriggeredAutoCreate = true;
          showToast(`⚡ ${platformName} Auto-Filled! Triggering Create button...`, 'success', 2500);
          triggerCreateButton(400);
        } else if (!promptData.autoCreate) {
          showToast(`✓ ${platformName} Auto-Filled! ${filledCount} field${filledCount > 1 ? 's' : ''} updated.`, 'success');
        }
        return { success: true, filledCount, autoCreate: !!promptData.autoCreate };
      } else {
        return { success: false };
      }
    };

    const firstAttempt = runFill();
    if (!firstAttempt.success) {
      setTimeout(() => {
        if (!isTopMedia) {
          ensureSunoCustomMode(true);
          expandMoreOptions();
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
      }, 400);
    }

    return { success: true };
  }

  // Interactive Box Picker
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
        if (target.id) {
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

        if (targetBoxType === 'style') {
          userCustomSelectors.styleSelector = selector;
          chrome.storage?.local?.set({ sf_style_sel: selector });
          showToast('✓ Saved Style Box target!', 'success');
        } else if (targetBoxType === 'lyrics') {
          userCustomSelectors.lyricsSelector = selector;
          chrome.storage?.local?.set({ sf_lyrics_sel: selector });
          showToast('✓ Saved Lyrics Box target!', 'success');
        } else if (targetBoxType === 'title') {
          userCustomSelectors.titleSelector = selector;
          chrome.storage?.local?.set({ sf_title_sel: selector });
          showToast('✓ Saved Title Input target!', 'success');
        } else if (targetBoxType === 'exclude') {
          userCustomSelectors.excludeSelector = selector;
          chrome.storage?.local?.set({ sf_exclude_sel: selector });
          showToast('✓ Saved Exclude Styles target!', 'success');
        } else if (targetBoxType === 'create') {
          userCustomSelectors.createSelector = selector;
          chrome.storage?.local?.set({ sf_create_sel: selector });
          showToast('✓ Saved Create Button target!', 'success');
        }

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

    if (targetLyrics.isContentEditable || targetLyrics.getAttribute('role') === 'textbox') {
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
