import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ServicesContext = createContext(null);
const COLORS = ['var(--color-accent)', 'var(--color-neutral-900)', 'var(--color-accent-300)', 'var(--color-neutral-500)', 'var(--color-accent-800)'];

/**
 * Adds the API's projects and tags to the static catalog. Clients are derived from projects; colors from their order.
 * Children render only once both lists have loaded, so nothing sees an empty catalog and drops the running timer.
 */
export function ServicesProvider({ services, children }) {
  const { api, catalog } = services;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([api.listProjects(), api.listTags()])
      .then(([projects, tags]) => setData({ projects, tags }), setError);
  }, [api]);
  const value = useMemo(() => {
    if (!data) return null;
    const projects = data.projects.map((p, i) => ({ ...p, color: COLORS[i % COLORS.length] }));
    return {
      ...services,
      catalog: {
        ...catalog, projects, tags: data.tags,
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
      },
    };
  }, [services, api, catalog, data]);
  if (error) return <p className="boot" role="alert">Can't reach the WorkPulse API: {error.message}</p>;
  if (!value) return <p className="boot">Loading…</p>;
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export const useServices = () => useContext(ServicesContext);
export const useCatalog = () => useServices().catalog;

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
