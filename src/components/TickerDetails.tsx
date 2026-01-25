import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, CircularProgress, Tooltip, IconButton, ToggleButtonGroup, ToggleButton } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getTickerData, getTickersDataset, type TickerListItem, fetchTickerHistory } from '../lib/fetching';
import { fetchHolding, getMetadataValue } from '../lib/sheets/index';
import { Exchange, parseExchange, toGoogleFinanceExchangeCode, toYahooFinanceTicker, type Holding, type Portfolio } from '../lib/types';
import { formatPrice, formatPercent, toILS, normalizeCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import { getOwnedInPortfolios } from '../lib/portfolioUtils';
import { TickerChart } from './TickerChart';
import { Currency } from '../lib/types';

interface TickerDetailsProps {
  sheetId: string;
  ticker?: string;
  exchange?: string;
  numericId?: string;
  initialName?: string;
  initialNameHe?: string;
  onClose?: () => void;
  portfolios?: Portfolio[]; // Add portfolios to props
}

interface TickerDetailsRouteParams extends Record<string, string | undefined> {
  exchange: string;
  ticker: string;
  numericId?: string;
}

export function TickerDetails({ sheetId, ticker: propTicker, exchange: propExchange, numericId: propNumericId, initialName: propInitialName, initialNameHe: propInitialNameHe, onClose, portfolios = [] }: TickerDetailsProps) {
  const params = useParams<TickerDetailsRouteParams>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string, numericId?: string, initialName?: string, initialNameHe?: string, returnState?: any } | null;

  const ticker = propTicker || params.ticker;
  // Add better handling for invalid/empty exchange param
  const exchange = parseExchange(propExchange || params.exchange || '');

  // Combine explicit numericId from various sources
  const explicitNumericId = propNumericId || params.numericId || state?.numericId;
  // State to hold a numericId that we might have to look up
  const [derivedNumericId, setDerivedNumericId] = useState<string | undefined>(undefined);
  // The effective numericId is the one we have explicitly, or the one we looked up
  const numericId = explicitNumericId || derivedNumericId;

  const initialName = propInitialName || state?.initialName;
  const initialNameHe = propInitialNameHe || state?.initialNameHe;

  const [data, setData] = useState<any>(null);
  const [holdingData, setHoldingData] = useState<Holding | null>(null);
  const [historicalData, setHistoricalData] = useState<any[] | null>(null);
  const [chartRange, setChartRange] = useState('1Y');
  const [chartMetric, setChartMetric] = useState<'percent' | 'price'>('percent');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetRebuildTime, setSheetRebuildTime] = useState<string | null>(null);
  const { t, tTry, language } = useLanguage();

  const oldestDate = historicalData?.[0]?.date;
  const now = new Date();
  
  const availableRanges = useMemo(() => {
    if (!oldestDate) return ['ALL'];
    const diffTime = Math.abs(now.getTime() - oldestDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    const diffMonths = diffDays / 30;
    const diffYears = diffDays / 365;

    const ranges = [];
    if (diffMonths >= 1) ranges.push('1M');
    if (diffMonths >= 3) ranges.push('3M');
    if (diffMonths >= 6) ranges.push('6M');
    
    // YTD is special: show if data starts before Jan 1st of this year
    if (oldestDate.getFullYear() < now.getFullYear()) ranges.push('YTD');

    if (diffYears >= 1) ranges.push('1Y');
    if (diffYears >= 3) ranges.push('3Y');
    if (diffYears >= 5) ranges.push('5Y');
    
    ranges.push('ALL');
    return ranges;
  }, [oldestDate]);

  const maxLabel = useMemo(() => {
      if (!oldestDate) return 'Max';
      const diffTime = Math.abs(now.getTime() - oldestDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const diffYears = diffDays / 365;
      
      if (diffYears >= 1) return `Max (${diffYears.toFixed(1)}Y)`;
      const diffMonths = diffDays / 30;
      if (diffMonths >= 1) return `Max (${diffMonths.toFixed(1)}M)`;
      return `Max (${diffDays}D)`;
  }, [oldestDate]);

  const displayHistory = useMemo(() => {
    if (!historicalData) return [];
    if (chartRange === 'ALL') return historicalData;

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // Normalize time

    switch (chartRange) {
      case '1M':
        startDate.setMonth(now.getMonth() - 1);
        startDate.setDate(startDate.getDate() - 5); // Buffer
        break;
      case '3M':
        startDate.setMonth(now.getMonth() - 3);
        startDate.setDate(startDate.getDate() - 5);
        break;
      case '6M':
        startDate.setMonth(now.getMonth() - 6);
        startDate.setDate(startDate.getDate() - 5);
        break;
      case 'YTD':
        startDate.setFullYear(now.getFullYear(), 0, 1);
        break;
      case '1Y':
        startDate.setFullYear(now.getFullYear() - 1);
        startDate.setDate(1); // Snap to start of month to catch monthly data
        break;
      case '3Y':
        startDate.setFullYear(now.getFullYear() - 3);
        startDate.setDate(1);
        break;
      case '5Y':
        startDate.setFullYear(now.getFullYear() - 5);
        startDate.setDate(1);
        break;
      default:
        return historicalData;
    }
    return historicalData.filter(d => d.date.getTime() >= startDate.getTime());
  }, [historicalData, chartRange]);


  const ownedInPortfolios = ticker ? getOwnedInPortfolios(ticker, portfolios, exchange) : undefined;

  const handleRefresh = async () => {
    setRefreshing(true);
    if (ticker && exchange) {
      const [, historyResponse] = await Promise.all([
        fetchData(true),
        fetchTickerHistory(ticker, exchange, undefined, true)
      ]);
      setHistoricalData(historyResponse?.historical || []);
      setData((prev: any) => ({ ...prev, dividends: historyResponse?.dividends, splits: historyResponse?.splits }));
    }
    setRefreshing(false);
  };

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!ticker || !exchange) {
      setError(t('Missing ticker or exchange information.', 'חסר מידע על סימול או בורסה.'));
      setLoading(false);
      return;
    }

    if (!forceRefresh) setLoading(true);
    setError(null);

    const upperExchange = exchange.toUpperCase();

    try {
      let currentNumericId = numericId;
      // If numericId is missing for TASE/GEMEL/PENSION, find it from the tickers dataset.
      if (!currentNumericId && (exchange === Exchange.TASE || exchange === Exchange.GEMEL || exchange === Exchange.PENSION)) {
        console.log(`Numeric ID missing for ${ticker} on ${exchange}. Fetching dataset to find it.`);
        const dataset = await getTickersDataset();
        let foundItem: TickerListItem | undefined;
        for (const key in dataset) {
          foundItem = dataset[key].find(item => item.symbol === ticker && item.exchange === exchange);
          if (foundItem) break;
        }
        if (foundItem) {
          const foundId = foundItem.taseInfo?.securityId || foundItem.providentInfo?.fundId;
          if (foundId) {
            console.log(`Found numeric ID: ${foundId}`);
            currentNumericId = String(foundId);
            setDerivedNumericId(currentNumericId); // Save for future renders
          }
        }
      }

      if (!currentNumericId && (exchange === Exchange.TASE || exchange === Exchange.GEMEL || exchange === Exchange.PENSION)) {
        console.warn(`Could not find numeric ID for ${ticker}. Data fetching may be incomplete.`);
      }

      const numericIdVal = currentNumericId ? parseInt(currentNumericId, 10) : null;

      const [tickerData, holding, sheetRebuild] = await Promise.all([
        getTickerData(ticker, exchange, numericIdVal, undefined, forceRefresh),
        fetchHolding(sheetId, ticker, upperExchange),
        getMetadataValue(sheetId, 'holdings_rebuild'),
      ]);

      setHoldingData(holding);
      setData((prev: any) => ({
        ...prev,
        ...tickerData,
        dividends: tickerData?.dividends || prev?.dividends,
        splits: tickerData?.splits || prev?.splits
      }));
      setSheetRebuildTime(sheetRebuild);
      
      if (tickerData?.historical && tickerData.historical.length > 0) {
        setHistoricalData(tickerData.historical);
      }

      if (!tickerData && !holding) {
        setError(t('Ticker not found.', 'הנייר לא נמצא.'));
      }
    } catch (err) {
      setError(t('Error fetching ticker data.', 'שגיאה בטעינת נתוני הנייר.'));
      setData(null);
      setHoldingData(null);
      console.error(err);
    } finally {
      if (!forceRefresh) setLoading(false);
    }
  }, [ticker, exchange, numericId, sheetId, t]);

  useEffect(() => {
    fetchData();
    // Fetch history data separately
    if (ticker && exchange) {
      fetchTickerHistory(ticker, exchange).then(historyResponse => {
        setHistoricalData(historyResponse?.historical || []);
        setData((prev: any) => ({ ...prev, dividends: historyResponse?.dividends, splits: historyResponse?.splits }));
      });
    }
  }, [fetchData, ticker, exchange]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      if (state?.from) {
        navigate(state.from, { state: state.returnState });
      } else {
        navigate('/dashboard'); // Go back to dashboard on close
      }
    }
  };

  const handleAddTransaction = () => {
    navigate('/transaction', {
      state: {
        prefilledTicker: ticker,
        prefilledExchange: data?.exchange || exchange,
        initialPrice: data?.price?.toString(),
        initialCurrency: data?.currency,
        numericId: data?.numericId || holdingData?.numericId,
        initialName: resolvedName,
        initialNameHe: resolvedNameHe
      }
    });
  };

  const getExternalLinks = () => {
    if (!ticker) return [];

    const links = [];

    if (exchange === Exchange.GEMEL) {
      const nid = numericId || data?.numericId || holdingData?.numericId;
      const clenaedHeName = resolvedNameHe?.replace(/[^a-zA-Z0-9א-ת ]/g, '').replace(/ /g, '-');
      if (nid)
        links.push({ name: 'MyGemel', url: `https://www.mygemel.net/קופות-גמל/${clenaedHeName}` });
        links.push({ name: 'GemelNet', url: `https://gemelnet.cma.gov.il/views/perutHodshi.aspx?idGuf=${nid}&OCHLUSIYA=1` });
      return links;
    }

    if (exchange === Exchange.PENSION) {
      const nid = numericId || data?.numericId || holdingData?.numericId;
      const clenaedHeName = resolvedNameHe?.replace(/[^a-zA-Z0-9א-ת ]/g, '').replace(/ /g, '-');
      if (nid)
        links.push({ name: 'MyGemel', url: `https://www.mygemel.net/פנסיה/${clenaedHeName}` });
        links.push({ name: 'PensyaNet', url: `https://pensyanet.cma.gov.il/Parameters/Index` }); // Generic link as PensyaNet uses POST
      return links;
    }

    if (exchange === Exchange.FOREX) {
      // e.g. BTC-USD
      const formattedTicker = ticker.includes('-') ? ticker : `${ticker}-USD`;
      const isCrypto = data?.globesTypeHe === "מטבע דיגיטלי"; // TODO - extract logic (also in other places)
      toYahooFinanceTicker(formattedTicker, exchange, isCrypto);
      links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${formattedTicker}` });
      links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${formattedTicker}` });

    } else {
      const isCrypto = data?.globesTypeHe === "מטבע דיגיטלי";
      links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${toYahooFinanceTicker(ticker, exchange, isCrypto)}` });

      const gExchange = toGoogleFinanceExchangeCode(exchange);
      if (gExchange) {
        links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}:${gExchange}` });
      } else {
        links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}` });
      }
    }

    const globesId = data?.globesInstrumentId;
    if (globesId) {
      links.push({ name: 'Globes', url: `https://www.globes.co.il/portal/instrument.aspx?instrumentid=${globesId}` });
    }

    const numId = data?.numericId || holdingData?.numericId;
    if (numId) {
      links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${numId}` });
      const isSecurity = true; // Currently assume true; TODO: Determine actual type
      if (isSecurity) {
        links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/security/${numId}` });
      } else {
        links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/mutual-funds/${numId}` });
      } // TODO: Etc. for other types
    }

    return links;
  };

  const formatTimestamp = (timestamp?: Date | string | number) => {
    if (!timestamp) return 'N/A';
    const date = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    return isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `${dateStr} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatDate = (timestamp?: Date | string | number) => {
    if (!timestamp) return 'N/A';
    const date = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const displayData = data || holdingData;

  // Robustly handle timestamp regardless of its source type (Date, string, or number)
  const rawTimestamp = data?.timestamp || sheetRebuildTime;
  const dataTimestamp = rawTimestamp ? new Date(rawTimestamp) : null;
  const lastUpdated = formatTimestamp(dataTimestamp || undefined);
  const isStale = dataTimestamp ? (Date.now() - dataTimestamp.getTime()) > 1000 * 60 * 60 * 24 * 3 : false; // > 3 days

  const resolvedName = data?.name || holdingData?.name || initialName;
  const resolvedNameHe = data?.nameHe || holdingData?.nameHe || initialNameHe;

  // Helper to construct performance object
  const getPerf = (val?: number, date?: Date) => {
    if (val === undefined || val === null || isNaN(val)) return undefined;
    return { val, date };
  };
  const perfData: Record<string, { val: number, date?: Date } | undefined> = {
    '1D': getPerf(data?.changePct1d ?? (holdingData as any)?.changePct1d, data?.changeDate1d ?? (holdingData as any)?.changeDate1d),
    [data?.recentChangeDays ? `${data.recentChangeDays}D` : '1W']: getPerf(data?.changePctRecent ?? (holdingData as any)?.perf1w ?? (holdingData as any)?.changePctRecent, data?.changeDateRecent ?? (holdingData as any)?.changeDateRecent),
    '1M': getPerf(data?.changePct1m ?? (holdingData as any)?.changePct1m, data?.changeDate1m ?? (holdingData as any)?.changeDate1m),
    '3M': getPerf(data?.changePct3m ?? (holdingData as any)?.changePct3m, data?.changeDate3m ?? (holdingData as any)?.changeDate3m),
    'YTD': getPerf(data?.changePctYtd ?? (holdingData as any)?.changePctYtd, data?.changeDateYtd ?? (holdingData as any)?.changeDateYtd),
    '1Y': getPerf(data?.changePct1y ?? (holdingData as any)?.changePct1y, data?.changeDate1y ?? (holdingData as any)?.changeDate1y),
    '3Y': getPerf(data?.changePct3y ?? (holdingData as any)?.changePct3y, data?.changeDate3y ?? (holdingData as any)?.changeDate3y),
    '5Y': getPerf(data?.changePct5y ?? (holdingData as any)?.changePct5y, data?.changeDate5y ?? (holdingData as any)?.changeDate5y),
    'Max': getPerf(data?.changePctMax ?? (holdingData as any)?.changePctMax, data?.changeDateMax ?? (holdingData as any)?.changeDateMax),
  };

  const translateRange = (range: string) => {
    const map: Record<string, string> = {
      '1D': t('1D', 'יומי'),
      '1W': t('1W', 'שבוע'),
      '1M': t('1M', 'חודש'),
      '3M': t('3M', '3 חודשים'),
      'YTD': t('YTD', 'מתחילת שנה'),
      '1Y': t('1Y', 'שנה'),
      '3Y': t('3Y', '3 שנים'),
      '5Y': t('5Y', '5 שנים'),
      'Max': t('Max', 'מקסימום'),
    };
    // Handle dynamic days like "5D"
    if (range.endsWith('D') && range !== '1D' && range !== 'YTD') {
      return range.replace('D', t('D', ' ימים'));
    }
    return map[range] || range;
  };

  const dividendGains = useMemo(() => {
    if (!data?.dividends || data.dividends.length === 0 || !displayData?.currency || !historicalData || historicalData.length === 0) return {};

    const findPriceAtDate = (date: Date) => {
      // Find the historical data point closest to the given date
      let closest = historicalData[0];
      let minDiff = Math.abs(historicalData[0].date.getTime() - date.getTime());
      for (let i = 1; i < historicalData.length; i++) {
        const diff = Math.abs(historicalData[i].date.getTime() - date.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closest = historicalData[i];
        }
      }
      return closest.price;
    };

    const calculateDividendsForRange = (startDate: Date) => {
      const basePrice = findPriceAtDate(startDate);
      if (!basePrice) return { amount: 0, pct: 0 };
      let sum = 0;
      // dividends are sorted descending (Newest first)
      for (const div of data.dividends!) {
        if (div.date < startDate) {
          break; // Stop if we've passed the start date (entered older dates)
        }
        sum += div.amount;
      }
      return { amount: sum, pct: sum / basePrice };
    };

    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1);
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    const maxStartDate = historicalData.length > 0 ? historicalData[0].date : new Date(0);

    return {
      'YTD': calculateDividendsForRange(ytdStart),
      '1Y': calculateDividendsForRange(oneYearAgo),
      '5Y': calculateDividendsForRange(fiveYearsAgo),
      'Max': calculateDividendsForRange(maxStartDate),
    };
  }, [data?.dividends, data?.splits, displayData?.currency, historicalData]);

  const isTase = exchange == Exchange.TASE || displayData?.exchange === Exchange.TASE;
  const isProvident = exchange?.toUpperCase() === Exchange.GEMEL || displayData?.exchange === Exchange.GEMEL || exchange?.toUpperCase() === Exchange.PENSION || displayData?.exchange === Exchange.PENSION;
  const price = displayData?.price;
  const openPrice = displayData?.openPrice;
  const maxDecimals = (price != null && price % 1 !== 0) || (openPrice != null && openPrice % 1 !== 0) ? 2 : 0;
  const dayChange = perfData['1D']?.val || 0;

  const formatVolume = (val?: number, currencyCode?: string) => {
    if (val === undefined || val === null || isNaN(val)) return null;
    
    let effectiveVal = val;
    let effectiveCurrency = currencyCode;

    // Convert ILA to ILS for volume display
    if (currencyCode && normalizeCurrency(currencyCode) === Currency.ILA) {
        effectiveVal = toILS(val, Currency.ILA);
        effectiveCurrency = Currency.ILS;
    }

    // Default suffixes
    const suffixes = {
        K: 'K',
        M: 'M',
        B: 'B'
    };
    
    // Manual overrides for Hebrew suffixes
    if (language === 'he') {
        suffixes.K = " א'";
        suffixes.M = " מ'";
        suffixes.B = " B"; 
    }

    let suffix = '';
    let div = 1;
    if (effectiveVal >= 1_000_000_000) { suffix = suffixes.B; div = 1_000_000_000; }
    else if (effectiveVal >= 1_000_000) { suffix = suffixes.M; div = 1_000_000; }
    else if (effectiveVal >= 1_000) { suffix = suffixes.K; div = 1_000; }
    
    const formattedNum = (effectiveVal / div).toLocaleString(undefined, { maximumFractionDigits: 1 });
    // Use formatPrice just to get the currency symbol/text by formatting 0
    const currencyStr = effectiveCurrency ? formatPrice(0, effectiveCurrency, 0, t).replace(/[0-9.,-]+/g, '').trim() : '';
    
    return { text: `${formattedNum}${suffix}`, currency: currencyStr };
  };

  const volData = formatVolume(displayData?.volume, displayData?.currency);
  const volumeDisplay = volData ? `${volData.text} ${volData.currency}` : null;

  return (
    <Dialog open={true} onClose={handleClose} maxWidth={false} fullWidth PaperProps={{ sx: { width: 'min(900px, 96%)' } }}>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0, pr: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h4" component="div" fontWeight="bold">
                {tTry(resolvedName || ticker, resolvedNameHe)}
              </Typography>
              {ownedInPortfolios && ownedInPortfolios.length > 0 && (
                <Tooltip title={`${t('Owned in', 'מוחזק ב')}: ${ownedInPortfolios.join(', ')}`}>
                  <BusinessCenterIcon color="action" />
                </Tooltip>
              )}
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="subtitle1" component="div" color="text.secondary">
                {resolvedName ? `${exchange?.toUpperCase()}: ${ticker}` : exchange?.toUpperCase()}
              </Typography>
              {displayData?.sector && <Chip label={displayData.subSector ? (displayData.sector.includes(displayData.subSector) || displayData.subSector.includes(displayData.sector) ? displayData.subSector : `${displayData.sector} • ${displayData.subSector}`) : displayData.sector} size="small" variant="outlined" />}
              {(displayData?.taseType || displayData?.globesTypeHe) && <Chip label={displayData?.taseType || displayData.globesTypeHe} size="small" variant="outlined" />}
              {displayData?.providentInfo?.managementFee !== undefined && (
                <Chip label={`${t('Mgmt fee:', 'דמי ניהול:')} ${displayData.providentInfo.managementFee}%`} size="small" variant="outlined" />
              )}
              {displayData?.providentInfo?.depositFee !== undefined && (
                <Chip label={`${t('Deposit fee:', 'דמי הפקדה:')} ${displayData.providentInfo.depositFee}%`} size="small" variant="outlined" />
              )}
            </Box>
            {(() => {
              const lastSplit = data?.splits?.[0];
              if (!lastSplit) return null;
              const now = new Date();
              const oneYearAgo = new Date();
              oneYearAgo.setFullYear(now.getFullYear() - 1);
              if (lastSplit.date < oneYearAgo) return null;

              const isReverse = lastSplit.numerator < lastSplit.denominator;
              const label = isReverse ? t('Merge Date:', 'תאריך איחוד:') : t('Split Date:', 'תאריך פיצול:');
              return (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  {label} {formatDate(lastSplit.date)} ({lastSplit.numerator}:{lastSplit.denominator})
                </Typography>
              );
            })()}
          </Box>
          {displayData && (
            <Box sx={{ textAlign: 'right', ml: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              {!isProvident && (
                <>
                  <Box display="flex" alignItems="baseline" justifyContent="flex-end" sx={{ gap: 1.5 }}>
                    <Typography variant="h6" component="div" fontWeight={600}>
                      {formatPrice(price, isTase ? 'ILA' : displayData.currency, maxDecimals, t)}
                    </Typography>
                    <Tooltip title={`${t('Day change', 'שינוי יומי')} (${lastUpdated})`} placement="top">
                      <Typography variant="h6" sx={{ fontWeight: 700, color: dayChange >= 0 ? 'success.main' : 'error.main' }}>
                        {formatPercent(dayChange)}
                      </Typography>
                    </Tooltip>
                  </Box>
                  {(openPrice != null || data?.tradeTimeStatus || volumeDisplay) && (
                    <Box display="flex" alignItems="baseline" justifyContent="flex-end" sx={{ gap: 1, mt: 0.25 }}>
                      {openPrice != null && (
                        <Typography variant="caption" color="text.secondary">{t('Open:', 'פתיחה:')} {formatPrice(openPrice, isTase ? 'ILA' : displayData.currency, maxDecimals, t)}</Typography>
                      )}
                      {openPrice != null && (data?.tradeTimeStatus || volumeDisplay) && (<Typography variant="caption" color="text.secondary">|</Typography>)}
                      {volumeDisplay && (
                         <>
                           <Tooltip title={t('Average daily trading volume (quarterly avg, in ticker currency)', 'מחזור מסחר יומי ממוצע (ממוצע רבעוני, במטבע הנייר)')} arrow>
                             <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>
                               {t('Vol:', 'מחזור:')} {volumeDisplay}
                             </Typography>
                           </Tooltip>
                           {data?.tradeTimeStatus && (<Typography variant="caption" color="text.secondary">|</Typography>)}
                         </>
                      )}
                      {data?.tradeTimeStatus && (
                        <Typography variant="caption" color="text.secondary">{data.tradeTimeStatus}</Typography>
                      )}
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
      </DialogTitle>


      <DialogContent dividers>
        {loading && (
          <Box display="flex" justifyContent="center" p={5}>
            <CircularProgress />
          </Box>
        )}
        {error && <Typography color="error">{error}</Typography>}

        {/* If no data and no basic info, show empty message */}
        {!loading && !error && !displayData && !resolvedName && <Typography>{t('No data available.', 'אין נתונים זמינים.')}</Typography>}

        {displayData && (
          <>
            {isStale && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {t('Data is from', 'הנתונים מתאריך')}: {formatDate(dataTimestamp || undefined)}
              </Typography>
            )}
            <Typography variant="subtitle2" gutterBottom>{t('Performance', 'ביצועים')}</Typography>
            <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {Object.entries(perfData).map(([range, item]) => {
                if (!item || item.val === undefined || item.val === null || isNaN(item.val)) {
                  return null; // Don't render Chip if value is not available
                }
                const value = item.val;
                const dateObj = item.date ? new Date(item.date) : null;
                const dateStr = dateObj ? `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}` : '';
                const isPositive = value > 0;
                const isNegative = value < 0;
                const textColor = isPositive ? 'success.main' : isNegative ? 'error.main' : 'text.primary';
                return (
                  <Tooltip key={range} title={dateStr ? `Since ${dateStr}` : ''} arrow>
                    <Chip
                      variant="outlined"
                      size="small"
                      sx={{
                        minWidth: 78,
                        py: 0.5,
                        px: 0.75,
                        height: 'auto',
                        color: textColor,
                        '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' },
                        '& .MuiTypography-caption, & .MuiTypography-body2': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 }
                      }}
                      label={
                        <>
                          <Typography variant="caption" color="text.secondary">{translateRange(range)}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(value)}</Typography>
                        </>
                      }
                    />
                  </Tooltip>
                );
              })}
            </Box>

            {historicalData && historicalData.length > 0 && (
              <>
                <Box display="flex" justifyContent="flex-start" alignItems="center" gap={2}>
                  <ToggleButtonGroup
                    value={chartRange}
                    exclusive
                    onChange={(_, newRange) => { if (newRange) setChartRange(newRange); }}
                    aria-label="chart range"
                    size="small"
                  >
                    {availableRanges.map(range => (
                       <ToggleButton key={range} value={range} aria-label={range}>
                         {range === 'ALL' ? maxLabel : range}
                       </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <ToggleButtonGroup
                    value={chartMetric}
                    exclusive
                    onChange={(_, newMetric) => { if (newMetric) setChartMetric(newMetric); }}
                    aria-label="chart metric"
                    size="small"
                  >
                    <ToggleButton value="percent" aria-label="percent">%</ToggleButton>
                    <ToggleButton value="price" aria-label="price">$</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <TickerChart data={displayHistory} currency={displayData.currency} mode={chartMetric} />
              </>
            )}

            {data?.dividends && data.dividends.length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>{t('Dividend Gains', 'רווחי דיבידנד')}</Typography>
                <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                  {Object.entries(dividendGains).map(([range, info]) => {
                    const value = (info as any).pct;
                    if (value === undefined || value === null || isNaN(value) || value === 0) {
                      return null;
                    }
                    const isPositive = value > 0;
                    const textColor = isPositive ? 'success.main' : 'error.main';
                    return (
                      <Chip
                        key={range}
                        variant="outlined"
                        size="small"
                        sx={{
                          minWidth: 80,
                          py: 0.5,
                          px: 0.75,
                          height: 'auto',
                          color: textColor,
                          borderColor: textColor,
                          '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' },
                          '& .MuiTypography-caption, & .MuiTypography-body2': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }
                        }}
                        label={
                          <>
                            <Typography variant="caption" color="text.secondary">{translateRange(range)}</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(value)}</Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8 }}>{formatPrice((info as any).amount, displayData.currency, 2, t)}</Typography>
                          </>
                        }
                      />
                    );
                  })}
                </Box>
              </>
            )}
          </>
        )}

        {(ticker || displayData) && (
          <>
            <Typography variant="subtitle2" gutterBottom>{t('External Links', 'קישורים חיצוניים')}</Typography>

            <Box display="flex" flexWrap="wrap" gap={1}>
              {getExternalLinks().map(link => (
                <Button
                  key={link.name}
                  variant="outlined"
                  size="small"
                  href={link.url}
                  target="_blank"
                  endIcon={<OpenInNewIcon />}
                >
                  {link.name}
                </Button>
              ))}
            </Box>

            <Box mt={2} display="flex" justifyContent="flex-end" alignItems="center" gap={1}>
              <Typography variant="caption" color="text.secondary">
                {data
                  ? `${t('Data source:', 'מקור המידע:')} ${data.source || 'API'}, ${data.timestamp ? formatTimestamp(data.timestamp) : 'N/A'}`
                  : sheetRebuildTime
                    ? `${t('Data from Google Sheets', 'מידע מ- Google Sheets')}, ${formatTimestamp(sheetRebuildTime)}`
                    : t('Freshness N/A', 'אין מידע על עדכון')}
              </Typography>
              <Tooltip title={t("Refresh Data", "רענן נתונים")}>
                <IconButton onClick={handleRefresh} disabled={refreshing} size="small">
                  {refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </DialogContent>


      <DialogActions>
        <Button onClick={handleAddTransaction} startIcon={<AddIcon />}>{t('Add Transaction', 'הוסף עסקה')}</Button>
        <Button onClick={handleClose}>{t('Close', 'סגור')}</Button>
      </DialogActions>
    </Dialog>
  );
}
