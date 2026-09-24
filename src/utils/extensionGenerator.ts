import JSZip from 'jszip';
import { GeneratedPrompt } from '../types';

export interface ExtensionFiles {
  'manifest.json': string;
  'content.js': string;
  'content.css': string;
  'popup.html': string;
  'popup.js': string;
  'popup.css': string;
  'background.js': string;
  'README.md': string;
}

export function getExtensionSourceCode(samplePrompt?: GeneratedPrompt | null): ExtensionFiles {
  const defaultStyle = samplePrompt?.sunoStyleTag || 'Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass, Roland Juno-106';
  const defaultLyrics = samplePrompt?.lyricSnippet || '[Verse 1]\nNeon shadows flicker in the twilight haze\n\n[Chorus]\nDrifting through the echoes of another phase';
  const defaultTitle = samplePrompt?.title || 'Nebula Drift';

  const manifest = JSON.stringify(
    {
      manifest_version: 3,
      name: "Suno Fusion - AutoFill & Prompt Sidekick",
      version: "1.0.0",
      description: "1-Click AutoFill for Suno AI (suno.com/create). Fills Style of Music, Lyrics, Metatags, and Titles directly into Suno.",
      icons: {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      },
      action: {
        "default_popup": "popup.html",
        "default_title": "Suno Fusion Sidekick"
      },
      permissions: [
        "activeTab",
        "scripting",
        "storage"
      ],
      host_permissions: [
        "https://suno.com/*",
        "https://*.suno.com/*"
      ],
      content_scripts: [
        {
          "matches": [
            "https://suno.com/*",
            "https://*.suno.com/*"
          ],
          "js": ["content.js"],
          "css": ["content.css"],
          "run_at": "document_idle"
        }
      ]
    },
    null,
    2
  );

  const contentJs = `// Suno Fusion AutoFill Content Script for suno.com
(function () {
  if (window.__sunoFusionInjected) return;
  window.__sunoFusionInjected = true;

  console.log('[Suno Fusion] Extension active on suno.com');

  // React-safe input setter
  function setReactInputValue(el, value) {
    if (!el) return false;
    const proto = el.tagName.toLowerCase() === 'textarea'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Ensure "Custom" mode is turned on in Suno
  function ensureCustomModeActive() {
    // Look for toggle buttons/switches containing "Custom"
    const buttons = Array.from(document.querySelectorAll('button, [role="switch"], [data-state]'));
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text === 'custom' || aria.includes('custom')) {
        const state = btn.getAttribute('data-state') || btn.getAttribute('aria-checked');
        if (state === 'off' || state === 'false' || !btn.classList.contains('active')) {
          btn.click();
          console.log('[Suno Fusion] Activated Custom mode');
          return true;
        }
      }
    }
    return false;
  }

  // Find target inputs on Suno create page
  function findSunoInputs() {
    // Style of Music box
    const styleTextarea = document.querySelector(
      'textarea[placeholder*="style" i], textarea[placeholder*="Style" i], textarea[aria-label*="Style" i], [data-testid="style-input"], textarea[name="style"]'
    ) || Array.from(document.querySelectorAll('textarea')).find(t => {
      const p = (t.placeholder || '').toLowerCase();
      return p.includes('genre') || p.includes('style') || p.includes('tags');
    });

    // Lyrics box
    const lyricsTextarea = document.querySelector(
      'textarea[placeholder*="lyric" i], textarea[placeholder*="Lyric" i], textarea[aria-label*="Lyric" i], [data-testid="lyrics-input"], textarea[name="prompt"]'
    ) || Array.from(document.querySelectorAll('textarea')).find(t => {
      const p = (t.placeholder || '').toLowerCase();
      return p.includes('verse') || p.includes('chorus') || p.includes('words');
    });

    // Title input
    const titleInput = document.querySelector(
      'input[placeholder*="title" i], input[placeholder*="Title" i], input[aria-label*="Title" i], [data-testid="title-input"], input[name="title"]'
    );

    return { styleTextarea, lyricsTextarea, titleInput };
  }

  // Show floating toast notification on suno.com
  function showToast(message, type = 'success') {
    const existing = document.getElementById('suno-fusion-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'suno-fusion-toast';
    toast.className = 'suno-fusion-toast ' + type;
    toast.innerHTML = \`
      <div class="sf-toast-content">
        <span class="sf-toast-icon">\${type === 'success' ? '⚡' : '⚠️'}</span>
        <span class="sf-toast-text">\${message}</span>
      </div>
    \`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('sf-toast-hide');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  // Autofill Core Function
  function autofillSunoForm(promptData) {
    if (!promptData) return { success: false, error: 'No prompt data provided' };

    ensureCustomModeActive();

    setTimeout(() => {
      const { styleTextarea, lyricsTextarea, titleInput } = findSunoInputs();
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

      if (filledCount > 0) {
        showToast('✓ Suno Fusion: Style, Lyrics & Title auto-filled successfully!', 'success');
        return { success: true, filledCount };
      } else {
        // Fallback: If no style textarea found yet, wait and retry once
        setTimeout(() => {
          const retry = findSunoInputs();
          if (retry.styleTextarea && promptData.styleTag) {
            setReactInputValue(retry.styleTextarea, promptData.styleTag);
            if (retry.lyricsTextarea && promptData.lyricSnippet) {
              setReactInputValue(retry.lyricsTextarea, promptData.lyricSnippet);
            }
            if (retry.titleInput && promptData.title) {
              setReactInputValue(retry.titleInput, promptData.title);
            }
            showToast('✓ Suno Fusion: Form auto-filled!', 'success');
          } else {
            showToast('Could not locate Suno inputs. Please make sure you are on suno.com/create with Custom mode open.', 'error');
          }
        }, 500);
      }
    }, 250);

    return { success: true };
  }

  // Listen for messages from popup or background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'AUTOFILL') {
      const res = autofillSunoForm(message.prompt);
      sendResponse(res);
    } else if (message.action === 'PING') {
      sendResponse({ status: 'PONG', isSuno: true });
    }
  });

  // Inject Floating Quick-Filler Widget on Suno
  function injectFloatingWidget() {
    if (document.getElementById('suno-fusion-fab')) return;

    const widget = document.createElement('div');
    widget.id = 'suno-fusion-fab';
    widget.className = 'suno-fusion-fab-container';
    widget.innerHTML = \`
      <button id="suno-fusion-toggle-btn" class="sf-fab-btn" title="Suno Fusion 1-Click AutoFill">
        <span class="sf-fab-bolt">⚡</span>
        <span class="sf-fab-text">Suno Fusion</span>
      </button>

      <div id="suno-fusion-panel" class="sf-panel sf-hidden">
        <div class="sf-panel-header">
          <div class="sf-panel-title">
            <span class="sf-bolt-glow">⚡</span> Suno Fusion AutoFill
          </div>
          <button id="sf-panel-close" class="sf-close-btn">&times;</button>
        </div>

        <div class="sf-panel-body">
          <label class="sf-label">Style of Music (Prompt Tag):</label>
          <textarea id="sf-input-style" class="sf-textarea" rows="3" placeholder="e.g. Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass..."></textarea>

          <label class="sf-label">Lyrics &amp; Metatag Scaffold:</label>
          <textarea id="sf-input-lyrics" class="sf-textarea" rows="3" placeholder="e.g. [Verse 1] ... [Chorus] ..."></textarea>

          <label class="sf-label">Track Title:</label>
          <input id="sf-input-title" type="text" class="sf-input" placeholder="e.g. Nebula Drift" />

          <button id="sf-btn-fill" class="sf-action-btn">
            ⚡ Auto-Fill Suno Form Now
          </button>

          <div class="sf-shortcuts">
            <span class="sf-shortcut-tag" data-style="Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass" data-title="Shoegaze Drill">Dream Pop × Trap</span>
            <span class="sf-shortcut-tag" data-style="Cyber Funk, Celtic Irish Folk, Darkwave, 128 BPM, bagpipes, synthwave bass" data-title="Neon Highlands">Cyber × Celtic</span>
            <span class="sf-shortcut-tag" data-style="Neo-City Pop, Neo-Tokyo Lo-Fi, 92 BPM, Rhodes piano, retro anime brass" data-title="Midnight Shinjuku">City Pop × Lo-Fi</span>
          </div>
        </div>
      </div>
    \`;

    document.body.appendChild(widget);

    const toggleBtn = document.getElementById('suno-fusion-toggle-btn');
    const panel = document.getElementById('suno-fusion-panel');
    const closeBtn = document.getElementById('sf-panel-close');
    const fillBtn = document.getElementById('sf-btn-fill');
    const styleInput = document.getElementById('sf-input-style');
    const lyricsInput = document.getElementById('sf-input-lyrics');
    const titleInput = document.getElementById('sf-input-title');

    // Default pre-fill
    chrome.storage?.local?.get(['lastPrompt'], (res) => {
      if (res && res.lastPrompt) {
        if (styleInput) styleInput.value = res.lastPrompt.styleTag || '';
        if (lyricsInput) lyricsInput.value = res.lastPrompt.lyricSnippet || '';
        if (titleInput) titleInput.value = res.lastPrompt.title || '';
      }
    });

    toggleBtn?.addEventListener('click', () => {
      panel?.classList.toggle('sf-hidden');
    });

    closeBtn?.addEventListener('click', () => {
      panel?.classList.add('sf-hidden');
    });

    fillBtn?.addEventListener('click', () => {
      const data = {
        styleTag: styleInput?.value || '',
        lyricSnippet: lyricsInput?.value || '',
        title: titleInput?.value || ''
      };
      autofillSunoForm(data);
      panel?.classList.add('sf-hidden');
    });

    // Preset chips inside Suno
    panel?.querySelectorAll('.sf-shortcut-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const s = tag.getAttribute('data-style') || '';
        const t = tag.getAttribute('data-title') || '';
        if (styleInput) styleInput.value = s;
        if (titleInput) titleInput.value = t;
        autofillSunoForm({ styleTag: s, lyricSnippet: lyricsInput?.value, title: t });
        panel?.classList.add('sf-hidden');
      });
    });
  }

  // Inject when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingWidget);
  } else {
    injectFloatingWidget();
  }
})();
`;

  const contentCss = `/* Suno Fusion Extension Floating Widget Styling */
.suno-fusion-fab-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999999;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.sf-fab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 10px 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sf-fab-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 12px 28px rgba(139, 92, 246, 0.55);
  background: linear-gradient(135deg, #9066f8, #6f74f5);
}

.sf-panel {
  position: absolute;
  bottom: 54px;
  right: 0;
  width: 330px;
  background: #111114;
  border: 1px solid #27272a;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  color: #f4f4f5;
  transition: opacity 0.2s, transform 0.2s;
  animation: sfFadeIn 0.2s ease-out;
}

.sf-hidden {
  display: none !important;
}

.sf-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid #27272a;
  padding-bottom: 8px;
}

.sf-panel-title {
  font-size: 14px;
  font-weight: 700;
  color: #fafafa;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sf-bolt-glow {
  color: #fbbf24;
  filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.6));
}

.sf-close-btn {
  background: none;
  border: none;
  color: #a1a1aa;
  font-size: 20px;
  cursor: pointer;
}

.sf-close-btn:hover {
  color: #ffffff;
}

.sf-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #a1a1aa;
  margin: 8px 0 4px;
}

.sf-textarea, .sf-input {
  width: 100%;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  color: #f4f4f5;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
  resize: vertical;
}

.sf-textarea:focus, .sf-input:focus {
  outline: none;
  border-color: #8b5cf6;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
}

.sf-action-btn {
  width: 100%;
  margin-top: 12px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  border: none;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  transition: opacity 0.15s;
}

.sf-action-btn:hover {
  opacity: 0.92;
}

.sf-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.sf-shortcut-tag {
  background: #27272a;
  border: 1px solid #3f3f46;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  color: #d4d4d8;
  cursor: pointer;
  transition: all 0.15s;
}

.sf-shortcut-tag:hover {
  background: #3f3f46;
  color: #ffffff;
  border-color: #8b5cf6;
}

/* Toast Notifications on Suno */
.suno-fusion-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #18181b;
  border: 1px solid #8b5cf6;
  color: #f4f4f5;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  z-index: 1000000;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 12px rgba(139, 92, 246, 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.3s, transform 0.3s;
}

.suno-fusion-toast.error {
  border-color: #ef4444;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 12px rgba(239, 68, 68, 0.3);
}

.sf-toast-hide {
  opacity: 0;
  transform: translate(-50%, -12px);
}

@keyframes sfFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

  const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Suno Fusion Sidekick</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="brand">
        <span class="bolt">⚡</span>
        <div>
          <h1>Suno Fusion</h1>
          <p class="subtitle">1-Click Suno.com AutoFill</p>
        </div>
      </div>
      <button id="open-suno-btn" class="icon-link-btn" title="Open Suno.com/create in new tab">
        ↗ Suno
      </button>
    </header>

    <main class="content">
      <div class="field-group">
        <label for="style-input">Style of Music (Prompt Box):</label>
        <textarea id="style-input" rows="3" placeholder="Enter or paste Suno prompt tags...">${defaultStyle}</textarea>
      </div>

      <div class="field-group">
        <label for="lyrics-input">Lyrics / Structure Scaffold:</label>
        <textarea id="lyrics-input" rows="2" placeholder="e.g. [Verse 1] ... [Chorus] ...">${defaultLyrics}</textarea>
      </div>

      <div class="field-group">
        <label for="title-input">Song Title:</label>
        <input type="text" id="title-input" value="${defaultTitle}" placeholder="Track Title" />
      </div>

      <div class="quick-fusions">
        <span class="tag" data-style="Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass, Juno-106" data-title="Shoegaze Trap">Shoegaze × Trap</span>
        <span class="tag" data-style="Cyber Funk, Celtic Folk, Darkwave, 128 BPM, bagpipes, synth bass" data-title="Neon Highlands">Cyber × Celtic</span>
        <span class="tag" data-style="Neo-City Pop, Neo-Tokyo Lo-Fi, 92 BPM, retro anime brass, Rhodes" data-title="City Midnight">City Pop × Lo-Fi</span>
        <span class="tag" data-style="Math Rock, POST-PUNK, Goth Rock, 148 BPM, angular guitars, chorus pedal" data-title="Tension Wire">Math × Goth</span>
      </div>

      <button id="fill-btn" class="primary-btn">
        ⚡ Inject Into Suno (Active Tab)
      </button>

      <p id="status-msg" class="status-msg"></p>
    </main>

    <footer class="footer">
      <span>Edge &amp; Chrome Manifest V3</span>
      <a href="https://suno.com/create" target="_blank" class="link">suno.com/create</a>
    </footer>
  </div>
  <script src="popup.js"></script>
</body>
</html>
`;

  const popupCss = `body {
  margin: 0;
  padding: 0;
  width: 340px;
  background: #09090b;
  color: #f4f4f5;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.container {
  padding: 14px 16px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #27272a;
  padding-bottom: 10px;
  margin-bottom: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bolt {
  font-size: 22px;
  color: #fbbf24;
  filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.5));
}

h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #fafafa;
}

.subtitle {
  margin: 0;
  font-size: 11px;
  color: #a1a1aa;
}

.icon-link-btn {
  background: #18181b;
  border: 1px solid #3f3f46;
  color: #d4d4d8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-link-btn:hover {
  background: #27272a;
  color: #ffffff;
  border-color: #8b5cf6;
}

.field-group {
  margin-bottom: 10px;
}

label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #a1a1aa;
  margin-bottom: 4px;
}

textarea, input {
  width: 100%;
  box-sizing: border-box;
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  color: #f4f4f5;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
}

textarea:focus, input:focus {
  outline: none;
  border-color: #8b5cf6;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
}

.quick-fusions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 10px 0 12px;
}

.tag {
  background: #18181b;
  border: 1px solid #27272a;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 10px;
  color: #a1a1aa;
  cursor: pointer;
  transition: all 0.15s;
}

.tag:hover {
  border-color: #8b5cf6;
  color: #ffffff;
  background: #27272a;
}

.primary-btn {
  width: 100%;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  border: none;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35);
  transition: transform 0.1s, opacity 0.15s;
}

.primary-btn:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}

.primary-btn:active {
  transform: translateY(0);
}

.status-msg {
  font-size: 11px;
  text-align: center;
  min-height: 16px;
  margin: 8px 0 0;
  font-weight: 500;
}

.status-msg.success { color: #34d399; }
.status-msg.error { color: #f87171; }

.footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #27272a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #71717a;
}

.link {
  color: #a78bfa;
  text-decoration: none;
}
.link:hover { text-decoration: underline; }
`;

  const popupJs = `// Suno Fusion Popup Controller
document.addEventListener('DOMContentLoaded', () => {
  const styleInput = document.getElementById('style-input');
  const lyricsInput = document.getElementById('lyrics-input');
  const titleInput = document.getElementById('title-input');
  const fillBtn = document.getElementById('fill-btn');
  const openSunoBtn = document.getElementById('open-suno-btn');
  const statusMsg = document.getElementById('status-msg');

  // Load last prompt if stored
  chrome.storage?.local?.get(['lastPrompt'], (res) => {
    if (res && res.lastPrompt) {
      if (res.lastPrompt.styleTag) styleInput.value = res.lastPrompt.styleTag;
      if (res.lastPrompt.lyricSnippet) lyricsInput.value = res.lastPrompt.lyricSnippet;
      if (res.lastPrompt.title) titleInput.value = res.lastPrompt.title;
    }
  });

  // Open Suno in new tab button
  openSunoBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://suno.com/create' });
  });

  // Quick clash tags
  document.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const s = tag.getAttribute('data-style');
      const t = tag.getAttribute('data-title');
      if (s) styleInput.value = s;
      if (t) titleInput.value = t;
    });
  });

  function setStatus(text, type = 'success') {
    statusMsg.textContent = text;
    statusMsg.className = 'status-msg ' + type;
    setTimeout(() => {
      statusMsg.textContent = '';
      statusMsg.className = 'status-msg';
    }, 4000);
  }

  fillBtn?.addEventListener('click', async () => {
    const prompt = {
      styleTag: styleInput.value.trim(),
      lyricSnippet: lyricsInput.value.trim(),
      title: titleInput.value.trim()
    };

    if (!prompt.styleTag) {
      setStatus('Please enter a Style of Music tag.', 'error');
      return;
    }

    // Save prompt locally
    chrome.storage?.local?.set({ lastPrompt: prompt });

    try {
      // Find active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.id) {
        setStatus('No active browser tab found.', 'error');
        return;
      }

      const isSuno = tab.url && (tab.url.includes('suno.com'));

      if (!isSuno) {
        setStatus('Active tab is not suno.com. Opening suno.com/create...', 'error');
        chrome.tabs.create({ url: 'https://suno.com/create' });
        return;
      }

      // Send autofill message to content script
      chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', prompt }, (response) => {
        if (chrome.runtime.lastError) {
          // If content script was not ready, inject dynamically
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }, () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', prompt }, (res2) => {
                setStatus('✓ Injected directly into Suno!', 'success');
              });
            }, 300);
          });
        } else {
          setStatus('✓ Auto-filled Style, Lyrics & Title into Suno!', 'success');
        }
      });
    } catch (err) {
      console.error(err);
      setStatus('Error communicating with Suno tab.', 'error');
    }
  });
});
`;

  const backgroundJs = `// Suno Fusion Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Suno Fusion] Extension installed and ready.');
});
`;

  const readmeMd = `# Suno Fusion - 1-Click AutoFill Edge & Chrome Extension (Manifest V3)

This extension connects the **Suno Fusion Prompt Generator** directly to **Suno AI (suno.com/create)**.

## What it Does:
1. **Auto-fills "Style of Music"**: Safely injects genre collisions, tempo BPM, time signature, instrument rigs, and audio bitrate tags directly into Suno.
2. **Auto-fills "Lyrics"**: Injects lyrical scaffolding and structure tags (\`[Intro]\`, \`[Verse]\`, \`[Chorus]\`, \`[Drop]\`).
3. **Auto-fills "Title"**: Injects the track title.
4. **Auto-toggles "Custom" Mode**: Automatically activates Custom mode on Suno if it is not already open.
5. **Floating Widget**: Adds a sleek, non-intrusive \`⚡ Suno Fusion\` quick-injector button right on \`suno.com\`.

---

## How to Install in Microsoft Edge (10 Seconds)
1. Unzip this folder (\`suno-fusion-extension\`).
2. In Microsoft Edge, go to: \`edge://extensions\`
3. Enable the **"Developer mode"** toggle in the left sidebar.
4. Click the **"Load unpacked"** button at the top.
5. Select this unzipped \`suno-fusion-extension\` folder.
6. Done! Pin the extension to your Edge toolbar.

---

## How to Install in Google Chrome (10 Seconds)
1. Unzip this folder (\`suno-fusion-extension\`).
2. In Google Chrome, go to: \`chrome://extensions\`
3. Enable the **"Developer mode"** toggle in the top-right corner.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select this unzipped \`suno-fusion-extension\` folder.
6. Done! Pin the extension to your Chrome toolbar.

---

## Usage on Suno AI:
1. Open [https://suno.com/create](https://suno.com/create).
2. You will see a glowing **⚡ Suno Fusion** floating button in the bottom-right.
3. Click it to choose quick genre fusions or auto-fill your saved prompts with 1 click!
4. Or click the extension icon in your browser toolbar to inject any prompt into the active Suno tab.
`;

  return {
    'manifest.json': manifest,
    'content.js': contentJs,
    'content.css': contentCss,
    'popup.html': popupHtml,
    'popup.js': popupJs,
    'popup.css': popupCss,
    'background.js': backgroundJs,
    'README.md': readmeMd
  };
}

