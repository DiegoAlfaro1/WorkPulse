import { ROLE_LABELS } from '../../domain/roles.js';
import { fmtH } from '../../domain/time.js';
import { Avatar, Meter } from '../atoms';
import { ProjectName } from '../molecules';

export function TeamTable({ rows, workingDays, active, onPick }) {
  const target = workingDays * 8;
  return (
    <table className="table">
      <thead>
        <tr><th>Member</th><th>Hours</th><th>Billable</th><th>Avg / day</th><th>Top project</th><th style={{ width: '28%' }}>Against target ({target}h)</th></tr>
      </thead>
      <tbody>
        {rows.map(t => (
          <tr key={t.m.id} className={active === t.m.id ? 'is-active' : ''} onClick={() => onPick(t.m.id)}>
            <td><div className="who"><Avatar name={t.m.name} /><div><b>{t.m.name}</b><div className="text-muted">{ROLE_LABELS[t.m.role]}{!t.m.active && ' · deactivated'}</div></div></div></td>
            <td className="num">{fmtH(t.h)}</td>
            <td className="num">{t.h ? Math.round(t.b / t.h * 100) : 0}%</td>
            <td className="num">{fmtH(t.days ? t.h / t.days : 0)}</td>
            <td>{t.top && <span className="nowrap"><ProjectName id={t.top} /></span>}</td>
            <td><div className="util"><Meter pct={target ? t.h / target * 100 : 0} /><span className="num">{target ? Math.round(t.h / target * 100) : 0}%</span></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
