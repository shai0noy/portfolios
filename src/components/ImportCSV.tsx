import { useState, useEffect } from 'react';
import {
  Box, Button, Typography, TextField, FormControl, InputLabel, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableRow, TableCell, TableBody, Alert, Stepper, Step, StepLabel,
  Grid,
  Stack,
  RadioGroup,
  Radio,
  FormControlLabel,
  TableContainer,
  Paper,
  InputBase
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import type { Portfolio, Transaction } from '../lib/types';
import { parseExchange, Exchange } from '../lib/types';
import { batchAddTransactions, addTransaction, fetchPortfolios } from '../lib/sheets/index';
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
  const [errorMsg, setErrorMsg] = useState('');
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
    ticker: '', date: '', type: '', qty: '', price: '', exchange: '',
    commission: '', currency: '', vestDate: '', comment: ''
  });
  const [manualExchange, setManualExchange] = useState('');
  const [exchangeMode, setExchangeMode] = useState<'map' | 'manual' | 'deduce'>('deduce');
  const [parsedTxns, setParsedTxns] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);

  const handleTxnChange = (index: number, field: keyof Transaction, value: any) => {
    setParsedTxns(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };
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

  const parseCsvLine = (text: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return;

    const head = parseCsvLine(lines[0]);
    const data = lines.slice(1).map(l => parseCsvLine(l));

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
      if (lh.includes('commission') || lh.includes('fee')) newMap.commission = h;
      if (lh.includes('currency')) newMap.currency = h;
      if (lh.includes('vest') || lh.includes('vesting')) newMap.vestDate = h;
      if (lh.includes('comment') || lh.includes('note')) newMap.comment = h;
    });
    setMapping(newMap);

    if (newMap.exchange) {
      setExchangeMode('map');
    } else {
      setExchangeMode('deduce');
    }
  };

  const handleNext = () => {
    setErrorMsg('');
    if (activeStep === 0) {
      if (!csvText || !portfolioId) {
        setErrorMsg(t("Please select a portfolio and provide CSV data.", "יש לבחור תיק ולספק נתוני CSV."));
        return;
      }
      parseCSV(csvText);
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Validate Mapping
      if (!mapping.ticker || !mapping.date || !mapping.qty || !mapping.price) {
        setErrorMsg(t("Please map all required fields (Ticker, Date, Qty, Price).", "יש למפות את כל שדות החובה (סימול, תאריך, כמות, מחיר)."));
        return;
      }
      if (exchangeMode === 'manual' && !mapping.exchange && !manualExchange) {
        setErrorMsg(t("Please enter a manual exchange or choose a different mode.", "יש להזין בורסה ידנית או לבחור מצב אחר."));
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
        d = new Date(`${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`);
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

      let rawTicker = getVal('ticker').toUpperCase().trim();
      let deducedExchangeStr = '';

      const safeParseExchange = (v: string) => {
        if (v === 'IL') return 'TASE';
        try { return parseExchange(v); } catch { return undefined; }
      };

      if (rawTicker.includes(':')) {
        const parts = rawTicker.split(':');
        if (parts.length === 2) {
          const ex1 = safeParseExchange(parts[0]);
          const ex2 = safeParseExchange(parts[1]);
          if (ex1) { deducedExchangeStr = ex1; rawTicker = parts[1]; }
          else if (ex2) { deducedExchangeStr = ex2; rawTicker = parts[0]; }
        }
      } else if (rawTicker.includes('.')) {
        const parts = rawTicker.split('.');
        if (parts.length === 2) {
          const ex1 = safeParseExchange(parts[0]);
          const ex2 = safeParseExchange(parts[1]);
          if (ex2) { deducedExchangeStr = ex2; rawTicker = parts[0]; }
          else if (ex1) { deducedExchangeStr = ex1; rawTicker = parts[1]; }
        }
      }

      const isNumericTicker = /^\d+$/.test(rawTicker);
      let numericId: number | undefined = undefined;
      if (isNumericTicker) {
        numericId = parseInt(rawTicker, 10);
      }

      let colExchangeStr = '';
      if (mapping.exchange) {
        colExchangeStr = getVal('exchange').toUpperCase().trim();
      } else if (exchangeMode === 'manual') {
        colExchangeStr = manualExchange.toUpperCase().trim();
      }

      let parsedColExchange = undefined;
      if (colExchangeStr) {
        parsedColExchange = safeParseExchange(colExchangeStr);
      }

      if (parsedColExchange && deducedExchangeStr && parsedColExchange !== deducedExchangeStr) {
        console.warn(`Exchange mismatch for ${rawTicker}: CSV column says ${parsedColExchange}, ticker prefix/suffix says ${deducedExchangeStr}`);
        return null;
      }

      const finalExchangeStr = parsedColExchange || deducedExchangeStr || (isNumericTicker ? 'TASE' : 'NASDAQ');

      let parsedExchange = undefined;
      try {
        parsedExchange = parseExchange(finalExchangeStr);
      } catch {
        // Fallback
      }

      const commissionStr = getVal('commission');
      const commission = parseFloat(commissionStr);

      const currencyStr = getVal('currency').toUpperCase();

      const vestDateStr = getVal('vestDate');
      let vestIsoDate = '';
      if (vestDateStr) {
        let vd: Date;
        if (vestDateStr.match(/^\d{8}$/)) {
          vd = new Date(`${vestDateStr.substring(0, 4)}-${vestDateStr.substring(4, 6)}-${vestDateStr.substring(6, 8)}`);
        } else {
          vd = new Date(vestDateStr);
        }
        if (vd && !isNaN(vd.getTime())) {
          vestIsoDate = vd.toISOString().split('T')[0];
        }
      }

      const comment = getVal('comment');

      let finalCurrency = currencyStr;
      if (!finalCurrency && parsedExchange) {
        if (['TASE', 'GEMEL', 'PENSION', 'CBS', 'TLV'].includes(parsedExchange.toString())) {
          finalCurrency = 'ILA';
        } else if (['NASDAQ', 'NYSE', 'NYSEARCA'].includes(parsedExchange.toString())) {
          finalCurrency = 'USD';
        } else if (['LSE'].includes(parsedExchange.toString())) {
          finalCurrency = 'GBP';
        } else if (['EURONEXT', 'FWB'].includes(parsedExchange.toString())) {
          finalCurrency = 'EUR';
        } else if (['TSX'].includes(parsedExchange.toString())) {
          finalCurrency = 'CAD';
        }
      }

      const now = new Date();
      const sourceId = `CSV_Import_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;

      return {
        date: isoDate,
        portfolioId,
        ticker: rawTicker,
        exchange: parsedExchange,
        type,
        originalQty: isNaN(qty) ? 0 : Math.abs(qty), // Store absolute qty, logic handles sign
        originalPrice: isNaN(price) ? 0 : price,
        comment: comment || 'Imported via CSV',
        commission: isNaN(commission) ? undefined : Math.abs(commission),
        currency: finalCurrency || undefined,
        vestDate: vestIsoDate || undefined,
        numericId,
        Source: sourceId,
      } as Transaction;
    }).filter(t => t !== null && t.ticker && t.originalQty > 0) as Transaction[]; // Filter invalid rows

    txns.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));

    setParsedTxns(txns);
  };

  const handleImport = async () => {
    setImporting(true);
    setErrorMsg('');
    try {
      const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
      const failedTickers: string[] = [];

      // Add all transactions in one bulk batch request
      if (parsedTxns.length > 0) {
        let attempts = 0;
        const maxAttempts = 3;
        let batchSuccess = false;

        while (attempts < maxAttempts) {
          try {
            await batchAddTransactions(sheetId, parsedTxns);
            batchSuccess = true;
            break;
          } catch (e: any) {
            attempts++;
            if (e?.result?.error?.code === 429 || e?.status === 429 || e?.message?.includes('429')) {
              if (attempts >= maxAttempts) {
                // Quota exhausted on batch, break to fallback or throw
                break;
              }
              // wait then retry
              await wait(3000 * attempts);
            } else {
              break; // Not a quota issue, break to use individual fallback
            }
          }
        }

        if (!batchSuccess) {
          console.warn("Batch insert failed. Falling back to individual insertion for error isolation...");

          for (const t of parsedTxns) {
            try {
              // Retry individual with quota backoff
              let singleAttempts = 0;
              let singleSuccess = false;
              while (singleAttempts < 3) {
                try {
                  await addTransaction(sheetId, t);
                  singleSuccess = true;
                  break;
                } catch (err: any) {
                  singleAttempts++;
                  if (err?.result?.error?.code === 429 || err?.status === 429 || err?.message?.includes('429')) {
                    await wait(3000 * singleAttempts);
                  } else {
                    break; 
                  }
                }
              }
              if (!singleSuccess) failedTickers.push(t.ticker);
            } catch {
              failedTickers.push(t.ticker);
            }
          }
        }
      }

      setImporting(false);

      if (failedTickers.length > 0) {
        setErrorMsg(t("Import finished with errors. Failed to import: ", "הייבוא הסתיים עם שגיאות. נכשל עבור: ") + failedTickers.join(', '));
      } else {
        onSuccess();
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(t("Error importing transactions. ", "שגיאה בייבוא עסקאות. ") + (e.message || ''));
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

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg('')}>
            {errorMsg}
          </Alert>
        )}

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
              {['ticker', 'exchange', 'date', 'type', 'qty', 'price', 'commission', 'currency', 'vestDate', 'comment'].map(field => {
                const fieldLabels: Record<string, { en: string, he: string }> = {
                  ticker: { en: 'Ticker', he: 'סימול' },
                  exchange: { en: 'Exchange', he: 'בורסה' },
                  date: { en: 'Date', he: 'תאריך' },
                  type: { en: 'Type', he: 'סוג' },
                  qty: { en: 'Qty', he: 'כמות' },
                  price: { en: 'Price', he: 'מחיר' },
                  commission: { en: 'Commission', he: 'עמלה' },
                  currency: { en: 'Currency', he: 'מטבע' },
                  vestDate: { en: 'Vest Date', he: 'תאריך הבשלה' },
                  comment: { en: 'Comment', he: 'הערה' }
                };
                const label = t(fieldLabels[field].en, fieldLabels[field].he);
                return (
                  <Grid item key={field} xs={12} sm={6} md={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{label}</InputLabel>
                      <Select
                        value={mapping[field]}
                        label={label}
                        onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                      >
                        <MenuItem value="">-- {t('Ignore', 'התעלם')} --</MenuItem>
                        {headers.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                );
              })}
            </Grid>

            {mapping.exchange ? (
              <Alert severity="success" sx={{ mt: 2 }}>
                {t("Exchange column is mapped. Auto-deduce and manual fallback are disabled.", "עמודת בורסה מופתה. זיהוי אוטומטי והזנה ידנית מושבתים.")}
              </Alert>
            ) : (
              <>
                <Typography variant="body2" sx={{ pt: 1, fontWeight: 500 }}>{t('Fallback Exchange', 'בורסת ברירת מחדל')}</Typography>
                <FormControl component="fieldset">
                    <RadioGroup
                      row
                      value={exchangeMode}
                      onChange={(e) => {
                        const newMode = e.target.value as 'manual' | 'deduce';
                        setExchangeMode(newMode);
                        if (newMode !== 'manual') setManualExchange('');
                      }}
                    >
                      <FormControlLabel value="deduce" control={<Radio size="small" />} label={t("Auto-Deduce", "זיהוי אוטומטי")} />
                      <FormControlLabel value="manual" control={<Radio size="small" />} label={t("Manual Input", "הזנה ידנית")} />
                    </RadioGroup>
                </FormControl>

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
                      {t("Exchange will be deduced from prefix/suffix (e.g. IL:123), or auto-detected based on ticker format ('TASE' for numbers, 'NASDAQ' otherwise).", "הבורסה תזוהה לפי קידומת/סיומת (כמו IL:123), או תזוהה אוטומטית לפי פורמט הסימול (מספרים ל-TASE, אחרת NASDAQ).")}
                    </Alert>
                )}
              </>
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
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
              <Table size="small" stickyHeader sx={{ minWidth: 800 }}>
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
                      <TableCell>
                        <InputBase
                          type="date"
                          value={t.date}
                          onChange={(e) => handleTxnChange(i, 'date', e.target.value)}
                          sx={{ fontSize: '0.875rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <InputBase
                          value={t.ticker}
                          onChange={(e) => handleTxnChange(i, 'ticker', e.target.value.toUpperCase())}
                          sx={{ fontSize: '0.875rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          variant="standard"
                          value={t.exchange || ''}
                          onChange={(e) => handleTxnChange(i, 'exchange', e.target.value)}
                          sx={{ fontSize: '0.875rem', width: 90, '&:before': { display: 'none' }, '&:after': { display: 'none' } }}
                        >
                          <MenuItem value=""><em>None</em></MenuItem>
                          {Object.values(Exchange).map((ex) => (
                            <MenuItem key={ex} value={ex}>{ex}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          variant="standard"
                          value={t.type}
                          onChange={(e) => handleTxnChange(i, 'type', e.target.value)}
                          sx={{ fontSize: '0.875rem', '&:before': { display: 'none' }, '&:after': { display: 'none' } }}
                        >
                          <MenuItem value="BUY">BUY</MenuItem>
                          <MenuItem value="SELL">SELL</MenuItem>
                          <MenuItem value="DIVIDEND">DIVIDEND</MenuItem>
                          <MenuItem value="FEE">FEE</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell align="right">
                        <InputBase
                          type="number"
                          value={t.originalQty}
                          onChange={(e) => handleTxnChange(i, 'originalQty', parseFloat(e.target.value) || 0)}
                          inputProps={{ style: { textAlign: 'right' } }}
                          sx={{ fontSize: '0.875rem', width: 80 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <InputBase
                          type="number"
                          value={t.originalPrice}
                          onChange={(e) => handleTxnChange(i, 'originalPrice', parseFloat(e.target.value) || 0)}
                          inputProps={{ style: { textAlign: 'right' } }}
                          sx={{ fontSize: '0.875rem', width: 80 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {`${(Number(t.originalQty || 0) * Number(t.originalPrice || 0)).toFixed(2)} ${t.currency || ''}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
