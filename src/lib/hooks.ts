import { useState, useEffect } from 'react';
import { fetchPortfolios } from './sheets/index';
import type { Portfolio } from './types';

export function usePortfolios(sheetId: string | null, refreshTrigger = 0) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sheetId) return;

    let active = true;
    setLoading(true);
    const loadPorts = () => {
      fetchPortfolios(sheetId)
        .then(data => {
          if (active) {
            setPortfolios(data);
            setLoading(false);
          }
        })
        .catch(err => {
          if (active) {
            console.error("Failed to load portfolios", err);
            setError(String(err));
            setLoading(false);
          }
        });
    };

    loadPorts();
    window.addEventListener('market-data-refreshed', loadPorts);

    return () => { 
        active = false; 
        window.removeEventListener('market-data-refreshed', loadPorts); 
    };
  }, [sheetId, refreshTrigger]);

  return { portfolios, loading, error };
}
