import { Swatch } from '../atoms';

/** rows: [{ k, h, name, sub?, color? }] sorted desc. Rows are clickable only when onPick is set. */
export function BarList({ rows, total, onPick, active, color }) {
  const max = rows.length ? rows[0].h : 1;
  return (
    <div className="blist">
      {rows.map(r => (
        <button key={r.k} className={'brow' + (active === r.k ? ' is-active' : '')} onClick={onPick ? () => onPick(r.k) : undefined} disabled={!onPick}>
          <span className="brow-name">{r.color && <Swatch color={r.color} />}<span>{r.name}</span>{r.sub && <span className="text-muted">{r.sub}</span>}</span>
          <span className="brow-bar"><i style={{ width: r.h / max * 100 + '%', background: r.color || color }} /></span>
          <span className="brow-h">{r.h.toFixed(1)}h</span>
          <span className="brow-pct text-muted">{total ? Math.round(r.h / total * 100) : 0}%</span>
        </button>
      ))}
    </div>
  );
}
