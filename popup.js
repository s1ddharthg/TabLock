document.getElementById('lockTab').addEventListener('click', () => {
    const password = document.getElementById('password').value;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.runtime.sendMessage({ type: 'lockTab', tabId: tabs[0].id, password }, (response) => {
          if (response) {
            if (response.success) {
              window.close();
            } else {
              console.error('Failed to lock the tab:', response.error);
              alert('Failed to lock the tab.');
            }
          } else {
            console.error('No response received.');
            alert('Failed to lock the tab.');
          }
        });
      }
    });
  });
  