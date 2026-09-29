import JSZip from 'jszip';
import { GeneratedPrompt } from '../types';
import { syncCreationToExtension } from './extensionSync';

import manifestText from '../../extension/manifest.json?raw';
import contentJs from '../../extension/content.js?raw';
import contentCss from '../../extension/content.css?raw';
import popupHtml from '../../extension/popup.html?raw';
import popupJs from '../../extension/popup.js?raw';
import bridgeJs from '../../extension/bridge.js?raw';
import backgroundJs from '../../extension/background.js?raw';
import readmeMd from '../../extension/README.md?raw';

export interface ExtensionFiles {
  'manifest.json': string;
  'content.js': string;
  'content.css': string;
  'popup.html': string;
  'popup.js': string;
  'bridge.js': string;
  'background.js': string;
  'README.md': string;
}

// Preview and fallback download use the same built extension as the server ZIP.
// Active prompts travel via extensionSync rather than changing extension source.
export function getExtensionSourceCode(_samplePrompt?: GeneratedPrompt | null): ExtensionFiles {
  return {
    'manifest.json': manifestText,
    'content.js': contentJs,
    'content.css': contentCss,
    'popup.html': popupHtml,
    'popup.js': popupJs,
    'bridge.js': bridgeJs,
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
  if (samplePrompt) syncCreationToExtension(samplePrompt);
  try {
    const response = await fetch('/api/download-extension-zip');
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
