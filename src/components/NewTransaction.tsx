import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl,
  Typography, Alert, InputAdornment, Grid, Card, CardContent, Divider, Tooltip, Chip,
  Backdrop, CircularProgress
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DeleteIcon from '@mui/icons-material/Delete';
import { parseExchange, type Portfolio, type Transaction, Exchange } from '../lib/types';
import type { TickerProfile } from '../lib/types/ticker';
import { addTransaction, fetchPortfolios, addExternalPrice, syncDividends, addDividendEvent, updateTransaction, updateDividend, deleteTransaction, deleteDividend } from '../lib/sheets/index';
import { getTickerData, type TickerData } from '../lib/fetching';
import { TickerSearch } from './TickerSearch';
import { convertCurrency, formatPrice, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { Currency, type ExchangeRates } from '../lib/types';
import { useLanguage } from '../lib/i18n';

interface Props {
  sheetId: string;
  onSaveSuccess?: (message?: string, undoCallback?: () => void) => void;
  refreshTrigger?: number;
}

export const TransactionForm = ({ sheetId, onSaveSuccess, refreshTrigger }: Props) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { 
      prefilledTicker?: string, prefilledExchange?: string, initialPrice?: string, 
      initialCurrency?: string, numericId?: number, initialName?: string, initialNameHe?: string,
      editTransaction?: Transaction, editDividend?: { ticker: string, exchange: Exchange, date: Date, amount: number, source: string, rowIndex: number }
  } | null;

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isPortfoliosLoading, setIsPortfoliosLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ current: { USD: 1 } });
  const { t, tTry } = useLanguage();

  // Form State
  const [selectedTicker, setSelectedTicker] = useState<(TickerData & { symbol: string }) | null>(null);
  const [showForm, setShowForm] = useState(!!locationState?.prefilledTicker);
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState(locationState?.prefilledTicker || '');
  const [exchange, setExchange] = useState(locationState?.prefilledExchange || '');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'DIV_EVENT'>('BUY');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>(() => {
    const p = locationState?.initialPrice;
    if (!p) return '';
    const num = parseFloat(p);
    return isNaN(num) ? p : parseFloat(num.toFixed(6)).toString();
  });
  const [total, setTotal] = useState<string>('');
  const [vestDate, setVestDate] = useState('');
  const [comment, setComment] = useState('');
  const [commission, setCommission] = useState<string>('');
  const [tickerCurrency, setTickerCurrency] = useState<Currency>(normalizeCurrency(locationState?.initialCurrency || ''));
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: boolean }>({});
  const [commissionPct, setCommissionPct] = useState<string>('');
  
  // Undo State
  const [undoData, setUndoData] = useState<{ type: 'txn' | 'div', action: 'update' | 'delete' | 'add', data: any, originalData?: any } | null>(null);
  const undoDataRef = useRef<{ type: 'txn' | 'div', action: 'update' | 'delete' | 'add', data: any, originalData?: any } | null>(null);

  useEffect(() => {
      undoDataRef.current = undoData;
  }, [undoData]);

  useEffect(() => {
    getExchangeRates(sheetId).then(setExchangeRates);
  }, [sheetId]);

  useEffect(() => {
    setSaveSuccess(false);
    const editTxn = locationState?.editTransaction;
    const editDiv = locationState?.editDividend;
    const prefilledTicker = locationState?.prefilledTicker || editTxn?.ticker || editDiv?.ticker;
    const prefilledExchange = locationState?.prefilledExchange || (editTxn?.exchange as string) || (editDiv?.exchange as string);

    if (prefilledTicker) {
      const fetchData = async () => {
        setLoading(true);
        const data = await getTickerData(prefilledTicker!, prefilledExchange || '',
          locationState?.numericId || editTxn?.numericId || null, undefined, false);

        if (data) {
          const combinedData: TickerData & { symbol: string } = {
            ...data,
            symbol: prefilledTicker!,
            exchange: data.exchange || parseExchange(prefilledExchange || ''),
            numericId: locationState?.numericId || data.numericId,
            name: data.name || locationState?.initialName,
            nameHe: data.nameHe || locationState?.initialNameHe
          };
          setSelectedTicker(combinedData);
          setExchange(data.exchange || prefilledExchange || '');
          setTicker(prefilledTicker!)
          setShowForm(true);

          if (editTxn) {
              setPortId(editTxn.portfolioId);
              setType(editTxn.type as any); // BUY/SELL/FEE/DIVIDEND
              setDate(editTxn.date); // Assuming stored as ISO string YYYY-MM-DD or readable? toGoogleSheetDateFormat converts to DD/MM/YYYY. 
              
              const parseSheetDate = (d: string) => {
                  if (d.match(/^\d{4}-\d{2}-\d{2}$/)) return d;
                  if (d.includes('/')) {
                      const [day, month, year] = d.split('/');
                      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                  }
                  return d;
              };
              setDate(parseSheetDate(editTxn.date));
              setQty(editTxn.originalQty?.toString() || '');
              setPrice(editTxn.originalPrice?.toString() || '');
              // Calculate total?
              if (editTxn.originalQty && editTxn.originalPrice) {
                  setTotal((editTxn.originalQty * editTxn.originalPrice).toFixed(2)); // Approx
              }
              setVestDate(editTxn.vestDate ? parseSheetDate(editTxn.vestDate) : '');
              setComment(editTxn.comment || '');
              setCommission(editTxn.commission?.toString() || '');
              setTickerCurrency(normalizeCurrency(editTxn.currency || data.currency || ''));
          } else if (editDiv) {
              setType('DIV_EVENT');
              const d = new Date(editDiv.date);
              setDate(d.toISOString().split('T')[0]);
              setPrice(editDiv.amount.toString());
              setTickerCurrency(normalizeCurrency(data.currency || '')); // Dividends usually in stock currency
          } else {
              // New Entry defaults
              setPrice(data.price ? parseFloat(data.price.toFixed(6)).toString() : '');
              setTickerCurrency(normalizeCurrency(data.currency || ''));
          }

          // Sync dividends if from a fresh fetch (not from cache)
          if (!editTxn && !editDiv && data.dividends && data.dividends.length > 0 && !data.fromCacheMax) {
            syncDividends(sheetId, prefilledTicker!, parseExchange(data.exchange || prefilledExchange || ''), data.dividends, 'YAHOO');
          }
        } else {
          setPriceError(`${t('Ticker not found on', 'הנייר לא נמצא ב-')}${prefilledExchange}`);
          setSelectedTicker(null);
          setShowForm(false);
        }
        setLoading(false);
      };
      fetchData();
    }
  }, [locationState]);

  useEffect(() => {
    setIsPortfoliosLoading(true);
    fetchPortfolios(sheetId).then(ports => {
      setPortfolios(ports);
      if (ports.length > 0 && !portId) {
        setPortId(ports[0].id);
      }
      setIsPortfoliosLoading(false);
    }).catch(() => {
      setIsPortfoliosLoading(false);
    });
  }, [sheetId, refreshTrigger]);

  const handleTickerSelect = async (profile: TickerProfile) => {
    setLoading(true);
    // Hide TickerSearch and show loading indicator
    setSelectedTicker({ 
        ...profile, 
        price: 0, 
        currency: '', 
        exchange: profile.exchange, 
        ticker: profile.symbol, 
        numericId: profile.securityId ?? null 
    });
    setShowForm(false); 
    
    const data = await getTickerData(profile.symbol, profile.exchange, profile.securityId ?? null);
    setLoading(false);

    if (data) {
        // Sync dividends if from a fresh fetch (not from cache)
        if (data.dividends && data.dividends.length > 0 && !data.fromCacheMax) {
            syncDividends(sheetId, profile.symbol, profile.exchange, data.dividends, data.source || 'API');
        }

        const combinedData: TickerData & { symbol: string } = {
            ...data,
            symbol: profile.symbol,
            exchange: data.exchange || profile.exchange,
            numericId: profile.securityId || data.numericId,
            name: data.name || profile.name,
            nameHe: data.nameHe || profile.nameHe,
        };
        
        setSelectedTicker(combinedData);
        setTicker(combinedData.symbol);
        setExchange(combinedData.exchange || '');
        setShowForm(true); // Show form with data
        setPriceError('');
        if (combinedData.price) {
            setPrice(parseFloat(combinedData.price.toFixed(6)).toString());
            setTickerCurrency(normalizeCurrency(combinedData.currency || ''));
        } else {
            setPrice('');
            setTickerCurrency(Currency.USD);
        }
        setQty('');
        setTotal('');
        setComment('');
        setCommission('');
        setCommissionPct('');
        setVestDate('');
        setType('BUY');
        setDate(new Date().toISOString().split('T')[0]);
        setSaveSuccess(false);

    } else {
        setPriceError(`${t('Could not fetch data for', 'לא ניתן היה לטעון מידע עבור')} ${profile.symbol}`);
        setSelectedTicker(null); // This will cause TickerSearch to reappear.
        setShowForm(false);
    }
  };

  const EPS = 1e-12;
  const majorCurrency = tickerCurrency === Currency.ILA ? Currency.ILS : tickerCurrency;

  // Helper to calculate and set commission
  const updateCommission = (currentTotal: string, currentPortId: string, currentType: string) => {
    const selectedPort = portfolios.find(p => p.id === currentPortId);
    if (!selectedPort || currentType === 'DIV_EVENT') return;

    const t = parseFloat(currentTotal);
    if (!Number.isFinite(t) || t === 0) {
      setCommission('');
      setCommissionPct('');
      return;
    }

    if (currentType === 'BUY' || currentType === 'SELL') {
      const rate = selectedPort.commRate;
      const min = selectedPort.commMin;
      const max = selectedPort.commMax;
      const rawFee = t * rate;
      const clampedMin = Math.max(rawFee, min);
      const finalFee = max > 0 ? Math.min(clampedMin, max) : clampedMin;
      setCommission(finalFee.toFixed(2));
      setCommissionPct(((finalFee / t) * 100).toFixed(4));
    } else if (currentType === 'DIVIDEND') {
      const rate = selectedPort.divCommRate;
      setCommission((t * rate).toFixed(2));
      setCommissionPct((rate * 100).toFixed(4));
    }
  };

  const handleQtyChange = (val: string) => {
    setQty(val);
    const q = parseFloat(val);
    const p = parseFloat(price);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      const rawTotal = q * p;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
      setTotal(totalStr);
      updateCommission(totalStr, portId, type);
    } else {
      // If qty or price invalid, reset total? Or keep as is?
      // Usually if one is empty we might want to clear total or just commission
      if (val === '' || price === '') {
        updateCommission('0', portId, type); // Reset commission
      }
    }
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    const q = parseFloat(qty);
    const p = parseFloat(val);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      const rawTotal = q * p;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
      setTotal(totalStr);
      updateCommission(totalStr, portId, type);
    } else {
      if (val === '' || qty === '') {
        updateCommission('0', portId, type);
      }
    }
  };

  const handleTotalChange = (val: string) => {
    setTotal(val);
    updateCommission(val, portId, type);

    const q = parseFloat(qty);
    const p = parseFloat(price);
    const tDisplay = parseFloat(val);

    if (Number.isFinite(tDisplay)) {
      const tRaw = convertCurrency(tDisplay, majorCurrency, tickerCurrency, exchangeRates);

      if (Number.isFinite(p) && Math.abs(p) > EPS) {
        setQty(parseFloat((tRaw / p).toFixed(6)).toString());
      } else if (Number.isFinite(q) && Math.abs(q) > EPS) {
        setPrice(parseFloat((tRaw / q).toFixed(6)).toString());
      }
    }
  };

  const handleCommissionChange = (val: string) => {
    setCommission(val);
    const comm = parseFloat(val);
    const t = parseFloat(total); // total is now in major currency
    if (Number.isFinite(comm) && Number.isFinite(t) && Math.abs(t) > EPS) {
      setCommissionPct(((comm / t) * 100).toFixed(4));
    } else {
      setCommissionPct('');
    }
  };

  const handleCommissionPctChange = (val: string) => {
    setCommissionPct(val);
    const pct = parseFloat(val);
    const t = parseFloat(total); // total is now in major currency
    if (Number.isFinite(pct) && Number.isFinite(t)) {
      setCommission((t * (pct / 100)).toFixed(2));
    } else {
      setCommission('');
    }
  };

  // Update commission when portfolio or type changes too
  const handlePortChange = (e: any) => {
    const newPortId = e.target.value;
    setPortId(newPortId);
    updateCommission(total, newPortId, type);
  };

  const handleTypeChange = (e: any) => {
    const newType = e.target.value as any;
    setType(newType);
    updateCommission(total, portId, newType);
  };

  const handleDelete = async () => {
    if (!confirm(t("Are you sure you want to delete this transaction?", "האם אתה בטוח שברצונך למחוק עסקה זו?"))) return;
    
    setLoading(true);
    const editTxn = locationState?.editTransaction;
    const editDiv = locationState?.editDividend;

    try {
        if (editTxn && editTxn.rowIndex) {
            await deleteTransaction(sheetId, editTxn.rowIndex, editTxn);
            setUndoData({ type: 'txn', action: 'delete', data: editTxn });
            if (onSaveSuccess) onSaveSuccess(t('Transaction deleted', 'העסקה נמחקה'), handleUndo);
        } else if (editDiv) {
            await deleteDividend(sheetId, editDiv.rowIndex, editDiv);
            setUndoData({ type: 'div', action: 'delete', data: editDiv });
            if (onSaveSuccess) onSaveSuccess(t('Dividend deleted', 'הדיבידנד נמחק'), handleUndo);
        }
        
        setTimeout(() => navigate(-1), 500); // Quick navigate back
    } catch (e) {
        console.error(e);
        alert(t("Error deleting: ", "שגיאה במחיקה: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
        setLoading(false);
    }
  };

  const handleUndo = async () => {
      const data = undoDataRef.current;
      if (!data) return;
      setLoading(true);
      
      try {
          if (data.action === 'delete') {
              if (data.type === 'txn') {
                  const { rowIndex, ...rest } = data.data;
                  await addTransaction(sheetId, rest);
              } else {
                  await addDividendEvent(sheetId, data.data.ticker, data.data.exchange, data.data.date, data.data.amount);
              }
              if (onSaveSuccess) onSaveSuccess(t("Restored successfully.", "שוחזר בהצלחה."));
          } else if (data.action === 'update') {
              if (data.type === 'txn') {
                  const original = { ...data.originalData, rowIndex: data.data.rowIndex };
                  // Verify against the current state (data.data) before reverting to original
                  await updateTransaction(sheetId, original, data.data);
              } else {
                   const d = data.originalData;
                   // Verify against current state (data.data)
                   await updateDividend(sheetId, data.data.rowIndex, d.ticker, d.exchange, d.date, d.amount, d.source, data.data);
              }
              if (onSaveSuccess) onSaveSuccess(t("Update reverted.", "העדכון בוטל."));
          }
          setUndoData(null);
      } catch (e) {
          console.error(e);
          alert(t("Error undoing: ", "שגיאה בביטול: ") + (e instanceof Error ? e.message : String(e)));
      } finally {
          setLoading(false);
      }
  };

  const handleSubmit = async () => {
    const errors: { [key: string]: boolean } = {};
    
    if (type === 'DIV_EVENT') {
        if (!ticker) errors.ticker = true;
        if (!price || parseFloat(price) === 0) errors.price = true;
    } else {
        if (!portId) errors.portId = true;
        if (!ticker) errors.ticker = true;
        if (!qty || parseFloat(qty) === 0) errors.qty = true;
        if (!price || parseFloat(price) === 0) errors.price = true;
        if (!total || parseFloat(total) === 0) errors.total = true;
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    setSaveSuccess(false);

    try {
      const q = parseFloat(qty);
      const p = parseFloat(price);
      
      const editTxn = locationState?.editTransaction;
      const editDiv = locationState?.editDividend;

      if (type === 'DIV_EVENT') {
          if (editDiv) {
              await updateDividend(sheetId, editDiv.rowIndex, ticker, parseExchange(exchange), new Date(date), p, editDiv.source, editDiv);
              const newState = { ticker, amount: p, rowIndex: editDiv.rowIndex };
              setUndoData({ type: 'div', action: 'update', data: newState, originalData: editDiv });
              if (onSaveSuccess) onSaveSuccess(t('Dividend updated', 'הדיבידנד עודכן'), handleUndo);
          } else {
              await addDividendEvent(sheetId, ticker, parseExchange(exchange), new Date(date), p);
              if (onSaveSuccess) onSaveSuccess(t('Dividend added', 'הדיבידנד נוסף'));
          }
      } else {
        // Sanity Check: If Fetch 'Open' is drastically different from User 'Price' (e.g. > 2x or < 0.5x),
        // it likely indicates a data source mismatch (stale split, wrong currency unit).
        // In this case, prefer the User's Price to avoid triggering a false split in the sheet.
        const openP = selectedTicker?.openPrice || 0;
        let safeOpenPrice = openP;
        if (p > 0 && openP > 0) {
          const ratio = openP / p;
          if (ratio > 2 || ratio < 0.5) {
            console.warn(`Mismatch between Open Price (${openP}) and User Price (${p}). Using User Price for origOpenPriceAtCreationDate.`);
            safeOpenPrice = p;
          }
        } else if (openP === 0) {
          safeOpenPrice = p; // Fallback if open is 0
        }

          const txn: Transaction = {
            date,
            portfolioId: portId,
            ticker,
            exchange: parseExchange(exchange),
            type,
            originalQty: q,
            originalPrice: p,
            origOpenPriceAtCreationDate: locationState?.editTransaction?.origOpenPriceAtCreationDate || safeOpenPrice,
            currency: normalizeCurrency(tickerCurrency),
            numericId: selectedTicker?.numericId || undefined,
            vestDate,
            comment,
            commission: parseFloat(commission) || 0,
            rowIndex: editTxn?.rowIndex // Pass row index if updating
          };

          if (editTxn && editTxn.rowIndex) {
              await updateTransaction(sheetId, txn, editTxn);
              setUndoData({ type: 'txn', action: 'update', data: txn, originalData: editTxn });
              if (onSaveSuccess) onSaveSuccess(t('Transaction updated', 'העסקה עודכנה'), handleUndo);
          } else {
              await addTransaction(sheetId, txn);
              if (onSaveSuccess) onSaveSuccess(t('Transaction added', 'העסקה נוספה'));
          }

          // If GEMEL or PENSION, also save the fetched price to external holdings for history
          if (!editTxn && (parseExchange(exchange) === Exchange.GEMEL || parseExchange(exchange) === Exchange.PENSION) && selectedTicker?.price && selectedTicker?.timestamp) {
            try {
              // Note: We use the fetched price/date, NOT the transaction price/date
              await addExternalPrice(
                sheetId,
                ticker,
                parseExchange(exchange),
                new Date(selectedTicker.timestamp),
                selectedTicker.price,
                normalizeCurrency(selectedTicker.currency || 'ILS')
              );
            } catch (err) {
              console.warn("Failed to add external price for GEMEL/PENSION txn:", err);
            }
          }
      }

      setSaveSuccess(true);
      
      if (editTxn || editDiv) {
          setTimeout(() => navigate(-1), 500);
      } else {
          // Clear form for next entry of the SAME ticker
          setQty('');
          setTotal('');
          setCommission('');
          setCommissionPct('');
          setComment('');
          setVestDate('');
          setType('BUY');
          setDate(new Date().toISOString().split('T')[0]);
          setShowForm(false); // Hide form, show summary card again
      }
      setValidationErrors({});
    } catch (e) {
      console.error(e);
      alert(t('Error saving transaction', 'שגיאה בשמירת העסקה'));
    } finally {
      setLoading(false);
    }
  };

  const handleViewTicker = () => {
    if (selectedTicker) {
      navigate(`/ticker/${selectedTicker.exchange}/${selectedTicker.symbol}`, {
        state: {
          from: '/transaction',
          background: location,
          numericId: selectedTicker.numericId?.toString(),
          initialName: selectedTicker.name,
          initialNameHe: selectedTicker.nameHe
        }
      });
    }
  };

  const handleSearchAgain = () => {
    setSelectedTicker(null);
    setTicker('');
    setExchange('');
    setPrice('');
    setTickerCurrency(Currency.ILA);
    setShowForm(false);
    setSaveSuccess(false);
    setValidationErrors({});
    navigate('/transaction', { replace: true, state: {} }); // Clear location state
  };

  const selectedPortfolio = portfolios.find(p => p.id === portId);
  const portfolioCurrency = selectedPortfolio?.currency || '';

  const ownedDetails = selectedTicker ? portfolios.flatMap(p => {
    const holding = p.holdings?.find(h => h.ticker === selectedTicker.symbol);
    return holding ? [{ name: p.name, qty: holding.qty }] : [];
  }) : [];
  const totalHeld = ownedDetails.reduce((sum, item) => sum + item.qty, 0);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
        {locationState?.editTransaction || locationState?.editDividend 
            ? t('Edit Transaction', 'ערוך עסקה') 
            : t('New Transaction', 'הוסף עסקה חדשה')}
      </Typography>

      {selectedTicker && (
        <Button variant="text" startIcon={<SearchIcon />} onClick={handleSearchAgain} sx={{ mb: 2 }}>
          {t('Back to Search', 'חזרה לחיפוש')}
        </Button>
      )}

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveSuccess(false)} action={
          <Button color="inherit" size="small" onClick={() => navigate('/dashboard')}>
            {t('Dashboard', 'דאשבורד')}
          </Button>
        }>
          {t('Transaction for', 'עסקה עבור')} {ticker} {(locationState?.editTransaction || locationState?.editDividend) ? t('updated!', 'עודכנה!') : t('saved!', 'נשמרה!')}
        </Alert>
      )}

      <Grid container spacing={2}>
        {(!selectedTicker && !locationState?.prefilledTicker) && (
          <Grid item xs={12}>
            <TickerSearch
              onTickerSelect={handleTickerSelect}
              portfolios={portfolios}
              isPortfoliosLoading={isPortfoliosLoading}
              collapsible={false}
            />
          </Grid>
        )}

        {(selectedTicker) && (
          <Grid item xs={12} sx={{ p: 2 }}>
            <Card variant="outlined">
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h6">{tTry(selectedTicker.name, selectedTicker.nameHe)}</Typography>
                    {ownedDetails.length > 0 && (
                      <Tooltip title={`Total Held: ${totalHeld} (${ownedDetails.map(d => `${d.name}: ${d.qty}`).join(', ')})`}>
                        <BusinessCenterIcon color="success" />
                      </Tooltip>
                    )}
                  </Box>
                  <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handleViewTicker}>
                    {t('View Ticker', 'פרטי נייר')}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <Chip
                    label={`${exchange}: ${ticker}`}
                    color="primary"
                    variant="outlined"
                    onClick={handleViewTicker}
                    sx={{ cursor: 'pointer', height: 24, fontSize: '0.75rem' }}
                  />
                  {selectedTicker?.price && (
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {formatPrice(selectedTicker.price, tickerCurrency, 2, t)}
                    </Typography>
                  )}
                  {(selectedTicker?.providentInfo?.managementFee !== undefined || selectedTicker?.providentInfo?.depositFee !== undefined) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                      {selectedTicker?.providentInfo?.managementFee !== undefined && (
                        <Typography variant="caption" sx={{ display: 'flex', gap: 0.3 }}>
                          {t('Mgmt fee:', 'דמי ניהול:')} <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{selectedTicker.providentInfo.managementFee}%</Box>
                        </Typography>
                      )}
                      {selectedTicker?.providentInfo?.managementFee !== undefined && selectedTicker?.providentInfo?.depositFee !== undefined && (
                        <Typography variant="caption" sx={{ opacity: 0.5, mx: 0.5 }}>•</Typography>
                      )}
                      {selectedTicker?.providentInfo?.depositFee !== undefined && (
                        <Typography variant="caption" sx={{ display: 'flex', gap: 0.3 }}>
                          {t('Deposit fee:', 'דמי הפקדה:')} <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{selectedTicker.providentInfo.depositFee}%</Box>
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
                {selectedTicker?.source && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', ml: 2, mb: 0.5, opacity: 0.8, float: 'right', marginTop: -3 }}>
                    {t('Source:', 'מקור:')} {selectedTicker.source}
                  </Typography>
                )}
                {priceError && <Alert severity="error" sx={{ mb: 2 }}>{priceError}</Alert>}

                {!showForm && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => { setShowForm(true); setSaveSuccess(false); }}>Add Another for {ticker}</Button>
                    <Button variant="outlined" startIcon={<DashboardIcon />} onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
                    <Button variant="outlined" startIcon={<SearchIcon />} onClick={handleSearchAgain}>Back to Search</Button>
                  </Box>
                )}



                {showForm && selectedTicker && (
                  <>
                    <Grid item xs={12}><Divider sx={{ my: 1 }}>{type === 'DIV_EVENT' ? 'Dividend Details' : 'Transaction Details'}</Divider></Grid>
                    <Grid container spacing={2}>
                      {type !== 'DIV_EVENT' && (
                        <Grid item xs={12} sm={4}>
                          <FormControl fullWidth size="small" error={!!validationErrors.portId} required>
                            <InputLabel>Portfolio</InputLabel>
                            <Select
                              value={portId} label="Portfolio"
                              onChange={handlePortChange}
                              disabled={isPortfoliosLoading}
                              sx={{ bgcolor: !portId ? 'action.hover' : 'inherit' }}
                            >
                              {isPortfoliosLoading ? <MenuItem value="">Loading...</MenuItem> : portfolios.map(p => (
                                <MenuItem key={p.id} value={p.id}>{p.name} ({p.currency})</MenuItem>
                              ))}
                            </Select>
                            {!portId && <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5, mt: 0.5 }}>Required</Typography>}
                          </FormControl>
                        </Grid>
                      )}
                      <Grid item xs={12} sm={4}>
                        <TextField
                          type="date" label="Date" size="small" fullWidth
                          value={date} onChange={e => setDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          sx={{ '& .MuiInputBase-input': { colorScheme: theme.palette.mode } }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Type</InputLabel>
                          <Select value={type} label="Type" onChange={handleTypeChange}>
                            <MenuItem value="BUY">Buy</MenuItem>
                            <MenuItem value="SELL">Sell</MenuItem>
                            <MenuItem value="DIV_EVENT">Dividend</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>

                      {type === 'DIV_EVENT' ? (
                        <Grid item xs={12} sm={4}>
                            <Tooltip title="Dividend amount per share.">
                              <TextField
                                label="Dividend Amount" type="number" size="small" fullWidth
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                InputProps={tickerCurrency === 'ILA'
                                  ? { endAdornment: <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment> }
                                  : { startAdornment: <InputAdornment position="start">{tickerCurrency}</InputAdornment> }
                                }
                                error={!!validationErrors.price}
                                required
                                helperText={!price ? "Required" : ""}
                              />
                            </Tooltip>
                        </Grid>
                      ) : (
                        <>
                          <Grid item xs={12}><Divider sx={{ my: 1 }}></Divider></Grid>
                          <Grid item xs={6} sm={4}>
                            <Tooltip title="Number of shares/units bought or sold.">
                              <TextField
                                label="Quantity" type="number" size="small" fullWidth
                                value={qty} onChange={e => handleQtyChange(e.target.value)}
                                error={!!validationErrors.qty}
                                required
                                helperText={!qty ? "Required" : ""}
                                sx={{ bgcolor: !qty ? 'action.hover' : 'inherit' }}
                              />
                            </Tooltip>
                          </Grid>
                          <Grid item xs={6} sm={4}>
                            <Tooltip title={`Price per single share/unit.${tickerCurrency === 'ILA' ? ' In Agorot.' : ''}`}>
                              <TextField
                                label="Price" type="number" size="small" fullWidth
                                value={price}
                                onChange={e => handlePriceChange(e.target.value)}
                                InputProps={tickerCurrency === 'ILA'
                                  ? { endAdornment: <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment> }
                                  : { startAdornment: <InputAdornment position="start">{tickerCurrency}</InputAdornment> }
                                }
                                error={!!validationErrors.price}
                                required
                                helperText={!price ? "Required" : ""}
                                sx={{ bgcolor: !price ? 'action.hover' : 'inherit' }}
                              />
                            </Tooltip>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Tooltip title="Total transaction value (Quantity × Price).">
                              <TextField
                                label="Total Cost" type="number" size="small" fullWidth
                                value={total} onChange={e => handleTotalChange(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">{majorCurrency}</InputAdornment> }}
                                error={!!validationErrors.total}
                                required
                                helperText={!total ? "Required" : ""}
                                sx={{ bgcolor: !total ? 'action.hover' : 'inherit' }}
                              />
                            </Tooltip>
                          </Grid>
                          <Grid item xs={12}><Divider sx={{ my: 1 }}> </Divider></Grid>

                          <Grid item xs={4} sm={3}>
                            <TextField
                              label="Commission" type="number" size="small" fullWidth
                              value={commission} onChange={e => handleCommissionChange(e.target.value)}
                              InputProps={{ startAdornment: <InputAdornment position="start">{portfolioCurrency}</InputAdornment> }}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid item xs={4} sm={3}>
                            <TextField
                              label="Commission %" type="number" size="small" fullWidth
                              value={commissionPct} onChange={e => handleCommissionPctChange(e.target.value)}
                              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                              <TextField
                                label="Vesting Date" type="date" size="small" fullWidth
                                value={vestDate} onChange={e => setVestDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ '& .MuiInputBase-input': { colorScheme: theme.palette.mode } }}
                              />
                            </Tooltip>
                          </Grid>
                        </>
                      )}
                      <Grid item xs={12}>
                        <TextField label="Comment" size="small" fullWidth value={comment} onChange={e => setComment(e.target.value)} />
                      </Grid>
                    </Grid>
                    <Box mt={2} display="flex" gap={2}>
                      {(locationState?.editTransaction || locationState?.editDividend) && (
                          <Button variant="outlined" color="error" size="large" startIcon={<DeleteIcon />} onClick={handleDelete} disabled={loading} sx={{ flex: 1 }}>
                            {t('Delete', 'מחק')}
                          </Button>
                      )}
                      <Button variant="contained" size="large" fullWidth startIcon={<AddCircleOutlineIcon />} onClick={handleSubmit} disabled={loading} sx={{ flex: 2 }}>
                        {loading ? t('Saving...', 'שומר...') : (type === 'DIV_EVENT' ? (locationState?.editDividend ? t('Update Dividend', 'עדכן דיבידנד') : t('Record Dividend', 'שמור דיבידנד')) : (locationState?.editTransaction ? t('Update Transaction', 'עדכן עסקה') : t('Save Transaction', 'שמור עסקה')))}
                      </Button>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid >
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, display: 'flex', flexDirection: 'column', gap: 2 }}
        open={loading}
      >
        <CircularProgress color="inherit" size={60} thickness={4} />
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          {t('Saving...', 'שומר...')}
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.8 }}>
          {t('Updating Holdings...', 'מעדכן החזקות...')}
        </Typography>
      </Backdrop>
    </Box >
  );
};
