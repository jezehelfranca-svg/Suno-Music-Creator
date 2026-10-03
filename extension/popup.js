// Suno Fusion v2.5 - Popup Studio & Extension Engine
// ── Groove Design (seed-aware, inlined from src/utils/grooveDesign.js) ──
function designGroove(seed = {}) {
  const genres = (seed.genres || []).filter(Boolean);
  const instruments = (seed.instruments || []).filter(Boolean);
  const firstGenre = (genres[0] || '').toLowerCase();
  const allGenres = genres.join(' ').toLowerCase();
  const has = (pattern, text) => pattern.test(text);
  const families = [
    ['afro', /afro|highlife|amapiano|salsa|timba|samba|cumbia|reggaet[o?]n|bossa|latin|rumba/],
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
  const drums = find(/drum|kick|snare|tom|percussion|conga|tabla|riq|djembe|hi.?hat|shaker|caj[o?]n|breakbeat/);
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
}

document.addEventListener('DOMContentLoaded', () => {
  // Data extraction with fallbacks
  const taxonomy = window.SUNO_TAXONOMY || {
    baseGenres: ["Dream Pop & Shoegaze", "TRAP & DRILL", "Cyber Funk", "Celtic Folk", "Darkwave"],
    coinedGenres: ["Alternative Dance Rock", "Chillstep Ambient Dub", "Cyber Funk", "Vaporwave Metal"],
    totalCount: 374,
    coinedCount: 98,
    pairsCount: 69751,
    combosCount: 8695624,
    isCoined: (g) => false
  };

  const curatedLibrary = window.SUNO_CURATED_LIBRARY || [];
  const creationsDB = window.SUNO_CREATIONS_DATABASE || [];
  const instrumentsData = window.SUNO_INSTRUMENTS || {
    categories: ["All", "Guitars & Amps", "Bass & Low-End", "Keys & Pianos", "Drums & Percussion", "Orchestral & Acoustic", "Synthesizers & Patches", "Synth Leads", "Synth Pads", "Synth Plucks", "Arps & Sequences", "Atmos, FX & Cinematic"],
    catalog: [],
    presets: [],
    list: ["Roland Juno-106", "Moog Minimoog", "808 Sub Bass", "Fender Stratocaster", "Acoustic Guitar", "Cello", "Grand Piano", "Saxophone", "TR-909 Drums", "Modular Synth"],
    categoryCounts: {}
  };
  const ALL_INSTRUMENTS = (instrumentsData.catalog && instrumentsData.catalog.length > 0)
    ? instrumentsData.catalog
    : instrumentsData.list.map(name => ({ name, category: 'All' }));
  const INSTRUMENT_PRESETS = instrumentsData.presets || [];
  const INSTRUMENT_CATEGORIES = instrumentsData.categories || ["All"];
  const creationsMap = new Map();
  creationsDB.forEach(item => { if (item.id) creationsMap.set(item.id, item); });

  const ALL_GENRES = taxonomy.baseGenres || [];
  const COINED_GENRES = taxonomy.coinedGenres || [];
  const coinedSet = new Set(COINED_GENRES);

  // App state
  let currentMode = 'pair'; // 'pair' (2-genres) or 'combo' (3-genres)
  let isInstrumental = false;
  let selectedGender = 'Female';
  let selectedInstruments = [];
  let audioCtx = null;
  let metronomeTimer = null;
  let isMetronomePlaying = false;
  let allCreationsList = [];

  // Library & Taxonomy filtering state
  let activeLibraryCategory = 'ALL';
  let activeTaxonomyFilter = 'all';

  // DOM Elements - Studio
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
  const fillCreateBtn = document.getElementById('pop-btn-fill-create');
  const fillSettingsBtn = document.getElementById('pop-btn-fill-settings');
  const fillCreateSettingsBtn = document.getElementById('pop-btn-fill-create-settings');
  const autoCreateToggle = document.getElementById('pop-toggle-auto-create');

  let autoCreateEnabled = false;
  chrome.storage?.local?.get(['sf_auto_create'], (res) => {
    if (res && res.sf_auto_create !== undefined) {
      autoCreateEnabled = !!res.sf_auto_create;
      if (autoCreateToggle) autoCreateToggle.checked = autoCreateEnabled;
    }
  });

  if (autoCreateToggle) {
    autoCreateToggle.onchange = () => {
      autoCreateEnabled = autoCreateToggle.checked;
      chrome.storage?.local?.set({ sf_auto_create: autoCreateEnabled });
      statusEl.textContent = autoCreateEnabled ? '✓ Auto-Create enabled on fill!' : 'Auto-Create disabled (fill only)';
    };
  }
  const bpmSlider = document.getElementById('pop-bpm-slider');
  const bpmVal = document.getElementById('pop-bpm-val');
  const metronomeBtn = document.getElementById('pop-btn-metronome');
  const styleLenEl = document.getElementById('pop-style-len');
  const loadedStatusEl = document.getElementById('pop-loaded-status');
  const creationsDropdown = document.getElementById('pop-creations-dropdown');

  // Genre Slots Elements
  const genre1Sel = document.getElementById('pop-genre-1');
  const genre2Sel = document.getElementById('pop-genre-2');
  const genre3Sel = document.getElementById('pop-genre-3');
  const genre3Container = document.getElementById('pop-genre-3-container');
  const modePairBtn = document.getElementById('pop-mode-pair');
  const modeComboBtn = document.getElementById('pop-mode-combo');
  const instCategorySel = document.getElementById('pop-inst-category');
  const instPresetSel = document.getElementById('pop-inst-preset');
  const instSelect = document.getElementById('pop-inst-select');
  const selectedInstContainer = document.getElementById('pop-selected-instruments');
  const clearInstBtn = document.getElementById('pop-btn-clear-inst');

  // ==========================================
  // 1. POPULATE GENRE SELECTORS (374 GENRES)
  // ==========================================
  function populateGenreSelect(selectEl, defaultVal) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    ALL_GENRES.forEach(genre => {
      const opt = document.createElement('option');
      opt.value = genre;
      const isCoined = coinedSet.has(genre);
      opt.textContent = (isCoined ? '✨ ' : '') + genre + (isCoined ? ' [Coined]' : '');
      if (genre === defaultVal) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  populateGenreSelect(genre1Sel, "Dream Pop & Shoegaze");
  populateGenreSelect(genre2Sel, "TRAP & DRILL");
  populateGenreSelect(genre3Sel, "Cyber Funk");

  // ==========================================
  // 2. INSTRUMENTS "DROP BOX" SELECTOR (1,561 INSTRUMENTS)
  // ==========================================
  function renderSelectedInstruments() {
    if (!selectedInstContainer) return;
    selectedInstContainer.innerHTML = '';

    if (selectedInstruments.length === 0) {
      const emptyNote = document.createElement('span');
      emptyNote.style.fontSize = '10px';
      emptyNote.style.color = '#71717a';
      emptyNote.style.fontStyle = 'italic';
      emptyNote.textContent = 'None selected (pick from drop box above)';
      selectedInstContainer.appendChild(emptyNote);
      return;
    }

    selectedInstruments.forEach(inst => {
      const tag = document.createElement('span');
      tag.className = 'sf-inst-tag';
      tag.innerHTML = `${inst} <span class="sf-inst-tag-del" title="Remove ${inst}">✕</span>`;

      const delBtn = tag.querySelector('.sf-inst-tag-del');
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation();
          selectedInstruments = selectedInstruments.filter(x => x !== inst);
          renderSelectedInstruments();
          updateStylePrompt();
        };
      }
      selectedInstContainer.appendChild(tag);
    });
  }

  function populateInstrumentCategories() {
    if (!instCategorySel) return;
    instCategorySel.innerHTML = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'All';
    allOpt.textContent = `All Categories (${ALL_INSTRUMENTS.length})`;
    instCategorySel.appendChild(allOpt);

    const counts = instrumentsData.categoryCounts || {};
    INSTRUMENT_CATEGORIES.forEach(cat => {
      if (cat === 'All') return;
      const count = counts[cat] || ALL_INSTRUMENTS.filter(i => i.category === cat).length;
      if (count > 0) {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = `${cat} (${count})`;
        instCategorySel.appendChild(opt);
      }
    });

    instCategorySel.onchange = () => {
      populateInstrumentSelect(instCategorySel.value);
    };
  }

  function populateInstrumentPresets() {
    if (!instPresetSel) return;
    instPresetSel.innerHTML = '<option value="">🎛️ Rig Presets...</option>';

    INSTRUMENT_PRESETS.forEach((preset, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = preset.name;
      instPresetSel.appendChild(opt);
    });

    instPresetSel.onchange = () => {
      const idx = instPresetSel.value;
      if (idx !== '' && INSTRUMENT_PRESETS[parseInt(idx, 10)]) {
        const p = INSTRUMENT_PRESETS[parseInt(idx, 10)];
        selectedInstruments = [...p.instruments];
        renderSelectedInstruments();
        updateStylePrompt();
        statusEl.textContent = `🎛️ Loaded rig preset: ${p.name}`;
      }
      instPresetSel.value = '';
    };
  }

  function populateInstrumentSelect(catFilter = 'All') {
    if (!instSelect) return;
    instSelect.innerHTML = '';

    const filtered = (catFilter === 'All')
      ? ALL_INSTRUMENTS
      : ALL_INSTRUMENTS.filter(i => i.category === catFilter);

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = catFilter === 'All'
      ? `➕ Choose Instrument to Add (${ALL_INSTRUMENTS.length})...`
      : `➕ Add from ${catFilter} (${filtered.length})...`;
    instSelect.appendChild(defaultOpt);

    if (catFilter === 'All') {
      const catMap = new Map();
      ALL_INSTRUMENTS.forEach(item => {
        const cat = item.category || 'Other';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat).push(item.name);
      });

      catMap.forEach((names, catName) => {
        const group = document.createElement('optgroup');
        group.label = `${catName} (${names.length})`;
        names.forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          group.appendChild(opt);
        });
        instSelect.appendChild(group);
      });
    } else {
      filtered.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        instSelect.appendChild(opt);
      });
    }

    instSelect.onchange = () => {
      const val = instSelect.value;
      if (!val) return;
      if (!selectedInstruments.includes(val)) {
        selectedInstruments.push(val);
        renderSelectedInstruments();
        updateStylePrompt();
        statusEl.textContent = `🎸 Added instrument: ${val}`;
      }
      instSelect.value = '';
    };
  }

  if (clearInstBtn) {
    clearInstBtn.onclick = () => {
      selectedInstruments = [];
      renderSelectedInstruments();
      updateStylePrompt();
      statusEl.textContent = 'Instruments rig cleared.';
    };
  }

  populateInstrumentCategories();
  populateInstrumentPresets();
  populateInstrumentSelect('All');
  renderSelectedInstruments();

  // ==========================================
  // 3. MODE SWITCHING: 2-GENRE PAIRS VS 3-GENRE COMBOS
  // ==========================================
  function setMode(mode) {
    currentMode = mode;
    if (mode === 'pair') {
      modePairBtn.classList.add('active');
      modeComboBtn.classList.remove('active');
      genre3Container.classList.add('sf-hidden');
      document.getElementById('pop-genre-slots-label').textContent = '2-Genre Pair (69,751 Combinations):';
    } else {
      modeComboBtn.classList.add('active');
      modePairBtn.classList.remove('active');
      genre3Container.classList.remove('sf-hidden');
      document.getElementById('pop-genre-slots-label').textContent = '3-Genre Combo (8.6 Million Combinations):';
    }
    updateStylePrompt();
  }

  modePairBtn.onclick = () => setMode('pair');
  modeComboBtn.onclick = () => setMode('combo');

  // ==========================================
  // 4. STYLE TAG SYNTHESIZER
  // ==========================================

  // Helper to maintain character count and highlight Suno v3.5/v4 capacity
  function updateStyleLength() {
    if (!styleInput || !styleLenEl) return;
    const len = styleInput.value.length;
    styleLenEl.textContent = `${len}/1000`;
    if (len > 1000) {
      styleLenEl.style.color = '#ef4444';
      styleLenEl.title = 'Warning: Exceeds Suno 1,000 character limit';
    } else if (len > 120) {
      styleLenEl.style.color = '#38bdf8';
      styleLenEl.title = 'Valid Suno v3.5/v4 prompt (up to 1,000 characters)';
    } else {
      styleLenEl.style.color = '#a1a1aa';
      styleLenEl.title = 'Fits within legacy 120 / modern 1,000 characters';
    }
  }

  function updateStylePrompt() {
    const g1 = genre1Sel ? genre1Sel.value : 'Dream Pop';
    const g2 = genre2Sel ? genre2Sel.value : 'TRAP & DRILL';
    const g3 = (currentMode === 'combo' && genre3Sel) ? genre3Sel.value : '';
    const bpm = bpmSlider ? parseInt(bpmSlider.value, 10) : 140;
    const timeSig = '4/4'; // default; popup BPM slider doesn't have timesig

    const activeGenres = [g1, g2, g3].filter(Boolean);
    const groove = designGroove({ genres: activeGenres, instruments: selectedInstruments, timeSig, bpm });

    const vocalStr = isInstrumental
      ? 'instrumental'
      : (selectedGender === 'None' ? 'atmospheric instrumental' : `${selectedGender.toLowerCase()} vocals`);

    const tagParts = [
      ...activeGenres,
      bpm + ' BPM',
      ...selectedInstruments,
      groove.description,
      groove.production,
      vocalStr
    ].filter(Boolean);

    const generated = tagParts.join(', ');
    if (styleInput) {
      styleInput.value = generated;
      updateStyleLength();
    }
  }

  // Handle genre select changes
  [genre1Sel, genre2Sel, genre3Sel].forEach(sel => {
    if (sel) sel.onchange = updateStylePrompt;
  });

  // Rebuild Style Button
  const rebuildStyleBtn = document.getElementById('pop-btn-rebuild-style');
  if (rebuildStyleBtn) {
    rebuildStyleBtn.onclick = () => {
      updateStylePrompt();
      statusEl.textContent = '✨ Style prompt regenerated!';
    };
  }

  // Style input length tracking
  if (styleInput && styleLenEl) {
    styleInput.addEventListener('input', () => {
      updateStyleLength();
    });
  }

  // ==========================================
  // 5. ROLL COMBINATIONS (69,751 PAIRS / 8.6M COMBOS)
  // ==========================================
  function rollCollision(guaranteeCoined = false) {
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let g1, g2, g3;

    if (guaranteeCoined && COINED_GENRES.length > 0) {
      g1 = getRandom(COINED_GENRES);
      do {
        g2 = getRandom(ALL_GENRES);
      } while (g2 === g1);
      do {
        g3 = getRandom(ALL_GENRES);
      } while (g3 === g1 || g3 === g2);
    } else {
      g1 = getRandom(ALL_GENRES);
      do {
        g2 = getRandom(ALL_GENRES);
      } while (g2 === g1);
      do {
        g3 = getRandom(ALL_GENRES);
      } while (g3 === g1 || g3 === g2);
    }

    if (genre1Sel) genre1Sel.value = g1;
    if (genre2Sel) genre2Sel.value = g2;
    if (genre3Sel) genre3Sel.value = g3;

    // Randomize BPM slightly around style
    const rollBpm = Math.floor(Math.random() * (165 - 85) + 85);
    if (bpmSlider) {
      bpmSlider.value = rollBpm;
      bpmVal.textContent = rollBpm + ' BPM';
    }

    // Creative title generator
    const titleSeeds = [
      "Electric Horizon", "Velvet Frequency", "Cybernetic Mirage", "Midnight Resonance",
      "Tin Roof Solitude", "Solar Flare", "Postcard From Orbit", "Astral Wanderer", "Chrono Rift",
      "Ferry Timetable", "Gravity Bloom", "Obsidian Dream", "Vapor Twilight", "Hyperion Drift"
    ];
    const newTitle = getRandom(titleSeeds) + ' (' + g1.split(' ')[0] + ' x ' + g2.split(' ')[0] + ')';
    if (titleInput) titleInput.value = newTitle;

    updateStylePrompt();

    // Show combination math index
    if (currentMode === 'pair') {
      const pairNum = Math.floor(Math.random() * 69751) + 1;
      loadedStatusEl.textContent = `● Pair #${pairNum.toLocaleString()} of 69,751`;
      statusEl.textContent = `🎲 Rolled 2-Genre Pair #${pairNum.toLocaleString()}: ${g1} + ${g2}`;
    } else {
      const comboNum = Math.floor(Math.random() * 8695624) + 1;
      loadedStatusEl.textContent = `● Combo #${comboNum.toLocaleString()} of 8.6M`;
      statusEl.textContent = `⚡ Rolled 3-Genre Combo #${comboNum.toLocaleString()}: ${g1} + ${g2} + ${g3}`;
    }

    // Store in history
    const creation = {
      title: newTitle,
      sunoStyleTag: styleInput.value,
      lyricSnippet: lyricsInput.value,
      vocalGender: selectedGender,
      weirdness: parseInt(weirdnessSlider.value, 10),
      styleInfluence: parseInt(influenceSlider.value, 10),
      isInstrumental
    };
    allCreationsList = [creation, ...allCreationsList].slice(0, 30);
    chrome.storage?.local?.set({ sf_latest_creation: creation, sf_creations_list: allCreationsList });
    updateCreationsDropdown(allCreationsList, creation.title);
  }

  const rollBtn = document.getElementById('pop-btn-roll-popup');
  if (rollBtn) rollBtn.onclick = () => rollCollision(false);

  const rollCoinedBtn = document.getElementById('pop-btn-roll-coined');
  if (rollCoinedBtn) rollCoinedBtn.onclick = () => rollCollision(true);

  // ==========================================
  // 6. BPM & AUDIO METRONOME
  // ==========================================
  bpmSlider.oninput = () => {
    bpmVal.textContent = bpmSlider.value + ' BPM';
    updateStylePrompt();
  };

  metronomeBtn.onclick = () => {
    if (isMetronomePlaying) {
      clearInterval(metronomeTimer);
      isMetronomePlaying = false;
      metronomeBtn.textContent = '🔊 Audio Click';
      metronomeBtn.style.color = '#a1a1aa';
    } else {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      isMetronomePlaying = true;
      metronomeBtn.textContent = '⏹ Stop Click';
      metronomeBtn.style.color = '#34d399';

      const intervalMs = (60 / parseInt(bpmSlider.value, 10)) * 1000;
      const playClick = () => {
        try {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.05);
        } catch (e) {}
      };
      playClick();
      metronomeTimer = setInterval(playClick, intervalMs);
    }
  };

  // Instrumental toggle
  instBtn.onclick = () => {
    isInstrumental = !isInstrumental;
    instBtn.textContent = 'Instrumental: ' + (isInstrumental ? 'ON' : 'OFF');
    instBtn.style.color = isInstrumental ? '#34d399' : '#a1a1aa';
    updateStylePrompt();
  };

  // Vocal Gender
  document.querySelectorAll('.sf-gender-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.sf-gender-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGender = btn.getAttribute('data-gender');
      updateStylePrompt();
    };
  });

  // Weirdness & Influence Sliders
  weirdnessSlider.oninput = () => weirdnessVal.textContent = weirdnessSlider.value + '%';
  influenceSlider.oninput = () => influenceVal.textContent = influenceSlider.value + '%';

  // Clear Lyrics
  const clearLyricsBtn = document.getElementById('pop-btn-clear-lyrics');
  if (clearLyricsBtn) {
    clearLyricsBtn.onclick = () => {
      lyricsInput.value = '';
      statusEl.textContent = 'Lyrics cleared';
    };
  }

  // Paste Prompt
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

  // ==========================================
  // 7. STUDIO CREATIONS DROPDOWN & SELECTION (1,447+ DATABASE)
  // ==========================================
  function updateCreationsDropdown(userList = allCreationsList, activeIdOrTitle = '', searchQuery = '') {
    if (!creationsDropdown) return;
    creationsDropdown.innerHTML = '';

    const q = (searchQuery || '').trim().toLowerCase();

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    const totalCount = creationsDB.length + (userList ? userList.length : 0);
    defaultOpt.textContent = q
      ? `🔍 Matching Results for "${searchQuery}"...`
      : `🎵 Select from ${totalCount.toLocaleString()} Created Band Prompts...`;
    creationsDropdown.appendChild(defaultOpt);

    // 1. User's Synced Studio Creations
    const matchingUser = (userList || []).filter(item => {
      if (!q) return true;
      const combined = `${item.title || ''} ${item.sunoStyleTag || ''}`.toLowerCase();
      return combined.includes(q);
    });

    if (matchingUser.length > 0) {
      const userGroup = document.createElement('optgroup');
      userGroup.label = `🎧 Live Studio Creations (${matchingUser.length})`;
      matchingUser.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = `user_${idx}`;
        opt.textContent = `🎵 ${item.title || 'Studio Track'} — ${item.sunoStyleTag ? item.sunoStyleTag.slice(0, 42) + '...' : ''}`;
        if (activeIdOrTitle && (opt.value === activeIdOrTitle || item.title === activeIdOrTitle)) {
          opt.selected = true;
        }
        userGroup.appendChild(opt);
      });
      creationsDropdown.appendChild(userGroup);
    }

    // 2. Filter Creations DB
    const matchingCreations = creationsDB.filter(item => {
      if (!q) return true;
      const combined = `${item.bandName} ${item.genreName} ${item.title} ${(item.ingredients || []).join(' ')} ${item.sunoStyleTag} ${item.vibe || ''}`.toLowerCase();
      return combined.includes(q);
    });

    // 2a. Newly Added Creations Group (Highlights newest entries with date and time!)
    const newCreations = matchingCreations.filter(item => item.isNew);
    if (newCreations.length > 0) {
      const newGroup = document.createElement('optgroup');
      newGroup.label = `✨ NEWLY ADDED ENTRIES (${newCreations.length} Recent)`;
      newCreations.slice(0, 80).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        const timeLabel = item.shortDate || item.formattedDate || 'New';
        opt.textContent = `🆕 [${timeLabel}] [${item.genreName}] ${item.bandName} — "${item.title}"`;
        if (activeIdOrTitle && (item.id === activeIdOrTitle || item.title === activeIdOrTitle)) {
          opt.selected = true;
        }
        newGroup.appendChild(opt);
      });
      creationsDropdown.appendChild(newGroup);
    }

    // 2b. Standard Categories with Date/Time indicators
    const displayList = q ? matchingCreations.slice(0, 150) : matchingCreations;

    const catMap = new Map();
    displayList.forEach(item => {
      const cat = item.category || 'Coined Fusion';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(item);
    });

    catMap.forEach((items, catName) => {
      const group = document.createElement('optgroup');
      group.label = `${catName} (${items.length}${q && matchingCreations.length > 150 ? ' shown' : ''})`;
      items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        const dateTag = item.isNew
          ? ` [🆕 ${item.shortDate || item.formattedDate}]`
          : (item.formattedDate ? ` (${item.formattedDate})` : '');
        opt.textContent = `[${item.genreName}] ${item.bandName} — "${item.title}"${dateTag}`;
        if (activeIdOrTitle && (item.id === activeIdOrTitle || item.title === activeIdOrTitle)) {
          opt.selected = true;
        }
        group.appendChild(opt);
      });
      creationsDropdown.appendChild(group);
    });

    // Update count badge & sync date label if present
    const badge = document.getElementById('pop-creations-count-badge');
    if (badge) {
      badge.textContent = matchingCreations.length.toLocaleString();
    }
    const syncLabel = document.getElementById('pop-creations-sync-date');
    if (syncLabel && window.SUNO_CREATIONS_METADATA?.formattedDate) {
      syncLabel.textContent = `(Synced: ${window.SUNO_CREATIONS_METADATA.formattedDate})`;
    }
  }

  // Creations dropdown selection
  creationsDropdown.onchange = (e) => {
    const val = e.target.value;
    if (!val) return;

    if (val.startsWith('user_')) {
      const idx = parseInt(val.replace('user_', ''), 10);
      if (allCreationsList[idx]) {
        loadPromptIntoForm(allCreationsList[idx], 'Live Studio Creation');
      }
    } else {
      const item = creationsMap.get(val);
      if (item) {
        loadPromptIntoForm(item, 'Created Band');
      }
    }
  };

  // Search input for creations dropdown
  const creationsSearchInput = document.getElementById('pop-creations-search');
  if (creationsSearchInput) {
    let debounceTimer = null;
    creationsSearchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateCreationsDropdown(allCreationsList, creationsDropdown.value, creationsSearchInput.value);
      }, 120);
    });
  }

  // Roll Random Band Button
  const rollCreationBtn = document.getElementById('pop-btn-roll-creation');
  if (rollCreationBtn) {
    rollCreationBtn.onclick = () => {
      if (creationsDB.length === 0) return;
      const randIdx = Math.floor(Math.random() * creationsDB.length);
      const chosen = creationsDB[randIdx];
      updateCreationsDropdown(allCreationsList, chosen.id);
      creationsDropdown.value = chosen.id;
      loadPromptIntoForm(chosen, 'Rolled Band');
      statusEl.textContent = `🎲 Rolled: ${chosen.bandName} [${chosen.genreName}]`;
    };
  }

  function loadPromptIntoForm(data, reason) {
    if (data.sunoStyleTag) styleInput.value = data.sunoStyleTag;
    if (data.lyricSnippet) lyricsInput.value = data.lyricSnippet;
    if (data.title) titleInput.value = data.title;
    if (data.excludeStyles) excludeInput.value = data.excludeStyles;
    if (data.bpm && bpmSlider && bpmVal) {
      bpmSlider.value = data.bpm;
      bpmVal.textContent = data.bpm + ' BPM';
    }
    if (typeof data.isInstrumental === 'boolean') {
      isInstrumental = data.isInstrumental;
      instBtn.textContent = 'Instrumental: ' + (isInstrumental ? 'ON' : 'OFF');
      instBtn.style.color = isInstrumental ? '#34d399' : '#a1a1aa';
    }
    if (data.vocalGender) {
      selectedGender = data.vocalGender;
      document.querySelectorAll('.sf-gender-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-gender') === selectedGender);
      });
    }
    if (data.weirdness !== undefined) {
      weirdnessSlider.value = data.weirdness;
      weirdnessVal.textContent = data.weirdness + '%';
    }
    if (data.styleInfluence !== undefined) {
      influenceSlider.value = data.styleInfluence;
      influenceVal.textContent = data.styleInfluence + '%';
    }

    // Match genres/ingredients to genre selectors
    const genreCandidates = [];
    if (data.genreName) genreCandidates.push(data.genreName);
    if (Array.isArray(data.genres)) genreCandidates.push(...data.genres);
    if (Array.isArray(data.ingredients)) genreCandidates.push(...data.ingredients);

    const matchedGenres = [];
    genreCandidates.forEach(cand => {
      if (!cand || typeof cand !== 'string') return;
      const cleanCand = cand.trim().toLowerCase();
      const exact = ALL_GENRES.find(g => g.toLowerCase() === cleanCand);
      if (exact && !matchedGenres.includes(exact)) {
        matchedGenres.push(exact);
        return;
      }
      const sub = ALL_GENRES.find(g => {
        const gl = g.toLowerCase();
        return gl.includes(cleanCand) || cleanCand.includes(gl);
      });
      if (sub && !matchedGenres.includes(sub)) {
        matchedGenres.push(sub);
      }
    });

    if (matchedGenres.length > 0 && genre1Sel) {
      genre1Sel.value = matchedGenres[0];
    }
    if (matchedGenres.length > 1 && genre2Sel) {
      genre2Sel.value = matchedGenres[1];
    }
    if (matchedGenres.length > 2 && genre3Sel) {
      genre3Sel.value = matchedGenres[2];
    }

    // Match instruments if provided
    if (data.instruments && Array.isArray(data.instruments)) {
      const matchInsts = [];
      const instText = data.instruments.join(' ').toLowerCase();
      ALL_INSTRUMENTS.forEach(instObj => {
        if (instText.includes(instObj.name.toLowerCase()) && !matchInsts.includes(instObj.name)) {
          matchInsts.push(instObj.name);
        }
      });
      if (matchInsts.length > 0) {
        selectedInstruments = matchInsts.slice(0, 6);
      } else if (data.instruments.length > 0) {
        selectedInstruments = data.instruments.slice(0, 6);
      }
      renderSelectedInstruments();
    }

    loadedStatusEl.textContent = `✨ ${reason}: ${data.bandName || data.title || 'Custom Track'} [${data.genreName || 'Fusion'}]`;
    updateStyleLength();

    // Persist as latest creation for active sync with Suno tab
    chrome.storage?.local?.set({ sf_latest_creation: data });
  }

  // Load from chrome.storage
  chrome.storage?.local?.get(['sf_latest_creation', 'sf_creations_list'], (res) => {
    if (res?.sf_creations_list && Array.isArray(res.sf_creations_list)) {
      allCreationsList = res.sf_creations_list;
    }
    updateCreationsDropdown(allCreationsList, res?.sf_latest_creation?.id || res?.sf_latest_creation?.title);
    if (res?.sf_latest_creation) {
      loadPromptIntoForm(res.sf_latest_creation, 'Synced');
    }
  });

  // Sync button
  const syncBtn = document.getElementById('pop-btn-sync-app');
  if (syncBtn) {
    syncBtn.onclick = () => {
      chrome.storage?.local?.get(['sf_latest_creation', 'sf_creations_list'], (res) => {
        if (res?.sf_latest_creation) {
          loadPromptIntoForm(res.sf_latest_creation, 'Web App Synced');
          statusEl.textContent = '✓ Synced with active Studio session!';
        } else {
          statusEl.textContent = 'No web app creation found in sync storage.';
        }
      });
    };
  }

  // ==========================================
  // 8. TAB 2: CURATED LIBRARY (839 PROMPTS IN 42 SETS)
  // ==========================================
  const libSearchInput = document.getElementById('pop-lib-search');
  const libSetSelect = document.getElementById('pop-lib-set-select');
  const libCategoriesContainer = document.getElementById('pop-lib-categories');
  const libPromptsList = document.getElementById('pop-lib-prompts-list');
  const libActiveSetTitle = document.getElementById('pop-lib-active-set-title');
  const libActiveSetNote = document.getElementById('pop-lib-active-set-note');
  const libPromptCount = document.getElementById('pop-lib-prompt-count');

  // Categories list
  const LIBRARY_CATEGORIES = [
    'ALL', '🎵 Created Bands', 'Rock & Metal', 'Electronic & Dance', 'Hip-Hop & Urban',
    'Pop & Vocal', 'Coined Fusion', 'Folk & World', 'Jazz & Blues', 'Ambient & Cinematic'
  ];

  function renderLibraryCategories() {
    if (!libCategoriesContainer) return;
    libCategoriesContainer.innerHTML = '';
    LIBRARY_CATEGORIES.forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sf-filter-chip' + (cat === activeLibraryCategory ? ' active' : '');
      chip.textContent = cat;
      chip.onclick = () => {
        activeLibraryCategory = cat;
        renderLibraryCategories();
        filterAndRenderLibrary();
      };
      libCategoriesContainer.appendChild(chip);
    });
  }

  function populateLibrarySets() {
    if (!libSetSelect) return;
    libSetSelect.innerHTML = '<option value="ALL">📂 All 42 Sets (839 Prompts)</option>';
    curatedLibrary.forEach(set => {
      const opt = document.createElement('option');
      opt.value = set.id;
      opt.textContent = `${set.name} (${set.prompts.length} prompts) • ${set.category}`;
      libSetSelect.appendChild(opt);
    });
  }

  function filterAndRenderLibrary() {
    if (!libPromptsList) return;
    const query = (libSearchInput?.value || '').trim().toLowerCase();
    const selectedSetId = libSetSelect?.value || 'ALL';

    let matchingPrompts = [];

    // Filter sets from Curated Library
    if (selectedSetId !== 'CREATED_BANDS') {
      curatedLibrary.forEach(set => {
        if (selectedSetId !== 'ALL' && set.id !== selectedSetId) return;
        if (activeLibraryCategory !== 'ALL' && activeLibraryCategory !== '🎵 Created Bands' && set.category !== activeLibraryCategory) return;

        set.prompts.forEach(p => {
          if (!query || p.toLowerCase().includes(query) || set.name.toLowerCase().includes(query)) {
            matchingPrompts.push({
              prompt: p,
              setName: set.name,
              setCategory: set.category,
              setNote: set.note
            });
          }
        });
      });
    }

    // Filter from 1,447 Created Bands Database
    if (selectedSetId === 'CREATED_BANDS' || activeLibraryCategory === '🎵 Created Bands' || (selectedSetId === 'ALL' && activeLibraryCategory === 'ALL' && query)) {
      creationsDB.forEach(item => {
        if (activeLibraryCategory !== 'ALL' && activeLibraryCategory !== '🎵 Created Bands' && item.category !== activeLibraryCategory) return;
        const matchStr = `${item.bandName} ${item.genreName} ${item.title} ${(item.ingredients || []).join(' ')} ${item.sunoStyleTag} ${item.vibe || ''}`.toLowerCase();
        if (!query || matchStr.includes(query)) {
          matchingPrompts.push({
            prompt: item.sunoStyleTag,
            setName: `[${item.genreName}] ${item.bandName}`,
            setCategory: item.category || 'Coined Fusion',
            setNote: item.vibe ? item.vibe.slice(0, 90) : `Debut: ${item.title}`,
            title: item.title,
            lyrics: item.lyricSnippet,
            bpm: item.bpm,
            isCreatedBand: true,
            bandObj: item,
            formattedDate: item.formattedDate,
            shortDate: item.shortDate,
            isNew: item.isNew
          });
        }
      });
    }

    // Update Banner
    if (selectedSetId !== 'ALL') {
      const currentSet = curatedLibrary.find(s => s.id === selectedSetId);
      if (currentSet) {
        libActiveSetTitle.textContent = currentSet.name;
        libActiveSetNote.textContent = currentSet.note || currentSet.category;
      }
    } else {
      libActiveSetTitle.textContent = activeLibraryCategory === 'ALL'
        ? 'All Curated Sets (839 Prompts)'
        : `${activeLibraryCategory} Sets`;
      libActiveSetNote.textContent = 'Hand-crafted prompt engineering tested on Suno v3.5 & v4 architectures.';
    }
    libPromptCount.textContent = `${matchingPrompts.length} Prompts`;

    // Render list (limit to 100 for instant DOM speed if searching all)
    libPromptsList.innerHTML = '';
    if (matchingPrompts.length === 0) {
      libPromptsList.innerHTML = '<div style="padding:20px;text-align:center;color:#71717a;font-size:11px;">No matching prompts found in library.</div>';
      return;
    }

    const renderSlice = matchingPrompts.slice(0, 80);
    renderSlice.forEach(item => {
      const card = document.createElement('div');
      card.className = 'sf-library-card';

      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#a1a1aa;margin-bottom:3px;';
      const dateBadge = item.formattedDate
        ? `<span class="sf-badge" style="background:${item.isNew ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)'};color:${item.isNew ? '#4ade80' : '#a1a1aa'};border-color:${item.isNew ? 'rgba(34,197,94,0.35)' : '#3f3f46'};font-size:9px;font-weight:700;display:inline-flex;align-items:center;gap:3px;">${item.isNew ? '🆕 ' : '📅 '}${item.formattedDate}</span>`
        : '';

      headerDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-weight:700;color:#c084fc;">${item.setName}</span>
          ${dateBadge}
        </div>
        <span class="sf-badge">${item.setCategory}</span>
      `;

      const promptDiv = document.createElement('div');
      promptDiv.className = 'sf-prompt-text';
      promptDiv.textContent = item.prompt;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'sf-card-actions';

      // AutoFill Suno Button
      const fillBtn = document.createElement('button');
      fillBtn.className = 'sf-mini-btn primary';
      fillBtn.innerHTML = '⚡ Auto-Fill Suno';
      fillBtn.onclick = () => {
        styleInput.value = item.prompt;
        sendAutoFill(item.prompt, item.setName, autoCreateEnabled);
      };

      // Load to Studio Button
      const studioBtn = document.createElement('button');
      studioBtn.className = 'sf-mini-btn';
      studioBtn.innerHTML = '🔀 To Studio';
      studioBtn.onclick = () => {
        styleInput.value = item.prompt;
        titleInput.value = item.setName + ' Jam';
        updateStyleLength();
        // switch tab to studio
        document.querySelector('[data-tab="create"]')?.click();
        statusEl.textContent = `✓ Loaded "${item.setName}" prompt into Studio!`;
      };

      // Copy Button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'sf-mini-btn';
      copyBtn.innerHTML = '📋 Copy';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(item.prompt);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => copyBtn.textContent = '📋 Copy', 1500);
      };

      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(studioBtn);
      actionsDiv.appendChild(fillBtn);

      card.appendChild(headerDiv);
      card.appendChild(promptDiv);
      card.appendChild(actionsDiv);
      libPromptsList.appendChild(card);
    });

    if (matchingPrompts.length > 80) {
      const moreDiv = document.createElement('div');
      moreDiv.style.cssText = 'padding:8px;text-align:center;font-size:10px;color:#a1a1aa;';
      moreDiv.textContent = `Showing 80 of ${matchingPrompts.length} matching prompts. Use search or set dropdown to narrow results.`;
      libPromptsList.appendChild(moreDiv);
    }
  }

  if (libSearchInput) libSearchInput.oninput = filterAndRenderLibrary;
  if (libSetSelect) libSetSelect.onchange = filterAndRenderLibrary;

  renderLibraryCategories();
  populateLibrarySets();

  // ==========================================
  // 9. TAB 3: TAXONOMY (374 GENRES & 98 COINED)
  // ==========================================
  const taxSearchInput = document.getElementById('pop-tax-search');
  const taxList = document.getElementById('pop-tax-genres-list');
  const taxCountLabel = document.getElementById('pop-tax-count-label');

  function renderTaxonomy() {
    if (!taxList) return;
    const query = (taxSearchInput?.value || '').trim().toLowerCase();

    const filtered = ALL_GENRES.filter(genre => {
      const isCoined = coinedSet.has(genre);
      if (activeTaxonomyFilter === 'coined' && !isCoined) return false;
      if (activeTaxonomyFilter === 'standard' && isCoined) return false;
      if (query && !genre.toLowerCase().includes(query)) return false;
      return true;
    });

    taxCountLabel.textContent = `Showing ${filtered.length} of ${ALL_GENRES.length} Genres`;
    taxList.innerHTML = '';

    filtered.slice(0, 150).forEach(genre => {
      const isCoined = coinedSet.has(genre);
      const row = document.createElement('div');
      row.className = 'sf-genre-row';

      const left = document.createElement('div');
      left.style.cssText = 'display:flex;align-items:center;gap:6px;';
      left.innerHTML = `
        <span style="font-size:11px;font-weight:700;color:#f4f4f5;">${genre}</span>
        ${isCoined ? '<span class="sf-badge-coined">COINED</span>' : ''}
      `;

      const right = document.createElement('div');
      right.style.cssText = 'display:flex;gap:3px;';

      const btn1 = document.createElement('button');
      btn1.className = 'sf-mini-btn';
      btn1.textContent = 'G1';
      btn1.title = 'Set as Genre 1 in Studio';
      btn1.onclick = () => {
        if (genre1Sel) genre1Sel.value = genre;
        updateStylePrompt();
        document.querySelector('[data-tab="create"]')?.click();
        statusEl.textContent = `✓ Set ${genre} as Genre 1`;
      };

      const btn2 = document.createElement('button');
      btn2.className = 'sf-mini-btn';
      btn2.textContent = 'G2';
      btn2.title = 'Set as Genre 2 in Studio';
      btn2.onclick = () => {
        if (genre2Sel) genre2Sel.value = genre;
        updateStylePrompt();
        document.querySelector('[data-tab="create"]')?.click();
        statusEl.textContent = `✓ Set ${genre} as Genre 2`;
      };

      const btnClash = document.createElement('button');
      btnClash.className = 'sf-mini-btn primary';
      btnClash.textContent = '🎲 Clash';
      btnClash.title = 'Roll a 2-genre clash pair using this genre!';
      btnClash.onclick = () => {
        if (genre1Sel) genre1Sel.value = genre;
        const otherGenres = ALL_GENRES.filter(g => g !== genre);
        const partner = otherGenres[Math.floor(Math.random() * otherGenres.length)];
        if (genre2Sel) genre2Sel.value = partner;
        updateStylePrompt();
        document.querySelector('[data-tab="create"]')?.click();
        statusEl.textContent = `🎲 Rolled Clash Pair: ${genre} + ${partner}`;
      };

      right.appendChild(btn1);
      right.appendChild(btn2);
      right.appendChild(btnClash);

      row.appendChild(left);
      row.appendChild(right);
      taxList.appendChild(row);
    });

    if (filtered.length > 150) {
      const moreRow = document.createElement('div');
      moreRow.style.cssText = 'padding:6px;text-align:center;font-size:10px;color:#a1a1aa;';
      moreRow.textContent = `Showing first 150 of ${filtered.length} genres. Search above to find specific genres.`;
      taxList.appendChild(moreRow);
    }
  }

  if (taxSearchInput) taxSearchInput.oninput = renderTaxonomy;

  document.querySelectorAll('#pop-tax-btn-all, #pop-tax-btn-coined, #pop-tax-btn-standard').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#pop-tax-btn-all, #pop-tax-btn-coined, #pop-tax-btn-standard').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTaxonomyFilter = btn.getAttribute('data-filter');
      renderTaxonomy();
    };
  });

  // ==========================================
  // 10. TAB NAVIGATION
  // ==========================================
  document.querySelectorAll('.sf-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.sf-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');

      ['create', 'library', 'taxonomy', 'settings', 'metatags'].forEach(t => {
        const el = document.getElementById('pop-tab-' + t);
        if (el) el.classList.toggle('sf-hidden', t !== targetTab);
      });

      if (targetTab === 'library') filterAndRenderLibrary();
      if (targetTab === 'taxonomy') renderTaxonomy();
    };
  });

  // ==========================================
  // 11. SUNO AUTOFILL DISPATCHER & SIDE PANEL
  // ==========================================
  // Side Panel open handler
  const sidePanelBtn = document.getElementById('pop-btn-open-sidebar');
  if (sidePanelBtn) {
    sidePanelBtn.addEventListener('click', async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (chrome.sidePanel && chrome.sidePanel.open && activeTab?.id) {
          await chrome.sidePanel.open({ tabId: activeTab.id }).catch(async () => {
            if (activeTab.windowId) {
              await chrome.sidePanel.open({ windowId: activeTab.windowId });
            }
          });
          window.close();
          return;
        } else if (chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL', tabId: activeTab?.id, windowId: activeTab?.windowId }, (res) => {
            if (res?.success) window.close();
          });
        }
      } catch (err) {
        console.warn('Could not auto-open side panel:', err);
      }
      statusEl.textContent = '\u2139\ufe0f Open Chrome / Edge Side Panel menu in your browser toolbar to keep Suno Fusion permanently pinned!';
    });
  }

  // 1-Click In-Place Reload Handler (Reloads extension & refreshes Suno in Microsoft Edge & Chrome)
  const reloadExtBtn = document.getElementById('sf-btn-reload-ext');
  if (reloadExtBtn) {
    reloadExtBtn.addEventListener('click', () => {
      statusEl.textContent = '↻ Reloading Suno Fusion & refreshing Suno tab...';
      try {
        chrome.tabs.query({ url: '*://*.suno.com/*' }, (tabs) => {
          if (tabs && tabs.length > 0) {
            tabs.forEach(t => {
              if (t.id) chrome.tabs.reload(t.id).catch(() => {});
            });
          }
          setTimeout(() => {
            try {
              chrome.runtime.reload();
            } catch (e) {}
            setTimeout(() => {
              window.location.reload();
            }, 100);
          }, 250);
        });
      } catch (e) {
        window.location.reload();
      }
    });
  }

  function isSupportedTargetUrl(url) {
    if (!url) return false;
    return url.includes('suno.com') || url.includes('topmediai.com');
  }

  async function getTargetTab() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url && isSupportedTargetUrl(activeTab.url)) {
        return activeTab;
      }
      // If active tab isn't suno or topmediai, search for any open suno or topmediai tab in current window
      const sunoTabs = await chrome.tabs.query({ url: '*://*.suno.com/*' });
      if (sunoTabs && sunoTabs.length > 0) {
        return sunoTabs[0];
      }
      const topMediaTabs = await chrome.tabs.query({ url: '*://*.topmediai.com/*' });
      if (topMediaTabs && topMediaTabs.length > 0) {
        return topMediaTabs[0];
      }
      return activeTab;
    } catch (e) {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs?.[0];
    }
  }

  const getSunoTab = getTargetTab;

  let isAutoFilling = false;

  async function sendAutoFill(customStyle, customTitle, forceCreate = null) {
    if (isAutoFilling) {
      console.log('[Suno Fusion] AutoFill already in progress, debouncing click.');
      return;
    }
    isAutoFilling = true;
    setTimeout(() => { isAutoFilling = false; }, 2500);

    const tab = await getTargetTab();
    if (!tab?.id) {
      isAutoFilling = false;
      return;
    }

    if (!tab.url || !isSupportedTargetUrl(tab.url)) {
      statusEl.textContent = 'Opening suno.com/create...';
      chrome.tabs.create({ url: 'https://suno.com/create' });
      isAutoFilling = false;
      return;
    }

    const platformName = tab.url.includes('topmediai.com') ? 'TopMediai' : 'Suno';
    const shouldCreate = forceCreate !== null ? !!forceCreate : autoCreateEnabled;

    // Temporarily disable buttons to prevent double-clicks
    if (fillCreateBtn) fillCreateBtn.disabled = true;
    if (fillCreateSettingsBtn) fillCreateSettingsBtn.disabled = true;
    if (fillBtn) fillBtn.disabled = true;
    if (fillSettingsBtn) fillSettingsBtn.disabled = true;

    const restoreButtons = () => {
      if (fillCreateBtn) fillCreateBtn.disabled = false;
      if (fillCreateSettingsBtn) fillCreateSettingsBtn.disabled = false;
      if (fillBtn) fillBtn.disabled = false;
      if (fillSettingsBtn) fillSettingsBtn.disabled = false;
    };
    setTimeout(restoreButtons, 2500);

    statusEl.textContent = shouldCreate ? ('🚀 Injecting & Creating on ' + platformName + '...') : ('⚡ Injecting into ' + platformName + '...');
    const payload = {
      action: 'AUTOFILL',
      prompt: {
        styleTag: (customStyle || styleInput.value).trim(),
        lyricSnippet: lyricsInput.value.trim(),
        title: (customTitle || titleInput.value).trim(),
        excludeStyles: excludeInput.value.trim(),
        vocalGender: selectedGender,
        weirdness: parseInt(weirdnessSlider.value, 10),
        styleInfluence: parseInt(influenceSlider.value, 10),
        isInstrumental,
        autoCreate: shouldCreate
      }
    };

    chrome.tabs.sendMessage(tab.id, payload, (response) => {
      restoreButtons();
      if (chrome.runtime.lastError) {
        // Auto-reconnect: if content script disconnected, reinject it dynamically
        if (chrome.scripting && tab.id) {
          statusEl.textContent = 'Reconnecting with ' + platformName + '...';
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, payload, (resp2) => {
                if (resp2 && resp2.success) {
                  statusEl.textContent = shouldCreate
                    ? ('🚀 AutoFilled & Create Triggered on ' + platformName + '!')
                    : ('✓ 1-Click AutoFilled ' + platformName + '!');
                } else {
                  statusEl.textContent = '✓ AutoFill sent to ' + platformName + '!';
                }
              });
            }, 250);
          }).catch(() => {
            statusEl.textContent = 'Please refresh the ' + platformName + ' tab and retry.';
          });
          return;
        }
        statusEl.textContent = 'Please refresh the ' + platformName + ' tab and retry.';
      } else if (response && response.success) {
        statusEl.textContent = shouldCreate
          ? ('🚀 AutoFilled & Create Triggered on ' + platformName + '!')
          : ('✓ 1-Click AutoFilled ' + platformName + '!');
      } else {
        statusEl.textContent = '✓ AutoFill sent to ' + platformName + '!';
      }
    });
  }

  if (fillBtn) fillBtn.onclick = () => sendAutoFill(null, null, false);
  if (fillCreateBtn) fillCreateBtn.onclick = () => sendAutoFill(null, null, true);
  if (fillSettingsBtn) fillSettingsBtn.onclick = () => sendAutoFill(null, null, false);
  if (fillCreateSettingsBtn) fillCreateSettingsBtn.onclick = () => sendAutoFill(null, null, true);

  // Metatags quick insert
  document.querySelectorAll('.sf-metatag-btn[data-tag]').forEach(tag => {
    tag.onclick = () => {
      lyricsInput.value += '\n' + tag.getAttribute('data-tag') + '\n';
      statusEl.textContent = `Inserted ${tag.getAttribute('data-tag')} into lyrics`;
    };
  });
});
