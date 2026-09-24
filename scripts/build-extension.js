import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function build() {
  const zip = new JSZip();

  // Read genres from genres.json
  let genresData = { allGenres: [], coinedGenres: [], baseGenres: [] };
  try {
    const raw = fs.readFileSync(path.resolve('src/data/genres.json'), 'utf-8');
    genresData = JSON.parse(raw);
  } catch (e) {
    console.warn('Could not read genres.json, fallback array used', e);
  }

  const manifest = {
    manifest_version: 3,
    name: "Suno Fusion - Studio & AutoFill Sidekick",
    version: "2.1.0",
    description: "Complete music prompt creator & 1-click AutoFill for Suno AI (suno.com). Fills Style of Music, Lyrics, Titles, Exclude Styles, Vocal Gender, Weirdness, Style Influence, and more.",
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    action: {
      default_popup: "popup.html",
      default_title: "Suno Fusion Studio Sidekick"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    permissions: [
      "activeTab",
      "scripting",
      "storage",
      "tabs",
      "sidePanel"
    ],
    host_permissions: [
      "https://suno.com/*",
      "https://*.suno.com/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://*/*"
    ],
    content_scripts: [
      {
        matches: [
          "https://suno.com/*",
          "https://*.suno.com/*"
        ],
        js: ["content.js"],
        css: ["content.css"],
        run_at: "document_idle"
      },
      {
        matches: [
          "<all_urls>"
        ],
        js: ["bridge.js"],
        run_at: "document_idle"
      }
    ]
  };

  // Content script injected on suno.com
  const contentJs = `// Suno Fusion v2.0 - Studio & AutoFill Engine for suno.com
(function () {
  if (window.__sunoFusionInjected) return;
  window.__sunoFusionInjected = true;

  console.log('[Suno Fusion v2.0] Studio & Settings Engine initialized on suno.com');

  // Custom user-picked selectors
  let userCustomSelectors = {
    styleSelector: null,
    lyricsSelector: null,
    titleSelector: null,
    excludeSelector: null
  };

  chrome.storage?.local?.get(['sf_style_sel', 'sf_lyrics_sel', 'sf_title_sel', 'sf_exclude_sel'], (res) => {
    if (res) {
      userCustomSelectors.styleSelector = res.sf_style_sel || null;
      userCustomSelectors.lyricsSelector = res.sf_lyrics_sel || null;
      userCustomSelectors.titleSelector = res.sf_title_sel || null;
      userCustomSelectors.excludeSelector = res.sf_exclude_sel || null;
    }
  });

  // React 17/18/19 Input Value Setter
  function setReactInputValue(el, value) {
    if (!el) return false;
    try {
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }

      const tracker = el._valueTracker;
      if (tracker) {
        tracker.setValue('');
      }

      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // Visual Glow Flash on Suno
      const origOutline = el.style.outline;
      const origBorder = el.style.borderColor;
      const origBoxShadow = el.style.boxShadow;
      el.style.outline = '3px solid #8b5cf6';
      el.style.borderColor = '#8b5cf6';
      el.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.6)';

      setTimeout(() => {
        el.style.outline = origOutline;
        el.style.borderColor = origBorder;
        el.style.boxShadow = origBoxShadow;
      }, 2200);

      return true;
    } catch (err) {
      console.error('[Suno Fusion] Error setting React input:', err);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  // Ensure /create view is loaded
  function ensureOnCreatePage() {
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

  // Ensure Suno Custom Mode is Active
  function ensureCustomMode(targetState = true) {
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
          console.log('[Suno Fusion] Toggled Custom mode');
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

  // Locate all Suno Inputs
  function findSunoInputs() {
    // Check custom user-picked selectors first
    if (userCustomSelectors.styleSelector) {
      const customStyle = document.querySelector(userCustomSelectors.styleSelector);
      if (customStyle) {
        return {
          styleTextarea: customStyle,
          lyricsTextarea: userCustomSelectors.lyricsSelector ? document.querySelector(userCustomSelectors.lyricsSelector) : null,
          titleInput: userCustomSelectors.titleSelector ? document.querySelector(userCustomSelectors.titleSelector) : null,
          excludeInput: userCustomSelectors.excludeSelector ? document.querySelector(userCustomSelectors.excludeSelector) : null
        };
      }
    }

    let styleTextarea = document.querySelector('textarea[data-testid="style-input"], textarea[data-testid*="style" i], textarea[aria-label*="Style of Music" i], textarea[aria-label*="Style" i]');
    let lyricsTextarea = document.querySelector('textarea[data-testid="lyrics-input"], textarea[data-testid*="lyrics" i], textarea[aria-label*="Lyrics" i]');
    let titleInput = document.querySelector('input[data-testid="title-input"], input[data-testid*="title" i], input[aria-label*="Title" i]');
    let excludeInput = document.querySelector('input[placeholder*="Exclude" i], textarea[placeholder*="Exclude" i], [aria-label*="Exclude" i]');

    // Label traversal
    if (!styleTextarea || !lyricsTextarea || !excludeInput) {
      const labels = Array.from(document.querySelectorAll('label, div, span, p')).filter(el => el.children.length === 0 && (el.textContent || '').trim().length > 0);

      for (const el of labels) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (!styleTextarea && (t === 'style of music' || t.includes('style of music') || t === 'music style')) {
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

    // Semantic placeholder fallback
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

    // Positional fallback
    if (!styleTextarea || !lyricsTextarea) {
      if (allTextareas.length >= 2) {
        if (!lyricsTextarea) lyricsTextarea = allTextareas[0];
        if (!styleTextarea) styleTextarea = allTextareas[1];
      } else if (allTextareas.length === 1) {
        if (!styleTextarea) styleTextarea = allTextareas[0];
      }
    }

    return { styleTextarea, lyricsTextarea, titleInput, excludeInput };
  }

  // Toast Notification
  function showToast(message, type = 'success', duration = 3500) {
    const existing = document.getElementById('suno-fusion-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'suno-fusion-toast';
    toast.className = 'suno-fusion-toast ' + type;
    toast.innerHTML = \`
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">\${type === 'success' ? '⚡' : type === 'warn' ? '⚠️' : '❌'}</span>
        <span style="font-weight:600;font-size:13px;line-height:1.4;">\${message}</span>
      </div>
    \`;
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

    ensureOnCreatePage();
    ensureCustomMode(true);
    expandMoreOptions();

    if (promptData.isInstrumental) {
      toggleInstrumental(true);
    }

    const runFill = () => {
      const { styleTextarea, lyricsTextarea, titleInput, excludeInput } = findSunoInputs();
      let filledCount = 0;

      if (styleTextarea && promptData.styleTag) {
        setReactInputValue(styleTextarea, promptData.styleTag);
        filledCount++;
      }

      if (lyricsTextarea && promptData.lyricSnippet) {
        setReactInputValue(lyricsTextarea, promptData.lyricSnippet);
        filledCount++;
      }

      if (titleInput && promptData.title) {
        setReactInputValue(titleInput, promptData.title);
        filledCount++;
      }

      if (excludeInput && promptData.excludeStyles) {
        setReactInputValue(excludeInput, promptData.excludeStyles);
        filledCount++;
      }

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

      if (filledCount > 0) {
        showToast(\`✓ Suno Auto-Filled! \${filledCount} boxes & settings updated.\`, 'success');
        return { success: true, filledCount };
      } else {
        return { success: false };
      }
    };

    const firstAttempt = runFill();
    if (!firstAttempt.success) {
      setTimeout(() => {
        ensureCustomMode(true);
        expandMoreOptions();
        const secondAttempt = runFill();
        if (!secondAttempt.success) {
          setTimeout(() => {
            const thirdAttempt = runFill();
            if (!thirdAttempt.success) {
              showToast('Could not find all Suno inputs automatically. Click "🎯 Diagnostics" in the Suno Fusion HUD to pick your boxes!', 'warn', 5000);
            }
          }, 500);
        }
      }, 400);
    }

    return { success: true };
  }

  // Interactive Box Picker
  function startElementPicker(targetBoxType) {
    showToast(\`🎯 Click directly on Suno's \${targetBoxType.toUpperCase()} box to select it!\`, 'warn', 6000);

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
        hoveredEl = el.closest('textarea, input, button') || el;
        hoveredEl.style.outline = '3px dashed #fbbf24';
      }
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();

      overlay.style.pointerEvents = 'none';
      const target = (document.elementFromPoint(e.clientX, e.clientY) || {}).closest?.('textarea, input, button');
      overlay.remove();

      if (target) {
        target.style.outline = '4px solid #10b981';
        setTimeout(() => target.style.outline = '', 2000);

        const selector = target.id ? '#' + target.id :
          target.getAttribute('name') ? target.tagName.toLowerCase() + '[name="' + target.getAttribute('name') + '"]' :
          target.getAttribute('placeholder') ? target.tagName.toLowerCase() + '[placeholder="' + target.getAttribute('placeholder') + '"]' :
          target.tagName.toLowerCase();

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
        }

        updateHudStatus();
      }
    }

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('click', onClick);
  }

  // Insert Metatag into lyrics box
  function insertMetatagIntoLyrics(tag) {
    const { lyricsTextarea } = findSunoInputs();
    if (!lyricsTextarea) {
      showToast('Please open Custom mode to access the lyrics box!', 'warn');
      return;
    }

    const current = lyricsTextarea.value || '';
    const start = lyricsTextarea.selectionStart || current.length;
    const end = lyricsTextarea.selectionEnd || current.length;
    const insertion = (start > 0 && current[start - 1] !== '\\n' ? '\\n\\n' : '') + tag + '\\n';
    const nextValue = current.slice(0, start) + insertion + current.slice(end);

    setReactInputValue(lyricsTextarea, nextValue);
    showToast(\`Inserted \${tag}\`, 'success');
  }

  // Update Status Badges in HUD
  function updateHudStatus() {
    const statusContainer = document.getElementById('sf-hud-status');
    if (!statusContainer) return;

    const { styleTextarea, lyricsTextarea, titleInput, excludeInput } = findSunoInputs();
    statusContainer.innerHTML = \`
      <div style="display:flex;gap:6px;font-size:10px;font-family:monospace;flex-wrap:wrap;">
        <span style="color:\${styleTextarea ? '#34d399' : '#f87171'}">\${styleTextarea ? '● Style OK' : '○ Style Missing'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:\${lyricsTextarea ? '#34d399' : '#f87171'}">\${lyricsTextarea ? '● Lyrics OK' : '○ Lyrics Missing'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:\${titleInput ? '#34d399' : '#a1a1aa'}">\${titleInput ? '● Title OK' : '○ Title (Opt)'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:\${excludeInput ? '#34d399' : '#a1a1aa'}">\${excludeInput ? '● Exclude OK' : '○ Exclude (Opt)'}</span>
      </div>
    \`;
  }

  // Built-in list of genres & instruments for prompt generation directly on Suno
  const APP_GENRES = ${JSON.stringify(genresData.allGenres && genresData.allGenres.length > 0 ? genresData.allGenres : [
    "Dream Pop & Shoegaze", "TRAP & DRILL", "Cyber Funk", "Celtic (Irish & Scottish Folk)", "Darkwave & Coldwave",
    "Neo-City Pop", "Neo-Tokyo Lo-Fi", "J-Metal Idol Fusion", "POWER METAL", "ASIAN POP", "Vaporwave Metal",
    "DOOM METAL", "Trance Flamenco", "GOA TRANCE & PSYTRANCE", "Math Rock Goth Rock", "POST-PUNK", "ClassicalWave",
    "Glitch Hop IDM", "Ambient House / Chill-Out", "Indie Folk & Freakfolk", "SYNTHPOP & NEW ROMANTICS", "AFROBEATS & AFROPOP",
    "FUTURE NOIR DISCO", "NEO-SHRED GUITAR", "ELECTRO SWING", "HARDSTYLE", "DOWNTEMPO & LO-FI BEATS"
  ])};

  const APP_INSTRUMENTS = [
    "Roland Juno-106", "Moog Minimoog", "808 Sub Bass", "Fender Stratocaster", "Acoustic Guitar",
    "Bagpipes", "Erhu", "Shamisen", "Sitar", "Cello", "80s LinnDrum", "Grand Piano", "Saxophone", "TR-909 Drums", "Modular Synth"
  ];

  // Full Floating Studio HUD
  function injectFloatingHUD() {
    if (document.getElementById('suno-fusion-fab')) return;

    const hud = document.createElement('div');
    hud.id = 'suno-fusion-fab';
    hud.className = 'suno-fusion-fab-container';
    hud.innerHTML = \`
      <!-- Minimized Floating Button -->
      <button id="sf-toggle-btn" class="sf-fab-btn" title="Open Suno Fusion Studio & AutoFill">
        <span style="font-size:16px;">⚡</span>
        <span style="font-weight:700;">Suno Fusion Studio</span>
      </button>

      <!-- Full Expanded Studio Panel -->
      <div id="sf-hud-panel" class="sf-panel sf-hidden">
        <!-- Header -->
        <div class="sf-panel-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="color:#fbbf24;font-size:16px;">⚡</span>
            <span style="font-weight:800;font-size:14px;color:#ffffff;">Suno Fusion Studio</span>
            <span class="sf-badge">v2.0</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button id="sf-btn-refresh-status" class="sf-icon-btn" title="Rescan Suno Input Boxes">🔄</button>
            <button id="sf-btn-close-hud" class="sf-icon-btn" title="Close Panel">&times;</button>
          </div>
        </div>

        <!-- Detection Status -->
        <div id="sf-hud-status" style="padding:6px 12px;background:#18181b;border-bottom:1px solid #27272a;"></div>

        <!-- Tab Bar -->
        <div class="sf-tab-bar">
          <button class="sf-tab-btn active" data-tab="create">🔀 Prompt Studio</button>
          <button class="sf-tab-btn" data-tab="settings">⚙️ Suno Settings</button>
          <button class="sf-tab-btn" data-tab="metatags">🏷️ Metatags</button>
          <button class="sf-tab-btn" data-tab="diag">🎯 Pick Boxes</button>
        </div>

        <!-- Panel Body -->
        <div class="sf-panel-body">
          <!-- TAB 1: PROMPT STUDIO -->
          <div id="sf-tab-content-create" class="sf-tab-content">
            <!-- Genre Clash Selector -->
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <label class="sf-label">Genre 1 &amp; Genre 2 Collision:</label>
                <button id="sf-btn-roll-random" class="sf-pick-btn" title="Roll random collision">🎲 Roll Clash</button>
              </div>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <select id="sf-genre-1" class="sf-select" style="flex:1;"></select>
                <select id="sf-genre-2" class="sf-select" style="flex:1;"></select>
              </div>
              <select id="sf-genre-3" class="sf-select" style="width:100%;"><option value="">-- Optional Genre 3 --</option></select>
            </div>

            <!-- Tempo & Instruments -->
            <div style="display:flex;gap:8px;margin-bottom:10px;">
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                  <label class="sf-label">Tempo: <span id="sf-bpm-val" style="color:#fbbf24;">140 BPM</span></label>
                  <button id="sf-btn-metronome" class="sf-pick-btn" title="Metronome audio click">🔊 Click</button>
                </div>
                <input id="sf-bpm-slider" type="range" min="50" max="210" value="140" class="sf-range" />
              </div>
              <div style="width:100px;">
                <label class="sf-label">Time Sig:</label>
                <select id="sf-timesig" class="sf-select">
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                  <option value="7/8">7/8</option>
                </select>
              </div>
            </div>

            <!-- Instrument Rig Chips -->
            <div style="margin-bottom:10px;">
              <label class="sf-label" style="margin-bottom:4px;display:block;">Instrument Rig (Click to Add):</label>
              <div id="sf-inst-chips" class="sf-tags-cloud"></div>
            </div>

            <!-- Style Tag Textarea -->
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <label class="sf-label">Style of Music (Suno Tag):</label>
                <button id="sf-btn-rebuild-prompt" class="sf-pick-btn">✨ Re-Roll Style</button>
              </div>
              <textarea id="sf-style-text" class="sf-textarea" rows="2"></textarea>
            </div>

            <!-- Lyrics & Title -->
            <div style="margin-bottom:10px;">
              <label class="sf-label" style="margin-bottom:4px;display:block;">Lyrics &amp; Metatag Scaffold:</label>
              <textarea id="sf-lyrics-text" class="sf-textarea" rows="2"></textarea>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <div style="flex:1;">
                <label class="sf-label">Track Title:</label>
                <input id="sf-title-text" type="text" class="sf-input" value="Nebula Drift" />
              </div>
              <div style="width:110px;">
                <label class="sf-label">Instrumental:</label>
                <button id="sf-toggle-inst-btn" class="sf-option-btn">Instrumental: OFF</button>
              </div>
            </div>

            <!-- Main AutoFill Button -->
            <button id="sf-btn-autofill" class="sf-primary-fill-btn">
              ⚡ 1-Click AutoFill Suno Form
            </button>
          </div>

          <!-- TAB 2: SUNO ADVANCED SETTINGS (MORE OPTIONS) -->
          <div id="sf-tab-content-settings" class="sf-tab-content sf-hidden">
            <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:12px;margin-bottom:12px;">
              <span class="sf-section-title" style="margin-bottom:8px;color:#c4b5fd;">Suno "More Options" Configuration:</span>

              <!-- Exclude Styles -->
              <div style="margin-bottom:12px;">
                <label class="sf-label" style="display:flex;align-items:center;gap:4px;">
                  <span>🚫 Exclude Styles (Negative Prompt):</span>
                </label>
                <input id="sf-exclude-text" type="text" class="sf-input" placeholder="e.g. screaming, harsh distortion, autotune, mumble" value="screaming, harsh distortion, muddy bass, generic pop EDM" />
              </div>

              <!-- Vocal Gender -->
              <div style="margin-bottom:12px;">
                <label class="sf-label" style="margin-bottom:6px;display:block;">Vocal Gender:</label>
                <div style="display:flex;gap:6px;">
                  <button class="sf-gender-btn active" data-gender="Female">Female</button>
                  <button class="sf-gender-btn" data-gender="Male">Male</button>
                  <button class="sf-gender-btn" data-gender="Duet">Duet</button>
                  <button class="sf-gender-btn" data-gender="None">None</button>
                </div>
              </div>

              <!-- Weirdness Slider -->
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <label class="sf-label">Weirdness:</label>
                  <span id="sf-weirdness-val" style="font-size:11px;font-family:monospace;color:#fbbf24;">50%</span>
                </div>
                <input id="sf-weirdness-slider" type="range" min="0" max="100" value="50" class="sf-range" />
              </div>

              <!-- Style Influence Slider -->
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <label class="sf-label">Style Influence:</label>
                  <span id="sf-influence-val" style="font-size:11px;font-family:monospace;color:#ec4899;">85%</span>
                </div>
                <input id="sf-influence-slider" type="range" min="0" max="100" value="85" class="sf-range" />
              </div>

              <!-- Variety -->
              <div style="margin-bottom:12px;">
                <label class="sf-label" style="margin-bottom:6px;display:block;">Variety:</label>
                <div style="display:flex;gap:6px;">
                  <button class="sf-variety-btn" data-variety="Low">Low</button>
                  <button class="sf-variety-btn" data-variety="Medium">Medium</button>
                  <button class="sf-variety-btn active" data-variety="High">High</button>
                </div>
              </div>

              <!-- Duration & Max Mode -->
              <div style="display:flex;gap:8px;">
                <div style="flex:1;">
                  <label class="sf-label">Duration:</label>
                  <select id="sf-duration-select" class="sf-select">
                    <option value="2:00">2:00</option>
                    <option value="2:30">2:30</option>
                    <option value="3:00" selected>3:00</option>
                    <option value="3:30">3:30</option>
                    <option value="4:00">4:00</option>
                  </select>
                </div>
                <div style="flex:1;">
                  <label class="sf-label">Max Mode:</label>
                  <button id="sf-btn-maxmode" class="sf-option-btn">Max Mode: OFF</button>
                </div>
              </div>
            </div>

            <button id="sf-btn-apply-settings" class="sf-primary-fill-btn">
              ⚡ Apply Settings &amp; AutoFill Suno
            </button>
          </div>

          <!-- TAB 3: METATAGS -->
          <div id="sf-tab-content-metatags" class="sf-tab-content sf-hidden">
            <span class="sf-section-title" style="margin-bottom:8px;">Click to inject metatag into Suno's lyrics:</span>
            <div class="sf-tags-cloud" style="gap:6px;">
              <button class="sf-metatag-btn" data-tag="[Intro]">[Intro]</button>
              <button class="sf-metatag-btn" data-tag="[Verse 1]">[Verse 1]</button>
              <button class="sf-metatag-btn" data-tag="[Verse 2]">[Verse 2]</button>
              <button class="sf-metatag-btn" data-tag="[Pre-Chorus]">[Pre-Chorus]</button>
              <button class="sf-metatag-btn" data-tag="[Chorus]">[Chorus]</button>
              <button class="sf-metatag-btn" data-tag="[Drop]">[Drop]</button>
              <button class="sf-metatag-btn" data-tag="[Guitar Solo]">[Guitar Solo]</button>
              <button class="sf-metatag-btn" data-tag="[Synth Solo]">[Synth Solo]</button>
              <button class="sf-metatag-btn" data-tag="[Bass Drop]">[Bass Drop]</button>
              <button class="sf-metatag-btn" data-tag="[Bridge]">[Bridge]</button>
              <button class="sf-metatag-btn" data-tag="[Outro]">[Outro]</button>
              <button class="sf-metatag-btn" data-tag="[Fade Out]">[Fade Out]</button>
              <button class="sf-metatag-btn" data-tag="[Instrumental Break]">[Instrumental Break]</button>
            </div>
          </div>

          <!-- TAB 4: DIAGNOSTICS & ELEMENT PICKER -->
          <div id="sf-tab-content-diag" class="sf-tab-content sf-hidden">
            <span class="sf-section-title" style="margin-bottom:8px;">Target Element Finder &amp; Selectors:</span>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button id="sf-pick-style-btn" class="sf-secondary-btn" style="text-align:left;padding:9px;">
                🎯 Click to Target Style Box
              </button>
              <button id="sf-pick-lyrics-btn" class="sf-secondary-btn" style="text-align:left;padding:9px;">
                🎯 Click to Target Lyrics Box
              </button>
              <button id="sf-pick-title-btn" class="sf-secondary-btn" style="text-align:left;padding:9px;">
                🎯 Click to Target Title Box
              </button>
              <button id="sf-pick-exclude-btn" class="sf-secondary-btn" style="text-align:left;padding:9px;">
                🎯 Click to Target Exclude Styles Box
              </button>
              <button id="sf-btn-force-expand-more" class="sf-secondary-btn" style="text-align:left;padding:9px;">
                📂 Force Expand "More Options" on Suno
              </button>
              <button id="sf-btn-force-custom" class="sf-secondary-btn" style="text-align:left;padding:9px;">
                🎛️ Force Custom Mode Toggle on Suno
              </button>
            </div>
          </div>
        </div>
      </div>
    \`;

    document.body.appendChild(hud);

    // Event Wire-up
    const toggleBtn = document.getElementById('sf-toggle-btn');
    const hudPanel = document.getElementById('sf-hud-panel');
    const closeBtn = document.getElementById('sf-btn-close-hud');
    const refreshBtn = document.getElementById('sf-btn-refresh-status');
    const genre1Sel = document.getElementById('sf-genre-1');
    const genre2Sel = document.getElementById('sf-genre-2');
    const genre3Sel = document.getElementById('sf-genre-3');
    const rollRandomBtn = document.getElementById('sf-btn-roll-random');
    const bpmSlider = document.getElementById('sf-bpm-slider');
    const bpmVal = document.getElementById('sf-bpm-val');
    const metronomeBtn = document.getElementById('sf-btn-metronome');
    const timeSigSel = document.getElementById('sf-timesig');
    const instChipsContainer = document.getElementById('sf-inst-chips');
    const styleText = document.getElementById('sf-style-text');
    const lyricsText = document.getElementById('sf-lyrics-text');
    const titleText = document.getElementById('sf-title-text');
    const excludeText = document.getElementById('sf-exclude-text');
    const toggleInstBtn = document.getElementById('sf-toggle-inst-btn');
    const autofillBtn = document.getElementById('sf-btn-autofill');
    const applySettingsBtn = document.getElementById('sf-btn-apply-settings');
    const rebuildPromptBtn = document.getElementById('sf-btn-rebuild-prompt');

    // Advanced settings inputs
    const weirdnessSlider = document.getElementById('sf-weirdness-slider');
    const weirdnessVal = document.getElementById('sf-weirdness-val');
    const influenceSlider = document.getElementById('sf-influence-slider');
    const influenceVal = document.getElementById('sf-influence-val');
    const durationSelect = document.getElementById('sf-duration-select');
    const maxModeBtn = document.getElementById('sf-btn-maxmode');

    let selectedGender = 'Female';
    let selectedVariety = 'High';
    let isMaxMode = false;
    let isInstrumental = false;
    let selectedInstruments = ['Roland Juno-106', '808 Sub Bass'];

    // Populate Genres
    APP_GENRES.forEach((g, i) => {
      const opt1 = new Option(g, g, false, i === 0);
      const opt2 = new Option(g, g, false, i === 1);
      const opt3 = new Option(g, g);
      genre1Sel.add(opt1);
      genre2Sel.add(opt2);
      genre3Sel.add(opt3);
    });

    // Populate Instruments
    function renderInstruments() {
      instChipsContainer.innerHTML = '';
      APP_INSTRUMENTS.forEach(inst => {
        const isSelected = selectedInstruments.includes(inst);
        const chip = document.createElement('button');
        chip.className = 'sf-inst-chip' + (isSelected ? ' active' : '');
        chip.textContent = inst;
        chip.onclick = () => {
          if (selectedInstruments.includes(inst)) {
            selectedInstruments = selectedInstruments.filter(x => x !== inst);
          } else {
            selectedInstruments.push(inst);
          }
          renderInstruments();
          updatePrompt();
        };
        instChipsContainer.appendChild(chip);
      });
    }
    renderInstruments();

    // Prompt generator
    function updatePrompt() {
      const g1 = genre1Sel.value;
      const g2 = genre2Sel.value;
      const g3 = genre3Sel.value;
      const bpm = bpmSlider.value;
      const sig = timeSigSel.value;
      const instStr = selectedInstruments.length ? selectedInstruments.join(', ') : 'atmospheric synths';

      const genresPart = [g1, g2, g3].filter(Boolean).join(' × ');
      const style = \`\${genresPart}, \${bpm} BPM (\${sig}), \${selectedGender.toLowerCase()} vocals, \${instStr}\`;
      styleText.value = style;

      if (!lyricsText.value.trim()) {
        lyricsText.value = \`[Intro]\\n[Verse 1]\\nNeon shadows drift across the floor\\nVoices echo from an open door\\n\\n[Pre-Chorus]\\nCounting down the seconds in the light\\n\\n[Chorus]\\nElectric dreams ignite the endless night\\n\\n[Drop]\\n\\n[Outro]\\n[Fade Out]\`;
      }
    }
    updatePrompt();

    // Roll random clash
    rollRandomBtn.onclick = () => {
      const pick = () => APP_GENRES[Math.floor(Math.random() * APP_GENRES.length)];
      genre1Sel.value = pick();
      genre2Sel.value = pick();
      genre3Sel.value = Math.random() > 0.5 ? pick() : '';
      bpmSlider.value = Math.floor(Math.random() * (175 - 85) + 85);
      bpmVal.textContent = bpmSlider.value + ' BPM';
      updatePrompt();
      showToast('🎲 Rolled new genre collision!', 'success');
    };

    rebuildPromptBtn.onclick = updatePrompt;

    // Sliders
    bpmSlider.oninput = () => {
      bpmVal.textContent = bpmSlider.value + ' BPM';
      updatePrompt();
    };

    weirdnessSlider.oninput = () => {
      weirdnessVal.textContent = weirdnessSlider.value + '%';
    };

    influenceSlider.oninput = () => {
      influenceVal.textContent = influenceSlider.value + '%';
    };

    // Metronome click (Web Audio API)
    let audioCtx = null;
    let metronomeTimer = null;
    metronomeBtn.onclick = () => {
      if (metronomeTimer) {
        clearInterval(metronomeTimer);
        metronomeTimer = null;
        metronomeBtn.textContent = '🔊 Click';
        return;
      }
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const intervalMs = (60 / parseInt(bpmSlider.value, 10)) * 1000;
      metronomeBtn.textContent = '⏹ Stop';
      metronomeTimer = setInterval(() => {
        try {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.05);
        } catch (e) {}
      }, intervalMs);
    };

    // Gender buttons
    hud.querySelectorAll('.sf-gender-btn').forEach(btn => {
      btn.onclick = () => {
        hud.querySelectorAll('.sf-gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedGender = btn.getAttribute('data-gender');
        updatePrompt();
      };
    });

    // Variety buttons
    hud.querySelectorAll('.sf-variety-btn').forEach(btn => {
      btn.onclick = () => {
        hud.querySelectorAll('.sf-variety-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedVariety = btn.getAttribute('data-variety');
      };
    });

    // Max mode toggle
    maxModeBtn.onclick = () => {
      isMaxMode = !isMaxMode;
      maxModeBtn.textContent = 'Max Mode: ' + (isMaxMode ? 'ON' : 'OFF');
      maxModeBtn.style.color = isMaxMode ? '#34d399' : '#a1a1aa';
    };

    // Instrumental toggle
    toggleInstBtn.onclick = () => {
      isInstrumental = !isInstrumental;
      toggleInstBtn.textContent = 'Instrumental: ' + (isInstrumental ? 'ON' : 'OFF');
      toggleInstBtn.style.color = isInstrumental ? '#34d399' : '#a1a1aa';
      toggleInstrumental(isInstrumental);
    };

    // Tab Navigation
    hud.querySelectorAll('.sf-tab-btn').forEach(btn => {
      btn.onclick = () => {
        hud.querySelectorAll('.sf-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        hud.querySelectorAll('.sf-tab-content').forEach(c => c.classList.add('sf-hidden'));
        document.getElementById('sf-tab-content-' + targetTab)?.classList.remove('sf-hidden');
      };
    });

    // Main AutoFill Action
    const doFill = () => {
      executeAutoFill({
        styleTag: styleText.value.trim(),
        lyricSnippet: lyricsText.value.trim(),
        title: titleText.value.trim(),
        excludeStyles: excludeText.value.trim(),
        vocalGender: selectedGender,
        weirdness: parseInt(weirdnessSlider.value, 10),
        styleInfluence: parseInt(influenceSlider.value, 10),
        variety: selectedVariety,
        duration: durationSelect.value,
        maxMode: isMaxMode,
        isInstrumental
      });
    };

    autofillBtn.onclick = doFill;
    applySettingsBtn.onclick = doFill;

    // Diagnostics / Element Pickers
    document.getElementById('sf-pick-style-btn').onclick = () => startElementPicker('style');
    document.getElementById('sf-pick-lyrics-btn').onclick = () => startElementPicker('lyrics');
    document.getElementById('sf-pick-title-btn').onclick = () => startElementPicker('title');
    document.getElementById('sf-pick-exclude-btn').onclick = () => startElementPicker('exclude');
    document.getElementById('sf-btn-force-expand-more').onclick = () => {
      expandMoreOptions();
      showToast('Expanded More Options on Suno', 'success');
    };
    document.getElementById('sf-btn-force-custom').onclick = () => {
      ensureCustomMode(true);
      showToast('Custom Mode Toggled on Suno', 'success');
    };

    // Metatags insertion
    hud.querySelectorAll('.sf-metatag-btn').forEach(btn => {
      btn.onclick = () => insertMetatagIntoLyrics(btn.getAttribute('data-tag'));
    });

    toggleBtn.onclick = () => {
      hudPanel.classList.toggle('sf-hidden');
      updateHudStatus();
    };

    closeBtn.onclick = () => hudPanel.classList.add('sf-hidden');
    refreshBtn.onclick = updateHudStatus;
  }

  // Runtime Message Listener
  chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'AUTOFILL') {
      const res = executeAutoFill(request.prompt);
      sendResponse(res);
    } else if (request.action === 'PING') {
      const inputs = findSunoInputs();
      sendResponse({ active: true, inputsFound: !!(inputs.styleTextarea || inputs.lyricsTextarea) });
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
`;

  // Content script CSS
  const contentCss = `/* Suno Fusion v2.0 Floating Studio Styles */
.suno-fusion-fab-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color-scheme: dark;
}

.sf-fab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 11px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(139, 92, 246, 0.5);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.sf-fab-btn:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 14px 36px rgba(236, 72, 153, 0.6);
}

.sf-panel {
  position: absolute;
  bottom: 56px;
  right: 0;
  width: 390px;
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9);
  color: #f4f4f5;
  overflow: hidden;
  backdrop-filter: blur(16px);
}

.sf-hidden {
  display: none !important;
}

.sf-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: #111114;
  border-bottom: 1px solid #27272a;
}

.sf-badge {
  font-size: 10px;
  font-family: monospace;
  font-weight: 700;
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.4);
  padding: 1px 5px;
  border-radius: 4px;
}

.sf-tab-bar {
  display: flex;
  background: #141418;
  border-bottom: 1px solid #27272a;
}

.sf-tab-btn {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #a1a1aa;
  padding: 8px 4px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sf-tab-btn.active {
  color: #c4b5fd;
  border-bottom-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.08);
}

.sf-panel-body {
  padding: 14px;
  max-height: 420px;
  overflow-y: auto;
}

.sf-label {
  font-size: 11px;
  font-weight: 700;
  color: #d4d4d8;
}

.sf-pick-btn {
  background: rgba(167, 139, 250, 0.15);
  border: 1px solid rgba(167, 139, 250, 0.35);
  border-radius: 4px;
  font-size: 10px;
  color: #c4b5fd;
  cursor: pointer;
  padding: 2px 7px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.15s ease;
}

.sf-pick-btn:hover {
  background: rgba(167, 139, 250, 0.3);
  color: #ffffff;
}

.sf-section-title {
  font-size: 11px;
  font-weight: 700;
  color: #a1a1aa;
  display: block;
}

.sf-select, .sf-textarea, .sf-input {
  width: 100%;
  box-sizing: border-box;
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  color: #f4f4f5;
  padding: 7px 9px;
  font-size: 11.5px;
  font-family: inherit;
}

.sf-select:focus, .sf-textarea:focus, .sf-input:focus {
  outline: none;
  border-color: #8b5cf6;
}

.sf-range {
  width: 100%;
  accent-color: #ec4899;
  cursor: pointer;
}

.sf-tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sf-inst-chip {
  background: #18181b;
  border: 1px solid #27272a;
  color: #a1a1aa;
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.sf-inst-chip.active {
  background: #2e1065;
  border-color: #8b5cf6;
  color: #ffffff;
}

.sf-metatag-btn {
  background: #18181b;
  border: 1px solid #27272a;
  color: #c4b5fd;
  font-size: 10px;
  font-family: monospace;
  padding: 4px 7px;
  border-radius: 6px;
  cursor: pointer;
}

.sf-metatag-btn:hover {
  background: #2e1065;
  border-color: #8b5cf6;
  color: #ffffff;
}

.sf-gender-btn, .sf-variety-btn {
  flex: 1;
  background: #18181b;
  border: 1px solid #27272a;
  color: #a1a1aa;
  padding: 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.sf-gender-btn.active, .sf-variety-btn.active {
  background: #8b5cf6;
  color: #ffffff;
  border-color: #a78bfa;
}

.sf-option-btn {
  width: 100%;
  background: #18181b;
  border: 1px solid #27272a;
  color: #a1a1aa;
  padding: 7px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.sf-primary-fill-btn {
  width: 100%;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: #ffffff;
  border: none;
  padding: 11px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
  transition: all 0.15s ease;
}

.sf-primary-fill-btn:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}

.sf-secondary-btn {
  width: 100%;
  background: #18181b;
  border: 1px solid #27272a;
  color: #d4d4d8;
  padding: 7px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.sf-secondary-btn:hover {
  background: #27272a;
  color: #ffffff;
}

.sf-icon-btn {
  background: none;
  border: none;
  color: #a1a1aa;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}

.suno-fusion-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #111114;
  border: 1px solid #8b5cf6;
  color: #ffffff;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 13px;
  z-index: 10000000;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.85);
  max-width: 480px;
}
`;

  // Popup HTML matching HUD
  const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Suno Fusion Studio Sidekick</title>
  <link rel="stylesheet" href="content.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 380px;
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: #111114;
      border-bottom: 1px solid #27272a;
    }
    .sf-creation-box {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(236, 72, 153, 0.08));
      border: 1px solid rgba(139, 92, 246, 0.35);
      border-radius: 9px;
      padding: 9px 10px;
      margin-bottom: 11px;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="color:#fbbf24;font-size:16px;">⚡</span>
      <span style="font-weight:800;font-size:14px;color:#ffffff;">Suno Fusion Studio</span>
      <span class="sf-badge">v2.1</span>
    </div>
    <a href="https://suno.com/create" target="_blank" style="color:#a78bfa;font-size:11px;text-decoration:none;font-weight:700;">↗ Open Suno</a>
  </div>

  <div class="sf-tab-bar">
    <button class="sf-tab-btn active" data-tab="create">🔀 Studio</button>
    <button class="sf-tab-btn" data-tab="settings">⚙️ Settings</button>
    <button class="sf-tab-btn" data-tab="metatags">🏷️ Metatags</button>
  </div>

  <div class="sf-panel-body">
    <!-- CREATE / STUDIO TAB -->
    <div id="pop-tab-create">
      <!-- Studio Creations Sync & Selection Bar -->
      <div class="sf-creation-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="font-size:12px;">🎵</span>
            <span style="font-size:11px;font-weight:800;color:#e9d5ff;letter-spacing:0.02em;">MY STUDIO CREATIONS:</span>
          </div>
          <div style="display:flex;gap:4px;">
            <button id="pop-btn-sync-app" class="sf-pick-btn" title="Sync active song from your open Suno Fusion Web App">🔄 Sync App</button>
            <button id="pop-btn-roll-popup" class="sf-pick-btn" title="Roll a fresh genre collision right here">🎲 Roll New</button>
          </div>
        </div>

        <!-- Dropdown of User's Studio Creations -->
        <select id="pop-creations-dropdown" class="sf-select" style="width:100%;font-size:11px;padding:5px 7px;margin-bottom:6px;background:#09090b;border:1px solid #3f3f46;border-radius:6px;color:#f4f4f5;">
          <option value="">📂 Select from My Studio Creations...</option>
        </select>

        <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;">
          <span id="pop-loaded-status" style="color:#34d399;font-weight:600;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px;">● Active: Nebula Drift</span>
          <button id="pop-btn-paste-prompt" class="sf-pick-btn" style="padding:2px 6px;font-size:10px;" title="Paste any prompt from clipboard">📋 Paste</button>
        </div>
      </div>

      <!-- Genre Collision Inputs -->
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <label class="sf-label">Genre Collision:</label>
          <button id="pop-btn-rebuild-style" class="sf-pick-btn" style="padding:1px 6px;font-size:10px;" title="Rebuild style tag from current genres">✨ Update Style</button>
        </div>
        <div style="display:flex;gap:4px;margin-top:2px;">
          <input type="text" id="pop-g1" class="sf-input" value="Dream Pop &amp; Shoegaze" style="flex:1;" placeholder="Genre 1" />
          <input type="text" id="pop-g2" class="sf-input" value="TRAP &amp; DRILL" style="flex:1;" placeholder="Genre 2" />
        </div>
      </div>

      <!-- Style of Music Textarea -->
      <div style="margin-bottom:8px;">
        <label class="sf-label">Style of Music (Prompt Tag):</label>
        <textarea id="pop-style" class="sf-textarea" rows="2">Dream Pop, TRAP &amp; DRILL, 140 BPM, female vocals, Roland Juno-106, 808 sub bass</textarea>
      </div>

      <!-- Lyrics & Metatags -->
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <label class="sf-label">Lyrics &amp; Metatags:</label>
          <button id="pop-btn-clear-lyrics" class="sf-pick-btn" style="padding:1px 5px;font-size:10px;">Clear</button>
        </div>
        <textarea id="pop-lyrics" class="sf-textarea" rows="2">[Intro]&#10;[Verse 1]&#10;Neon echoes through the night&#10;&#10;[Chorus]&#10;Drifting high</textarea>
      </div>

      <!-- Title & Instrumental Toggle -->
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <input type="text" id="pop-title" class="sf-input" value="Nebula Drift" style="flex:1;" placeholder="Song Title" />
        <button id="pop-btn-inst" class="sf-option-btn" style="width:115px;">Instrumental: OFF</button>
      </div>

      <button id="pop-btn-fill" class="sf-primary-fill-btn">⚡ Auto-Fill Active Suno Tab</button>
    </div>

    <!-- SETTINGS TAB -->
    <div id="pop-tab-settings" class="sf-hidden">
      <div style="margin-bottom:10px;">
        <label class="sf-label">🚫 Exclude Styles:</label>
        <input type="text" id="pop-exclude" class="sf-input" value="screaming, harsh distortion, muddy bass, generic pop EDM" />
      </div>

      <div style="margin-bottom:10px;">
        <label class="sf-label" style="margin-bottom:4px;display:block;">Vocal Gender:</label>
        <div style="display:flex;gap:4px;">
          <button class="sf-gender-btn active" data-gender="Female">Female</button>
          <button class="sf-gender-btn" data-gender="Male">Male</button>
          <button class="sf-gender-btn" data-gender="Duet">Duet</button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;">
          <label class="sf-label">Weirdness:</label>
          <span id="pop-weirdness-val" style="font-size:11px;color:#fbbf24;">50%</span>
        </div>
        <input id="pop-weirdness" type="range" min="0" max="100" value="50" class="sf-range" />
      </div>

      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;">
          <label class="sf-label">Style Influence:</label>
          <span id="pop-influence-val" style="font-size:11px;color:#ec4899;">85%</span>
        </div>
        <input id="pop-influence" type="range" min="0" max="100" value="85" class="sf-range" />
      </div>

      <button id="pop-btn-fill-settings" class="sf-primary-fill-btn">⚡ Apply &amp; Auto-Fill Everything</button>
    </div>

    <!-- METATAGS TAB -->
    <div id="pop-tab-metatags" class="sf-hidden">
      <div class="sf-tags-cloud">
        <button class="sf-metatag-btn" data-tag="[Intro]">[Intro]</button>
        <button class="sf-metatag-btn" data-tag="[Verse 1]">[Verse 1]</button>
        <button class="sf-metatag-btn" data-tag="[Pre-Chorus]">[Pre-Chorus]</button>
        <button class="sf-metatag-btn" data-tag="[Chorus]">[Chorus]</button>
        <button class="sf-metatag-btn" data-tag="[Drop]">[Drop]</button>
        <button class="sf-metatag-btn" data-tag="[Guitar Solo]">[Guitar Solo]</button>
        <button class="sf-metatag-btn" data-tag="[Bridge]">[Bridge]</button>
        <button class="sf-metatag-btn" data-tag="[Outro]">[Outro]</button>
      </div>
    </div>
  </div>

  <div id="pop-status" style="padding:6px 12px;background:#141418;text-align:center;font-size:11px;color:#34d399;">Ready</div>

  <script src="popup.js"></script>
</body>
</html>
`;

  // Bridge JS for Web App sync
  const bridgeJs = `// Suno Fusion Bridge: Syncs creations from the Web App to Extension Storage
(function () {
  console.log('[Suno Fusion Bridge] Active on page');

  function saveCreation(prompt) {
    if (!prompt) return;
    try {
      chrome.storage?.local?.get(['sf_creations_list'], (res) => {
        let list = res?.sf_creations_list || [];
        const item = {
          title: prompt.title || 'Studio Fusion',
          sunoStyleTag: prompt.sunoStyleTag || prompt.styleTag || '',
          lyricSnippet: prompt.lyricSnippet || prompt.lyrics || '',
          genres: prompt.genres || (prompt.sunoStyleTag ? prompt.sunoStyleTag.split(',').slice(0, 2).map(s => s.trim()) : ['Dream Pop', 'Trap']),
          excludeStyles: prompt.excludeStyles || '',
          vocalGender: prompt.vocalGender || 'Female',
          weirdness: prompt.weirdness !== undefined ? prompt.weirdness : 50,
          styleInfluence: prompt.styleInfluence !== undefined ? prompt.styleInfluence : 85,
          variety: prompt.variety || 'High',
          duration: prompt.duration || '3:00',
          maxMode: !!prompt.maxMode,
          isInstrumental: !!prompt.isInstrumental,
          timestamp: Date.now()
        };
        list = [item, ...list.filter(x => x.title !== item.title)].slice(0, 30);
        chrome.storage?.local?.set({
          sf_latest_creation: item,
          sf_creations_list: list
        }, () => {
          console.log('[Suno Fusion Bridge] Synced studio creation to extension:', item.title);
        });
      });
    } catch (e) {
      console.warn('[Suno Fusion Bridge] Error saving creation:', e);
    }
  }

  // 1. Listen for postMessage from the web app
  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SUNO_FUSION_SYNC_PROMPT' || event.data.type === 'SUNO_FUSION_AUTOFILL')) {
      saveCreation(event.data.prompt);
    }
  });

  // 2. Read from localStorage on page load if present
  try {
    const raw = localStorage.getItem('sf_latest_creation');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.title || parsed.sunoStyleTag)) {
        saveCreation(parsed);
      }
    }
  } catch (e) {}

  // 3. Respond to runtime ping from popup
  chrome.runtime?.onMessage?.addListener((req, sender, sendResponse) => {
    if (req.action === 'GET_APP_CREATION') {
      try {
        const raw = localStorage.getItem('sf_latest_creation');
        sendResponse({ success: true, prompt: raw ? JSON.parse(raw) : null });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }
  });
})();
`;

  // Popup JS
  const popupJs = `document.addEventListener('DOMContentLoaded', () => {
  let isInstrumental = false;
  let selectedGender = 'Female';

  const styleInput = document.getElementById('pop-style');
  const lyricsInput = document.getElementById('pop-lyrics');
  const titleInput = document.getElementById('pop-title');
  const excludeInput = document.getElementById('pop-exclude');
  const weirdnessSlider = document.getElementById('pop-weirdness');
  const influenceSlider = document.getElementById('pop-influence');
  const weirdnessVal = document.getElementById('pop-weirdness-val');
  const influenceVal = document.getElementById('pop-influence-val');
  const instBtn = document.getElementById('pop-btn-inst');
  const statusEl = document.getElementById('pop-status');
  const fillBtn = document.getElementById('pop-btn-fill');
  const fillSettingsBtn = document.getElementById('pop-btn-fill-settings');

  const APP_GENRES = [
    "Dream Pop & Shoegaze", "TRAP & DRILL", "Cyber Funk", "Celtic (Irish & Scottish Folk)",
    "Darkwave & Coldwave", "Neo-City Pop", "Neo-Tokyo Lo-Fi", "J-Metal Idol Fusion",
    "POWER METAL", "ASIAN POP", "Vaporwave Metal", "DOOM METAL", "Trance Flamenco",
    "GOA TRANCE & PSYTRANCE", "Math Rock Goth Rock", "POST-PUNK", "ClassicalWave",
    "Glitch Hop IDM", "Ambient House / Chill-Out", "Indie Folk & Freakfolk",
    "SYNTHPOP & NEW ROMANTICS", "AFROBEATS & AFROPOP", "FUTURE NOIR DISCO", "HARDSTYLE"
  ];

  let allCreationsList = [];

  function loadPromptIntoForm(p, sourceLabel) {
    if (!p) return;
    const g1 = (p.genres && p.genres[0]) || (p.sunoStyleTag ? p.sunoStyleTag.split(',')[0]?.trim() : 'Dream Pop & Shoegaze');
    const g2 = (p.genres && p.genres[1]) || (p.sunoStyleTag ? p.sunoStyleTag.split(',')[1]?.trim() : 'TRAP & DRILL');

    const elG1 = document.getElementById('pop-g1');
    const elG2 = document.getElementById('pop-g2');
    if (elG1) elG1.value = g1 || '';
    if (elG2) elG2.value = g2 || '';

    styleInput.value = p.sunoStyleTag || p.styleTag || '';
    lyricsInput.value = p.lyricSnippet || p.lyrics || '';
    titleInput.value = p.title || 'Studio Fusion';

    if (p.excludeStyles) {
      excludeInput.value = p.excludeStyles;
    }
    if (p.vocalGender) {
      selectedGender = p.vocalGender;
      document.querySelectorAll('.sf-gender-btn').forEach(x => {
        x.classList.toggle('active', x.getAttribute('data-gender') === selectedGender);
      });
    }
    if (p.weirdness !== undefined) {
      weirdnessSlider.value = p.weirdness;
      weirdnessVal.textContent = p.weirdness + '%';
    }
    if (p.styleInfluence !== undefined) {
      influenceSlider.value = p.styleInfluence;
      influenceVal.textContent = p.styleInfluence + '%';
    }
    if (p.isInstrumental !== undefined) {
      isInstrumental = !!p.isInstrumental;
      instBtn.textContent = 'Instrumental: ' + (isInstrumental ? 'ON' : 'OFF');
      instBtn.style.color = isInstrumental ? '#34d399' : '#a1a1aa';
    }

    const label = document.getElementById('pop-loaded-status');
    if (label) {
      label.textContent = '● ' + (sourceLabel ? sourceLabel + ': ' : 'Active: ') + (p.title || 'Studio Song');
      label.style.color = '#34d399';
    }
  }

  function updateCreationsDropdown(creations, activeTitle) {
    const sel = document.getElementById('pop-creations-dropdown');
    if (!sel) return;
    sel.innerHTML = '<option value="">📂 Select from My Studio Creations (' + (creations ? creations.length : 0) + ')...</option>';
    if (creations && creations.length > 0) {
      creations.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = idx.toString();
        const genreStr = item.genres ? item.genres.slice(0, 2).join(' × ') : 'Fusion';
        opt.textContent = (item.title || 'Untitled') + ' (' + genreStr + ')';
        if (item.title === activeTitle) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  }

  // Load latest creation on startup
  chrome.storage?.local?.get(['sf_latest_creation', 'sf_creations_list'], (res) => {
    allCreationsList = res?.sf_creations_list || [];
    if (res?.sf_latest_creation) {
      loadPromptIntoForm(res.sf_latest_creation, 'Studio');
      updateCreationsDropdown(allCreationsList, res.sf_latest_creation.title);
    } else {
      syncFromAppTabs();
    }
  });

  // Dropdown selection
  const creationsDropdown = document.getElementById('pop-creations-dropdown');
  if (creationsDropdown) {
    creationsDropdown.onchange = (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx) && allCreationsList[idx]) {
        loadPromptIntoForm(allCreationsList[idx], 'Loaded');
        statusEl.textContent = '✓ Loaded: ' + allCreationsList[idx].title;
      }
    };
  }

  // Sync from Web App button
  async function syncFromAppTabs() {
    const status = document.getElementById('pop-loaded-status');
    if (status) status.textContent = '🔄 Checking open web app tabs...';
    try {
      const tabs = await chrome.tabs.query({});
      let foundTab = null;
      for (const t of tabs) {
        if (t.url && (t.url.includes('localhost') || t.url.includes('127.0.0.1') || t.url.includes('ais-') || t.title?.includes('Suno Fusion'))) {
          foundTab = t;
          break;
        }
      }

      if (foundTab?.id) {
        chrome.tabs.sendMessage(foundTab.id, { action: 'GET_APP_CREATION' }, (resp) => {
          if (resp?.prompt) {
            loadPromptIntoForm(resp.prompt, 'Synced from App');
            allCreationsList = [resp.prompt, ...allCreationsList.filter(x => x.title !== resp.prompt.title)].slice(0, 25);
            chrome.storage?.local?.set({ sf_latest_creation: resp.prompt, sf_creations_list: allCreationsList });
            updateCreationsDropdown(allCreationsList, resp.prompt.title);
            statusEl.textContent = '✓ Synced "' + resp.prompt.title + '" from Web App!';
          } else {
            chrome.scripting.executeScript({
              target: { tabId: foundTab.id },
              func: () => localStorage.getItem('sf_latest_creation')
            }, (results) => {
              if (results && results[0]?.result) {
                try {
                  const p = JSON.parse(results[0].result);
                  loadPromptIntoForm(p, 'Synced from App');
                  allCreationsList = [p, ...allCreationsList.filter(x => x.title !== p.title)].slice(0, 25);
                  chrome.storage?.local?.set({ sf_latest_creation: p, sf_creations_list: allCreationsList });
                  updateCreationsDropdown(allCreationsList, p.title);
                  statusEl.textContent = '✓ Synced "' + p.title + '" from Web App!';
                } catch(e) {}
              } else {
                if (status) status.textContent = '● Studio ready. Roll new or paste below!';
              }
            });
          }
        });
      } else {
        if (status) status.textContent = '● Web App not detected. Loaded local template.';
      }
    } catch (err) {
      console.warn('Sync failed:', err);
    }
  }

  const syncAppBtn = document.getElementById('pop-btn-sync-app');
  if (syncAppBtn) syncAppBtn.onclick = syncFromAppTabs;

  // Roll fresh studio clash inside popup
  const rollPopupBtn = document.getElementById('pop-btn-roll-popup');
  if (rollPopupBtn) {
    rollPopupBtn.onclick = () => {
      const pick = () => APP_GENRES[Math.floor(Math.random() * APP_GENRES.length)];
      const g1 = pick();
      let g2 = pick();
      while (g2 === g1) g2 = pick();
      const bpm = Math.floor(Math.random() * (175 - 85) + 85);
      const titlePrefixes = ['Neon', 'Solaris', 'Midnight', 'Velvet', 'Quantum', 'Obsidian', 'Cyber', 'Aether'];
      const titleSuffixes = ['Pulse', 'Drift', 'Overdrive', 'Horizon', 'Echo', 'Velocity', 'Mirage'];
      const title = titlePrefixes[Math.floor(Math.random() * titlePrefixes.length)] + ' ' +
                    titleSuffixes[Math.floor(Math.random() * titleSuffixes.length)];

      const newCreation = {
        title,
        genres: [g1, g2],
        sunoStyleTag: g1 + ', ' + g2 + ', ' + bpm + ' BPM, ' + selectedGender.toLowerCase() + ' vocals, Roland Juno-106, 808 sub bass',
        lyricSnippet: '[Intro]\\n[Verse 1]\\nNeon reflections cutting through the night\\nFading echoes dancing in the light\\n\\n[Chorus]\\nCatch the surge, let the rhythm rise\\n\\n[Outro]',
        excludeStyles: excludeInput.value || 'screaming, harsh distortion, muddy bass, generic pop EDM',
        vocalGender: selectedGender,
        weirdness: parseInt(weirdnessSlider.value, 10),
        styleInfluence: parseInt(influenceSlider.value, 10),
        isInstrumental
      };

      loadPromptIntoForm(newCreation, '🎲 Rolled New');
      allCreationsList = [newCreation, ...allCreationsList].slice(0, 25);
      chrome.storage?.local?.set({ sf_latest_creation: newCreation, sf_creations_list: allCreationsList });
      updateCreationsDropdown(allCreationsList, newCreation.title);
      statusEl.textContent = '🎲 Rolled fresh clash: ' + title;
    };
  }

  // Update style button
  const rebuildStyleBtn = document.getElementById('pop-btn-rebuild-style');
  if (rebuildStyleBtn) {
    rebuildStyleBtn.onclick = () => {
      const g1 = document.getElementById('pop-g1').value.trim();
      const g2 = document.getElementById('pop-g2').value.trim();
      const vocalStr = isInstrumental ? 'instrumental' : (selectedGender.toLowerCase() + ' vocals');
      styleInput.value = [g1, g2].filter(Boolean).join(', ') + ', 140 BPM, ' + vocalStr + ', 808 sub bass, Roland Juno-106';
      statusEl.textContent = '✨ Style tag updated from genres!';
    };
  }

  // Clear lyrics
  const clearLyricsBtn = document.getElementById('pop-btn-clear-lyrics');
  if (clearLyricsBtn) {
    clearLyricsBtn.onclick = () => {
      lyricsInput.value = '';
      statusEl.textContent = 'Lyrics cleared';
    };
  }

  // Paste prompt
  const pastePromptBtn = document.getElementById('pop-btn-paste-prompt');
  if (pastePromptBtn) {
    pastePromptBtn.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          if (text.trim().startsWith('{')) {
            const parsed = JSON.parse(text);
            loadPromptIntoForm(parsed, 'Pasted');
            statusEl.textContent = '✓ Pasted studio creation!';
          } else {
            styleInput.value = text;
            statusEl.textContent = '✓ Pasted text into Style tag!';
          }
        }
      } catch (e) {
        const p = prompt('Paste your Suno Style prompt or JSON:');
        if (p) {
          styleInput.value = p;
          statusEl.textContent = '✓ Updated Style tag!';
        }
      }
    };
  }

  weirdnessSlider.oninput = () => weirdnessVal.textContent = weirdnessSlider.value + '%';
  influenceSlider.oninput = () => influenceVal.textContent = influenceSlider.value + '%';

  instBtn.onclick = () => {
    isInstrumental = !isInstrumental;
    instBtn.textContent = 'Instrumental: ' + (isInstrumental ? 'ON' : 'OFF');
    instBtn.style.color = isInstrumental ? '#34d399' : '#a1a1aa';
  };

  document.querySelectorAll('.sf-gender-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.sf-gender-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      selectedGender = b.getAttribute('data-gender');
    };
  });

  // Tab switching
  document.querySelectorAll('.sf-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.sf-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      ['create', 'settings', 'metatags'].forEach(t => {
        const el = document.getElementById('pop-tab-' + t);
        if (el) el.classList.toggle('sf-hidden', t !== tab);
      });
    };
  });

  async function getSunoTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function sendAutoFill() {
    const tab = await getSunoTab();
    if (!tab?.id) return;
    if (!tab.url || !tab.url.includes('suno.com')) {
      statusEl.textContent = 'Opening suno.com/create...';
      chrome.tabs.create({ url: 'https://suno.com/create' });
      return;
    }

    statusEl.textContent = 'Sending to Suno...';
    chrome.tabs.sendMessage(tab.id, {
      action: 'AUTOFILL',
      prompt: {
        styleTag: styleInput.value.trim(),
        lyricSnippet: lyricsInput.value.trim(),
        title: titleInput.value.trim(),
        excludeStyles: excludeInput.value.trim(),
        vocalGender: selectedGender,
        weirdness: parseInt(weirdnessSlider.value, 10),
        styleInfluence: parseInt(influenceSlider.value, 10),
        isInstrumental
      }
    }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Refresh Suno tab and retry.';
      } else {
        statusEl.textContent = '✓ Auto-Filled Suno form & settings!';
      }
    });
  }

  fillBtn.onclick = sendAutoFill;
  fillSettingsBtn.onclick = sendAutoFill;

  document.querySelectorAll('.sf-metatag-btn').forEach(tag => {
    tag.onclick = () => {
      lyricsInput.value += '\\n' + tag.getAttribute('data-tag') + '\\n';
    };
  });
});
`;

  const backgroundJs = `chrome.runtime.onInstalled.addListener(() => {
  console.log('[Suno Fusion v2.0] Extension installed successfully');
});
`;

  const readmeMd = `# Suno Fusion Studio & AutoFill Extension (v2.0)

