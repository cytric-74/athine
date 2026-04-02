const tabVolumes = {};  // for storing volume

// responses from pop ups
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_VOLUME") {
    const { tabId, volume } = message;
    tabVolumes[tabId] = volume;

    browser.tabs.sendMessage(tabId, { type: "SET_VOLUME", volume }).catch(() => {
    });

    sendResponse({ success: true });
  }

  if (message.type === "GET_VOLUMES") {
    sendResponse({ volumes: tabVolumes });
  }

  if (message.type === "GET_TAB_VOLUME") {
    sendResponse({ volume: tabVolumes[message.tabId] ?? 1.0 });
  }

  return true;
});

// clean up
browser.tabs.onRemoved.addListener((tabId) => {
  delete tabVolumes[tabId];
});

