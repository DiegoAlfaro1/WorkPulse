export const DAY = 864e5, H = 36e5, M = 6e4;

export const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
// Monday 00:00 of d's week. The +2h nudge keeps DST-short days from snapping back a day.
export const sow = d => { const x = new Date(sod(d)); const wd = (x.getDay() + 6) % 7; return sod(x.getTime() - wd * DAY + 2 * H); };
export const addDays = (t, n = 1) => sod(t + n * DAY + 2 * H);
export const hrs = ms => ms / H;
export const overlap = (e, a, b) => Math.max(0, Math.min(e.end, b) - Math.max(e.start, a));

const pad = n => String(n).padStart(2, '0');
export const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
// Clamped: `now` ticks once a second, so right after Start, now - start can be slightly negative.
export const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
export const fmtTime = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const fmtDay = t => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const dayLabel = (k, today) =>
  k === today ? 'Today'
    : k === today - DAY || k === addDays(today, -1) ? 'Yesterday'
      : new Date(k).toLocaleDateString('en-GB', { weekday: 'long' });
