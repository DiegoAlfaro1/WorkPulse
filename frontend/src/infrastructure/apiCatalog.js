/** Backend adapter for user-created projects and tags. Ids come back as numbers; the UI keys everything by string. */
async function req(path, body) {
  const r = await fetch('/api' + path, body && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

const toProject = p => ({ ...p, id: String(p.id) });

/** @type {import('../application/ports.js').CatalogApiPort} */
export const apiCatalog = {
  listProjects: () => req('/projects').then(ps => ps.map(toProject)),
  createProject: p => req('/projects', p).then(toProject),
  listTags: () => req('/tags').then(ts => ts.map(t => t.name)),
  createTag: name => req('/tags', { name }).then(t => t.name),
};
