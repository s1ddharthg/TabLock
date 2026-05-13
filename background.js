/**
 * TabLocker — Background Service Worker
 *
 * Responsibilities:
 * - Manage locked URLs in chrome.storage.local
 * - Send overlay show/hide messages to content scripts
 * - Handle message passing from popup and content scripts
 * - Update badge icons on locked tabs
 *
 * Storage schema:
 *   passwordHash: string (SHA-256 hex)
 *   lockedURLs: string[] (array of normalized URL strings)
 *   sessionUnlocked: string[] (URLs temporarily unlocked this session)
 */

// Import crypto utilities
importScripts('utils/crypto.js');

// ─── Constants ────────────────────────────────────────────────────────────────

const BADGE_COLOR_LOCKED = '#DC2626';
const BADGE_COLOR_UNLOCKED = '#10B981';

// ─── Initialization ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[TabLocker] Extension installed/updated:', details.reason);

  // Only initialize storage on fresh install — never wipe existing data
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get(['passwordHash', 'lockedURLs']);
    if (!data.passwordHash) {
      await chrome.storage.local.set({ passwordHash: null, lockedURLs: [] });
      console.log('[TabLocker] Initialized fresh storage');
    }
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a URL by stripping query params and hash for consistent matching.
 */
function normalizeURL(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
      return null;
    }
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

async function isURLLocked(url) {
  const normalized = normalizeURL(url);
  if (!normalized) return false;
  const data = await chrome.storage.local.get(['lockedURLs']);
  return (data.lockedURLs || []).includes(normalized);
}

async function isSessionUnlocked(url) {
  const normalized = normalizeURL(url);
  if (!normalized) return false;
  const data = await chrome.storage.local.get(['sessionUnlocked']);
  return (data.sessionUnlocked || []).includes(normalized);
}

/**
 * Update the badge for a specific tab.
 */
async function updateBadge(tabId, url) {
  const locked = await isURLLocked(url);
  const unlocked = await isSessionUnlocked(url);

  if (locked && !unlocked) {
    await chrome.action.setBadgeText({ text: '🔒', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_LOCKED, tabId });
  } else if (locked && unlocked) {
    await chrome.action.setBadgeText({ text: '🔓', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_UNLOCKED, tabId });
  } else {
    await chrome.action.setBadgeText({ text: '', tabId });
  }
}

/**
 * Send overlay message to a tab. If content script isn't loaded, inject it first.
 */
async function sendOverlayAction(tabId, action) {
  try {
    await chrome.tabs.sendMessage(tabId, { action });
  } catch {
    // Content script not loaded — inject it, which will auto-check lock state
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      console.log(`[TabLocker] Injected content script into tab ${tabId}`);
    } catch (e) {
      console.warn(`[TabLocker] Cannot inject into tab ${tabId}:`, e.message);
    }
  }
}

/**
 * Notify all open tabs matching a URL to show or remove overlay.
 */
async function notifyMatchingTabs(normalizedURL, action) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const tabNorm = normalizeURL(tab.url);
    if (tabNorm === normalizedURL) {
      await sendOverlayAction(tab.id, action);
      await updateBadge(tab.id, tab.url);
    }
  }
}

// ─── Tab Event Listeners ────────────────────────────────────────────────────

/**
 * On tab URL change completion — update badge.
 * Content script handles showing overlay on its own init.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  const normalized = normalizeURL(tab.url);
  if (!normalized) return;
  await updateBadge(tabId, tab.url);
});

/**
 * On tab activation — update badge.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;
    await updateBadge(activeInfo.tabId, tab.url);
  } catch {
    // Tab may not exist
  }
});

// ─── Message Handlers ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[TabLocker] Message handler error:', err);
      sendResponse({ success: false, error: err.message });
    });
  return true; // Required for async sendResponse
});

async function handleMessage(message, sender) {
  console.log('[TabLocker] Received message:', message.type);

  switch (message.type) {
    case 'checkLock':
      return await handleCheckLock(message, sender);
    case 'setupPassword':
      return await handleSetupPassword(message);
    case 'verifyPassword':
      return await handleVerifyPassword(message);
    case 'changePassword':
      return await handleChangePassword(message);
    case 'lockURL':
      return await handleLockURL(message);
    case 'unlockURL':
      return await handleUnlockURL(message);
    case 'unlockTab':
      return await handleUnlockTab(message, sender);
    case 'getState':
      return await handleGetState(message);
    case 'removeLockedURL':
      return await handleRemoveLockedURL(message);
    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

/**
 * Check if the sender tab's URL is locked (used by content script on init).
 */
async function handleCheckLock(message, sender) {
  if (!sender.tab || !sender.tab.url) {
    return { locked: false };
  }
  const url = sender.tab.url;
  const locked = await isURLLocked(url);
  const sessionUnlocked = await isSessionUnlocked(url);
  return { locked: locked && !sessionUnlocked };
}

async function handleSetupPassword({ password }) {
  if (!password || password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters' };
  }
  const hash = await CryptoUtils.hashPassword(password);
  await chrome.storage.local.set({ passwordHash: hash });
  console.log('[TabLocker] Master password set');
  return { success: true };
}

