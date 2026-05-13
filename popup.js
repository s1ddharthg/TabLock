/**
 * TabLocker — Popup Logic
 *
 * Three-state toggle for current tab:
 *   NOT locked        → green "Open" status, "Lock This Tab" red button
 *   Locked+active     → red "Locked" status, locked indicator
 *   Locked+session-ok → green "Unlocked" status, "Lock This Tab" option
 */

(function () {
  'use strict';

  // ─── DOM References ─────────────────────────────────────────────────────────

  const setupView = document.getElementById('setupView');
  const mainView = document.getElementById('mainView');
  const changePasswordView = document.getElementById('changePasswordView');

  const setupForm = document.getElementById('setupForm');
  const setupPassword = document.getElementById('setupPassword');
  const setupConfirm = document.getElementById('setupConfirm');
  const setupError = document.getElementById('setupError');
  const setupButton = document.getElementById('setupButton');
  const setupBtnText = document.getElementById('setupBtnText');
  const setupSpinner = document.getElementById('setupSpinner');

  const currentURLEl = document.getElementById('currentURL');
  const toggleLockButton = document.getElementById('toggleLockButton');
  const toggleLockIcon = document.getElementById('toggleLockIcon');
  const toggleLockText = document.getElementById('toggleLockText');
  const lockedList = document.getElementById('lockedList');
  const lockedCount = document.getElementById('lockedCount');
  const emptyState = document.getElementById('emptyState');
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  const changePasswordForm = document.getElementById('changePasswordForm');
  const currentPasswordInput = document.getElementById('currentPasswordInput');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
  const changePasswordError = document.getElementById('changePasswordError');
  const cancelChangePassword = document.getElementById('cancelChangePassword');
  const changeBtnText = document.getElementById('changeBtnText');
  const changeSpinner = document.getElementById('changeSpinner');

  let currentTabURL = null;
  let currentTabId = null;
  let isCurrentURLLocked = false;
  let isCurrentURLSessionUnlocked = false;

  // ─── Initialize ─────────────────────────────────────────────────────────────

  init();

  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTabURL = tab.url;
      currentTabId = tab.id;
    }

    const state = await chrome.runtime.sendMessage({ type: 'getState', url: currentTabURL });

    if (!state.hasPassword) {
      showView('setup');
    } else {
      renderMainView(state);
      showView('main');
    }
  }

  function showView(name) {
    setupView.classList.add('hidden');
    mainView.classList.add('hidden');
    changePasswordView.classList.add('hidden');
    if (name === 'setup') setupView.classList.remove('hidden');
    if (name === 'main') mainView.classList.remove('hidden');
    if (name === 'change') changePasswordView.classList.remove('hidden');
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setupError.textContent = '';
    const pw = setupPassword.value;
    const confirm = setupConfirm.value;

    if (!pw || pw.length < 4) { setupError.textContent = 'Password must be at least 4 characters'; return; }
    if (pw !== confirm) { setupError.textContent = 'Passwords do not match'; return; }

    setSetupLoading(true);
    const response = await chrome.runtime.sendMessage({ type: 'setupPassword', password: pw });
    setSetupLoading(false);

    if (response.success) {
      showToast('Password set!');
      const state = await chrome.runtime.sendMessage({ type: 'getState', url: currentTabURL });
      renderMainView(state);
      showView('main');
    } else {
      setupError.textContent = response.error || 'Failed';
    }
  });

  function setSetupLoading(loading) {
    setupButton.disabled = loading;
    setupBtnText.textContent = loading ? 'Setting up...' : 'Set Password';
    setupSpinner.classList.toggle('hidden', !loading);
  }

  // ─── Main View ──────────────────────────────────────────────────────────────

  function renderMainView(state) {
    isCurrentURLLocked = state.currentURLLocked;
    isCurrentURLSessionUnlocked = state.currentURLSessionUnlocked || false;

    if (currentTabURL) {
      try {
        const url = new URL(currentTabURL);
        if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
          currentURLEl.textContent = url.hostname || 'Extension Page';
          toggleLockButton.disabled = true;
          toggleLockText.textContent = 'Cannot lock this page';
          toggleLockIcon.textContent = '⚠️';
          setStatusIndicator('neutral');
        } else {
          currentURLEl.textContent = url.hostname + url.pathname;
          toggleLockButton.disabled = false;
          updateToggleButton();
        }
      } catch {
        currentURLEl.textContent = 'Invalid URL';
        toggleLockButton.disabled = true;
        setStatusIndicator('neutral');
      }
    } else {
      currentURLEl.textContent = 'No tab detected';
      toggleLockButton.disabled = true;
      setStatusIndicator('neutral');
    }

    renderLockedList(state.lockedURLs || []);
  }

  /**
   * Update toggle button to reflect actual state:
   *
   *   Locked & NOT session-unlocked → RED "Locked" (tab has overlay)
   *   Locked & session-unlocked → GREEN "Unlocked" + option to re-lock
   *   Not locked → GREEN "Open" + option to lock
   */
  function updateToggleButton() {
    if (isCurrentURLLocked && !isCurrentURLSessionUnlocked) {
      // Tab is actively locked (overlay is showing)
      toggleLockIcon.textContent = '🔒';
      toggleLockText.textContent = 'Locked — Remove Lock';
      toggleLockButton.className = 'btn btn-locked-active';
      setStatusIndicator('locked');
    } else if (isCurrentURLLocked && isCurrentURLSessionUnlocked) {
      // Tab is locked but user entered password this session (overlay removed)
      toggleLockIcon.textContent = '🔒';
      toggleLockText.textContent = 'Lock This Tab';
      toggleLockButton.className = 'btn btn-lock';
      setStatusIndicator('unlocked');
    } else {
      // Tab is not locked at all
      toggleLockIcon.textContent = '🔒';
      toggleLockText.textContent = 'Lock This Tab';
      toggleLockButton.className = 'btn btn-lock';
      setStatusIndicator('open');
    }
  }

  function setStatusIndicator(state) {
    if (!statusIndicator) return;
    statusIndicator.className = 'status-dot status-' + state;
    if (statusText) {
      const labels = { locked: 'Locked', unlocked: 'Unlocked', open: 'Open', neutral: '' };
      statusText.textContent = labels[state] || '';
      statusText.className = 'status-label status-label-' + state;
    }
  }

  function renderLockedList(urls) {
    lockedCount.textContent = urls.length;
    if (urls.length === 0) {
      lockedList.innerHTML = '';
      lockedList.appendChild(emptyState);
      emptyState.style.display = '';
      return;
    }

    emptyState.style.display = 'none';
    lockedList.innerHTML = '';

    urls.forEach(url => {
      const item = document.createElement('div');
      item.className = 'locked-item';

      const icon = document.createElement('span');
      icon.className = 'locked-item-icon';
      icon.textContent = '🔒';

      const urlText = document.createElement('span');
      urlText.className = 'locked-item-url';
      urlText.title = url;
      try {
        const u = new URL(url);
        urlText.textContent = u.hostname + u.pathname;
      } catch { urlText.textContent = url; }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'locked-item-remove';
      removeBtn.title = 'Remove lock';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeLock(url));

      item.appendChild(icon);
      item.appendChild(urlText);
      item.appendChild(removeBtn);
      lockedList.appendChild(item);
    });
  }

  // ─── Lock/Unlock Toggle ─────────────────────────────────────────────────────

  toggleLockButton.addEventListener('click', async () => {
    if (!currentTabURL) return;
    toggleLockButton.disabled = true;

    if (isCurrentURLLocked && !isCurrentURLSessionUnlocked) {
      // Currently locked with overlay showing → Remove lock entirely
      const response = await chrome.runtime.sendMessage({ type: 'removeLockedURL', url: currentTabURL });
      if (response.success) {
        isCurrentURLLocked = false;
        isCurrentURLSessionUnlocked = false;
        showToast('Lock removed!');
      }
    } else if (isCurrentURLLocked && isCurrentURLSessionUnlocked) {
      // Session-unlocked but still in locked list → Lock it again (re-show overlay)
      // Remove from session unlocked, then re-show overlay
      const response = await chrome.runtime.sendMessage({ type: 'lockURL', url: currentTabURL });
      // lockURL will show overlay. But URL is already locked so it returns error.
      // Instead, just remove from sessionUnlocked and notify
      if (!response.success && response.error === 'URL is already locked') {
        // Remove from session unlocked by re-locking (remove + add)
        await chrome.runtime.sendMessage({ type: 'removeLockedURL', url: currentTabURL });
        const lockResp = await chrome.runtime.sendMessage({ type: 'lockURL', url: currentTabURL });
        if (lockResp.success) {
          isCurrentURLSessionUnlocked = false;
          showToast('Tab re-locked!');
        }
      }
    } else {
      // Not locked → Lock it
      const response = await chrome.runtime.sendMessage({ type: 'lockURL', url: currentTabURL });
      if (response.success) {
        isCurrentURLLocked = true;
        isCurrentURLSessionUnlocked = false;
        showToast('Tab locked!');
      }
    }

    // Refresh state
    const state = await chrome.runtime.sendMessage({ type: 'getState', url: currentTabURL });
    isCurrentURLLocked = state.currentURLLocked;
    isCurrentURLSessionUnlocked = state.currentURLSessionUnlocked || false;
    updateToggleButton();
    toggleLockButton.disabled = false;
    renderLockedList(state.lockedURLs || []);
  });

  async function removeLock(url) {
    const response = await chrome.runtime.sendMessage({ type: 'removeLockedURL', url });
    if (response.success) {
      showToast('Lock removed');
      const state = await chrome.runtime.sendMessage({ type: 'getState', url: currentTabURL });
      isCurrentURLLocked = state.currentURLLocked;
      isCurrentURLSessionUnlocked = state.currentURLSessionUnlocked || false;
      updateToggleButton();
      renderLockedList(state.lockedURLs || []);
    }
  }

  // ─── Change Password ───────────────────────────────────────────────────────

  changePasswordBtn.addEventListener('click', () => { showView('change'); currentPasswordInput.focus(); });

  cancelChangePassword.addEventListener('click', () => {
    changePasswordForm.reset();
    changePasswordError.textContent = '';
    showView('main');
  });

  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    changePasswordError.textContent = '';
    const current = currentPasswordInput.value;
    const newPw = newPasswordInput.value;
    const confirmNew = confirmNewPasswordInput.value;

    if (!current) { changePasswordError.textContent = 'Enter current password'; return; }
    if (!newPw || newPw.length < 4) { changePasswordError.textContent = 'New password must be at least 4 chars'; return; }
    if (newPw !== confirmNew) { changePasswordError.textContent = 'Passwords do not match'; return; }

    setChangeLoading(true);
    const response = await chrome.runtime.sendMessage({ type: 'changePassword', currentPassword: current, newPassword: newPw });
    setChangeLoading(false);

    if (response.success) {
      showToast('Password changed!');
      changePasswordForm.reset();
      showView('main');
    } else {
      changePasswordError.textContent = response.error || 'Failed';
    }
  });

  function setChangeLoading(loading) {
    document.getElementById('changePasswordSubmit').disabled = loading;
    changeBtnText.textContent = loading ? 'Updating...' : 'Update';
    changeSpinner.classList.toggle('hidden', !loading);
  }

  // ─── Toast ──────────────────────────────────────────────────────────────────

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

})();