import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TextField, Grid, Typography, CircularProgress, MenuItem, Select, FormControl, InputLabel,
  List, ListItemButton, ListItemText, Paper, Box, Divider, Chip, Tooltip, InputAdornment, useTheme
} from '@mui/material';
import { useScrollShadows, ScrollShadows } from '../lib/ui-utils';
import { getTickersDataset } from '../lib/fetching';
import type { TickerProfile } from '../lib/types/ticker';
import { InstrumentGroup, INSTRUMENT_METADATA } from '../lib/types/instrument';
import { type TrackingListItem, type Portfolio, Exchange } from '../lib/types';
import SearchIcon from '@mui/icons-material/Search';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import StarIcon from '@mui/icons-material/Star';
import { useLanguage } from '../lib/i18n';

// Pre-compute ownership map to avoid O(N*P*H) complexity during search
function useOwnedTickers(portfolios: Portfolio[]) {
  return useMemo(() => {
    const map = new Map<string, string[]>();
    if (!portfolios) return map;

    for (const p of portfolios) {
      if (!p.holdings) continue;
      for (const h of p.holdings) {
        const key = `${h.exchange}:${h.ticker.toUpperCase()}`;
        const existing = map.get(key) || [];
        existing.push(p.name);
        map.set(key, existing);
      }
    }
    return map;
  }, [portfolios]);
}

interface TickerSearchProps {
  onTickerSelect: (profile: TickerProfile) => void;
  prefilledTicker?: string;
  prefilledExchange?: string;
  portfolios: Portfolio[];
  isPortfoliosLoading: boolean;
  trackingLists: TrackingListItem[];
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
  isFavorite?: boolean;
}

// Pre-computed search item to avoid repeated toUpperCase() calls
interface SearchItem {
  profile: TickerProfile;
  // Pre-computed upper-case strings
  sSymbol: string;
  sNameEn: string;
  sNameHe: string;
  sSecId: string;
  sExchange: string;
  key: string;
}

interface Bucket {
  exact: SearchResult[];
  startOwned: SearchResult[];
  start: SearchResult[];
  owned: SearchResult[];
  other: SearchResult[];
}

function performSearch(
  searchTerm: string,
  exchange: string,
  flatDataset: SearchItem[],
  ownedTickers: Map<string, string[]>,
  favoriteTickers: Set<string>
): SearchResult[] {
  if (!searchTerm) return [];

  // Strip . and -
  const rawTermClean = searchTerm.replace(/[.-]/g, '');
  const rawTermUC = rawTermClean.toUpperCase();
  const searchTokens = rawTermUC.split(/\s+/).filter(Boolean);
  if (searchTokens.length === 0) return [];
  const termUC = searchTokens.join(' ');
  const isNumeric = /^\d+$/.test(termUC);
  const termNum = isNumeric ? parseInt(termUC, 10) : NaN;

  // Use buckets to avoid complex sort
  const buckets: Bucket = {
    exact: [],
    startOwned: [],
    start: [],
    owned: [],
    other: []
  };

  const addedKeys = new Set<string>();

  for (let i = 0; i < flatDataset.length; i++) {
    const item = flatDataset[i];

    if (exchange !== 'ALL' && item.profile.exchange !== exchange) continue;

    let matchesAllTokens = true;
    for (const token of searchTokens) {
      if (!(
        item.sSymbol.includes(token) ||
        item.sSecId.includes(token) ||
        item.sNameEn.includes(token) ||
        item.sNameHe.includes(token) ||
        item.sExchange.includes(token)
      )) {
        matchesAllTokens = false;
        break;
      }
    }

    if (matchesAllTokens) {
      if (!addedKeys.has(item.key)) {
        addedKeys.add(item.key);

        const owned = ownedTickers.get(item.key);
        const favorite = favoriteTickers.has(item.key);
        const res: SearchResult = { profile: item.profile, ownedInPortfolios: owned, isFavorite: favorite };

        // Bucketing Logic: we must be careful since sSymbol now has stripped characters.
        // We'll use the un-stripped symbol for exact/startsWith checks if termUC isn't fully stripped.
        // Actually, since we want "ktf nasdaq" (termUC has "NASDAq") to work for START bucketing, 
        // we should probably just use the first token for prefix bucketing.
        const primaryToken = searchTokens[0] || '';
        const isExact = item.sSymbol === primaryToken || (!isNaN(termNum) && item.profile.securityId === termNum);
        const isStart = item.sSymbol.startsWith(primaryToken);
        const isOwned = !!owned;

        if (isExact) {
          buckets.exact.push(res);
        } else if (isStart && isOwned) {
          buckets.startOwned.push(res);
        } else if (isStart) {
          buckets.start.push(res);
        } else if (isOwned) {
          buckets.owned.push(res);
        } else {
          buckets.other.push(res);
        }
      }
    }
  }

  // Sort small buckets if needed
  const lenSort = (a: SearchResult, b: SearchResult) => (a.profile.symbol.length - b.profile.symbol.length);

  buckets.startOwned.sort(lenSort);
  buckets.start.sort(lenSort);

  return [
    ...buckets.exact,
    ...buckets.startOwned,
    ...buckets.start,
    ...buckets.owned,
    ...buckets.other
  ];
}


