import { useState, useEffect } from 'react';
import { 
  Box, Button, Typography, TextField, FormControl, InputLabel, Select, MenuItem, 
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableRow, 
  TableCell, TableBody, Alert, Stepper, Step, StepLabel,
  Grid,
  Stack,
  RadioGroup,
  Radio,
  FormControlLabel
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import type { Portfolio, Transaction } from '../lib/types';
import { parseExchange } from '../lib/types';
import { addTransaction, fetchPortfolios } from '../lib/sheets/index';
import { ImportHelp } from './ImportHelp';
import { useLanguage } from '../lib/i18n';

interface Props {
  sheetId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportCSV({ sheetId, open, onClose, onSuccess }: Props) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const { t, isRtl } = useLanguage();
  const STEPS = [t('Input Data', 'הזנת נתונים'), t('Map Columns', 'מיפוי עמודות'), t('Review & Import', 'בדיקה וייבוא')];
  
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
    ticker: '', date: '', type: '', qty: '', price: '', exchange: ''
  });
  const [manualExchange, setManualExchange] = useState('');
  const [exchangeMode, setExchangeMode] = useState<'map' | 'manual' | 'deduce'>('deduce');
  const [parsedTxns, setParsedTxns] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      setCsvText(evt.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) {
      processFile(file);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return;
    
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
      if (lh.includes('exchange')) newMap.exchange = h;
    });
    setMapping(newMap);

    if (newMap.exchange) {
        setExchangeMode('map');
    } else {
        setExchangeMode('deduce');
    }
  };

  const handleNext = () => {
    if (activeStep === 0) {
      if (!csvText || !portfolioId) {
        alert(t("Please select a portfolio and provide CSV data.", "יש לבחור תיק ולספק נתוני CSV."));
        return;
      }
      parseCSV(csvText);
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Validate Mapping
      if (!mapping.ticker || !mapping.date || !mapping.qty || !mapping.price) {
        alert(t("Please map all required fields (Ticker, Date, Qty, Price).", "יש למפות את כל שדות החובה (סימול, תאריך, כמות, מחיר)."));
        return;
      }
      if (exchangeMode === 'map' && !mapping.exchange) {
        alert(t("Please select a column for Exchange or choose a different mode.", "יש לבחור עמודה עבור בורסה או לבחור מצב אחר."));
        return;
      }
      if (exchangeMode === 'manual' && !manualExchange) {
          alert(t("Please enter a manual exchange or choose a different mode.", "יש להזין בורסה ידנית או לבחור מצב אחר."));
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
      const rawDate = getVal('date');
      let isoDate = '';
      
      let d: Date;
      // Try to parse YYYYMMDD
      if (rawDate.match(/^\d{8}$/)) {
        d = new Date(`${rawDate.substring(0,4)}-${rawDate.substring(4,6)}-${rawDate.substring(6,8)}`);
      } else {
        d = new Date(rawDate);
      }

      if (d && !isNaN(d.getTime())) {
        isoDate = d.toISOString().split('T')[0];
      }

      // Type Parsing
      const rawType = getVal('type').toUpperCase();
      let type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' = 'BUY'; // Default
      if (rawType.includes('SELL') || rawType.includes('SOLD')) type = 'SELL';
      if (rawType.includes('DIV')) type = 'DIVIDEND';
      if (rawType.includes('FEE')) type = 'FEE';

      const qty = parseFloat(getVal('qty'));
      const price = parseFloat(getVal('price'));

      let exchange: string;
      if (exchangeMode === 'map') {
          exchange = getVal('exchange').toUpperCase();
      } else if (exchangeMode === 'manual') {
          exchange = manualExchange;
      } else { // deduce
          const tickerVal = getVal('ticker');
          exchange = /\d/.test(tickerVal) ? 'TASE' : 'NASDAQ';
      }

      const now = new Date();
      const sourceId = `CSV_Import_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;

      return {
        date: isoDate,
        portfolioId,
        ticker: getVal('ticker').toUpperCase(),
        exchange: parseExchange(exchange),
        type,
        originalQty: isNaN(qty) ? 0 : Math.abs(qty), // Store absolute qty, logic handles sign
        originalPrice: isNaN(price) ? 0 : price,
        grossValue: (isNaN(qty) ? 0 : Math.abs(qty)) * (isNaN(price) ? 0 : price),
        comment: 'Imported via CSV',
        Source: sourceId,
      };
    }).filter(t => t.ticker && t.originalQty > 0); // Filter invalid rows

    setParsedTxns(txns);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      for (const t of parsedTxns) {
        await addTransaction(sheetId, t);
      }
      setImporting(false);
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert(t("Error importing transactions. Check console.", "שגיאה בייבוא עסקאות. בדוק את הקונסול."));
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('Import Transactions from CSV', 'ייבוא עסקאות מקובץ CSV')}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3, mt: 1 }}>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {activeStep === 0 && (
          <Stack spacing={3} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('Target Portfolio', 'תיק יעד')}</InputLabel>
              <Select value={portfolioId} label={t('Target Portfolio', 'תיק יעד')} onChange={e => setPortfolioId(e.target.value)}>
                {portfolios.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack spacing={1}>
                <Alert severity="info" sx={{ mb: 1 }} action={
                  <Button color="inherit" size="small" onClick={() => setHelpOpen(true)}>
                    {t('Help', 'עזרה')}
                  </Button>
                }>
                  <Typography variant="body2" component="div">
                    <strong>{t('Tip:', 'טיפ:')}</strong> {t('Ensure your CSV includes these columns: Symbol, Date, Type, Qty, Price.', 'ודא שהקובץ מכיל את העמודות: סימול, תאריך, סוג, כמות, מחיר.')}
                  </Typography>
                </Alert>

                <Box
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    sx={{
                        border: '2px dashed',
                        borderColor: isDragging ? 'primary.main' : 'grey.400',
                        borderRadius: 1,
                        p: 3,
                        textAlign: 'center',
                        bgcolor: isDragging ? 'action.hover' : 'background.paper',
                        transition: 'all 0.2s ease-in-out'
                    }}
                >
                    <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
                        {t('Upload CSV File', 'העלאת קובץ CSV')}
                        <input type="file" hidden accept=".csv" onChange={handleFileChange} />
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {t('or drag and drop here', 'או גרירה לכאן')}
                    </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                    {t('Or paste CSV content below:', 'או הדבקת תוכן כאן:')}
                </Typography>
                <TextField
                    multiline rows={8} fullWidth 
                    placeholder="Symbol,Date,Type,Qty,Price..."
                    value={csvText} onChange={e => setCsvText(e.target.value)}
                    sx={{ fontFamily: 'monospace' }}
                />
            </Stack>
          </Stack>
        )}

        {activeStep === 1 && (
            <Stack spacing={2} sx={{ pt: 1 }}>
                <Typography gutterBottom>{t('Map CSV Columns to Transaction Fields:', 'התאמת עמודות לשדות:')}</Typography>
                <Grid container spacing={2}>
                    {['ticker', 'date', 'type', 'qty', 'price'].map(field => (
                        <Grid item key={field} xs={12} sm={6} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>{t(field.charAt(0).toUpperCase() + field.slice(1), field === 'ticker' ? 'סימול' : field === 'date' ? 'תאריך' : field === 'type' ? 'סוג' : field === 'qty' ? 'כמות' : 'מחיר')}</InputLabel>
                                <Select
                                    value={mapping[field]}
                                    label={t(field.charAt(0).toUpperCase() + field.slice(1), field === 'ticker' ? 'סימול' : field === 'date' ? 'תאריך' : field === 'type' ? 'סוג' : field === 'qty' ? 'כמות' : 'מחיר')}
                                    onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                                >
                                    <MenuItem value="">-- {t('Ignore', 'התעלם')} --</MenuItem>
                                    {headers.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                    ))}
                </Grid>

                <Typography variant="body2" sx={{ pt: 1, fontWeight: 500 }}>{t('Exchange', 'בורסה')}</Typography>
                <FormControl component="fieldset">
                    <RadioGroup
                        row
                        value={exchangeMode}
                        onChange={(e) => {
                            const newMode = e.target.value as 'map' | 'manual' | 'deduce';
                            setExchangeMode(newMode);
                            if (newMode !== 'map') setMapping(prev => ({ ...prev, exchange: '' }));
                            if (newMode !== 'manual') setManualExchange('');
                        }}
                    >
                        <FormControlLabel value="map" control={<Radio size="small" />} label={t("Map from CSV", "לפי הקובץ")} />
                        <FormControlLabel value="manual" control={<Radio size="small" />} label={t("Manual Input", "הזנה ידנית")} />
                        <FormControlLabel value="deduce" control={<Radio size="small" />} label={t("Auto-Deduce", "זיהוי אוטומטי")} />
                    </RadioGroup>
                </FormControl>

                {exchangeMode === 'map' && (
                    <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                        <InputLabel>{t('CSV Column for Exchange', 'עמודת בורסה בקובץ')}</InputLabel>
                        <Select
                            value={mapping.exchange}
                            label={t('CSV Column for Exchange', 'עמודת בורסה בקובץ')}
                            onChange={e => setMapping(prev => ({ ...prev, exchange: e.target.value }))}
                        >
                            <MenuItem value="">-- {t('Select Column', 'בחר עמודה')} --</MenuItem>
                            {headers.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                        </Select>
                    </FormControl>
                )}

                {exchangeMode === 'manual' && (
                    <TextField
                        label={t("Manual Exchange for all transactions", "בורסה עבור כל העסקאות")}
                        size="small"
                        fullWidth
                        sx={{ mt: 1 }}
                        value={manualExchange}
                        onChange={e => setManualExchange(e.target.value.toUpperCase())}
                        helperText="e.g. NASDAQ, TASE"
                    />
                )}

                {exchangeMode === 'deduce' && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                        {t("Exchange will be auto-detected based on ticker format ('TASE' for tickers with numbers, 'NASDAQ' otherwise).", "הבורסה תזוהה אוטומטית לפי פורמט הסימול (מספרים ל-TASE, אחרת NASDAQ).")}
                    </Alert>
                )}
                
                <Alert severity="info" sx={{ mt: 2 }}>
                    {t('Required: Ticker, Date, Qty, Price.', 'חובה: סימול, תאריך, כמות, מחיר.')}
                </Alert>
            </Stack>
        )}

        {activeStep === 2 && (
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="subtitle2">
              {t('Ready to import', 'מוכן לייבוא')} {parsedTxns.length} {t('transactions:', 'עסקאות:')}
            </Typography>
            <Box sx={{ maxHeight: 400, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('Date', 'תאריך')}</TableCell>
                    <TableCell>{t('Ticker', 'סימול')}</TableCell>
                    <TableCell>{t('Exchange', 'בורסה')}</TableCell>
                    <TableCell>{t('Type', 'סוג')}</TableCell>
                    <TableCell align="right">{t('Orig. Qty', 'כמות מקורית')}</TableCell>
                    <TableCell align="right">{t('Orig. Price', 'מחיר מקורי')}</TableCell>
                    <TableCell align="right">{t('Total', 'סה"כ')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedTxns.map((t, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>{t.ticker}</TableCell>
                      <TableCell>{t.exchange}</TableCell>
                      <TableCell>{t.type}</TableCell>
                      <TableCell align="right">{t.originalQty}</TableCell>
                      <TableCell align="right">{t.originalPrice.toFixed(2)}</TableCell>
                      <TableCell align="right">{t.grossValue?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        )}

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{t('Cancel', 'ביטול')}</Button>
        <Button onClick={() => setActiveStep(p => p - 1)} disabled={activeStep === 0} sx={{ [isRtl ? 'ml' : 'mr']: 1 }}>{t('Back', 'חזרה')}</Button>
        <Button onClick={handleNext} variant="contained" disabled={importing}>
          {activeStep === 2 ? (importing ? t('Importing...', 'מייבא...') : t('Import', 'ייבוא')) : t('Next', 'הבא')}
        </Button>
      </DialogActions>
      <ImportHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Dialog>
  );
}
