import { useMemo, useState } from 'react';
import { groupByDay, totalDuration } from '../../domain/entries.js';
import { dayLabel, fmtDay, fmtDur } from '../../domain/time.js';
import { Button, Icon } from '../atoms';
import { EntryRow } from '../molecules';
import { EntryForm } from './EntryForm.jsx';

export function EntryList({ entries, today, onResume, onAdd, onEdit, onDelete, deleting }) {
  const [daysShown, setDaysShown] = useState(3);
  const [editing, setEditing] = useState(null); // an entry id, 'new', or null
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const close = () => setEditing(null);
  return (
    <section className="entries">
      <div className="entries-head">
        {editing !== 'new' && <Button variant="secondary" onClick={() => setEditing('new')}>Add time<Icon n="edit" s={14} /></Button>}
      </div>
      {editing === 'new' && <EntryForm onSave={e => onAdd(e).then(close)} onCancel={close} />}
      {groups.slice(0, daysShown).map(([k, list]) => (
        <div key={k} className="day">
          <div className="day-head">
            <h4>{dayLabel(k, today)} <span className="day-date">{fmtDay(k)}</span></h4>
            <span className="day-total">{fmtDur(totalDuration(list))}</span>
          </div>
          {list.map(e => (editing === e.id
            ? <EntryForm key={e.id} entry={e} onSave={x => onEdit(e.id, x).then(close)} onCancel={close} />
            : <EntryRow key={e.id} entry={e} onResume={onResume} onEdit={x => setEditing(x.id)} onDelete={onDelete} deleting={deleting.has(e.id)} />))}
        </div>
      ))}
      {daysShown < groups.length &&
        <Button variant="secondary" className="more" onClick={() => setDaysShown(daysShown + 3)}>Show earlier days<Icon n="chevron" s={14} /></Button>}
    </section>
  );
}
