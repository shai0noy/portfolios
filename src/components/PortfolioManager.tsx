// src/components/PortfolioManager.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, Snackbar, Grid, Card, CardContent, Tooltip,
  InputAdornment,
  TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper,
  CircularProgress
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { type Portfolio, PORTFOLIO_TEMPLATES, Currency } from '../lib/types';
import { addPortfolio, fetchPortfolios, updatePortfolio } from '../lib/sheets/index';

const taxPolicyNames: { [key: string]: string } = {
  REAL_GAIN: "Israel (Real Gain - Inflation Adjusted)",
  NOMINAL_GAIN: "Fixed (Nominal Gain)",
  TAX_FREE: "Tax Free",
  PENSION: "Pension (Income Taxed)"
};

interface Props {
  sheetId: string;
  onSuccess: () => void;
}

export function PortfolioManager({ sheetId, onSuccess }: Props) {
  const { portfolioId } = useParams<{ portfolioId?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [idDirty, setIdDirty] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [editMode, setEditMode] = useState<boolean>(!!portfolioId);
  const [editingPortfolio, setEditingPortfolio] = useState<Partial<Portfolio> | null>(null);
  const [showNewPortfolioForm, setShowNewPortfolioForm] = useState(!!portfolioId);

  // Form State
  const [template, setTemplate] = useState('');
  const [p, setP] = useState<Partial<Portfolio>>({
    id: '', name: '', currency: Currency.ILS,
    cgt: 0.25, incTax: 0,
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
    commRate: 0.001, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0,
    taxPolicy: 'REAL_GAIN'
  });

  useEffect(() => {
    loadPortfolios();
  }, [sheetId]);

  useEffect(() => {
    if (portfolioId && portfolios.length > 0) {
      const portToEdit = portfolios.find(p => p.id === portfolioId);
      if (portToEdit) {
        setEditingPortfolio(portToEdit);
        setP(portToEdit);
        setEditMode(true);
        setIdDirty(true);
        setTemplate('');
        setShowNewPortfolioForm(true); // Show the form section
      } else {
        alert(`Portfolio with ID "${portfolioId}" not found.`);
        navigate('/portfolios');
      }
    } else if (!portfolioId) { // Reset form only if not in edit mode from URL
      setEditMode(false);
      setEditingPortfolio(null);
      setShowNewPortfolioForm(false);
      setP({
        id: '', name: '', currency: Currency.ILS,
        cgt: 0.25, incTax: 0,
        mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
        commRate: 0.001, commMin: 0, commMax: 0,
        divPolicy: 'cash_taxed', divCommRate: 0,
        taxPolicy: 'REAL_GAIN'
      });
      setIdDirty(false);
    }
  }, [portfolioId, portfolios, navigate]);

  const loadPortfolios = async () => {
    setLoading(true);
    try {
      const ports = await fetchPortfolios(sheetId);
      setPortfolios(ports);
    } catch (e) {
      console.error("Error loading portfolios", e);
      alert("Could not load existing portfolios.");
    } finally {
      setLoading(false);
    }
  };

  const handleTemplate = (tKey: string) => {
    setTemplate(tKey);
    const temp = PORTFOLIO_TEMPLATES[tKey];
    if (temp) {
      setP(prev => ({ ...prev, ...temp }));
    }
  };

  const handleNameChange = (val: string) => {
    setP(prev => {
      const updates: any = { name: val };
      if (!idDirty) {
        // Auto-generate ID from name slug
        updates.id = val.trim().toLowerCase()
          .replace(/\s+/g, '-') // Replace spaces with -
          .replace(/[^a-z0-9-]/g, ''); // Remove all non-alphanumeric except dash
      }
      return { ...prev, ...updates };
    });
  };

  const handleIdChange = (val: string) => {
    setIdDirty(true);
    const sanitizedId = val.replace(/\s+/g, '-');
    setP(prev => ({ ...prev, id: sanitizedId }));
  };



  const cancelEdit = () => {
    setEditMode(false);
    setEditingPortfolio(null);
    setP({
      id: '', name: '', currency: Currency.ILS,
      cgt: 0.25, incTax: 0,
      mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
      commRate: 0.001, commMin: 0, commMax: 0,
      divPolicy: 'cash_taxed', divCommRate: 0,
      taxPolicy: 'REAL_GAIN'
    });
    setIdDirty(false);
    setShowNewPortfolioForm(false);
    navigate('/portfolios');
  };

  const handleSubmit = async () => {
    if (!p.id || !p.name) {
      alert("ID and Name are required");
      return;
    }
    setLoading(true);
    try {
      if (editMode) {
        await updatePortfolio(sheetId, p as Portfolio);
        setMsg('Portfolio Updated!');
        setEditMode(false);
        setEditingPortfolio(null);
      } else {
        await addPortfolio(sheetId, p as Portfolio);
        setMsg('Portfolio Created!');
        setShowNewPortfolioForm(false); // Hide form after creation
      }
      setP({ id: '', name: '' }); // Reset form only after creation
      setIdDirty(false);
      loadPortfolios(); // Reload the list
      onSuccess();
    } catch (e) {
      console.error(e);
      alert(`Error ${editMode ? 'updating' : 'creating'} portfolio`);
    } finally {
      setLoading(false);
    }
  };

  // Helper to update state
  const set = (field: keyof Portfolio, val: any) => setP((prev: any) => ({ ...prev, [field]: val }));

  useEffect(() => {
    const updates: Partial<Portfolio> = {};
    let needsUpdate = false;

    // Auto-adjust tax values based on policies
    if (p.taxPolicy === 'TAX_FREE') {
      if (p.cgt !== 0) { updates.cgt = 0; needsUpdate = true; }
      if (p.incTax !== 0) { updates.incTax = 0; needsUpdate = true; }
      if (p.divCommRate !== 0) { updates.divCommRate = 0; needsUpdate = true; }
    } else if (p.taxPolicy === 'PENSION') {
      // For pension, CGT is simply the income tax rate
      if (p.cgt !== p.incTax) {
        updates.cgt = p.incTax;
        needsUpdate = true;
      }
    }

    // Auto-adjust dividend fee based on dividend policy
    if (p.divPolicy !== 'cash_taxed' && p.divCommRate !== 0) {
      updates.divCommRate = 0; // If not taxed, fee is 0
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      setP(prev => ({ ...prev, ...updates }));
    }
  }, [p.taxPolicy, p.incTax, p.cgt, p.divPolicy, p.divCommRate]);

  // Helper for debounced numeric fields
  const NumericField = ({ label, field, tooltip, disabled, showCurrency }: { label: string, field: keyof Portfolio, tooltip?: string, disabled?: boolean, showCurrency?: boolean }) => {
    // This state is to allow for typing trailing decimals, e.g. "25."
    const [localDisplay, setLocalDisplay] = useState<string | null>(null);

    const val = p[field] as number;
    const displayVal = Number.isFinite(val) ? val.toString() : '';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;

      if (v === '' || v === '-') {
        setLocalDisplay(v);
        set(field, 0);
        return;
      }
      
      // Allow trailing decimal
      if (v.endsWith('.')) {
        setLocalDisplay(v);
      } else {
        setLocalDisplay(null);
      }
      
      let num = parseFloat(v);
      if (isNaN(num)) return;

      if (num < 0) num = 0;
      set(field, num);
    };

    const textField = (
        <TextField 
          fullWidth type="number" size="small" label={label} 
          value={localDisplay !== null ? localDisplay : displayVal}
          disabled={disabled}
          onChange={handleChange}
          onBlur={() => setLocalDisplay(null)}
          InputProps={{ 
            endAdornment: showCurrency ? <InputAdornment position="end">{p.currency}</InputAdornment> : null 
          }}
        />
    );

    if (tooltip) {
      return (
        <Tooltip title={tooltip} placement="top" arrow>
          {textField}
        </Tooltip>
      );
    }
    return textField;
  };

  // Helper for Percentage Fields (Display 0-100, Store 0.0-1.0)
  const PercentageField = ({ label, field, tooltip, disabled }: { label: string, field: keyof Portfolio, tooltip?: string, disabled?: boolean }) => {
    // This state is to allow for typing trailing decimals, e.g. "25."
    const [localDisplay, setLocalDisplay] = useState<string | null>(null);

    const val = (p[field] as number) * 100;
    const displayVal = Number.isFinite(val) ? parseFloat(val.toFixed(4)).toString() : '';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;

      if (v === '' || v === '-') {
        setLocalDisplay(v);
        set(field, 0);
        return;
      }
      
      // Allow trailing decimal
      if (v.endsWith('.')) {
        setLocalDisplay(v);
      } else {
        setLocalDisplay(null);
      }
      
      let num = parseFloat(v);
      if (isNaN(num)) return;

      if (num > 100) num = 100;
      if (num < 0) num = 0;
      set(field, num / 100);
    };

    const textField = (
        <TextField 
          fullWidth type="number" size="small" label={label} 
          value={localDisplay !== null ? localDisplay : displayVal}
          disabled={disabled}
          onChange={handleChange}
          onBlur={() => setLocalDisplay(null)}
          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
        />
    );

    if (tooltip) {
      return (
        <Tooltip title={tooltip} placement="top" arrow>
          {textField}
        </Tooltip>
      );
    }
    return textField;
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {(showNewPortfolioForm || editMode) ? (
        <Box mb={4}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h5" fontWeight="600" color="text.primary">
              {editMode ? `Editing Portfolio: ${editingPortfolio?.name}` : 'Create New Portfolio'}
            </Typography>
            
            {!editMode && (
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Load Template</InputLabel>
                <Select value={template} label="Load Template" onChange={e => handleTemplate(e.target.value)}>
                  <MenuItem value="">-- Select Template --</MenuItem>
                  <MenuItem value="std_il">Standard IL (Broker/Bank)</MenuItem>
                  <MenuItem value="std_us">Standard US (Broker)</MenuItem>
                  <MenuItem value="pension">Pension</MenuItem>
                  <MenuItem value="hishtalmut">Hishtalmut / Gemmel</MenuItem>
                  <MenuItem value="rsu">RSU (Income Taxed)</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>

          <Grid container spacing={3}>
            {/* IDENTITY */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    PORTFOLIO IDENTITY
                  </Typography>
                  <Grid container spacing={3} mt={2}>
                    <Grid item xs={12}>
                      <TextField fullWidth size="small" label="Display Name" value={p.name} onChange={e => handleNameChange(e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <Tooltip title="Unique System ID (auto-generated). No spaces.">
                        <TextField fullWidth size="small" label="ID" value={p.id} onChange={(e) => handleIdChange(e.target.value)} disabled={editMode} />
                      </Tooltip>
                    </Grid>
                    <Grid item xs={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Currency</InputLabel>
                        <Select value={p.currency} label="Currency" onChange={e => set('currency', e.target.value)}>
                          <MenuItem value="ILS">ILS</MenuItem>
                          <MenuItem value="USD">USD</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* TAX & DIV */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>TAXATION & DIVIDENDS</Typography>
                  <Grid container spacing={3} mt={2}>
                     <Grid item xs={12}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Cap. Gain Tax Policy</InputLabel>
                        <Select 
                          value={p.taxPolicy} 
                          label="Cap. Gain Tax Policy" 
                          onChange={e => set('taxPolicy', e.target.value)}
                        >
                          {Object.entries(taxPolicyNames).map(([key, name]) => (
                            <MenuItem key={key} value={key}>{name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <PercentageField label="Gains Tax" field="cgt" tooltip="Capital Gains Tax" disabled={p.taxPolicy === 'TAX_FREE' || p.taxPolicy === 'PENSION'} />
                    </Grid>
                    <Grid item xs={6}>
                       <PercentageField label="Tax on Base Price" field="incTax" tooltip="Income Tax (for RSUs)" disabled={p.taxPolicy === 'TAX_FREE'} />
                    </Grid>
                    <Grid item xs={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Dividend Policy</InputLabel>
                        <Select value={p.divPolicy} label="Dividend Policy" onChange={e => set('divPolicy', e.target.value)}>
                          <MenuItem value="cash_taxed">Cash (Taxed)</MenuItem>
                          <MenuItem value="accumulate_tax_free">Accumulate (Tax-Free)</MenuItem>
                          <MenuItem value="hybrid_rsu">Accumulate Unvested / Cash Vested</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <PercentageField 
                        label="Div Tax/Fee Rate" 
                        field="divCommRate" 
                        tooltip="Tax or fee rate on cash dividends" 
                        disabled={p.taxPolicy === 'TAX_FREE' || p.divPolicy !== 'cash_taxed'}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* COMMISSION */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>TRADING COSTS</Typography>
                  <Grid container spacing={3} mt={2}>
                    <Grid item xs={4}>
                      <PercentageField label="Rate" field="commRate" tooltip="Commission rate per trade" />
                    </Grid>
                    <Grid item xs={4}>
                      <NumericField label="Min Fee" field="commMin" showCurrency />
                    </Grid>
                    <Grid item xs={4}>
                      <NumericField label="Max Fee" field="commMax" showCurrency />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* FEES */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                     <Typography variant="subtitle2" color="text.secondary">HOLDING COSTS & FEES</Typography>
                     <Tooltip title="Recurring fees charged by the broker/manager (e.g. 0.7% Accumulation, or 15 ILS/month).">
                       <InfoOutlinedIcon fontSize="inherit" color="action" />
                     </Tooltip>
                  </Box>
                  <Grid container spacing={3} mt={2}>
                    <Grid item xs={4}>
                       {p.mgmtType === 'percentage' ? (
                         <PercentageField label="Value" field="mgmtVal" />
                       ) : (
                         <NumericField label="Value" field="mgmtVal" showCurrency />
                       )}
                    </Grid>
                    <Grid item xs={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select value={p.mgmtType} label="Type" onChange={e => set('mgmtType', e.target.value)}>
                          <MenuItem value="percentage">Percentage</MenuItem>
                          <MenuItem value="fixed">Fixed</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={4}>
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

            <Grid item xs={12}>
               <Button 
                variant="contained" fullWidth size="large" 
                startIcon={<CheckCircleOutlineIcon />} onClick={handleSubmit} disabled={loading}
                sx={{ py: 1.5, fontSize: '1rem' }}
              >
                {loading ? (editMode ? 'Updating...' : 'Creating...') : (editMode ? 'Update Portfolio' : 'Create Portfolio')}
              </Button>
              {(editMode || showNewPortfolioForm) && (
                <Button 
                  variant="outlined" fullWidth size="large" 
                  onClick={editMode ? cancelEdit : () => setShowNewPortfolioForm(false)}
                  disabled={loading}
                  sx={{ py: 1.5, fontSize: '1rem', mt: 1 }}
                >
                  {editMode ? 'Cancel Edit' : 'Cancel'}
                </Button>
              )}
            </Grid>
          </Grid>
        </Box>
      ) : null}

      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg('')}>
        <Alert severity="success" variant="filled" sx={{ width: '100%' }}>{msg}</Alert>
      </Snackbar>

      {/* Existing Portfolios List */}
      <Box mt={5}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" fontWeight="600" color="text.primary">
            Existing Portfolios
          </Typography>
          {!showNewPortfolioForm && !editMode && (
            <Button variant="outlined" onClick={() => setShowNewPortfolioForm(true)}>
              Add New Portfolio
            </Button>
          )}
        </Box>
        {loading ? (
          <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>
        ) : portfolios.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell>Tax Policy</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {portfolios.map((port) => (
                  <TableRow key={port.id}>
                    <TableCell>{port.id}</TableCell>
                    <TableCell>{port.name}</TableCell>
                    <TableCell>{port.currency}</TableCell>
                    <TableCell>{taxPolicyNames[port.taxPolicy] || port.taxPolicy}</TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => navigate(`/portfolios/${port.id}`)} sx={{ mr: 1 }}>Edit</Button>
                      <Button size="small" color="error" onClick={() => alert('Delete: ' + port.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary">No portfolios found.</Typography>
        )}
      </Box>
    </Box>
  );
}