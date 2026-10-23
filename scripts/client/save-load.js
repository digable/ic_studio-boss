// Local games autosave to one localStorage slot after every action.

const SAVE_KEY = "sb_save";

function saveLocal() {
  if (client.mode !== "local" || !state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, viewer: client.viewer, lastReportQuarter: client.lastReportQuarter }));
  } catch { /* storage full or blocked — the game still works */ }
}

function hasLocalSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return !!raw && JSON.parse(raw).state?.phase === "PLANNING";
  } catch { return false; }
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!saved?.state) return false;
    state = saved.state;
    client.mode = "local";
    client.viewer = saved.viewer ?? 0;
    client.lastReportQuarter = saved.lastReportQuarter ?? null;
    return true;
  } catch { return false; }
}

function clearLocal() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
