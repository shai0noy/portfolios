import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, CircularProgress, IconButton, Tooltip, Typography, ToggleButton, Divider, Button, ToggleButtonGroup
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ColumnSelector } from './ColumnSelector';
import { normalizeCurrency } from '../lib/currency';
import { DashboardSummary } from './DashboardSummary';
import { DashboardTable } from './DashboardTable';
import { useLanguage } from '../lib/i18n';
import { useDashboardData, calculateDashboardSummary, INITIAL_SUMMARY, type EnrichedDashboardHolding } from '../lib/dashboard';
import { getDefaultColumnVisibility, getColumnDisplayNames } from '../lib/dashboardColumns';
import { TickerSearch } from './TickerSearch';
import { useSession } from '../lib/SessionContext';

interface DashboardProps {
  sheetId: string;
}

export const Dashboard = ({ sheetId }: DashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  // Persist Currency - normalize initial value
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openColSelector = Boolean(anchorEl);
  const { t, isRtl } = useLanguage();

  const { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh, engine } = useDashboardData(sheetId);
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

  // Column Configuration
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const saved = localStorage.getItem('columnVisibility');
    const defaults = getDefaultColumnVisibility();
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  useEffect(() => {
    localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  const columnDisplayNames = useMemo(() => getColumnDisplayNames(t), [t]);

  // Grouping Logic
  const groupedData = useMemo(() => {
    if (!enrichedHoldings || enrichedHoldings.length === 0) {
      // Fallback for empty state or loading
      return { 'All Holdings': [] as EnrichedDashboardHolding[] };
    }

    if (selectedPortfolioId) {
      const p = portfolios.find(p => p.id === selectedPortfolioId);
      const name = p ? p.name : (enrichedHoldings[0]?.portfolioName || 'Portfolio');
      return { [name]: enrichedHoldings };
    }

    if (!groupByPortfolio) return { 'All Holdings': enrichedHoldings };

    const groups: Record<string, EnrichedDashboardHolding[]> = {};
    enrichedHoldings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });
    return groups;
  }, [enrichedHoldings, groupByPortfolio, selectedPortfolioId, portfolios]);

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

  if (holdings.length === 0) {
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
        {selectedPortfolioId && (
          <Button
            variant="text"
            size="small"
            onClick={() => handleSelectPortfolio(null)}
            startIcon={<ArrowBackIcon fontSize="small" sx={{ transform: isRtl ? 'rotate(180deg)' : 'none' }} />}
            sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 'auto', whiteSpace: 'nowrap', mt: -1 }}
          >
            {t('All Portfolios', 'כל התיקים')}
          </Button>
        )}

        <Box sx={{ flexGrow: 1 }}>
          <TickerSearch
            portfolios={portfolios}
            isPortfoliosLoading={loading}
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

      <DashboardSummary
        summary={summary}
        holdings={selectedPortfolioId ? holdings.filter(h => h.portfolioId === selectedPortfolioId) : holdings}
        displayCurrency={displayCurrency}
        exchangeRates={exchangeRates}
        selectedPortfolio={portfolios.find(p => p.id === (selectedPortfolioId || ''))?.name || null}
        sheetId={sheetId}
        portfolios={portfolios}
        isPortfoliosLoading={loading}
      />
      {hasFutureTxns && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.5, mb: 1, fontSize: '0.7rem' }}>
          {t('Note: Some transactions with future dates exist and are not included in the calculations.', 'הערה: קיימות עסקאות עם תאריך עתידי שאינן נכללות בחישובים.')}
        </Typography>
      )}

      {/* CONTROLS */}
      <Box display="flex" justifyContent="space-between" mb={2} alignItems="center">
        <Box display="flex" gap={1}>
          <ColumnSelector
            columns={columnVisibility}
            columnDisplayNames={columnDisplayNames}
            onColumnChange={(key, value) =>
              setColumnVisibility((prev: any) => ({ ...prev, [key]: value }))
            }
            label={t("Select Columns", "בחר עמודות")}
            anchorEl={anchorEl}
            open={openColSelector}
            onClick={handleClickColSelector}
            onClose={handleCloseColSelector}
          />
        </Box>
        <Box display="flex" alignItems="center">
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
              onClick={() => refresh()}
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

        holdings={enrichedHoldings}

        groupedData={groupedData}
        groupByPortfolio={groupByPortfolio}

        displayCurrency={displayCurrency}


        exchangeRates={exchangeRates}
        onSelectPortfolio={handleSelectPortfolio} // Updated prop
        columnVisibility={columnVisibility}
        onHideColumn={(col) => setColumnVisibility((prev: any) => ({ ...prev, [col]: false }))}
      />
    </Box>
  );
}
