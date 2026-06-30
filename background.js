/**
 * TabLocker — Background Service Worker
 *
 * Storage schema:
 *   passwordHash:    string   PBKDF2-SHA256 hex (32 bytes)
 *   passwordSalt:    string   PBKDF2 salt hex   (16 bytes)
 *   lockedURLs:      string[] normalized URL strings
 *   sessionUnlocked: string[] URLs unlocked this session
 *   failedAttempts:  number   unlock failures since last success
 *   lockedUntil:     number   epoch ms; 0 = not rate-limited
 */

importScripts('utils/crypto.js');

const BADGE_COLOR_LOCKED   = '#DC2626';
const BADGE_COLOR_UNLOCKED = '#10B981';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 30_000;

// ─── Startup ────────────────────────────────────────────────────────────────

// Clear session unlocks on SW restart (browser restart / extension reload)
chrome.storage.local.set({ sessionUnlocked: [] });

// Migration: detect old unsalted SHA-256 hash and force re-setup
(async () => {
  const data = await chrome.storage.local.get(['passwordHash', 'passwordSalt']);
  if (data.passwordHash && !data.passwordSalt) {
    // Old SHA-256 hash — wipe credentials so user must re-create password
    await chrome.storage.local.remove(['passwordHash', 'lockedURLs', 'sessionUnlocked']);
    console.log('[TabLocker] Migrated: old SHA-256 hash cleared, re-setup required');
  }
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeURL(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

async function isURLLocked(url) {
  const normalized = normalizeURL(url);
  if (!normalized) return false;
  const { lockedURLs = [] } = await chrome.storage.local.get('lockedURLs');
  return lockedURLs.includes(normalized);
}

async function isSessionUnlocked(url) {
  const normalized = normalizeURL(url);
  if (!normalized) return false;
  const { sessionUnlocked = [] } = await chrome.storage.local.get('sessionUnlocked');
  return sessionUnlocked.includes(normalized);
}

async function updateBadge(tabId, url) {
  const locked   = await isURLLocked(url);
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

async function sendOverlayAction(tabId, action) {
  try {
    await chrome.tabs.sendMessage(tabId, { action });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (e) {
      console.warn(`[TabLocker] Cannot inject into tab ${tabId}:`, e.message);
    }
  }
}

async function notifyMatchingTabs(normalizedURL, action) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (normalizeURL(tab.url) === normalizedURL) {
      await sendOverlayAction(tab.id, action);
      await updateBadge(tab.id, tab.url);
    }
  }
}

// ─── Tab Event Listeners ────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!normalizeURL(tab.url)) return;
  await updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) await updateBadge(tabId, tab.url);
  } catch { /* tab closed */ }
});

// ─── Message Router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'checkLock':        return handleCheckLock(message, sender);
    case 'setupPassword':    return handleSetupPassword(message);
    case 'verifyPassword':   return handleVerifyPassword(message);
    case 'changePassword':   return handleChangePassword(message);
    case 'lockURL':          return handleLockURL(message);
    case 'unlockURL':        return handleUnlockURL(message);
    case 'unlockTab':        return handleUnlockTab(message, sender);
    case 'getState':         return handleGetState(message);
    case 'removeLockedURL':  return handleRemoveLockedURL(message);
    default: return { success: false, error: `Unknown type: ${message.type}` };
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleCheckLock(message, sender) {
  if (!sender.tab?.url) return { locked: false };
  const locked   = await isURLLocked(sender.tab.url);
  const unlocked = await isSessionUnlocked(sender.tab.url);
  return { locked: locked && !unlocked };
}

async function handleSetupPassword({ password }) {
  if (!password || password.length < 4)
    return { success: false, error: 'Password must be at least 4 characters' };

  const { hash, salt } = await CryptoUtils.hashPassword(password);
  await chrome.storage.local.set({ passwordHash: hash, passwordSalt: salt });
  return { success: true };
}

async function handleVerifyPassword({ password }) {
  const data = await chrome.storage.local.get(['passwordHash', 'passwordSalt']);
  if (!data.passwordHash || !data.passwordSalt)
    return { success: false, error: 'No password set' };

  const valid = await CryptoUtils.verifyPassword(password, data.passwordHash, data.passwordSalt);
  return { success: valid, error: valid ? null : 'Incorrect password' };
}

