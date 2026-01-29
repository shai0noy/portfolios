import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TextField, Grid, Typography, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  List, ListItemButton, ListItemText, Paper, Box, Divider, Chip, Tooltip, InputAdornment
} from '@mui/material';
import { getTickersDataset } from '../lib/fetching';
import type { TickerProfile } from '../lib/types/ticker';
import { InstrumentGroup, INSTRUMENT_METADATA } from '../lib/types/instrument';
import { type Portfolio, Exchange } from '../lib/types';
import SearchIcon from '@mui/icons-material/Search';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import { useLanguage } from '../lib/i18n';
import { getOwnedInPortfolios } from '../lib/portfolioUtils';

interface TickerSearchProps {
  onTickerSelect: (profile: TickerProfile) => void;
  prefilledTicker?: string;
  prefilledExchange?: string;
  portfolios: Portfolio[];
  isPortfoliosLoading: boolean;
  collapsible?: boolean;
  sx?: any;
}

// Custom hook for debouncing input values
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
  profile: TickerProfile;
  ownedInPortfolios?: string[];
}

/**
 * Searches the dataset for tickers matching the term.
 * Filters by exchange if specified.
 */
async function performSearch(
  searchTerm: string,
  exchange: string,
  dataset: Record<string, TickerProfile[]>,
  portfolios: Portfolio[]
): Promise<SearchResult[]> {
  const termUC = searchTerm.toUpperCase();
  const isNumeric = /^\d+$/.test(termUC);
  const resultsMap = new Map<string, SearchResult>();

  // Iterate over all groups in the dataset
  Object.values(dataset).flat().forEach((profile) => {
    // Basic filtering: Exchange
    if (exchange !== 'ALL' && profile.exchange !== exchange) return;

    // Search Logic: Match Symbol, Name (En/He), or Security ID
    const matchesSymbol = profile.symbol.toUpperCase().includes(termUC);
    const matchesId = profile.securityId !== undefined && profile.securityId.toString().includes(termUC);
    const matchesNameEn = (profile.name || '').toUpperCase().includes(termUC);
    const matchesNameHe = (profile.nameHe || '').toUpperCase().includes(termUC);

    if (matchesSymbol || matchesId || matchesNameEn || matchesNameHe) {
      const key = `${profile.exchange}:${profile.symbol}`;
      if (!resultsMap.has(key)) {
        resultsMap.set(key, {
          profile,
          ownedInPortfolios: getOwnedInPortfolios(profile.symbol, portfolios, profile.exchange),
        });
      }
    }
  });

  const uniqueResults = Array.from(resultsMap.values());
  const termNum = isNumeric ? parseInt(termUC, 10) : NaN;

  // Sorting Logic
  return uniqueResults.sort((a, b) => {
    const pA = a.profile;
    const pB = b.profile;
    
    // 1. Exact Match Priority (Symbol or ID)
    const aExact = pA.symbol.toUpperCase() === termUC || (!isNaN(termNum) && pA.securityId === termNum);
    const bExact = pB.symbol.toUpperCase() === termUC || (!isNaN(termNum) && pB.securityId === termNum);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    // 2. Starts With Priority
    const aPrefix = pA.symbol.toUpperCase().startsWith(termUC);
    const bPrefix = pB.symbol.toUpperCase().startsWith(termUC);
    if (aPrefix && !bPrefix) return -1;
    if (!aPrefix && bPrefix) return 1;

    // 3. Ownership Priority
    const aOwned = a.ownedInPortfolios && a.ownedInPortfolios.length > 0;
    const bOwned = b.ownedInPortfolios && b.ownedInPortfolios.length > 0;
    if (aOwned && !bOwned) return -1;
    if (!aOwned && bOwned) return 1;

    // 4. CBS Priority (Lowest)
    const aIsCBS = pA.exchange === Exchange.CBS;
    const bIsCBS = pB.exchange === Exchange.CBS;
    if (aIsCBS && !bIsCBS) return 1;
    if (!aIsCBS && bIsCBS) return -1;

    // 5. Instrument Group Priority
    const priorityOrder: InstrumentGroup[] = [
      InstrumentGroup.STOCK, 
      InstrumentGroup.ETF, 
      InstrumentGroup.SAVING,
      InstrumentGroup.MUTUAL_FUND, 
      InstrumentGroup.FOREX,
      InstrumentGroup.INDEX,
      InstrumentGroup.BOND, 
      InstrumentGroup.DERIVATIVE,
      InstrumentGroup.OTHER
    ];

    // If searching for a numeric ID, prioritize SAVING (Gemel/Pension) higher
    if (isNumeric && termUC.length >= 3) {
        if (pA.type.group === InstrumentGroup.SAVING && pB.type.group !== InstrumentGroup.SAVING) return -1;
        if (pA.type.group !== InstrumentGroup.SAVING && pB.type.group === InstrumentGroup.SAVING) return 1;
    }
    
    const idxA = priorityOrder.indexOf(pA.type.group);
    const idxB = priorityOrder.indexOf(pB.type.group);
    
    if (idxA !== -1 && idxB !== -1 && idxA !== idxB) return idxA - idxB;
    if (idxA !== -1 && idxB === -1) return -1;
    if (idxA === -1 && idxB !== -1) return 1;

    // 5. Name Length
    const lenA = (pA.name || '').length;
    const lenB = (pB.name || '').length;
    if (lenA !== lenB) return lenA - lenB;

    return 0;
  });
}

