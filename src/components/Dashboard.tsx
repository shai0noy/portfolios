import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, CircularProgress, IconButton, Tooltip, Typography, ToggleButton, Divider, Button, ToggleButtonGroup, Select, MenuItem, FormControl, Paper
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ColumnSelector } from './ColumnSelector';
import { normalizeCurrency } from '../lib/currency';
import { DashboardSummary } from './dashboard/DashboardSummary';
import { TopMovers } from './dashboard/TopMovers';
import { DashboardTable } from './DashboardTable';
import { useLanguage } from '../lib/i18n';
import { useDashboardData, calculateDashboardSummary, INITIAL_SUMMARY, type EnrichedDashboardHolding } from '../lib/dashboard';
import { Currency, TrackingListId } from '../lib/types';
import { getDefaultColumnVisibility, getColumnDisplayNames, getPresetVisibility, type ColumnPresetType } from '../lib/dashboardColumns';
import { TickerSearch } from './TickerSearch';
import { useSession } from '../lib/SessionContext';

interface DashboardProps {
  sheetId: string;
  isFavoritesOnly?: boolean;
}

export const Dashboard = ({ sheetId, isFavoritesOnly: propIsFavoritesOnly }: DashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isFavoritesOnly = propIsFavoritesOnly || location.pathname === '/favorites';
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  // Persist Currency - normalize initial value
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openColSelector = Boolean(anchorEl);
  const { t, isRtl } = useLanguage();

  const { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh, engine, trackingLists } = useDashboardData(sheetId);
  const { showLoginModal } = useSession();

  const handleClickColSelector = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseColSelector = () => {
    setAnchorEl(null);
  };

  useEffect(() => {
    localStorage.setItem('displayCurrency', displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    const portId = searchParams.get('portfolioId');
    setSelectedPortfolioId(portId);
    // Helper to find portfolio
    const selectedPort = portfolios.find(p => p.id === portId);
    if (selectedPort) {
      setDisplayCurrency(normalizeCurrency(selectedPort.currency));
    } else if (!portId) {
      // Reset to default if no portfolio is selected
      setDisplayCurrency(normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));
    }
  }, [searchParams, portfolios]);

  const handleSelectPortfolio = (portfolioId: string | null) => {
    // Check if the selected portfolio is actually the Favorites group
    // The DashboardGroup passes the groupName as portfolioId if it's not a real portfolio
    if (portfolioId === TrackingListId.Favorites) {
      navigate('/favorites');
      return;
    }

    if (portfolioId) {
      setSearchParams({ portfolioId });
    } else {
      setSearchParams({});
    }
  };

  const { summary, holdings: enrichedHoldings } = useMemo(() => {
    // Default empty return
    const emptyResult = { summary: INITIAL_SUMMARY, holdings: [] as EnrichedDashboardHolding[] };

    if (!holdings || holdings.length === 0 || !exchangeRates || !exchangeRates.current || loading) {
      return emptyResult;
    }

    if (error) {
      console.error("Dashboard error state:", error);
      return emptyResult;
    }

    // Filter holdings based on selected portfolio
    const filteredHoldings = selectedPortfolioId
      ? holdings.filter(h => h.portfolioId === selectedPortfolioId)
      : holdings;

    const newPortMap = new Map(portfolios.map(p => [p.id, p]));
    return calculateDashboardSummary(filteredHoldings, displayCurrency, exchangeRates, newPortMap, engine);
  }, [holdings, displayCurrency, exchangeRates, selectedPortfolioId, portfolios, loading, error, engine]);

  const favoriteHoldings = useMemo(() => {
    if (!trackingLists || trackingLists.length === 0 || !engine) return [];

    return trackingLists.map(item => {
      const tickerKey = `${item.exchange}:${item.ticker}`;
      const liveData = engine.livePrices.get(tickerKey);

      const h: EnrichedDashboardHolding = {
        nameHe: liveData?.nameHe || '',
        qtyTotal: 0,
        currentPrice: liveData?.price || 0,
        portfolioId: TrackingListId.Favorites,
        isFavoritesList: true,
        portfolioName: t('Favorites', 'מועדפים'),
        activeLots: [],
        realizedLots: [],
        transactions: [],
        dividends: [],
        id: `fav_${item.exchange}_${item.ticker}`,
        key: `fav_${item.exchange}_${item.ticker}`,
        portfolioCurrency: (liveData?.currency as Currency) || Currency.USD,
        ticker: item.ticker,
        exchange: item.exchange,
        displayName: liveData?.nameMarket || liveData?.name || item.ticker,
        longName: liveData?.name || item.ticker,
        qtyVested: 0,
        qtyUnvested: 0,
        stockCurrency: (liveData?.currency as Currency) || Currency.USD,
        costBasisVested: { amount: 0, currency: Currency.USD },
        costOfSoldTotal: { amount: 0, currency: Currency.USD },
        proceedsTotal: { amount: 0, currency: Currency.USD },
        dividendsTotal: { amount: 0, currency: Currency.USD },
        unrealizedGain: { amount: 0, currency: Currency.USD },
        realizedGainNet: { amount: 0, currency: Currency.USD },
        feesTotal: { amount: 0, currency: Currency.USD },
        marketValueVested: { amount: 0, currency: Currency.USD },
        marketValueUnvested: { amount: 0, currency: Currency.USD },
        realizedTax: 0,
        unrealizedTaxLiabilityILS: 0,
        unrealizedTaxableGainILS: 0,
        sector: liveData?.sector,
        dayChangePct: liveData?.changePct1d || 0,
        perf1w: liveData?.changePctRecent || 0,
        perf1m: liveData?.changePct1m || 0,
        perf3m: liveData?.changePct3m || 0,
        perfYtd: liveData?.changePctYtd || 0,
        perf1y: liveData?.changePct1y || 0,
        perf3y: liveData?.changePct3y || 0,
        perf5y: liveData?.changePct5y || 0,
        perfAll: liveData?.changePctMax || 0,
        tickerChangePct1w: liveData?.changePctRecent || 0,
        tickerChangePct1m: liveData?.changePct1m || 0,
        tickerChangePct3m: liveData?.changePct3m || 0,
        tickerChangePctYtd: liveData?.changePctYtd || 0,
        tickerChangePct1y: liveData?.changePct1y || 0,
        tickerChangePct3y: liveData?.changePct3y || 0,
        tickerChangePct5y: liveData?.changePct5y || 0,
        tickerChangePctAll: liveData?.changePctMax || 0,
        display: {
          marketValue: 0,
          unrealizedGain: 0,
          unrealizedGainPct: 0,
          realizedGain: 0,
          realizedGainGross: 0,
          realizedGainNet: 0,
          realizedGainPct: 0,
          realizedGainAfterTax: 0,
          totalGain: 0,
          totalGainPct: 0,
          valueAfterTax: 0,
          dayChangeVal: 0,
          dayChangePct: liveData?.changePct1d || 0,
          costBasis: 0,
          costOfSold: 0,
          proceeds: 0,
          dividends: 0,
          fees: 0,
          dividendYield1y: liveData?.dividendYield,
          currentPrice: liveData?.price || 0,
          avgCost: 0,
          weightInPortfolio: 0,
          weightInGlobal: 0,
          unvestedValue: 0,
          realizedTax: 0,
          unrealizedTax: 0
        }
      };
      return h;
    });
  }, [trackingLists, engine, t]);

  // Column Configuration
  const [columnPreset, setColumnPreset] = useState<ColumnPresetType>(() => {
    let saved = localStorage.getItem('columnPreset') as ColumnPresetType | 'basic' | 'holdings_gains';
    if (saved === 'basic') return 'overview';
    if (saved === 'holdings_gains') return 'gains';
    return (saved as ColumnPresetType) || 'custom';
  });

  useEffect(() => {
    localStorage.setItem('columnPreset', columnPreset);
  }, [columnPreset]);

  const [customColumnVisibility, setCustomColumnVisibility] = useState(() => {
    const saved = localStorage.getItem('columnVisibility');
    const defaults = getDefaultColumnVisibility();
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  useEffect(() => {
    localStorage.setItem('columnVisibility', JSON.stringify(customColumnVisibility));
  }, [customColumnVisibility]);

  const columnVisibility = useMemo(() => {
    if (columnPreset === 'custom') {
      return customColumnVisibility;
    }
    return getPresetVisibility(columnPreset);
  }, [columnPreset, customColumnVisibility]);

  const columnDisplayNames = useMemo(() => getColumnDisplayNames(t), [t]);

  const [showClosed, setShowClosed] = useState(() => localStorage.getItem('showClosedPositions') === 'true');

  useEffect(() => {
    localStorage.setItem('showClosedPositions', String(showClosed));
  }, [showClosed]);

  // Filter Holdings for Display
  const displayedHoldings = useMemo(() => {
    if (isFavoritesOnly) return favoriteHoldings;
    if (showClosed) return enrichedHoldings;
    return enrichedHoldings.filter(h => Math.abs(h.qtyTotal) > 1e-6);
  }, [enrichedHoldings, showClosed, isFavoritesOnly, favoriteHoldings]);

  // Grouping Logic
  const groupedData = useMemo(() => {
    if (!displayedHoldings || displayedHoldings.length === 0) {
      // Fallback for empty state or loading
      return { 'All Holdings': [] as EnrichedDashboardHolding[] };
    }

    if (selectedPortfolioId) {
      const p = portfolios.find(p => p.id === selectedPortfolioId);
      const name = p ? p.name : (displayedHoldings[0]?.portfolioName || 'Portfolio');
      return { [name]: displayedHoldings };
    }

    if (!groupByPortfolio) return { 'All Holdings': displayedHoldings };

    const groups: Record<string, EnrichedDashboardHolding[]> = {};
    displayedHoldings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });

    // Add Favorites group if not empty and not already in favorites-only mode
    if (!isFavoritesOnly && favoriteHoldings.length > 0) {
      const heldKeys = new Set(enrichedHoldings.filter(h => Math.abs(h.qtyTotal) > 1e-6).map(h => `${h.exchange}:${h.ticker}`));
      const orphanFavorites = favoriteHoldings.filter(f => !heldKeys.has(`${f.exchange}:${f.ticker}`));

      if (orphanFavorites.length > 0) {
        groups[t('Favorites', 'מועדפים')] = orphanFavorites;
      }
    }

    return groups;
  }, [displayedHoldings, groupByPortfolio, selectedPortfolioId, portfolios, favoriteHoldings, isFavoritesOnly, enrichedHoldings, t]);

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  if (error === 'session_expired') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('Login Required', 'נדרשת התחברות')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {t('Your session has expired. Please log in again to access your portfolio.', 'החיבור שלך פג. אנא התחבר שנית כדי לגשת לתיק ההשקעות שלך.')}
        </Typography>
        <Button variant="contained" onClick={() => showLoginModal()} startIcon={<AddIcon />}>
          {t('Log In', 'התחברות')}
        </Button>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', p: 3 }}>
        <Typography variant="h6" color="error" gutterBottom>
          {t('Failed to load portfolio data.', 'שגיאה בטעינת נתוני התיק.')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {String(error)}
        </Typography>
        <Button variant="outlined" onClick={() => refresh()} startIcon={<RefreshIcon />}>
          {t('Retry', 'נסה שנית')}
        </Button>
      </Box>
    );
  }

  if (portfolios.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', p: 3 }}>
        <AccountBalanceWalletIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
        <Typography variant="h4" gutterBottom fontWeight="700">
          {t('Welcome to Your Portfolio Dashboard', 'ברוכים הבאים לדאשבורד התיקים')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 500 }}>
          {t("It looks like you haven't created any portfolios yet. Start by creating your first portfolio to track your investments.", "נראה שעדיין לא יצרת תיקי השקעות. התחל ביצירת התיק הראשון שלך כדי לעקוב אחר ההשקעות שלך.")}
        </Typography>
        <Button
          variant="contained"
          size="large"
          component={RouterLink}
          to="/portfolios"
          startIcon={<AddIcon />}
          sx={{ borderRadius: 2, px: 4, py: 1.5, textTransform: 'none', fontSize: '1.1rem' }}
        >
          {t('Create Your First Portfolio', 'צור את התיק הראשון שלך')}
        </Button>
      </Box>
    );
  }

  if (holdings.length === 0 && !isFavoritesOnly) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', p: 3 }}>
        <CloudUploadIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
        <Typography variant="h4" gutterBottom fontWeight="700">
          {t('Your Portfolio is Empty', 'תיק ההשקעות שלך ריק')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 500 }}>
          {t('You have portfolios set up, but no transactions recorded yet. Add your first trade or import history from a CSV file.', 'יש לך תיקים מוגדרים, אך עדיין לא תועדו עסקאות. הוסף את העסקה הראשונה שלך או ייבא היסטוריה מקובץ CSV.')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            variant="contained"
            size="large"
            component={RouterLink}
            to="/transaction"
            startIcon={<AddIcon />}
            sx={{ borderRadius: 2, px: 4, py: 1.5, textTransform: 'none', fontSize: '1.1rem' }}
          >
            {t('Add a Transaction', 'הוסף עסקה')}
          </Button>
          <Button
            variant="outlined"
            size="large"
            component={RouterLink}
            to="/dashboard?import=true"
            startIcon={<CloudUploadIcon />}
            sx={{ borderRadius: 2, px: 4, py: 1.5, textTransform: 'none', fontSize: '1.1rem' }}
          >
            {t('Import from CSV', 'ייבוא מ-CSV')}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        {(selectedPortfolioId || isFavoritesOnly) && (
          <Button
            variant="text"
            size="small"
            onClick={() => {
              if (isFavoritesOnly) navigate('/dashboard');
              else handleSelectPortfolio(null);
            }}
            startIcon={<ArrowBackIcon fontSize="small" sx={{ transform: isRtl ? 'rotate(180deg)' : 'none' }} />}
            sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 'auto', whiteSpace: 'nowrap', mt: -1 }}
          >
            {isFavoritesOnly ? t('Dashboard', 'לוח בקרה') : t('All Portfolios', 'כל התיקים')}
          </Button>
        )}

        <Box sx={{ flexGrow: 1 }}>
          <TickerSearch
            portfolios={portfolios}
            isPortfoliosLoading={loading}
            trackingLists={trackingLists}
            collapsible={true}
            sx={{ mt: 0, mb: 0 }}
            onTickerSelect={(ticker) => {
              navigate(`/ticker/${ticker.exchange}/${ticker.symbol}`, {
                state: {
                  from: '/dashboard',
                  background: location,
                  numericId: ticker.securityId?.toString(),
                  initialName: ticker.name,
                  initialNameHe: ticker.nameHe
                }
              });
            }}
          />
        </Box>

        <ToggleButtonGroup
          value={displayCurrency}
          exclusive
          onChange={(_, val) => val && setDisplayCurrency(val)}
          size="small"
          sx={{ height: 32, direction: 'ltr', mb: 0.5 }}
        >
          <ToggleButton value="USD" sx={{ px: 1.5, fontWeight: 600, fontSize: '0.75rem' }}>USD</ToggleButton>
          <ToggleButton value="ILS" sx={{ px: 1.5, fontWeight: 600, fontSize: '0.75rem' }}>ILS</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {!isFavoritesOnly ? (
        <DashboardSummary
          summary={summary}
          holdings={selectedPortfolioId ? holdings.filter(h => h.portfolioId === selectedPortfolioId) : holdings}
          displayCurrency={displayCurrency}
          exchangeRates={exchangeRates}
          selectedPortfolio={portfolios.find(p => p.id === (selectedPortfolioId || ''))?.name || null}
          portfolios={portfolios}
          isPortfoliosLoading={loading}
          transactions={selectedPortfolioId ? (engine?.transactions?.filter(t => t.portfolioId === selectedPortfolioId) || []) : (engine?.transactions || [])}
        />
      ) : (
        <Paper variant="outlined" sx={{ p: 3, mb: 4, position: 'relative' }}>
          <TopMovers
            holdings={displayedHoldings}
            displayCurrency={displayCurrency}
            exchangeRates={exchangeRates}
            lockedMetric='pct'
          />
        </Paper>
      )}
      {hasFutureTxns && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.5, mb: 1, fontSize: '0.7rem' }}>
          {t('Note: Some transactions with future dates exist and are not included in the calculations.', 'הערה: קיימות עסקאות עם תאריך עתידי שאינן נכללות בחישובים.')}
        </Typography>
      )}

      {/* CONTROLS */}
      <Box display="flex" justifyContent="space-between" mb={2} alignItems="center">
        <Box display="flex" gap={1} alignItems="center">
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {t('View:', 'תצוגה:')}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={columnPreset}
              onChange={(e) => setColumnPreset(e.target.value as ColumnPresetType)}
              displayEmpty
              variant="standard"
              disableUnderline
              renderValue={(selected) => {
                const presetTitles: Record<string, string> = {
                  custom: t('Custom', 'מותאם אישית'),
                  overview: t('Overview', 'מבט כללי'),
                  gains: t('Gains', 'רווחים'),
                  analytics: t('Analytics', 'אנליטיקה'),
                  technical: t('Technical', 'טכני'),
                  income_costs: t('Income & Costs', 'הכנסות ועלויות'),
                  all: t('All', 'הכל')
                };
                return (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', py: 0.5 }}>
                    {presetTitles[selected as string]}
                  </Typography>
                );
              }}
              sx={{
                bgcolor: 'transparent',
                '&:hover': {
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                },
                px: 1,
              }}
            >
              <MenuItem value="custom">{t('Custom', 'מותאם אישית')}</MenuItem>
              <MenuItem value="overview">{t('Overview', 'מבט כללי')}</MenuItem>
              <MenuItem value="gains">{t('Gains', 'רווחים')}</MenuItem>
              <MenuItem value="analytics">{t('Analytics', 'אנליטיקה')}</MenuItem>
              <MenuItem value="technical">{t('Technical', 'טכני')}</MenuItem>
              <MenuItem value="income_costs">{t('Income & Costs', 'הכנסות ועלויות')}</MenuItem>
              <MenuItem value="all">{t('All', 'הכל')}</MenuItem>
            </Select>
          </FormControl>
          {columnPreset === 'custom' && (
            <ColumnSelector
              columns={columnVisibility}
              columnDisplayNames={columnDisplayNames}
              onColumnChange={(key, value) => {
                setCustomColumnVisibility((prev: any) => ({ ...prev, [key]: value }));
              }}
              label={t("Select Columns", "בחר עמודות")}
              anchorEl={anchorEl}
              open={openColSelector}
              onClick={handleClickColSelector}
              onClose={handleCloseColSelector}
            />
          )}
        </Box>
        <Box display="flex" alignItems="center">
          <ToggleButton
            value="showClosed"
            selected={showClosed}
            onChange={() => setShowClosed(!showClosed)}
            size="small"
            color="primary"
            sx={{ borderRadius: 2, textTransform: 'none', px: 2, py: 0.5, mr: 1, border: 1, borderColor: 'divider' }}
          >
            {t('Show Closed Positions', 'הצג פוזיציות סגורות')}
          </ToggleButton>
          <ToggleButton
            value="grouped"
            selected={groupByPortfolio}
            onChange={() => setGroupByPortfolio(!groupByPortfolio)}
            size="small"
            color="primary"
            sx={{ borderRadius: 2, textTransform: 'none', px: 2, py: 0.5, mr: 1, border: 1, borderColor: 'divider' }}
          >
            {t('Group by Portfolio', 'קבץ לפי תיק')}
          </ToggleButton>
          <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 20, alignSelf: 'center' }} />
          <Tooltip title={t("Refresh Data", "רענן נתונים")}>
            <IconButton
              onClick={() => refresh(true)}
              disabled={loading}
              size="small"
              sx={{ border: 'none', borderRadius: 0 }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <DashboardTable

        holdings={displayedHoldings}

        groupedData={groupedData}
        groupByPortfolio={groupByPortfolio}

        displayCurrency={displayCurrency}


        exchangeRates={exchangeRates}
        onSelectPortfolio={handleSelectPortfolio} // Updated prop
        columnVisibility={columnVisibility}
        onHideColumn={(col) => {
          if (columnPreset === 'custom') {
            setCustomColumnVisibility((prev: any) => ({ ...prev, [col]: false }));
          }
        }}
        preventColumnHide={columnPreset !== 'custom'}
      />
    </Box>
  );
}
