import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, CircularProgress, IconButton, Tooltip, Typography, ToggleButton, Divider
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ColumnSelector } from './ColumnSelector';
import { normalizeCurrency } from '../lib/currency';
import { DashboardSummary } from './DashboardSummary';
import { DashboardTable } from './DashboardTable';
import { useLanguage } from '../lib/i18n';
import { useDashboardData, calculateDashboardSummary, INITIAL_SUMMARY } from '../lib/dashboard';

interface DashboardProps {
  sheetId: string;
}

export const Dashboard = ({ sheetId }: DashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  const [includeUnvested, setIncludeUnvested] = useState<boolean>(false);
  // Persist Currency - normalize initial value
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));
  
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [portMap, setPortMap] = useState<Map<string, any>>(new Map());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openColSelector = Boolean(anchorEl);
  const { t } = useLanguage();

  const { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh } = useDashboardData(sheetId, { includeUnvested });

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
    const newPortMap = new Map(portfolios.map(p => [p.id, p]));
    setPortMap(newPortMap);
  }, [portfolios]);

  useEffect(() => {
    const portId = searchParams.get('portfolioId');
    setSelectedPortfolioId(portId);
    const selectedPort = portMap.get(portId || '');
    if (selectedPort) {
      setDisplayCurrency(normalizeCurrency(selectedPort.currency));
    } else if (!portId) {
      // Reset to default if no portfolio is selected
      setDisplayCurrency(normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));
    }
  }, [searchParams, portMap]);

  const handleSelectPortfolio = (portfolioId: string | null) => {
    if (portfolioId) {
      setSearchParams({ portfolioId });
    } else {
      setSearchParams({});
    }
  };

  const [summary, setSummary] = useState(INITIAL_SUMMARY);

  useEffect(() => {
    // If error occurs, we might want to handle it or show error state.
    if (error) {
        console.error("Dashboard error state:", error);
    }

    if (loading) return;

    if (selectedPortfolioId) {
      setSummary(calculateDashboardSummary(holdings.filter(h => h.portfolioId === selectedPortfolioId), displayCurrency, exchangeRates));
    } else {
      setSummary(calculateDashboardSummary(holdings, displayCurrency, exchangeRates));
    }
  }, [selectedPortfolioId, holdings, exchangeRates, displayCurrency, loading, error]);

  // Default Columns
  const defaultColumns = {
    displayName: true,
    ticker: true,
    sector: true,
    qty: true,
    avgCost: true,
    currentPrice: true,
    dayChangePct: true,
    dayChangeVal: true,
    mv: true,
    unrealizedGain: true,
    unrealizedGainPct: true,
    realizedGain: true,
    realizedGainPct: true,
    realizedGainAfterTax: true,
    totalGain: true,
    totalGainPct: true,
    valueAfterTax: true,
  };

  const [columnVisibility, setColumnVisibility] = useState(() => {
    const saved = localStorage.getItem('columnVisibility');
    return saved ? { ...defaultColumns, ...JSON.parse(saved) } : defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  const columnDisplayNames: Record<string, string> = {
    displayName: t('Display Name', 'שם תצוגה'),
    ticker: t('Ticker', 'סימול'),
    sector: t('Sector', 'סקטור'),
    qty: t('Quantity', 'כמות'),
    avgCost: t('Avg Cost', 'עלות ממוצעת'),
    currentPrice: t('Current Price', 'מחיר נוכחי'),
    dayChangePct: t('Day Change %', '% שינוי יומי'),
    dayChangeVal: t('Day Change $', 'שינוי יומי'),
    mv: t('Market Value', 'שווי שוק'),
    unrealizedGain: t('Unrealized Gain', 'רווח לא ממומש'),
    unrealizedGainPct: t('Unrealized Gain %', '% רווח לא ממומש'),
    realizedGain: t('Realized Gain', 'רווח ממומש'),
    realizedGainPct: t('Realized Gain %', '% רווח ממומש'),
    realizedGainAfterTax: t('Realized Gain After Tax', 'רווח ממומש נטו'),
    totalGain: t('Total Gain', 'רווח כולל'),
    totalGainPct: t('Total Gain %', '% רווח כולל'),
    valueAfterTax: t('Value After Tax', 'שווי אחרי מס'),
  };

  // Grouping Logic
  const groupedData = useMemo(() => {
    const filteredHoldings = selectedPortfolioId ? holdings.filter(h => h.portfolioId === selectedPortfolioId) : holdings;
    if (!groupByPortfolio || selectedPortfolioId || filteredHoldings.length === 0) return { 'All Holdings': filteredHoldings };
    const groups: Record<string, import('../lib/types').DashboardHolding[]> = {};
    filteredHoldings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });
    return groups;
  }, [holdings, groupByPortfolio, selectedPortfolioId]);

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4 }}>
      <DashboardSummary
        summary={summary}
        displayCurrency={displayCurrency}
        exchangeRates={exchangeRates}
        selectedPortfolio={portMap.get(selectedPortfolioId || '')?.name || null}
        onBack={() => handleSelectPortfolio(null)}
        onCurrencyChange={setDisplayCurrency}
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
            value="unvested"
            selected={includeUnvested}
            onChange={() => setIncludeUnvested(!includeUnvested)}
            size="small"
            color="primary"
            sx={{ borderRadius: 2, textTransform: 'none', px: 2, py: 0.5, mr: 1, border: 1, borderColor: 'divider' }}
          >
            {t('Include Unvested', 'כלול לא מובשל')}
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
        holdings={holdings} 
        groupedData={groupedData}
        groupByPortfolio={groupByPortfolio}
        displayCurrency={displayCurrency}
        exchangeRates={exchangeRates}
        includeUnvested={includeUnvested}
        onSelectPortfolio={handleSelectPortfolio} // Updated prop
        columnVisibility={columnVisibility}
        onHideColumn={(col) => setColumnVisibility((prev: any) => ({ ...prev, [col]: false }))}
      />
    </Box>
  );
}