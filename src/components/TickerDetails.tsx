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

interface TickerDetailsRouteParams extends Record<string, string | undefined> {
  exchange: string;
  ticker: string;
  numericId?: string;
}

export function TickerDetails({ sheetId }: { sheetId: string }) {
  const { exchange, ticker, numericId } = useParams<TickerDetailsRouteParams>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [holdingData, setHoldingData] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetRebuildTime, setSheetRebuildTime] = useState<string | null>(null);
  const fetchData = useCallback(async (forceRefresh = false) => {
    if (ticker && exchange) {
      if (!forceRefresh) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const upperExchange = exchange.toUpperCase();
      const knownLiveExchanges = ['TASE', 'NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS']; // Exchanges for live API calls

      try {
        const sheetRebuildTimePromise = getMetadataValue(sheetId, 'holdings_rebuild');
        
        // 1. Try fetching from sheets first
        const holding = await fetchHolding(sheetId, ticker, upperExchange);
        console.log('TickerDetails: fetchHolding result:', holding);
        
        if (holding) {
            setHoldingData(holding);
            setData(null); // Clear live data if we are using sheet data
        } else {
            // 2. Fallback to live data if not in sheets
            setHoldingData(null);
            if (knownLiveExchanges.includes(upperExchange)) {
              const numericIdVal = numericId ? parseInt(numericId, 10) : null;
              const tickerData = await getTickerData(ticker, exchange, numericIdVal, undefined, forceRefresh);
              console.log('TickerDetails: live getTickerData result:', tickerData);
              if (upperExchange === 'TASE' && !tickerData) {
                setError('Ticker not found on TASE.');
              }
              // Standardize numeric_id from API to numericId for frontend consistency
              if (tickerData && tickerData.numericId) {
                tickerData.numericId = tickerData.numericId;
              }
              setData(tickerData);
            } else {
                setData(null);
            }
        }
        
        const sheetRebuild = await sheetRebuildTimePromise;
        setSheetRebuildTime(sheetRebuild);

      } catch (err) {
        setError('Error fetching ticker data.');
        setData(null);
        setHoldingData(null);
        console.error(err);
      } finally {
        if (!forceRefresh) setLoading(false);
        else setRefreshing(false);
      }
    } else {
      setError('Missing ticker or exchange information.');
      setLoading(false);
      setData(null);
    }
  }, [ticker, exchange, sheetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClose = () => {
    navigate('/dashboard'); // Go back to dashboard on close
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

    const yExchange = exchange?.toUpperCase() === 'TASE' ? 'TA' : exchange?.toUpperCase();
    if (yExchange && yExchange != 'NASDAQ' && yExchange != 'NYSE') {
      links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${ticker}.${yExchange}` });
    } else {
      links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${ticker}` });
    }

    const gExchange = exchange?.toUpperCase() === 'TASE' ? 'TLV' : exchange?.toUpperCase();
    if (gExchange && gExchange != 'NASDAQ' && gExchange != 'NYSE') {
      links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}:${gExchange}` });
    } else {
      links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}` });
    }

    const numericId = data?.numericId || holdingData?.numericId;
    if (numericId) {
      links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${numericId}` });
      const isSecurity = true; // Currently assume true; TODO: Determine actual type
      if (isSecurity) {
        links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/security/${numericId}` });
      } else {
        links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/mutual-funds/${numericId}` });
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
  const lastUpdated = formatTimestamp(data?.timestamp || sheetRebuildTime);

  // Helper to construct performance object
  const getPerf = (val?: number, date?: number) => val !== undefined ? { val, date } : undefined;

  const perfData: Record<string, { val: number, date?: number } | undefined> = {
    '1D': getPerf(data?.changePct ?? holdingData?.changePct, data?.changeDate1d ?? holdingData?.changeDate1d),
    [data?.recentChangeDays ? `${data.recentChangeDays}D` : '1W']: getPerf(data?.changePctRecent ?? holdingData?.changePctRecent, data?.changeDateRecent ?? holdingData?.changeDateRecent),
    '1M': getPerf(data?.changePct1m ?? holdingData?.changePct1m, data?.changeDate1m ?? holdingData?.changeDate1m),
    '3M': getPerf(data?.changePct3m ?? holdingData?.changePct3m, data?.changeDate3m ?? holdingData?.changeDate3m),
    'YTD': getPerf(data?.changePctYtd ?? holdingData?.changePctYtd, data?.changeDateYtd ?? holdingData?.changeDateYtd),
    '1Y': getPerf(data?.changePct1y ?? holdingData?.changePct1y, data?.changeDate1y ?? holdingData?.changeDate1y),
    '3Y': getPerf(data?.changePct3y ?? holdingData?.changePct3y, data?.changeDate3y ?? holdingData?.changeDate3y),
    '5Y': getPerf(data?.changePct5y ?? holdingData?.changePct5y, data?.changeDate5y ?? holdingData?.changeDate5y),
  };

  return (
    <Dialog open={true} onClose={handleClose} maxWidth={false} fullWidth PaperProps={{ sx: { width: 'min(900px, 96%)' } }}>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" component="div" fontWeight="bold">
              {data?.name || holdingData?.name || ticker}
            </Typography>
            <Typography variant="subtitle1" component="div" color="text.secondary">
              {(data?.name || holdingData?.name) ? `${exchange?.toUpperCase()}: ${ticker}` : exchange?.toUpperCase()}
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
        {!loading && !error && !displayData && <Typography>No data available.</Typography>}
        {displayData && (
          <>
            {(() => {
              const isTase = exchange?.toUpperCase() === 'TASE' || displayData.exchange === 'TASE';
              const price = displayData.price;
              const openPrice = displayData.openPrice;
              const maxDecimals = (price != null && price % 1 !== 0) || (openPrice != null && openPrice % 1 !== 0) ? 2 : 0;
              const dayChange = perfData['1D']?.val || 0;

              return (
                <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="baseline" sx={{ gap: 1, flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>PRICE</Typography>
                    <Typography variant="h6" component="div" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatPrice(price, isTase ? 'ILA' : displayData.currency, maxDecimals)}
                    </Typography>
                    {openPrice != null && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                        Open: {formatPrice(openPrice, isTase ? 'ILA' : displayData.currency, maxDecimals)}
                      </Typography>
                    )}
                  </Box>

                  <Tooltip title={`Day change (as of ${lastUpdated})`} placement="top">
                    <Box sx={{ textAlign: 'right', ml: 2, minWidth: 96 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: dayChange >= 0 ? 'success.main' : 'error.main' }}>{formatPercent(dayChange)}</Typography>
                    </Box>
                  </Tooltip>
                </Box>
              );
            })()}
            <Typography variant="subtitle2" gutterBottom>Performance</Typography>
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
                          <Typography variant="caption" color="text.secondary">{range}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(value)}</Typography>
                        </>
                      }
                    />
                  </Tooltip>
                );
              })}
            </Box>

            <Typography variant="subtitle2" gutterBottom>Dividend Gains</Typography>
            <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {['YTD', '1Y', '3Y', '5Y', 'All Time'].map(range => (
                <Chip
                  key={range}
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 80, py: 0.5, px: 0.75, height: 'auto', '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center' }, '& .MuiTypography-caption, & .MuiTypography-body2': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 } }}
                  label={
                    <>
                      <Typography variant="caption" color="text.secondary">{range}</Typography>
                      <Typography variant="body2">--%</Typography>
                    </>
                  }
                />
              ))}
            </Box>
            {/* TODO: Fetch and display actual dividend gains data */}

            <Typography variant="subtitle2" gutterBottom>External Links</Typography>

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
                {data?.timestamp ? `Live Fetched: ${formatTimestamp(data.timestamp)}` : (sheetRebuildTime ? `Sheet Rebuilt: ${formatTimestamp(sheetRebuildTime)}` : 'Freshness N/A')}
              </Typography>
              <Tooltip title="Refresh Data">
                <IconButton onClick={() => fetchData(true)} disabled={refreshing} size="small">
                  {refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </DialogContent>


      <DialogActions>
        <Button onClick={handleAddTransaction} startIcon={<AddIcon />}>Add Transaction</Button>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}