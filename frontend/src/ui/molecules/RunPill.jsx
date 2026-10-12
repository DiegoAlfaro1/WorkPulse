import { fmtClock } from '../../domain/time.js';
import { RecDot } from '../atoms';

export const RunPill = ({ elapsed, label, onClick }) => (
  <button className="runpill" onClick={onClick}><RecDot /><b>{fmtClock(elapsed)}</b>{label}</button>
);
