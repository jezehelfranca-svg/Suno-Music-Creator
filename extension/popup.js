const designGroove = function designGroove(seed = {}) {
  const genres = (seed.genres || []).filter(Boolean);
  const instruments = (seed.instruments || []).filter(Boolean);
  const firstGenre = (genres[0] || '').toLowerCase();
  const allGenres = genres.join(' ').toLowerCase();
  const has = (pattern, text) => pattern.test(text);
  const families = [
    ['afro', /afro|highlife|amapiano|salsa|timba|samba|cumbia|reggaet[oó]n|bossa|latin|rumba/],
    ['hiphop', /trap|drill|hip.?hop|rap|boom bap|trip hop|glitch hop/],
    ['jazz', /jazz|swing|bebop|blues/],
    ['funk', /funk|disco|city pop|r&b|rhythm 'n' blues|soul/],
    ['rock', /rock|metal|grunge|sludge|punk|shoegaze|djent|hardcore/],
    ['ambient', /ambient|classical|minimalism|new age|drone|orchestral/],
    ['folk', /folk|country|bluegrass|celtic|acoustic|americana/],
    ['club', /house|techno|trance|edm|dance|electro|garage|dubstep|jungle|drum.?n.?bass|breakbeat|synthwave/]
  ];
  const family = families.find(([, pattern]) => has(pattern, firstGenre))?.[0]
    || families.find(([, pattern]) => has(pattern, allGenres))?.[0] || 'open';
  const slow = Number(seed.bpm) > 0 && Number(seed.bpm) < 95;

  const find = pattern => instruments.find(name => has(pattern, name.toLowerCase()));
  const low = find(/\b(?:bass|sub|808|contrabass|double bass|upright bass|baritone guitar|low synth|moog)\b/);
  const drums = find(/drum|kick|snare|tom|percussion|conga|tabla|riq|djembe|hi.?hat|shaker|caj[oó]n|breakbeat/);
  const guitar = find(/guitar|banjo|mandolin|oud|lute/);
  const keys = find(/piano|rhodes|keys|keyboard|organ|clav|juno|synth|arpeggiator/);
  const other = instruments.find(name => name !== low && name !== drums);
  const anchor = low || guitar || keys || drums || other || 'the low end';
  const pulse = drums || (instruments.length ? 'the rhythmic accents' : 'the drums');
  const voice = instruments.find(name => name !== anchor && name !== drums && name !== low);
  const oddMeter = seed.timeSig && seed.timeSig !== '4/4'
    ? `Phrase the accents in ${seed.timeSig}; leave a gap at the turn of the meter.` : '';
  const choose = variants => variants[Math.min(variants.length - 1, Math.floor((seed.rng || Math.random)() * variants.length))];

  const patterns = {
    afro: [
      `${anchor} answers ${pulse} in the open spaces between syncopated accents; let the percussion finish each phrase.`,
      `Give ${anchor} a short repeating figure while ${pulse} shifts the accents around it; leave a rest before the response.`
    ],
    hiphop: [
      `${anchor} lands after the main drum hit, then cuts off early so ${pulse} and the next downbeat stay clear.`,
      `Alternate held low notes from ${anchor} with short pickups; keep a pocket of silence for ${pulse}.`
    ],
    jazz: [
      `Let ${anchor} outline the changes with varied note lengths while ${pulse} answers in the spaces between phrases.`,
      `Keep ${anchor} conversational with ${pulse}: one longer grounding note, then a brief pickup before the next chord.`
    ],
    funk: [
      `${anchor} plays clipped offbeat answers to ${pulse}; use short rests and occasional ghosted pickups instead of filling every subdivision.`,
      `Set a repeating low figure on ${anchor}; move its final accent around ${pulse} and stop cleanly before the next phrase.`
    ],
    rock: [
      `${anchor} holds the weight under ${pulse}; offset the riff accents and cut a brief hole before the backbeat.`,
      `Lock ${anchor} to the heavy hits from ${pulse}, then break the riff with a short rest before it returns.`
    ],
    ambient: [
      `Let ${anchor} sustain a low motif, with measured silences that give the next phrase room to enter.`,
      `Use sparse, unequal pulses from ${anchor}; allow their tails to decay before the next accent.`
    ],
    folk: [
      `Keep ${anchor} as a repeating acoustic pulse, varied by a short pickup and a breath at each phrase end.`,
      `Let ${anchor} mark the downbeats while ${pulse} answers lightly between them; leave space for the melody.`
    ],
    club: [
      `Place short offbeat notes from ${anchor} between the hits of ${pulse}; vary note lengths and leave one 16th-note pocket empty.`,
      `Use syncopated 16th-note pickups from ${anchor}, alternating with ${pulse} so the downbeat stays uncluttered.`
    ],
    open: [
      `Give ${anchor} a recurring motif that trades accents with ${pulse}; let short rests define the groove.`,
      `Vary the length of ${anchor}'s repeated notes and leave a deliberate gap before ${pulse} answers.`
    ]
  };
  const pattern = slow && family === 'rock'
    ? `${anchor} sustains the low riff against ${pulse} at a half-time pace; leave a full beat of air before the next heavy accent.`
    : slow && family === 'club'
      ? `${anchor} plays sparse offbeat notes between ${pulse}; let each note decay before the next pickup.`
      : choose(patterns[family]);
  const response = voice ? `Give ${voice} a response in the space after the anchor phrase.` : '';
  const synthLow = low && has(/808|sub|synth|moog|wavetable|sine|saw/, low.toLowerCase());
  const production = synthLow
    ? `Keep ${low}'s deepest layer centered and clean; put saturation or stereo width only on its upper harmonics.`
    : low
      ? `Keep ${low} focused in the center, with its attack distinct from ${pulse}.`
      : guitar && family === 'rock'
        ? `Keep ${guitar}'s low attack distinct from ${pulse}; place ambience behind the hits rather than washing out their edges.`
      : family === 'club' || family === 'hiphop'
        ? `Keep the lowest frequencies centered; put grit and width above them without masking ${pulse}.`
        : `Preserve the attack and decay of the named instruments; leave low-frequency space for ${pulse}.`;
  const tag = ({
    afro: 'interlocking syncopation and rests', hiphop: 'low-note pickups with drum gaps',
    jazz: 'conversational low-end phrasing', funk: 'clipped offbeats and ghost pickups',
    rock: 'weighty riffs with backbeat gaps', ambient: 'sparse pulses and long decays',
    folk: 'acoustic pulse with phrase-end rests', club: 'offbeat 16th-note gaps',
    open: 'interlocking accents and rests'
  })[family];
  return { family, anchor, pulse, description: [pattern, response, oddMeter].filter(Boolean).join(' '), production, tag };
};
document.addEventListener('DOMContentLoaded', () => {
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

  function popupSeed() {
    return {
      genres: [document.getElementById('pop-g1').value.trim(), document.getElementById('pop-g2').value.trim()].filter(Boolean),
      instruments: document.getElementById('pop-instruments').value.split(',').map(x => x.trim()).filter(Boolean),
      bpm: document.getElementById('pop-bpm').value || '140',
      timeSig: document.getElementById('pop-timesig').value.trim() || '4/4'
    };
  }

  function buildPopupStyle(seed) {
    const groove = designGroove(seed);
    return [
      seed.genres.join(' × '), seed.bpm + ' BPM (' + seed.timeSig + ')', ...seed.instruments,
      groove.description, groove.production,
      isInstrumental || selectedGender === 'None' ? 'instrumental' : selectedGender.toLowerCase() + ' vocals'
    ].filter(Boolean).join(', ');
  }

  function loadPromptIntoForm(p, sourceLabel) {
    if (!p) return;
    const g1 = (p.genres && p.genres[0]) || (p.sunoStyleTag ? p.sunoStyleTag.split(',')[0]?.trim() : 'Dream Pop & Shoegaze');
    const g2 = (p.genres && p.genres[1]) || (p.sunoStyleTag ? p.sunoStyleTag.split(',')[1]?.trim() : 'TRAP & DRILL');

    const elG1 = document.getElementById('pop-g1');
    const elG2 = document.getElementById('pop-g2');
    if (elG1) elG1.value = g1 || '';
    if (elG2) elG2.value = g2 || '';
    document.getElementById('pop-bpm').value = p.minBpm || 140;
    document.getElementById('pop-timesig').value = p.timeSig || '4/4';
    document.getElementById('pop-instruments').value = (p.selectedInstruments || []).join(', ');

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
      styleInput.value = buildPopupStyle(popupSeed());
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
      document.getElementById('pop-g1').value = g1;
      document.getElementById('pop-g2').value = g2;
      document.getElementById('pop-bpm').value = bpm;
      const seed = popupSeed();
      const titlePrefixes = ['Neon', 'Solaris', 'Midnight', 'Velvet', 'Quantum', 'Obsidian', 'Cyber', 'Aether'];
      const titleSuffixes = ['Pulse', 'Drift', 'Overdrive', 'Horizon', 'Echo', 'Velocity', 'Mirage'];
      const title = titlePrefixes[Math.floor(Math.random() * titlePrefixes.length)] + ' ' +
                    titleSuffixes[Math.floor(Math.random() * titleSuffixes.length)];

      const newCreation = {
        title,
        genres: [g1, g2],
        selectedInstruments: seed.instruments,
        timeSig: seed.timeSig,
        minBpm: bpm,
        sunoStyleTag: buildPopupStyle(seed),
        lyricSnippet: '[Intro]\n[Verse 1]\nNeon reflections cutting through the night\nFading echoes dancing in the light\n\n[Chorus]\nCatch the surge, let the rhythm rise\n\n[Outro]',
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
      styleInput.value = buildPopupStyle(popupSeed());
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
      lyricsInput.value += '\n' + tag.getAttribute('data-tag') + '\n';
    };
  });
});
