/** Backend adapter for projects, tags and time entries. Ids come back as numbers; the UI keys everything by string. */
async function req(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch('/api' + path, {
    method, ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await r.json().catch(() => ({})); // 204 has no body
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

const toProject = p => ({ ...p, id: String(p.id) });
// Entry tags travel as {name} objects (the backend's Tag model); the UI uses plain names.
const toEntry = e => ({ ...e, id: String(e.id), project: String(e.project), tags: e.tags.map(t => t.name) });

/** @type {import('../application/ports.js').ApiPort} */
export const apiAdapter = {
  listProjects: () => req('/projects').then(ps => ps.map(toProject)),
  createProject: p => req('/projects', p).then(toProject),
  listTags: () => req('/tags').then(ts => ts.map(t => t.name)),
  createTag: name => req('/tags', { name }).then(t => t.name),
  listEntries: () => req('/entries').then(es => es.map(toEntry)),
  deleteEntry: id => req('/entries/' + id, undefined, 'DELETE'),
  createEntry: e => req('/entries', { ...e, project: Number(e.project), tags: e.tags.map(name => ({ name })) }).then(toEntry),
};
