import { useState, useEffect } from 'react';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, Snackbar, InputAdornment, Grid, Card, CardContent, Divider, Tooltip, CircularProgress 
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Portfolio, Transaction } from '../lib/types';
import { addTransaction, fetchPortfolios } from '../lib/sheets';
import { getTickerData } from '../lib/ticker';

interface Props {
  sheetId: string;
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


export const AddTrade = ({ sheetId }: Props) => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE'>('BUY');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [vestDate, setVestDate] = useState('');
  const [comment, setComment] = useState('');
  const [commission, setCommission] = useState<string>('');
  const [tax, setTax] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [tickerCurrency, setTickerCurrency] = useState('');
  const [commissionInfo, setCommissionInfo] = useState('');

  const debouncedTicker = useDebounce(ticker, 500);
  
  useEffect(() => {
    fetchPortfolios(sheetId).then(ports => {
      setPortfolios(ports);
      if (ports.length > 0 && !portId) {
        setPortId(ports[0].id);
      }
    });
  }, [sheetId, portId]);

  useEffect(() => {
    if (debouncedTicker && exchange === '') { // Only deduce if not manually set
      if (/\d/.test(debouncedTicker)) {
        setExchange('TASE');
      } else {
        setExchange('NASDAQ');
      }
    }
  }, [debouncedTicker, exchange]);

  useEffect(() => {
    if (debouncedTicker && exchange) {
      setIsPriceLoading(true);
      setPriceError('');
      setDisplayName('');
      getTickerData(debouncedTicker, exchange).then(data => {
        setIsPriceLoading(false);
        if (data) {
          handlePriceChange(data.price.toString());
          setDisplayName(data.name || '');
          setTickerCurrency(data.currency || '');
          if(data.exchange) setExchange(data.exchange);
        } else {
          setPriceError('Ticker not found');
        }
      });
    }
  }, [debouncedTicker, exchange]);

  useEffect(() => {
    const selectedPort = portfolios.find(p => p.id === portId);
    if (!selectedPort) return;

    const t = parseFloat(total);
    if (!Number.isFinite(t) || t === 0) {
      setCommission('');
      setCommissionInfo('');
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
      setCommissionInfo(`Rate: ${rate*100}%, Min: ${min}, Max: ${max > 0 ? max : 'N/A'}`);
    } else if (type === 'DIVIDEND') {
      const rate = selectedPort.divCommRate;
      setCommission((t * rate).toFixed(2));
      setCommissionInfo(`Rate: ${rate*100}%`);
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
    setPriceError('');
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
      const txn: Transaction = {
        date,
        portfolioId: portId,
        ticker,
        exchange,
        type,
        qty: parseFloat(qty),
        price: parseFloat(price),
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

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Portfolio</InputLabel>
                    <Select value={portId} label="Portfolio" onChange={(e) => setPortId(e.target.value)}>
                      {portfolios.map(p => (
                        <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    type="date" label="Date" size="small" fullWidth
                    value={date} onChange={e => setDate(e.target.value)} 
                    InputLabelProps={{ shrink: true }} 
                  />
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }}>Trade Details</Divider>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField 
                    fullWidth size="small" label="Ticker" 
                    value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {isPriceLoading ? <CircularProgress size={20} /> : <SearchIcon fontSize="small" color="action" />}
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
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
                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Type</InputLabel>
                    <Select value={type} label="Type" onChange={(e) => setType(e.target.value as any)}>
                      <MenuItem value="BUY">Buy</MenuItem>
                      <MenuItem value="SELL">Sell</MenuItem>
                      <MenuItem value="DIVIDEND">Dividend</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {displayName && <Grid item xs={12}><Typography variant="h6" color="text.secondary">{displayName} <span style={{ fontSize: '0.8rem', color: '#9e9e9e' }}>({exchange})</span></Typography></Grid>}
                
                <Grid item xs={6} sm={4}>
                  <Tooltip title="Number of shares/units bought or sold.">
                    <TextField 
                      label="Quantity" type="number" size="small" fullWidth
                      value={qty} onChange={e => handleQtyChange(e.target.value)} 
                    />
                  </Tooltip>
                </Grid>
                <Grid item xs={6} sm={4}>
                   <Tooltip title="Price per single share/unit.">
                     <TextField 
                       label="Price" type="number" size="small" fullWidth
                       value={price} 
                       onChange={e => handlePriceChange(e.target.value)} 
                       error={!!priceError}
                       helperText={priceError}
                       InputProps={{
                         startAdornment: <InputAdornment position="start">{tickerCurrency}</InputAdornment>,
                         endAdornment: isPriceLoading ? <CircularProgress size={20} /> : null
                       }}
                     />
                   </Tooltip>
                </Grid>
                <Grid item xs={12} sm={4}>
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
                <Grid item xs={6}>
                    <TextField 
                      label="Commission" type="number" size="small" fullWidth
                      value={commission} onChange={e => setCommission(e.target.value)} 
                    />
                </Grid>
                {(type === 'SELL' || type === 'DIVIDEND') && <Grid item xs={6}>
                  <Tooltip title="Tax on transaction (if applicable).">
                    <TextField 
                      label="Tax %" type="number" size="small" fullWidth
                      value={tax} onChange={e => setTax(e.target.value)}
                    />
                  </Tooltip>
                </Grid>}
                <Grid item xs={6}>
                    <TextField 
                       label="Comment" size="small" fullWidth 
                       value={comment} onChange={e => setComment(e.target.value)} 
                     />
                 </Grid>
                 <Grid item xs={6}>
                   <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                     <TextField 
                       label="Vesting Date" type="date" size="small" fullWidth
                       value={vestDate} onChange={e => setVestDate(e.target.value)}
                       InputLabelProps={{ shrink: true }}
                     />
                   </Tooltip>
                 </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Button 
            variant="contained" size="large" fullWidth
            startIcon={<AddCircleOutlineIcon />} onClick={handleSubmit} disabled={loading}
            sx={{ py: 1.5 }}
          >
            {loading ? 'Saving...' : 'Save Transaction'}
          </Button>
        </Grid>
      </Grid>

      <Snackbar 
        open={!!successMsg} autoHideDuration={3000} 
        onClose={() => setSuccessMsg('')}
      >
        <Alert severity="success" variant="filled" sx={{ width: '100%' }}>{successMsg}</Alert>
      </Snackbar>
    </Box>
  );
}
