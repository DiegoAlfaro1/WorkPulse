import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ServicesContext = createContext(null);
const COLORS = ['var(--color-accent)', 'var(--color-neutral-900)', 'var(--color-accent-300)', 'var(--color-neutral-500)', 'var(--color-accent-800)'];

/** Adds the user-created projects (persisted via storage) to the static catalog. Clients are derived from them. */
export function ServicesProvider({ services, children }) {
  const { storage, catalog } = services;
  const [projects, setProjects] = useState(() => storage.load('wp_projects', []));
  useEffect(() => { storage.save('wp_projects', projects); }, [storage, projects]);
  const value = useMemo(() => ({
    ...services,
    catalog: {
      ...catalog, projects,
      projectById: Object.fromEntries(projects.map(p => [p.id, p])),
      clients: Object.fromEntries(projects.map(p => [p.client, p.client])),
      addProject: p => setProjects(ps => [...ps, { ...p, id: 'p' + Date.now(), color: COLORS[ps.length % COLORS.length] }]),
    },
  }), [services, storage, catalog, projects]);
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
