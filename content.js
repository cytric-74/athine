// applies volume to the entire page 
function applyVolume(volume) {
  const mediaElements = document.querySelectorAll("audio, video, iframe");
  mediaElements.forEach((el) => {
    if (el.tagName === "AUDIO" || el.tagName === "VIDEO") {
      el.volume = Math.max(0, Math.min(1, volume));
    }
  });

  // having a watch on new media which are added dynamically
  if (!window._volumeObserver) {
    window._volumeObserver = new MutationObserver(() => {
      const els = document.querySelectorAll("audio, video");
      els.forEach((el) => {
        el.volume = Math.max(0, Math.min(1, window._currentVolume ?? 1));
      });
    });
    window._volumeObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  window._currentVolume = volume;
}

// listens for messages from background
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "SET_VOLUME") {
    applyVolume(message.volume);
  }
});

// apply stored vol on loaded page
browser.runtime
  .sendMessage({ type: "GET_TAB_VOLUME", tabId: undefined })
  .then((response) => {
    if (response && response.volume !== undefined) {
      applyVolume(response.volume);
    }
  })
  .catch(() => {});