// Pre-compute dataset for fast search
function useFlatDataset(dataset: Record<string, TickerProfile[]>) {
  return useMemo(() => {
    // Helper to strip out dots and dashes for flexible matching
    const normalize = (val: string | undefined) =>
      (val || '').replace(/[.-]/g, '').toUpperCase();

    return Object.values(dataset).flat().map(profile => ({
      profile,
      sSymbol: normalize(profile.symbol),
      sNameEn: normalize(profile.name),
      sNameHe: normalize(profile.nameHe),
      sSecId: profile.securityId !== undefined ? profile.securityId.toString() : '',
      sExchange: normalize(profile.exchange),
      key: `${profile.exchange}:${profile.symbol.toUpperCase()}`
    }));
  }, [dataset]);
}

export const TickerSearch = React.memo(function TickerSearch({ onTickerSelect, prefilledTicker, prefilledExchange, portfolios, isPortfoliosLoading, trackingLists, collapsible, sx }: TickerSearchProps) {
  // Dataset is Record<string, TickerProfile[]>
  const [dataset, setDataset] = useState<Record<string, TickerProfile[]>>({});
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);

  const flatDataset = useFlatDataset(dataset);
  const ownedTickers = useOwnedTickers(portfolios);
  const favoriteTickers = useMemo(() => {
    const set = new Set<string>();
    if (trackingLists) {
      trackingLists.forEach(item => {
        if (item.listName === 'Favorites') {
          set.add(`${item.exchange}:${item.ticker.toUpperCase()}`);
        }
      });
    }
    return set;
  }, [trackingLists]);

  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(prefilledTicker || '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const initialExchange = useMemo(() => {
    if (!prefilledExchange) return 'ALL';
    const upper = prefilledExchange.toUpperCase();
    return upper === 'ALL' || Object.values(Exchange).includes(upper as any) ? upper : 'ALL';
  }, [prefilledExchange]);
  const [selectedExchange, setSelectedExchange] = useState(initialExchange);

  const [selectedGroup, setSelectedGroup] = useState<InstrumentGroup | 'ALL'>('ALL');

  const isIdle = collapsible && !inputValue && !isFocused;

  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = useState<string | null>(null);
  const { t, tTry } = useLanguage();
  const theme = useTheme();
  const { containerRef, showTop, showBottom } = useScrollShadows();

  const searchTickers = useCallback((term: string, exchange: string) => {
    startTransition(() => {
      try {
        const results = performSearch(term, exchange, flatDataset, ownedTickers, favoriteTickers);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed", err);
        setError("Search failed");
      }
    });
  }, [flatDataset, ownedTickers]);

  const debouncedInput = useDebounce(inputValue, 150);

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
    if ((isFocused || debouncedInput) && !isPortfoliosLoading && !isDatasetLoading) {
      if (!debouncedInput) {
        setSearchResults([]);
        return;
      }
      searchTickers(debouncedInput, selectedExchange);
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
      [InstrumentGroup.MONETARY_FUND]: t('Monetary Funds', 'קרנות כספיות'),
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
                    {(isPending || isDatasetLoading || isPortfoliosLoading) ? <CircularProgress color="inherit" size={20} /> : null}
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
          <Box sx={{ position: 'relative', my: 1 }}>
            <Paper
              elevation={2}
              className="visible-scrollbar"
              ref={containerRef}
              sx={{ maxHeight: 300, overflowY: 'auto', border: 1, borderColor: 'divider' }}
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
                                <Tooltip title={`Owned in: ${option.ownedInPortfolios.join(', ')}`} enterTouchDelay={0} leaveTouchDelay={3000}>
                                  <BusinessCenterIcon color="success" sx={{ fontSize: 16, ml: 1 }} />
                                </Tooltip>
                              )}
                              {option.isFavorite && (
                                <Tooltip title={t('Favorite', 'מועדף')} enterTouchDelay={0} leaveTouchDelay={3000}>
                                  <StarIcon color="warning" sx={{ fontSize: 16, ml: 1 }} />
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
            <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
          </Box>
        )}
      </Paper>
    </Box>
  );
});