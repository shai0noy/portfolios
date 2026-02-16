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
import { PortfolioWizard } from './PortfolioWizard';

const taxPolicyNames: { [key: string]: string } = {
  IL_REAL_GAIN: "Israel (Real Gain - Inflation Adjusted)",
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
  const [wizardMode, setWizardMode] = useState(true); // Default to Wizard
  const [showTaxHistory, setShowTaxHistory] = useState(false);
  const [showFeeHistory, setShowFeeHistory] = useState(false);
  const { t } = useLanguage();

  // Form State
  const [template, setTemplate] = useState('');
  const [p, setP] = useState<Partial<Portfolio>>({
    id: '', name: '', currency: Currency.ILS,
    cgt: 0.25, incTax: 0,
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
    commRate: 0.001, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0,
    taxPolicy: 'IL_REAL_GAIN'
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
      setWizardMode(true); // Reset to Wizard when closing/clearing
      setP({
        id: '', name: '', currency: Currency.ILS,
        cgt: 0.25, incTax: 0,
        mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
        commRate: 0.001, commMin: 0, commMax: 0,
        divPolicy: 'cash_taxed', divCommRate: 0,
        taxPolicy: 'IL_REAL_GAIN'
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

  const addFeeHistoryEntry = () => {
      const today = new Date().toISOString().split('T')[0];
      setP(prev => ({
          ...prev,
          feeHistory: [...(prev.feeHistory || []), { startDate: today, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', divCommRate: 0, commRate: 0, commMin: 0, commMax: 0 }]
      }));
  };

  const removeFeeHistoryEntry = (index: number) => {
      setP(prev => {
          const newHistory = [...(prev.feeHistory || [])];
          newHistory.splice(index, 1);
          return { ...prev, feeHistory: newHistory };
      });
  };

  const updateFeeHistoryEntry = (index: number, field: keyof import('../lib/types').FeeHistoryEntry, value: any) => {
      if (field === 'startDate') {
          const newDate = new Date(value);
          const history = p.feeHistory || [];
          if (index > 0) {
              const prevDate = new Date(history[index - 1].startDate);
              if (newDate <= prevDate) {
                  alert(t('Date must be after the previous entry.', 'התאריך חייב להיות אחרי הרשומה הקודמת.'));
                  return;
              }
          }
          if (index < history.length - 1) {
              const nextDate = new Date(history[index + 1].startDate);
              if (newDate >= nextDate) {
                  alert(t('Date must be before the next entry.', 'התאריך חייב להיות לפני הרשומה הבאה.'));
                  return;
              }
          }
      }

      setP(prev => {
          const newHistory = [...(prev.feeHistory || [])];
          newHistory[index] = { ...newHistory[index], [field]: value };
          return { ...prev, feeHistory: newHistory };
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
      taxPolicy: 'IL_REAL_GAIN'
    });
    setIdDirty(false);
    setShowNewPortfolioForm(false);
    navigate('/portfolios');
  };

  const handleWizardComplete = (initialProps: Partial<Portfolio>) => {
    setP(prev => ({ ...prev, ...initialProps }));
    // Auto-generate ID if name is provided (it should be)
    // Actually Wizard generates ID too.
    if (initialProps.id) {
      setIdDirty(true);
    }
    setWizardMode(false); // Switch to "Manual" form to allow final review or just submit?
    // Plan says "Create: Calls addPortfolio".
    // But `handleSubmit` uses `p` state.
    // If I want to allow review, I set `p` and `setWizardMode(false)`.
    // If I want to submit immediately, I call `handleSubmit`? 
    // The Wizard has "Create Portfolio" button. It implies immediate creation.
    // Let's UPDATE `p` then call `handleSubmit` directly?
    // But `handleSubmit` depends on `p` state which is async update.
    // Better: Update `p` and then in `useEffect` or just pass `initialProps` to a submission helper?
    // I'll update `p` and show the form populated for final verification? Or just submit?
    // User "I will allow for choosing between a few defaults and customizing the applicable settings... Editing stay the same as now."
    // Implies Wizard is for CREATION.
    // The Wizard "Create" button should probably just create it.
    // But I need to merge `initialProps` with defaults in `p`?
    // `initialProps` from Wizard has everything needed (template + customizations).
    // So I can just call `addPortfolio` with it.

    // Actually, `PortfolioWizard` returns `initialPorfolio` which is `template + name + currency`.
    // It might miss some fields if `template` doesn't have them?
    // `types.ts` templates have all necessary fields.
    // So I can just `addPortfolio`.

    // BUT `handleSubmit` shares logic for `addPortfolio` and `updatePortfolio`.
    // And handle loading state, etc.
    // Let's repurpose `handleSubmit` or overload it?
    // Or just set state and call `submitWithData`?

    // safer: set P, then submitting might be tricky due to closure/async.
    // I will call `submitPortfolio(initialProps)` helper.

    submitPortfolio(initialProps as Portfolio);
  };

  const submitPortfolio = async (portfolioData: Portfolio) => {
    setLoading(true);
    try {
      // Validation? Name and ID already checked in Wizard.
      await addPortfolio(sheetId, portfolioData);
      setMsg(t('Portfolio Created!', 'התיק נוצר!'));
      setShowNewPortfolioForm(false);
      setP({ id: '', name: '' });
      setIdDirty(false);
      setWizardMode(true);
      loadPortfolios();
      onSuccess();
    } catch (e) {
      console.error(e);
      alert(t('Error creating portfolio', 'שגיאה ביצירת התיק'));
    } finally {
      setLoading(false);
    }
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
        const cgtChanged = Math.abs((portToSave.cgt || 0) - (editingPortfolio.cgt || 0)) > 1e-6;
        const incTaxChanged = Math.abs((portToSave.incTax || 0) - (editingPortfolio.incTax || 0)) > 1e-6;
        
        if (cgtChanged || incTaxChanged) {
            const today = new Date().toISOString().split('T')[0];
            const history = [...(editingPortfolio.taxHistory || [])];
            
            if (history.length === 0) {
                history.push({ 
                    startDate: '1970-01-01', 
                    cgt: editingPortfolio.cgt || 0, 
                    incTax: editingPortfolio.incTax || 0
                });
            }
            
            const existingTodayIndex = history.findIndex(h => h.startDate === today);
            if (existingTodayIndex >= 0) {
                history[existingTodayIndex] = { startDate: today, cgt: portToSave.cgt, incTax: portToSave.incTax };
            } else {
                history.push({ startDate: today, cgt: portToSave.cgt, incTax: portToSave.incTax });
            }
            
            portToSave.taxHistory = history;
        }

        // Check for fee changes
        const valChanged = Math.abs((portToSave.mgmtVal || 0) - (editingPortfolio.mgmtVal || 0)) > 1e-6;
        const typeChanged = portToSave.mgmtType !== editingPortfolio.mgmtType;
        const freqChanged = portToSave.mgmtFreq !== editingPortfolio.mgmtFreq;
        const divCommChanged = Math.abs((portToSave.divCommRate || 0) - (editingPortfolio.divCommRate || 0)) > 1e-6;
        const commRateChanged = Math.abs((portToSave.commRate || 0) - (editingPortfolio.commRate || 0)) > 1e-6;
        const commMinChanged = Math.abs((portToSave.commMin || 0) - (editingPortfolio.commMin || 0)) > 1e-6;
        const commMaxChanged = Math.abs((portToSave.commMax || 0) - (editingPortfolio.commMax || 0)) > 1e-6;

        if (valChanged || typeChanged || freqChanged || divCommChanged || commRateChanged || commMinChanged || commMaxChanged) {
            const today = new Date().toISOString().split('T')[0];
            const history = [...(editingPortfolio.feeHistory || [])];
            
            if (history.length === 0) {
                history.push({ 
                    startDate: '1970-01-01', 
                    mgmtVal: editingPortfolio.mgmtVal || 0,
                    mgmtType: editingPortfolio.mgmtType || 'percentage',
                    mgmtFreq: editingPortfolio.mgmtFreq || 'yearly',
                    divCommRate: editingPortfolio.divCommRate || 0,
                    commRate: editingPortfolio.commRate || 0,
                    commMin: editingPortfolio.commMin || 0,
                    commMax: editingPortfolio.commMax || 0
                });
            }
            
            const newEntry: import('../lib/types').FeeHistoryEntry = { 
                startDate: today, 
                mgmtVal: portToSave.mgmtVal || 0,
                mgmtType: portToSave.mgmtType || 'percentage',
                mgmtFreq: portToSave.mgmtFreq || 'yearly',
                divCommRate: portToSave.divCommRate || 0,
                commRate: portToSave.commRate || 0,
                commMin: portToSave.commMin || 0,
                commMax: portToSave.commMax || 0
            };

            const existingTodayIndex = history.findIndex(h => h.startDate === today);
            if (existingTodayIndex >= 0) {
                history[existingTodayIndex] = newEntry;
            } else {
                history.push(newEntry);
            }
            
            portToSave.feeHistory = history;
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
        autoComplete="off"
          InputProps={{ 
            endAdornment: showCurrency ? <InputAdornment position="end">{p.currency}</InputAdornment> : null,
            inputProps: { min: 0, step: 'any' }
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
        autoComplete="off"
        InputProps={{
          endAdornment: <InputAdornment position="end">%</InputAdornment>,
          inputProps: { min: 0, step: 'any' }
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

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {(showNewPortfolioForm || editMode) ? (
        <Box mb={4}>
          {!editMode && wizardMode ? (
            <PortfolioWizard
              onComplete={handleWizardComplete}
              onCancel={() => { setShowNewPortfolioForm(false); navigate('/portfolios'); }}
              onManual={() => setWizardMode(false)}
              existingNames={portfolios.map(p => p.name)}
              existingIds={portfolios.map(p => p.id)}
            />
          ) : (
            <>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h5" fontWeight="600" color="text.primary">
              {editMode ? `${t('Editing Portfolio:', 'עריכת תיק:')} ${editingPortfolio?.name}` : t('Create New Portfolio', 'יצירת תיק חדש')}
            </Typography>
            
            {!editMode && (
                    <Box display="flex" gap={2}>
                      <Button onClick={() => setWizardMode(true)} color="primary">
                        {t('Switch to Wizard', 'עבור לאשף')}
                      </Button>
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
                    </Box>
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
                                                autoComplete="off"
                                                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment>, inputProps: { min: 0, step: 'any' } }}
                                                        sx={{ width: 100 }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={(h.incTax * 100).toFixed(4).replace(/\.?0+$/, '')} 
                                                        onChange={e => updateTaxHistoryEntry(i, 'incTax', parseFloat(e.target.value) / 100)}
                                                autoComplete="off"
                                                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment>, inputProps: { min: 0, step: 'any' } }}
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
                            <Alert severity="warning" sx={{ mt: 2 }}>
                                {t('Warning: Changing history does not automatically update past transactions tax calculations. Only new dashboard calculations will use this.', 'אזהרה: שינוי ההיסטוריה אינו מעדכן אוטומטית חישובי מס של עסקאות עבר. רק חישובי דאשבורד חדשים ישתמשו בזה.')}
                            </Alert>
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

            {/* FEES */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t('TRADING FESS', 'עמלות מסחר')}</Typography>
                  <Grid container spacing={3} mt={0.5} mb={3}>
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

                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                     <Typography variant="subtitle2" color="text.secondary">{t('HOLDING FEES', 'דמי ניהול והחזקה')}</Typography>
                     <Tooltip title={t("Recurring fees charged by the broker/manager (e.g. 0.7% Accumulation, or 15 ILS/month).", "עמלות חוזרות הנגבות על ידי הברוקר/מנהל (למשל 0.7% צבירה, או 15 ש\"ח לחודש).")}>
                       <InfoOutlinedIcon fontSize="inherit" color="action" />
                     </Tooltip>
                  </Box>
                  <Grid container spacing={3} mt={0}>
                    <Grid item xs={12} sm={6}>
                       {p.mgmtType === 'percentage' ? (
                         <PercentageField label={t('Value', 'ערך')} field="mgmtVal" />
                       ) : (
                         <NumericField label={t('Value', 'ערך')} field="mgmtVal" showCurrency />
                       )}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small">
                              <InputLabel>{t('Exemptions', 'פטורים')}</InputLabel>
                              <Select
                                value={p.commExemption || 'none'}
                                label={t('Exemptions', 'פטורים')}
                                onChange={e => set('commExemption', e.target.value)}
                              >
                                <MenuItem value="none">{t('None', 'ללא')}</MenuItem>
                                <MenuItem value="buys">{t('Buys Free', 'קנייה חינם')}</MenuItem>
                                <MenuItem value="sells">{t('Sells Free', 'מכירה חינם')}</MenuItem>

                              </Select>
                            </FormControl>
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
                    <Grid item xs={12}>
                        <Button 
                            size="small" 
                            onClick={() => setShowFeeHistory(!showFeeHistory)} 
                            endIcon={showFeeHistory ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            sx={{ textTransform: 'none', color: 'text.secondary', mb: 1 }}
                        >
                            {t('Manage Fee History', 'ניהול היסטוריית דמי ניהול')}
                        </Button>
                        <Collapse in={showFeeHistory}>
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {t('DANGER: Modifying fee history will require recalculating fees for ALL transactions in this portfolio. This logic is NOT YET IMPLEMENTED. Use with caution.', 'סכנה: שינוי היסטוריית העמלות ידרוש חישוב מחדש של עמלות לכל העסקאות בתיק זה. לוגיקה זו טרם יושמה. השתמש בזהירות.')}
                            </Alert>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, mb: 2 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('Start', 'התחלה')}</TableCell>
                                            <TableCell>{t('Mgmt', 'דמי ניהול')}</TableCell>
                                            <TableCell>{t('Type', 'סוג')}</TableCell>
                                            <TableCell>{t('Freq', 'תדירות')}</TableCell>
                                            <TableCell>{t('Div%', 'דיב%')}</TableCell>
                                            <TableCell>{t('Comm%', 'עמלה%')}</TableCell>
                                            <TableCell>{t('Min Comm', 'עמלה מינ')}</TableCell>
                                            <TableCell>{t('Max Comm', 'עמלה מקס')}</TableCell>
                                            <TableCell align="center"></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {p.feeHistory && p.feeHistory.map((h, i) => (
                                            <TableRow key={i}>
                                                <TableCell>
                                                    {i === 0 ? (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {t('Always', 'תמיד')}
                                                        </Typography>
                                                    ) : (
                                                        <TextField 
                                                            type="date" 
                                                            size="small" 
                                                            value={h.startDate} 
                                                            onChange={e => updateFeeHistoryEntry(i, 'startDate', e.target.value)}
                                                            sx={{ width: 130, '& .MuiInputBase-input': { colorScheme: theme.palette.mode, fontSize: '0.8rem' } }}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={h.mgmtType === 'percentage' ? parseFloat((h.mgmtVal * 100).toFixed(4)).toString() : h.mgmtVal} 
                                                        onChange={e => updateFeeHistoryEntry(i, 'mgmtVal', h.mgmtType === 'percentage' ? parseFloat(e.target.value) / 100 : parseFloat(e.target.value))}
                                                        sx={{ width: 70 }}
                                                autoComplete="off"
                                                InputProps={{ style: { fontSize: '0.8rem' }, inputProps: { min: 0, step: 'any' } }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        size="small"
                                                        value={h.mgmtType}
                                                        onChange={e => updateFeeHistoryEntry(i, 'mgmtType', e.target.value)}
                                                        sx={{ minWidth: 60, fontSize: '0.8rem' }}
                                                    >
                                                        <MenuItem value="percentage">%</MenuItem>
                                                        <MenuItem value="fixed">Fixed</MenuItem>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        size="small"
                                                        value={h.mgmtFreq}
                                                        onChange={e => updateFeeHistoryEntry(i, 'mgmtFreq', e.target.value)}
                                                        sx={{ minWidth: 60, fontSize: '0.8rem' }}
                                                    >
                                                        <MenuItem value="monthly">M</MenuItem>
                                                        <MenuItem value="quarterly">Q</MenuItem>
                                                        <MenuItem value="yearly">Y</MenuItem>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={((h.divCommRate || 0) * 100).toFixed(4).replace(/\.?0+$/, '')} 
                                                        onChange={e => updateFeeHistoryEntry(i, 'divCommRate', parseFloat(e.target.value) / 100)}
                                                        sx={{ width: 70 }}
                                                autoComplete="off"
                                                InputProps={{ style: { fontSize: '0.8rem' }, inputProps: { min: 0, step: 'any' } }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={((h.commRate || 0) * 100).toFixed(4).replace(/\.?0+$/, '')} 
                                                        onChange={e => updateFeeHistoryEntry(i, 'commRate', parseFloat(e.target.value) / 100)}
                                                        sx={{ width: 70 }}
                                                autoComplete="off"
                                                InputProps={{ style: { fontSize: '0.8rem' }, inputProps: { min: 0, step: 'any' } }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={h.commMin || 0} 
                                                        onChange={e => updateFeeHistoryEntry(i, 'commMin', parseFloat(e.target.value))}
                                                        sx={{ width: 60 }}
                                                autoComplete="off"
                                                InputProps={{ style: { fontSize: '0.8rem' }, inputProps: { min: 0 } }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        value={h.commMax || 0} 
                                                        onChange={e => updateFeeHistoryEntry(i, 'commMax', parseFloat(e.target.value))}
                                                        sx={{ width: 60 }}
                                                autoComplete="off"
                                                InputProps={{ style: { fontSize: '0.8rem' }, inputProps: { min: 0 } }}
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <IconButton size="small" color="error" onClick={() => removeFeeHistoryEntry(i)} disabled={i === 0}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(!p.feeHistory || p.feeHistory.length === 0) && (
                                            <TableRow>
                                                <TableCell colSpan={9} align="center" sx={{ color: 'text.secondary' }}>
                                                    {t('No history records.', 'אין רשומות היסטוריה.')}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Button startIcon={<AddIcon />} size="small" onClick={addFeeHistoryEntry}>
                                {t('Add History Entry', 'הוסף רשומה')}
                            </Button>
                        </Collapse>
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
            </>
          )}
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