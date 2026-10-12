import { withRunning } from '../../domain/entries.js';
import { sod } from '../../domain/time.js';
import { EntryList, TimerBar, WeekPanel } from '../organisms';
import { PageShell } from '../templates/PageShell.jsx';

export function TrackPage({ tracker, now }) {
  const { mine, timer, updateTimer, start, stop, resume, remove } = tracker;
  const onResume = e => { resume(e); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <PageShell>
      <TimerBar timer={timer} onChange={updateTimer} onStart={start} onStop={stop} now={now} />
      <div className="track-grid">
        <EntryList entries={mine} today={sod(now)} onResume={onResume} onDelete={remove} />
        <WeekPanel entries={withRunning(mine, timer, now)} now={now} />
      </div>
    </PageShell>
  );
}
