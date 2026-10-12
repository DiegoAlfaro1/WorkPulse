import { heatLevel, heatWeeks } from '../../domain/insights.js';
import { fmtDay, fmtH } from '../../domain/time.js';

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const monthOf = t => new Date(t).getMonth();
const monthName = t => new Date(t).toLocaleDateString('en-GB', { month: 'short' });

export function Heatmap({ data, people, now }) {
  const weeks = heatWeeks(data, people, now);
  return (
    <div className="heat">
      <div className="heat-days">{DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div>
        <div className="heat-months">
          {weeks.map((w, i) => <span key={i}>{i === 0 || monthOf(w[0].t) !== monthOf(weeks[i - 1][0].t) ? monthName(w[0].t) : ''}</span>)}
        </div>
        <div className="heat-grid">
          {weeks.map((w, i) => w.map((c, j) => (
            <i key={i + '-' + j} className={'hc l' + (c.future ? 'x' : heatLevel(c.h))}
              title={c.future ? '' : `${fmtDay(c.t)} — ${fmtH(c.h)}${people > 1 ? ' avg per person' : ''}`} />
          )))}
        </div>
        <div className="heat-legend">
          <span>Less</span>{[0, 1, 2, 3, 4].map(l => <i key={l} className={'hc l' + l} />)}<span>More</span>
          <span className="text-muted">{people > 1 ? 'Average hours per person per day' : 'Hours per day'} · 0 / &lt;4 / &lt;6 / &lt;8 / 8+</span>
        </div>
      </div>
    </div>
  );
}
