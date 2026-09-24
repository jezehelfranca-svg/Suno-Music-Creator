import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Helper to generate the Chrome & Edge Manifest V3 Extension ZIP Buffer
async function createExtensionZipBuffer(): Promise<Buffer> {
  const zip = new JSZip();

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

  // React-safe synthetic input setter
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

  // Ensure "Custom" mode is active in Suno
  function ensureCustomModeActive() {
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

  // Find target inputs on Suno
  function findSunoInputs() {
    const styleTextarea = document.querySelector(
      'textarea[placeholder*="style" i], textarea[placeholder*="Style" i], textarea[aria-label*="Style" i], [data-testid="style-input"], textarea[name="style"]'
    ) || Array.from(document.querySelectorAll('textarea')).find(t => {
      const p = (t.placeholder || '').toLowerCase();
      return p.includes('genre') || p.includes('style') || p.includes('tags');
    });

    const lyricsTextarea = document.querySelector(
      'textarea[placeholder*="lyric" i], textarea[placeholder*="Lyric" i], textarea[aria-label*="Lyric" i], [data-testid="lyrics-input"], textarea[name="prompt"]'
    ) || Array.from(document.querySelectorAll('textarea')).find(t => {
      const p = (t.placeholder || '').toLowerCase();
      return p.includes('verse') || p.includes('chorus') || p.includes('words');
    });

    const titleInput = document.querySelector(
      'input[placeholder*="title" i], input[placeholder*="Title" i], input[aria-label*="Title" i], [data-testid="title-input"], input[name="title"]'
    );

    return { styleTextarea, lyricsTextarea, titleInput };
  }

  // Floating notification toast on suno.com
  function showToast(message, type = 'success') {
    const existing = document.getElementById('suno-fusion-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'suno-fusion-toast';
    toast.className = 'suno-fusion-toast ' + type;
    toast.innerHTML = \`
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">\${type === 'success' ? '⚡' : '⚠️'}</span>
        <span>\${message}</span>
      </div>
    \`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -10px)';
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
            showToast('Could not locate Suno inputs. Please ensure Custom mode is open on suno.com/create.', 'error');
          }
        }, 500);
      }
    }, 250);

    return { success: true };
  }

  // Listen for popup messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'AUTOFILL') {
      const res = autofillSunoForm(message.prompt);
      sendResponse(res);
    }
  });

  // Floating Corner Widget on suno.com
  function injectFloatingWidget() {
    if (document.getElementById('suno-fusion-fab')) return;

    const widget = document.createElement('div');
    widget.id = 'suno-fusion-fab';
    widget.className = 'suno-fusion-fab-container';
    widget.innerHTML = \`
      <button id="suno-fusion-toggle-btn" class="sf-fab-btn" title="Suno Fusion 1-Click AutoFill">
        <span style="font-size:16px;">⚡</span>
        <span>Suno Fusion</span>
      </button>

      <div id="suno-fusion-panel" class="sf-panel sf-hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #27272a;padding-bottom:8px;">
          <div style="font-size:14px;font-weight:700;color:#fafafa;display:flex;align-items:center;gap:6px;">
            <span style="color:#fbbf24;">⚡</span> Suno Fusion AutoFill
          </div>
          <button id="sf-panel-close" style="background:none;border:none;color:#a1a1aa;font-size:18px;cursor:pointer;">&times;</button>
        </div>

        <label style="display:block;font-size:11px;font-weight:600;color:#a1a1aa;margin:8px 0 4px;">Style of Music (Prompt Tag):</label>
        <textarea id="sf-input-style" class="sf-textarea" rows="3" placeholder="e.g. Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass..."></textarea>

        <label style="display:block;font-size:11px;font-weight:600;color:#a1a1aa;margin:8px 0 4px;">Lyrics &amp; Metatag Scaffold:</label>
        <textarea id="sf-input-lyrics" class="sf-textarea" rows="3" placeholder="e.g. [Verse 1] ... [Chorus] ..."></textarea>

        <label style="display:block;font-size:11px;font-weight:600;color:#a1a1aa;margin:8px 0 4px;">Track Title:</label>
        <input id="sf-input-title" type="text" class="sf-input" placeholder="e.g. Nebula Drift" />

        <button id="sf-btn-fill" class="sf-action-btn">
          ⚡ Auto-Fill Suno Form Now
        </button>

        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
          <span class="sf-shortcut-tag" data-style="Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass" data-title="Shoegaze Drill">Dream Pop × Trap</span>
          <span class="sf-shortcut-tag" data-style="Cyber Funk, Celtic Folk, Darkwave, 128 BPM, bagpipes, synth bass" data-title="Neon Highlands">Cyber × Celtic</span>
          <span class="sf-shortcut-tag" data-style="Neo-City Pop, Neo-Tokyo Lo-Fi, 92 BPM, Rhodes piano, retro anime brass" data-title="City Midnight">City Pop × Lo-Fi</span>
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

    toggleBtn?.addEventListener('click', () => {
      panel?.classList.toggle('sf-hidden');
    });

    closeBtn?.addEventListener('click', () => {
      panel?.classList.add('sf-hidden');
    });

    fillBtn?.addEventListener('click', () => {
      autofillSunoForm({
        styleTag: styleInput?.value || '',
        lyricSnippet: lyricsInput?.value || '',
        title: titleInput?.value || ''
      });
      panel?.classList.add('sf-hidden');
    });

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingWidget);
  } else {
    injectFloatingWidget();
  }
})();
`;

  const contentCss = `/* Suno Fusion Extension Floating Widget */
.suno-fusion-fab-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999999;
  font-family: system-ui, -apple-system, sans-serif;
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
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.45);
  transition: all 0.2s ease;
}

.sf-fab-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(139, 92, 246, 0.6);
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
}

.sf-hidden {
  display: none !important;
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
}

.sf-textarea:focus, .sf-input:focus {
  outline: none;
  border-color: #8b5cf6;
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
}

.sf-shortcut-tag {
  background: #27272a;
  border: 1px solid #3f3f46;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  color: #d4d4d8;
  cursor: pointer;
}

.sf-shortcut-tag:hover {
  background: #3f3f46;
  color: #ffffff;
  border-color: #8b5cf6;
}

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
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  transition: all 0.3s ease;
}
`;

  const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Suno Fusion Sidekick</title>
  <style>
    body { margin: 0; padding: 14px 16px; width: 330px; background: #09090b; color: #f4f4f5; font-family: system-ui, sans-serif; }
    h1 { margin: 0; font-size: 15px; font-weight: 700; color: #fafafa; }
    .label { display: block; font-size: 11px; font-weight: 600; color: #a1a1aa; margin: 8px 0 4px; }
    textarea, input { width: 100%; box-sizing: border-box; background: #18181b; border: 1px solid #27272a; border-radius: 8px; color: #f4f4f5; padding: 8px 10px; font-size: 12px; }
    textarea:focus, input:focus { outline: none; border-color: #8b5cf6; }
    .primary-btn { width: 100%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; border: none; padding: 10px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; margin-top: 12px; }
    .tag { background: #18181b; border: 1px solid #27272a; padding: 3px 7px; border-radius: 6px; font-size: 10px; color: #a1a1aa; cursor: pointer; display: inline-block; margin: 3px; }
    .status { font-size: 11px; text-align: center; min-height: 16px; margin-top: 8px; color: #34d399; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #27272a;padding-bottom:10px;margin-bottom:10px;">
    <div>
      <h1>⚡ Suno Fusion</h1>
      <span style="font-size:11px;color:#a1a1aa;">1-Click Suno.com AutoFill</span>
    </div>
    <a href="https://suno.com/create" target="_blank" style="color:#a78bfa;font-size:11px;text-decoration:none;font-weight:600;">↗ Open Suno</a>
  </div>

  <label class="label">Style of Music:</label>
  <textarea id="style-input" rows="3">Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass, Roland Juno-106</textarea>

  <label class="label">Lyrics / Metatags:</label>
  <textarea id="lyrics-input" rows="2">[Verse 1]&#10;Neon echoes in the twilight&#10;&#10;[Chorus]&#10;Drifting in the drift</textarea>

  <label class="label">Song Title:</label>
  <input type="text" id="title-input" value="Nebula Drift" />

  <div style="margin: 8px 0;">
    <span class="tag" data-style="Dream Pop, TRAP & DRILL, 140 BPM, ethereal vocals, 808 sub bass" data-title="Shoegaze Trap">Shoegaze × Trap</span>
    <span class="tag" data-style="Cyber Funk, Celtic Folk, Darkwave, 128 BPM, bagpipes, synth bass" data-title="Neon Highlands">Cyber × Celtic</span>
    <span class="tag" data-style="Neo-City Pop, Neo-Tokyo Lo-Fi, 92 BPM, Rhodes, retro brass" data-title="City Midnight">City Pop × Lo-Fi</span>
  </div>

  <button id="fill-btn" class="primary-btn">⚡ Inject Into Suno Tab</button>
  <div id="status" class="status"></div>

  <script src="popup.js"></script>
</body>
</html>
`;

  const popupJs = `// Suno Fusion Popup Script
document.addEventListener('DOMContentLoaded', () => {
  const styleInput = document.getElementById('style-input');
  const lyricsInput = document.getElementById('lyrics-input');
  const titleInput = document.getElementById('title-input');
  const fillBtn = document.getElementById('fill-btn');
  const statusDiv = document.getElementById('status');

  document.querySelectorAll('.tag').forEach(t => {
    t.addEventListener('click', () => {
      styleInput.value = t.getAttribute('data-style');
      titleInput.value = t.getAttribute('data-title');
    });
  });

  fillBtn?.addEventListener('click', async () => {
    const prompt = {
      styleTag: styleInput.value.trim(),
      lyricSnippet: lyricsInput.value.trim(),
      title: titleInput.value.trim()
    };

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusDiv.textContent = 'No active tab found.';
      return;
    }

    if (!tab.url || !tab.url.includes('suno.com')) {
      statusDiv.textContent = 'Active tab is not suno.com! Opening suno.com/create...';
      chrome.tabs.create({ url: 'https://suno.com/create' });
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', prompt }, () => {
      statusDiv.textContent = '✓ Auto-filled into Suno!';
      setTimeout(() => statusDiv.textContent = '', 3000);
    });
  });
});
`;

  const backgroundJs = `chrome.runtime.onInstalled.addListener(() => {
  console.log('[Suno Fusion] Extension installed.');
});
`;

  const readmeMd = `# Suno Fusion AutoFill Extension for Microsoft Edge & Google Chrome

## 10-Second Installation:
1. Unzip this folder (\`suno-fusion-extension\`).
2. In Edge, go to: \`edge://extensions\` (in Chrome, go to: \`chrome://extensions\`).
3. Turn **ON** the "Developer mode" toggle.
4. Click **"Load unpacked"** and select this unzipped folder!
5. Open **https://suno.com/create**.
6. You will see a glowing **⚡ Suno Fusion** floating button on Suno for 1-click prompt autofill!
`;

  // Standard 1x1 purple PNG base64 for extension icons
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  zip.file('manifest.json', manifest);
  zip.file('content.js', contentJs);
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

  return zip.generateAsync({ type: 'nodebuffer' });
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Resilient Gemini content generation with multi-model fallback and retry.
 * Handles 503 (model overloaded / high demand) and 429 gracefully.
 */
async function callGeminiWithResilience(
  contents: string,
  config: Record<string, unknown>
): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("NO_API_KEY");
  }

  // Model cascade: primary 3.8-flash, then 3.1-flash-lite, then gemini-flash-latest
  const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: unknown = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        const text = response.text;
        if (text && text.trim().length > 0) {
          return text;
        }
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTemporary =
          errMsg.includes("503") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED");

        console.warn(`[Gemini] Model ${model} (attempt ${attempt + 1}) returned:`, errMsg);

        if (isTemporary && attempt === 0) {
          // Brief backoff before retry
          await new Promise((r) => setTimeout(r, 800));
        } else {
          // Move to next candidate model
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models unavailable");
}

/**
 * Intelligent rule-based heuristic for Song Idea -> Fusion Matcher
 * Used when no API key is provided or during high API demand (503).
 */
function generateHeuristicInspiration(idea: string) {
  const text = (idea || "").toLowerCase();

  let genres: string[] = ["Neo-Tokyo", "Cyber Soul", "Dream Pop & Shoegaze"];
  let timeSig = "4/4";
  let minBpm = 95;
  let maxBpm = 130;
  let title = "Neon Meridian";
  let vibe = `Atmospheric cinematic fusion inspired by "${idea || 'your concept'}".`;

  if (text.includes("cyber") || text.includes("tokyo") || text.includes("neon") || text.includes("rain") || text.includes("motorcycle")) {
    genres = ["Neo-Tokyo", "Darksynth", "Cyber Soul"];
    minBpm = 110;
    maxBpm = 135;
    title = "Chrome Nightdrive";
    vibe = "Driving analog synths, dark pulsing basslines, and rain-soaked dystopian atmosphere.";
  } else if (text.includes("metal") || text.includes("guitar") || text.includes("rock") || text.includes("heavy") || text.includes("screaming")) {
    genres = ["Djent", "Alternative Rock / Indie II", "Industrial Rock / Metal"];
    minBpm = 130;
    maxBpm = 165;
    title = "Kinetic Surge";
    vibe = "Down-tuned polyrhythmic guitar riffs paired with relentless mechanical grooves.";
  } else if (text.includes("chill") || text.includes("lo-fi") || text.includes("relax") || text.includes("coffee") || text.includes("sleep")) {
    genres = ["Indietronica & Chillwave", "Neo / Nu Soul", "Ambient Breaks & Illbient"];
    minBpm = 75;
    maxBpm = 92;
    title = "Velvet Drift";
    vibe = "Warm vinyl crackle, detuned electric keys, and dusty laid-back syncopated drum breaks.";
  } else if (text.includes("celtic") || text.includes("ancient") || text.includes("folk") || text.includes("warrior") || text.includes("tribal")) {
    genres = ["American & British Folk Revival", "Dark Ambient / Dark Industrial", "Trip Hop"];
    timeSig = "6/8";
    minBpm = 85;
    maxBpm = 120;
    title = "Ethereal Rite";
    vibe = "Haunting acoustic instrumentation laced with heavy low-end sub frequencies and ceremonial rhythms.";
  } else if (text.includes("anime") || text.includes("j-pop") || text.includes("japanese") || text.includes("city pop")) {
    genres = ["Asian Pop", "Math Rock & MathCORE", "Electropop"];
    minBpm = 145;
    maxBpm = 175;
    title = "Prism Overdrive";
    vibe = "High-energy sparkling melodies, complex syncopated basslines, and euphoric vocal peaks.";
  } else if (text.includes("trap") || text.includes("hip hop") || text.includes("rap") || text.includes("808") || text.includes("club")) {
    genres = ["Urban Soul / Pop (Nu R&B I)", "Trap & Boom Bap", "Nu Disco & Funktronnica"];
    minBpm = 120;
    maxBpm = 140;
    title = "Subterranean Bounce";
    vibe = "Rattling hi-hats, cavernous sub bass, and glossy soul hooks.";
  } else if (text.includes("jazz") || text.includes("coffee") || text.includes("smooth")) {
    genres = ["Nu Jazz / Electro Jazz", "Cool & West Coast Jazz", "Bossa Nova"];
    timeSig = "4/4";
    minBpm = 88;
    maxBpm = 115;
    title = "Midnight Lounge";
    vibe = "Sophisticated modal chord extensions, brushed acoustic drums, and velvet Rhodes melodies.";
  }

  return {
    suggestedGenres: genres,
    timeSig,
    minBpm,
    maxBpm,
    conceptTitle: title,
    vibeDescription: vibe,
    aiPowered: false,
    notice: "Generated with our built-in intelligent music engine."
  };
}

/**
 * Intelligent rule-based heuristic for Suno V4 Prompt Polish
 */
function generateHeuristicEnhancement(prompt?: string, genres?: string[], timeSig?: string, bpm?: number, key?: string) {
  const genreList = genres && genres.length > 0 ? genres.join(", ") : "Cinematic Hybrid";
  const primaryGenre = genres && genres.length > 0 ? genres[0] : "Hybrid Sound";

  return {
    enhancedSunoTag: `${genreList}, ${bpm || '120'} BPM, ${timeSig || '4/4'}, ${key || 'A minor'}, dynamic stereo field, pristine mix, expressive vocal performance, textured soundstage, Suno v4 clarity`,
    arrangementNotes: [
      `Intro: Establish harmonic motifs for ${primaryGenre} with spacious atmospheric texture and subtle filter sweep`,
      "Verse 1: Strip down to rhythmic core and intimate dry lead vocal to build narrative tension",
      "Chorus: Explode into full stereo width with wide-layered harmonies, driving percussion, and saturated bass",
      "Bridge: Modulate dynamics or shift rhythmic subdivision before the explosive final drop",
      "Outro: Ambient decay leaving the primary melodic hook echoing into deep stereo reverb"
    ],
    suggestedMetatags: [
      "[Intro: Atmospheric Filtered Build]",
      "[Verse 1: Low Sub Dynamics]",
      "[Pre-Chorus: Rising Rhythmic Tension]",
      "[Chorus: Wide Stereo Full Band Climax]",
      "[Bridge: Half-Time Breakdown & Solo]",
      "[Outro: Ambient Reverb Fade]"
    ],
    customLyrics: `[Intro: Atmospheric]\n(Atmospheric synth motifs float in the stereo field)\n\n[Verse 1]\nWhispers through the neon glow\nEchoes where the currents flow\nTracing shadows on the glass\nWaiting for the storm to pass\n\n[Chorus]\nRise into the melody!\nBreak through our reality!\nHeartbeats pounding through the wire\nBurning with sonic fire!\n\n[Outro: Fade Out]\n(Melody echoes into deep stereo decay)`,
    aiPowered: false,
    notice: "Generated with our rule-based production upgrade engine."
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", hasAi: Boolean(process.env.GEMINI_API_KEY) });
  });

  // AI Prompt Enhancement for Suno V4
  app.post("/api/ai/enhance", async (req, res) => {
    const { prompt, genres, timeSig, bpm, key } = req.body;

    try {
      const systemPrompt = `You are an elite music producer and Suno AI prompting specialist. Your task is to take a musical fusion concept and optimize it specifically for Suno AI v4 and v3.5.
Return JSON with the following schema:
{
  "enhancedSunoTag": "string (<180 chars, comma-separated style tokens with genres, mood, instrumentation, vocal characteristics, BPM, key - highly effective for Suno's Style of Music input box)",
  "arrangementNotes": ["array of 4-5 tactical production & sound design tips for this fusion"],
  "suggestedMetatags": ["array of 6 structural metatags suitable for Suno lyrics"],
  "customLyrics": "a 12-line starter lyrics template formatted with Suno structural metatags [Intro], [Verse 1], [Chorus], [Outro]"
}`;

      const userMessage = `Optimize this Suno fusion prompt:
Genres: ${genres ? genres.join(' + ') : 'Custom'}
Time Signature: ${timeSig || '4/4'}
BPM: ${bpm || '120'}
Key: ${key || 'A minor'}
Original Prompt: "${prompt || ''}"`;

      const responseText = await callGeminiWithResilience(
        `${systemPrompt}\n\n${userMessage}`,
        {
          responseMimeType: "application/json",
          temperature: 0.7,
        }
      );

      const parsed = JSON.parse(responseText);
      return res.json({ ...parsed, aiPowered: true });
    } catch (err: unknown) {
      console.warn("AI enhance falling back to heuristic engine due to:", err instanceof Error ? err.message : String(err));
      // Seamless graceful fallback: Never break user experience due to API spikes
      const fallback = generateHeuristicEnhancement(prompt, genres, timeSig, bpm, key);
      return res.json(fallback);
    }
  });

  // AI Idea to Prompt: convert natural language ideas to curated genre picks
  app.post("/api/ai/inspire", async (req, res) => {
    const { idea } = req.body;

    try {
      const systemPrompt = `You are a music curator matching creative song concepts to genres.
You must recommend 2 or 3 distinct music genres (choose from standard genres or coined styles like Neo-Tokyo, Cyberpunk, Shoegaze, Math Rock, Synthwave, City Pop, Vaporwave, Djent, etc.) that best embody the user's vision.
Return JSON with this schema:
{
  "suggestedGenres": ["Genre 1", "Genre 2", "Genre 3 (optional)"],
  "timeSig": "4/4 or 3/4 or 7/8 or 6/8",
  "minBpm": number (40-220),
  "maxBpm": number (minBpm to 240),
  "conceptTitle": "Evocative 2-word title",
  "vibeDescription": "1-2 sentence description of this hybrid sound"
}`;

      const responseText = await callGeminiWithResilience(
        `${systemPrompt}\n\nConcept Idea: "${idea || ''}"`,
        {
          responseMimeType: "application/json",
          temperature: 0.8,
        }
      );

      const parsed = JSON.parse(responseText);
      return res.json({ ...parsed, aiPowered: true });
    } catch (err: unknown) {
      console.warn("AI inspire falling back to heuristic engine due to:", err instanceof Error ? err.message : String(err));
      // Seamless graceful fallback: Never break user experience due to API spikes
      const fallback = generateHeuristicInspiration(idea);
      return res.json(fallback);
    }
  });

  // Direct Download Endpoint for Suno Chrome & Edge Extension ZIP
  app.get("/api/download-extension-zip", async (_req, res) => {
    try {
      const zipPath = path.join(process.cwd(), "public", "suno-fusion-extension.zip");
      if (fs.existsSync(zipPath)) {
        return res.download(zipPath, "suno-fusion-extension.zip");
      }
      const buffer = await createExtensionZipBuffer();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="suno-fusion-extension.zip"');
      res.setHeader("Content-Length", buffer.length);
      return res.send(buffer);
    } catch (err) {
      console.error("Failed to generate extension zip:", err);
      return res.status(500).json({ error: "Failed to build extension zip" });
    }
  });

  // Pre-generate public/suno-fusion-extension.zip for direct static download
  try {
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    createExtensionZipBuffer().then(buf => {
      fs.writeFileSync(path.join(publicDir, "suno-fusion-extension.zip"), buf);
      console.log("[Extension] Pre-built public/suno-fusion-extension.zip successfully");
    }).catch(e => console.error("Error pre-building zip:", e));
  } catch (err) {
    console.warn("Could not pre-build static zip:", err);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

