import { useState, useEffect } from 'react';
import { 
  Box, Button, Typography, TextField, FormControl, InputLabel, Select, MenuItem, 
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableRow, 
  TableCell, TableBody, Alert, Stepper, Step, StepLabel,
  Grid
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import type { Portfolio, Transaction } from '../lib/types';
import { addTransaction, fetchPortfolios } from '../lib/sheets';

interface Props {
  sheetId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STEPS = ['Input Data', 'Map Columns', 'Review & Import'];

export function ImportCSV({ sheetId, open, onClose, onSuccess }: Props) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  // ...
  
  useEffect(() => {
    if (open) {
      fetchPortfolios(sheetId).then(setPortfolios);
    }
  }, [sheetId, open]);

  const [csvText, setCsvText] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    ticker: '', date: '', type: '', qty: '', price: ''
  });
  const [parsedTxns, setParsedTxns] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setCsvText(evt.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return;
    
    // Simple CSV parser (doesn't handle quoted commas well, but sufficient for simple exports)
    const head = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
    
    setHeaders(head);
    setRows(data);
    
    // Auto-guess mapping
    const newMap = { ...mapping };
    head.forEach(h => {
      const lh = h.toLowerCase();
      if (lh.includes('symbol') || lh.includes('ticker')) newMap.ticker = h;
      if (lh.includes('date') && !lh.includes('trade')) newMap.date = h; // Prefer 'Trade Date' if exists?
      if (lh === 'trade date') newMap.date = h;
      if (lh.includes('type') || lh.includes('action')) newMap.type = h;
      if (lh.includes('qty') || lh.includes('quantity') || lh.includes('shares')) newMap.qty = h;
      if (lh.includes('price') || lh.includes('cost')) newMap.price = h;
      if (lh === 'purchase price') newMap.price = h;
    });
    setMapping(newMap);
  };

  const handleNext = () => {
    if (activeStep === 0) {
      if (!csvText || !portfolioId) {
        alert("Please select a portfolio and provide CSV data.");
        return;
      }
      parseCSV(csvText);
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Validate Mapping
      if (!mapping.ticker || !mapping.date || !mapping.qty || !mapping.price) {
        alert("Please map all required fields (Ticker, Date, Qty, Price).");
        return;
      }
      generatePreview();
      setActiveStep(2);
    } else {
      handleImport();
    }
  };

  const generatePreview = () => {
    const txns: Transaction[] = rows.map(r => {
      const getVal = (field: string) => {
        const idx = headers.indexOf(mapping[field]);
        return idx >= 0 ? r[idx] : '';
      };

      // Date Parsing (handle 20241025 or 2025/12/30)
      let rawDate = getVal('date');
      let isoDate = new Date().toISOString().split('T')[0];
      
      // Try to parse YYYYMMDD
      if (rawDate.match(/^\d{8}$/)) {
        isoDate = `${rawDate.substring(0,4)}-${rawDate.substring(4,6)}-${rawDate.substring(6,8)}`;
      } else {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) isoDate = d.toISOString().split('T')[0];
      }

      // Type Parsing
      const rawType = getVal('type').toUpperCase();
      let type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' = 'BUY'; // Default
      if (rawType.includes('SELL') || rawType.includes('SOLD')) type = 'SELL';
      if (rawType.includes('DIV')) type = 'DIVIDEND';
      if (rawType.includes('FEE')) type = 'FEE';

      const qty = parseFloat(getVal('qty'));
      const price = parseFloat(getVal('price'));

      return {
        date: isoDate,
        portfolioId,
        ticker: getVal('ticker').toUpperCase(),
        type,
        qty: isNaN(qty) ? 0 : Math.abs(qty), // Store absolute qty, logic handles sign
        price: isNaN(price) ? 0 : price,
        grossValue: (isNaN(qty) ? 0 : Math.abs(qty)) * (isNaN(price) ? 0 : price),
        comment: 'Imported via CSV'
      };
    }).filter(t => t.ticker && t.qty > 0); // Filter invalid rows

    setParsedTxns(txns);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      // Process in chunks to avoid rate limits? 
      // For now, sequential await to be safe with GAPI
      for (const t of parsedTxns) {
        await addTransaction(sheetId, t);
      }
      setImporting(false);
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Error importing transactions. Check console.");
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Transactions from CSV</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 4, mt: 1 }}>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {activeStep === 0 && (
          <Box display="flex" flexDirection="column" gap={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Target Portfolio</InputLabel>
              <Select value={portfolioId} label="Target Portfolio" onChange={e => setPortfolioId(e.target.value)}>
                {portfolios.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />} sx={{ mb: 1 }}>
                Upload CSV File
                <input type="file" hidden accept=".csv" onChange={handleFileChange} />
              </Button>
              <Typography variant="caption" display="block" color="text.secondary">
                Or paste CSV content below:
              </Typography>
              <TextField
                multiline rows={6} fullWidth 
                placeholder="Symbol,Date,Type,Qty,Price..."
                value={csvText} onChange={e => setCsvText(e.target.value)}
                sx={{ fontFamily: 'monospace' }}
              />
            </Box>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Typography gutterBottom>Map CSV Columns to Transaction Fields:</Typography>
            <Grid container spacing={2}>
              {['ticker', 'date', 'type', 'qty', 'price'].map(field => (
                <Grid size={{ xs: 6 }} key={field}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{field.toUpperCase()}</InputLabel>
                    <Select 
                      value={mapping[field]} 
                      label={field.toUpperCase()}
                      onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                    >
                      <MenuItem value="">-- Ignore --</MenuItem>
                      {headers.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              ))}
            </Grid>
            
            <Alert severity="info" sx={{ mt: 3 }}>
              Default Type is "BUY" if not mapped or unrecognized.
            </Alert>
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Ready to import {parsedTxns.length} transactions:
            </Typography>
            <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #eee' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Ticker</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedTxns.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>{t.ticker}</TableCell>
                      <TableCell>{t.type}</TableCell>
                      <TableCell align="right">{t.qty}</TableCell>
                      <TableCell align="right">{t.price.toFixed(2)}</TableCell>
                      <TableCell align="right">{t.grossValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button onClick={() => setActiveStep(p => p - 1)} disabled={activeStep === 0}>Back</Button>
        <Button onClick={handleNext} variant="contained" disabled={importing}>
          {activeStep === 2 ? (importing ? 'Importing...' : 'Import') : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
