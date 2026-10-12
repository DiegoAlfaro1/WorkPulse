import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ServicesContext = createContext(null);
const COLORS = ['var(--color-accent)', 'var(--color-neutral-900)', 'var(--color-accent-300)', 'var(--color-neutral-500)', 'var(--color-accent-800)'];

/**
 * Owns the session and, once a company user is signed in, the catalog: the API's projects, tags,
 * the users the signer may see, and teams, on top of the static catalog. Clients are derived from
 * projects; colors are picked on creation, or else from their order.
 * Company users' children render only once the catalog has loaded, so nothing sees an empty catalog
 * and drops the running timer. Signed out or super admin: children get `auth` but no `catalog`.
 */
export function ServicesProvider({ services, children }) {
  const { api, catalog } = services;
  const [session, setSession] = useState(undefined); // undefined: checking · null: signed out · { user, impersonating }
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const loadSession = useCallback(() => api.me().then(setSession, err => (err.status === 401 ? setSession(null) : setError(err))), [api]);
  useEffect(() => { api.setUnauthorizedHandler(() => setSession(null)); loadSession(); }, [api, loadSession]);

  useEffect(() => {
    setData(null);
    if (!session?.user.company) return;
    Promise.all([api.listProjects(), api.listTags(), api.listUsers(), api.listTeams()])
      .then(([projects, tags, users, teams]) => setData({ projects, tags, users, teams }), setError);
  }, [api, session]);

  const reloadPeople = useCallback(
    () => Promise.all([api.listUsers(), api.listTeams()]).then(([users, teams]) => setData(d => ({ ...d, users, teams }))),
    [api],
  );

  const value = useMemo(() => {
    const auth = {
      session,
      signIn: (email, password) => api.login(email, password).then(loadSession),
      signOut: () => api.logout().then(() => setSession(null)),
      impersonate: userId => api.impersonate(userId).then(loadSession),
      stopImpersonating: () => api.stopImpersonating().then(loadSession),
      changePassword: (current, next) => api.changePassword(current, next),
    };
    if (!data || !session) return { ...services, auth };
    const projects = data.projects.map((p, i) => ({ ...p, color: p.color || COLORS[i % COLORS.length] }));
    return {
      ...services, auth,
      catalog: {
        ...catalog, projects, tags: data.tags, teams: data.teams,
        me: session.user, currentUserId: session.user.id, members: data.users,
        projectById: Object.fromEntries(projects.map(p => [p.id, p])),
        clients: Object.fromEntries(projects.map(p => [p.client, p.client])),
        addProject: async p => {
          const created = await api.createProject(p);
          setData(d => ({ ...d, projects: [...d.projects, created] }));
        },
        addTag: async name => {
          const created = await api.createTag(name);
          setData(d => ({ ...d, tags: [...d.tags, created].sort() }));
          return created;
        },
        // Team membership decides who sees whom, so every change re-reads users and teams from the server.
        addUser: u => api.createUser(u).then(reloadPeople),
        updateUser: (id, patch) => api.updateUser(id, patch).then(reloadPeople),
        setUserActive: (id, active) => api.setUserActive(id, active).then(reloadPeople),
        addTeam: name => api.createTeam(name).then(reloadPeople),
        renameTeam: (id, name) => api.renameTeam(id, name).then(reloadPeople),
        removeTeam: id => api.deleteTeam(id).then(reloadPeople),
      },
    };
  }, [services, api, catalog, data, session, loadSession, reloadPeople]);

  if (error) return <p className="boot" role="alert">Can't reach the WorkPulse API: {error.message}</p>;
  if (session === undefined || (session?.user.company && !data)) return <p className="boot">Loading…</p>;
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export const useServices = () => useContext(ServicesContext);
export const useCatalog = () => useServices().catalog;
export const useAuth = () => useServices().auth;

export function usePersistentState(key, init) {
  const { storage } = useServices();
  const [v, setV] = useState(() => storage.load(key, init));
  useEffect(() => { storage.save(key, v); }, [storage, key, v]);
  return [v, setV];
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}
