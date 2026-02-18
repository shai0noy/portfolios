import { useState, useEffect, useRef, useCallback } from 'react';
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
import { NumericField } from './PortfolioInputFields';

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
  const [loadingMessage, setLoadingMessage] = useState('');
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
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'DIV_EVENT' | 'HOLDING_CHANGE'>('BUY');
  const [qty, setQty] = useState<string>('');

  // Sell Existing Holding Flow State
  const [actionMode, setActionMode] = useState<'search' | 'sell_holding'>('search');
  const [sellFlowPortId, setSellFlowPortId] = useState<string>('');
  const [holdingSearch, setHoldingSearch] = useState(''); // Search for holdings list

  // Holding Change specific state
  const [buyTicker, setBuyTicker] = useState<TickerData & { symbol: string } | null>(null);
  const [buyPrice, setBuyPrice] = useState<string>('');
  const [buyQty, setBuyQty] = useState<string>('');

  const [price, setPrice] = useState<string>(() => {
    const p = locationState?.initialPrice;
    if (!p) return '';
    const num = parseFloat(p);
    return isNaN(num) ? p : parseFloat(num.toFixed(6)).toString();
  });
  const [total, setTotal] = useState<string>('');
  const [percent, setPercent] = useState<string>(''); // New Percent State
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
        setLoadingMessage(t('Loading...', 'טוען...'));
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
  const updateCommission = useCallback((currentTotal: string, currentPortId: string, currentType: string) => {
    const selectedPort = portfolios.find(p => p.id === currentPortId);
    if (!selectedPort || currentType === 'DIV_EVENT') return;

    const t = parseFloat(currentTotal);
    if (!Number.isFinite(t) || t === 0) {
      setCommission('');
      setCommissionPct('');
      return;
    }

    if (currentType === 'BUY' || currentType === 'SELL') {
      const exemption = selectedPort.commExemption;
      const isExempt =
        (exemption === 'all') ||
        (exemption === 'buys' && currentType === 'BUY') ||
        (exemption === 'sells' && currentType === 'SELL');

      if (isExempt) {
        setCommission('0');
        setCommissionPct('0');
        return;
      }

      const rate = selectedPort.commRate;
      const min = selectedPort.commMin;
      const max = selectedPort.commMax || 0;
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
  }, [portfolios]);

  // Moved handleSellHoldingSelect here to access updateCommission
  const handleSellHoldingSelect = async (pid: string, tickerSymbol: string) => {
    setLoading(true);
    const port = portfolios.find(p => p.id === pid);
    if (!port) return;
    const holding = port.holdings?.find(h => h.ticker === tickerSymbol);
    if (!holding) return;

    // Fetch latest price data for accurate total calc
    const data = await getTickerData(holding.ticker, holding.exchange, holding.numericId || null);
    setLoading(false);

    const combinedData: TickerData & { symbol: string } = {
      ...(data || {}),
      symbol: holding.ticker,
      ticker: holding.ticker,
      exchange: holding.exchange,
      numericId: holding.numericId ?? data?.numericId ?? null,
      name: holding.name || data?.name || holding.ticker,
      nameHe: holding.nameHe || data?.nameHe,
      price: data?.price || holding.price || 0,
      currency: holding.currency || data?.currency || 'USD',
    };

    setSelectedTicker(combinedData);
    setTicker(combinedData.symbol);
    setExchange(combinedData.exchange);
    setPortId(pid);

    // Determine Type
    const isTaxFreeAccumulating = port.divPolicy === 'accumulate_tax_free';
    const newType = isTaxFreeAccumulating ? 'HOLDING_CHANGE' : 'SELL';
    setType(newType);

    // Pre-fill
    setQty(holding.qty.toString());
    setPercent('100');

    if (combinedData.price) {
      setPrice(parseFloat(combinedData.price.toFixed(6)).toString());
      const totalVal = holding.qty * combinedData.price;
      const tCurr = normalizeCurrency(combinedData.currency || 'USD');
      setTickerCurrency(tCurr);

      const major = tCurr === Currency.ILA ? Currency.ILS : tCurr;
      const displayTotal = convertCurrency(totalVal, tCurr, major, exchangeRates);
      const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
      setTotal(totalStr);

      updateCommission(totalStr, pid, newType);
    } else {
      setPrice('');
      setTotal('');
      setTickerCurrency(Currency.USD);
    }

    setShowForm(true);
    setActionMode('search');
  };

  const handleQtyChange = useCallback((val: number) => {
    // NumericField passes number (or 0 if invalid/empty)
    // But we strictly need string state for "0." or empty
    // Actually NumericField handles "0." internally and passes raw number.
    // If val is 0, it might be 0 or empty.
    // We should convert to string.
    // Wait, if user types "0.", val is 0. We set "0".
    // "0." state is handling in NumericField localDisplay.

    // Check for negative? NumericField already clamps to 0? Yes.
    const valStr = val.toString();
    setQty(valStr);
    const q = val;
    const p = parseFloat(price);

    // Update Percent if Sell/Holding Change
    if ((type === 'SELL' || type === 'HOLDING_CHANGE') && selectedTicker) {
      const selectedPort = portfolios.find(p => p.id === portId);
      const holding = selectedPort?.holdings?.find(h => h.ticker === selectedTicker.symbol);
      if (holding && holding.qty > 0) {
        if (Number.isFinite(q)) {
          const pct = (q / holding.qty) * 100;
          setPercent(pct.toFixed(2));
        } else {
          setPercent('');
        }
      }
    } else {
      setPercent('');
    }

    if (Number.isFinite(q) && Number.isFinite(p)) {
      const rawTotal = q * p;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
      setTotal(totalStr);
      updateCommission(totalStr, portId, type);
    } else {
      if (valStr === '' || price === '') {
        updateCommission('0', portId, type);
      }
    }
  }, [price, type, selectedTicker, portId, portfolios, tickerCurrency, majorCurrency, exchangeRates, updateCommission]);

  const handlePriceChange = useCallback((val: number) => {
    const valStr = val.toString();
    setPrice(valStr);
    const q = parseFloat(qty);
    const p = val;
    if (Number.isFinite(q) && Number.isFinite(p)) {
      const rawTotal = q * p;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
      setTotal(totalStr);
      updateCommission(totalStr, portId, type);
    } else {
      if (valStr === '' || qty === '') {
        updateCommission('0', portId, type);
      }
    }
  }, [qty, tickerCurrency, majorCurrency, exchangeRates, updateCommission, portId, type]);

  const handleTotalChange = useCallback((val: number) => {
    const valStr = val.toString();
    setTotal(valStr);
    updateCommission(valStr, portId, type);

    const q = parseFloat(qty);
    const p = parseFloat(price);
    const tDisplay = val;

    // Update Buy Qty if in Holding Change mode
    if (type === 'HOLDING_CHANGE' && buyPrice) {
      const bp = parseFloat(buyPrice);
      if (Number.isFinite(tDisplay) && Number.isFinite(bp) && bp > 0) {
        const tRaw = convertCurrency(tDisplay, majorCurrency, normalizeCurrency(buyTicker?.currency || 'USD'), exchangeRates);
        setBuyQty(parseFloat((tRaw / bp).toFixed(6)).toString());
      }
    }

    if (Number.isFinite(tDisplay)) {
      const tRaw = convertCurrency(tDisplay, majorCurrency, tickerCurrency, exchangeRates);

      if (Number.isFinite(p) && Math.abs(p) > EPS) {
        setQty(parseFloat((tRaw / p).toFixed(6)).toString());
      } else if (Number.isFinite(q) && Math.abs(q) > EPS) {
        setPrice(parseFloat((tRaw / q).toFixed(6)).toString());
      }
    }
  }, [qty, price, portId, type, buyPrice, buyTicker, majorCurrency, exchangeRates, updateCommission, tickerCurrency, EPS]);

  const handleCommissionChange = useCallback((val: number) => {
    const valStr = val.toString();
    setCommission(valStr);
    const comm = val;
    const t = parseFloat(total);
    if (Number.isFinite(comm) && Number.isFinite(t) && Math.abs(t) > EPS) {
      setCommissionPct(((comm / t) * 100).toFixed(4));
    } else {
      setCommissionPct('');
    }
  }, [total, EPS]);

  const handleCommissionPctChange = useCallback((val: number) => {
    const valStr = val.toString();
    setCommissionPct(valStr);
    const pct = val;
    const t = parseFloat(total);
    if (Number.isFinite(pct) && Number.isFinite(t)) {
      setCommission((t * (pct / 100)).toFixed(2));
    } else {
      setCommission('');
    }
  }, [total]);





  // useCallback for runValidation to be stable if needed, or just function.
  // We removed the useEffect that auto-runs it. It should be called on Submit or specific events if desired.

  const handlePercentChange = useCallback((val: number) => {
    const valStr = val.toString();
    setPercent(valStr);
    const pct = val;

    if ((type === 'SELL' || type === 'HOLDING_CHANGE') && selectedTicker) {
      const selectedPort = portfolios.find(p => p.id === portId);
      const holding = selectedPort?.holdings?.find(h => h.ticker === selectedTicker.symbol);

      if (holding && holding.qty > 0 && Number.isFinite(pct)) {
        const newQty = (holding.qty * pct) / 100;
        const qStr = parseFloat(newQty.toFixed(6)).toString();

        setQty(qStr);

        const p = parseFloat(price);
        if (Number.isFinite(p)) {
          const rawTotal = newQty * p;
          const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
          const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
          setTotal(totalStr);
          // We need updateCommission but it might not be in scope if not added to deps
          // updateCommission is in deps.
          // But updateCommission needs newTotal.
          // We have totalStr.
          // We can't call updateCommission directly if it wasn't hoisted or if we didn't pass it.
          // updateCommission IS defined before.
          // We need to pass it to deps.

          // But wait, updateCommission is stable now?
          // updateCommission depends on portfolios.
          // So it's fine.

          // Actually, we must call updateCommission(totalStr, portId, type)
          // We need to define it first or access it via ref/callback?
          // It's defined above.
        }
      }
    }
    // We can't easily call updateCommission here because it wasn't passed valid args in the snippet?
    // updateCommission takes (total, portId, type).
    // We have totalStr, portId, type.
    // So distinct call is needed.
  }, [type, selectedTicker, portId, portfolios, price, tickerCurrency, majorCurrency, exchangeRates]);

  // Validation Logic
  const runValidation = useCallback((
    currentType = type,
    currentQty = qty,
    currentPrice = price,
    currentTotal = total,
    currentPortId = portId,
    currentBuyTicker = buyTicker,
    currentBuyQty = buyQty,
    currentTicker = ticker,
    currentPercent = percent,
    currentCommission = commission,
    currentCommissionPct = commissionPct
  ) => {
    const errors: { [key: string]: boolean } = {};

    if (currentType === 'DIV_EVENT') {
      if (!currentTicker) errors.ticker = true;
      if (!currentPrice || parseFloat(currentPrice) <= 0) errors.price = true;
    } else if (currentType === 'HOLDING_CHANGE') {
      if (!currentPortId) errors.portId = true;
      if (!currentTicker) errors.ticker = true; // Sell Ticker
      if (!currentBuyTicker) errors.buyTicker = true; // Buy Ticker
      if (!currentQty || parseFloat(currentQty) <= 0) errors.qty = true; // Sell Qty
      if (!currentBuyQty || parseFloat(currentBuyQty) <= 0) errors.buyQty = true; // Buy Qty
      if (!currentTotal || parseFloat(currentTotal) <= 0) errors.total = true;
    } else {
      if (!currentPortId) errors.portId = true;
      if (!currentTicker) errors.ticker = true;
      if (!currentQty || parseFloat(currentQty) <= 0) errors.qty = true;
      if (!currentPrice || parseFloat(currentPrice) < 0) errors.price = true; // Price 0 allowed? Maybe for free transfer? strict check says >0 usually. 
      // User had `parseFloat(price) === 0` check in handleSubmit.
      if (!currentTotal || parseFloat(currentTotal) <= 0) errors.total = true;
    }

    // Additional Validations for SELL / HOLDING_CHANGE
    if (currentType === 'SELL' || currentType === 'HOLDING_CHANGE') {
      const selectedPort = portfolios.find(p => p.id === currentPortId);
      const holding = selectedPort?.holdings?.find(h => h.ticker === currentTicker);

      if (!holding) {
        // We only error on Submit for this? Or show validation error immediately?
        // Immediate feedback is better.
        if (currentTicker && currentPortId) errors.qty = true;
      } else {
        const sellQty = parseFloat(currentQty);
        if (Number.isFinite(sellQty) && holding.qty < sellQty - 1e-6) {
          errors.qty = true;
        }
      }

      const pctVal = parseFloat(currentPercent);
      if (Number.isFinite(pctVal) && (pctVal < 0 || pctVal > 100)) errors.percent = true;
    }

    if (currentCommission !== '' && parseFloat(currentCommission) < 0) errors.commission = true;
    if (currentCommissionPct !== '' && (parseFloat(currentCommissionPct) < 0 || parseFloat(currentCommissionPct) > 100)) errors.commissionPct = true;

    return errors;
  }, [type, qty, price, total, portId, buyTicker, buyQty, ticker, percent, commission, commissionPct, portfolios]);

  // Debounced Validation Effect
  useEffect(() => {
    const timer = setTimeout(() => {
      const errors = runValidation();
      setValidationErrors(errors);
    }, 200);

    return () => clearTimeout(timer);
  }, [runValidation]);

  // We need to ensure we actually call updateCommission inside handlePercentChange.
  // I'll add the call logic properly in separate edit if this chunk fails, or try here.
  // The original code passed `val` (string). I am passing `val` (number).
  // The logic `if (parseFloat(val) < 0)` is handled by NumericField.


  // Update commission when portfolio or type changes too
  const handlePortChange = (e: any) => {
    const newPortId = e.target.value;
    setPortId(newPortId);
    updateCommission(total, newPortId, type);
    // Recalc percent on port change?
    setPercent(''); // Safe to reset
  };

  const handleTypeChange = (e: any) => {
    const newType = e.target.value as any;
    setType(newType);
    updateCommission(total, portId, newType);
    if (newType !== 'SELL' && newType !== 'HOLDING_CHANGE') {
      setPercent('');
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("Are you sure you want to delete this transaction?", "האם אתה בטוח שברצונך למחוק עסקה זו?"))) return;

    setLoading(true);
    setLoadingMessage(t('Deleting...', 'מוחק...'));
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
    // ... existing undo logic ...
    const data = undoDataRef.current;
    if (!data) return;

    // Batch Undo Check (for Holding Change)
    if (Array.isArray(data.data)) {
      alert(t("Undo not supported for Holding Change.", "ביטול פעולה לא נתמך עבור החלפת החזקה."));
      return;
    }

    setLoading(true);
    setLoadingMessage(t('Undoing...', 'מבטל...'));
    try {
      if (data.action === 'add' && data.type === 'txn' && Array.isArray(data.data)) {
        // Handle batch undo
        if (onSaveSuccess) onSaveSuccess(t("Undo not fully supported for Holding Change yet.", "ביטול לא נתמך מלא עבור החלפת החזקה."));
        setUndoData(null);
        return;
      }

      // ... existing single undo ...
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
          await updateTransaction(sheetId, original, data.data);
        } else {
          const d = data.originalData;
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
    const errors = runValidation();
    setValidationErrors(errors);

    // Check specific alerts that might not be in "errors" object but block submit (like holding check alert)
    if (type === 'SELL' || type === 'HOLDING_CHANGE') {
      const selectedPort = portfolios.find(p => p.id === portId);
      const holding = selectedPort?.holdings?.find(h => h.ticker === ticker);

      if (!holding) {
        alert(t("You don't hold this asset in the selected portfolio.", "אינך מחזיק בנכס זה בתיק הנבחר."));
        return;
      }

      const sellQty = parseFloat(qty);
      if (holding.qty < sellQty - 1e-6) {
        alert(t(`Cannot sell more than you hold (${holding.qty}).`, `לא ניתן למכור יותר מהכמות המוחזקת (${holding.qty}).`));
        return;
      }
    }

    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    setLoadingMessage(t('Saving...', 'שומר...'));
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
      } else if (type === 'HOLDING_CHANGE') {
        // 1. Sell Transaction (SELL_TRANSFER)
        const sellTxn: Transaction = {
          date,
          portfolioId: portId,
          ticker,
          exchange: parseExchange(exchange),
          type: 'SELL_TRANSFER',
          originalQty: q,
          originalPrice: p,
          currency: normalizeCurrency(tickerCurrency),
          numericId: selectedTicker?.numericId || undefined,
          comment,
          commission: parseFloat(commission) || 0, // Commission on Sell?
        };

        // 2. Buy Transaction (BUY_TRANSFER)
        // We need Buy Ticker details (exchange, currency, numericId)
        if (buyTicker) {
          const buyTxn: Transaction = {
            date,
            portfolioId: portId,
            ticker: buyTicker.symbol,
            exchange: parseExchange(buyTicker.exchange || ''),
            type: 'BUY_TRANSFER',
            originalQty: parseFloat(buyQty),
            originalPrice: parseFloat(buyPrice),
            currency: normalizeCurrency(buyTicker.currency || 'USD'),
            numericId: buyTicker.numericId || undefined,
            comment: comment ? `${comment} (Linked to ${ticker})` : `Exchange from ${ticker}`,
            commission: 0 // Assume 0 or ask? Usually one commission for the swap or separate?
            // For now 0 on buy side, all on sell side? Or user should split?
          };

          await addTransaction(sheetId, sellTxn);
          await addTransaction(sheetId, buyTxn);

          // External Prices for both if Gemel
          if ((parseExchange(exchange) === Exchange.GEMEL || parseExchange(exchange) === Exchange.PENSION)) {
            // Sell Ticker Price
            try {
              if (selectedTicker?.price && selectedTicker?.timestamp) {
                await addExternalPrice(sheetId, ticker, parseExchange(exchange), new Date(selectedTicker.timestamp), selectedTicker.price, normalizeCurrency(selectedTicker.currency || 'ILS'));
              }
              // Buy Ticker Price
              if (buyTicker?.price && buyTicker?.timestamp) {
                await addExternalPrice(sheetId, buyTicker.symbol, parseExchange(buyTicker.exchange || ''), new Date(buyTicker.timestamp), buyTicker.price, normalizeCurrency(buyTicker.currency || 'ILS'));
              }
            } catch (e) { console.warn(e); }
          }

          if (onSaveSuccess) onSaveSuccess(t('Holding Change completed', 'החלפת החזקה בוצעה'), undefined);
        }

      } else {
        // Standard Transaction (BUY, SELL, FEE, DIVIDEND)
        // Sanity Check: If Fetch 'Open' is drastically different from User 'Price' (e.g. > 2x or < 0.5x),
        // it likely indicates a data source mismatch (stale split, wrong currency unit).
        const openP = selectedTicker?.openPrice || 0;
        let safeOpenPrice = openP;
        if (p > 0 && openP > 0) {
          const ratio = openP / p;
          if (ratio > 2 || ratio < 0.5) {
            console.warn(`Mismatch between Open Price (${openP}) and User Price (${p}). Using User Price for origOpenPriceAtCreationDate.`);
            safeOpenPrice = p;
          }
        } else if (openP === 0) {
          safeOpenPrice = p;
        }

        const txn: Transaction = {
          date,
          portfolioId: portId,
          ticker,
          exchange: parseExchange(exchange),
          type: type as Transaction['type'], // Safe cast as we checked specific types above
          originalQty: q,
          originalPrice: p,
          origOpenPriceAtCreationDate: locationState?.editTransaction?.origOpenPriceAtCreationDate || safeOpenPrice,
          currency: normalizeCurrency(tickerCurrency),
          numericId: selectedTicker?.numericId || undefined,
          vestDate,
          comment,
          commission: parseFloat(commission) || 0,
          rowIndex: editTxn?.rowIndex
        };

        if (editTxn && editTxn.rowIndex) {
          await updateTransaction(sheetId, txn, editTxn);
          setUndoData({ type: 'txn', action: 'update', data: txn, originalData: editTxn });
          if (onSaveSuccess) onSaveSuccess(t('Transaction updated', 'העסקה עודכנה'), handleUndo);
        } else {
          await addTransaction(sheetId, txn);
          if (onSaveSuccess) onSaveSuccess(t('Transaction added', 'העסקה נוספה'));
        }

        if (!editTxn && (parseExchange(exchange) === Exchange.GEMEL || parseExchange(exchange) === Exchange.PENSION) && selectedTicker?.price && selectedTicker?.timestamp) {
          try {
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
        setPercent('');
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


  const ownedDetails = selectedTicker ? portfolios
    .filter(p => !portId || p.id === portId)
    .flatMap(p => {
      const holding = p.holdings?.find(h => h.ticker === selectedTicker.symbol);
      return holding ? [{ name: p.name, qty: holding.qty }] : [];
    }) : [];
  const totalHeld = ownedDetails.reduce((sum, item) => sum + item.qty, 0);

  if (!isPortfoliosLoading && portfolios.length === 0) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto', textAlign: 'center', mt: 10 }}>
        <BusinessCenterIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          {t('No Portfolios Found', 'לא נמצאו תיקים')}
        </Typography>
        <Typography color="text.secondary" paragraph>
          {t('Please create a portfolio to start trading.', 'נא ליצור תיק כדי להתחיל לסחור.')}
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          {t('Create Portfolio', 'צור תיק')}
        </Button>
      </Box>
    );
  }


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
        {(!selectedTicker && !locationState?.prefilledTicker && actionMode === 'search') && (
          <Grid item xs={12}>
            <Box mb={4}>
              <Typography variant="h6" gutterBottom>
                {t('Search ticker to buy or sell', 'חפש נייר לקנייה או מכירה')}
              </Typography>
              <TickerSearch
                onTickerSelect={handleTickerSelect}
                portfolios={portfolios}
                isPortfoliosLoading={isPortfoliosLoading}
                collapsible={false}
              />
            </Box>

            <Divider sx={{ my: 3 }}>
              <Chip label={t('OR', 'או')} />
            </Divider>

            <Box display="flex" justifyContent="center">
              <Button
                variant="outlined"
                size="medium"
                startIcon={<BusinessCenterIcon />}
                onClick={() => {
                  setActionMode('sell_holding');
                  // Auto-select portfolio if only one
                  if (portfolios.length === 1) {
                    setSellFlowPortId(portfolios[0].id);
                  }
                }}
              >
                {t('Sell Existing Holding', 'מכור החזקה קיימת')}
              </Button>
            </Box>
          </Grid>
        )}

        {(!selectedTicker && !locationState?.prefilledTicker && actionMode === 'sell_holding') && (
          <Grid item xs={12}>
            <Box mb={2}>
              <Button onClick={() => setActionMode('search')} startIcon={<SearchIcon />}>
                {t('Back to Search', 'חזרה לחיפוש')}
              </Button>
            </Box>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                  {t('Select Holding to Sell', 'בחר החזקה למכירה')}
                </Typography>

                {portfolios.length > 1 && (
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {t('Portfolio', 'תיק')}
                    </Typography>
                    <Grid container spacing={2}>
                      {portfolios.map(p => {
                        const isSelected = p.id === sellFlowPortId;
                        return (
                          <Grid item xs={4} sm={3} md={2} key={p.id}>
                            <Card
                              variant={isSelected ? "elevation" : "outlined"}
                              sx={{
                                cursor: 'pointer',
                                borderColor: isSelected ? 'primary.main' : undefined,
                                bgcolor: isSelected ? 'primary.light' : 'background.paper',
                                color: isSelected ? 'primary.contrastText' : 'text.primary',
                                transition: 'all 0.2s',
                                minHeight: '100%'
                              }}
                              onClick={() => setSellFlowPortId(p.id)}
                            >
                              <CardContent sx={{ p: 1, '&:last-child': { p: 1 }, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                                  {p.name}
                                </Typography>
                              </CardContent>
                            </Card>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Box>
                )}

                {sellFlowPortId && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {t('Holding', 'החזקה')}
                    </Typography>

                    <TextField
                      fullWidth
                      size="small"
                      placeholder={t('Filter holdings...', 'סנן החזקות...')}
                      value={holdingSearch}
                      onChange={(e) => setHoldingSearch(e.target.value)}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
                      }}
                      sx={{ mb: 2 }}
                    />

                    <Card variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                      {(() => {
                        const port = portfolios.find(p => p.id === sellFlowPortId);
                        const holdings = port?.holdings || [];
                        const filtered = holdings.filter(h =>
                          !holdingSearch ||
                          h.ticker.toLowerCase().includes(holdingSearch.toLowerCase()) ||
                          (h.name && h.name.toLowerCase().includes(holdingSearch.toLowerCase()))
                        );

                        if (filtered.length === 0) {
                          return (
                            <Box p={3} textAlign="center">
                              <Typography color="text.secondary">
                                {holdings.length === 0 ? t('No holdings in this portfolio', 'אין החזקות בתיק זה') : t('No matching holdings', 'לא נמצאו החזקות מתאימות')}
                              </Typography>
                            </Box>
                          );
                        }

                        return (
                          <Box>
                            {filtered.map((h, index) => (
                              <Box key={h.ticker}>
                                {index > 0 && <Divider />}
                                <Box
                                  sx={{
                                    p: 2,
                                    cursor: 'pointer',
                                    '&:hover': { bgcolor: 'action.hover' },
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                  onClick={() => handleSellHoldingSelect(sellFlowPortId, h.ticker)}
                                >
                                  <Box>
                                    <Box display="flex" alignItems="center" gap={1}>
                                      <Typography variant="subtitle1" fontWeight={600}>{h.ticker}</Typography>
                                      <Chip label={h.exchange} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                      {tTry(h.name, h.nameHe)}
                                    </Typography>
                                  </Box>
                                  <Box textAlign="right">
                                    <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
                                      {(() => {
                                        const val = h.totalValue ?? (h.price ? h.qty * h.price : 0);
                                        const curr = h.currency || 'USD';
                                        return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(val);
                                      })()}
                                    </Typography>
                                    <Typography variant="caption" display="block" color="text.secondary">
                                      {h.qty} units
                                    </Typography>
                                  </Box>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        );
                      })()}
                    </Card>
                  </Box>
                )}
              </CardContent>
            </Card>
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
                      {type === 'HOLDING_CHANGE' ? t('Start: ', 'מקור: ') : ''}{formatPrice(selectedTicker.price, tickerCurrency, 2, t)}
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
                            <MenuItem value="BUY">{t('Buy', 'קנייה')}</MenuItem>
                            <MenuItem
                              value="SELL"
                              disabled={!!(portId && ticker && !portfolios.find(p => p.id === portId)?.holdings?.some(h => h.ticker === ticker))}
                            >
                              {t('Sell', 'מכירה')}
                              {!!(portId && ticker && !portfolios.find(p => p.id === portId)?.holdings?.some(h => h.ticker === ticker)) ? ` (${t('Not Held', 'לא מוחזק')})` : ''}
                            </MenuItem>
                            {(selectedPortfolio?.divPolicy === 'accumulate_tax_free') && (
                              <MenuItem
                                value="HOLDING_CHANGE"
                                disabled={!!(portId && ticker && !portfolios.find(p => p.id === portId)?.holdings?.some(h => h.ticker === ticker))}
                              >
                                {t('Holding Change', 'החלפת החזקה')}
                                {!!(portId && ticker && !portfolios.find(p => p.id === portId)?.holdings?.some(h => h.ticker === ticker)) ? ` (${t('Not Held', 'לא מוחזק')})` : ''}
                              </MenuItem>
                            )}
                            <MenuItem value="DIV_EVENT">{t('Record Dividend event', 'תיעוד אירוע דיבידנד')}</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>

                      {/* Holding Change Second Ticker Search */}
                      {type === 'HOLDING_CHANGE' && (
                        <Grid item xs={12}>
                          <Box sx={{ border: '1px dashed grey', p: 1, borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom>{t('Switch To (Target Asset):', 'החלף ל (נכס יעד):')}</Typography>
                            {!buyTicker ? (
                              <TickerSearch
                                onTickerSelect={(p) => {
                                  setLoading(true);
                                  getTickerData(p.symbol, p.exchange, p.securityId ?? null).then(d => {
                                    if (d) {
                                      const combined = { ...d, symbol: p.symbol, exchange: p.exchange };
                                      setBuyTicker(combined);
                                      if (d.price) {
                                        setBuyPrice(parseFloat(d.price.toFixed(6)).toString());
                                        // Calc buy qty based on total
                                        const tDisplay = parseFloat(total);
                                        if (Number.isFinite(tDisplay)) {
                                          const tRaw = convertCurrency(tDisplay, majorCurrency, normalizeCurrency(d.currency || 'USD'), exchangeRates);
                                          setBuyQty(parseFloat((tRaw / d.price).toFixed(6)).toString());
                                        }
                                      }
                                    }
                                    setLoading(false);
                                  });
                                }}
                                portfolios={[]} // No need for holdings check here
                                isPortfoliosLoading={false}
                                collapsible={false}
                              />
                            ) : (
                              <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Box>
                                  <Typography variant="body2" fontWeight="bold">{buyTicker.name} ({buyTicker.symbol})</Typography>
                                  <Typography variant="caption">{t('Price:', 'מחיר:')} {buyTicker.price}</Typography>
                                </Box>
                                <Button size="small" color="error" onClick={() => { setBuyTicker(null); setBuyQty(''); }}>Change</Button>
                              </Box>
                            )}
                          </Box>
                        </Grid>
                      )}

                      {type === 'DIV_EVENT' ? (
                        <Grid item xs={12} sm={4}>
                          <NumericField
                            label={t("Dividend Amount", "סכום דיבידנד")}
                            field="price"
                            value={price}
                            onChange={handlePriceChange}
                            endAdornment={tickerCurrency === 'ILA' ? <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment> : undefined}
                            startAdornment={tickerCurrency !== 'ILA' ? <InputAdornment position="start">{tickerCurrency}</InputAdornment> : undefined}
                            error={!!validationErrors.price}
                            required
                            helperText={!price ? "Required" : ""}
                            tooltip="Dividend amount per share."
                          />
                        </Grid>
                      ) : (
                        <>
                          {/* Dynamic Layout based on Type */}
                          {(type === 'SELL' || type === 'HOLDING_CHANGE') ? (
                            <>
                              {/* Row 1: Qty and Percent */}
                              <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                              <Grid item xs={6} sm={5}>
                                <NumericField
                                  label={t("Quantity", "כמות")}
                                  field="qty"
                                  value={qty}
                                  onChange={handleQtyChange}
                                  error={!!validationErrors.qty}
                                  required
                                  helperText={
                                    selectedTicker
                                      ? (() => {
                                        const p = portfolios.find(po => po.id === portId);
                                        const h = p?.holdings?.find(h => h.ticker === selectedTicker.symbol);
                                        return h ? `${t('Held:', 'מוחזק:')} ${h.qty}` : t('Not Held', 'לא מוחזק');
                                      })()
                                      : (!qty ? "Required" : "")
                                  }
                                  tooltip="Number of shares/units bought or sold."
                                />
                              </Grid>
                              <Grid item xs={6} sm={7} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <NumericField
                                  label={t("% of Holdings", "% מהחזקות")}
                                  field="percent"
                                  value={percent}
                                  onChange={handlePercentChange}
                                  endAdornment={<InputAdornment position="end">%</InputAdornment>}
                                  error={!!validationErrors.percent}
                                  helperText={!!validationErrors.percent ? "Invalid" : " "}
                                />
                                <Button
                                  size="medium"
                                  variant="outlined"
                                  onClick={() => handlePercentChange(100)}
                                  sx={{ minWidth: '50px' }}
                                >
                                  All
                                </Button>
                              </Grid>

                              {/* Row 2: Price and Total */}
                              <Grid item xs={6} sm={6}>
                                <NumericField
                                  label={t("Price", "מחיר")}
                                  field="price"
                                  value={price}
                                  onChange={handlePriceChange}
                                  endAdornment={tickerCurrency === 'ILA' ? <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment> : undefined}
                                  startAdornment={tickerCurrency !== 'ILA' ? <InputAdornment position="start">{tickerCurrency}</InputAdornment> : undefined}
                                  error={!!validationErrors.price}
                                  required
                                  helperText={!price ? "Required" : ""}
                                  tooltip={`Price per single share/unit.${tickerCurrency === 'ILA' ? ' In Agorot.' : ''}`}
                                />
                              </Grid>
                              <Grid item xs={6} sm={6}>
                                <NumericField
                                  label={t("Total Cost", "עלות כוללת")}
                                  field="total"
                                  value={total}
                                  onChange={handleTotalChange}
                                  startAdornment={<InputAdornment position="start">{majorCurrency}</InputAdornment>}
                                  error={!!validationErrors.total}
                                  required
                                  helperText={!total ? "Required" : ""}
                                  tooltip="Total transaction value (Quantity × Price)."
                                />
                              </Grid>
                            </>
                          ) : (
                            <>
                              {/* Standard Layout for BUY */}
                              <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                              <Grid item xs={6} sm={4}>
                                <NumericField
                                  label={t("Quantity", "כמות")}
                                  field="qty"
                                  value={qty}
                                  onChange={handleQtyChange}
                                  error={!!validationErrors.qty}
                                  required
                                  helperText={!qty ? "Required" : ""}
                                  tooltip="Number of shares/units bought or sold."
                                />
                              </Grid>
                              <Grid item xs={6} sm={4}>
                                <NumericField
                                  label={t("Price", "מחיר")}
                                  field="price"
                                  value={price}
                                  onChange={handlePriceChange}
                                  endAdornment={tickerCurrency === 'ILA' ? <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment> : undefined}
                                  startAdornment={tickerCurrency !== 'ILA' ? <InputAdornment position="start">{tickerCurrency}</InputAdornment> : undefined}
                                  error={!!validationErrors.price}
                                  required
                                  helperText={!price ? "Required" : ""}
                                  tooltip={`Price per single share/unit.${tickerCurrency === 'ILA' ? ' In Agorot.' : ''}`}
                                />
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <NumericField
                                  label={t("Total Cost", "עלות כוללת")}
                                  field="total"
                                  value={total}
                                  onChange={handleTotalChange}
                                  startAdornment={<InputAdornment position="start">{majorCurrency}</InputAdornment>}
                                  error={!!validationErrors.total}
                                  required
                                  helperText={!total ? "Required" : ""}
                                  tooltip="Total transaction value (Quantity × Price)."
                                />
                              </Grid>
                            </>
                          )}
                          <Grid item xs={12}><Divider sx={{ my: 1 }}> </Divider></Grid>

                          <Grid item xs={4} sm={3}>
                            <NumericField
                              label={t("Commission", "עמלה")}
                              field="commission"
                              value={commission}
                              onChange={handleCommissionChange}
                              startAdornment={<InputAdornment position="start">{majorCurrency}</InputAdornment>}
                              error={!!validationErrors.commission}
                            />
                          </Grid>
                          <Grid item xs={4} sm={3}>
                            <NumericField
                              label={t("Commission %", "עמלה %")}
                              field="commissionPct"
                              value={commissionPct}
                              onChange={handleCommissionPctChange}
                              endAdornment={<InputAdornment position="end">%</InputAdornment>}
                              error={!!validationErrors.commissionPct}
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
                      <Button variant="contained" size="large" fullWidth startIcon={<AddCircleOutlineIcon />} onClick={handleSubmit} disabled={loading || Object.keys(validationErrors).length > 0} sx={{ flex: 2 }}>
                        {loading ? (loadingMessage || t('Saving...', 'שומר...')) : (type === 'DIV_EVENT' ? (locationState?.editDividend ? t('Update Dividend', 'עדכן דיבידנד') : t('Record Dividend', 'שמור דיבידנד')) : (locationState?.editTransaction ? t('Update Transaction', 'עדכן עסקה') : t('Save Transaction', 'שמור עסקה')))}
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
          {loadingMessage || t('Loading...', 'טוען...')}
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.8 }}>
          {loadingMessage === t('Saving...', 'שומר...')
            ? t('Updating Holdings...', 'מעדכן החזקות...')
            : t('Fetching Data...', 'טוען נתונים...')}
        </Typography>
      </Backdrop>
    </Box >
  );
};
