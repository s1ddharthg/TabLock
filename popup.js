document.getElementById('lockTab').addEventListener('click', () => {
    const password = document.getElementById('password').value;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.runtime.sendMessage({ type: 'lockTab', tabId: tabs[0].id, password }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error:', chrome.runtime.lastError.message);
          } else {
            if (response && response.success) {
              window.close();
            } else {
              console.error('Failed to lock the tab:', response ? response.error : 'No response received');
              alert('Failed to lock the tab.');
            }
          }
        });
      }
    });
  });
  