// src/components/PortfolioManager.tsx
import { useState } from 'react';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, Snackbar, Grid, Card, CardContent, Tooltip,
  InputAdornment
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
    commRate: 0.001, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0
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
  const set = (field: keyof Portfolio, val: any) => setP((prev: any) => ({ ...prev, [field]: val }));

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="600" color="text.primary">
          Create New Portfolio
        </Typography>
        
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Load Template</InputLabel>
          <Select value={template} label="Load Template" onChange={e => handleTemplate(e.target.value)}>
            <MenuItem value="">-- Select --</MenuItem>
            <MenuItem value="std_il">🇮🇱 Standard IL (Broker/Bank)</MenuItem>
            <MenuItem value="std_us">🇺🇸 Standard US (Broker)</MenuItem>
            <MenuItem value="pension">☂️ Pension / Gemel</MenuItem>
            <MenuItem value="rsu">🏢 RSU (Income Taxed)</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={3}>
        {/* IDENTITY */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                IDENTITY & CURRENCY
              </Typography>
              <Grid container spacing={2} mt={1}>
                <Grid size={{ xs: 6 }}>
                  <Tooltip title="Unique ID (e.g. 'IBKR_US'). No spaces.">
                    <TextField fullWidth size="small" label="ID (No Spaces)" value={p.id} onChange={(e) => set('id', e.target.value)} />
                  </Tooltip>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Currency</InputLabel>
                    <Select value={p.currency} label="Currency" onChange={e => set('currency', e.target.value)}>
                      <MenuItem value="ILS">ILS</MenuItem>
                      <MenuItem value="USD">USD</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField fullWidth size="small" label="Display Name" value={p.name} onChange={e => set('name', e.target.value)} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* FEES */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                 <Typography variant="subtitle2" color="text.secondary">MANAGEMENT FEES</Typography>
                 <Tooltip title="Fees charged by the broker/manager for holding the portfolio.">
                   <InfoOutlinedIcon fontSize="inherit" color="action" />
                 </Tooltip>
              </Box>
              <Grid container spacing={2} mt={0}>
                <Grid size={{ xs: 4 }}>
                  <TextField fullWidth type="number" size="small" label="Value" value={p.mgmtVal} onChange={e => set('mgmtVal', parseFloat(e.target.value))} />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select value={p.mgmtType} label="Type" onChange={e => set('mgmtType', e.target.value)}>
                      <MenuItem value="percentage">Percentage</MenuItem>
                      <MenuItem value="fixed">Fixed</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Freq</InputLabel>
                    <Select value={p.mgmtFreq} label="Frequency" onChange={e => set('mgmtFreq', e.target.value)}>
                      <MenuItem value="monthly">Monthly</MenuItem>
                      <MenuItem value="quarterly">Quarterly</MenuItem>
                      <MenuItem value="yearly">Yearly</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* COMMISSION */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>TRANSACTION COSTS (PER TRADE)</Typography>
              <Grid container spacing={2} mt={1}>
                <Grid size={{ xs: 4 }}>
                  <TextField 
                    fullWidth type="number" size="small" label="Rate %" 
                    value={p.commRate} onChange={e => set('commRate', parseFloat(e.target.value))}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField fullWidth type="number" size="small" label="Min Fee" value={p.commMin} onChange={e => set('commMin', parseFloat(e.target.value))} />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField fullWidth type="number" size="small" label="Max Fee" value={p.commMax} onChange={e => set('commMax', parseFloat(e.target.value))} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* TAX & DIV */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>TAX & DIVIDENDS</Typography>
              <Grid container spacing={2} mt={1}>
                <Grid size={{ xs: 4 }}>
                  <TextField 
                    fullWidth type="number" size="small" label="Cap Gains" 
                    value={p.cgt} onChange={e => set('cgt', parseFloat(e.target.value))}
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                   <TextField 
                     fullWidth type="number" size="small" label="Inc. Tax" 
                     value={p.incTax} onChange={e => set('incTax', parseFloat(e.target.value))}
                     InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                   />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Dividend Policy</InputLabel>
                    <Select value={p.divPolicy} label="Dividend Policy" onChange={e => set('divPolicy', e.target.value)}>
                      <MenuItem value="cash_taxed">Cash (Taxed)</MenuItem>
                      <MenuItem value="accumulate_tax_free">Accumulate (Tax-Free)</MenuItem>
                      <MenuItem value="hybrid_rsu">Accumulate Unvested / Cash Vested</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
           <Button 
            variant="contained" fullWidth size="large" 
            startIcon={<SaveIcon />} onClick={handleSubmit} disabled={loading}
            sx={{ py: 1.5, fontSize: '1rem' }}
          >
            {loading ? 'Creating...' : 'Create Portfolio'}
          </Button>
        </Grid>
      </Grid>

      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg('')}>
        <Alert severity="success" variant="filled" sx={{ width: '100%' }}>{msg}</Alert>
      </Snackbar>
    </Box>
  );
}
