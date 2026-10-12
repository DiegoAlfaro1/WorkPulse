import { useMemo, useState } from 'react';
import { groupByDay, totalDuration } from '../../domain/entries.js';
import { dayLabel, fmtDay, fmtDur } from '../../domain/time.js';
import { Button, Icon } from '../atoms';
import { EntryRow } from '../molecules';

export function EntryList({ entries, today, onResume, onDelete }) {
  const [daysShown, setDaysShown] = useState(3);
  const groups = useMemo(() => groupByDay(entries), [entries]);
  return (
    <section className="entries">
      {groups.slice(0, daysShown).map(([k, list]) => (
        <div key={k} className="day">
          <div className="day-head">
            <h4>{dayLabel(k, today)} <span className="day-date">{fmtDay(k)}</span></h4>
            <span className="day-total">{fmtDur(totalDuration(list))}</span>
          </div>
          {list.map(e => <EntryRow key={e.id} entry={e} onResume={onResume} onDelete={onDelete} />)}
        </div>
      ))}
      {daysShown < groups.length &&
        <Button variant="secondary" className="more" onClick={() => setDaysShown(daysShown + 3)}>Show earlier days<Icon n="chevron" s={14} /></Button>}
    </section>
  );
}