## Features Included:
- **🔀 Prompt Studio:** 374-genre collision generator, BPM slider with real audio metronome, instruments rig chips.
- **⚙️ Suno "More Options" Settings:** Exclude styles negative prompt, Vocal Gender (Male/Female/Duet), Weirdness & Style Influence sliders, Variety, Duration, Max Mode.
- **🏷️ Structure Metatags:** Quick-insert buttons for [Intro], [Verse], [Chorus], [Drop], [Guitar Solo], [Outro].
- **🎯 Input Diagnostics:** Resilient 6-layer input detection + click-to-pick manual box selectors.
- **⚡ 1-Click AutoFill:** Injects everything into Suno with glowing purple visual confirmation.
`;

  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('content.js', contentJs);
  zip.file('bridge.js', bridgeJs);
  zip.file('content.css', contentCss);
  zip.file('popup.html', popupHtml);
  zip.file('popup.js', popupJs);
  zip.file('background.js', backgroundJs);
  zip.file('README.md', readmeMd);

  const iconsFolder = zip.folder('icons');
  if (iconsFolder) {
    iconsFolder.file('icon16.png', iconBase64, { base64: true });
    iconsFolder.file('icon48.png', iconBase64, { base64: true });
    iconsFolder.file('icon128.png', iconBase64, { base64: true });
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  // 1. Write to public/suno-fusion-extension.zip
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'suno-fusion-extension.zip'), buffer);

  // 2. Extract to /extension folder
  const extensionDir = path.resolve('extension');
  if (!fs.existsSync(extensionDir)) fs.mkdirSync(extensionDir, { recursive: true });
  if (!fs.existsSync(path.join(extensionDir, 'icons'))) fs.mkdirSync(path.join(extensionDir, 'icons'), { recursive: true });

  fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(extensionDir, 'content.js'), contentJs);
  fs.writeFileSync(path.join(extensionDir, 'bridge.js'), bridgeJs);
  fs.writeFileSync(path.join(extensionDir, 'content.css'), contentCss);
  fs.writeFileSync(path.join(extensionDir, 'popup.html'), popupHtml);
  fs.writeFileSync(path.join(extensionDir, 'popup.js'), popupJs);
  fs.writeFileSync(path.join(extensionDir, 'background.js'), backgroundJs);
  fs.writeFileSync(path.join(extensionDir, 'README.md'), readmeMd);
  fs.writeFileSync(path.join(extensionDir, 'icons', 'icon16.png'), Buffer.from(iconBase64, 'base64'));
  fs.writeFileSync(path.join(extensionDir, 'icons', 'icon48.png'), Buffer.from(iconBase64, 'base64'));
  fs.writeFileSync(path.join(extensionDir, 'icons', 'icon128.png'), Buffer.from(iconBase64, 'base64'));

  // 3. Update root manifest.json
  fs.writeFileSync(path.resolve('manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('Successfully updated Suno Fusion v2.1 Extension in public/suno-fusion-extension.zip and /extension');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
