import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TextField, Grid, Typography, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  List, ListItemButton, ListItemText, Paper, Box, Divider, Chip, Tooltip
} from '@mui/material';
import { getTaseTickersDataset, getTickerData, type TaseTicker, type TickerData, DEFAULT_SECURITY_TYPE_CONFIG } from '../lib/fetching';
import type { Portfolio } from '../lib/types';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import { useLanguage } from '../lib/i18n';

interface TickerSearchProps {
  onTickerSelect: (ticker: TickerData & { symbol: string; numeric_id?: number }) => void;
  prefilledTicker?: string;
  prefilledExchange?: string;
  portfolios: Portfolio[];
  isPortfoliosLoading: boolean;
}

// Custom hook for debouncing
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface SearchResult {
  symbol: string;
  numericSecurityId?: number; // TASE specific
  name: string;
  nameHe?: string;
  exchange: string;
  type?: string;
  globesInstrumentId?: string; // TASE specific
  rawTicker?: TaseTicker | TickerData;
  ownedInPortfolios?: string[];
}

function getOwnedInPortfolios(symbol: string, portfolios: Portfolio[]) {
  if (!portfolios || portfolios.length === 0) return undefined;
  const owningPortfolios = portfolios.filter(p =>
    p.holdings && p.holdings.some(h => h.ticker === symbol)
  );
  return owningPortfolios.length > 0 ? owningPortfolios.map(p => p.name) : undefined;
}

function processTaseResult(t: TaseTicker, instrumentType: string, portfolios: Portfolio[]): SearchResult {
  return {
    symbol: t.symbol,
    numericSecurityId: t.securityId,
    name: t.nameEn,
    nameHe: t.nameHe,
    exchange: t.exchange || 'TASE',
    type: instrumentType,
    globesInstrumentId: t.globesInstrumentId,
    rawTicker: t,
    ownedInPortfolios: getOwnedInPortfolios(t.symbol, portfolios),
  };
}

function searchTaseType(
  tickers: TaseTicker[],
  instrumentType: string,
  termUC: string,
  portfolios: Portfolio[]
): SearchResult[] {
  return tickers.filter(item =>
  (item.symbol.toUpperCase().includes(termUC) || item.securityId.toString() === termUC ||
    item.nameEn.toUpperCase().includes(termUC) ||
    item.nameHe.toUpperCase().includes(termUC))
  ).map(t => processTaseResult(t, instrumentType, portfolios));
}

async function performSearch(
  searchTerm: string,
  exchange: string,
  taseDataset: Record<string, TaseTicker[]>,
  portfolios: Portfolio[]
): Promise<SearchResult[]> {
  const termUC = searchTerm.toUpperCase();
  let results: SearchResult[] = [];

  // Search in local dataset (which now covers TASE, NASDAQ, NYSE)
  Object.entries(taseDataset).forEach(([type, tickers]) => {
    let matches = searchTaseType(tickers, type, termUC, portfolios);
    if (exchange !== 'ALL') {
      matches = matches.filter(r => r.exchange === exchange);
    }
    results = results.concat(matches);
  });

  // Fallback: On-demand fetch for specific exchanges if not found in dataset (optional, but good for robustness)
  // Only if we didn't find enough results? Or always?
  // For now, let's trust the dataset primarily. But if the dataset is empty (loading failed?), we might want fallback.
  // However, the request specifically asked to load data from all exchanges available.
  
  // Let's keep the on-demand fetch only if it's NOT TASE (since TASE is fully in dataset usually)
  // and if we are searching specifically or ALL.
  // Actually, let's comment it out or remove it if we trust the dataset.
  // But wait, getTickerData fetches from Yahoo/Globes live. Dataset is cached list.
  // Live fetch might find things not in list.
  // Let's keep it but deduplicate.
  

  return results.reduce((acc, current) => {
    const existing = acc.find(item => item.symbol === current.symbol && item.exchange === current.exchange);
    if (!existing) acc.push(current);
    return acc;
  }, [] as SearchResult[]);
}

