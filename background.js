chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      const tabId = details.tabId;
      if (tabId < 0) return;
  
      chrome.tabs.get(tabId, function (tab) {
        if (!tab || !tab.url) return;
  
        const requestUrl = new URL(details.url);
        const pageUrl = new URL(tab.url);
  
        if (requestUrl.hostname !== pageUrl.hostname) {
          chrome.storage.local.get(["trackers"], (result) => {
            let trackers = result.trackers || {};
            if (!trackers[tabId]) {
              trackers[tabId] = [];
            }
  
            if (!trackers[tabId].includes(requestUrl.hostname)) {
              trackers[tabId].push(requestUrl.hostname);
            }
  
            chrome.storage.local.set({ trackers }, () => {
              chrome.action.setBadgeText({ text: "!", tabId });
              chrome.action.setBadgeBackgroundColor({ color: "#FF6600", tabId });
            });
          });
        }
      });
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (message.type === "getTrackers" && tabId !== undefined) {
        chrome.storage.local.get(["trackers"], (data) => {
          sendResponse(data.trackers?.[tabId] || []);
        });
      }
  
      if (message.type === "clearTrackers" && tabId !== undefined) {
        chrome.storage.local.get(["trackers"], (data) => {
          let trackers = data.trackers || {};
          delete trackers[tabId];
          chrome.storage.local.set({ trackers }, () => {
            chrome.action.setBadgeText({ text: "", tabId });
            sendResponse();
          });
        });
      }
    });
  
    return true;
  });