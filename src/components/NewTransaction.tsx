import toast from "react-hot-toast";
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';

import {
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl, Autocomplete,
  Typography, Alert, InputAdornment, Grid, Card, CardContent, Divider, Tooltip, Chip, ToggleButton, ToggleButtonGroup,
  Backdrop, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Accordion, AccordionSummary, AccordionDetails,
  useMediaQuery, useTheme
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { parseExchange, type Portfolio, type Transaction, Exchange } from '../lib/types';
import { InstrumentType } from '../lib/types/instrument';
import type { TickerProfile } from '../lib/types/ticker';
import { addTransaction, batchAddTransactions, fetchPortfolios, addExternalPrice, syncDividends, addDividendEvent, updateTransaction, updateDividend, deleteTransaction, deleteDividend } from '../lib/sheets/index';
import { getTickerData, fetchTickerHistory, type TickerData } from '../lib/fetching';
import { TickerSearch } from './TickerSearch';
import { convertCurrency, formatPrice, getExchangeRates, normalizeCurrency, roundDivAmount } from '../lib/currency';
import { Currency, type ExchangeRates, isBuy, isSell, type TransactionType } from '../lib/types';
import { useLanguage } from '../lib/i18n';
import { NumericField, DateField } from './PortfolioInputFields';
import { formatDate, coerceDate } from '../lib/date';

const isTxnBuy = (t: string) => isBuy(t as TransactionType);
const isTxnSell = (t: string) => isSell(t as TransactionType);
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];


interface Props {
  sheetId: string;
  onSaveSuccess?: (message?: string, undoCallback?: () => void) => void;
  refreshTrigger?: number;
}

