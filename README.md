# 🔒 TabLocker — Chrome Extension

Lock specific browser tabs behind a master password. Locked tabs persist across browser restarts and extension reloads.

## Features

- **Master Password** — Set a single password to protect all your locked tabs (stored as a SHA-256 hash, never in plaintext)
- **URL-based Locking** — Lock any website URL. Locks persist even after closing and reopening Chrome
- **Lock Screen** — Beautiful, secure lock screen when a locked tab is accessed
- **Session Unlock** — Unlock a tab for your current browsing session. Locks re-engage when Chrome restarts
- **Badge Indicators** — See lock state (🔒/🔓) right on the extension icon
- **Change Password** — Update your master password anytime from the popup
- **Manifest V3** — Fully compliant with Chrome's latest extension platform

## Installation

1. **Download/Clone** the repository:
   ```bash
   git clone https://github.com/your-username/TabLocker.git
   ```

2. **Open Chrome** and navigate to:
   ```
   chrome://extensions
   ```

3. **Enable Developer Mode** (toggle in the top-right corner)

4. Click **"Load unpacked"** and select the `TabLocker` folder

5. The TabLocker icon will appear in your extensions bar. Pin it for easy access.

## Usage

### First-Time Setup
1. Click the TabLocker icon
2. Create a master password (minimum 4 characters)
3. Confirm the password and click **Set Password**

### Locking a Tab
1. Navigate to the website you want to lock
2. Click the TabLocker icon
3. Click **🔒 Lock This Tab**
4. The tab will immediately redirect to the lock screen

### Unlocking a Tab
- **From the lock screen**: Enter your master password and click **Unlock Tab**
- **From the popup**: Click **🔓 Unlock This Tab** to permanently remove the lock

### Managing Locks
- View all locked URLs in the popup's **Locked URLs** section
- Click **✕** next to any URL to remove its lock
- Click **Change Password** to update your master password

## Permissions

| Permission | Purpose |
|-----------|---------|
| `tabs` | Read tab URLs to detect locked pages and manage tab navigation |
| `storage` | Store password hash and locked URLs list persistently |

> **Note**: TabLocker requests only the minimum permissions needed. No browsing data is collected or transmitted.

## Security

- Passwords are hashed with **SHA-256** using the Web Crypto API before storage
- No plaintext passwords are ever stored or logged
- The lock screen is a sandboxed extension page (not injected into web pages)
- All data is stored in `chrome.storage.local` (extension-only, not synced to cloud)
- Debug logs never contain password values

## Architecture

```
TabLocker/
├── manifest.json        — Extension configuration (MV3)
├── background.js        — Service worker: tab monitoring, message routing, lock enforcement
├── popup.html/css/js    — Extension popup: setup, lock/unlock, settings
├── locked.html/css/js   — Lock screen: password verification UI
├── utils/crypto.js      — SHA-256 hashing utility
├── icons/               — Extension icons (16/48/128px)
└── README.md            — This file
```

## How It Works

1. **Locking**: When you lock a tab, the URL (normalized to origin+pathname) is saved to `chrome.storage.local`
2. **Detection**: The background service worker listens to `chrome.tabs.onUpdated` and `chrome.tabs.onActivated` events
3. **Enforcement**: When a locked URL is detected, the tab is redirected to `locked.html` (a chrome-extension:// page)
4. **Unlocking**: On the lock screen, the password is verified against the stored hash. On success, the URL is marked as "session unlocked" and the tab navigates back to the original page
5. **Persistence**: On browser restart, the service worker clears the session-unlock list, so all locks re-engage

## Future Improvements

- Per-URL passwords (different passwords for different sites)
- Biometric authentication via Web Authentication API
- Auto-lock timer (re-lock tabs after N minutes of inactivity)
- Import/export locked URLs
- Pattern matching (lock all URLs matching `*.example.com/*`)
- Password strength meter
- Incognito mode support

## License

MIT
