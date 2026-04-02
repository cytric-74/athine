const STEP = 0.05; // 5% per +/- click

const tabVolumes = {};
const tabMuted = {};
let allTabs = [];
let currentTabId = null;

// helpers

function domainTag(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; }
  catch { return "tab"; }
}

function fmt(v) { return Math.round(v * 100) + "%"; }

function sendVolume(tabId, volume) {
  browser.runtime.sendMessage({ type: "SET_VOLUME", tabId, volume }).catch(() => {});
}

// Per-tab DOM updates 

function setBarWidth(tabId, volume) {
  const fill = document.querySelector(`[data-bar-fill="${tabId}"]`);
  if (fill) fill.style.width = (volume * 100) + "%";
}

function setVolLabel(tabId, volume) {
  const el = document.querySelector(`[data-vol-label="${tabId}"]`);
  if (el) el.textContent = fmt(volume);
}

function applyVolumeUI(tabId) {
  const muted = tabMuted[tabId];
  const vol = tabVolumes[tabId] ?? 1.0;
  const display = muted ? 0 : vol;

  setBarWidth(tabId, display);
  setVolLabel(tabId, muted ? 0 : vol);

  const card = document.querySelector(`[data-tab-card="${tabId}"]`);
  if (card) card.classList.toggle("is-muted", !!muted);

  const muteBtn = document.querySelector(`[data-mute-btn="${tabId}"]`);
  if (muteBtn) {
    muteBtn.classList.toggle("is-muted", !!muted);
    muteBtn.textContent = muted ? "🔇" : "🔊";
  }
}

// Adjust volume by delta 

function adjustVolume(tabId, delta) {
  const current = tabVolumes[tabId] ?? 1.0;
  const next = Math.max(0, Math.min(1, current + delta));
  tabVolumes[tabId] = next;
  if (tabMuted[tabId] && next > 0) tabMuted[tabId] = false;
  applyVolumeUI(tabId);
  sendVolume(tabId, next);
}

// Build smooth progress bar 