export const TransactionForm = ({ sheetId, onSaveSuccess, refreshTrigger }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const locationState = location.state as {
    prefilledTicker?: string, prefilledExchange?: string, initialPrice?: string,
    initialCurrency?: string, numericId?: number, initialName?: string, initialNameHe?: string,
    editTransaction?: Transaction, editDividend?: { ticker: string, exchange: Exchange, date: Date, amount: number, source: string, rowIndex: number, currency?: string }
  } | null;
  const isEditing = !!(locationState?.editTransaction || locationState?.editDividend);

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isPortfoliosLoading, setIsPortfoliosLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ current: { USD: 1 } });
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isPreselected = !!(searchParams.get('ticker') || locationState?.prefilledTicker);

  // Form State
  const [selectedTicker, setSelectedTicker] = useState<(TickerData & { symbol: string }) | null>(null);

  const [date, setDate] = useState(formatDate(new Date()));
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState(locationState?.prefilledTicker || '');
  const [exchange, setExchange] = useState(locationState?.prefilledExchange || '');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'DIVIDEND' | 'HOLDING_CHANGE' | 'GRANT'>('BUY');
  const [grantFrequency, setGrantFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('YEARLY');
  const [grantDuration, setGrantDuration] = useState<string>('');
  const [grantDurationUnit, setGrantDurationUnit] = useState<'YEARS' | 'QUARTER' | 'MONTHS'>('YEARS');
  const [vestingDay, setVestingDay] = useState<string>('');
  const [vestingMonth, setVestingMonth] = useState<number>(new Date().getMonth());
  const [vestingYear, setVestingYear] = useState<number>(new Date().getFullYear());
  const [previewTxns, setPreviewTxns] = useState<Transaction[] | null>(null);

  const [qty, setQty] = useState<string>('');

  // Sell Existing Holding Flow State
  const [activeStep, setActiveStep] = useState(0);
  const [holdingSearch, setHoldingSearch] = useState(''); // Search for holdings list
  const [holdingPortFilter, setHoldingPortFilter] = useState('all');

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
  const [dividendCurrency, setDividendCurrency] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: boolean }>({});
  const [commissionPct, setCommissionPct] = useState<string>('');

  const [hasManuallyEditedPrice, setHasManuallyEditedPrice] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Undo State

  useEffect(() => {
    if (selectedTicker && (!selectedTicker.historical || selectedTicker.historical.length === 0)) {
      const fetchHistory = async () => {
        try {
          const histData = await fetchTickerHistory(selectedTicker.symbol, selectedTicker.exchange, undefined, false);
          if (histData && histData.historical && histData.historical.length > 0) {
            setSelectedTicker(prev => prev ? { ...prev, historical: histData.historical } : prev);
          }
        } catch (err) {
          console.error("Failed to fetch historical data for", selectedTicker.symbol, err);
        }
      };
      fetchHistory();
    }
  }, [selectedTicker?.symbol, selectedTicker?.exchange, selectedTicker?.historical]);

  const [undoData, setUndoData] = useState<{ type: 'txn' | 'div', action: 'update' | 'delete' | 'add', data: any, originalData?: any } | null>(null);
  const undoDataRef = useRef<{ type: 'txn' | 'div', action: 'update' | 'delete' | 'add', data: any, originalData?: any } | null>(null);

  useEffect(() => {
    undoDataRef.current = undoData;
  }, [undoData]);

  useEffect(() => {
    getExchangeRates(sheetId).then(setExchangeRates);
  }, [sheetId]);
  useEffect(() => {
    if (type === 'GRANT' && date) {
      const d = coerceDate(date) || new Date();
      setVestingYear(d.getFullYear());
      setVestingMonth(d.getMonth());
      if (!vestingDay) {
        setVestingDay('31'); // Defaulting to 31/Last Day as requested for visibility
      }
    }
  }, [type, date]);


  useEffect(() => {
    setSaveSuccess(false);
    const editTxn = locationState?.editTransaction;
    const editDiv = locationState?.editDividend;
    const prefilledTicker = searchParams.get('ticker') || locationState?.prefilledTicker || editTxn?.ticker || editDiv?.ticker;
    const prefilledExchange = searchParams.get('exchange') || locationState?.prefilledExchange || (editTxn?.exchange as string) || (editDiv?.exchange as string);

    // Prevent double-fetching if the selected ticker is already loaded and matches what we want
    if (prefilledTicker && (!selectedTicker || selectedTicker.symbol !== prefilledTicker)) {
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
          if (searchParams.get('ticker') !== combinedData.symbol || searchParams.get('exchange') !== (combinedData.exchange || '')) {
            setSearchParams({ ticker: combinedData.symbol, exchange: combinedData.exchange || '' }, { replace: true, state: locationState });
          }
          setExchange(data.exchange || prefilledExchange || '');
          setTicker(prefilledTicker!)
          setActiveStep(editTxn || editDiv ? 3 : 1);

          if (editTxn) {
            setHasManuallyEditedPrice(true);
            setPortId(editTxn.portfolioId);
            setType(editTxn.type as any); // BUY/SELL/FEE/DIVIDEND
            const d = coerceDate(editTxn.date);
            setDate(d ? formatDate(d) : '');
            setQty(editTxn.originalQty?.toString() || '');
            setPrice(editTxn.originalPrice?.toString() || editTxn.price?.toString() || '');
            // Calculate total?
            if (editTxn.originalQty && editTxn.originalPrice) {
              setTotal((editTxn.originalQty * editTxn.originalPrice).toFixed(2)); // Approx
            }
            const vd = coerceDate(editTxn.vestDate);
            setVestDate(vd ? formatDate(vd) : '');
            setComment(editTxn.comment || '');
            setCommission(editTxn.commission?.toString() || '');
            setTickerCurrency(normalizeCurrency(editTxn.currency || data.currency || ''));
          } else if (editDiv) {
            setHasManuallyEditedPrice(true);
            setType('DIVIDEND');
            const d = coerceDate(editDiv.date);
            setDate(d ? formatDate(d) : '');
            setPrice(editDiv.amount.toString());
            const tCurr = normalizeCurrency(data.currency || '');
            setTickerCurrency(tCurr); // Dividends usually in stock currency
            setDividendCurrency(editDiv.currency || (tCurr === 'ILA' ? 'ILS' : tCurr));
          } else {
            // New Entry defaults
            setPrice(data.price ? parseFloat(data.price.toFixed(6)).toString() : '');
            const tCurr = normalizeCurrency(data.currency || '');
            setTickerCurrency(tCurr);
            setDividendCurrency(tCurr === 'ILA' ? 'ILS' : tCurr);
          }

          // Sync dividends if from a fresh fetch (not from cache)
          if (!editTxn && !editDiv && data.dividends && data.dividends.length > 0 && !data.fromCacheMax) {
            let divsToSync = data.dividends;
            const finCurr = data.advancedStats?.financialCurrency;
            const exCurr = data.currency;
            if (finCurr && exCurr && normalizeCurrency(finCurr) !== normalizeCurrency(exCurr)) {
              divsToSync = data.dividends.map(d => ({
                ...d,
                amount: roundDivAmount(convertCurrency(d.amount, exCurr, finCurr, exchangeRates)),
                currency: finCurr
              }));
            }
            syncDividends(sheetId, prefilledTicker!, parseExchange(data.exchange || prefilledExchange || ''), divsToSync, 'YAHOO');
          }
        } else {
          setSelectedTicker(null);
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

    const data = await getTickerData(profile.symbol, profile.exchange, profile.securityId ?? null);
    setLoading(false);

    if (data) {
      // Sync dividends if from a fresh fetch (not from cache)
      if (data.dividends && data.dividends.length > 0 && !data.fromCacheMax) {
        let divsToSync = data.dividends;
        const finCurr = data.advancedStats?.financialCurrency;
        const exCurr = data.currency;
        if (finCurr && exCurr && normalizeCurrency(finCurr) !== normalizeCurrency(exCurr)) {
          divsToSync = data.dividends.map(d => ({
            ...d,
            amount: roundDivAmount(convertCurrency(d.amount, exCurr, finCurr, exchangeRates)),
            currency: finCurr
          }));
        }
        syncDividends(sheetId, profile.symbol, profile.exchange, divsToSync, data.source || 'API');
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
      setSearchParams({ ticker: combinedData.symbol, exchange: combinedData.exchange || '' }, { replace: true });
      setTicker(combinedData.symbol);
      setExchange(combinedData.exchange || '');
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
      setDate(formatDate(new Date()));
      setSaveSuccess(false);
      setHasManuallyEditedPrice(false);

    } else {
      setSelectedTicker(null); // This will cause TickerSearch to reappear.
    }
  };

  const EPS = 1e-12;
  const majorCurrency = tickerCurrency === Currency.ILA ? Currency.ILS : tickerCurrency;

  // Helper to calculate and set commission
  const updateCommission = useCallback((currentTotal: string, currentPortId: string, currentType: string) => {
    const selectedPort = portfolios.find(p => p.id === currentPortId);
    if (!selectedPort || currentType === 'DIVIDEND') return;

    const t = parseFloat(currentTotal);
    if (!Number.isFinite(t) || t === 0) {
      setCommission('');
      setCommissionPct('');
      return;
    }

    if (isTxnBuy(currentType) || isTxnSell(currentType) || currentType === 'HOLDING_CHANGE') {
      const exemption = selectedPort.commExemption;
      const isExempt =
        (exemption === 'all') ||
        (exemption === 'sells' && isTxnSell(currentType)) ||
        (selectedTicker?.isFeeExempt || selectedTicker?.type?.type === InstrumentType.MONETARY_FUND);

      if (isExempt) {
        setCommission('0');
        setCommissionPct('0');
        return;
      }

      let rate = selectedPort.commRate;
      let min = selectedPort.commMin;
      let max = selectedPort.commMax || 0;
      let isFixedFee = false;

      if (currentType === 'HOLDING_CHANGE' && selectedPort.isCrypto) {
        if (selectedPort.conversionFeeType === 'fixed') {
          isFixedFee = true;
          rate = selectedPort.conversionFeeVal || 0;
        } else {
          rate = selectedPort.conversionFeeVal || 0;
          min = 0;
          max = 0;
        }
      } else if (currentType === 'HOLDING_CHANGE') {
        // Regular HOLDING_CHANGE has no default commission? Or does it use commRate?
        // Usually holding change in std portfolios has a buy+sell comm or no comm. Let's keep it 0 or commRate. 
        // Previously it was ignored, so let's set rate=0 if not crypto to avoid unexpected fees.
        rate = 0;
        min = 0;
        max = 0;
      }

      if (isFixedFee) {
        setCommission(rate.toFixed(2));
        setCommissionPct(((rate / t) * 100).toFixed(4));
      } else {
        const rawFee = t * rate;
        const clampedMin = Math.max(rawFee, min);
        const finalFee = max > 0 ? Math.min(clampedMin, max) : clampedMin;
        setCommission(finalFee.toFixed(2));
        setCommissionPct(((finalFee / t) * 100).toFixed(4));
      }
    } else if (currentType === 'DIVIDEND') {
      const rate = selectedPort.divCommRate;
      setCommission((t * rate).toFixed(2));
      setCommissionPct((rate * 100).toFixed(4));
    }
  }, [portfolios, selectedTicker]);

  // Moved handleSellHoldingSelect here to access updateCommission;

  const handleQtyChange = useCallback((val: number, valStr?: string) => {
    // NumericField passes number and valStr

    // Check for negative? NumericField already clamps to 0? Yes.
    const finalStr = valStr !== undefined ? valStr : val.toString();
    setQty(finalStr);
    const q = val;
    const p = parseFloat(price);

    // Update Percent if Sell/Holding Change
    if ((isTxnSell(type) || type === 'HOLDING_CHANGE') && selectedTicker) {
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
  }, [price, type, selectedTicker, portId, portfolios, tickerCurrency, majorCurrency, exchangeRates, updateCommission, buyPrice, buyTicker]);

  const handlePriceChange = useCallback((val: number, valStr?: string) => {
    setHasManuallyEditedPrice(true);
    const finalStr = valStr !== undefined ? valStr : val.toString();
    setPrice(finalStr);
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
  }, [qty, tickerCurrency, majorCurrency, exchangeRates, updateCommission, portId, type, buyPrice, buyTicker]);

  const handleTotalChange = useCallback((val: number, valStr?: string) => {
    const finalStr = valStr !== undefined ? valStr : val.toString();
    setTotal(finalStr);
    updateCommission(finalStr, portId, type);

    const q = parseFloat(qty);
    const p = parseFloat(price);
    const tDisplay = val;

    if (Number.isFinite(tDisplay)) {
      const tRaw = convertCurrency(tDisplay, majorCurrency, tickerCurrency, exchangeRates);

      if (Number.isFinite(p) && Math.abs(p) > EPS) {
        setQty(parseFloat((tRaw / p).toFixed(6)).toString());
      } else if (Number.isFinite(q) && Math.abs(q) > EPS) {
        setPrice(parseFloat((tRaw / q).toFixed(6)).toString());
        setHasManuallyEditedPrice(true);
      }
    }
  }, [qty, price, portId, type, buyPrice, buyTicker, majorCurrency, exchangeRates, updateCommission, tickerCurrency, EPS]);

  const handleCommissionChange = useCallback((val: number, valStr?: string) => {
    const finalStr = valStr !== undefined ? valStr : val.toString();
    setCommission(finalStr);
    const comm = val;
    const t = parseFloat(total);
    if (Number.isFinite(comm) && Number.isFinite(t) && Math.abs(t) > EPS) {
      setCommissionPct(((comm / t) * 100).toFixed(4));
    } else {
      setCommissionPct('');
    }
  }, [total, EPS]);

  const handleCommissionPctChange = useCallback((val: number, valStr?: string) => {
    const finalStr = valStr !== undefined ? valStr : val.toString();
    setCommissionPct(finalStr);
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

  const handlePercentChange = useCallback((val: number, valStr?: string) => {
    const finalStr = valStr !== undefined ? valStr : val.toString();
    setPercent(finalStr);
    const pct = val;

    if ((isTxnSell(type) || type === 'HOLDING_CHANGE') && selectedTicker) {
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
          updateCommission(totalStr, portId, type);
        }
      }
    }
  }, [type, selectedTicker, portId, portfolios, price, tickerCurrency, majorCurrency, exchangeRates, updateCommission, buyPrice, buyTicker]);

  const applyPrice = useCallback((newPrice: number) => {
    setPrice(parseFloat(newPrice.toFixed(6)).toString());
    const q = parseFloat(qty);
    if (Number.isFinite(q) && Number.isFinite(newPrice)) {
      const rawTotal = q * newPrice;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      const totalStr = parseFloat(displayTotal.toFixed(6)).toString();
      setTotal(totalStr);
      updateCommission(totalStr, portId, type);
    } else {
      updateCommission('0', portId, type);
    }
  }, [qty, tickerCurrency, majorCurrency, exchangeRates, updateCommission, portId, type, buyPrice, buyTicker]);

  const getPriceForDate = useCallback((dateStr: string) => {
    if (!selectedTicker) return null;
    let closestPrice = null;
    if (selectedTicker.historical) {
      const coDate = coerceDate(dateStr);
      if (!coDate) return null;
      const targetTime = new Date(coDate.toDateString() + ' 23:59:59Z').getTime();
      let minDiff = Infinity;
      for (const h of selectedTicker.historical) {
        const t = (h.date instanceof Date) ? h.date.getTime() : new Date(h.date).getTime();
        if (t <= targetTime) {
          const diff = targetTime - t;
          if (diff < minDiff) {
            minDiff = diff;
            closestPrice = h.price;
          }
        }
      }
    }

    const todayStr = formatDate(new Date());
    if (dateStr === todayStr && selectedTicker.price) {
      // Use live price for today
      closestPrice = selectedTicker.price;
    }

    return closestPrice;
  }, [selectedTicker]);

  const priceAtDate = useMemo(() => {
    if (!date) return null;
    return getPriceForDate(date);
  }, [date, getPriceForDate]);

  const handleDateChange = useCallback((newDateStr: string) => {
    setDate(newDateStr);
    if (!hasManuallyEditedPrice && !isEditing) {
      const p = getPriceForDate(newDateStr);
      if (p !== null) {
        applyPrice(p);
      }
    }
  }, [hasManuallyEditedPrice, isEditing, selectedTicker, applyPrice, getPriceForDate]);

  const handleResetPrice = useCallback(() => {
    if (priceAtDate !== null) {
      applyPrice(priceAtDate);
      setHasManuallyEditedPrice(false);
    }
  }, [priceAtDate, applyPrice]);

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

    if (currentType === 'DIVIDEND') {
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
    if (isTxnSell(currentType) || currentType === 'HOLDING_CHANGE') {
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

  // Auto-update Target Quantity for HOLDING_CHANGE when inputs or commission change
  useEffect(() => {
    if (type === 'HOLDING_CHANGE' && buyPrice && total) {
      const bp = parseFloat(buyPrice);
      const tDisplay = parseFloat(total);
      
      let effectiveTotal = tDisplay;
      const port = portfolios.find(p => p.id === portId);
      if (port?.isCrypto) {
         const commVal = parseFloat(commission) || 0;
         effectiveTotal = Math.max(0, tDisplay - commVal);
      }

      if (Number.isFinite(effectiveTotal) && Number.isFinite(bp) && bp > 0) {
        const tRaw = convertCurrency(effectiveTotal, majorCurrency, normalizeCurrency(buyTicker?.currency || 'USD'), exchangeRates);
        setBuyQty(parseFloat((tRaw / bp).toFixed(6)).toString());
      }
    }
  }, [type, buyPrice, total, commission, portId, portfolios, buyTicker?.currency, majorCurrency, exchangeRates]);

  // Update commission when portfolio or type changes too
  // @ts-ignore
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
    if (!isTxnSell(newType) && newType !== 'HOLDING_CHANGE') {
      setPercent('');
    }
  };

  const handleDelete = () => setShowDeleteConfirm(true);

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
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
      toast.error(t("Error deleting: ", "שגיאה במחיקה: ") + (e instanceof Error ? e.message : String(e)));
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
      toast.error(t("Undo not supported for Holding Change.", "ביטול פעולה לא נתמך עבור החלפת החזקה."));
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
          const { rowIndex: _rowIndex, ...rest } = data.data;
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
      toast.error(t("Error undoing: ", "שגיאה בביטול: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };


  const handlePreviewGrant = () => {
    const totalUnits = parseFloat(qty);
    const grantPrice = parseFloat(price) || 0;
    const duration = parseFloat(grantDuration);
    const baseDay = vestingDay ? parseInt(vestingDay, 10) : 1;
    const baseDate = new Date(Date.UTC(vestingYear, vestingMonth, baseDay));
    const day = vestingDay ? parseInt(vestingDay, 10) : baseDate.getDate();

    if (!totalUnits || !duration || !day || isNaN(baseDate.getTime()) || !ticker || !portId) {
      toast.error("Please fill all required grant fields (Units, Duration, Vesting Day, Ticker).");
      return;
    }

    const grantDate = coerceDate(date) || new Date();
    // Use UTC for comparison to match baseDate construction
    const grantDateUTC = new Date(Date.UTC(grantDate.getFullYear(), grantDate.getMonth(), grantDate.getDate()));

    if (baseDate <= grantDateUTC) {
      toast.error(t("First vest date must be after creation date.", "תאריך הבשלה ראשון חייב להיות אחרי תאריך הקצאה."));
      return;
    }

    const freqMonths = grantFrequency === 'MONTHLY' ? 1 : grantFrequency === 'QUARTERLY' ? 3 : 12;

    // Calculate total vests based on duration and frequency
    // Duration could be in YEARS, QUARTERS, MONTHS
    let totalMonths = 0;
    if (grantDurationUnit === 'YEARS') totalMonths = duration * 12;
    else if (grantDurationUnit === 'QUARTER') totalMonths = duration * 3;
    else totalMonths = duration;

    const vests = Math.ceil(totalMonths / freqMonths);

    let remainingUnits = totalUnits;
    const genTxns: Transaction[] = [];
    const tickerName = selectedTicker?.symbol || ticker;
    const exch = selectedTicker?.exchange || parseExchange('US') || 'US';

    for (let i = 0; i < vests; i++) {
      const m = baseDate.getMonth() + i * freqMonths;
      const y = baseDate.getFullYear();
      const maxDays = new Date(y, m + 1, 0).getDate();
      const actualDay = Math.min(day, maxDays);
      const vestDateObj = new Date(Date.UTC(y, m, actualDay));

      let periodQty = Number((totalUnits / vests).toFixed(6));
      if (i === vests - 1) {
        periodQty = Number(remainingUnits.toFixed(6));
      }
      remainingUnits -= periodQty;

      genTxns.push({
        date: date,
        portfolioId: portId,
        ticker: tickerName,
        exchange: exch,
        type: 'BUY',
        originalQty: periodQty,
        originalPrice: grantPrice,
        qty: periodQty,
        price: grantPrice,
        currency: tickerCurrency,
        vestDate: formatDate(vestDateObj),
        comment: comment ? `${comment} (${i + 1}/${vests})` : `Grant Vest ${i + 1}/${vests}`,
        commission: 0,
        creationDate: new Date().toISOString()
      });
    }

    setPreviewTxns(genTxns);
  };

  const handleApproveGrant = async () => {
    if (!previewTxns || previewTxns.length === 0) return;
    setLoading(true);
    try {
      await batchAddTransactions(sheetId, previewTxns);
      if (onSaveSuccess) {
        onSaveSuccess(t(`Added ${previewTxns.length} vesting transactions`, `התווספו ${previewTxns.length} מנות הבשלה`));
      }

      setType('BUY');
      setDate(formatDate(new Date()));
      setVestingMonth(new Date().getMonth());
      setVestingYear(new Date().getFullYear());
      setGrantDuration('');
      setVestingDay('');
      setQty('');
      setPrice('');
      setTotal('');
      setComment('');
      setPreviewTxns(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save grant transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const errors = runValidation();
    setValidationErrors(errors);

    // Check specific alerts that might not be in "errors" object but block submit (like holding check alert)
    if (isTxnSell(type) || type === 'HOLDING_CHANGE') {
      const selectedPort = portfolios.find(p => p.id === portId);
      const holding = selectedPort?.holdings?.find(h => h.ticker === ticker);

      if (!holding) {
        toast.error(t("You don't hold this asset in the selected portfolio.", "אינך מחזיק בנכס זה בתיק הנבחר."));
        return;
      }

      const sellQty = parseFloat(qty);
      if (holding.qty < sellQty - 1e-6) {
        toast.error(t(`Cannot sell more than you hold (${holding.qty}).`, `לא ניתן למכור יותר מהכמות המוחזקת (${holding.qty}).`));
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

      if (type === 'DIVIDEND') {
        if (editDiv) {
          await updateDividend(sheetId, editDiv.rowIndex, ticker, parseExchange(exchange), coerceDate(date)!, p, editDiv.source, editDiv, dividendCurrency);
          const newState = { ticker, amount: p, rowIndex: editDiv.rowIndex, currency: dividendCurrency };
          setUndoData({ type: 'div', action: 'update', data: newState, originalData: editDiv });
          if (onSaveSuccess) onSaveSuccess(t('Dividend updated', 'הדיבידנד עודכן'), handleUndo);
        } else {
          await addDividendEvent(sheetId, ticker, parseExchange(exchange), coerceDate(date)!, p, dividendCurrency);
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
        let creationOpenPrice: number | undefined = selectedTicker?.openPrice;
        if (!creationOpenPrice || creationOpenPrice <= 0) {
          creationOpenPrice = undefined;
        }

        const txn: Transaction = {
          date,
          portfolioId: portId,
          ticker,
          exchange: parseExchange(exchange),
          type: type as Transaction['type'], // Safe cast as we checked specific types above
          originalQty: q,
          originalPrice: p,
          origOpenPriceAtCreationDate: locationState?.editTransaction?.origOpenPriceAtCreationDate || creationOpenPrice,
          currency: normalizeCurrency(tickerCurrency),
          numericId: selectedTicker?.numericId || undefined,
          vestDate: locationState?.editTransaction ? vestDate : undefined,
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
        setDate(formatDate(new Date()));
        setHasManuallyEditedPrice(false);
        setSearchParams({});
      }
      setValidationErrors({});
    } catch (e) {
      console.error(e);
      const msg = t('Error saving transaction: ', 'שגיאה בשמירת העסקה: ') + (e instanceof Error ? e.message : String(e));
      toast.error(msg, { duration: 10000 });
    } finally {
      setLoading(false);
    }
  };
;
;

  const selectedPortfolio = portfolios.find(p => p.id === portId);



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


  const handleNextStep = (step: number) => {
    setActiveStep(step);
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', pb: 8 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 3 }}>
        {locationState?.editTransaction || locationState?.editDividend
          ? t('Edit Transaction', 'ערוך עסקה')
          : t('New Transaction', 'הוסף עסקה חדשה')}
      </Typography>

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSaveSuccess(false)} action={
          <Button color="inherit" size="small" onClick={() => navigate('/dashboard')}>
            {t('Dashboard', 'דאשבורד')}
          </Button>
        }>
          {t('Transaction for', 'עסקה עבור')} {ticker} {(locationState?.editTransaction || locationState?.editDividend) ? t('updated!', 'עודכנה!') : t('saved!', 'נשמרה!')}
        </Alert>
      )}

      {isPreselected && (
         <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2, border: '1px solid', borderColor: 'divider' }}>
           <BusinessCenterIcon color="primary" />
           <Typography variant="h6" color="text.primary" sx={{ lineHeight: 1.2 }}>{selectedTicker?.name || selectedTicker?.symbol || searchParams.get('ticker') || locationState?.prefilledTicker}</Typography>
         </Box>
      )}

      {!isPreselected && (
      <Accordion expanded={activeStep === 0} onChange={() => setActiveStep(0)} sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: activeStep === 0 ? 'action.hover' : 'transparent', borderRadius: 2 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="h6">{t('Step 1: Select Asset', 'שלב 1: בחר נכס')}</Typography>
            {selectedTicker && activeStep !== 0 && (
              <Chip size="small" color="primary" label={selectedTicker.symbol} />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 3 }}>
          <Box mb={2}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Search ticker to buy or sell', 'חפש נייר לקנייה או מכירה')}</Typography>
            <TickerSearch 
              trackingLists={[]}
              onTickerSelect={(tData) => {
                handleTickerSelect(tData);
                handleNextStep(1);
              }}
              portfolios={portfolios}
              isPortfoliosLoading={isPortfoliosLoading}
              collapsible={false}
            />
          </Box>
          <Divider sx={{ my: 3 }}><Chip label={t('OR Your Holdings', 'או ההחזקות שלך')} size="small" /></Divider>
          
          <Box mb={2}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={7}>
                <TextField 
                  fullWidth size="small" placeholder={t('Filter holdings...', 'סנן החזקות...')} 
                  value={holdingSearch} onChange={e => setHoldingSearch(e.target.value)} 
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small"/></InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12} sm={5}>
                <FormControl fullWidth size="small">
                  <Select
                    value={holdingPortFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHoldingPortFilter(val);
                      if (val !== 'all') {
                        handlePortChange({ target: { value: val } } as any);
                      }
                    }}
                    displayEmpty
                  >
                    <MenuItem value="all"><em>{t('All Portfolios', 'כל התיקים')}</em></MenuItem>
                    {portfolios.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          <Grid container spacing={1} sx={{ mt: 1 }}>
              {portfolios.flatMap(p => (p.holdings || []).map(h => ({ ...h, portName: p.name, portId: p.id })))
                .filter(h => !holdingSearch || h.ticker.toLowerCase().includes(holdingSearch.toLowerCase()) || (h.name && h.name.toLowerCase().includes(holdingSearch.toLowerCase())))
                .filter(h => holdingPortFilter === 'all' || h.portId === holdingPortFilter)
                .map((h, i) => (
                  <Grid item xs={6} sm={4} md={3} key={`${h.portId}-${h.ticker}-${i}`}>
                    <Box 
                      onClick={() => {
                        handleTickerSelect({ symbol: h.ticker, name: h.name, nameHe: h.name, type: h.type?.type || 'Equity', exchange: h.exchange || '', currency: h.currency || 'USD' } as any);
                        handlePortChange({ target: { value: h.portId } } as any);
                        handleNextStep(2); 
                      }}
                      sx={{ 
                        p: 0.75, 
                        border: '1px solid', borderColor: 'divider', borderRadius: 1, 
                        cursor: 'pointer', 
                        transition: 'all 0.2s',
                        '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' } 
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{h.ticker}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>{h.qty}</Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" noWrap sx={{ fontSize: '0.65rem', maxWidth: '65%', color: 'text.secondary' }}>
                          {h.name || h.ticker}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'primary.main', fontWeight: 500, px: 0.5, bgcolor: 'primary.50', borderRadius: 1 }}>
                          {h.portName}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
              ))}
            </Grid>
          </Box>
        </AccordionDetails>
      </Accordion>
      )}

      <Accordion expanded={activeStep === 1} onChange={() => setActiveStep(1)} disabled={!selectedTicker} sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: activeStep === 1 ? 'action.hover' : 'transparent', borderRadius: 2 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="h6">{t('Step 2: Select Portfolio', 'שלב 2: בחר תיק')}</Typography>
            {portId && activeStep !== 1 && (
              <Chip size="small" color="primary" label={portfolios.find(p => p.id === portId)?.name} />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 2 }}>
           {isMobile ? (
             <FormControl fullWidth>
               <InputLabel>{t('Select Portfolio', 'בחר תיק')}</InputLabel>
               <Select
                 value={portId}
                 label={t('Select Portfolio', 'בחר תיק')}
                 onChange={(e) => {
                   handlePortChange({ target: { value: e.target.value } } as any);
                   handleNextStep(2);
                 }}
               >
                 {portfolios.map(p => {
                   const holding = p.holdings?.find(h => h.ticker === selectedTicker?.symbol);
                   return (
                     <MenuItem key={p.id} value={p.id}>
                       <Box display="flex" justifyContent="space-between" width="100%" alignItems="center">
                         <Typography>{p.name}</Typography>
                         {holding && (
                           <Typography variant="caption" color="text.secondary">
                             {t('Held:', 'מוחזק:')} {holding.qty} {holding.totalValue !== undefined ? `(${new Intl.NumberFormat(undefined, { style: 'currency', currency: holding.currency || 'USD', maximumFractionDigits: 0 }).format(holding.totalValue)})` : ''}
                           </Typography>
                         )}
                       </Box>
                     </MenuItem>
                   );
                 })}
               </Select>
             </FormControl>
           ) : (
           <Grid container spacing={2}>
              {portfolios.map(p => {
                const isSelected = p.id === portId;
                const holding = p.holdings?.find(h => h.ticker === selectedTicker?.symbol);
                return (
                  <Grid item xs={6} sm={4} md={3} key={p.id}>
                    <Card
                      variant={isSelected ? "elevation" : "outlined"}
                      sx={{
                        cursor: 'pointer',
                        borderColor: isSelected ? 'primary.main' : undefined,
                        bgcolor: isSelected ? 'primary.light' : 'background.paper',
                        color: isSelected ? 'primary.contrastText' : 'text.primary',
                        transition: 'all 0.2s',
                        height: '100%',
                        position: 'relative'
                      }}
                      onClick={() => {
                        handlePortChange({ target: { value: p.id } } as any);
                        handleNextStep(2);
                      }}
                    >
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                          {p.name}
                        </Typography>
                        {holding ? (
                          <>
                           <Chip size="small" label={`${t('Held:', 'מוחזק:')} ${holding.qty}`} sx={{ mt: 1, height: 20, fontSize: '0.7rem', bgcolor: isSelected ? 'rgba(255,255,255,0.2)' : 'success.light', color: isSelected ? 'inherit' : 'success.contrastText' }} />
                           {holding.totalValue !== undefined && (
                             <Typography variant="caption" sx={{ mt: 0.5, fontSize: '0.65rem', opacity: 0.8 }}>
                               {new Intl.NumberFormat(undefined, { style: 'currency', currency: holding.currency || 'USD', maximumFractionDigits: 0 }).format(holding.totalValue)}
                             </Typography>
                           )}
                          </>
                        ) : (
                           <Typography variant="caption" sx={{ mt: 1, opacity: 0.7 }}>{t('Not Held', 'לא מוחזק')}</Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
           )}
        </AccordionDetails>
      </Accordion>

      <Accordion expanded={activeStep === 2} onChange={() => setActiveStep(2)} disabled={!selectedTicker || !portId} sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: activeStep === 2 ? 'action.hover' : 'transparent', borderRadius: 2 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="h6">{t('Step 3: Action', 'שלב 3: סוג פעולה')}</Typography>
            {type && activeStep !== 2 && (
              <Chip size="small" color="primary" label={
                type === 'BUY' ? t('Buy', 'קנייה') :
                type === 'SELL' ? t('Sell', 'מכירה') :
                type === 'HOLDING_CHANGE' ? t('Holding Change', 'החלפת החזקה') :
                type === 'GRANT' ? t('Grant', 'הענקה') :
                type === 'DIVIDEND' ? t('Dividend', 'דיבידנד') : t(type, type)
              } />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 2 }}>
           <Grid container spacing={2}>
              {['BUY', 'SELL', 'HOLDING_CHANGE', 'DIVIDEND', 'GRANT'].map(act => {
                 const p = portfolios.find(p => p.id === portId);
                 const isHeld = p?.holdings?.some(h => h.ticker === selectedTicker?.symbol);
                 
                 let disabled = false;
                 let label = t(act, act);
                 if (act === 'BUY') label = t('Buy', 'קנייה');
                 if (act === 'SELL') {
                    label = t('Sell', 'מכירה');
                    if (!isHeld) disabled = true;
                 }
                 if (act === 'HOLDING_CHANGE') {
                    label = t('Holding Change', 'החלפת החזקה');
                    if (p?.divPolicy !== 'accumulate_tax_free') return null;
                    if (!isHeld) disabled = true;
                 }
                 if (act === 'GRANT') label = t('Grant', 'הענקה');
                 if (act === 'DIVIDEND') label = t('Dividend', 'דיבידנד');
                 
                 if (isEditing && type !== act) disabled = true;

                 const isSelected = type === act;
                 return (
                    <Grid item xs={6} sm={4} md={3} key={act}>
                        <Card
                          variant={isSelected ? "elevation" : "outlined"}
                          sx={{
                            cursor: disabled ? 'default' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                            borderColor: isSelected ? 'primary.main' : undefined,
                            bgcolor: isSelected ? 'primary.light' : 'background.paper',
                            color: isSelected ? 'primary.contrastText' : 'text.primary',
                            transition: 'all 0.2s',
                            height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                          onClick={() => {
                            if (!disabled) {
                               handleTypeChange({ target: { value: act } } as any);
                               if (act === 'HOLDING_CHANGE') {
                                  if (buyTicker) handleNextStep(3);
                               } else {
                                  handleNextStep(3);
                               }
                            }
                          }}
                        >
                          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{label}</Typography>
                            {disabled && !isEditing && act !== 'BUY' && act !== 'GRANT' && act !== 'DIVIDEND' && (
                               <Typography variant="caption" sx={{ display: 'block' }}>{t('Not Held', 'לא מוחזק')}</Typography>
                            )}
                          </CardContent>
                        </Card>
                    </Grid>
                 )
              })}
           </Grid>
{/* Holding Change Second Ticker Search */}
                      {type === 'HOLDING_CHANGE' && (
                        <Grid item xs={12}>
                          <Box sx={{ mt: 1, mb: 1 }}>
                            <Box sx={{ pt: 1, mb: 2 }}>
                              <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                                {t('Switch To (Target Asset):', 'החלף ל (נכס יעד):')}
                              </Typography>
                            </Box>
                            
                            {!buyTicker ? (
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <Box sx={{ flexGrow: 1 }}>
                                  <TickerSearch trackingLists={[]}
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
                                        handleNextStep(3);
                                      });
                                    }}
                                    portfolios={[]} // No need for holdings check here
                                    isPortfoliosLoading={false}
                                    collapsible={false}
                                  />
                                </Box>
                                {selectedPortfolio?.isCrypto && (
                                  <Button
                                    size="medium"
                                    variant="outlined"
                                    onClick={() => {
                                      setLoading(true);
                                      getTickerData('USDT-USD', 'FOREX', null).then(d => {
                                        if (d) {
                                          const combined = { ...d, symbol: 'USDT-USD', exchange: 'FOREX' as Exchange };
                                          setBuyTicker(combined);
                                          if (d.price) {
                                            setBuyPrice(parseFloat(d.price.toFixed(6)).toString());
                                            const tDisplay = parseFloat(total);
                                            if (Number.isFinite(tDisplay)) {
                                              const tRaw = convertCurrency(tDisplay, majorCurrency, normalizeCurrency(d.currency || 'USD'), exchangeRates);
                                              setBuyQty(parseFloat((tRaw / d.price).toFixed(6)).toString());
                                            }
                                          }
                                        }
                                        setLoading(false);
                                        handleNextStep(3);
                                      });
                                    }}
                                    sx={{ minWidth: '50px' }}
                                  >
                                    USDT
                                  </Button>
                                )}
                              </Box>
                            ) : (
                              <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                  <Typography variant="body2" fontWeight="bold">{buyTicker.name || buyTicker.symbol}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {t('Price:', 'מחיר:')} {formatPrice(buyTicker.price, normalizeCurrency(buyTicker.currency || 'USD'))}
                                  </Typography>
                                </Box>
                                <Button size="small" onClick={() => { setBuyTicker(null); setBuyQty(''); }}>
                                  {t('Change', 'שנה')}
                                </Button>
                              </Box>
                            )}
                          </Box>
                        </Grid>
                      )}

                              </AccordionDetails>
      </Accordion>

      <Accordion expanded={activeStep === 3} onChange={() => setActiveStep(3)} disabled={!selectedTicker || !portId || !type} sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: activeStep === 3 ? 'action.hover' : 'transparent', borderRadius: 2 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="h6">{t('Step 4: Details', 'שלב 4: פרטים')}</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 2, px: 1 }}>
           <Grid container spacing={2}>
<Grid item xs={12}>
                        <DateField
                          label="Date"
                          value={date}
                          onChange={v => handleDateChange(v)}
                        />
                      </Grid>

                      {type === 'GRANT' ? (
                        <Grid item xs={12}>
                          <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                              {t("Vesting Plan Details", "פרטי תוכנית הקצאה")}
                            </Typography>
                            {!previewTxns ? (
                              <Grid container spacing={2}>
                                <Grid item xs={6} sm={4}>
                                  <NumericField label={t("Total Units", "סך יחידות")} field="qty" value={qty} onChange={handleQtyChange} required />
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                  <NumericField label={t("Price", "מחיר")} field="price" value={price} onChange={handlePriceChange} />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                  <NumericField label={t("Total Value", "שווי כולל")} field="total" value={total} onChange={handleTotalChange} />
                                </Grid>

                                <Grid item xs={12} sm={8}>
                                  <NumericField
                                    label={t("Vesting Start (Month/Year)", "תחילת הבשלה (חודש/שנה)")}
                                    field="vestingYear"
                                    value={vestingYear.toString()}
                                    onChange={v => setVestingYear(parseInt(v.toString()) || new Date().getFullYear())}
                                    required
                                    InputLabelProps={{ shrink: true }}
                                    startAdornment={
                                      <InputAdornment position="start">
                                        <Select
                                          value={vestingMonth}
                                          onChange={e => setVestingMonth(e.target.value as number)}
                                          size="small"
                                          variant="standard"
                                          disableUnderline
                                          sx={{
                                            mr: 1,
                                            fontSize: '0.875rem',
                                            '& .MuiSelect-select': { py: 0 }
                                          }}
                                        >
                                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => (
                                            <MenuItem key={m} value={m}>{t(monthNames[m], "") || monthNames[m]}</MenuItem>
                                          ))}
                                        </Select>
                                      </InputAdornment>
                                    }
                                  />
                                </Grid>

                                <Grid item xs={6} sm={4}>
                                  <Autocomplete<string, false, false, true>
                                    freeSolo
                                    options={Array.from({ length: 31 }, (_, i) => (i + 1).toString())}
                                    getOptionLabel={(option: string) => option === '31' ? (t("31 (Last Day)", "31 (יום אחרון)") || "31 (Last Day)") : option}
                                    value={vestingDay}
                                    onInputChange={(_: any, newValue: string) => {
                                      const num = parseInt(newValue, 10);
                                      if (!isNaN(num)) {
                                        const clamped = Math.max(1, Math.min(31, num));
                                        setVestingDay(clamped.toString());
                                      } else if (newValue === '') {
                                        setVestingDay('');
                                      }
                                    }}
                                    renderInput={(params) => (
                                      <TextField
                                        {...params}
                                        label={t("Vesting Day of Month", "יום הבשלה בחודש")}
                                        size="small"
                                        required
                                        placeholder="1-31"
                                        helperText={vestingDay === '31' ? (t("Last Day of Month", "יום אחרון בחודש") || "Last Day of Month") : ""}
                                      />
                                    )}
                                  />
                                </Grid>

                                <Grid item xs={12} sm={8}>
                                  <NumericField
                                    label={t("Vesting Spread Period", "תקופת פריסת הבשלה")}
                                    field="grantDuration"
                                    value={grantDuration}
                                    onChange={v => setGrantDuration(v.toString())}
                                    required
                                    InputLabelProps={{ shrink: true }}
                                    endAdornment={
                                      <InputAdornment position="end">
                                        <ToggleButtonGroup
                                          value={grantDurationUnit}
                                          exclusive
                                          onChange={(_, v) => v && setGrantDurationUnit(v)}
                                          size="small"
                                          color="primary"
                                          sx={{ height: 32, '& .MuiToggleButton-root': { py: 0, px: 1, minWidth: 40, border: 'none', borderRadius: '4px !important', ml: '4px !important' } }}
                                        >
                                          <ToggleButton value="MONTHS">{t("M", "ח")}</ToggleButton>
                                          <ToggleButton value="QUARTER">{t("Q", "ר")}</ToggleButton>
                                          <ToggleButton value="YEARS">{t("Y", "ש")}</ToggleButton>
                                        </ToggleButtonGroup>
                                      </InputAdornment>
                                    }
                                  />
                                </Grid>

                                <Grid item xs={6} sm={4}>
                                  <FormControl size="small" fullWidth>
                                    <InputLabel>{t("Vesting Frequency", "תדירות הבשלה")}</InputLabel>
                                    <Select
                                      value={grantFrequency}
                                      onChange={e => setGrantFrequency(e.target.value as any)}
                                      label={t("Vesting Frequency", "תדירות הבשלה")}
                                    >
                                      <MenuItem value="MONTHLY">{t("Monthly", "חודשי")}</MenuItem>
                                      <MenuItem value="QUARTERLY">{t("Quarterly", "רבעוני")}</MenuItem>
                                      <MenuItem value="YEARLY">{t("Yearly", "שנתי")}</MenuItem>
                                    </Select>
                                  </FormControl>
                                </Grid>



                                <Grid item xs={12}>
                                  <Button variant="outlined" onClick={handlePreviewGrant} fullWidth>
                                    {t("Preview Vesting Plan", "תצוגה מקדימה של תוכנית הבשלה")}
                                  </Button>
                                </Grid>
                              </Grid>
                            ) : (
                              <Box>
                                <Typography variant="body2" sx={{ mb: 2 }}>
                                  {t("Review and edit the generated vesting schedule below before saving:", "יש לוודא ולערוך את תוכנית ההבשלה להלן לפני השמירה:")}
                                </Typography>
                                {previewTxns.map((txn, idx) => (
                                  <Grid container spacing={1} key={idx} sx={{ mb: 1, alignItems: 'center' }}>
                                    <Grid item xs={1}><Typography variant="body2">#{idx + 1}</Typography></Grid>
                                    <Grid item xs={4}><TextField value={txn.vestDate} onChange={e => {
                                      const copy = [...previewTxns]; copy[idx].vestDate = e.target.value; setPreviewTxns(copy);
                                    }} size="small" fullWidth placeholder="dd/mm/yyyy" /></Grid>
                                    <Grid item xs={3}><NumericField label="" value={txn.qty ? txn.qty.toString() : "0"} field={`qty-${idx}`} onChange={v => {
                                      const copy = [...previewTxns]; copy[idx].qty = v || 0; copy[idx].originalQty = v || 0; setPreviewTxns(copy);
                                    }} /></Grid>
                                    <Grid item xs={4}><TextField value={txn.comment || ''} onChange={e => {
                                      const copy = [...previewTxns]; copy[idx].comment = e.target.value; setPreviewTxns(copy);
                                    }} size="small" fullWidth /></Grid>
                                  </Grid>
                                ))}
                                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="body2" fontWeight="bold">
                                    {t("Total Units: ", "סך חתיכות: ")}
                                    {previewTxns.reduce((sum, txn) => sum + (txn.qty || 0), 0).toFixed(6)} / {qty}
                                  </Typography>
                                  <Box>
                                    <Button onClick={() => setPreviewTxns(null)} sx={{ mr: 1 }}>
                                      {t("Back", "אחורה")}
                                    </Button>
                                    <Button variant="contained" color="success" onClick={handleApproveGrant} disabled={loading}>
                                      {loading ? t("Saving...", "שומר...") : t("Approve & Save", "אישור ושמירה")}
                                    </Button>
                                  </Box>
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </Grid>
                      ) : type === 'DIVIDEND' ? (
                        <>
                          <Grid item xs={12} sm={4}>
                            <NumericField
                              label={t("Dividend Amount", "סכום דיבידנד")}
                              field="price"
                              value={price}
                              onChange={handlePriceChange}
                              error={!!validationErrors.price}
                              required
                              helperText={!price ? "Required" : ""}
                              tooltip="Dividend amount per share."
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                              <InputLabel id="dividend-currency-label">{t("Currency", "מטבע")}</InputLabel>
                              <Select
                                labelId="dividend-currency-label"
                                value={dividendCurrency || tickerCurrency || ''}
                                onChange={(e) => setDividendCurrency(e.target.value)}
                                label={t("Currency", "מטבע")}
                              >
                                {Object.values(Currency).map(c => (
                                  <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                        </>
                      ) : (
                        <>
                          {/* Dynamic Layout based on Type */}
                          {(type !== 'HOLDING_CHANGE' && isSell(type as TransactionType) || type === 'HOLDING_CHANGE') ? (
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
                                  endAdornment={
                                    <>
                                      {tickerCurrency === 'ILA' && <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment>}
                                      {(priceAtDate !== null && parseFloat(price).toString() !== priceAtDate.toString()) && (
                                        <InputAdornment position="end">
                                          <Tooltip title={`${t('Reset to closing price on', 'אפס למחיר סגירה ב-')} ${date}: ${priceAtDate.toFixed(2)}`}>
                                            <IconButton size="small" onClick={handleResetPrice} edge="end">
                                              <RestoreIcon fontSize="small" />
                                            </IconButton>
                                          </Tooltip>
                                        </InputAdornment>
                                      )}
                                    </>
                                  }
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
                                  endAdornment={
                                    <>
                                      {tickerCurrency === 'ILA' && <InputAdornment position="end">{t('ag.', "א'")}</InputAdornment>}
                                      {(priceAtDate !== null && parseFloat(price).toString() !== priceAtDate.toString()) && (
                                        <InputAdornment position="end">
                                          <Tooltip title={`${t('Reset to closing price on', 'אפס למחיר סגירה ב-')} ${date}: ${priceAtDate.toFixed(2)}`}>
                                            <IconButton size="small" onClick={handleResetPrice} edge="end">
                                              <RestoreIcon fontSize="small" />
                                            </IconButton>
                                          </Tooltip>
                                        </InputAdornment>
                                      )}
                                    </>
                                  }
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

                          {/* Commission Row - Hidden if Exempt or Non-Crypto Holding Change */}
                          {!(type === 'HOLDING_CHANGE' && !selectedPortfolio?.isCrypto) && (
                            <>
                              {(!selectedTicker?.isFeeExempt && selectedTicker?.type?.type !== InstrumentType.MONETARY_FUND) ? (
                                <>
                                  <Grid item xs={4} sm={3}>
                                    <NumericField
                                      label={type === 'HOLDING_CHANGE' && selectedPortfolio?.isCrypto ? t("Conversion Fee", "עמלת המרה") : t("Commission", "עמלה")}
                                      field="commission"
                                      value={commission}
                                      onChange={handleCommissionChange}
                                      startAdornment={<InputAdornment position="start">{majorCurrency}</InputAdornment>}
                                      error={!!validationErrors.commission}
                                    />
                                  </Grid>
                                  <Grid item xs={4} sm={3}>
                                    <NumericField
                                      label={type === 'HOLDING_CHANGE' && selectedPortfolio?.isCrypto ? t("Conv. Fee %", "עמלת המרה %") : t("Commission %", "עמלה %")}
                                      field="commissionPct"
                                      value={commissionPct}
                                      onChange={handleCommissionPctChange}
                                      endAdornment={<InputAdornment position="end">%</InputAdornment>}
                                      error={!!validationErrors.commissionPct}
                                    />
                                  </Grid>
                                  {(type === 'HOLDING_CHANGE' && selectedPortfolio?.isCrypto) && (
                                    <Grid item xs={12} sm={6}>
                                      <Box sx={{ height: '100%', p: 1, px: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: 'background.paper' }}>
                                        <Typography variant="caption" color="text.secondary">
                                          {t("Net Amount to Receive", "סכום נטו לקבלה")}
                                        </Typography>
                                        <Typography variant="body1" fontWeight="bold" color="primary">
                                          {formatPrice(Math.max(0, parseFloat(total || '0') - (parseFloat(commission) || 0)), majorCurrency)}
                                        </Typography>
                                      </Box>
                                    </Grid>
                                  )}
                                </>
                              ) : (
                                <Grid item xs={12}>
                                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, textAlign: 'center' }}>
                                    <Typography variant="body2" color="text.secondary">
                                      {t("Monetary funds are exempt from fees by Israeli law.", "קרנות כספיות פטורות מעמלות על פי חוק.")}
                                    </Typography>
                                  </Box>
                                </Grid>
                              )}
                            </>
                          )}
                          <Grid item xs={12} sm={(!selectedTicker?.isFeeExempt && selectedTicker?.type?.type !== InstrumentType.MONETARY_FUND) ? 6 : 12}>
                            <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                              <DateField
                                label="Vesting Date"
                                value={vestDate}
                                onChange={v => setVestDate(v)}
                              />
                            </Tooltip>
                          </Grid>
                        </>
                      )}
                      <Grid item xs={12}>
                        <TextField label="Comment" size="small" fullWidth value={comment} onChange={e => setComment(e.target.value)} />
                      </Grid>
                    </Grid>
<Box mt={2} display="flex" gap={2} sx={{ display: type === 'GRANT' ? 'none' : 'flex', width: '100%', flexDirection: 'row' }}>
                      {(locationState?.editTransaction || locationState?.editDividend) && (
                        <Button variant="outlined" color="error" size="large" startIcon={<DeleteIcon />} onClick={handleDelete} disabled={loading} sx={{ flex: 1 }}>
                          {t('Delete', 'מחק')}
                        </Button>
                      )}
                      <Tooltip
                        title={
                          Object.keys(validationErrors).length > 0
                            ? `${t('Missing or invalid:', 'חסר או לא תקין:')} ${Object.keys(validationErrors).map(k => {
                                const labels: any = { portId: 'Portfolio', ticker: 'Source Asset', buyTicker: 'Target Asset', qty: 'Quantity', buyQty: 'Target Quantity', price: 'Price', total: 'Total', commission: 'Commission', percent: 'Percent' };
                                return labels[k] || k;
                              }).join(', ')}`
                            : ''
                        }
                        placement="top"
                      >
                        <span style={{ flex: 2, display: 'flex' }}>
                          <Button variant="contained" size="large" startIcon={<AddCircleOutlineIcon />} fullWidth={!locationState?.editTransaction && !locationState?.editDividend} onClick={handleSubmit} disabled={loading || Object.keys(validationErrors).length > 0} sx={{ flex: 1 }}>
                            {loading ? (loadingMessage || t('Saving...', 'שומר...')) : (type === 'DIVIDEND' ? (locationState?.editDividend ? t('Update Dividend', 'עדכן דיבידנד') : t('Record Dividend', 'שמור דיבידנד')) : (locationState?.editTransaction ? t('Update Transaction', 'עדכן עסקה') : t('Save Transaction', 'שמור עסקה')))}
                          </Button>
                        </span>
                      </Tooltip>
                    </Box>
<Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
                  <DialogTitle>{type === 'DIVIDEND' ? t('Delete Dividend', 'מחיקת דיבידנד') : t('Delete Transaction', 'מחיקת עסקה')}</DialogTitle>
                  <DialogContent>
                    <DialogContentText>{t('Are you sure you want to permanently delete this? This action cannot be undone.', 'האם אתה בטוח שברצונך למחוק עסקה זו לצמיתות? לא ניתן לבטל פעולה זו.')}</DialogContentText>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setShowDeleteConfirm(false)} color="primary">{t('Cancel', 'ביטול')}</Button>
                    <Button onClick={confirmDelete} color="error" variant="contained">{t('Delete', 'מחק')}</Button>
                  </DialogActions>
                </Dialog>
        </AccordionDetails>
      </Accordion>
      
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
    </Box>
  );
};
