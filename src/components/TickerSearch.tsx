import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TextField, Grid, Typography, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  List, ListItemButton, ListItemText, Paper, Box, Divider, Chip, Tooltip
} from '@mui/material';
import { getTaseTickersDataset, getTickerData, type TaseTicker, type TickerData, DEFAULT_TASE_TYPE_CONFIG } from '../lib/fetching';
import type { Portfolio } from '../lib/types';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';

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
    name: t.name_en,
    exchange: 'TASE',
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
    item.name_en.toUpperCase().includes(termUC) ||
    item.name_he.toUpperCase().includes(termUC))
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
  const isNumeric = /^[0-9]+$/.test(termUC);

  if (exchange === 'TASE' || exchange === 'ALL') {
    Object.entries(taseDataset).forEach(([type, tickers]) => {
      results = results.concat(searchTaseType(tickers, type, termUC, portfolios));
    });
  }
  // TODO - impl a cached data set for lookup of non-TASE exchanges, use globes as source
  if (!isNumeric && (exchange === 'NASDAQ' || exchange === 'NYSE' || exchange === 'ALL')) {
    const data = await getTickerData(termUC, exchange, null);
    if (data) {
      results.push({
        symbol: termUC,
        numericSecurityId: undefined, // Non-TASE tickers don't have numericSecurityId
        name: data.name || searchTerm,
        exchange: data.exchange || 'Unknown',
        rawTicker: data,
        ownedInPortfolios: getOwnedInPortfolios(termUC, portfolios),
      });
    }
  }

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
    if (isFocused && Object.keys(taseDataset).length === 0) {
      // Only trigger load if not already loading or loaded
      const load = async () => {
        setIsTaseDatasetLoading(true);
        try {
          const data = await getTaseTickersDataset();
          if (active) setTaseDataset(data);
        } finally {
          if (active) setIsTaseDatasetLoading(false);
        }
      };
      load();
    }
    return () => { active = false; };
  }, [isFocused, taseDataset]); // Removed setIsTaseDatasetLoading from dep array to avoid loop if unstable reference
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
    return Object.entries(DEFAULT_TASE_TYPE_CONFIG)
      .filter(([, { enabled }]) => enabled)
      .map(([key, { displayName }]) => ({ key, displayName }));
  }, []);

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
            label={`Search Ticker ${selectedExchange === 'ALL' ? '' : `(${selectedExchange})`}`}
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
            <InputLabel>Exchange</InputLabel>
            <Select
              value={selectedExchange}
              label="Exchange"
              onChange={(e) => setSelectedExchange(e.target.value as string)}
            >
              <MenuItem value="ALL">All</MenuItem>
              <MenuItem value="TASE">TASE</MenuItem>
              <MenuItem value="NASDAQ">NASDAQ</MenuItem>
              <MenuItem value="NYSE">NYSE</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={3}>
          <FormControl fullWidth size="small">
            <InputLabel>Type</InputLabel>
            <Select
              value={selectedType}
              label="Type"
              onChange={(e) => setSelectedType(e.target.value as string)}
              disabled={selectedExchange !== 'ALL' && selectedExchange !== 'TASE'}
            >
              <MenuItem value="ALL">All Types</MenuItem>
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
                    primary={<Typography variant="body1">{option.name}</Typography>}
                    secondaryTypographyProps={{ component: 'div' }} // Render secondary as div
                    secondary={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                        <Chip
                          label={`${option.exchange}:${option.symbol}${option.numericSecurityId ? ` (${option.numericSecurityId})` : ''}`} size="small" variant="outlined" />
                        {option.type && DEFAULT_TASE_TYPE_CONFIG[option.type] && <Chip label={DEFAULT_TASE_TYPE_CONFIG[option.type]?.displayName || option.type} size="small" color="primary" variant="outlined" />}
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
