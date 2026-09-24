// Suno Fusion Bridge: Syncs creations from the Web App to Extension Storage
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
