import { useCatalog } from '../../application/services.jsx';
import { weekSummary } from '../../domain/entries.js';
import { H, fmtDur } from '../../domain/time.js';
import { Kicker, Meter } from '../atoms';
import { ProjectName } from '../molecules';

const WEEKDAY_INITIALS = 'MTWTFSS';

export function WeekPanel({ entries, now, children }) {
  const { projectById } = useCatalog();
  const { days, total, max, todayH, projects } = weekSummary(entries, now);
  const pmax = projects.length ? projects[0][1] : 1;
  return (
    <aside className="week">
      <div className="week-sec">
        <Kicker>Today</Kicker>
        <div className="big">{fmtDur(todayH * H)}<span className="big-of">/ 8:00</span></div>
        <Meter pct={todayH / 8 * 100} />
      </div>
      <div className="week-sec">
        <Kicker>This week</Kicker>
        <div className="big">{fmtDur(total * H)}<span className="big-of">/ 40:00</span></div>
        <div className="wbars">
          {days.map((d, i) => (
            <div key={i} className={'wbar' + (d.isToday ? ' is-today' : '') + (d.isFuture ? ' is-future' : '')}>
              <span className="wbar-v">{d.h ? fmtDur(d.h * H) : ''}</span>
              <div className="wbar-track"><i style={{ height: d.h / max * 100 + '%' }} /><b style={{ bottom: 8 / max * 100 + '%' }} /></div>
              <span className="wbar-l">{WEEKDAY_INITIALS[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="week-sec">
        <Kicker>By project, this week</Kicker>
        <div className="plist">
          {projects.map(([p, ms]) => (
            <div key={p} className="plist-row">
              <div className="plist-top"><span><ProjectName id={p} /></span><b>{fmtDur(ms)}</b></div>
              <div className="pbar"><i style={{ width: ms / pmax * 100 + '%', background: projectById[p].color }} /></div>
            </div>
          ))}
        </div>
      </div>
      {children}
    </aside>
  );
}
