import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { blockTimes } from '../../domain/entries.js';
import { H, fmtDate, fmtTime } from '../../domain/time.js';
import { Button, Select } from '../atoms';
import { BillableToggle, Field, ProjectSelect, TagPicker } from '../molecules';

/** Edits `entry`, or without one adds a past block; admins and managers can add it for someone they see. */
export function EntryForm({ entry, onSave, onCancel }) {
  const { projectById, tasks, tags, addTag, members, currentUserId } = useCatalog();
  const [f, setF] = useState(() => {
    const now = Date.now();
    const e = entry ?? { member: currentUserId, desc: '', project: '', task: tasks[0], tags: [], billable: true, start: now - H, end: now };
    return { ...e, date: fmtDate(e.start), from: fmtTime(e.start), to: fmtTime(e.end) };
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = patch => setF(x => ({ ...x, ...patch }));
  const people = entry ? [] : members.filter(m => m.active);
  const ok = !!projectById[f.project] && !!f.desc.trim() && !!f.date && !!f.from && !!f.to;
  const save = async () => {
    if (!ok || busy) return;
    const { date, from, to, ...e } = f;
    setBusy(true);
    try {
      await onSave({ ...e, ...blockTimes(date, from, to) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="eform" role="group" aria-label={entry ? 'Edit entry' : 'Add time'} onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
      <input className="input" placeholder="What did you work on?" aria-label="Description" autoFocus
        value={f.desc} onChange={e => set({ desc: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <div className="eform-fields">
        {people.length > 1 &&
          <Field label="Member">
            <Select value={f.member} onChange={e => set({ member: e.target.value })}>{people.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </Field>}
        <Field label="Project">
          <ProjectSelect value={f.project} onChange={v => set({ project: v, billable: projectById[v].billable })} />
        </Field>
        <Field label="Task">
          <Select value={f.task} onChange={e => set({ task: e.target.value })}>{[...new Set([f.task, ...tasks])].map(t => <option key={t}>{t}</option>)}</Select>
        </Field>
        <Field label="Tags" className="pop-wrap">
          <TagPicker options={tags} value={f.tags} onChange={v => set({ tags: v })} onCreate={addTag} />
        </Field>
        <Field label="Billing"><BillableToggle value={f.billable} onChange={v => set({ billable: v })} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></Field>
        <Field label="From"><input className="input" type="time" value={f.from} onChange={e => set({ from: e.target.value })} /></Field>
        <Field label="To"><input className="input" type="time" value={f.to} onChange={e => set({ to: e.target.value })} /></Field>
      </div>
      {error && <p className="text-muted" role="alert">{error}</p>}
      <div className="eform-act">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!ok || busy}>{entry ? 'Save' : 'Add entry'}</Button>
      </div>
    </div>
  );
}
