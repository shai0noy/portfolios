// src/components/PortfolioManager.tsx
import { useState } from 'react';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Paper, Alert, Snackbar, Grid, Divider 
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { type Portfolio, PORTFOLIO_TEMPLATES } from '../lib/types';
import { addPortfolio } from '../lib/sheets';

interface Props {
  sheetId: string;
  onSuccess: () => void;
}

export function PortfolioManager({ sheetId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Form State
  const [template, setTemplate] = useState('');
  const [p, setP] = useState<Partial<Portfolio>>({
    id: '', name: '', currency: 'ILS',
    cgt: 0.25, incTax: 0,
    mgmtVal: 0, mgmtType: 'Percentage', mgmtFreq: 'Yearly',
    commRate: 0.001, commMin: 0, commMax: 0,
    divPolicy: 'Cash (Taxed)', divCommRate: 0
  });

  const handleTemplate = (tKey: string) => {
    setTemplate(tKey);
    const temp = PORTFOLIO_TEMPLATES[tKey];
    if (temp) {
      setP(prev => ({ ...prev, ...temp }));
    }
  };

  const handleSubmit = async () => {
    if (!p.id || !p.name) {
      alert("ID and Name are required");
      return;
    }
    setLoading(true);
    try {
      // Cast partial to full Portfolio for saving (defaults handled above)
      await addPortfolio(sheetId, p as Portfolio);
      setMsg('Portfolio Created!');
      setP({ id: '', name: '' }); // Clear ID to prevent dupes
      onSuccess(); // Refresh parent list
    } catch (e) {
      console.error(e);
      alert('Error creating portfolio');
    } finally {
      setLoading(false);
    }
  };

  // Helper to update state
  const set = (field: keyof Portfolio, val: any) => setP(prev => ({ ...prev, [field]: val }));

  return (
    <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h6" fontWeight="bold" color="primary" gutterBottom>
        Create New Portfolio
      </Typography>

      <Box bgcolor="#f8f9fa" p={2} borderRadius={1} mb={3} border="1px solid #eee">
        <FormControl fullWidth size="small">
          <InputLabel>Load Template</InputLabel>
          <Select value={template} label="Load Template" onChange={e => handleTemplate(e.target.value)}>
            <MenuItem value="">-- Select --</MenuItem>
            <MenuItem value="std_il">🇮🇱 Standard IL (Bank)</MenuItem>
            <MenuItem value="std_us">🇺🇸 Standard US (Broker)</MenuItem>
            <MenuItem value="pension">☂️ Pension / Gemel</MenuItem>
            <MenuItem value="rsu">🏢 RSU (Income Taxed)</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={2}>
        {/* IDENTITY */}
        <Grid item xs={12}><Typography variant="subtitle2" color="primary">IDENTITY</Typography></Grid>
        <Grid item xs={4}>
          <TextField fullWidth size="small" label="ID (No Spaces)" value={p.id} onChange={e => set('id', e.target.value)} />
        </Grid>
        <Grid item xs={4}>
          <TextField fullWidth size="small" label="Display Name" value={p.name} onChange={e => set('name', e.target.value)} />
        </Grid>
        <Grid item xs={4}>
           <FormControl fullWidth size="small">
            <InputLabel>Currency</InputLabel>
            <Select value={p.currency} label="Currency" onChange={e => set('currency', e.target.value)}>
              <MenuItem value="ILS">ILS</MenuItem>
              <MenuItem value="USD">USD</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12}><Divider /></Grid>

        {/* FEES */}
        <Grid item xs={12}><Typography variant="subtitle2" color="primary">MANAGEMENT FEES</Typography></Grid>
        <Grid item xs={4}>
          <TextField fullWidth type="number" size="small" label="Value" value={p.mgmtVal} onChange={e => set('mgmtVal', parseFloat(e.target.value))} />
        </Grid>
        <Grid item xs={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Type</InputLabel>
            <Select value={p.mgmtType} label="Type" onChange={e => set('mgmtType', e.target.value)}>
              <MenuItem value="Percentage">Percentage</MenuItem>
              <MenuItem value="Fixed">Fixed</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Frequency</InputLabel>
            <Select value={p.mgmtFreq} label="Frequency" onChange={e => set('mgmtFreq', e.target.value)}>
              <MenuItem value="Monthly">Monthly</MenuItem>
              <MenuItem value="Quarterly">Quarterly</MenuItem>
              <MenuItem value="Yearly">Yearly</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12}><Divider /></Grid>

        {/* COMMISSION */}
        <Grid item xs={12}><Typography variant="subtitle2" color="primary">TRANSACTION COSTS</Typography></Grid>
        <Grid item xs={4}>
          <TextField fullWidth type="number" size="small" label="Rate %" value={p.commRate} onChange={e => set('commRate', parseFloat(e.target.value))} />
        </Grid>
        <Grid item xs={4}>
          <TextField fullWidth type="number" size="small" label="Min Fee" value={p.commMin} onChange={e => set('commMin', parseFloat(e.target.value))} />
        </Grid>
        <Grid item xs={4}>
          <TextField fullWidth type="number" size="small" label="Max Fee" value={p.commMax} onChange={e => set('commMax', parseFloat(e.target.value))} />
        </Grid>

        <Grid item xs={12}><Divider /></Grid>

        {/* TAX & DIV */}
        <Grid item xs={12}><Typography variant="subtitle2" color="primary">TAX & DIVIDENDS</Typography></Grid>
        <Grid item xs={3}>
          <TextField fullWidth type="number" size="small" label="Cap Gains %" value={p.cgt} onChange={e => set('cgt', parseFloat(e.target.value))} />
        </Grid>
        <Grid item xs={3}>
           <TextField fullWidth type="number" size="small" label="Inc. Tax %" value={p.incTax} onChange={e => set('incTax', parseFloat(e.target.value))} />
        </Grid>
        <Grid item xs={6}>
          <FormControl fullWidth size="small">
            <InputLabel>Dividend Policy</InputLabel>
            <Select value={p.divPolicy} label="Dividend Policy" onChange={e => set('divPolicy', e.target.value)}>
              <MenuItem value="Cash (Taxed)">Cash (Taxed)</MenuItem>
              <MenuItem value="Accumulate (Tax-Free)">Accumulate (Tax-Free)</MenuItem>
              <MenuItem value="Accumulate Unvested / Cash Vested">Accumulate Unvested / Cash Vested</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Button 
        variant="contained" fullWidth size="large" sx={{ mt: 4 }}
        startIcon={<SaveIcon />} onClick={handleSubmit} disabled={loading}
      >
        {loading ? 'Creating...' : 'Create Portfolio'}
      </Button>

      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg('')}>
        <Alert severity="success" variant="filled">{msg}</Alert>
      </Snackbar>
    </Paper>
  );
}