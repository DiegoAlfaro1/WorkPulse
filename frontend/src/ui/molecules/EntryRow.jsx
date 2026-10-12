import { fmtDur, fmtTime } from '../../domain/time.js';
import { Button, Icon, Tag } from '../atoms';
import { ProjectName } from './ProjectName.jsx';

export function EntryRow({ entry: e, onResume, onDelete, deleting }) {
  return (
    <div className="erow">
      <div className="erow-main">
        <div className="erow-desc">{e.desc || <span className="text-muted">No description</span>}</div>
        <div className="erow-proj"><ProjectName id={e.project} withClient /></div>
      </div>
      <div><Tag>{e.task}</Tag></div>
      <div className="erow-tags">{e.tags.map(t => <span key={t}>#{t}</span>)}</div>
      <span className={'erow-bill' + (e.billable ? ' on' : '')} title={e.billable ? 'Billable' : 'Non-billable'}><Icon n="dollar" s={15} /></span>
      <span className="erow-range">{fmtTime(e.start)}–{fmtTime(e.end)}</span>
      <span className="erow-dur">{fmtDur(e.end - e.start)}</span>
      <div className="erow-act">
        <Button variant="icon" title="Resume this entry" aria-label="Resume this entry" onClick={() => onResume(e)}><Icon n="play" /></Button>
        <Button variant="icon" title="Delete" aria-label="Delete" disabled={deleting} onClick={() => window.confirm("Delete this entry? This can't be undone.") && onDelete(e)}><Icon n="trash" /></Button>
      </div>
    </div>
  );
}
