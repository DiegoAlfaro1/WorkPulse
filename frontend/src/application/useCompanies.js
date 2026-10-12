import { useCallback, useEffect, useState } from 'react';
import { useServices } from './services.jsx';

/** Super admin: every company and every (non super admin) user. */
export function useCompanies() {
  const { api } = useServices();
  const [companies, setCompanies] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => Promise.all([api.listCompanies(), api.listUsers()])
    .then(([cs, us]) => { setCompanies(cs); setUsers(us); setError(''); }, err => setError(err.message)), [api]);
  useEffect(() => { load(); }, [load]);
  return {
    companies, users, error,
    addCompany: c => api.createCompany(c).then(load),
    setCompanyActive: (id, active) => api.setCompanyActive(id, active).then(load),
  };
}
