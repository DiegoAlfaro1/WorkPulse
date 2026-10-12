import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { axisScale } from '../../domain/insights.js';
import { fmtH } from '../../domain/time.js';
import { ProjectName } from '../molecules';

export function TrendChart({ buckets, target }) {
  const { projects } = useCatalog();
  const [hov, setHov] = useState(null);
  const { max, ticks } = axisScale(Math.max(target || 0, ...buckets.map(b => b.total)) * 1.08);
  const pct = v => v / max * 100 + '%';
  return (
    <div className="trend">
      <div className="trend-axis">{ticks.map(v => <span key={v} style={{ bottom: pct(v) }}>{v}h</span>)}</div>
      <div className="trend-plot">
        {ticks.map(v => <i key={v} className="gl" style={{ bottom: pct(v) }} />)}
        {target > 0 && <i className="tl" style={{ bottom: pct(target) }} />}
        <div className="trend-cols">
          {buckets.map((b, i) => (
            <div key={i} className={'tcol' + (b.future ? ' is-future' : '')} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              <div className="tstack">
                {projects.map(p => b.byP[p.id] ? <i key={p.id} style={{ height: pct(b.byP[p.id]), background: p.color }} /> : null)}
              </div>
              {hov === i && b.total > 0 && (
                <div className="tip elev-md" style={i > buckets.length / 2 ? { right: 0 } : { left: 0 }}>
                  <b>{b.long}</b>
                  <div className="tip-row"><span>Total</span><b>{fmtH(b.total)}</b></div>
                  {projects.filter(p => b.byP[p.id]).map(p => (
                    <div key={p.id} className="tip-row"><span><ProjectName id={p.id} /></span><span>{fmtH(b.byP[p.id])}</span></div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="trend-x">{buckets.map((b, i) => <span key={i}>{b.label}</span>)}</div>
    </div>
  );
}