function buildBar(tabId) {
  const track = document.createElement("div");
  track.className = "bar-track";

  const fill = document.createElement("div");
  fill.className = "bar-fill";
  fill.dataset.barFill = tabId;
  fill.style.width = ((tabVolumes[tabId] ?? 1.0) * 100) + "%";
  track.appendChild(fill);

  function volumeFromX(clientX) {
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function applyDrag(clientX) {
    const v = volumeFromX(clientX);
    tabVolumes[tabId] = v;
    if (tabMuted[tabId] && v > 0) tabMuted[tabId] = false;
    applyVolumeUI(tabId);
    sendVolume(tabId, v);
  }

  let dragging = false;
  track.addEventListener("mousedown", (e) => { dragging = true; applyDrag(e.clientX); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => { if (dragging) applyDrag(e.clientX); });
  window.addEventListener("mouseup", () => { dragging = false; });

  return track;
}

// Render all tabs

function renderTabs(tabs) {
  const list = document.getElementById("tabList");
  list.innerHTML = "";

  if (!tabs.length) {
    list.innerHTML = `<div class="empty">no tabs found</div>`;
    return;
  }

  let playingCount = 0;

  tabs.forEach((tab) => {
    if (tab.audible) playingCount++;

    const vol = tabVolumes[tab.id] ?? 1.0;
    const muted = tabMuted[tab.id] ?? false;
    const domain = domainTag(tab.url || "");

    const card = document.createElement("div");
    card.className = "tab-card" +
      (tab.id === currentTabId ? " is-active-tab" : "") +
      (muted ? " is-muted" : "");
    card.dataset.tabCard = tab.id;

    // favicon
    const faviconHtml = tab.favIconUrl
      ? `<img class="favicon" src="${tab.favIconUrl}" alt="" onerror="this.style.display='none'">`
      : `<span style="font-size:10px;opacity:0.3">○</span>`;

    // playing badge
    const playingBadge = tab.audible ? `<span class="tag-playing">▶</span>` : "";

    // top row
    const topRow = document.createElement("div");
    topRow.className = "tab-top";
    topRow.innerHTML = `
      ${faviconHtml}
      <span class="tab-domain">${domain}</span>
      <span class="tab-title" title="${tab.title || ''}">${(tab.title || "Untitled").slice(0, 55)}</span>
      ${playingBadge}
      <span class="vol-label" data-vol-label="${tab.id}">${fmt(muted ? 0 : vol)}</span>
      <button class="mute-btn ${muted ? 'is-muted' : ''}" data-mute-btn="${tab.id}">${muted ? "🔇" : "🔊"}</button>
    `;

    // mute btn logic
    topRow.querySelector(`[data-mute-btn]`).addEventListener("click", (e) => {
      e.stopPropagation();
      tabMuted[tab.id] = !tabMuted[tab.id];
      const effectiveVol = tabMuted[tab.id] ? 0 : (tabVolumes[tab.id] ?? 1.0);
      sendVolume(tab.id, effectiveVol);
      applyVolumeUI(tab.id);
    });

    // controls row: − [bar] +
    const controls = document.createElement("div");
    controls.className = "tab-controls";

    const minusBtn = document.createElement("button");
    minusBtn.className = "vol-btn";
    minusBtn.textContent = "−";
    minusBtn.title = "Decrease volume";
    minusBtn.addEventListener("click", () => adjustVolume(tab.id, -STEP));

    // hold to repeat
    let holdTimer;
    minusBtn.addEventListener("mousedown", () => { holdTimer = setInterval(() => adjustVolume(tab.id, -STEP), 120); });
    minusBtn.addEventListener("mouseup", () => clearInterval(holdTimer));
    minusBtn.addEventListener("mouseleave", () => clearInterval(holdTimer));

    const plusBtn = document.createElement("button");
    plusBtn.className = "vol-btn";
    plusBtn.textContent = "+";
    plusBtn.title = "Increase volume";
    plusBtn.addEventListener("click", () => adjustVolume(tab.id, STEP));

    let holdTimerP;
    plusBtn.addEventListener("mousedown", () => { holdTimerP = setInterval(() => adjustVolume(tab.id, STEP), 120); });
    plusBtn.addEventListener("mouseup", () => clearInterval(holdTimerP));
    plusBtn.addEventListener("mouseleave", () => clearInterval(holdTimerP));

    const bar = buildBar(tab.id);

    controls.appendChild(minusBtn);
    controls.appendChild(bar);
    controls.appendChild(plusBtn);

    card.appendChild(topRow);
    card.appendChild(controls);
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

// Mute All

document.getElementById("muteAllBtn").addEventListener("click", () => {
  const allMuted = allTabs.every((t) => tabMuted[t.id]);
  allTabs.forEach((tab) => {
    tabMuted[tab.id] = !allMuted;
    sendVolume(tab.id, tabMuted[tab.id] ? 0 : (tabVolumes[tab.id] ?? 1.0));
    applyVolumeUI(tab.id);
  });
  document.getElementById("muteAllBtn").textContent = allMuted ? "mute all" : "unmute all";
});

// ── Init

async function init() {
  const [tabs, active] = await Promise.all([
    browser.tabs.query({ currentWindow: true }),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);

  currentTabId = active[0]?.id ?? null;

  const resp = await browser.runtime.sendMessage({ type: "GET_VOLUMES" }).catch(() => ({ volumes: {} }));
  const stored = resp?.volumes ?? {};
  tabs.forEach((t) => { tabVolumes[t.id] = stored[t.id] ?? 1.0; });

  allTabs = tabs;
  renderTabs(tabs);
}

init();

// Prevent pinch-to-zoom and ctrl+scroll zoom
window.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener("gesturestart", (e) => e.preventDefault());
window.addEventListener("gesturechange", (e) => e.preventDefault());
