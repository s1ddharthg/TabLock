/**
 * TabLocker — Content Script (Overlay)
 *
 * Injects a full-page lock overlay using Shadow DOM when a locked URL is detected.
 * No page reload needed — overlay is added/removed as a DOM layer.
 * Shadow DOM isolates styles from the host page.
 */

(function () {
  'use strict';

  let overlayHost = null;
  let originalTitle = '';
  let isOverlayShowing = false;

  // ─── Init: Check lock state on page load ──────────────────────────────────

  init();

  async function init() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'checkLock' });
      if (response && response.locked) {
        showOverlay();
      }
    } catch {
      // Extension context invalidated (e.g., during reload) — ignore
    }
  }

  // ─── Listen for messages from background ──────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showOverlay') {
      showOverlay();
      sendResponse({ done: true });
    } else if (message.action === 'removeOverlay') {
      removeOverlay();
      sendResponse({ done: true });
    } else if (message.action === 'ping') {
      sendResponse({ alive: true });
    }
    return false;
  });

  // ─── Show Overlay ─────────────────────────────────────────────────────────

  function showOverlay() {
    if (isOverlayShowing) return;
    isOverlayShowing = true;

    originalTitle = document.title;
    document.title = '🔒 ' + originalTitle;

    overlayHost = document.createElement('div');
    overlayHost.id = 'tablocker-overlay-host';
    overlayHost.style.cssText =
      'position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;' +
      'z-index:2147483647!important;margin:0!important;padding:0!important;border:none!important;' +
      'background:transparent!important;pointer-events:auto!important;';

    const shadow = overlayHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getOverlayCSS();
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'overlay';
    container.innerHTML = buildOverlayHTML();
    shadow.appendChild(container);

    document.documentElement.appendChild(overlayHost);

    // Wire favicon error handler via DOM property — not inline attribute
    const faviconImg = shadow.querySelector('.tab-favicon');
    if (faviconImg) faviconImg.onerror = () => { faviconImg.style.display = 'none'; };

    // Wire up event handlers (must be done after DOM insertion)
    const form = shadow.querySelector('#tl-form');
    const input = shadow.querySelector('#tl-password');
    const errorEl = shadow.querySelector('#tl-error');
    const btn = shadow.querySelector('#tl-btn');
    const btnText = shadow.querySelector('#tl-btn-text');
    const spinner = shadow.querySelector('#tl-spinner');
    const toggleVis = shadow.querySelector('#tl-toggle-vis');

    // Focus password input
    setTimeout(() => input.focus(), 100);

    // Toggle visibility
    let visible = false;
    toggleVis.addEventListener('click', () => {
      visible = !visible;
      input.type = visible ? 'text' : 'password';
    });

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = input.value.trim();
      if (!password) {
        errorEl.textContent = 'Please enter your password';
        return;
      }

      btn.disabled = true;
      btnText.textContent = 'Verifying...';
      spinner.style.display = 'inline-block';
      errorEl.textContent = '';

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'unlockTab',
          password,
          url: window.location.href
        });

        if (response && response.success) {
          container.classList.add('unlock-success');
          setTimeout(() => removeOverlay(), 600);
        } else {
          errorEl.textContent = response?.error || 'Incorrect password';
          input.classList.add('shake');
          setTimeout(() => input.classList.remove('shake'), 400);
          input.focus();
          input.select();
          btn.disabled = false;
          btnText.textContent = 'Unlock Tab';
          spinner.style.display = 'none';
        }
      } catch (err) {
        errorEl.textContent = 'Something went wrong';
        btn.disabled = false;
        btnText.textContent = 'Unlock Tab';
        spinner.style.display = 'none';
      }
    });
  }

  // ─── Remove Overlay ───────────────────────────────────────────────────────

  function removeOverlay() {
    if (overlayHost && overlayHost.parentElement) {
      overlayHost.remove();
    }
    overlayHost = null;
    isOverlayShowing = false;

    if (originalTitle) {
      document.title = originalTitle;
      originalTitle = '';
    }
  }

  // ─── Overlay HTML ─────────────────────────────────────────────────────────

  function buildOverlayHTML() {
    const hostname = window.location.hostname || 'this page';
    const pageTitle = originalTitle || hostname;
    let faviconURL = '';
    const linkEl = document.querySelector('link[rel~="icon"]');
    if (linkEl) faviconURL = linkEl.href;
    if (!faviconURL) faviconURL = window.location.origin + '/favicon.ico';

    return `
      <div class="tab-info-bar">
        <img class="tab-favicon" src="${faviconURL}" alt="" width="14" height="14">
        <span class="tab-title">${escapeHTML(pageTitle)}</span>
      </div>

      <div class="card">
        <div class="lock-icon-wrap">
          <svg class="lock-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="28" width="36" height="28" rx="2" fill="#F87171"/>
            <path d="M20 28V20C20 13.373 25.373 8 32 8C38.627 8 44 13.373 44 20V28"
                  stroke="#F87171" stroke-width="5" stroke-linecap="square" fill="none"/>
            <circle cx="32" cy="40" r="4" fill="#12130f"/>
            <rect x="30.5" y="42" width="3" height="6" fill="#12130f"/>
          </svg>
        </div>

        <p class="kicker">TAB LOCKED</p>
        <p class="subtitle">${escapeHTML(hostname)}</p>

        <form id="tl-form" autocomplete="off">
          <div class="input-group">
            <input type="password" id="tl-password" class="pwd-input"
                   placeholder="Password" autocomplete="off">
            <button type="button" id="tl-toggle-vis" class="vis-toggle" title="Show password">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <p id="tl-error" class="error"></p>
          <button type="submit" id="tl-btn" class="unlock-btn">
            <span id="tl-btn-text">Unlock Tab</span>
            <span id="tl-spinner" class="spinner" style="display:none"></span>
          </button>
        </form>

        <p class="footer">TABLOCKER</p>
      </div>
    `;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Overlay CSS (scoped inside Shadow DOM) ───────────────────────────────

  function getOverlayCSS() {
    return `
      :host { all: initial; }

      .overlay {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #12130f;
        font-family: ui-monospace, 'Cascadia Code', 'SF Mono', 'Courier New', monospace;
        color: #e4dfda;
        z-index: 2147483647;
        animation: fadeIn 0.2s cubic-bezier(0.23, 1, 0.32, 1);
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .overlay, .card, .lock-svg { animation: none; }
      }

      /* ── Tab Info Bar ─────────────────────────────────────── */
      .tab-info-bar {
        position: absolute;
        top: 0; left: 0; right: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-bottom: 1px solid #3c3c38;
      }

      .tab-favicon {
        width: 14px; height: 14px;
        flex-shrink: 0;
        object-fit: contain;
      }

      .tab-title {
        font-size: 12px;
        color: #3c3c38;
        letter-spacing: -0.05em;
        text-transform: uppercase;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── Card ─────────────────────────────────────────────── */
      .card {
        background: #12130f;
        border: 1px solid #3c3c38;
        border-radius: 0;
        padding: 36px 32px 28px;
        width: 100%;
        max-width: 360px;
        text-align: center;
        animation: cardIn 0.35s cubic-bezier(0.23, 1, 0.32, 1);
      }

      @keyframes cardIn {
        from { opacity: 0; transform: scale(0.96) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* ── Lock Icon ─────────────────────────────────────────── */
      .lock-icon-wrap { margin-bottom: 20px; }

      .lock-svg {
        width: 48px; height: 48px;
        animation: breathe 4s ease-in-out infinite;
      }

      @keyframes breathe {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.55; }
      }

      /* ── Typography ────────────────────────────────────────── */
      .kicker {
        font-size: 12px;
        font-weight: 400;
        color: #e4dfda;
        letter-spacing: -0.05em;
        text-transform: uppercase;
        margin: 0 0 4px;
        line-height: 1.25;
      }

      .subtitle {
        font-size: 12px;
        color: #3c3c38;
        letter-spacing: -0.05em;
        margin: 0 0 24px;
        word-break: break-all;
        line-height: 1.25;
      }

      /* ── Form ──────────────────────────────────────────────── */
      form { display: flex; flex-direction: column; gap: 8px; }

      .input-group { position: relative; display: flex; align-items: center; }

      .pwd-input {
        width: 100%;
        padding: 8px 32px 8px 10px;
        background: transparent;
        border: 1px solid #3c3c38;
        border-radius: 2px;
        color: #e4dfda;
        font-family: inherit;
        font-size: 12px;
        letter-spacing: -0.05em;
        outline: none;
        transition: border-color 0.15s ease;
        box-sizing: border-box;
      }

      .pwd-input::placeholder { color: #3c3c38; letter-spacing: -0.05em; }
      .pwd-input:focus { border-color: #e4dfda; }

      .pwd-input.shake {
        animation: shake 0.4s ease;
        border-color: #e4dfda;
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%       { transform: translateX(-5px); }
        40%       { transform: translateX(5px); }
        60%       { transform: translateX(-3px); }
        80%       { transform: translateX(3px); }
      }

      .vis-toggle {
        position: absolute; right: 8px;
        background: none; border: none; color: #3c3c38;
        cursor: pointer; padding: 4px; display: flex;
        border-radius: 0; transition: color 0.15s;
      }
      .vis-toggle:hover { color: #e4dfda; }

      .error {
        color: #F87171;
        font-size: 12px;
        font-weight: 400;
        letter-spacing: -0.05em;
        min-height: 16px;
        margin: 0;
        text-align: left;
        line-height: 1.25;
      }

      /* ── Button ────────────────────────────────────────────── */
      .unlock-btn {
        padding: 8px 16px;
        background: transparent;
        border: 1px solid #e4dfda;
        border-radius: 9999px;
        color: #e4dfda;
        font-family: inherit;
        font-size: 12px;
        font-weight: 400;
        letter-spacing: -0.05em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .unlock-btn:hover:not(:disabled) {
        background: #e4dfda;
        color: #12130f;
      }

      .unlock-btn:active:not(:disabled) { transform: scale(0.97); }
      .unlock-btn:disabled { opacity: 0.35; cursor: not-allowed; }

      .spinner {
        width: 10px; height: 10px;
        border: 1px solid rgba(228,223,218,0.3);
        border-top-color: #e4dfda;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .footer {
        margin: 20px 0 0;
        font-size: 12px;
        color: #3c3c38;
        letter-spacing: -0.05em;
        text-transform: uppercase;
      }

      /* ── Unlock Success ────────────────────────────────────── */
      .overlay.unlock-success {
        background: #12130f;
      }

      .overlay.unlock-success .card {
        border-color: #4ADE80;
        animation: cardOut 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards;
      }

      .overlay.unlock-success .tab-info-bar {
        border-color: #4ADE80;
      }

      @keyframes cardOut {
        0%   { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.97) translateY(-6px); }
      }
    `;
  }

})();
