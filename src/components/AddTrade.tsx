import { useState, useEffect } from 'react';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, Snackbar, InputAdornment, Grid, Card, CardContent, Divider, Tooltip 
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Portfolio, Transaction } from '../lib/types';
import { addTransaction, fetchPortfolios } from '../lib/sheets';

interface Props {
  sheetId: string;
}

export function AddTrade({ sheetId }: Props) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState('');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE'>('BUY');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [vestDate, setVestDate] = useState('');
  const [comment, setComment] = useState('');
  
  useEffect(() => {
    fetchPortfolios(sheetId).then(setPortfolios);
  }, [sheetId]);

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
        type,
        qty: parseFloat(qty),
        price: parseFloat(price),
        grossValue: parseFloat(qty) * parseFloat(price),
        vestDate,
        comment
      };

      await addTransaction(sheetId, txn);
      
      setSuccessMsg('Transaction Saved!');
      // Reset critical fields
      setQty(''); setTotal('');
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

      <Grid container spacing={3}>
        {/* General Info */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                GENERAL INFO
              </Typography>
              <Box display="flex" flexDirection="column" gap={2} mt={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Portfolio</InputLabel>
                  <Select value={portId} label="Portfolio" onChange={(e) => setPortId(e.target.value)}>
                    {portfolios.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField 
                  type="date" label="Date" size="small" fullWidth
                  value={date} onChange={e => setDate(e.target.value)} 
                  InputLabelProps={{ shrink: true }} 
                />

                <TextField 
                  fullWidth size="small" label="Ticker" 
                  value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                  InputProps={{
                    endAdornment: <InputAdornment position="end"><SearchIcon fontSize="small" color="action" /></InputAdornment>
                  }}
                />

                <FormControl size="small" fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select value={type} label="Type" onChange={(e) => setType(e.target.value as any)}>
                    <MenuItem value="BUY">Buy</MenuItem>
                    <MenuItem value="SELL">Sell</MenuItem>
                    <MenuItem value="DIVIDEND">Dividend</MenuItem>
                    <MenuItem value="FEE">Fee</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Financials */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                 <Typography variant="subtitle2" color="text.secondary">
                  FINANCIALS
                </Typography>
                <Tooltip title="Enter any two fields (Qty, Price, Total) and the third will be auto-calculated.">
                  <InfoOutlinedIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                </Tooltip>
              </Box>
              
              <Box display="flex" flexDirection="column" gap={2} mt={2}>
                 <Grid container spacing={2}>
                   <Grid size={{ xs: 6 }}>
                     <Tooltip title="Number of shares/units bought or sold.">
                       <TextField 
                         label="Quantity" type="number" size="small" fullWidth
                         value={qty} onChange={e => handleQtyChange(e.target.value)} 
                       />
                     </Tooltip>
                   </Grid>
                   <Grid size={{ xs: 6 }}>
                      <Tooltip title="Price per single share/unit.">
                        <TextField 
                          label="Price" type="number" size="small" fullWidth
                          value={price} onChange={e => handlePriceChange(e.target.value)} 
                        />
                      </Tooltip>
                   </Grid>
                   <Grid size={{ xs: 12 }}>
                     <Tooltip title="Total transaction value (Quantity × Price).">
                       <TextField 
                         label="Total Cost" type="number" size="small" fullWidth
                         value={total} onChange={e => handleTotalChange(e.target.value)} 
                         InputProps={{
                           startAdornment: <InputAdornment position="start">$</InputAdornment> // Generic currency symbol
                         }}
                       />
                     </Tooltip>
                   </Grid>
                 </Grid>

                 <Divider sx={{ my: 1 }} />
                 
                 <Box display="flex" gap={2}>
                    <TextField 
                      label="Comment" size="small" fullWidth 
                      value={comment} onChange={e => setComment(e.target.value)} 
                    />
                    <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                      <TextField 
                        label="Vesting Date" type="date" size="small" 
                        value={vestDate} onChange={e => setVestDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Tooltip>
                 </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Button 
            variant="contained" size="large" fullWidth
            startIcon={<SaveIcon />} onClick={handleSubmit} disabled={loading}
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
