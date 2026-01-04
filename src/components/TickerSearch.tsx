import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TextField, Grid, Typography, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  List, ListItem, ListItemButton, ListItemText, Paper, Box, Divider, Chip, Tooltip
} from '@mui/material';
import { getTaseTickersDataset, getTickerData, type TaseTicker, type TickerData, DEFAULT_TASE_TYPE_CONFIG } from '../lib/ticker';
import type { Portfolio } from '../lib/types';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';

interface TickerSearchProps {
  onTickerSelect: (ticker: TickerData & { symbol: string }) => void;
  initialTicker?: string;
  initialExchange?: string;
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

interface SearchOption {
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
  instrumentId?: string; // TASE specific
  rawTicker?: TaseTicker | TickerData;
  ownedInPortfolios?: string[];
}

export function TickerSearch({ onTickerSelect, initialTicker, initialExchange, portfolios, isPortfoliosLoading }: TickerSearchProps) {
  const [taseDataset, setTaseDataset] = useState<Record<string, TaseTicker[]>>({});
  const [isTaseDatasetLoading, setIsTaseDatasetLoading] = useState(true);
  const [inputValue, setInputValue] = useState(initialTicker || '');
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [selectedExchange, setSelectedExchange] = useState(initialExchange || 'ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedInput = useDebounce(inputValue, 300);

  useEffect(() => {
    getTaseTickersDataset().then(data => {
      setTaseDataset(data);
      setIsTaseDatasetLoading(false);
    });
  }, []);

  const getOwnedInPortfolios = useCallback((symbol: string) => {
    if (!portfolios || portfolios.length === 0) return undefined;
    const owningPortfolios = portfolios.filter(p => 
      p.holdings && p.holdings.some(h => h.ticker === symbol)
    );
    return owningPortfolios.length > 0 ? owningPortfolios.map(p => p.name) : undefined;
  }, [portfolios]);

  const searchTickers = useCallback(async (searchTerm: string, exchange: string) => {
    if (!searchTerm) {
      setOptions([]);
      return;
    }
    setIsLoading(true);
    setError(null);

    const term = searchTerm.toUpperCase();

    try {
      let results: SearchOption[] = [];
      const isNumeric = /^[0-9]+$/.test(term);

      const processTaseResult = (t: TaseTicker, instrumentType: string): SearchOption => ({
        symbol: t.symbol,
        name: t.name_en,
        exchange: 'TASE',
        type: instrumentType,
        instrumentId: t.instrumentId,
        rawTicker: t,
        ownedInPortfolios: getOwnedInPortfolios(t.symbol),
      });

      const searchTaseType = (tickers: TaseTicker[], instrumentType: string) => {
        return tickers.filter(item =>
          (item.symbol.toUpperCase().includes(term) ||
          item.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.name_he.includes(searchTerm))
        ).map(t => processTaseResult(t, instrumentType));
      };

      if (exchange === 'TASE') {
        Object.entries(taseDataset).forEach(([type, tickers]) => {
          results = results.concat(searchTaseType(tickers, type));
        });
      } else if (exchange === 'NASDAQ' || exchange === 'NYSE') {
        const data = await getTickerData(term, exchange);
        if (data) {
          results.push({
            symbol: term,
            name: data.name || term,
            exchange: data.exchange || exchange,
            rawTicker: data,
            ownedInPortfolios: getOwnedInPortfolios(term),
          });
        }
      } else { // ALL Exchanges
        Object.entries(taseDataset).forEach(([type, tickers]) => {
          results = results.concat(searchTaseType(tickers, type));
        });

        if (!isNumeric) {
          const data = await getTickerData(term, undefined);
          if (data) {
            const nonTaseResult: SearchOption = {
              symbol: term,
              name: data.name || term,
              exchange: data.exchange || 'Unknown',
              rawTicker: data,
              ownedInPortfolios: getOwnedInPortfolios(term),
            };
            if (!results.some(r => r.symbol === nonTaseResult.symbol && r.exchange === nonTaseResult.exchange)) {
              results.push(nonTaseResult);
            }
          }
        }
      }

      const uniqueResults = results.reduce((acc, current) => {
        const existing = acc.find(item => item.symbol === current.symbol && item.exchange === current.exchange);
        if (!existing) acc.push(current);
        return acc;
      }, [] as SearchOption[]);

      setOptions(uniqueResults);
    } catch (err) {
      console.error('Error searching tickers:', err);
      setError('Failed to search tickers.');
      setOptions([]);
    }

    setIsLoading(false);
  }, [taseDataset, getOwnedInPortfolios]);

  useEffect(() => {
    if (!isPortfoliosLoading) {
      searchTickers(debouncedInput, selectedExchange);
    }
  }, [debouncedInput, selectedExchange, searchTickers, isPortfoliosLoading]);

  const filteredOptions = useMemo(() => {
    // TODO: Remove after debug
    console.log('Filtering options with selectedType:', selectedType, 'options count:', options.length);
    if (options.length > 0) {
        console.log('First option type:', options[0].type);
    }
    const filtered = options.filter(option => selectedType === 'ALL' || option.type === selectedType);
    // TODO: Remove after debug
    console.log('Filtered options count:', filtered.length);
    return filtered.slice(0, 50);
  }, [options, selectedType]);

  const typeFilterOptions = useMemo(() => {
    return Object.entries(DEFAULT_TASE_TYPE_CONFIG)
      .filter(([, { enabled }]) => enabled)
      .map(([key, { displayName }]) => ({ key, displayName }));
  }, []);

  const handleOptionSelect = async (option: SearchOption) => {
    if (option.rawTicker) {
      onTickerSelect({ ...option.rawTicker, symbol: option.symbol, exchange: option.exchange });
    } else {
      setIsLoading(true);
      const data = await getTickerData(option.symbol, option.exchange);
      setIsLoading(false);
      if (data) {
        onTickerSelect({ ...data, symbol: option.symbol });
      }
    }
    setOptions([]); 
    setInputValue(option.symbol);
  };

  return (
    <Box>
      <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Grid item xs={12} sm={6}>
          <TextField
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

      {(filteredOptions.length > 0) && (
        <Paper elevation={2} sx={{ maxHeight: 300, overflowY: 'auto', my: 1 }}>
          <List dense>
            {filteredOptions.map((option, index) => (
              <Box key={option.instrumentId || `${option.symbol}-${option.exchange}`}>
                <ListItemButton onClick={() => handleOptionSelect(option)}>
                  <ListItemText
                    primary={<Typography variant="body1">{option.name}</Typography>}
                    secondaryTypographyProps={{ component: 'div' }} // Render secondary as div
                    secondary={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                        <Chip label={`${option.exchange}:${option.symbol}`} size="small" variant="outlined" />
                        {option.type && DEFAULT_TASE_TYPE_CONFIG[option.type] && <Chip label={DEFAULT_TASE_TYPE_CONFIG[option.type]?.displayName || option.type} size="small" color="primary" variant="outlined" />}
                        {option.ownedInPortfolios && (
                          <Tooltip title={`Owned in: ${option.ownedInPortfolios.join(', ')}`}>
                            <BusinessCenterIcon color="success" sx={{ fontSize: 16, ml: 1 }} />
                          </Tooltip>
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
                {index < filteredOptions.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
