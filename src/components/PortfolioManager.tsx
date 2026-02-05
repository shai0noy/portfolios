// src/components/PortfolioManager.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { 
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, 
  Typography, Alert, Snackbar, Grid, Card, CardContent, Tooltip,
  InputAdornment,
  TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper,
  CircularProgress, Collapse, IconButton
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { type Portfolio, PORTFOLIO_TEMPLATES, Currency } from '../lib/types';
import { addPortfolio, fetchPortfolios, updatePortfolio } from '../lib/sheets/index';
import { useLanguage } from '../lib/i18n';

const taxPolicyNames: { [key: string]: string } = {
  REAL_GAIN: "Israel (Real Gain - Inflation Adjusted)",
  NOMINAL_GAIN: "Fixed (Nominal Gain)",
  TAX_FREE: "Tax Free (Gemel/Hishtalmut)",
  PENSION: "Pension (Income Taxed)"
};

interface Props {
  sheetId: string;
  onSuccess: () => void;
}

export function PortfolioManager({ sheetId, onSuccess }: Props) {
  const theme = useTheme();
  const { portfolioId } = useParams<{ portfolioId?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [idDirty, setIdDirty] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [editMode, setEditMode] = useState<boolean>(!!portfolioId);
  const [editingPortfolio, setEditingPortfolio] = useState<Partial<Portfolio> | null>(null);
  const [showNewPortfolioForm, setShowNewPortfolioForm] = useState(!!portfolioId);
  const [showTaxHistory, setShowTaxHistory] = useState(false);
  const { t } = useLanguage();

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
        alert(t(`Portfolio with ID "${portfolioId}" not found.`, `תיק עם מזהה "${portfolioId}" לא נמצא.`));
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
      alert(t("Could not load existing portfolios.", "לא ניתן לטעון תיקים קיימים."));
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



  const addTaxHistoryEntry = () => {
      const today = new Date().toISOString().split('T')[0];
      setP(prev => ({
          ...prev,
          taxHistory: [...(prev.taxHistory || []), { startDate: today, cgt: 0.25, incTax: 0 }]
      }));
  };

  const removeTaxHistoryEntry = (index: number) => {
      setP(prev => {
          const newHistory = [...(prev.taxHistory || [])];
          newHistory.splice(index, 1);
          return { ...prev, taxHistory: newHistory };
      });
  };

  const updateTaxHistoryEntry = (index: number, field: keyof import('../lib/types').TaxHistoryEntry, value: any) => {
      // Validate Date Order
      if (field === 'startDate') {
          const newDate = new Date(value);
          const history = p.taxHistory || [];
          
          // Check previous (must be later than previous)
          if (index > 0) {
              const prevDate = new Date(history[index - 1].startDate);
              if (newDate <= prevDate) {
                  alert(t('Date must be after the previous entry.', 'התאריך חייב להיות אחרי הרשומה הקודמת.'));
                  return;
              }
          }
          
          // Check next (must be earlier than next)
          if (index < history.length - 1) {
              const nextDate = new Date(history[index + 1].startDate);
              if (newDate >= nextDate) {
                  alert(t('Date must be before the next entry.', 'התאריך חייב להיות לפני הרשומה הבאה.'));
                  return;
              }
          }
      }

      setP(prev => {
          const newHistory = [...(prev.taxHistory || [])];
          newHistory[index] = { ...newHistory[index], [field]: value };
          return { ...prev, taxHistory: newHistory };
      });
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
      alert(t("ID and Name are required", "מזהה ושם הם שדות חובה"));
      return;
    }
    setLoading(true);
    try {
      const portToSave = { ...p } as Portfolio;

      if (editMode && editingPortfolio) {
        // Check for tax changes
        // Use epsilon for float comparison just in case
        const cgtChanged = Math.abs((portToSave.cgt || 0) - (editingPortfolio.cgt || 0)) > 1e-6;
        const incTaxChanged = Math.abs((portToSave.incTax || 0) - (editingPortfolio.incTax || 0)) > 1e-6;
        
        if (cgtChanged || incTaxChanged) {
            const today = new Date().toISOString().split('T')[0];
            const history = [...(editingPortfolio.taxHistory || [])];
            
            // If history is empty, record the initial state as 'forever' (valid until now)
            if (history.length === 0) {
                history.push({ 
                    startDate: '1970-01-01', 
                    cgt: editingPortfolio.cgt || 0, 
                    incTax: editingPortfolio.incTax || 0
                });
            }
            
            // Record the NEW state (effective from today)
            const existingTodayIndex = history.findIndex(h => h.startDate === today);
            if (existingTodayIndex >= 0) {
                history[existingTodayIndex] = { startDate: today, cgt: portToSave.cgt, incTax: portToSave.incTax };
            } else {
                history.push({ startDate: today, cgt: portToSave.cgt, incTax: portToSave.incTax });
            }
            
            portToSave.taxHistory = history;
        }
      }

      if (editMode) {
        await updatePortfolio(sheetId, portToSave);
        setMsg(t('Portfolio Updated!', 'התיק עודכן!'));
        setEditMode(false);
        setEditingPortfolio(null);
      } else {
        await addPortfolio(sheetId, portToSave);
        setMsg(t('Portfolio Created!', 'התיק נוצר!'));
        setShowNewPortfolioForm(false);
      }
      setP({ id: '', name: '' }); 
      setIdDirty(false);
      loadPortfolios(); 
      onSuccess();
    } catch (e) {
      console.error(e);
      alert(t(`Error ${editMode ? 'updating' : 'creating'} portfolio`, `שגיאה ב${editMode ? 'עדכון' : 'יצירת'} התיק`));
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
              {editMode ? `${t('Editing Portfolio:', 'עריכת תיק:')} ${editingPortfolio?.name}` : t('Create New Portfolio', 'יצירת תיק חדש')}
            </Typography>
            
            {!editMode && (
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>{t('Load Template', 'טען תבנית')}</InputLabel>
                <Select value={template} label={t('Load Template', 'טען תבנית')} onChange={e => handleTemplate(e.target.value)}>
                  <MenuItem value="">-- {t('Select Template', 'בחר תבנית')} --</MenuItem>
                  <MenuItem value="std_il">{t('Standard IL (Broker/Bank)', 'רגיל ישראל (ברוקר/בנק)')}</MenuItem>
                  <MenuItem value="std_us">{t('Standard US (Broker)', 'רגיל ארה"ב (ברוקר)')}</MenuItem>
                  <MenuItem value="pension">{t('Pension', 'פנסיה')}</MenuItem>
                  <MenuItem value="hishtalmut">{t('Hishtalmut / Gemel', 'השתלמות / גמל')}</MenuItem>
                  <MenuItem value="rsu">{t('RSU (Income Taxed)', 'RSU (ממוסה כהכנסה)')}</MenuItem>
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
                    {t('PORTFOLIO IDENTITY', 'פרטי זיהוי')}
                  </Typography>
                  <Grid container spacing={3} mt={2}>
                    <Grid item xs={12}>
                      <TextField fullWidth size="small" label={t('Display Name', 'שם תצוגה')} value={p.name} onChange={e => handleNameChange(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Tooltip title={t("Unique System ID (auto-generated). No spaces.", "מזהה ייחודי (נוצר אוטומטית). ללא רווחים.")}>
                        <TextField fullWidth size="small" label={t('ID', 'מזהה')} value={p.id} onChange={(e) => handleIdChange(e.target.value)} disabled={editMode} />
                      </Tooltip>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('Currency', 'מטבע')}</InputLabel>
                        <Select value={p.currency} label={t('Currency', 'מטבע')} onChange={e => set('currency', e.target.value)}>
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
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t('TAXATION & DIVIDENDS', 'מיסוי ודיבידנדים')}</Typography>
                  <Grid container spacing={3} mt={2}>
                     <Grid item xs={12}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('Cap. Gain Tax Policy', 'מדיניות מס רווחי הון')}</InputLabel>
                        <Select 
                          value={p.taxPolicy} 
                          label={t('Cap. Gain Tax Policy', 'מדיניות מס רווחי הון')}
                          onChange={e => set('taxPolicy', e.target.value)}
                          disabled={editMode}
                        >
                          {Object.entries(taxPolicyNames).map(([key, name]) => (
                            <MenuItem key={key} value={key}>{name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PercentageField label={t('Gains Tax', 'מס רווח הון')} field="cgt" tooltip={t("Capital Gains Tax", "מס רווחי הון")} disabled={p.taxPolicy === 'TAX_FREE' || p.taxPolicy === 'PENSION'} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                       <PercentageField label={t('Tax on Base Price', 'מס הכנסה (בסיס)')} field="incTax" tooltip={t("Income Tax (for RSUs)", "מס הכנסה (עבור RSU)")} disabled={p.taxPolicy === 'TAX_FREE'} />
                    </Grid>
                    <Grid item xs={12}>
                        <Button 
                            size="small" 
                            onClick={() => setShowTaxHistory(!showTaxHistory)} 
                            endIcon={showTaxHistory ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            sx={{ textTransform: 'none', color: 'text.secondary', mb: 1 }}
                        >
                            {t('Manage Tax History', 'ניהול היסטוריית מס')}
                        </Button>
                        <Collapse in={showTaxHistory}>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, mb: 2 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('Start Date', 'תאריך התחלה')}</TableCell>
                                            <TableCell>{t('CGT', 'מס רווח')}</TableCell>
                                            <TableCell>{t('Inc Tax', 'מס הכנסה')}</TableCell>
                                            <TableCell align="center">{t('Actions', 'פעולות')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {p.taxHistory && p.taxHistory.map((h, i) => (
                                            <TableRow key={i}>
                                                <TableCell>
                                                    {i === 0 ? (
                                                        <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                                                            {t('Creation / Always', 'יצירה / תמיד')}
                                                        </Typography>
                                                    ) : (
                                                        <TextField 
                                                            type="date" 
                                                            size="small" 
                                                            value={h.startDate} 
                                                            onChange={e => updateTaxHistoryEntry(i, 'startDate', e.target.value)}
                                                            sx={{ width: 150, '& .MuiInputBase-input': { colorScheme: theme.palette.mode } }}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={(h.cgt * 100).toFixed(4).replace(/\.?0+$/, '')} 
                                                        onChange={e => updateTaxHistoryEntry(i, 'cgt', parseFloat(e.target.value) / 100)}
                                                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                                        sx={{ width: 100 }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={(h.incTax * 100).toFixed(4).replace(/\.?0+$/, '')} 
                                                        onChange={e => updateTaxHistoryEntry(i, 'incTax', parseFloat(e.target.value) / 100)}
                                                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                                        sx={{ width: 100 }}
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <IconButton size="small" color="error" onClick={() => removeTaxHistoryEntry(i)} disabled={i === 0}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(!p.taxHistory || p.taxHistory.length === 0) && (
                                            <TableRow>
                                                <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                                                    {t('No history records.', 'אין רשומות היסטוריה.')}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Button startIcon={<AddIcon />} size="small" onClick={addTaxHistoryEntry}>
                                {t('Add History Entry', 'הוסף רשומה')}
                            </Button>
                        </Collapse>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('Dividend Policy', 'מדיניות דיבידנד')}</InputLabel>
                        <Select value={p.divPolicy} label={t('Dividend Policy', 'מדיניות דיבידנד')} onChange={e => set('divPolicy', e.target.value)} disabled={editMode}>
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

            {/* COMMISSION */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t('TRADING FESS', 'עמלות מסחר')}</Typography>
                  <Grid container spacing={3} mt={2}>
                    <Grid item xs={12} sm={4}>
                      <PercentageField label={t('Rate', 'שיעור')} field="commRate" tooltip={t("Commission rate per trade", "שיעור עמלה לכל פעולה")} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <NumericField label={t('Min Fee', 'עמלת מינימום')} field="commMin" showCurrency />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <NumericField label={t('Max Fee', 'עמלת מקסימום')} field="commMax" showCurrency />
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
                     <Typography variant="subtitle2" color="text.secondary">{t('HOLDING COSTS & FEES', 'דמי ניהול והחזקה')}</Typography>
                     <Tooltip title={t("Recurring fees charged by the broker/manager (e.g. 0.7% Accumulation, or 15 ILS/month).", "עמלות חוזרות הנגבות על ידי הברוקר/מנהל (למשל 0.7% צבירה, או 15 ש\"ח לחודש).")}>
                       <InfoOutlinedIcon fontSize="inherit" color="action" />
                     </Tooltip>
                  </Box>
                  <Grid container spacing={3} mt={2}>
                    <Grid item xs={12} sm={6}>
                       {p.mgmtType === 'percentage' ? (
                         <PercentageField label={t('Value', 'ערך')} field="mgmtVal" />
                       ) : (
                         <NumericField label={t('Value', 'ערך')} field="mgmtVal" showCurrency />
                       )}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('Type', 'סוג')}</InputLabel>
                        <Select value={p.mgmtType} label={t('Type', 'סוג')} onChange={e => set('mgmtType', e.target.value)}>
                          <MenuItem value="percentage">Percentage</MenuItem>
                          <MenuItem value="fixed">Fixed</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('Frequency', 'תדירות')}</InputLabel>
                        <Select value={p.mgmtFreq} label={t('Frequency', 'תדירות')} onChange={e => set('mgmtFreq', e.target.value)}>
                          <MenuItem value="monthly">Monthly</MenuItem>
                          <MenuItem value="quarterly">Quarterly</MenuItem>
                          <MenuItem value="yearly">Yearly</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PercentageField 
                        label={t('Cashed Div Fee Rate', 'עמלת דיבידנד ממומש')}
                        field="divCommRate" 
                        tooltip={t("Fee rate on cashed dividends", "שיעור עמלה על דיבידנד ממומש")}
                        disabled={p.taxPolicy === 'TAX_FREE' || p.divPolicy === 'accumulate_tax_free'}
                      />
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
                {loading ? (editMode ? t('Updating...', 'מעדכן...') : t('Creating...', 'יוצר...')) : (editMode ? t('Update Portfolio', 'עדכן תיק') : t('Create Portfolio', 'צור תיק'))}
              </Button>
              {(editMode || showNewPortfolioForm) && (
                <Button 
                  variant="outlined" fullWidth size="large" 
                  onClick={editMode ? cancelEdit : () => setShowNewPortfolioForm(false)}
                  disabled={loading}
                  sx={{ py: 1.5, fontSize: '1rem', mt: 1 }}
                >
                  {editMode ? t('Cancel Edit', 'בטל עריכה') : t('Cancel', 'ביטול')}
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
            {t('Existing Portfolios', 'תיקים קיימים')}
          </Typography>
          {!showNewPortfolioForm && !editMode && (
            <Button variant="outlined" onClick={() => setShowNewPortfolioForm(true)}>
              {t('Add New Portfolio', 'הוסף תיק חדש')}
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
                  <TableCell>{t('ID', 'מזהה')}</TableCell>
                  <TableCell>{t('Name', 'שם')}</TableCell>
                  <TableCell>{t('Currency', 'מטבע')}</TableCell>
                  <TableCell>{t('Tax Policy', 'מדיניות מס')}</TableCell>
                  <TableCell>{t('Actions', 'פעולות')}</TableCell>
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
                      <Button size="small" onClick={() => navigate(`/portfolios/${port.id}`)} sx={{ mr: 1 }}>{t('Edit', 'ערוך')}</Button>
                      <Button size="small" color="error" onClick={() => alert('Delete: ' + port.id)}>{t('Delete', 'מחק')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary">{t('No portfolios found.', 'לא נמצאו תיקים.')}</Typography>
        )}
      </Box>
    </Box>
  );
}