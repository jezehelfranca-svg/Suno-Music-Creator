// Suno Fusion v2.0 - Studio & AutoFill Engine for suno.com
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
        showToast(`✓ Suno Auto-Filled! ${filledCount} boxes & settings updated.`, 'success');
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
    showToast(`🎯 Click directly on Suno's ${targetBoxType.toUpperCase()} box to select it!`, 'warn', 6000);

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
    const insertion = (start > 0 && current[start - 1] !== '\n' ? '\n\n' : '') + tag + '\n';
    const nextValue = current.slice(0, start) + insertion + current.slice(end);

    setReactInputValue(lyricsTextarea, nextValue);
    showToast(`Inserted ${tag}`, 'success');
  }

  // Update Status Badges in HUD
  function updateHudStatus() {
    const statusContainer = document.getElementById('sf-hud-status');
    if (!statusContainer) return;

    const { styleTextarea, lyricsTextarea, titleInput, excludeInput } = findSunoInputs();
    statusContainer.innerHTML = `
      <div style="display:flex;gap:6px;font-size:10px;font-family:monospace;flex-wrap:wrap;">
        <span style="color:${styleTextarea ? '#34d399' : '#f87171'}">${styleTextarea ? '● Style OK' : '○ Style Missing'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:${lyricsTextarea ? '#34d399' : '#f87171'}">${lyricsTextarea ? '● Lyrics OK' : '○ Lyrics Missing'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:${titleInput ? '#34d399' : '#a1a1aa'}">${titleInput ? '● Title OK' : '○ Title (Opt)'}</span>
        <span style="color:#52525b">•</span>
        <span style="color:${excludeInput ? '#34d399' : '#a1a1aa'}">${excludeInput ? '● Exclude OK' : '○ Exclude (Opt)'}</span>
      </div>
    `;
  }

  // Built-in list of genres & instruments for prompt generation directly on Suno
  const APP_GENRES = ["Alternative Dance Rock","Alternative Grunge","Astral Jazz","Chillstep Ambient Dub","ChillwaveFi","City Pop Fusion","City Pop Noir","ClassicalWave","Cosmic Disco","Cyber Funk","Cyber Soul","Disco Funk Trance Rhodes","Dream Pop Trap","Electro Swing Fusion","Electro Swing Metal","Emo Metal Baroque","Experimental K-Pop","Funk Celtic","Funk Trance","Future Bass Techno","Future City Pop","Future Garage K-Pop EDM","Future Garage Techno","Future Garage Vaporwave","Future Jazz Fusion","Future R&B","Futuristic Blues","Galactic Reggae","Ghibli Jazz","Glitch Hop IDM","Goth Emo Metal","Groovy Bass Metal","Heavy Metal Synth Pop Death Metal","Heavy Metal Synth Pop New Wave","Hitech Psytrance","Indie Electronica","Instrumental Guitar Virtuoso","J-Metal Idol Fusion","Jazz Fusion Laidback","Kawaii EDM Math Rock Metal","Kawaii Metal","Kawaii Metal Math Rock","Kawaii Rock EDM Metal","Latin Trap Crossover","Lofi Hip Hop Acoustic","Lofi Hip Hop Classical","Mall Vaporwave Retrowave","Math Rock Ambient","Math Rock Blues Fusion","Math Rock Double Bass Melody","Math Rock Funk Fusion","Math Rock Goth Rock","Math Rock Piano Virtuoso","Math Rock Reggae Fusion","Math Rock Rhodes Virtuoso","Math Rock Vaporwave","Mellow Blues Funk","Mellow Funk","Mellow Laidback Jazz","Mellow Slow Vaporwave Metal","Melodic EDM Trance Metal","Metalcore Rap Industrial Metal","Neo-City Pop","Neo-Soultronica","Neo-Tokyo","Neo-Tokyo Lo-Fi","Neon Noir","New Wave Synth Pop","Nu Disco House","Post-Punk Wave","Progressive Rock Funk Trance","Psychedelic 70s Trance","Psychedelic Rock Gypsy Jazz","Psychedelic Trip Hop","Punk Waltz","R&B Metal Fusion","Rap Funk Metal Trance","Rap Funk Trance","Retro Rockets","Retrowave Synth Pop","Rural Pop","Slow Sensual Blues Guitar","Slow Sensual Math Rock Blues","Solar Swing","Space Jazz","Surf Rock Jazz Folk Rock","Synth Groove Metal","Time Traveler's Swing","Trance Flamenco","Vaporsoul","Vaporwave City Pop","Vaporwave EDM","Vaporwave K-Pop","Vaporwave Metal","Vaporwave Ska Pop","Vaporwave Synth Funk","Vaporwave Synth Punk","Voyager Vibes","Ambient","Ambient House / Chill-Out","New Age","Cool & West Coast Jazz","Smooth Jazz","Nordic Jazz","Country / Folk Blues","Boogie Woogie / Piano Blues","Vaudeville / Classic Blues","Neo / Nu Soul","Memphis / Deep / Southern Soul","Philly Soul","American & British Folk Revival","Singer/Songwriter","Indie Folk & Freakfolk","Dream Pop & Shoegaze","Indie Pop","Jangle Pop / Indie Rock","Soft Rock / Adult Contemporary","Heartland Rock & A.O.R.","Post-Britpop","Trip Hop","Broken Beats","Ambient Breaks & Illbient","Traditional Gospel","(Negro) Spirituals & Worksongs","Modern Gospel","Progressive, Art- & Symphonic Rock","Minimalism","Third Stream & Modal Jazz","Bolero","Bossa Nova","Trova & Feeling","Dark Ambient / Dark Industrial","Darkwave & Coldwave","Gothic Rock & Deathrock","Progressive & Outlaw","Americana / Alternative","Classic Country / Hillbilly","ROCKABILLY & ROCK 'N' ROLL","SKIFFLE (REVIVAL)","SURF ROCK","GARAGE ROCK","(MERSEY)BEAT / BRITISH INVASION","FOLK ROCK","PSY / ACID ROCK & PSYCHEDELIA","HARD ROCK","SOUTHERN ROCK","PUB ROCK & PROTO PUNK","PUNK ROCK","NO WAVE","POST-PUNK","NEW WAVE","SYNTHPOP & NEW ROMANTICS","GLAM / GLITTER / SHOCK ROCK","HORROR PUNK & PSYCHOBILLY","ANARCHO-PUNK, CRUST, & D-BEAT","ORIGINAL HARDCORE (PUNK)","CROSSOVER THRASH","GRINDCORE","MATH ROCK & MATHCORE","POST-HARDCORE, EMO & SCREAMO","GRUNGE","NOISE ROCK","RAP ROCK / FUNK METAL","POST-ROCK","POST-GRUNGE","SKATE PUNK & POP PUNK","ALTERNATIVE ROCK / INDIE II","SYNTHCORE & CRUNKCORE","METALCORE / NWOAHM","EMO ROCK","GARAGE & POST-PUNK REVIVAL / NU RAWK","INDIETRONICA & CHILLWAVE","NEW / NU / POST-PROG","DANCE-PUNK & NU RAVE","BRILL BUILDING POP & CROONERS","(EARLY) POP ROCK & POWER POP","BUBBLEGUM & TEENYBOP","BRITPOP","DANCE POP","HI-NRG / EURODISCO","ELECTROCLASH","DISCO POP / POST-DISCO","ASIAN POP","SCHLAGER","ELECTROPOP","NWOBHM","CLASSIC METAL","THRASH METAL","GLAM / HAIR / POP METAL","DOOM METAL","PROGRESSIVE METAL","EXTREME METAL","DEATH METAL","BLACK METAL","POWER METAL","SYMPHONIC & GOTHIC METAL","NU METAL & RAP METAL","STONER & SLUDGE METAL","(AVANT-GARDE) INDUSTRIAL","KRAUTROCK","NOISE MUSIC","INDUSTRIAL ROCK / METAL","MINIMAL WAVE / SYNTH & INDUSTRIAL (REVIVAL)","ELECTRONIC BODY MUSIC (EBM)","FUTUREPOP","ELECTRO-INDUSTRIAL / AGGREPPO","WESTERN SWING","BLUEGRASS","HONKY TONK / HARDCORE","BAKERSFIELD","NASHVILLE / COUNTRYPOLITAN","URBAN COUNTRY","CONTEMPORARY / NEOTRADITIONIONAL","COUNTRY POP & ROCK","RHYTHM 'N' BLUES","DOO WOP","EARLY FUNK & P-FUNK","CHICAGO & DETROIT SOUL (MOTOWN)","GO-GO","DISCO","BOOGIE / ELECTROFUNK","NEW JACK SWING / SWINGBEAT","DEEP FUNK & NU FUNK","URBAN SOUL / POP (NU R&B I)","NU DISCO & FUNKTRONNICA","RAGTIME & STRIDE","CHICAGO / CITY / URBAN BLUES","JUMP BLUES","(ELECTRIC) TEXAS BLUES","WEST COAST BLUES","LOUISIANA / SWAMP BLUES","HILL COUNTRY & TRANCE BLUES","BRITISH BLUES & BLUES ROCK","SOUL BLUES (SOUTHERN SOUL II)","TEXAS BLUES ROCK & MODERN ELECTRIC","RELIPOP & -ROCK / CCM","NEW ORLEANS & DIXIELAND JAZZ","CHICAGO JAZZ","SWING / BIG BAND","BEBOP","HARD BOP","SOUL JAZZ / JAZZ-FUNK","FREE JAZZ / AVANT-GARDE","FUSION / JAZZ ROCK","ACID JAZZ / JAZZDANCE","ELECTRO SWING","NU JAZZ / ELECTRO JAZZ","NEW ORLEANS & DIXIELAND REVIVALS","OLD SKOOL RAP PIONEERS","GOLDEN AGE RAP (& HARDCORE RAP)","(WEST COAST) GANGSTA RAP","MIAMI BASS & BOUNCE","JAZZ RAP / NATIVE TONGUE","EAST COAST GANGSTA RAP","TRAP & DRILL","(DIRTY) SOUTH RAP, CRUNK & SNAP","PROGRESSIVE / NU SKOOL RAP","GLITCH HOP & WONKY","URBAN BREAKS (NU R & B II)","MENTO","SKA","(ROOTS) REGGAE","ROCKSTEADY","DUB","RAGGA","SKA PUNK & SKACORE","LOVERS ROCK & UK REGGAE","DANCEHALL","REGGAE FUSION & BHANGRAMUFFIN","REGGAETÓN & LATIN RAP","CLASSIC & ACID TRANCE","GOA TRANCE & PSYTRANCE","PROGRESSIVE TRANCE","EUROTRANCE & VOCAL","IBIZA & DREAM TRANCE / HOUSE","UPLIFTING / EPIC TRANCE","HARDTRANCE","NEO-TRANCE","TECH TRANCE","CHICAGO HOUSE & GARAGE HOUSE","ACID HOUSE","HIP HOUSE & EURODANCE","DEEP HOUSE","PROGRESSIVE HOUSE","FRENCH & FUNKY HOUSE","MICROHOUSE / MINIMAL HOUSE","GHETTO HOUSE, GHETTPOTECH & JUKE","ELECTRO HOUSE & DUTCH HOUSE","FIDGET HOUSE & COMPLEXTRO","NRG, HARD NRG & (UK) HARD HOUSE","MOOMBAHTON","DETROIT TECHNO","MINIMAL TECHNO","(FREE-)TEK(K)NO","INDUSTRIAL TECHNO & SCHRANZ","TECH HOUSE","AMBIENT TECHNO & IDM","HARDTECHNO","HARDCORE TECHNO / RAVE","NEW BEAT","NU STYLE / MAINSTREAM BREAKBEAT HARDCORE","GABBER","HARDSTYLE","HAPPY HARDCORE & BOUNCY TECHNO","DIGITAL HARDCORE & BREAKCORE","TRANCECORE & ACIDCORE","SPEED- & TERRORCORE","OLD SKOOL JUNGLE & DRUM 'N' BASS","INTELLIGENT & JAZZSTEP","JUMP UP","DARKCORE & DARKSTEP","HARDSTEP & TECHSTEP","NEUROFUNK","POST-DUBSTEP","DUBSTEP","LIQUID FUNK","FUTURE BASS & FUTURE GARAGE","BREAKBEAT HARDCORE (RAVE II)","FREESTYLE & BREAKDANCE","FLORIDA BREAKS","NU SKOOL BREAKS","CHEMICAL BREAKS & BIG BEAT","UK GARAGE (2-STEP & SPEED)","ELECTRO","BREAKBEAT GARAGE & GRIME","BASSLINE & UK FUNKY","EDM TRAP / TRAPSTEP","SYNTH / ELECTRONICA","MUSIQUE CONCRÈTE","BIT MUSIC (CHIPTUNE)","MUZAK / ELEVATOR MUSIC","LOUNGE / SPACE AGE POP","DIGITAL MINIMALISM / LOWERCASE","SYNTHWAVE & VAPORWAVE","GLITCH / CLICKS 'N' CUTS","CONTRADANZA","PUNTO & GUAJIRA","HABANERA","SON","DANZÓN","RUMBA","MAMBO & CHACHACHA","CUBOP","CANCION","NUEVA TROVA","SALSA","TIMBA","BAILE-FUNK","BOMBA, PLENA & MERENGUE","BOOGALOO","CALYPSO","CHACÓN","CUMBIA","HUAYNO & CHICA","MILONGA","SAMBA","SOCA & PUNTA","TANGO","TROPICALIA","ZOUK","TEXMEX & CONJUNTO","NORTEC","TECNOBREGA & -RUMBA","CHICANO ROCK","CHALGA","BALKAN BEAT / POP","BHANGRA","INDIAN RAGA","HIGHLIFE","AFROBEAT","WORLDBEAT","ARABIAN POP","POP RAÏ","CAJUN","Alternative Dance Rock","Alternative Grunge","Astral Jazz","Chillstep Ambient Dub","ChillwaveFi","City Pop Fusion","City Pop Noir","ClassicalWave","Cosmic Disco","Cyber Funk","Cyber Soul","Disco Funk Trance Rhodes","Dream Pop Trap","Electro Swing Fusion","Electro Swing Metal","Emo Metal Baroque","Experimental K-Pop","Funk Celtic","Funk Trance","Future Bass Techno","Future City Pop","Future Garage K-Pop EDM","Future Garage Techno","Future Garage Vaporwave","Future Jazz Fusion","Future R&B","Futuristic Blues","Galactic Reggae","Ghibli Jazz","Glitch Hop IDM","Goth Emo Metal","Groovy Bass Metal","Heavy Metal Synth Pop Death Metal","Heavy Metal Synth Pop New Wave","Hitech Psytrance","Indie Electronica","Instrumental Guitar Virtuoso","J-Metal Idol Fusion","Jazz Fusion Laidback","Kawaii EDM Math Rock Metal","Kawaii Metal","Kawaii Metal Math Rock","Kawaii Rock EDM Metal","Latin Trap Crossover","Lofi Hip Hop Acoustic","Lofi Hip Hop Classical","Mall Vaporwave Retrowave","Math Rock Ambient","Math Rock Blues Fusion","Math Rock Double Bass Melody","Math Rock Funk Fusion","Math Rock Goth Rock","Math Rock Piano Virtuoso","Math Rock Reggae Fusion","Math Rock Rhodes Virtuoso","Math Rock Vaporwave","Mellow Blues Funk","Mellow Funk","Mellow Laidback Jazz","Mellow Slow Vaporwave Metal","Melodic EDM Trance Metal","Metalcore Rap Industrial Metal","Neo-City Pop","Neo-Soultronica","Neo-Tokyo","Neo-Tokyo Lo-Fi","Neon Noir","New Wave Synth Pop","Nu Disco House","Post-Punk Wave","Progressive Rock Funk Trance","Psychedelic 70s Trance","Psychedelic Rock Gypsy Jazz","Psychedelic Trip Hop","Punk Waltz","R&B Metal Fusion","Rap Funk Metal Trance","Rap Funk Trance","Retro Rockets","Retrowave Synth Pop","Rural Pop","Slow Sensual Blues Guitar","Slow Sensual Math Rock Blues","Solar Swing","Space Jazz","Surf Rock Jazz Folk Rock","Synth Groove Metal","Time Traveler's Swing","Trance Flamenco","Vaporsoul","Vaporwave City Pop","Vaporwave EDM","Vaporwave K-Pop","Vaporwave Metal","Vaporwave Ska Pop","Vaporwave Synth Funk","Vaporwave Synth Punk","Voyager Vibes"];

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
    hud.innerHTML = `
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
    `;

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
      const style = `${genresPart}, ${bpm} BPM (${sig}), ${selectedGender.toLowerCase()} vocals, ${instStr}`;
      styleText.value = style;

      if (!lyricsText.value.trim()) {
        lyricsText.value = `[Intro]\n[Verse 1]\nNeon shadows drift across the floor\nVoices echo from an open door\n\n[Pre-Chorus]\nCounting down the seconds in the light\n\n[Chorus]\nElectric dreams ignite the endless night\n\n[Drop]\n\n[Outro]\n[Fade Out]`;
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
