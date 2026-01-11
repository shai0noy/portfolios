import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, CircularProgress, Tooltip, IconButton } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerData, type TickerData } from '../lib/fetching';
import { fetchHolding, getMetadataValue } from '../lib/sheets/index';
import type { Holding, PriceUnit } from '../lib/types';
import { formatNumber } from '../lib/currency';

interface TickerDetailsRouteParams extends Record<string, string | undefined> {
  exchange: string;
  ticker: string;
}

export function TickerDetails({ sheetId }: { sheetId: string }) {
  const { exchange, ticker } = useParams<TickerDetailsRouteParams>();
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
        let tickerDataPromise: Promise<any> = Promise.resolve(null);
        if (knownLiveExchanges.includes(upperExchange)) {
          tickerDataPromise = getTickerData(ticker, upperExchange, undefined, forceRefresh);
        }
        const holdingDataPromise = fetchHolding(sheetId, ticker, upperExchange);
        const sheetRebuildTimePromise = getMetadataValue(sheetId, 'holdings_rebuild');

        const [tickerData, holdingData, sheetRebuild] = await Promise.all([tickerDataPromise, holdingDataPromise, sheetRebuildTimePromise]);

        if (upperExchange === 'TASE' && !tickerData) {
          setError('Ticker not found on TASE.');
        }
        setData(tickerData); // Prioritize live data
        setHoldingData(holdingData);
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
        initialTicker: ticker,
        initialExchange: data?.exchange || exchange,
        initialPrice: data?.price?.toString(),
        initialCurrency: data?.currency,
      }
    });
  };

  const formatMoney = (n: number, currency: string, unit: PriceUnit = 'base') => {
    let curr = currency;
    if (curr === '#N/A' || !curr) curr = 'ILS'; // Fallback
    
    const value = unit === 'agorot' ? n : n;
    const val = formatNumber(value);

    if (curr === 'USD') return `$${val}`;
    if (curr === 'ILS' || curr === 'NIS') {
      return unit === 'agorot' ? `${val} ag` : `₪${val}`;
    }
    if (curr === 'EUR') return `€${val}`;
    return `${val} ${curr}`;
  };

  const formatPct = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '--%';
    return (n * 100).toFixed(2) + '%';
  }

  const getExternalLinks = () => {
    if (!ticker) return [];
    const links = [];
    links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${ticker}` });

    const gExchange = exchange ? (exchange.toUpperCase() === 'TASE' ? 'TLV' : exchange.toUpperCase()) : (data?.exchange ? (data.exchange === 'TASE' ? 'TLV' : data.exchange) : '');
    if (gExchange) {
        links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}:${gExchange}` });
    } else {
        links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}` });
    }

    if ((exchange && exchange.toUpperCase() === 'TASE') || (data?.exchange === 'TASE')) {
      links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${ticker}` }); 
      const isSecurity = true; // Currently assume true; TODO: Determine actual type
      if (isSecurity) {
        links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/security/${ticker}` }); 
      } else {
        links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/mutual-funds/${ticker}` }); 
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

  const perfData: Record<string, number | undefined> = {
    '1D': data?.changePct || holdingData?.changePct,
    '1W': data?.changePct1w || holdingData?.changePct1w,
    '1M': data?.changePct1m || holdingData?.changePct1m,
    '3M': data?.changePct3m || holdingData?.changePct3m,
    'YTD': data?.changePctYtd || holdingData?.changePctYtd,
    '1Y': data?.changePct1y || holdingData?.changePct1y,
    '3Y': data?.changePct3y || holdingData?.changePct3y,
    '5Y': data?.changePct5y || holdingData?.changePct5y,
  };

  return (
    <Dialog open={true} onClose={handleClose} maxWidth={false} fullWidth PaperProps={{ sx: { width: 'min(900px, 96%)' } }}>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" component="div" fontWeight="bold">
              {displayData?.name || ticker}
            </Typography>
            <Typography variant="subtitle1" component="div" color="text.secondary">
              {displayData?.name ? `${exchange?.toUpperCase()}: ${ticker}` : exchange?.toUpperCase()}
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
            <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Box display="flex" alignItems="baseline" sx={{ gap: 1, flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>PRICE</Typography>
                <Typography variant="h6" component="div" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatMoney(displayData.price, displayData.currency, displayData.priceUnit)}</Typography>
                {displayData.openPrice && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>Open: {formatMoney(displayData.openPrice, displayData.currency, displayData.priceUnit)}</Typography>
                )}
              </Box>

              <Tooltip title="Day change" placement="top">
                <Box sx={{ textAlign: 'right', ml: 2, minWidth: 96 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: (perfData['1D'] || 0) >= 0 ? 'success.main' : 'error.main' }}>{formatPct(perfData['1D'])}</Typography>
                </Box>
              </Tooltip>
            </Box>

            <Typography variant="subtitle2" gutterBottom>Performance</Typography>
            <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {Object.entries(perfData).map(([range, value]) => {
                if (value === undefined || value === null || isNaN(value)) {
                  return null; // Don't render Chip if value is not available
                }
                const isPositive = value > 0;
                const isNegative = value < 0;
                const textColor = isPositive ? 'success.main' : isNegative ? 'error.main' : 'text.primary';
                return (
                  <Chip
                    key={range}
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
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPct(value)}</Typography>
                      </>
                    }
                  />
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