export function TickerSearch({ onTickerSelect, prefilledTicker, prefilledExchange, portfolios, isPortfoliosLoading }: TickerSearchProps) {
  const [taseDataset, setTaseDataset] = useState<Record<string, TaseTicker[]>>({});
  const [isTaseDatasetLoading, setIsTaseDatasetLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(prefilledTicker || '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedExchange, setSelectedExchange] = useState(prefilledExchange || 'ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, tTry } = useLanguage();

  const searchTickers = useCallback(async (term: string, exchange: string) => {
    try {
      const results = await performSearch(term, exchange, taseDataset, portfolios);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed", err);
      setError("Search failed");
    }
  }, [taseDataset, portfolios]);

  const debouncedInput = useDebounce(inputValue, 300);

  useEffect(() => {
    let active = true;

    const loadDataset = async () => {
      if (Object.keys(taseDataset).length > 0) return; // Already loaded locally

      setIsTaseDatasetLoading(true);
      try {
        const data = await getTaseTickersDataset();
        if (active) setTaseDataset(data);
      } finally {
        if (active) setIsTaseDatasetLoading(false);
      }
    };

    if (document.visibilityState === 'visible') {
      loadDataset();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDataset();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [taseDataset]);
  useEffect(() => {
    if (isFocused && !isPortfoliosLoading && !isTaseDatasetLoading) {
      if (!debouncedInput) {
        setSearchResults([]);
        return;
      }

      const doSearch = async () => {
        setIsLoading(true);
        try {
          await searchTickers(debouncedInput, selectedExchange);
        } finally {
          setIsLoading(false);
        }
      };
      doSearch();
    }
  }, [debouncedInput, selectedExchange, isPortfoliosLoading, isTaseDatasetLoading, isFocused, searchTickers]);

  const filteredResults = useMemo(() => {
    const filtered = selectedType === 'ALL' ? searchResults : searchResults.filter(opt => opt.type === selectedType);
    return filtered.slice(0, 50);
  }, [searchResults, selectedType]);

  const typeFilterOptions = useMemo(() => {
    return Object.entries(DEFAULT_SECURITY_TYPE_CONFIG)
      .filter(([, { enabled }]) => enabled)
      .map(([key, { displayName }]) => ({ key, displayName }));
  }, []);

  const getTranslatedType = (typeKey: string, defaultName: string) => {
    const map: Record<string, string> = {
      'Stock': t('Stock', 'מניה'),
      'ETF': t('ETF', 'תעודת סל'),
      'Mutual Fund': t('Mutual Fund', 'קרן נאמנות'),
    };
    return map[defaultName] || defaultName;
  };

  const handleOptionSelect = async (result: SearchResult) => {
    if (result.rawTicker && 'price' in result.rawTicker) {
      onTickerSelect({ ...result.rawTicker, symbol: result.symbol, exchange: result.exchange, numeric_id: result.numericSecurityId });
    } else {
      setIsLoading(true);
      const data = await getTickerData(result.symbol, result.exchange, result.numericSecurityId || null);
      setIsLoading(false);
      if (data) {
        onTickerSelect({ ...data, symbol: result.symbol, exchange: result.exchange, numeric_id: result.numericSecurityId });
      }
    }
    setSearchResults([]);
    setInputValue(result.symbol);
  };

  return (
    <Box>
      <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Grid item xs={12} sm={6}>
          <TextField
            onFocus={() => setIsFocused(true)}
            label={`${t('Search Ticker', 'חפש נייר')} ${selectedExchange === 'ALL' ? '' : `(${selectedExchange})`}`}
            size="small"
            fullWidth
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            InputProps={{
              endAdornment: (
                <>
                  {(isLoading || isTaseDatasetLoading || isPortfoliosLoading) ? <CircularProgress color="inherit" size={20} /> : null}
                </>
              ),
            }}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <FormControl fullWidth size="small">
            <InputLabel>{t('Exchange', 'בורסה')}</InputLabel>
            <Select
              value={selectedExchange}
              label={t('Exchange', 'בורסה')}
              onChange={(e) => setSelectedExchange(e.target.value as string)}
            >
              <MenuItem value="ALL">{t('All', 'הכל')}</MenuItem>
              <MenuItem value="TASE">TASE</MenuItem>
              <MenuItem value="NASDAQ">NASDAQ</MenuItem>
              <MenuItem value="NYSE">NYSE</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={3}>
          <FormControl fullWidth size="small">
            <InputLabel>{t('Type', 'סוג')}</InputLabel>
            <Select
              value={selectedType}
              label={t('Type', 'סוג')}
              onChange={(e) => setSelectedType(e.target.value as string)}
              disabled={selectedExchange !== 'ALL' && selectedExchange !== 'TASE'}
            >
              <MenuItem value="ALL">{t('All Types', 'כל הסוגים')}</MenuItem>
              {typeFilterOptions.map(({ key, displayName }) => (
                <MenuItem key={key} value={key}>{displayName}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        {error && <Grid item xs={12}><Typography color="error">{error}</Typography></Grid>}
      </Grid>

      {(filteredResults.length > 0) && (
        <Paper elevation={2} sx={{ maxHeight: 300, overflowY: 'auto', my: 1 }}>
          <List dense>
            {filteredResults.map((option, index) => (
              <Box key={`${option.exchange}:${option.symbol}`}>
                <ListItemButton onClick={() => handleOptionSelect(option)}>
                  <ListItemText
                    primary={<Typography variant="body1">{tTry(option.name, option.nameHe)}</Typography>}
                    secondaryTypographyProps={{ component: 'div' }} // Render secondary as div
                    secondary={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                        <Chip
                          label={`${option.exchange}:${option.symbol}${option.numericSecurityId ? ` (${option.numericSecurityId})` : ''}`} size="small" variant="outlined" />
                        {option.type && DEFAULT_SECURITY_TYPE_CONFIG[option.type] && <Chip label={getTranslatedType(option.type, DEFAULT_SECURITY_TYPE_CONFIG[option.type]?.displayName || option.type)} size="small" color="primary" variant="outlined" />}
                        {option.ownedInPortfolios && option.ownedInPortfolios.length > 0 && (
                          <Tooltip title={`Owned in: ${option.ownedInPortfolios.join(', ')}`}>
                            <BusinessCenterIcon color="success" sx={{ fontSize: 16, ml: 1 }} />
                          </Tooltip>
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
                {index < filteredResults.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
