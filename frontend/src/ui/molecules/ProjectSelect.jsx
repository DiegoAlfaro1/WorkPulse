import { useCatalog } from '../../application/services.jsx';
import { Select } from '../atoms';

export function ProjectSelect({ value, onChange, all }) {
  const { clients, projects } = useCatalog();
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      {all && <option value="all">All projects</option>}
      {Object.entries(clients).map(([cid, cn]) => (
        <optgroup key={cid} label={cn}>
          {projects.filter(p => p.client === cid).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}
