import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, TextField, Button, MenuItem, Select, InputLabel, FormControl,
  Typography, Alert, InputAdornment, Grid, Card, CardContent, Divider, Tooltip, Chip
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { parseExchange, type Portfolio, type Transaction } from '../lib/types';
import { addTransaction, fetchPortfolios, addExternalPrice } from '../lib/sheets/index';
import { getTickerData, type TickerData } from '../lib/fetching';
import { TickerSearch } from './TickerSearch'; 
import { convertCurrency, formatPrice, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { Currency, type ExchangeRates, Exchange } from '../lib/types';
import { useLanguage } from '../lib/i18n';

interface Props {
  sheetId: string;
  onSaveSuccess?: () => void;
  refreshTrigger?: number;
}

export const TransactionForm = ({ sheetId, onSaveSuccess, refreshTrigger }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { prefilledTicker?: string, prefilledExchange?: string, initialPrice?: string, initialCurrency?: string, numericId?: number, initialName?: string, initialNameHe?: string } | null;

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
  // The date state is stored in 'yyyy-MM-dd' format, which is required by the <input type="date"> element.
  // The conversion to Google Sheets format ('dd/MM/yyyy') happens in `addTransaction` on submission.
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [portId, setPortId] = useState('');
  const [ticker, setTicker] = useState(locationState?.prefilledTicker || '');
  const [exchange, setExchange] = useState(locationState?.prefilledExchange || '');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'FEE'>('BUY');
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
  const [tax, setTax] = useState<string>('');
  const [tickerCurrency, setTickerCurrency] = useState<Currency>(normalizeCurrency(locationState?.initialCurrency || ''));
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: boolean }>({});
  const [commissionPct, setCommissionPct] = useState<string>('');

  useEffect(() => {
    getExchangeRates(sheetId).then(setExchangeRates);
  }, [sheetId]);

  useEffect(() => {
    if (locationState?.prefilledTicker) {
      const fetchData = async () => {
        setLoading(true);
        const data = await getTickerData(locationState.prefilledTicker!, locationState.prefilledExchange || '',
          locationState.numericId || null, undefined, false);
        
        console.log('NewTransaction data:', data);
        console.log('NewTransaction locationState:', locationState);

        if (data) {
          const combinedData = { 
            ...data, 
            symbol: locationState.prefilledTicker!, 
            exchange: data.exchange || locationState.prefilledExchange || '', 
            numericId: locationState.numericId || data.numericId,
            name: data.name || locationState.initialName,
            nameHe: data.nameHe || locationState.initialNameHe
          };
          setSelectedTicker(combinedData as any);
          setPrice(data.price ? parseFloat(data.price.toFixed(6)).toString() : '');
          setTickerCurrency(normalizeCurrency(data.currency || ''));
          setExchange(data.exchange || locationState.prefilledExchange || '');
          setTicker(locationState.prefilledTicker!)
          setShowForm(true);
        } else {
          setPriceError(`${t('Ticker not found on', 'הנייר לא נמצא ב-')}${locationState.prefilledExchange}`);
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

  const handleTickerSelect = (selected: TickerData & { symbol: string }) => {
    setSelectedTicker(selected);
    setTicker(selected.symbol);
    setExchange(selected.exchange || '');
    setShowForm(true); // Show form immediately
    setPriceError('');
    if (selected.price) {
      setPrice(parseFloat(selected.price.toFixed(6)).toString());
      setTickerCurrency(normalizeCurrency(selected.currency || ''));
    } else {
      setPrice('');
      setTickerCurrency(Currency.USD);
    }
    setQty(''); // Clear form fields for new entry
    setTotal('');
    setComment('');
    setCommission('');
    setCommissionPct('');
    setTax('');
    setVestDate('');
    setType('BUY');
    setDate(new Date().toISOString().split('T')[0]);
    setSaveSuccess(false);
  };

  useEffect(() => {
    const selectedPort = portfolios.find(p => p.id === portId);
    if (!selectedPort) return;

    const t = parseFloat(total);
    if (!Number.isFinite(t) || t === 0) {
      setCommission('');
      setCommissionPct('');
      return;
    }

    if (type === 'BUY' || type === 'SELL') {
      const rate = selectedPort.commRate;
      const min = selectedPort.commMin;
      const max = selectedPort.commMax;
      const rawFee = t * rate;
      const clampedMin = Math.max(rawFee, min);
      const finalFee = max > 0 ? Math.min(clampedMin, max) : clampedMin;
      setCommission(finalFee.toFixed(2));
      setCommissionPct(((finalFee / t) * 100).toFixed(4));
    } else if (type === 'DIVIDEND') {
      const rate = selectedPort.divCommRate;
      setCommission((t * rate).toFixed(2));
      setCommissionPct((rate * 100).toFixed(4));
    }
  }, [portId, type, total, portfolios]);


  const EPS = 1e-12;
  const majorCurrency = tickerCurrency === Currency.ILA ? Currency.ILS : tickerCurrency;

  const handleQtyChange = (val: string) => {
    setQty(val);
    const q = parseFloat(val);
    const p = parseFloat(price);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      const rawTotal = q * p;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      setTotal(parseFloat(displayTotal.toFixed(6)).toString());
    }
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    const q = parseFloat(qty);
    const p = parseFloat(val);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      const rawTotal = q * p;
      const displayTotal = convertCurrency(rawTotal, tickerCurrency, majorCurrency, exchangeRates);
      setTotal(parseFloat(displayTotal.toFixed(6)).toString());
    }
  };

  const handleTotalChange = (val: string) => {
    setTotal(val);
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

  const handleSubmit = async () => {
    const errors: { [key: string]: boolean } = {};
    if (!portId) errors.portId = true;
    if (!ticker) errors.ticker = true;
    if (!qty || parseFloat(qty) === 0) errors.qty = true;
    if (!price || parseFloat(price) === 0) errors.price = true;
    if (!total || parseFloat(total) === 0) errors.total = true;

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    setSaveSuccess(false);

    try {
      const q = parseFloat(qty);
      const p = parseFloat(price);

      const txn: Transaction = {
        date,
        portfolioId: portId,
        ticker,
        exchange: parseExchange(exchange),
        type,
        originalQty: q,
        originalPrice: p,
        origOpenPriceAtCreationDate: selectedTicker?.openPrice || 0,
        currency: normalizeCurrency(tickerCurrency),
        numericId: (selectedTicker as any)?.numericId,
        vestDate,
        comment,
        commission: parseFloat(commission) || 0,
        tax: parseFloat(tax) || 0,
      };

      await addTransaction(sheetId, txn);

      // If GEMEL or PENSION, also save the fetched price to external holdings for history
      if ((parseExchange(exchange) === Exchange.GEMEL || parseExchange(exchange) === Exchange.PENSION) && selectedTicker?.price && selectedTicker?.timestamp) {
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

      setSaveSuccess(true);
      if (onSaveSuccess) {
        onSaveSuccess();
      }
      // Clear form for next entry of the SAME ticker
      setQty('');
      setTotal('');
      setCommission('');
      setCommissionPct('');
      setTax('');
      setComment('');
      setVestDate('');
      setType('BUY');
      setDate(new Date().toISOString().split('T')[0]);
      setShowForm(false); // Hide form, show summary card again
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
          numericId: (selectedTicker as any).numericId?.toString(),
          initialName: selectedTicker.name,
          initialNameHe: (selectedTicker as any).nameHe
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
        {t('New Transaction', 'הוסף עסקה חדשה')}
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
          {t('Transaction for', 'עסקה עבור')} {ticker} {t('saved!', 'נשמרה!')}
        </Alert>
      )}

      <Grid container spacing={2}>
        {(!selectedTicker && !locationState?.prefilledTicker) && (
          <Grid item xs={12}>
            <TickerSearch
              onTickerSelect={handleTickerSelect}
              portfolios={portfolios}
              isPortfoliosLoading={isPortfoliosLoading}
            />
          </Grid>
        )}

        {(selectedTicker) && (
          <Grid item xs={12} sx={{ p: 2 }}>
            <Card variant="outlined">
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h6">{tTry(selectedTicker.name, (selectedTicker as any).nameHe)}</Typography>
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
                    sx={{ cursor: 'pointer' }}
                  />
                  {selectedTicker?.price && (
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {formatPrice(selectedTicker.price, tickerCurrency, 2, t)}
                    </Typography>
                  )}
                  {selectedTicker?.source && (
                    <Typography variant="caption" color="text.secondary">
                      ({selectedTicker.source})
                    </Typography>
                  )}
                </Box>

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
                    <Grid item xs={12}><Divider sx={{ my: 1 }}>Transaction Details</Divider></Grid>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={4}>
                        <FormControl fullWidth size="small" error={!!validationErrors.portId} required>
                          <InputLabel>Portfolio</InputLabel>
                          <Select
                            value={portId} label="Portfolio"
                            onChange={(e) => setPortId(e.target.value)}
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
                      <Grid item xs={12} sm={4}>
                        <TextField
                          type="date" label="Date" size="small" fullWidth
                          value={date} onChange={e => setDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Type</InputLabel>
                          <Select value={type} label="Type" onChange={(e) => setType(e.target.value as any)}>
                            <MenuItem value="BUY">Buy</MenuItem>
                            <MenuItem value="SELL">Sell</MenuItem>
                            <MenuItem value="DIVIDEND">Dividend</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
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
                        />
                      </Grid>
                      <Grid item xs={4} sm={3}>
                        <TextField
                          label="Comm %" type="number" size="small" fullWidth
                          value={commissionPct} onChange={e => handleCommissionPctChange(e.target.value)}
                          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        />
                      </Grid>
                      {(type === 'SELL' || type === 'DIVIDEND') && (
                        <Grid item xs={4} sm={3}>
                          <Tooltip title="Tax on transaction (if applicable).">
                            <TextField label="Tax %" type="number" size="small" fullWidth value={tax} onChange={e => setTax(e.target.value)} />
                          </Tooltip>
                        </Grid>
                      )}
                      <Grid item xs={12} sm={(type === 'SELL' || type === 'DIVIDEND') ? 6 : 9}>
                        <Tooltip title="Date when these shares vest (if applicable for RSUs/Options).">
                          <TextField label="Vesting Date" type="date" size="small" fullWidth value={vestDate} onChange={e => setVestDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                        </Tooltip>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField label="Comment" size="small" fullWidth value={comment} onChange={e => setComment(e.target.value)} />
                      </Grid>
                    </Grid>
                    <Box mt={2}>
                      <Button variant="contained" size="large" fullWidth startIcon={<AddCircleOutlineIcon />} onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Saving...' : 'Save Transaction'}
                      </Button>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid >
    </Box >
  );
};
