import { useCatalog } from '../../application/services.jsx';
import { fmtClock, fmtTime } from '../../domain/time.js';
import { Button, Icon, RecDot, Select } from '../atoms';
import { BillableToggle, Field, ProjectSelect, TagPicker } from '../molecules';

export function TimerBar({ timer, onChange, onStart, onStop, now }) {
  const { projectById, tasks, tags } = useCatalog();
  const running = !!timer.start;
  const canStart = !!projectById[timer.project];
  const toggleRun = () => (running ? onStop() : canStart && onStart());
  return (
    <section className={'timer' + (running ? ' is-running' : '')}>
      <div className="timer-main">
        <input className="timer-desc" placeholder="What are you working on?" aria-label="Description"
          value={timer.desc} onChange={e => onChange({ desc: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') toggleRun(); }} />
        <div className="timer-fields">
          <Field label="Project">
            <ProjectSelect value={timer.project} onChange={v => onChange({ project: v, billable: projectById[v].billable })} />
          </Field>
          <Field label="Task">
            <Select value={timer.task} onChange={e => onChange({ task: e.target.value })}>{tasks.map(t => <option key={t}>{t}</option>)}</Select>
          </Field>
          <Field label="Tags" className="pop-wrap">
            <TagPicker options={tags} value={timer.tags} onChange={v => onChange({ tags: v })} />
          </Field>
          <Field label="Billing">
            <BillableToggle value={timer.billable} onChange={v => onChange({ billable: v })} />
          </Field>
        </div>
      </div>
      <div className="timer-clock">
        <div className="clock-label">{running ? <><RecDot />Started {fmtTime(timer.start)}</> : 'Not running'}</div>
        <div className="clock">{fmtClock(running ? now - timer.start : 0)}</div>
      </div>
      <Button variant="primary" className="timer-go" onClick={toggleRun} disabled={!running && !canStart} title={canStart ? undefined : 'Add or select a project first'}>
        {running ? 'Stop' : 'Start'}<Icon n={running ? 'stop' : 'play'} s={18} />
      </Button>
    </section>
  );
}