async function handleVerifyPassword({ password }) {
  const data = await chrome.storage.local.get(['passwordHash']);
  if (!data.passwordHash) {
    return { success: false, error: 'No password set' };
  }
  const valid = await CryptoUtils.verifyPassword(password, data.passwordHash);
  return { success: valid, error: valid ? null : 'Incorrect password' };
}

async function handleChangePassword({ currentPassword, newPassword }) {
  const data = await chrome.storage.local.get(['passwordHash']);
  if (!data.passwordHash) {
    return { success: false, error: 'No password set' };
  }
  const valid = await CryptoUtils.verifyPassword(currentPassword, data.passwordHash);
  if (!valid) {
    return { success: false, error: 'Current password is incorrect' };
  }
  if (!newPassword || newPassword.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters' };
  }
  const newHash = await CryptoUtils.hashPassword(newPassword);
  await chrome.storage.local.set({ passwordHash: newHash });
  console.log('[TabLocker] Master password changed');
  return { success: true };
}

/**
 * Lock a URL — adds to lockedURLs and shows overlay on matching tabs.
 */
async function handleLockURL({ url }) {
  const normalized = normalizeURL(url);
  if (!normalized) {
    return { success: false, error: 'Invalid URL' };
  }

  const data = await chrome.storage.local.get(['lockedURLs']);
  const lockedURLs = data.lockedURLs || [];
  if (lockedURLs.includes(normalized)) {
    return { success: false, error: 'URL is already locked' };
  }

  lockedURLs.push(normalized);
  await chrome.storage.local.set({ lockedURLs });

  // Remove from session unlocked
  const sessionData = await chrome.storage.local.get(['sessionUnlocked']);
  const sessionUnlocked = (sessionData.sessionUnlocked || []).filter(u => u !== normalized);
  await chrome.storage.local.set({ sessionUnlocked });

  console.log(`[TabLocker] Locked URL: ${normalized}`);

  // Show overlay on all matching tabs
  await notifyMatchingTabs(normalized, 'showOverlay');

  return { success: true, url: normalized };
}

/**
 * Remove a URL from the locked list and remove overlay from matching tabs.
 */
async function handleRemoveLockedURL({ url }) {
  const normalized = normalizeURL(url);
  if (!normalized) {
    return { success: false, error: 'Invalid URL' };
  }

  const data = await chrome.storage.local.get(['lockedURLs']);
  const lockedURLs = (data.lockedURLs || []).filter(u => u !== normalized);
  await chrome.storage.local.set({ lockedURLs });

  const sessionData = await chrome.storage.local.get(['sessionUnlocked']);
  const sessionUnlocked = (sessionData.sessionUnlocked || []).filter(u => u !== normalized);
  await chrome.storage.local.set({ sessionUnlocked });

  console.log(`[TabLocker] Removed lock for URL: ${normalized}`);

  // Remove overlay from all matching tabs
  await notifyMatchingTabs(normalized, 'removeOverlay');

  return { success: true };
}

/**
 * Session-unlock a tab — verify password, add to sessionUnlocked,
 * and tell the content script to remove overlay. NO page reload.
 */
async function handleUnlockTab({ password, url }, sender) {
  const data = await chrome.storage.local.get(['passwordHash']);
  if (!data.passwordHash) {
    return { success: false, error: 'No password configured' };
  }

  const valid = await CryptoUtils.verifyPassword(password, data.passwordHash);
  if (!valid) {
    console.log('[TabLocker] Failed unlock attempt for:', url);
    return { success: false, error: 'Incorrect password' };
  }

  // Determine the URL to session-unlock
  const targetURL = url || (sender.tab && sender.tab.url);
  const normalized = normalizeURL(targetURL);
  if (normalized) {
    const sessionData = await chrome.storage.local.get(['sessionUnlocked']);
    const sessionUnlocked = sessionData.sessionUnlocked || [];
    if (!sessionUnlocked.includes(normalized)) {
      sessionUnlocked.push(normalized);
      await chrome.storage.local.set({ sessionUnlocked });
    }

    // Update badges on matching tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (normalizeURL(tab.url) === normalized) {
        await updateBadge(tab.id, tab.url);
      }
    }
  }

  console.log(`[TabLocker] Session-unlocked: ${targetURL}`);
  // Content script removes the overlay itself based on this response
  return { success: true };
}

async function handleUnlockURL({ url }) {
  return await handleRemoveLockedURL({ url });
}

/**
 * Get state for popup.
 */
async function handleGetState({ url }) {
  const data = await chrome.storage.local.get(['passwordHash', 'lockedURLs', 'sessionUnlocked']);
  const hasPassword = !!data.passwordHash;
  const lockedURLs = data.lockedURLs || [];
  const sessionUnlocked = data.sessionUnlocked || [];

  let currentURLLocked = false;
  let currentURLSessionUnlocked = false;
  if (url) {
    const normalized = normalizeURL(url);
    currentURLLocked = normalized ? lockedURLs.includes(normalized) : false;
    currentURLSessionUnlocked = normalized ? sessionUnlocked.includes(normalized) : false;
  }

  return {
    success: true,
    hasPassword,
    lockedURLs,
    sessionUnlocked,
    currentURLLocked,
    currentURLSessionUnlocked
  };
}

// ─── Startup ────────────────────────────────────────────────────────────────

// Clear session unlocks on service worker start (browser restart)
chrome.storage.local.set({ sessionUnlocked: [] });
console.log('[TabLocker] Service worker started — session unlocks cleared');
