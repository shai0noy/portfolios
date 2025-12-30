import { useState, useEffect } from 'react';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Paper, Alert, Snackbar, InputAdornment 
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';
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
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND'>('BUY');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [vestDate, setVestDate] = useState('');
  const [comment, setComment] = useState('');
  
  // Calc Mode: 'manual' | 'total'
  const [calcMode, setCalcMode] = useState('manual');

  useEffect(() => {
    fetchPortfolios(sheetId).then(setPortfolios);
  }, [sheetId]);

  // Calculation Logic
  const handleTotalChange = (val: string) => {
    setTotal(val);
    if (price && parseFloat(price) > 0) {
      setQty((parseFloat(val) / parseFloat(price)).toFixed(4));
    }
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    if (calcMode === 'total' && total) {
      setQty((parseFloat(total) / parseFloat(val)).toFixed(4));
    } else if (calcMode === 'manual' && qty) {
      setTotal((parseFloat(qty) * parseFloat(val)).toFixed(2));
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
    <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h6" gutterBottom fontWeight="bold" color="primary">
        Add Transaction
      </Typography>

      <Box display="flex" gap={2} mb={2}>
        <FormControl fullWidth size="small">
          <InputLabel>Portfolio</InputLabel>
          <Select value={portId} label="Portfolio" onChange={(e) => setPortId(e.target.value)}>
            {portfolios.map(p => (
              <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField 
          type="date" label="Date" size="small" 
          value={date} onChange={e => setDate(e.target.value)} 
          InputLabelProps={{ shrink: true }} 
        />
      </Box>

      <Box display="flex" gap={2} mb={2}>
        <TextField 
          fullWidth size="small" label="Ticker" 
          value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
          InputProps={{
            endAdornment: <InputAdornment position="end"><SearchIcon /></InputAdornment>
          }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Type</InputLabel>
          <Select value={type} label="Type" onChange={(e) => setType(e.target.value as any)}>
            <MenuItem value="BUY">BUY</MenuItem>
            <MenuItem value="SELL">SELL</MenuItem>
            <MenuItem value="DIVIDEND">DIVIDEND</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box bgcolor="#f5f5f5" p={2} borderRadius={2} mb={2}>
        <Box display="flex" justifyContent="space-between" mb={1}>
          <Typography variant="caption" fontWeight="bold">CALCULATION MODE</Typography>
          <Select 
            native size="small" variant="standard" 
            value={calcMode} onChange={e => setCalcMode(e.target.value)}
            sx={{ fontSize: '0.8rem' }}
          >
            <option value="manual">Manual (Qty & Price)</option>
            <option value="total">Total Cost to Qty</option>
          </Select>
        </Box>

        <Box display="flex" gap={2}>
          {calcMode === 'manual' ? (
             <TextField 
               label="Quantity" type="number" size="small" fullWidth
               value={qty} onChange={e => { setQty(e.target.value); if(price) setTotal((parseFloat(e.target.value)*parseFloat(price)).toFixed(2)); }} 
             />
          ) : (
             <TextField 
               label="Total Cost" type="number" size="small" fullWidth
               value={total} onChange={e => handleTotalChange(e.target.value)} 
             />
          )}
          
          <TextField 
            label="Price" type="number" size="small" fullWidth
            value={price} onChange={e => handlePriceChange(e.target.value)} 
          />
        </Box>
        
        <Typography variant="caption" display="block" textAlign="right" mt={1} color="text.secondary">
          Gross Value: {total || 0}
        </Typography>
      </Box>

      <Box display="flex" gap={2} mb={2}>
        <TextField 
           label="Comment" size="small" fullWidth 
           value={comment} onChange={e => setComment(e.target.value)} 
        />
        <TextField 
           label="Vesting Date" type="date" size="small" 
           value={vestDate} onChange={e => setVestDate(e.target.value)}
           InputLabelProps={{ shrink: true }}
        />
      </Box>

      <Button 
        variant="contained" fullWidth size="large" 
        startIcon={<SaveIcon />} onClick={handleSubmit} disabled={loading}
      >
        {loading ? 'Saving...' : 'Save Transaction'}
      </Button>

      <Snackbar 
        open={!!successMsg} autoHideDuration={3000} 
        onClose={() => setSuccessMsg('')}
      >
        <Alert severity="success" variant="filled">{successMsg}</Alert>
      </Snackbar>
    </Paper>
  );
}