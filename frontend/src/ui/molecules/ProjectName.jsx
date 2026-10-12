import { useCatalog } from '../../application/services.jsx';
import { Swatch } from '../atoms';

export function ProjectName({ id, withClient }) {
  const { projectById, clients } = useCatalog();
  const p = projectById[id];
  return <><Swatch color={p.color} />{p.name}{withClient && <span className="text-muted">· {clients[p.client]}</span>}</>;
}
