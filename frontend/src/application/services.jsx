import { createContext, useContext, useEffect, useState } from 'react';

const ServicesContext = createContext(null);

/** @param {{ services: import('./ports.js').Services, children: any }} props */
export const ServicesProvider = ({ services, children }) =>
  <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;

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
