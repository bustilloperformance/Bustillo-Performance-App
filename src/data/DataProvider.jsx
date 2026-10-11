import { useCallback, useEffect, useState } from 'react';
import { DataContext, EMPTY, fetchAll } from './store';

// ============================================================
//  DATA PROVIDER — mounts the store, fetches all tables once, and exposes
//  { data, loading, error, refresh } via DataContext. Kept in its own file so
//  store.jsx stays component-free (clean Fast Refresh).
// ============================================================
export function DataProvider({ children }) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAll();
      setData(next);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  // Mount-time data fetch — the canonical use of an effect. setState happens
  // only after the async fetch resolves (not synchronously in the effect body).
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  return (
    <DataContext.Provider value={{ data, loading, error, refresh }}>
      {children}
    </DataContext.Provider>
  );
}

export default DataProvider;