export function TickerSearch({ onTickerSelect, prefilledTicker, prefilledExchange, portfolios, isPortfoliosLoading, collapsible, sx }: TickerSearchProps) {
  // Dataset is Record<string, TickerProfile[]>
  const [dataset, setDataset] = useState<Record<string, TickerProfile[]>>({});
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);
  
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(prefilledTicker || '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  const [selectedExchange, setSelectedExchange] = useState(prefilledExchange || 'ALL');
  const [selectedGroup, setSelectedGroup] = useState<InstrumentGroup | 'ALL'>('ALL');

  const isIdle = collapsible && !inputValue && !isFocused;
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, tTry } = useLanguage();

  const searchTickers = useCallback(async (term: string, exchange: string) => {
    try {
      const results = await performSearch(term, exchange, dataset, portfolios);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed", err);
      setError("Search failed");
    }
  }, [dataset, portfolios]);

  const debouncedInput = useDebounce(inputValue, 300);

  // Load the full ticker dataset once on mount/visibility
  useEffect(() => {
    let active = true;

    const loadDataset = async () => {
      if (Object.keys(dataset).length > 0) return;

      setIsDatasetLoading(true);
      try {
        const data = await getTickersDataset();
        if (active) setDataset(data);
      } finally {
        if (active) setIsDatasetLoading(false);
      }
    };

    if (document.visibilityState === 'visible') loadDataset();
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') loadDataset(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { active = false; document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, []);

  const [limit, setLimit] = useState(100);

  // Trigger search on input change
  useEffect(() => {
    if (isFocused && !isPortfoliosLoading && !isDatasetLoading) {
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
  }, [debouncedInput, selectedExchange, isPortfoliosLoading, isDatasetLoading, isFocused, searchTickers]);

  // Filter results by selected Instrument Group
  const filteredResults = useMemo(() => {
    const filtered = selectedGroup === 'ALL' 
      ? searchResults 
      : searchResults.filter(res => res.profile.type.group === selectedGroup);
    return filtered.slice(0, limit);
  }, [searchResults, selectedGroup, limit]);

  // Reset limit on search term change
  useEffect(() => {
    setLimit(100);
  }, [debouncedInput, selectedExchange, selectedGroup]);

  // Build Filter Options from InstrumentGroup Enum
  const groupFilterOptions = useMemo(() => {
    const groupTranslations: Record<InstrumentGroup, string> = {
      [InstrumentGroup.STOCK]: t('Stocks', 'מניות'),
      [InstrumentGroup.ETF]: t('ETFs', 'תעודות סל'),
      [InstrumentGroup.MUTUAL_FUND]: t('Mutual Funds', 'קרנות נאמנות'),
      [InstrumentGroup.BOND]: t('Bonds', 'אג"ח'),
      [InstrumentGroup.SAVING]: t('Saving Funds', 'קרנות חיסכון'),
      [InstrumentGroup.DERIVATIVE]: t('Derivatives', 'נגזרים'),
      [InstrumentGroup.FOREX]: t('Forex & Crypto', 'מט"ח וקריפטו'),
      [InstrumentGroup.INDEX]: t('Indices', 'מדדים'),
      [InstrumentGroup.COMMODITY]: t('Commodities', 'סחורות'),
      [InstrumentGroup.OTHER]: t('Other', 'אחר')
    };

    return Object.values(InstrumentGroup).map(group => ({
      key: group,
      displayName: groupTranslations[group] || group
    }));
  }, [t]);

  const handleOptionSelect = (result: SearchResult) => {
    const { profile } = result;
    onTickerSelect(profile);
    setSearchResults([]);
    setInputValue('');
    setIsFocused(false);
  };

  return (
    <Box sx={{ mt: -2, mb: isIdle ? 3 : 4, ...sx }}>
      <Paper 
        elevation={0} 
        sx={{ 
          p: isIdle ? 0 : 1.5, 
          borderRadius: 3, 
          border: isIdle ? 'none' : 1, 
          borderColor: 'divider',
          bgcolor: isIdle ? 'transparent' : 'background.paper',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        <Grid container spacing={1} alignItems="center" justifyContent={isIdle ? 'center' : 'flex-start'}>
          <Grid item xs={12} sm={isIdle ? 8 : 6}>
            <TextField
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                // Delay onBlur to allow clicking on results
                setTimeout(() => {
                  if (!inputValue) setIsFocused(false);
                }, 200);
              }}
              label={isIdle ? null : `${t('Search Ticker', 'חפש נייר')} ${selectedExchange === 'ALL' ? '' : `(${selectedExchange})`}`}
              placeholder={isIdle ? t('Search Ticker...', 'חפש נייר...') : ''}
              size="small"
              fullWidth
              value={inputValue}
              autoComplete="off"
              onChange={(e) => setInputValue(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <>
                    {(isLoading || isDatasetLoading || isPortfoliosLoading) ? <CircularProgress color="inherit" size={20} /> : null}
                  </>
                ),
                sx: isIdle ? { 
                  borderRadius: 2, 
                  height: 32,
                  bgcolor: 'action.hover',
                  '& fieldset': { border: 'none' }
                } : {}
              }}
            />
          </Grid>
          {!isIdle && (
            <>
              <Grid item xs={6} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('Exchange', 'בורסה')}</InputLabel>
                  <Select
                    value={selectedExchange}
                    label={t('Exchange', 'בורסה')}
                    onChange={(e) => setSelectedExchange(e.target.value as string)}
                  >
                    <MenuItem value="ALL">{t('All', 'הכל')}</MenuItem>
                    <MenuItem value="TASE">TASE ({t('Tel Aviv', 'תל אביב')})</MenuItem>
                    <MenuItem value="NASDAQ">NASDAQ</MenuItem>
                    <MenuItem value="NYSE">NYSE</MenuItem>
                    <MenuItem value="FOREX">FOREX</MenuItem>
                    <MenuItem value="GEMEL">{t('Gemel Funds', 'קופות גמל')}</MenuItem>
                    <MenuItem value="PENSION">{t('Pension Funds', 'קרנות פנסיה')}</MenuItem>
                    <MenuItem value="CBS">{t('Israel Price indices', 'מדדי מחירים')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('Type', 'סוג')}</InputLabel>
                  <Select
                    value={selectedGroup}
                    label={t('Type', 'סוג')}
                    onChange={(e) => setSelectedGroup(e.target.value as (InstrumentGroup | 'ALL'))}
                    renderValue={(selected) => {
                      if (selected === 'ALL') return t('All Types', 'כל הסוגים');
                      const option = groupFilterOptions.find(opt => opt.key === selected);
                      return option ? option.displayName : selected;
                    }}
                  >
                    <MenuItem value="ALL">{t('All Types', 'כל הסוגים')}</MenuItem>
                    {groupFilterOptions.map(({ key, displayName }) => (
                      <MenuItem key={key} value={key}>{displayName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          )}
          {error && <Grid item xs={12}><Typography color="error">{error}</Typography></Grid>}
        </Grid>

        {(filteredResults.length > 0) && (
          <Paper 
            elevation={2} 
            className="visible-scrollbar"
            sx={{ maxHeight: 300, overflowY: 'auto', my: 1, border: 1, borderColor: 'divider' }}
          >
            <List dense>
              {filteredResults.map((option, index) => {
                const { profile } = option;
                // Determine display type: Prioritize localized name from metadata
                const typeMeta = INSTRUMENT_METADATA[profile.type.type];
                const displayType = t(typeMeta?.nameEn || profile.type.nameEn, typeMeta?.nameHe || profile.type.nameHe);

                return (
                  <Box key={`${profile.exchange}:${profile.symbol}`}>
                    <ListItemButton onClick={() => handleOptionSelect(option)}>
                      <ListItemText
                        primary={<Typography variant="body1">{tTry(profile.name, profile.nameHe)}</Typography>}
                        secondaryTypographyProps={{ component: 'div' }} 
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                                                      <Chip
                                                        label={`${profile.exchange}:${profile.symbol}${profile.securityId !== undefined && profile.securityId.toString() !== profile.symbol ? ` (${profile.securityId})` : ''}`} size="small" variant="outlined" />
                            
                            {displayType && <Chip label={displayType} size="small" color="primary" variant="outlined" />}
                            {profile.sector && <Chip label={profile.sector} size="small" variant="outlined" />}  
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
                );
              })}
              {searchResults.length > limit && (
                <Box sx={{ p: 1, textAlign: 'center' }}>
                  <ListItemButton onClick={() => setLimit(prev => prev + 100)} sx={{ justifyContent: 'center' }}>
                    <Typography variant="body2" color="primary">
                      {t('Show more results', 'הצג תוצאות נוספות')} ({searchResults.length - limit} {t('remaining', 'נותרו')})
                    </Typography>
                  </ListItemButton>
                </Box>
              )}
            </List>
          </Paper>
        )}
      </Paper>
    </Box>
  );
}
        