import { useState, useEffect } from 'react';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, Snackbar, InputAdornment, Grid, Card, CardContent, Divider, Tooltip, CircularProgress 
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import type { Portfolio, Transaction } from '../lib/types';
import { addTransaction, fetchPortfolios } from '../lib/sheets';
import { getTickerData } from '../lib/ticker';

interface Props {
  sheetId: string;
  initialTicker?: string;
  initialExchange?: string;
  initialPrice?: string;
  initialCurrency?: string;
  onSaveSuccess?: () => void;
}

// Custom hook for debouncing
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


export const TransactionForm = ({ sheetId, initialTicker, initialExchange, initialPrice, initialCurrency, onSaveSuccess }: Props) => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isPortfoliosLoading, setIsPortfoliosLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState(initialTicker || '');
  const [exchange, setExchange] = useState(initialExchange || '');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE'>('BUY');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>(initialPrice || '');
  const [total, setTotal] = useState<string>('');
  const [vestDate, setVestDate] = useState('');
  const [comment, setComment] = useState('');
  const [commission, setCommission] = useState<string>('');
  const [tax, setTax] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [tickerCurrency, setTickerCurrency] = useState(initialCurrency || '');
  const [priceUnit, setPriceUnit] = useState<'base' | 'agorot' | 'cents'>('base');
  const [foundExchange, setFoundExchange] = useState('');

  const debouncedTicker = useDebounce(ticker, 500);
  
  useEffect(() => {
    setIsPortfoliosLoading(true);
    fetchPortfolios(sheetId).then(ports => {
      setPortfolios(ports);
      if (ports.length > 0 && !portId) {
        setPortId(ports[0].id);
      }
      setIsPortfoliosLoading(false);
    }).catch(() => {
      setIsPortfoliosLoading(false);
      // Handle error if needed
    });
  }, [sheetId, portId]);

  useEffect(() => {
    if (debouncedTicker) {
      const controller = new AbortController();
      const signal = controller.signal;

      setIsPriceLoading(true);
      setPriceError('');
      setDisplayName('');
      setFoundExchange(''); // Reset found exchange
      setPrice(''); // Always clear price on ticker change
      setTickerCurrency(''); // Always clear currency on ticker change
      setPriceUnit('base'); // Reset price unit
      
      let exchangeToFetch = exchange;
      if (!exchangeToFetch) {
        // Deduce exchange for fetching if not set
        exchangeToFetch = /\d/.test(debouncedTicker) ? 'TASE' : 'NASDAQ';
      }
      
      getTickerData(debouncedTicker, exchangeToFetch, signal).then(data => {
        if (!signal.aborted) {
          setIsPriceLoading(false);
          if (data) {
            handlePriceChange(data.price.toString());
            setDisplayName(data.name || '');
            setPriceUnit(data.priceUnit || 'base');
            if (data.priceUnit === 'agorot') {
              setTickerCurrency('ILS');
            } else {
              setTickerCurrency(data.currency || '');
            }
            setFoundExchange(data.exchange || exchangeToFetch);
          } else {
            setPriceError(`Ticker not found on ${exchangeToFetch}`);
          }
        }
      }).catch(err => {
        if (err.name !== 'AbortError') {
          console.error("Error fetching ticker data:", err);
          setIsPriceLoading(false);
          setPriceError('Error fetching ticker data');
        }
      });

      return () => {
        controller.abort();
      };
    } else {
       setDisplayName('');
       setFoundExchange('');
       setPrice('');
       setTickerCurrency('');
    }
  }, [debouncedTicker, exchange]);

  useEffect(() => {
    const selectedPort = portfolios.find(p => p.id === portId);
    if (!selectedPort) return;

    const t = parseFloat(total);
    if (!Number.isFinite(t) || t === 0) {
      setCommission('');
      return;
    }

    if (type === 'BUY' || type === 'SELL') {
      const rate = selectedPort.commRate;
      const min = selectedPort.commMin;
      const max = selectedPort.commMax;
      const rawFee = t * rate;
      const clampedMin = Math.max(rawFee, min);
      const finalFee = max > 0 ? Math.min(clampedMin, max) : clampedMin;
      setCommission(finalFee.toFixed(2));
    } else if (type === 'DIVIDEND') {
      const rate = selectedPort.divCommRate;
      setCommission((t * rate).toFixed(2));
    }
  }, [portId, type, total, portfolios]);


  // Handlers: whenever a field is changed, if one of the other two is present compute the third.
  const EPS = 1e-12;

  const handleQtyChange = (val: string) => {
    setQty(val);
    const q = parseFloat(val);
    const p = parseFloat(price);
    const t = parseFloat(total);
    if (Number.isFinite(q)) {
      if (Number.isFinite(p)) {
        // qty + price -> total
        setTotal((q * p).toFixed(2));
      } else if (Number.isFinite(t) && Math.abs(q) > EPS) {
        // qty + total -> price (keep total, compute price)
        setPrice((t / q).toFixed(4));
      }
    }
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    // Don't set error here, purely input
    const q = parseFloat(qty);
    const p = parseFloat(val);
    const t = parseFloat(total);
    if (Number.isFinite(p)) {
      if (Number.isFinite(q)) {
        // qty + price -> total
        setTotal((q * p).toFixed(2));
      } else if (Number.isFinite(t) && Math.abs(p) > EPS) {
        // price + total -> qty (keep total, compute qty)
        setQty((t / p).toFixed(4));
      }
    }
  };

  const handleTotalChange = (val: string) => {
    setTotal(val);
    const q = parseFloat(qty);
    const p = parseFloat(price);
    const t = parseFloat(val);
    if (Number.isFinite(t)) {
      if (Number.isFinite(p) && Math.abs(p) > EPS) {
        // total + price -> qty (prefer keeping price)
        setQty((t / p).toFixed(4));
      } else if (Number.isFinite(q) && Math.abs(q) > EPS) {
        // total + qty -> price
        setPrice((t / q).toFixed(4));
      }
    }
  };
  
  const handleSubmit = async () => {
    if (!portId || !ticker || !price || !qty) return;
    setLoading(true);
 
    try {
      const q = parseFloat(qty);
      const p = parseFloat(price);
      const t = parseFloat(total);
      
      const txn: Transaction = {
        date,
        portfolioId: portId,
        ticker,
        exchange,
        type,
        qty: q,
        price: p,
        grossValue: Number.isFinite(t) ? t : q * p,
        currency: tickerCurrency,
        vestDate,
        comment,
        commission: parseFloat(commission) || 0,
        tax: parseFloat(tax) || 0,
      };

      await addTransaction(sheetId, txn);
      
      setSuccessMsg('Transaction Saved!');
      // Reset critical fields
      setQty(''); setTotal(''); setCommission(''); setTax(''); setTicker(''); setExchange(''); setDisplayName('');
      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (e) {
      console.error(e);
      alert('Error saving transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 3 }}>
        New Transaction
      </Typography>

      {isPortfoliosLoading ? (
        <Box display="flex" justifyContent="center" alignItems="center" sx={{ minHeight: 200 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          <Grid size={12}>
            <Card variant="outlined">
              <CardContent>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Portfolio</InputLabel>
                      <Select value={portId} label="Portfolio" onChange={(e) => setPortId(e.target.value)}>
                        {portfolios.map(p => (
                          <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField 
                    type="date" label="Date" size="small" fullWidth
                    value={date} onChange={e => setDate(e.target.value)} 
                    InputLabelProps={{ shrink: true }} 
                  />
                </Grid>

                <Grid size={12}>
                  <Divider sx={{ my: 1 }}>Trade Details</Divider>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField 
                    fullWidth size="small" label="Ticker" 
                    value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                    error={!!priceError}
                    helperText={priceError}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {isPriceLoading ? <CircularProgress size={20} /> : <SearchIcon fontSize="small" color="action" />}
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Exchange</InputLabel>
                    <Select value={exchange} label="Exchange" onChange={(e) => setExchange(e.target.value)}>
                      <MenuItem value="">Auto</MenuItem>
                      <MenuItem value="NASDAQ">NASDAQ</MenuItem>
                      <MenuItem value="NYSE">NYSE</MenuItem>
                      <MenuItem value="TASE">TASE</MenuItem>
                      <MenuItem value="ARCA">ARCA</MenuItem>
                      <MenuItem value="BATS">BATS</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Type</InputLabel>
                    <Select value={type} label="Type" onChange={(e) => setType(e.target.value as any)}>
                      <MenuItem value="BUY">Buy</MenuItem>
                      <MenuItem value="SELL">Sell</MenuItem>
                      <MenuItem value="DIVIDEND">Dividend</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {displayName && <Grid size={12}><Typography variant="h6" color="text.secondary">{displayName} <span style={{ fontSize: '0.8rem', color: '#9e9e9e' }}>({foundExchange || exchange})</span></Typography></Grid>}
                
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Tooltip title="Number of shares/units bought or sold.">
                    <TextField 
                      label="Quantity" type="number" size="small" fullWidth
                      value={qty} onChange={e => handleQtyChange(e.target.value)} 
                    />
                  </Tooltip>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                   <Tooltip title={`Price per single share/unit.${priceUnit === 'agorot' ? ' In Agorot.' : ''}`}>
                     <TextField 
                       label="Price" type="number" size="small" fullWidth
                       value={price} 
                       onChange={e => handlePriceChange(e.target.value)} 
                       InputProps={{
                         startAdornment: <InputAdornment position="start">{priceUnit === 'agorot' ? 'ag.' : tickerCurrency}</InputAdornment>,
                         endAdornment: isPriceLoading ? <CircularProgress size={20} /> : null
                       }}
                     />
                   </Tooltip>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Tooltip title="Total transaction value (Quantity × Price).">
                    <TextField 
                      label="Total Cost" type="number" size="small" fullWidth
                      value={total} onChange={e => handleTotalChange(e.target.value)} 
                      InputProps={{
                        startAdornment: <InputAdornment position="start">{tickerCurrency}</InputAdornment>
                      }}
                    />
                  </Tooltip>
                </Grid>
                
                {/* Compact Row for Fees & Vesting */}
                <Grid size={{ xs: 4, sm: 3 }}>
                    <TextField 
                      label="Commission" type="number" size="small" fullWidth
                      value={commission} onChange={e => setCommission(e.target.value)} 
                    />
                </Grid>
                {(type === 'SELL' || type === 'DIVIDEND') && (
                  <Grid size={{ xs: 4, sm: 3 }}>
                    <Tooltip title="Tax on transaction (if applicable).">
                      <TextField 
                        label="Tax %" type="number" size="small" fullWidth
                        value={tax} onChange={e => setTax(e.target.value)}
                      />
                    </Tooltip>
                  </Grid>
                )}
                 <Grid size={{ xs: 12, sm: (type === 'SELL' || type === 'DIVIDEND') ? 6 : 9 }}>
                   <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                     <TextField 
                       label="Vesting Date" type="date" size="small" fullWidth
                       value={vestDate} onChange={e => setVestDate(e.target.value)}
                       InputLabelProps={{ shrink: true }}
                     />
                   </Tooltip>
                 </Grid>

                <Grid size={{ xs: 12 }}>
                    <TextField 
                       label="Comment" size="small" fullWidth 
                       value={comment} onChange={e => setComment(e.target.value)} 
                     />
                 </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Button 
            variant="contained" size="large" fullWidth
            startIcon={<AddCircleOutlineIcon />} onClick={handleSubmit} disabled={loading}
            sx={{ py: 1.5 }}
          >
            {loading ? 'Saving...' : 'Save Transaction'}
          </Button>
        </Grid>
      </Grid>
      )}

      <Snackbar 
        open={!!successMsg} autoHideDuration={3000} 
        onClose={() => setSuccessMsg('')}
      >
        <Alert severity="success" variant="filled" sx={{ width: '100%' }}>{successMsg}</Alert>
      </Snackbar>
    </Box>
  );
}