// Generate base64 or blob icon for extension
export function createExtensionIconDataUrl(size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#8b5cf6');
  grad.addColorStop(0.5, '#6366f1');
  grad.addColorStop(1, '#ec4899');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.22);
  ctx.fill();

  // Bolt icon
  ctx.fillStyle = '#fde047';
  ctx.shadowColor = 'rgba(253, 224, 71, 0.7)';
  ctx.shadowBlur = size * 0.15;

  ctx.beginPath();
  const s = size;
  ctx.moveTo(s * 0.55, s * 0.15);
  ctx.lineTo(s * 0.25, s * 0.55);
  ctx.lineTo(s * 0.48, s * 0.55);
  ctx.lineTo(s * 0.42, s * 0.85);
  ctx.lineTo(s * 0.75, s * 0.42);
  ctx.lineTo(s * 0.52, s * 0.42);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL('image/png');
}

// Bundle all extension files into a zip file and trigger download
export async function downloadExtensionZip(samplePrompt?: GeneratedPrompt | null): Promise<void> {
  // If no samplePrompt override, try direct server-generated package first
  if (!samplePrompt) {
    try {
      const response = await fetch('/suno-fusion-extension.zip');
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'suno-fusion-extension.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
    } catch (e) {
      console.warn('Falling back to client-side JSZip generator:', e);
    }
  }

  const zip = new JSZip();
  const files = getExtensionSourceCode(samplePrompt);

  for (const [filename, content] of Object.entries(files)) {
    zip.file(filename, content);
  }

  // Generate icons
  const iconsFolder = zip.folder('icons');
  if (iconsFolder) {
    const icon16Url = createExtensionIconDataUrl(16);
    const icon48Url = createExtensionIconDataUrl(48);
    const icon128Url = createExtensionIconDataUrl(128);

    const base64Data = (url: string) => url.replace(/^data:image\/png;base64,/, '');

    if (icon16Url) iconsFolder.file('icon16.png', base64Data(icon16Url), { base64: true });
    if (icon48Url) iconsFolder.file('icon48.png', base64Data(icon48Url), { base64: true });
    if (icon128Url) iconsFolder.file('icon128.png', base64Data(icon128Url), { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'suno-fusion-extension.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
