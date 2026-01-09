import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, InputAdornment, Grid, Card, CardContent, Divider, Tooltip, CircularProgress, Chip 
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import DashboardIcon from '@mui/icons-material/Dashboard';
import type { Portfolio, Transaction, PriceUnit } from '../lib/types';
import { addTransaction, fetchPortfolios } from '../lib/sheets';
import { getTickerData, type TickerData } from '../lib/fetching';
import { TickerSearch } from './TickerSearch';

interface Props {
  sheetId: string;
  onSaveSuccess?: () => void;
}

export const TransactionForm = ({ sheetId, onSaveSuccess }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { initialTicker?: string, initialExchange?: string, initialPrice?: string, initialCurrency?: string } | null;

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isPortfoliosLoading, setIsPortfoliosLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Form State
  const [selectedTicker, setSelectedTicker] = useState<(TickerData & { symbol: string }) | null>(null);
  const [showForm, setShowForm] = useState(!!locationState?.initialTicker);
  // The date state is stored in 'yyyy-MM-dd' format, which is required by the <input type="date"> element.
  // The conversion to Google Sheets format ('dd/MM/yyyy') happens in `addTransaction` on submission.
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState(locationState?.initialTicker || '');
  const [exchange, setExchange] = useState(locationState?.initialExchange || '');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE'>('BUY');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>(locationState?.initialPrice || '');
  const [total, setTotal] = useState<string>('');
  const [vestDate, setVestDate] = useState('');
  const [comment, setComment] = useState('');
  const [commission, setCommission] = useState<string>('');
  const [tax, setTax] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [tickerCurrency, setTickerCurrency] = useState(locationState?.initialCurrency || '');
  const [priceUnit, setPriceUnit] = useState<'base' | 'agorot' | 'cents'>('base');

  useEffect(() => {
    if (locationState?.initialTicker) {
      const fetchData = async () => {
        setLoading(true);
        const data = await getTickerData(locationState.initialTicker!, locationState.initialExchange || '');
        if (data) {
          const combinedData = { ...data, symbol: locationState.initialTicker!, exchange: data.exchange || locationState.initialExchange || '' };
          setSelectedTicker(combinedData);
          setDisplayName(data.name || '');
          setPrice(data.price?.toString() || '');
          setPriceUnit((data.priceUnit || 'base') as PriceUnit);
          if (data.priceUnit === 'agorot') setTickerCurrency('ILS');
          else setTickerCurrency(data.currency || '');
          setExchange(data.exchange || locationState.initialExchange || '');
          setTicker(locationState.initialTicker!)
          setShowForm(true);
        } else {
          setPriceError(`Ticker not found on ${locationState.initialExchange}`);
          setSelectedTicker(null);
          setShowForm(false);
        }
        setLoading(false);
      };
      fetchData();
    }
  }, [locationState]);
  
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
    });
  }, [sheetId, portId]);

  const handleTickerSelect = (selected: TickerData & { symbol: string }) => {
    setSelectedTicker(selected);
    setTicker(selected.symbol);
    setDisplayName(selected.name || '');
    setExchange(selected.exchange || '');
    setShowForm(false); // Hide form, show summary card
    setPriceError('');
    if (selected.price) {
      setPrice(selected.price.toString());
      setPriceUnit((selected.priceUnit || 'base') as PriceUnit);
      if (selected.priceUnit === 'agorot') {
        setTickerCurrency('ILS');
      } else {
        setTickerCurrency(selected.currency || '');
      }
    } else {
      setPrice('');
      setTickerCurrency('');
      setPriceUnit('base');
    }
    setQty(''); // Clear form fields for new entry
    setTotal('');
    setComment('');
    setCommission('');
    setTax('');
    setVestDate('');
    setType('BUY');
    setDate(new Date().toISOString().split('T')[0]);
    setSaveSuccess(false);
  };

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


  const EPS = 1e-12;

  const handleQtyChange = (val: string) => {
    setQty(val);
    const q = parseFloat(val);
    const p = parseFloat(price);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      setTotal((q * p).toFixed(2));
    }
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    const q = parseFloat(qty);
    const p = parseFloat(val);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      setTotal((q * p).toFixed(2));
    }
  };

  const handleTotalChange = (val: string) => {
    setTotal(val);
    const q = parseFloat(qty);
    const p = parseFloat(price);
    const t = parseFloat(val);
    if (Number.isFinite(t)) {
      if (Number.isFinite(p) && Math.abs(p) > EPS) {
        setQty((t / p).toFixed(4));
      } else if (Number.isFinite(q) && Math.abs(q) > EPS) {
        setPrice((t / q).toFixed(4));
      }
    }
  };
  
  const handleSubmit = async () => {
    if (!portId || !ticker || !price || !qty) return;
    setLoading(true);
    setSaveSuccess(false);
 
    try {
      const q = parseFloat(qty);
      const p = parseFloat(price);
      
      const txn: Transaction = {
        date,
        portfolioId: portId,
        ticker,
        exchange,
        type,
        Original_Qty: q,
        Original_Price: p,
        Orig_Open_Price_At_Creation_Date: selectedTicker?.openPrice || 0,
        currency: tickerCurrency,
        vestDate,
        comment,
        commission: parseFloat(commission) || 0,
        tax: parseFloat(tax) || 0,
      };

      await addTransaction(sheetId, txn);
      setSaveSuccess(true);
      if (onSaveSuccess) {
        onSaveSuccess();
      }
      // Clear form for next entry of the SAME ticker
      setQty(''); 
      setTotal(''); 
      setCommission(''); 
      setTax(''); 
      setComment('');
      setVestDate('');
      setType('BUY');
      setDate(new Date().toISOString().split('T')[0]);
      setShowForm(false); // Hide form, show summary card again
    } catch (e) {
      console.error(e);
      alert('Error saving transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleViewTicker = () => {
    if (selectedTicker) {
      navigate(`/ticker/${exchange}/${ticker}`);
    }
  };

  const handleSearchAgain = () => {
    setSelectedTicker(null);
    setTicker('');
    setExchange('');
    setDisplayName('');
    setPrice('');
    setTickerCurrency('');
    setShowForm(false);
    setSaveSuccess(false);
    navigate('/transaction', { replace: true, state: {} }); // Clear location state
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
        New Transaction
      </Typography>

      {selectedTicker && (
         <Button variant="text" startIcon={<SearchIcon />} onClick={handleSearchAgain} sx={{ mb: 2 }}>
           Back to Search
         </Button>
      )}

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveSuccess(false)} action={
          <Button color="inherit" size="small" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
        }>
          Transaction for {ticker} saved!
        </Alert>
      )}

      <Grid container spacing={2}>
        {(!selectedTicker && !locationState?.initialTicker) && (
          <Grid item xs={12}>
            <TickerSearch 
              onTickerSelect={handleTickerSelect} 
              portfolios={portfolios} 
              isPortfoliosLoading={isPortfoliosLoading}
            />
          </Grid>
        )}

        {(selectedTicker) && (
          <Grid item xs={12}>
            <Card variant='outlined' sx={{ mt: 0, p: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>{displayName || selectedTicker.name}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <Chip label={`${exchange}: ${ticker}`} color="primary" variant="outlined" />
                  {price && (
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {priceUnit === 'agorot' ? 'ag.' : tickerCurrency} {price}
                    </Typography>
                  )}
                </Box>

                {priceError && <Alert severity="error" sx={{ mb: 2 }}>{priceError}</Alert>}

                {!showForm && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => { setShowForm(true); setSaveSuccess(false); }}>Add Another for {ticker}</Button>
                    <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={handleViewTicker}>View Ticker</Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {showForm && selectedTicker && (
          <>
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ mt: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Portfolio</InputLabel>
                        <Select value={portId} label="Portfolio" onChange={(e) => setPortId(e.target.value)} disabled={isPortfoliosLoading}>
                          {isPortfoliosLoading ? <MenuItem value="">Loading...</MenuItem> : portfolios.map(p => (
                            <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField 
                        type="date" label="Date" size="small" fullWidth
                        value={date} onChange={e => setDate(e.target.value)} 
                        InputLabelProps={{ shrink: true }} 
                      />
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
                    <Grid item xs={12}><Divider sx={{ my: 1 }}>Trade Details</Divider></Grid>
                    <Grid item xs={6} sm={4}>
                      <Tooltip title="Number of shares/units bought or sold.">
                        <TextField label="Quantity" type="number" size="small" fullWidth value={qty} onChange={e => handleQtyChange(e.target.value)} />
                      </Tooltip>
                    </Grid>
                    <Grid item xs={6} sm={4}>
                       <Tooltip title={`Price per single share/unit.${priceUnit === 'agorot' ? ' In Agorot.' : ''}`}>
                         <TextField 
                           label="Price" type="number" size="small" fullWidth
                           value={price} 
                           onChange={e => handlePriceChange(e.target.value)} 
                           InputProps={{ startAdornment: <InputAdornment position="start">{priceUnit === 'agorot' ? 'ag.' : tickerCurrency}</InputAdornment> }}
                         />
                       </Tooltip>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Tooltip title="Total transaction value (Quantity × Price).">
                        <TextField 
                          label="Total Cost" type="number" size="small" fullWidth
                          value={total} onChange={e => handleTotalChange(e.target.value)} 
                          InputProps={{ startAdornment: <InputAdornment position="start">{tickerCurrency}</InputAdornment> }}
                        />
                      </Tooltip>
                    </Grid>
                    <Grid item xs={4} sm={3}>
                        <TextField label="Commission" type="number" size="small" fullWidth value={commission} onChange={e => setCommission(e.target.value)} />
                    </Grid>
                    {(type === 'SELL' || type === 'DIVIDEND') && (
                      <Grid item xs={4} sm={3}>
                        <Tooltip title="Tax on transaction (if applicable).">
                          <TextField label="Tax %" type="number" size="small" fullWidth value={tax} onChange={e => setTax(e.target.value)} />
                        </Tooltip>
                      </Grid>
                    )}
                     <Grid item xs={12} sm={(type === 'SELL' || type === 'DIVIDEND') ? 6 : 9}>
                       <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                         <TextField label="Vesting Date" type="date" size="small" fullWidth value={vestDate} onChange={e => setVestDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                       </Tooltip>
                     </Grid>
                    <Grid item xs={12}>
                        <TextField label="Comment" size="small" fullWidth value={comment} onChange={e => setComment(e.target.value)} />
                     </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Button variant="contained" size="large" fullWidth startIcon={<AddCircleOutlineIcon />} onClick={handleSubmit} disabled={loading}>
                {loading ? 'Saving...' : 'Save Transaction'}
              </Button>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};