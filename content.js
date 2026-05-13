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

    // Save and modify title
    originalTitle = document.title;
    document.title = '🔒 ' + originalTitle;

    // Create host element
    overlayHost = document.createElement('div');
    overlayHost.id = 'tablocker-overlay-host';
    overlayHost.style.cssText =
      'position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;' +
      'z-index:2147483647!important;margin:0!important;padding:0!important;border:none!important;' +
      'background:transparent!important;pointer-events:auto!important;';

    const shadow = overlayHost.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getOverlayCSS();
    shadow.appendChild(style);

    // Build overlay UI
    const container = document.createElement('div');
    container.className = 'overlay';
    container.innerHTML = buildOverlayHTML();
    shadow.appendChild(container);

    document.documentElement.appendChild(overlayHost);

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
          // Success — green flash then remove
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

    // Restore original title
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
        <img class="tab-favicon" src="${faviconURL}" alt="" width="18" height="18"
             onerror="this.style.display='none'">
        <span class="tab-title">${escapeHTML(pageTitle)}</span>
      </div>

      <div class="card">
        <div class="lock-icon-wrap">
          <svg class="lock-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="28" width="36" height="28" rx="6" fill="url(#tl-lg)"/>
            <path d="M20 28V20C20 13.373 25.373 8 32 8C38.627 8 44 13.373 44 20V28"
                  stroke="url(#tl-sg)" stroke-width="5" stroke-linecap="round" fill="none"/>
            <circle cx="32" cy="40" r="4" fill="rgba(255,255,255,0.9)"/>
            <rect x="30.5" y="42" width="3" height="6" rx="1.5" fill="rgba(255,255,255,0.9)"/>
            <defs>
              <linearGradient id="tl-lg" x1="14" y1="28" x2="50" y2="56" gradientUnits="userSpaceOnUse">
                <stop stop-color="#DC2626"/><stop offset="1" stop-color="#991B1B"/>
              </linearGradient>
              <linearGradient id="tl-sg" x1="20" y1="8" x2="44" y2="28" gradientUnits="userSpaceOnUse">
                <stop stop-color="#F87171"/><stop offset="1" stop-color="#DC2626"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 class="title">This Tab is Locked</h1>
        <p class="subtitle">${escapeHTML(hostname)}</p>

        <form id="tl-form" autocomplete="off">
          <div class="input-group">
            <input type="password" id="tl-password" class="pwd-input"
                   placeholder="Enter your password" autocomplete="off">
            <button type="button" id="tl-toggle-vis" class="vis-toggle" title="Show password">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
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

        <p class="footer">Protected by <strong>TabLocker</strong></p>
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
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      :host { all: initial; }

      .overlay {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(2, 2, 3, 0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #E4E4E7;
        z-index: 2147483647;
        animation: fadeIn 0.3s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* ── Tab Info Bar (red) ──────────────────────────────────── */
      .tab-info-bar {
        position: absolute;
        top: 0; left: 0; right: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 24px;
        background: linear-gradient(135deg, rgba(220,38,38,0.3), rgba(153,27,27,0.25));
        border-bottom: 1px solid rgba(220,38,38,0.25);
        backdrop-filter: blur(12px);
      }

      .tab-favicon {
        width: 18px; height: 18px;
        border-radius: 3px;
        flex-shrink: 0;
        object-fit: contain;
      }

      .tab-title {
        font-size: 0.82rem;
        font-weight: 500;
        color: #FCA5A5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── Card ────────────────────────────────────────────────── */
      .card {
        background: rgba(14, 14, 16, 0.75);
        border: 1px solid rgba(220,38,38,0.15);
        border-radius: 24px;
        padding: 48px 40px 36px;
        width: 100%;
        max-width: 400px;
        text-align: center;
        backdrop-filter: blur(40px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 100px rgba(220,38,38,0.04);
        animation: cardIn 0.5s cubic-bezier(0.16,1,0.3,1);
      }

      @keyframes cardIn {
        from { opacity: 0; transform: translateY(24px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* ── Lock Icon ──────────────────────────────────────────── */
      .lock-icon-wrap { margin-bottom: 24px; }

      .lock-svg {
        width: 72px; height: 72px;
        filter: drop-shadow(0 4px 20px rgba(220,38,38,0.4));
        animation: pulse 3s ease-in-out infinite;
      }

      @keyframes pulse {
        0%,100% { filter: drop-shadow(0 4px 20px rgba(220,38,38,0.4)); }
        50%     { filter: drop-shadow(0 4px 30px rgba(220,38,38,0.7)); }
      }

      /* ── Typography ─────────────────────────────────────────── */
      .title {
        font-size: 1.4rem; font-weight: 700; color: #FAFAFA;
        margin: 0 0 6px; letter-spacing: -0.02em;
      }

      .subtitle {
        font-size: 0.85rem; color: #71717A; margin: 0 0 28px;
        word-break: break-all;
      }

      /* ── Form ───────────────────────────────────────────────── */
      form { display: flex; flex-direction: column; gap: 14px; }

      .input-group { position: relative; display: flex; align-items: center; }

      .pwd-input {
        width: 100%; padding: 13px 44px 13px 16px;
        background: rgba(24,24,27,0.6);
        border: 1.5px solid rgba(63,63,70,0.4);
        border-radius: 12px;
        color: #FAFAFA; font-family: inherit; font-size: 0.9rem;
        outline: none; transition: all 0.2s ease;
        box-sizing: border-box;
      }

      .pwd-input::placeholder { color: #52525B; }

      .pwd-input:focus {
        border-color: rgba(220,38,38,0.5);
        box-shadow: 0 0 0 3px rgba(220,38,38,0.12);
      }

      .pwd-input.shake {
        animation: shake 0.4s ease;
        border-color: rgba(248,113,113,0.6);
      }

      @keyframes shake {
        0%,100% { transform: translateX(0); }
        20% { transform: translateX(-6px); }
        40% { transform: translateX(6px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }

      .vis-toggle {
        position: absolute; right: 12px;
        background: none; border: none; color: #52525B;
        cursor: pointer; padding: 4px; display: flex;
        border-radius: 4px; transition: color 0.2s;
      }
      .vis-toggle:hover { color: #F87171; }

      .error {
        color: #F87171; font-size: 0.8rem; font-weight: 500;
        min-height: 18px; margin: 0; text-align: left;
      }

      /* ── Button ──────────────────────────────────────────────── */
      .unlock-btn {
        padding: 13px 24px;
        background: linear-gradient(135deg, #DC2626, #991B1B);
        border: none; border-radius: 12px;
        color: white; font-family: inherit; font-size: 0.9rem; font-weight: 600;
        cursor: pointer; transition: all 0.2s ease;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        box-shadow: 0 4px 20px rgba(220,38,38,0.25);
      }

      .unlock-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 30px rgba(220,38,38,0.4);
      }

      .unlock-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

      .spinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .footer {
        margin: 24px 0 0; font-size: 0.72rem; color: #52525B;
      }
      .footer strong { color: #DC2626; font-weight: 600; }

      /* ── Unlock Success ─────────────────────────────────────── */
      .overlay.unlock-success {
        background: rgba(2, 32, 10, 0.95);
        transition: background 0.4s ease;
      }

      .overlay.unlock-success .card {
        border-color: rgba(22,163,74,0.3);
        box-shadow: 0 0 80px rgba(22,163,74,0.1);
        animation: cardOut 0.6s cubic-bezier(0.16,1,0.3,1) forwards;
      }

      .overlay.unlock-success .title { color: #86EFAC; }
      .overlay.unlock-success .tab-info-bar {
        background: linear-gradient(135deg, rgba(22,163,74,0.3), rgba(21,128,61,0.25));
        border-color: rgba(22,163,74,0.25);
      }
      .overlay.unlock-success .tab-title { color: #86EFAC; }

      @keyframes cardOut {
        0% { transform: scale(1); opacity: 1; }
        40% { transform: scale(1.02); }
        100% { transform: scale(0.95); opacity: 0; }
      }
    `;
  }

})();
