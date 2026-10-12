/** @type {import('../application/ports.js').StoragePort} */
export const localStorageAdapter = {
  load(key, fallback) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: keep in-memory state */ }
  },
};