async function handleChangePassword({ currentPassword, newPassword }) {
  const data = await chrome.storage.local.get(['passwordHash', 'passwordSalt']);
  if (!data.passwordHash || !data.passwordSalt)
    return { success: false, error: 'No password set' };

  const valid = await CryptoUtils.verifyPassword(currentPassword, data.passwordHash, data.passwordSalt);
  if (!valid) return { success: false, error: 'Current password is incorrect' };
  if (!newPassword || newPassword.length < 4)
    return { success: false, error: 'New password must be at least 4 characters' };

  const { hash, salt } = await CryptoUtils.hashPassword(newPassword);
  await chrome.storage.local.set({ passwordHash: hash, passwordSalt: salt });
  return { success: true };
}

async function handleLockURL({ url }) {
  const normalized = normalizeURL(url);
  if (!normalized) return { success: false, error: 'Invalid URL' };

  const { lockedURLs = [] } = await chrome.storage.local.get('lockedURLs');
  if (lockedURLs.includes(normalized)) return { success: false, error: 'Already locked' };

  lockedURLs.push(normalized);
  await chrome.storage.local.set({ lockedURLs });

  const { sessionUnlocked = [] } = await chrome.storage.local.get('sessionUnlocked');
  await chrome.storage.local.set({ sessionUnlocked: sessionUnlocked.filter(u => u !== normalized) });

  await notifyMatchingTabs(normalized, 'showOverlay');
  return { success: true, url: normalized };
}

async function handleRemoveLockedURL({ url }) {
  const normalized = normalizeURL(url);
  if (!normalized) return { success: false, error: 'Invalid URL' };

  const { lockedURLs = [] } = await chrome.storage.local.get('lockedURLs');
  await chrome.storage.local.set({ lockedURLs: lockedURLs.filter(u => u !== normalized) });

  const { sessionUnlocked = [] } = await chrome.storage.local.get('sessionUnlocked');
  await chrome.storage.local.set({ sessionUnlocked: sessionUnlocked.filter(u => u !== normalized) });

  await notifyMatchingTabs(normalized, 'removeOverlay');
  return { success: true };
}

async function handleUnlockTab({ password, url }, sender) {
  const data = await chrome.storage.local.get([
    'passwordHash', 'passwordSalt', 'failedAttempts', 'lockedUntil'
  ]);

  if (!data.passwordHash || !data.passwordSalt)
    return { success: false, error: 'No password configured' };

  // Rate limiting check
  const now = Date.now();
  const lockedUntil = data.lockedUntil || 0;
  if (now < lockedUntil) {
    const secsLeft = Math.ceil((lockedUntil - now) / 1000);
    return { success: false, error: `Too many attempts. Try again in ${secsLeft}s` };
  }

  const valid = await CryptoUtils.verifyPassword(password, data.passwordHash, data.passwordSalt);

  if (!valid) {
    const attempts = (data.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts };
    if (attempts >= MAX_ATTEMPTS) {
      update.lockedUntil = now + LOCKOUT_MS;
      update.failedAttempts = 0;
    }
    await chrome.storage.local.set(update);
    return { success: false, error: 'Incorrect password' };
  }

  // Success — reset rate limit
  await chrome.storage.local.set({ failedAttempts: 0, lockedUntil: 0 });

  const targetURL = url || sender.tab?.url;
  const normalized = normalizeURL(targetURL);
  if (normalized) {
    const { sessionUnlocked = [] } = await chrome.storage.local.get('sessionUnlocked');
    if (!sessionUnlocked.includes(normalized)) {
      await chrome.storage.local.set({ sessionUnlocked: [...sessionUnlocked, normalized] });
    }
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (normalizeURL(tab.url) === normalized) await updateBadge(tab.id, tab.url);
    }
  }

  return { success: true };
}

async function handleUnlockURL({ url }) {
  return handleRemoveLockedURL({ url });
}

async function handleGetState({ url }) {
  const data = await chrome.storage.local.get(['passwordHash', 'lockedURLs', 'sessionUnlocked']);
  const lockedURLs      = data.lockedURLs || [];
  const sessionUnlocked = data.sessionUnlocked || [];

  let currentURLLocked          = false;
  let currentURLSessionUnlocked = false;
  if (url) {
    const normalized = normalizeURL(url);
    currentURLLocked          = normalized ? lockedURLs.includes(normalized) : false;
    currentURLSessionUnlocked = normalized ? sessionUnlocked.includes(normalized) : false;
  }

  return {
    success: true,
    hasPassword: !!data.passwordHash,
    lockedURLs,
    sessionUnlocked,
    currentURLLocked,
    currentURLSessionUnlocked
  };
}
