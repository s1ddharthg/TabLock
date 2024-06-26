chrome.runtime.sendMessage({ type: 'checkLock' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError.message);
    } else {
      if (response.locked) {
        document.body.innerHTML = `
          <div id="lock-screen" style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;">
            <h1>Tab Locked</h1>
            <p>Enter password to view this tab:</p>
            <input type="password" id="unlock-password" />
            <button id="unlock-button">Unlock</button>
            <script>
              document.getElementById('unlock-button').addEventListener('click', () => {
                const enteredPassword = document.getElementById('unlock-password').value;
                chrome.runtime.sendMessage({ type: 'unlockTab', tabId: chrome.runtime.id, password: enteredPassword }, (response) => {
                  if (response && response.success) {
                    document.getElementById('lock-screen').remove();
                  } else {
                    alert('Incorrect password');
                  }
                });
              });
            </script>
          </div>
        `;
      }
    }
  });
  