const _b = window.browser || chrome;

function applyVolume(volume) {
  // effects the media on that page
  document.querySelectorAll("audio, video").forEach((el) => {
    el.volume = Math.max(0, Math.min(1, volume));
  });

  // for any same-origin iframes
  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      iframe.contentDocument?.querySelectorAll("audio, video").forEach((el) => {
        el.volume = Math.max(0, Math.min(1, volume));
      });
    } catch {
      // cross-origin iframe — browser blocks this, nothing we can do
    }
  });

  if (!window._volumeObserver) {
    window._volumeObserver = new MutationObserver(() => {
      document.querySelectorAll("audio, video").forEach((el) => {
        el.volume = Math.max(0, Math.min(1, window._currentVolume ?? 1));
      });
    });
    window._volumeObserver.observe(document.body, { childList: true, subtree: true });
  }

  window._currentVolume = volume;
}

_b.runtime.onMessage.addListener((message) => {
  if (message.type === "SET_VOLUME") applyVolume(message.volume);
});

_b.runtime.sendMessage({ type: "GET_TAB_VOLUME", tabId: undefined })
  .then?.((response) => { if (response?.volume !== undefined) applyVolume(response.volume); })
  .catch?.(() => {});
