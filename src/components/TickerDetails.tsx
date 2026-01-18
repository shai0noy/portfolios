import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, CircularProgress, Tooltip, IconButton } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerData } from '../lib/fetching';
import { fetchHolding, getMetadataValue } from '../lib/sheets/index';
import type { Holding } from '../lib/types';
import { formatPrice, formatPercent } from '../lib/currency';
import { useLanguage } from '../lib/i18n';

interface TickerDetailsProps {
  sheetId: string;
  ticker?: string;
  exchange?: string;
  numericId?: string;
  initialName?: string;
  initialNameHe?: string;
  onClose?: () => void;
}

interface TickerDetailsRouteParams extends Record<string, string | undefined> {
  exchange: string;
  ticker: string;
  numericId?: string;
}

export function TickerDetails({ sheetId, ticker: propTicker, exchange: propExchange, numericId: propNumericId, initialName, initialNameHe, onClose }: TickerDetailsProps) {
  const params = useParams<TickerDetailsRouteParams>();
  const navigate = useNavigate();
  
  const ticker = propTicker || params.ticker;
  const exchange = propExchange || params.exchange;
  const numericId = propNumericId || params.numericId;

  const [data, setData] = useState<any>(null);
  const [holdingData, setHoldingData] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetRebuildTime, setSheetRebuildTime] = useState<string | null>(null);
  const { t, tTry } = useLanguage();
  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!ticker || !exchange) {
      setError(t('Missing ticker or exchange information.', 'חסר מידע על סימול או בורסה.'));
      setLoading(false);
      return;
    }

    if (!forceRefresh) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const upperExchange = exchange.toUpperCase();
    const knownLiveExchanges = ['TASE', 'NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'GEMEL'];

    try {
      const holdingPromise = fetchHolding(sheetId, ticker, upperExchange);
      const sheetRebuildTimePromise = getMetadataValue(sheetId, 'holdings_rebuild');

      const holding = await holdingPromise;
      setHoldingData(holding);

      const shouldFetchLive = forceRefresh || !holding;

      if (shouldFetchLive && knownLiveExchanges.includes(upperExchange)) {
        const numericIdVal = numericId ? parseInt(numericId, 10) : null;
        let tickerData = await getTickerData(ticker, exchange, numericIdVal, undefined, forceRefresh);

        setData(tickerData);

        if (!tickerData && !holding) {
          setError(t('Ticker not found.', 'הנייר לא נמצא.'));
        }
      } else {
        setData(null);
      }

      const sheetRebuild = await sheetRebuildTimePromise;
      setSheetRebuildTime(sheetRebuild);

    } catch (err) {
      setError(t('Error fetching ticker data.', 'שגיאה בטעינת נתוני הנייר.'));
      setData(null);
      setHoldingData(null);
      console.error(err);
    } finally {
      if (!forceRefresh) setLoading(false);
      else setRefreshing(false);
    }
  }, [ticker, exchange, numericId, sheetId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/dashboard'); // Go back to dashboard on close
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
      }
    });
  };

  const getExternalLinks = () => {
    if (!ticker) return [];

    const links = [];
    const upperExchange = exchange?.toUpperCase();

    if (upperExchange === 'GEMEL') {
      const nid = numericId || data?.numericId || holdingData?.numericId;
      if (nid) {
         links.push({ name: 'GemelNet', url: `https://gemelnet.cma.gov.il/views/perutHodshi.aspx?idGuf=${nid}&OCHLUSIYA=1` });
      }
      return links;
    }

    const yExchange = upperExchange === 'TASE' ? 'TA' : upperExchange;
    if (yExchange && yExchange != 'NASDAQ' && yExchange != 'NYSE') {
      links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${ticker}.${yExchange}` });
    } else {
      links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${ticker}` });
    }

    const gExchange = upperExchange === 'TASE' ? 'TLV' : upperExchange;
    if (gExchange && gExchange != 'NASDAQ' && gExchange != 'NYSE') {
      links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}:${gExchange}` });
    } else {
      links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}` });
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

  const formatTimestamp = (timestamp?: number | string) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    return isToday ? date.toLocaleTimeString() : date.toLocaleString();
  };

  const displayData = data || holdingData;
  console.log('TickerDetails displayData:', displayData);
  const lastUpdated = formatTimestamp(data?.timestamp || sheetRebuildTime);

  // Helper to construct performance object
  const getPerf = (val?: number, date?: number) => val !== undefined ? { val, date } : undefined;

  const perfData: Record<string, { val: number, date?: number } | undefined> = {
    '1D': getPerf(data?.changePct ?? (holdingData as any)?.changePct, data?.changeDate1d ?? (holdingData as any)?.changeDate1d),
    [data?.recentChangeDays ? `${data.recentChangeDays}D` : '1W']: getPerf(data?.changePctRecent ?? (holdingData as any)?.perf1w ?? (holdingData as any)?.changePctRecent, data?.changeDateRecent ?? (holdingData as any)?.changeDateRecent),
    '1M': getPerf(data?.changePct1m ?? (holdingData as any)?.changePct1m, data?.changeDate1m ?? (holdingData as any)?.changeDate1m),
    '3M': getPerf(data?.changePct3m ?? (holdingData as any)?.changePct3m, data?.changeDate3m ?? (holdingData as any)?.changeDate3m),
    'YTD': getPerf(data?.changePctYtd ?? (holdingData as any)?.changePctYtd, data?.changeDateYtd ?? (holdingData as any)?.changeDateYtd),
    '1Y': getPerf(data?.changePct1y ?? (holdingData as any)?.changePct1y, data?.changeDate1y ?? (holdingData as any)?.changeDate1y),
    '3Y': getPerf(data?.changePct3y ?? (holdingData as any)?.changePct3y, data?.changeDate3y ?? (holdingData as any)?.changeDate3y),
    '5Y': getPerf(data?.changePct5y ?? (holdingData as any)?.changePct5y, data?.changeDate5y ?? (holdingData as any)?.changeDate5y),
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
      'All Time': t('All Time', 'כל הזמן'),
    };
    // Handle dynamic days like "5D"
    if (range.endsWith('D') && range !== '1D' && range !== 'YTD') {
        return range.replace('D', t('D', ' ימים'));
    }
    return map[range] || range;
  };

  return (
    <Dialog open={true} onClose={handleClose} maxWidth={false} fullWidth PaperProps={{ sx: { width: 'min(900px, 96%)' } }}>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" component="div" fontWeight="bold">
              {tTry(data?.name || holdingData?.name || initialName || ticker, data?.nameHe || holdingData?.nameHe || initialNameHe)}
            </Typography>
            <Typography variant="subtitle1" component="div" color="text.secondary">
              {(data?.name || holdingData?.name || initialName) ? `${exchange?.toUpperCase()}: ${ticker}` : exchange?.toUpperCase()}
            </Typography>
          </Box>
          {displayData?.sector && <Chip label={displayData.sector || 'Unknown Sector'} size="small" variant="outlined" />}
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
        {!loading && !error && !displayData && !initialName && <Typography>{t('No data available.', 'אין נתונים זמינים.')}</Typography>}
        
        {displayData && (
          <>
            {(() => {
              const isTase = exchange?.toUpperCase() === 'TASE' || displayData.exchange === 'TASE';
              const isGemel = exchange?.toUpperCase() === 'GEMEL' || displayData.exchange === 'GEMEL';
              const price = displayData.price;
              const openPrice = displayData.openPrice;
              const maxDecimals = (price != null && price % 1 !== 0) || (openPrice != null && openPrice % 1 !== 0) ? 2 : 0;
              const dayChange = perfData['1D']?.val || 0;

              if (isGemel) return null;

              return (
                <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="baseline" sx={{ gap: 1, flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{t('PRICE', 'מחיר')}</Typography>
                    <Typography variant="h6" component="div" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatPrice(price, isTase ? 'ILA' : displayData.currency, maxDecimals, t)}
                    </Typography>
                    {openPrice != null && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                        <Typography component="span" variant="caption" sx={{ mr: 0.5 }}>{t('Open:', 'פתיחה:')}</Typography>
                        {formatPrice(openPrice, isTase ? 'ILA' : displayData.currency, maxDecimals, t)}
                      </Typography>
                    )}
                  </Box>

                  <Tooltip title={`${t('Day change', 'שינוי יומי')} (${lastUpdated})`} placement="top">
                    <Box sx={{ textAlign: 'right', ml: 2, minWidth: 96 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: dayChange >= 0 ? 'success.main' : 'error.main' }}>{formatPercent(dayChange)}</Typography>
                    </Box>
                  </Tooltip>
                </Box>
              );
            })()}
            <Typography variant="subtitle2" gutterBottom>{t('Performance', 'ביצועים')}</Typography>
            <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {Object.entries(perfData).map(([range, item]) => {
                if (!item || item.val === undefined || item.val === null || isNaN(item.val)) {
                  return null; // Don't render Chip if value is not available
                }
                const value = item.val;
                const dateObj = item.date ? new Date(item.date) : null;
                const dateStr = dateObj ? `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}` : '';
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

            {(() => {
              // Hide Dividends for Gemel
              const isGemel = exchange?.toUpperCase() === 'GEMEL' || displayData.exchange === 'GEMEL';
              if (isGemel) return null;
              
              return (
                <>
                  <Typography variant="subtitle2" gutterBottom>{t('Dividend Gains', 'דיביבידנדים')}</Typography>
                  <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                    {['YTD', '1Y', '3Y', '5Y', 'All Time'].map(range => (
                      <Chip
                        key={range}
                        variant="outlined"
                        size="small"
                        sx={{ minWidth: 80, py: 0.5, px: 0.75, height: 'auto', '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center' }, '& .MuiTypography-caption, & .MuiTypography-body2': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 } }}
                        label={
                          <>
                            <Typography variant="caption" color="text.secondary">{translateRange(range)}</Typography>
                            <Typography variant="body2">--%</Typography>
                          </>
                        }
                      />
                    ))}
                  </Box>
                  {/* TODO: Fetch and display actual dividend gains data */}
                </>
              );
            })()}
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
                {data?.timestamp
                  ? `${t('Live from', 'מידע חי מ-')} ${data.source || 'API'}: ${formatTimestamp(data.timestamp)}`
                  : sheetRebuildTime
                  ? `${t('From Google Sheets', 'Google Sheets')}: ${formatTimestamp(sheetRebuildTime)}`
                  : t('Freshness N/A', 'אין מידע על עדכון')}
              </Typography>
              <Tooltip title={t("Refresh Data", "רענן נתונים")}>
                <IconButton onClick={() => fetchData(true)} disabled={refreshing} size="small">
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