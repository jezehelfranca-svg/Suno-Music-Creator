// Suno Fusion v2.5 - Background Service Worker with Side Panel Support
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Suno Fusion v2.5] Background service worker initialized');

  // Configure side panel behavior (opens in Chrome 114+ and Edge)
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.log('[Suno Fusion] Side panel behavior setup:', err);
    });
  }

  // Create context menu to open side panel anytime
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'sf-open-sidepanel',
        title: '⚡ Open Suno Fusion in Sidebar / Side Panel',
        contexts: ['all']
      });
      chrome.contextMenus.create({
        id: 'sf-open-suno',
        title: '🎵 Go to Suno Create (suno.com/create)',
        contexts: ['all']
      });
      chrome.contextMenus.create({
        id: 'sf-open-topmediai',
        title: '🎶 Go to TopMediai Music Generator',
        contexts: ['all']
      });
    });
  }
});

// Handle Context Menu clicks
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'sf-open-sidepanel' && tab) {
      if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
          if (tab.windowId) {
            chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
          }
        });
      }
    } else if (info.menuItemId === 'sf-open-suno') {
      chrome.tabs.create({ url: 'https://suno.com/create' });
    } else if (info.menuItemId === 'sf-open-topmediai') {
      chrome.tabs.create({ url: 'https://www.topmediai.com/ai-music-generator/' });
    }
  });
}

// Listen for messages from popup or content script requesting side panel open
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'RELOAD_EXTENSION') {
    chrome.tabs.query({ url: '*://*.suno.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(t => { if (t.id) chrome.tabs.reload(t.id).catch(() => {}); });
      }
      setTimeout(() => {
        chrome.runtime.reload();
      }, 350);
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'OPEN_SIDE_PANEL') {
    const targetTabId = message.tabId || sender?.tab?.id;
    const targetWindowId = message.windowId || sender?.tab?.windowId;
    if (chrome.sidePanel && chrome.sidePanel.open) {
      if (targetTabId) {
        chrome.sidePanel.open({ tabId: targetTabId })
          .then(() => sendResponse({ success: true }))
          .catch((err) => {
            if (targetWindowId) {
              chrome.sidePanel.open({ windowId: targetWindowId })
                .then(() => sendResponse({ success: true }))
                .catch((e) => sendResponse({ success: false, error: e.message }));
            } else {
              sendResponse({ success: false, error: err.message });
            }
          });
        return true; // Keep message channel open for async response
      }
    }
  }
});
