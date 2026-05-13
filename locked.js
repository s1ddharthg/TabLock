/**
 * TabLocker — Lock Screen Logic
 *
 * Runs on locked.html — the page users see when they
 * try to access a locked URL. Reads original URL, tabId,
 * favicon, and title from query params.
 */

(function () {
  'use strict';

  // ─── Parse Query Parameters ─────────────────────────────────────────────────

  const params = new URLSearchParams(window.location.search);
  const originalURL = params.get('url');
  const tabId = params.get('tabId');
  const favicon = params.get('favicon');
  const title = params.get('title');

  if (!originalURL || !tabId) {
    console.error('[TabLocker] Lock screen: missing url or tabId params');
    document.body.innerHTML = '<p style="color:#F87171;text-align:center;padding:40px;">Error: Invalid lock screen state.</p>';
    return;
  }

  // ─── DOM Elements ───────────────────────────────────────────────────────────

  const tabInfoEl = document.getElementById('tabInfo');
  const tabFaviconEl = document.getElementById('tabFavicon');
  const tabTitleEl = document.getElementById('tabTitle');
  const lockedURLEl = document.getElementById('lockedURL');
  const unlockForm = document.getElementById('unlockForm');
  const passwordInput = document.getElementById('passwordInput');
  const errorMessage = document.getElementById('errorMessage');
  const unlockButton = document.getElementById('unlockButton');
  const unlockText = document.getElementById('unlockText');
  const unlockSpinner = document.getElementById('unlockSpinner');
  const toggleVisibility = document.getElementById('toggleVisibility');
  const lockCard = document.querySelector('.lock-card');

  // ─── Display Tab Info (favicon + title) ─────────────────────────────────────

  if (favicon) {
    tabFaviconEl.src = favicon;
    tabFaviconEl.alt = 'Site icon';
    tabFaviconEl.onerror = () => {
      tabFaviconEl.classList.add('hidden');
    };
  } else {
    tabFaviconEl.classList.add('hidden');
  }

  if (title) {
    tabTitleEl.textContent = title;
  } else {
    // Fallback to hostname
    try {
      tabTitleEl.textContent = new URL(originalURL).hostname;
    } catch {
      tabTitleEl.textContent = 'Locked Tab';
    }
  }

  // ─── Display Locked URL ─────────────────────────────────────────────────────

  try {
    const urlObj = new URL(originalURL);
    lockedURLEl.textContent = urlObj.hostname + urlObj.pathname;
  } catch {
    lockedURLEl.textContent = originalURL;
  }

  // ─── Toggle Password Visibility ─────────────────────────────────────────────

  let passwordVisible = false;
  toggleVisibility.addEventListener('click', () => {
    passwordVisible = !passwordVisible;
    passwordInput.type = passwordVisible ? 'text' : 'password';
    toggleVisibility.title = passwordVisible ? 'Hide password' : 'Show password';
  });

  // ─── Form Submission ────────────────────────────────────────────────────────

  unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = passwordInput.value.trim();
    if (!password) {
      showError('Please enter your password');
      return;
    }

    setLoading(true);
    clearError();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'unlockTab',
        password,
        url: originalURL,
        tabId
      });

      if (response && response.success) {
        // Success — flash green and animate out
        document.body.classList.add('unlock-success');
        lockCard.classList.add('unlocking');
        console.log('[TabLocker] Tab unlocked successfully');
      } else {
        showError(response?.error || 'Incorrect password');
        passwordInput.classList.add('error');
        passwordInput.focus();
        passwordInput.select();
        setTimeout(() => passwordInput.classList.remove('error'), 400);
      }
    } catch (err) {
      console.error('[TabLocker] Unlock error:', err);
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function showError(msg) {
    errorMessage.textContent = msg;
  }

  function clearError() {
    errorMessage.textContent = '';
  }

  function setLoading(loading) {
    unlockButton.disabled = loading;
    unlockText.textContent = loading ? 'Verifying...' : 'Unlock Tab';
    unlockSpinner.classList.toggle('hidden', !loading);
  }

})();
