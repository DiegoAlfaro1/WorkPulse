/**
 * Backend adapter. Ids come back as numbers; the UI keys everything by string.
 * The session's bearer token lives in localStorage; while the super admin impersonates someone,
 * their own token is parked under SUPER_KEY so "Exit" can go back to it.
 */
const TOKEN_KEY = 'wp_token', SUPER_KEY = 'wp_super_token';
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* blocked: session lasts until reload */ } };

let token = read(TOKEN_KEY);
const setToken = t => { token = t; write(TOKEN_KEY, t); };
let onUnauthorized = () => {};

async function req(path, body, method = body ? 'POST' : 'GET') {
  const headers = { ...(token && { Authorization: 'Bearer ' + token }), ...(body && { 'Content-Type': 'application/json' }) };
  const r = await fetch('/api' + path, { method, headers, ...(body && { body: JSON.stringify(body) }) });
  const data = await r.json().catch(() => ({})); // 204 has no body
  if (r.status === 401 && token) { setToken(null); write(SUPER_KEY, null); onUnauthorized(); } // expired or revoked session (impersonation: 1h)
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
  return data;
}

const strId = x => ({ ...x, id: String(x.id) });
// Entry tags travel as {name} objects (the backend's Tag model); the UI uses plain names.
const toEntry = e => ({ ...e, id: String(e.id), member: String(e.member), project: String(e.project), tags: e.tags.map(t => t.name) });
const toUser = u => ({ ...u, id: String(u.id), company: u.company == null ? null : String(u.company), teams: u.teams.map(strId) });
const fromEntry = ({ id, ...e }) => ({ ...e, member: Number(e.member), project: Number(e.project), tags: e.tags.map(name => ({ name })) });
const ids = list => list.map(Number);
const startSession = ({ token: t }) => setToken(t);

/** @type {import('../application/ports.js').ApiPort} */
export const apiAdapter = {
  setUnauthorizedHandler: fn => { onUnauthorized = fn; },
  me: () => (token ? req('/auth/me') : Promise.reject(Object.assign(new Error('not signed in'), { status: 401 })))
    .then(s => ({ user: toUser(s.user), impersonating: s.impersonating })),
  login: (email, password) => req('/auth/login', { email, password }).then(startSession),
  logout: async () => {
    await req('/auth/logout', {}).catch(() => {}); // already invalid server-side: still sign out here
    setToken(null);
    write(SUPER_KEY, null);
  },
  changePassword: (current, next) => req('/auth/password', { current, new: next }),
  impersonate: async userId => {
    const own = token;
    await req('/auth/impersonate', { user: Number(userId) }).then(startSession);
    write(SUPER_KEY, own);
  },
  stopImpersonating: async () => {
    await req('/auth/logout', {}).catch(() => {});
    setToken(read(SUPER_KEY));
    write(SUPER_KEY, null);
  },

  listProjects: () => req('/projects').then(ps => ps.map(strId)),
  createProject: p => req('/projects', p).then(strId),
  listTags: () => req('/tags').then(ts => ts.map(t => t.name)),
  createTag: name => req('/tags', { name }).then(t => t.name),
  listEntries: () => req('/entries').then(es => es.map(toEntry)),
  deleteEntry: id => req('/entries/' + id, undefined, 'DELETE'),
  createEntry: e => req('/entries', fromEntry(e)).then(toEntry),
  updateEntry: (id, e) => req('/entries/' + id, fromEntry(e), 'PATCH').then(toEntry),

  listUsers: () => req('/users').then(us => us.map(toUser)),
  createUser: u => req('/users', { ...u, teams: ids(u.teams) }).then(toUser),
  updateUser: (id, patch) => req('/users/' + id, { ...patch, ...(patch.teams && { teams: ids(patch.teams) }) }, 'PATCH').then(toUser),
  setUserActive: (id, active) => req(`/users/${id}/${active ? 'activate' : 'deactivate'}`, {}).then(toUser),
  listTeams: () => req('/teams').then(ts => ts.map(strId)),
  createTeam: name => req('/teams', { name }).then(strId),
  renameTeam: (id, name) => req('/teams/' + id, { name }, 'PATCH').then(strId),
  deleteTeam: id => req('/teams/' + id, undefined, 'DELETE'),
  listCompanies: () => req('/companies').then(cs => cs.map(strId)),
  createCompany: c => req('/companies', c).then(strId),
  setCompanyActive: (id, active) => req(`/companies/${id}/${active ? 'activate' : 'deactivate'}`, {}).then(strId),
};
