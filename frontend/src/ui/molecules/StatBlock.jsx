import { Kicker } from '../atoms';

export const StatBlock = ({ label, value, unit, note }) => (
  <div className="stat"><Kicker>{label}</Kicker><div className="stat-v">{value}<small>{unit}</small></div><div className="text-muted">{note}</div></div>
);
