import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Grid, Chip, CircularProgress, Tooltip, IconButton } from '@mui/material';
import { TransactionForm } from './NewTransaction';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerData } from '../lib/ticker'; // Assuming getTickerData is here

interface TickerDetailsProps {
  sheetId: string;
}

interface TickerDetailsRouteParams extends Record<string, string | undefined> {
  exchange: string;
  ticker: string;
}

export function TickerDetails({ sheetId }: TickerDetailsProps) {
  const { exchange, ticker } = useParams<TickerDetailsRouteParams>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (ticker && exchange) {
      if (!forceRefresh) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const upperExchange = exchange.toUpperCase();
      try {
        // TODO: Pass forceRefresh to getTickerData to bypass cache
        const tickerData = await getTickerData(ticker, upperExchange, undefined, forceRefresh);
        if (tickerData) {
          setData(tickerData);
        } else {
          setError('Ticker not found.');
          setData(null);
        }
      } catch (err) {
        setError('Error fetching ticker data.');
        setData(null);
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
  }, [ticker, exchange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClose = () => {
    navigate('/dashboard'); // Go back to dashboard on close
  };

  const formatMoney = (n: number, currency: string, unit: 'base' | 'agorot' | 'cents' = 'base') => {
    let curr = currency;
    if (curr === '#N/A' || !curr) curr = 'ILS'; // Fallback
    
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (curr === 'USD') return `$${val}`;
    if (curr === 'ILS' || curr === 'NIS') {
      return unit === 'agorot' ? `${val} ag` : `₪${val}`;
    }
    if (curr === 'EUR') return `€${val}`;
    return `${val} ${curr}`;
  };

  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  const getExternalLinks = () => {
    if (!data) return [];
    const links = [];
    // Yahoo
    links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${data.ticker}` });
    
    // Google Finance
    let gExchange = data.exchange;
    if (data.exchange === 'TASE') gExchange = 'TLV';
    links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${data.ticker}:${gExchange}` });

    if (data.exchange === 'TASE') {
      // links.push({ name: 'Globes', url: `https://www.globes.co.il/finance/instrument/${globesInstrumentId}` }); 
      links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${data.ticker}` }); 
    }
    
    return links;
  };

  if (loading) return <Dialog open={true} onClose={handleClose}><DialogContent><Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box></DialogContent></Dialog>;
  if (error) return <Dialog open={true} onClose={handleClose}><DialogContent>{error}</DialogContent></Dialog>;
  if (!data) return <Dialog open={true} onClose={handleClose}><DialogContent>No data available.</DialogContent></Dialog>;

  return (
    <Dialog open={true} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" component="span" fontWeight="bold">{data.name || 'N/A'}</Typography>
            <Typography variant="h6" component="span" color="text.secondary" sx={{ ml: 1 }}>{data.ticker}</Typography>
            <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>{data.exchange}</Typography>
          </Box>
          <Chip label={data.sector || 'Unknown Sector'} size="small" variant="outlined" />
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6 }}>
            <Typography variant="caption" color="text.secondary">PRICE</Typography>
            <Typography variant="h4">{formatMoney(data.price, data.currency, data.priceUnit)}</Typography>
            {data.priceUnit !== 'base' && (
              <Typography variant="body2" color="text.secondary">
                Base Price: {formatMoney(data.price / 100, data.currency, 'base')}
              </Typography>
            )}
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Typography variant="caption" color="text.secondary">DAY CHANGE</Typography>
            <Typography variant="h5" color={data.changePct >= 0 ? 'success.main' : 'error.main'}>
              {formatPct(data.changePct)}
            </Typography>
          </Grid>
        </Grid>

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="caption" color="text.secondary">
            Data fetched: {data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A'}
          </Typography>
          <Tooltip title="Refresh Data">
            <IconButton onClick={() => fetchData(true)} disabled={refreshing} size="small">
              {refreshing ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        <Typography variant="subtitle2" gutterBottom>Performance</Typography>
        <Grid container spacing={1} sx={{ mb: 3 }}>
          {['1D', '1W', '1M', '3M', 'YTD', '1Y', '3Y', '5Y'].map(range => (
            <Grid size={{ xs: 3 }} key={range}>
              <Box textAlign="center" p={1} sx={{ border: '1px solid #eee', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{range}</Typography>
                <Typography variant="body2" color="text.primary">--%</Typography>
              </Box>
            </Grid>
          ))}

        </Grid>
        {/* TODO: Fetch and display actual performance data */}

        <Typography variant="subtitle2" gutterBottom>Dividend Gains (%)</Typography>
        <Grid container spacing={1} sx={{ mb: 3 }}>
          {['YTD', '1Y', '3Y', '5Y', 'All Time'].map(range => (
            <Grid size={{ xs: 4 }} key={range}>
              <Box textAlign="center" p={1} sx={{ border: '1px solid #eee', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{range}</Typography>
                <Typography variant="body2" color="text.primary">--%</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
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
      </DialogContent>
      
      <DialogActions>
        <Button onClick={() => setAddTradeOpen(true)}>Add Transaction</Button>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>

      <Dialog open={addTradeOpen} onClose={() => setAddTradeOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Transaction for {data.ticker}</DialogTitle>
        <DialogContent>
          <TransactionForm 
            sheetId={sheetId}
            initialTicker={data.ticker}
            initialExchange={data.exchange}
            onSaveSuccess={() => {
              setAddTradeOpen(false);
              handleClose(); // Close ticker details after saving transaction
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTradeOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
