import { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button, TextField,
  MenuItem, Select, FormControl, InputLabel, RadioGroup, FormControlLabel, Radio,
  Fade, IconButton, Divider, InputAdornment, Tooltip, FormHelperText, Alert
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PublicIcon from '@mui/icons-material/Public';
import SavingsIcon from '@mui/icons-material/Savings'; // Reverted to Piggy Bank
import WorkIcon from '@mui/icons-material/Work';
import SchoolIcon from '@mui/icons-material/School';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom'; // Reverted to Family
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff'; // Non-Resident
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import { type Portfolio, PORTFOLIO_TEMPLATES, Currency, type CommissionExemption } from '../lib/types';
import { useLanguage } from '../lib/i18n';

interface WizardProps {
  onComplete: (portfolio: Partial<Portfolio>) => void;
  onCancel: () => void;
  onManual: () => void;
  existingNames?: string[];
  existingIds?: string[];
}

type PresetKey = 'il_broker' | 'us_broker_il' | 'us_broker_nr' | 'pension' | 'gemel' | 'hishtalmut' | 'rsu';

interface PresetConfig {
  id: PresetKey;
  templateKey: string;
  title: string;
  titleHe: string;
  description: string;
  descriptionHe: string;
  icon: React.ReactNode;
  fixedCurrency?: Currency;
  hasTaxSelection?: boolean; // If true, asks for 25% vs 28% vs Custom
  excludeSurtax?: boolean; // If true, hides 28% option
  hasIncomeTax?: boolean; // For RSU (Income Tax)
  isPension?: boolean; // Special logic for pension tax
  mgmtFeeModes?: ('percentage' | 'fixed')[]; // If present, shows Mgmt Fee inputs with these modes
}

const PRESETS: PresetConfig[] = [
  {
    id: 'il_broker', templateKey: 'std_il',
    title: 'Israeli Broker / Bank', titleHe: 'ברוקר / בנק ישראלי',
    description: 'An Israeli broker or bank account. Using Israeli tax rules.',
    descriptionHe: 'ברוקר או בנק ישראלי. חישוב מס לפי החוק הישראלי.',
    icon: <AccountBalanceIcon fontSize="large" />,
    fixedCurrency: Currency.ILS,
    hasTaxSelection: true,
    mgmtFeeModes: ['percentage', 'fixed']
  },
  {
    id: 'us_broker_il', templateKey: 'us_broker_il_tax',
    title: 'US Broker (IL Resident)', titleHe: 'ברוקר אמריקאי (תושב ישראל)',
    description: 'A foreign broker trading account. Using USD currency and Israeli tax laws.',
    descriptionHe: 'חשבון מסחר בברוקר זר במטבע דולר ארה"ב. חישוב מס לפי החוק הישראלי.',
    icon: <PublicIcon fontSize="large" />,
    fixedCurrency: Currency.USD,
    hasTaxSelection: true,
    mgmtFeeModes: ['percentage', 'fixed']
  },
  {
    id: 'us_broker_nr', templateKey: 'std_us',
    title: 'US Broker (Non-Resident)', titleHe: 'ברוקר אמריקאי (לא תושב)',
    description: 'For non-residents of Israel. Fixed rate nominal taxation.',
    descriptionHe: 'למי שאינו תושב ישראל (מיסוי רווח הון נומינלי).',
    icon: <FlightTakeoffIcon fontSize="large" color="action" />,
    fixedCurrency: Currency.USD,
    hasTaxSelection: true,
    excludeSurtax: true,
    mgmtFeeModes: ['percentage', 'fixed']
  },
  {
    id: 'pension', templateKey: 'pension',
    title: 'Pension Fund', titleHe: 'קרן פנסיה',
    description: 'A pension fund using tax calculation assuming withdrawal as pension annuity.',
    descriptionHe: 'קרן פנסיה עם חישוב מס לפי משיכה כקצבה בפרישה.',
    icon: <FamilyRestroomIcon fontSize="large" />,
    fixedCurrency: Currency.ILS,
    isPension: true,
    mgmtFeeModes: ['percentage']
  },
  {
    id: 'gemel', templateKey: 'gemel',
    title: 'Gemel LeHashkaa', titleHe: 'קופת גמל להשקעה',
    description: 'An investment fund using tax calculation assuming withdrawal as a tax-free pension annuity.',
    descriptionHe: 'קופת גמל עם חישוב מס לפי משיכה פטורה ממס בפרישה.',
    icon: <SavingsIcon fontSize="large" />,
    fixedCurrency: Currency.ILS,
    mgmtFeeModes: ['percentage']
  },
  {
    id: 'hishtalmut', templateKey: 'hishtalmut',
    title: 'Keren Hishtalmut', titleHe: 'קרן השתלמות',
    description: 'An investment fund using tax calculation assuming tax-free withdrawal.',
    descriptionHe: 'קרן השתלמות עם חישוב מס לפי משיכה פטורה ממס.',
    icon: <SchoolIcon fontSize="large" />,
    fixedCurrency: Currency.ILS,
    mgmtFeeModes: ['percentage']
  },
  {
    id: 'rsu', templateKey: 'rsu',
    title: 'RSU / Options', titleHe: 'RSU / אופציות',
    description: 'An employee stock grant portfolio. Includes taxation over the base grant and a choice of dividend policies.',
    descriptionHe: 'תיק מניות לעובדים עם חישוב מס הכנסה על המענק והבחירה בין מדיניות דיבידנד.',
    icon: <WorkIcon fontSize="large" />,
    fixedCurrency: Currency.USD,
    hasTaxSelection: true,
    hasIncomeTax: true,
    mgmtFeeModes: ['percentage', 'fixed']
  }
];

export function PortfolioWizard({ onComplete, onCancel, onManual, existingNames = [], existingIds = [] }: WizardProps) {
  const { t, language } = useLanguage();
  const isRtl = language === 'he';
  const theme = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPreset, setSelectedPreset] = useState<PresetConfig | null>(null);
  const [errorObj, setErrorObj] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>(Currency.USD);

  // Tax
  const [taxType, setTaxType] = useState<'25' | '28' | 'custom'>('25');
  const [customTax, setCustomTax] = useState<string>('25');
  const [incomeTax, setIncomeTax] = useState<string>('50'); // For RSU
  const [pensionTax, setPensionTax] = useState<string>('35'); // For Pension

  // Trading Fees
  const [commRate, setCommRate] = useState<string>('0.1'); // 0.1%
  const [commMin, setCommMin] = useState<string>('5');
  const [commMax, setCommMax] = useState<string>('0');
  const [buysExempt, setBuysExempt] = useState(false);
  const [sellsExempt, setSellsExempt] = useState(false);

  // Management Fees
  const [mgmtVal, setMgmtVal] = useState<string>('0');
  const [mgmtType, setMgmtType] = useState<'percentage' | 'fixed'>('percentage');
  const [mgmtFreq, setMgmtFreq] = useState<'yearly' | 'quarterly' | 'monthly'>('quarterly'); // Default to quarterly as common in IL

  // RSU
  const [rsuDivChoice, setRsuDivChoice] = useState<'cash' | 'reinvest' | 'hybrid'>('hybrid');

  const handleSelectPreset = (preset: PresetConfig) => {
    setSelectedPreset(preset);
    // Set defaults based on preset
    const temp = PORTFOLIO_TEMPLATES[preset.templateKey];
    if (preset.fixedCurrency) {
      setCurrency(preset.fixedCurrency);
    } else if (temp && temp.currency) {
      setCurrency(temp.currency);
    }

    // Generate localized default name based on preset title
    let rawName = t(preset.titleHe, preset.title);

    // Override with distinct, user-friendly names for specific presets
    if (preset.id === 'il_broker') rawName = t('Trade', 'מסחר');
    if (preset.id === 'us_broker_il') rawName = t('Trade', 'מסחר');
    if (preset.id === 'us_broker_nr') rawName = t('Trade', 'מסחר');
    if (preset.id === 'pension') rawName = t('Pension', 'פנסיה');
    if (preset.id === 'gemel') rawName = t('Gemel', 'גמל');
    if (preset.id === 'hishtalmut') rawName = t('Hishtalmut', 'השתלמות');
    if (preset.id === 'rsu') rawName = t('RSU', 'RSU');

    // Sanitize: Allow only Alphanumeric (English + Hebrew) and spaces.
    const sanitizedName = rawName.replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Ensure uniqueness by appending a counter if name already exists
    let finalName = sanitizedName;
    let counter = 1;
    while (existingNames.includes(finalName)) {
      finalName = `${sanitizedName} ${counter}`;
      counter++;
    }
    setName(finalName);

    // Default fees from template
    if (temp) {
      setCommRate(((temp.commRate || 0) * 100).toString());
      setCommMin((temp.commMin || 0).toString());
      setCommMax((temp.commMax || 0).toString());

      // Mgmt Default
      if (temp.mgmtVal) {
        const mVal = temp.mgmtType === 'percentage' ? temp.mgmtVal * 100 : temp.mgmtVal;
        // Round to avoid floating point issues (e.g. 0.700000001)
        const rounded = Math.round(mVal * 1000) / 1000;
        setMgmtVal(rounded.toString());
      } else {
        setMgmtVal('0');
      }
      if (temp.mgmtType) setMgmtType(temp.mgmtType as any);
      if (temp.mgmtFreq) setMgmtFreq(temp.mgmtFreq as any);
    }

    // Default Exemptions
    if (preset.id === 'rsu') {
      setBuysExempt(true);
      setSellsExempt(false);
    } else if (preset.isPension || preset.id === 'gemel' || preset.id === 'hishtalmut') {
      setBuysExempt(false);
      setSellsExempt(true);
    } else {
      setBuysExempt(false);
      setSellsExempt(false);
    }

    // Enforce Mgmt Type if only one option
    if (preset.mgmtFeeModes && preset.mgmtFeeModes.length === 1) {
      setMgmtType(preset.mgmtFeeModes[0]);
    }

    setStep(2);
  };

  const handleCreate = () => {
    setErrorObj(null);
    if (!selectedPreset) return;
    if (!name.trim()) {
      setErrorObj(t('Please enter a portfolio name', 'נא להזין שם לתיק'));
      return;
    }

    // Validate Uniqueness
    if (existingNames.includes(name.trim())) {
      setErrorObj(t('Portfolio name already exists. Please choose another.', 'שם התיק כבר קיים. נא לבחור שם אחר.'));
      return;
    }

    const generatedId = name.trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    if (existingIds.includes(generatedId)) {
      setErrorObj(t('Portfolio ID already exists based on this name. Try a different name.', 'מזהה התיק כבר קיים (מבוסס על השם). נסה שם אחר.'));
      return;
    }

    const template = PORTFOLIO_TEMPLATES[selectedPreset.templateKey];
    const initialPortfolio: Partial<Portfolio> = {
      ...template,
      name: name,
      currency: currency
    };

    // Apply Tax Logic
    if (selectedPreset.hasTaxSelection) {
      if (taxType === '25') initialPortfolio.cgt = 0.25;
      else if (taxType === '28') initialPortfolio.cgt = 0.28;
      else initialPortfolio.cgt = parseFloat(customTax) / 100 || 0.25;
    }

    // Apply RSU Logic
    if (selectedPreset.id === 'rsu') {
      // Income Tax
      initialPortfolio.incTax = parseFloat(incomeTax) / 100 || 0.50;

      // Dividends
      if (rsuDivChoice === 'cash') {
        initialPortfolio.divPolicy = 'cash_taxed';
      } else if (rsuDivChoice === 'reinvest') {
        initialPortfolio.divPolicy = 'accumulate_tax_free';
      } else {
        initialPortfolio.divPolicy = 'hybrid_rsu';
      }
    }

    // Apply Pension Logic
    if (selectedPreset.isPension) {
      const taxVal = parseFloat(pensionTax) / 100 || 0.35;
      initialPortfolio.cgt = taxVal;
      initialPortfolio.incTax = taxVal;
    }

    // Apply Commissions (Available in all)
    initialPortfolio.commRate = parseFloat(commRate) / 100 || 0;
    initialPortfolio.commMin = parseFloat(commMin) || 0;
    initialPortfolio.commMax = parseFloat(commMax) || 0;

    let exemption: CommissionExemption = 'none';
    if (buysExempt && sellsExempt) exemption = 'all';
    else if (buysExempt) exemption = 'buys';
    else if (sellsExempt) exemption = 'sells';
    initialPortfolio.commExemption = exemption;

    // Apply Management Fees
    if (selectedPreset.mgmtFeeModes) {
      let mVal = parseFloat(mgmtVal);
      // If percentage, convert to decimal
      if (mgmtType === 'percentage') mVal = mVal / 100;

      initialPortfolio.mgmtVal = mVal || 0;
      initialPortfolio.mgmtType = mgmtType;
      initialPortfolio.mgmtFreq = mgmtFreq;
    }

    initialPortfolio.id = generatedId;

    onComplete(initialPortfolio);
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        {step === 2 && (
          <IconButton onClick={() => setStep(1)} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h5" fontWeight="600">
          {step === 1 ? t('Choose Portfolio Type', 'בחר סוג תיק') : t('Quick Setup', 'הגדרה מהירה')}
        </Typography>
        <Box flexGrow={1} />
        <Button onClick={onCancel} color="inherit">
          {t('Cancel', 'ביטול')}
        </Button>
      </Box>

      {step === 1 && (
        <Fade in>
          <Grid container spacing={2}>
            {PRESETS.map(preset => (
              <Grid item xs={12} sm={6} md={4} key={preset.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: theme.palette.action.hover,
                      transform: 'translateY(-2px)',
                      boxShadow: 2
                    }
                  }}
                  onClick={() => handleSelectPreset(preset)}
                >
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', height: '100%' }}>
                    <Box color="primary.main" mb={2}>
                      {preset.icon}
                    </Box>
                    <Typography variant="h6" gutterBottom>
                      {isRtl ? preset.titleHe : preset.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {isRtl ? preset.descriptionHe : preset.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {/* Custom / Manual Option */}
            <Grid item xs={12} sm={6} md={4}>
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderStyle: 'dashed',
                    borderColor: 'text.secondary',
                    transform: 'translateY(-2px)',
                    boxShadow: 2
                  }
                }}
                onClick={onManual}
              >
                <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', height: '100%' }}>
                  <Box color="text.secondary" mb={2}>
                    <SettingsSuggestIcon fontSize="large" />
                  </Box>
                  <Typography variant="h6" gutterBottom color="text.primary">
                    {t('Custom', 'מותאם אישית')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('Full control over all settings manually.', 'שליטה מלאה בכל ההגדרות באופן ידני.')}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Fade>
      )}

      {step === 2 && selectedPreset && (
        <Fade in>
          <Box maxWidth={700} mx="auto">
            <Card variant="outlined">
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={3}>
                  <Box color="primary.main">{selectedPreset.icon}</Box>
                  <Box>
                    <Typography variant="h6">
                      {isRtl ? selectedPreset.titleHe : selectedPreset.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {isRtl ? selectedPreset.descriptionHe : selectedPreset.description}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ mb: 3 }} />

                {errorObj && <Alert severity="error" sx={{ mb: 2 }}>{errorObj}</Alert>}

                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      autoFocus
                      label={t('Portfolio Name', 'שם התיק')}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t('My Portfolio', 'התיק שלי')}
                      error={!!errorObj}
                    />
                  </Grid>

                  {!selectedPreset.fixedCurrency && (
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>{t('Currency', 'מטבע')}</InputLabel>
                        <Select
                          value={currency}
                          label={t('Currency', 'מטבע')}
                          onChange={e => setCurrency(e.target.value as Currency)}
                        >
                          <MenuItem value="ILS">ILS</MenuItem>
                          <MenuItem value="USD">USD</MenuItem>
                          <MenuItem value="EUR">EUR</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  )}

                  {/* Tax Level Selection */}
                  {selectedPreset.hasTaxSelection && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        {t('Capital Gains Tax', 'מס רווח הון')}
                      </Typography>
                      <RadioGroup
                        row
                        value={taxType}
                        onChange={e => setTaxType(e.target.value as any)}
                      >
                        <FormControlLabel value="25" control={<Radio />} label={t('25% (Default)', '25% (רגיל)')} />
                        {!selectedPreset.excludeSurtax && (
                          <FormControlLabel value="28" control={<Radio />} label={t('28% (Surtax)', '28% (מס יסף)')} />
                        )}
                        <FormControlLabel value="custom" control={<Radio />} label={t('Custom', 'מותאם אישית')} />
                      </RadioGroup>

                      {/* Show helper only if Surtax isn't excluded (proxy for Non-Resident) */}
                      {!selectedPreset.excludeSurtax && (
                        <FormHelperText sx={{ mt: 1 }}>
                          {t('Note: People over 60 year old may be eligible for reduced rates (10-20%).', 'הערה: אנשים מעל גיל 60 עשויים להיות זכאים לשיעורי מס מופחתים (10-20%).')}
                        </FormHelperText>
                      )}

                      {taxType === 'custom' && (
                        <Box mt={1} ml={1}>
                          <TextField
                            label={t('Custom Rate', 'שיעור מותאם')}
                            type="number"
                            size="small"
                            value={customTax}
                            onChange={e => setCustomTax(e.target.value)}
                            autoComplete="off"
                            InputProps={{
                              endAdornment: <InputAdornment position="end">%</InputAdornment>,
                              inputProps: { min: 0, step: 'any' }
                            }}
                            sx={{ width: 150 }}
                          />
                        </Box>
                      )}
                    </Grid>
                  )}

                  {/* RSU Income Tax */}
                  {selectedPreset.hasIncomeTax && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" gutterBottom>
                        {t('Income Tax (Marginal)', 'מס הכנסה (שולי)')}
                      </Typography>
                      <TextField
                        fullWidth
                        type="number"
                        size="small"
                        label={t('Marginal Rate', 'שיעור מס שולי')}
                        value={incomeTax}
                        onChange={e => setIncomeTax(e.target.value)}
                        autoComplete="off"
                        InputProps={{
                          endAdornment: <InputAdornment position="end">%</InputAdornment>,
                          inputProps: { min: 0, step: 'any' }
                        }}
                        helperText={t('Tax rate applied to the grant value (Compensation Income)', 'שיעור המס על שווי המענק (הכנסת עבודה)')}
                      />
                    </Grid>
                  )}

                  {/* Pension Tax */}
                  {selectedPreset.isPension && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        {t('Pension Tax at Retirement', 'מיסוי פנסיה בפרישה')}
                      </Typography>
                      <TextField
                        type="number"
                        size="small"
                        label={t('Marginal Rate', 'שיעור מס שולי')}
                        value={pensionTax}
                        onChange={e => setPensionTax(e.target.value)}
                        autoComplete="off"
                        InputProps={{
                          endAdornment: <InputAdornment position="end">%</InputAdornment>,
                          inputProps: { min: 0, step: 'any' }
                        }}
                        helperText={t('Estimated marginal tax rate on pension income. Note: Complex partial exemptions on withdrawn amounts are not yet supported.', 'שיעור מס שולי משוער על הפנסיה. הערה: חישוב הטבות מס מורכבות על משיכה הונית אינו נתמך עדיין.')}
                        sx={{ width: 300 }}
                      />
                    </Grid>
                  )}

                  {/* Management Fees (Holding Fees) */}
                  {selectedPreset.mgmtFeeModes && (
                    <Grid item xs={12}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <Typography variant="subtitle2" color="text.secondary">{t('HOLDING FEES', 'דמי ניהול')}</Typography>
                        <Tooltip title={t("Recurring fees charged by the broker/manager.", "עמלות חוזרות הנגבות על ידי הברוקר/מנהל.")}>
                          <InfoOutlinedIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                      <Grid container spacing={2}>
                        <Grid item xs={selectedPreset.mgmtFeeModes.length > 1 ? 4 : 6}>
                          <TextField
                            fullWidth
                            type="number"
                            size="small"
                            label={t('Value', 'ערך')}
                            value={mgmtVal}
                            onChange={e => setMgmtVal(e.target.value)}
                            autoComplete="off"
                            InputProps={{
                              endAdornment: <InputAdornment position="end">{mgmtType === 'percentage' ? '%' : currency}</InputAdornment>,
                              inputProps: { min: 0, step: 'any' }
                            }}
                          />
                        </Grid>
                        {selectedPreset.mgmtFeeModes.length > 1 && (
                          <Grid item xs={4}>
                            <FormControl fullWidth size="small">
                              <InputLabel>{t('Type', 'סוג')}</InputLabel>
                              <Select
                                value={mgmtType}
                                label={t('Type', 'סוג')}
                                onChange={e => setMgmtType(e.target.value as any)}
                              >
                                <MenuItem value="percentage">{t('Percentage', 'אחוזים')}</MenuItem>
                                {selectedPreset.mgmtFeeModes!.includes('fixed') && (
                                  <MenuItem value="fixed">{t('Fixed Amount', 'סכום קבוע')}</MenuItem>
                                )}
                              </Select>
                            </FormControl>
                          </Grid>
                        )}
                        <Grid item xs={selectedPreset.mgmtFeeModes.length > 1 ? 4 : 6}>
                          <FormControl fullWidth size="small">
                            <InputLabel>{t('Frequency', 'תדירות')}</InputLabel>
                            <Select
                              value={mgmtFreq}
                              label={t('Frequency', 'תדירות')}
                              onChange={e => setMgmtFreq(e.target.value as any)}
                            >
                              <MenuItem value="yearly">{t('Yearly', 'שנתי')}</MenuItem>
                              <MenuItem value="quarterly">{t('Quarterly', 'רבעוני')}</MenuItem>
                              <MenuItem value="monthly">{t('Monthly', 'חודשי')}</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                      </Grid>
                    </Grid>
                  )}

                  {/* Commissions (Trading Fees) - Available in All */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Commissions', 'עמלות מסחר')}
                      {buysExempt && sellsExempt ? t(' (All Exempt)', ' (פטור מלא)') :
                        buysExempt ? t(' (Sells Only)', ' (מכירה בלבד)') :
                          sellsExempt ? t(' (Buys Only)', ' (קנייה בלבד)') :
                            t(' (Trading)', ' (מסחר)')}
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          type="number"
                          size="small"
                          label={t('Rate', 'שיעור עמלה')}
                          value={commRate === '0' ? '' : commRate}
                          placeholder="-"
                          onChange={e => setCommRate(e.target.value)}
                          autoComplete="off"
                          InputProps={{
                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            inputProps: { min: 0, step: 'any' }
                          }}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          type="number"
                          size="small"
                          label={t('Min Fee', 'עמלת מינימום')}
                          value={commMin === '0' ? '' : commMin}
                          placeholder="-"
                          onChange={e => setCommMin(e.target.value)}
                          autoComplete="off"
                          InputProps={{
                            endAdornment: <InputAdornment position="end">{currency}</InputAdornment>,
                            inputProps: { min: 0, step: 'any' }
                          }}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          type="number"
                          size="small"
                          label={t('Max Fee', 'עמלת מקסימום')}
                          value={commMax === '0' ? '' : commMax}
                          placeholder="-"
                          onChange={e => setCommMax(e.target.value)}
                          autoComplete="off"
                          InputProps={{
                            endAdornment: <InputAdornment position="end">{currency}</InputAdornment>,
                            inputProps: { min: 0, step: 'any' }
                          }}
                        />
                      </Grid>
                    </Grid>
                  </Grid>

                  {selectedPreset.id === 'rsu' && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        {t('Dividend Handling', 'טיפול בדיבידנדים')}
                      </Typography>
                      <RadioGroup
                        value={rsuDivChoice}
                        onChange={e => setRsuDivChoice(e.target.value as any)}
                      >
                        <FormControlLabel
                          value="cash"
                          control={<Radio />}
                          label={t('Cashed to account (Taxed)', 'מזומן לחשבון (ממוסה)')}
                        />
                        <FormControlLabel
                          value="hybrid"
                          control={<Radio />}
                          label={t('Hybrid: Reinvest unvested dividends (Defers Tax), Cash out after vesting', 'היברידי: צבירת דיבידנדים לפני הבשלה (דחיית מס), ומשיכה אחרי הבשלה')}
                        />
                        <FormControlLabel
                          value="reinvest"
                          control={<Radio />}
                          label={t('Automatically Reinvested (DRIP)', 'השקעה חוזרת אוטומטית (DRIP)')}
                        />
                      </RadioGroup>
                    </Grid>
                  )}
                </Grid>

                <Box mt={4} display="flex" justifyContent="flex-end" gap={2}>
                  <Button onClick={() => setStep(1)}>
                    {t('Back', 'חזור')}
                  </Button>
                  <Button variant="contained" onClick={handleCreate} startIcon={<CheckCircleIcon />}>
                    {t('Create Portfolio', 'צור תיק')}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Fade>
      )}
    </Box>
  );
}
