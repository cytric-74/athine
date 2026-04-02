const SEGMENTS = 28;

// State
const tabVolumes = {};
const tabMuted = {};
let allTabs = [];
let currentTabId = null;

// Helpers

function domainTag(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h.split(".")[0];
  } catch { return "tab"; }
}

function formatVol(v) {
  return Math.round(v * 100);
}

function getEffectiveVolume(tabId) {
  return tabMuted[tabId] ? 0 : (tabVolumes[tabId] ?? 1.0);
}

// Send volume to background

function sendVolume(tabId, volume) {
  browser.runtime.sendMessage({ type: "SET_VOLUME", tabId, volume }).catch(() => {});
}

// Build a segmented bar

function buildBar(tabId, container) {
  const track = document.createElement("div");
  track.className = "bar-track";

  const barsDiv = document.createElement("div");
  barsDiv.className = "bar-segments";

  const segs = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const s = document.createElement("div");
    s.className = "seg";
    barsDiv.appendChild(s);
    segs.push(s);
  }
  track.appendChild(barsDiv);

  function paintBar(volume) {
    const filled = Math.round(volume * SEGMENTS);
    segs.forEach((s, i) => {
      s.className = "seg";
      if (i < filled) {
        s.classList.add(i === filled - 1 ? "peak" : "filled");
      }
    });
  }

  function volumeFromX(clientX) {
    const rect = track.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, raw));
  }

  function applyVolume(v) {
    tabVolumes[tabId] = v;
    if (tabMuted[tabId] && v > 0) {
      tabMuted[tabId] = false;
      updateMuteBtn(tabId);
    }
    paintBar(v);
    updateVolNumber(tabId, v);
    sendVolume(tabId, v);
  }

  let dragging = false;

  track.addEventListener("mousedown", (e) => {
    dragging = true;
    applyVolume(volumeFromX(e.clientX));
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (dragging) applyVolume(volumeFromX(e.clientX));
  });

  window.addEventListener("mouseup", () => { dragging = false; });

  // Store painter for later updates
  track._paintBar = paintBar;
  track._tabId = tabId;
  container._barTrack = track;

  paintBar(tabVolumes[tabId] ?? 1.0);
  return track;
}

// Update helpers 

function updateVolNumber(tabId, volume) {
  const el = document.querySelector(`[data-vol-num="${tabId}"]`);
  if (el) el.textContent = formatVol(volume) + "%";
}

function updateMuteBtn(tabId) {
  const btn = document.querySelector(`[data-mute-btn="${tabId}"]`);
  const card = document.querySelector(`[data-tab-card="${tabId}"]`);
  const muteTag = document.querySelector(`[data-mute-tag="${tabId}"]`);
  if (!btn) return;

  const muted = tabMuted[tabId];
  btn.classList.toggle("is-muted", !!muted);
  btn.title = muted ? "Unmute tab" : "Mute tab";
  btn.textContent = muted ? "🔇" : "🔊";
  if (muteTag) muteTag.style.display = muted ? "inline-block" : "none";

  // repaint bar at effective volume
  const barTrack = card?._barTrack;
  if (barTrack?._paintBar) {
    barTrack._paintBar(muted ? 0 : (tabVolumes[tabId] ?? 1.0));
  }
}

//  rendering all tab

function renderTabs(tabs) {
  const list = document.getElementById("tabList");
  list.innerHTML = "";

  if (!tabs.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🔈</div>No tabs found</div>`;
    return;
  }

  let playingCount = 0;

  tabs.forEach((tab) => {
    if (tab.audible) playingCount++;

    const vol = tabVolumes[tab.id] ?? 1.0;

    const card = document.createElement("div");
    card.className = "tab-card" +
      (tab.id === currentTabId ? " is-active-tab" : "") +
      (tab.audible ? " is-playing" : "");
    card.dataset.tabCard = tab.id;

    // Tags row
    const domain = domainTag(tab.url || "");
    const tagsHtml = `
      <div class="tab-tags">
        <span class="tag">${domain}</span>
        ${tab.audible ? `<span class="tag playing">● playing</span>` : ""}
        <span class="tag muted" data-mute-tag="${tab.id}" style="display:none">◼ muted</span>
        ${tab.id === currentTabId ? `<span class="tag">active</span>` : ""}
      </div>`;

    // Favicon
    const faviconUrl = tab.favIconUrl || "";
    const faviconHtml = faviconUrl
      ? `<img class="favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">`
      : `<span style="font-size:12px;opacity:0.4">🌐</span>`;

    // Title
    const shortTitle = (tab.title || "Untitled").slice(0, 50);

    card.innerHTML = `
      ${tagsHtml}
      <div class="tab-top">
        <div class="tab-meta">
          <div class="tab-title-row">
            ${faviconHtml}
            <div class="tab-title" title="${tab.title || ''}">${shortTitle}</div>
          </div>
        </div>
        <div class="vol-display">
          <div class="vol-number" data-vol-num="${tab.id}">${formatVol(vol)}%</div>
        </div>
      </div>
    `;

    // Segmented bar
    const bar = buildBar(tab.id, card);
    card.appendChild(bar);

    // muting button
    const muteBtn = document.createElement("button");
    muteBtn.className = "mute-btn";
    muteBtn.dataset.muteBtn = tab.id;
    muteBtn.textContent = tabMuted[tab.id] ? "🔇" : "🔊";
    muteBtn.title = tabMuted[tab.id] ? "Unmute tab" : "Mute tab";
    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      tabMuted[tab.id] = !tabMuted[tab.id];
      const effectiveVol = tabMuted[tab.id] ? 0 : (tabVolumes[tab.id] ?? 1.0);
      sendVolume(tab.id, effectiveVol);
      updateMuteBtn(tab.id);
    });
    bar.appendChild(muteBtn);

    list.appendChild(card);
  });

  // Summary
  document.getElementById("tabCountPill").textContent = `${tabs.length} tab${tabs.length !== 1 ? "s" : ""}`;
  const playingPill = document.getElementById("playingPill");
  if (playingCount > 0) {
    playingPill.style.display = "inline-block";
    playingPill.textContent = `● ${playingCount} playing`;
  } else {
    playingPill.style.display = "none";
  }
}

// muting all

document.getElementById("muteAllBtn").addEventListener("click", () => {
  const allMuted = allTabs.every((t) => tabMuted[t.id]);
  allTabs.forEach((tab) => {
    tabMuted[tab.id] = !allMuted;
    const v = tabMuted[tab.id] ? 0 : (tabVolumes[tab.id] ?? 1.0);
    sendVolume(tab.id, v);
    updateMuteBtn(tab.id);
  });
  document.getElementById("muteAllBtn").textContent = allMuted ? "mute all" : "unmute all";
});

async function init() {
  const [tabs, active] = await Promise.all([
    browser.tabs.query({ currentWindow: true }),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);

  currentTabId = active[0]?.id ?? null;

  // loading stored volume
  const resp = await browser.runtime.sendMessage({ type: "GET_VOLUMES" }).catch(() => ({ volumes: {} }));
  const stored = resp?.volumes ?? {};
  tabs.forEach((t) => {
    tabVolumes[t.id] = stored[t.id] ?? 1.0;
  });

  allTabs = tabs;
  renderTabs(tabs);
}

init();
