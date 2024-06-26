chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ lockedTabs: {} });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.type === 'lockTab') {
      chrome.storage.sync.get('lockedTabs', (data) => {
        const lockedTabs = data.lockedTabs || {};
        lockedTabs[request.tabId] = request.password;
        chrome.storage.sync.set({ lockedTabs }, () => {
          chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            func: lockTabContent
          }, () => {
            sendResponse({ success: true });
          });
        });
      });
    } else if (request.type === 'unlockTab') {
      chrome.storage.sync.get('lockedTabs', (data) => {
        const lockedTabs = data.lockedTabs || {};
        if (lockedTabs[request.tabId] === request.password) {
          delete lockedTabs[request.tabId];
          chrome.storage.sync.set({ lockedTabs }, () => {
            chrome.scripting.executeScript({
              target: { tabId: request.tabId },
              func: unlockTabContent
            }, () => {
              sendResponse({ success: true });
            });
          });
        } else {
          sendResponse({ success: false });
        }
      });
    } else if (request.type === 'checkLock') {
      chrome.storage.sync.get('lockedTabs', (data) => {
        sendResponse({ locked: !!data.lockedTabs[sender.tab.id] });
      });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true; // Indicate async response
});

function lockTabContent() {
  document.body.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;">
      <h1>Tab Locked</h1>
      <p>Enter password to view this tab:</p>
      <input type="password" id="unlock-password" />
      <button id="unlock-button">Unlock</button>
      <script>
        document.getElementById('unlock-button').addEventListener('click', () => {
          const enteredPassword = document.getElementById('unlock-password').value;
          chrome.runtime.sendMessage({ type: 'unlockTab', tabId: chrome.runtime.id, password: enteredPassword }, (response) => {
            if (response && response.success) {
              window.location.reload();
            } else {
              alert('Incorrect password');
            }
          });
        });
      </script>
    </div>
  `;
}

function unlockTabContent() {
  window.location.reload();
}
