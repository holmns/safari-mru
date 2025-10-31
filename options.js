//
//  options.js
//  Safari MRU
//
//  Created by Nawat Suangburanakul on 1/11/2568 BE.
//

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('hudDelay');
  const status = document.getElementById('status');

  // Load existing value
  chrome.storage.sync.get({ hudDelay: 200 }, (data) => {
    input.value = data.hudDelay;
  });

  document.getElementById('save').addEventListener('click', () => {
    const val = parseInt(input.value, 10);
    chrome.storage.sync.set({ hudDelay: val }, () => {
      status.textContent = 'Saved!';
      setTimeout(() => (status.textContent = ''), 1000);
    });
  });
});
