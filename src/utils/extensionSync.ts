import { GeneratedPrompt } from '../types';

export function syncCreationToExtension(prompt: GeneratedPrompt): boolean {
  if (!prompt) return false;
  try {
    const payload = {
      title: prompt.title || 'Studio Fusion',
      sunoStyleTag: prompt.sunoStyleTag || '',
      lyricSnippet: prompt.lyricSnippet || '',
      fullPrompt: prompt.fullPrompt || '',
      genres: prompt.genres || [],
      timeSig: prompt.timeSig || '4/4',
      minBpm: prompt.minBpm,
      maxBpm: prompt.maxBpm,
      key: prompt.key,
      selectedInstruments: prompt.selectedInstruments || [],
      excludeStyles: prompt.excludeStyles || 'screaming, harsh distortion, muddy bass, generic pop EDM',
      vocalGender: prompt.vocalGender || 'Female',
      weirdness: prompt.weirdness !== undefined ? prompt.weirdness : 50,
      styleInfluence: prompt.styleInfluence !== undefined ? prompt.styleInfluence : 85,
      variety: prompt.variety || 'High',
      duration: prompt.duration || '3:00',
      maxMode: !!prompt.maxMode,
      isInstrumental: !!prompt.isInstrumental,
      syncedAt: Date.now()
    };

    // 1. Save to localStorage
    localStorage.setItem('sf_latest_creation', JSON.stringify(payload));

    const listRaw = localStorage.getItem('sf_creations_list');
    let list: any[] = [];
    if (listRaw) {
      try {
        list = JSON.parse(listRaw);
      } catch (e) {
        list = [];
      }
    }
    list = [payload, ...list.filter(p => p.title !== payload.title)].slice(0, 30);
    localStorage.setItem('sf_creations_list', JSON.stringify(list));

    // 2. Broadcast postMessage for extension bridge.js
    window.postMessage({
      type: 'SUNO_FUSION_SYNC_PROMPT',
      prompt: payload
    }, '*');

    // 3. Direct chrome.storage if available
    // @ts-ignore
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      // @ts-ignore
      chrome.storage.local.set({
        sf_latest_creation: payload,
        sf_creations_list: list
      });
    }

    return true;
  } catch (err) {
    console.warn('[Suno Fusion] Failed to sync to extension:', err);
    return false;
  }
}
