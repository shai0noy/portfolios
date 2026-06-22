import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress, Alert, IconButton,
  ToggleButton, ToggleButtonGroup, Paper, useTheme, Breadcrumbs, Link as MuiLink,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, Chip, Stack, Button
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AddAlertIcon from '@mui/icons-material/AddAlert';
import { Link as RouterLink } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { toast } from 'react-hot-toast';

import { useDashboardData } from '../lib/dashboard';
import { fetchTickerHistory } from '../lib/fetching';
import { useLanguage } from '../lib/i18n';
import { formatPercent, formatMoneyValue, normalizeCurrency } from '../lib/currencyUtils';
import { Currency } from '../lib/types';
import type { TickerAlert } from '../lib/types';
import { updateTickerAlerts } from '../lib/sheets/api';

interface SparklineProps {
  data: { date: Date; price: number }[];
  isPositive: boolean;
}

function Sparkline({ data, isPositive }: SparklineProps) {
  const theme = useTheme();
  if (data.length === 0) return <Box sx={{ height: 50 }} />;
  
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.05 || 0.1;
  const domain = [min - padding, max + padding];

  const color = isPositive ? theme.palette.success.main : theme.palette.error.main;
  const gradientId = `gradient-${isPositive ? 'pos' : 'neg'}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <ResponsiveContainer width="100%" height={50}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <YAxis type="number" domain={domain} hide />
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface WatchlistPageProps {
  sheetId: string;
}

export function WatchlistPage({ sheetId }: WatchlistPageProps) {
  const { t, isRtl } = useLanguage();
  const theme = useTheme();

  const { holdings, loading, error, trackingLists, engine } = useDashboardData(sheetId);

  // Local state for display currency
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(() => 
    normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD')
  );

  // Filter tracking list to only Watchlist items
  const watchlistItems = useMemo(() => {
    return trackingLists.filter(item => item.listName === 'Watchlist');
  }, [trackingLists]);

  // Local state for alerts
  const [localAlerts, setLocalAlerts] = useState<Record<string, TickerAlert[]>>({});
  
  // Dialog fields
  const [openAddAlert, setOpenAddAlert] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);
  const [alertType, setAlertType] = useState<'price_above' | 'price_below' | 'price_moved_percent' | 'pct_change_from_now'>('price_above');
  const [targetPrice, setTargetPrice] = useState('');
  const [percentChange, setPercentChange] = useState('');
  const [daysWindow, setDaysWindow] = useState('7');
  const [pctFromNowDirection, setPctFromNowDirection] = useState<'up' | 'down'>('up');

  // Synchronize local alerts map whenever watchlistItems change
  useEffect(() => {
    const alertsMap: Record<string, TickerAlert[]> = {};
    watchlistItems.forEach(item => {
      alertsMap[`${item.exchange}:${item.ticker}`] = item.alerts || [];
    });
    setLocalAlerts(alertsMap);
  }, [watchlistItems]);

  const handleAddAlertSubmit = async () => {
    if (!activeItem) return;
    const curPrice = engine?.livePrices.get(`${activeItem.exchange}:${activeItem.ticker}`)?.price || 0;

    let finalType: 'price_above' | 'price_below' | 'price_moved_percent' = 'price_above';
    let finalTargetPrice: number | undefined;
    let finalPercentChange: number | undefined;
    let finalDaysWindow: number | undefined;

    if (alertType === 'price_above') {
      finalType = 'price_above';
      finalTargetPrice = parseFloat(targetPrice);
    } else if (alertType === 'price_below') {
      finalType = 'price_below';
      finalTargetPrice = parseFloat(targetPrice);
    } else if (alertType === 'price_moved_percent') {
      finalType = 'price_moved_percent';
      finalPercentChange = parseFloat(percentChange);
      finalDaysWindow = parseInt(daysWindow, 10);
    } else if (alertType === 'pct_change_from_now') {
      const pct = parseFloat(percentChange);
      if (pctFromNowDirection === 'up') {
        finalType = 'price_above';
        finalTargetPrice = curPrice * (1 + pct / 100);
      } else {
        finalType = 'price_below';
        finalTargetPrice = curPrice * (1 - pct / 100);
      }
    }

    if (finalType === 'price_moved_percent') {
      if (isNaN(finalPercentChange!) || isNaN(finalDaysWindow!)) {
        toast.error(t('Please enter valid numeric fields', 'אנא הזן ערכים מספריים תקינים'));
        return;
      }
    } else {
      if (isNaN(finalTargetPrice!)) {
        toast.error(t('Please enter a valid target price', 'אנא הזן מחיר יעד תקין'));
        return;
      }
    }

    const newAlert: TickerAlert = {
      id: Math.random().toString(36).substr(2, 9),
      type: finalType,
      targetPrice: finalTargetPrice,
      percentChange: finalPercentChange,
      daysWindow: finalDaysWindow,
      creationPrice: curPrice,
      creationDate: new Date().toISOString()
    };

    const key = `${activeItem.exchange}:${activeItem.ticker}`;
    const currentAlerts = localAlerts[key] || [];
    const updatedAlerts = [...currentAlerts, newAlert];

    setLocalAlerts(prev => ({ ...prev, [key]: updatedAlerts }));
    setOpenAddAlert(false);

    try {
      await updateTickerAlerts(sheetId, 'Watchlist', activeItem.ticker, activeItem.exchange, updatedAlerts);
      toast.success(t('Alert saved successfully', 'התראה נשמרה בהצלחה'));
    } catch (e) {
      console.error(e);
      toast.error(t('Failed to save alert', 'שגיאה בשמירת ההתראה'));
    }
  };

  const handleDeleteAlert = async (item: any, alertId: string) => {
    const key = `${item.exchange}:${item.ticker}`;
    const currentAlerts = localAlerts[key] || [];
    const updatedAlerts = currentAlerts.filter(a => a.id !== alertId);

    setLocalAlerts(prev => ({ ...prev, [key]: updatedAlerts }));

    try {
      await updateTickerAlerts(sheetId, 'Watchlist', item.ticker, item.exchange, updatedAlerts);
      toast.success(t('Alert deleted', 'התראה נמחקה'));
    } catch (e) {
      console.error(e);
      toast.error(t('Failed to delete alert', 'שגיאה במחיקת ההתראה'));
    }
  };

  // Load history data for sparklines & min/max
  const [historyData, setHistoryData] = useState<Record<string, { date: Date; price: number }[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      setLoadingHistory(true);
      const results: Record<string, { date: Date; price: number }[]> = {};
      
      await Promise.all(watchlistItems.map(async (item) => {
        try {
          const res = await fetchTickerHistory(item.ticker, item.exchange);
          if (res?.historical && active) {
            results[`${item.exchange}:${item.ticker}`] = res.historical;
          }
        } catch (e) {
          console.error(`Failed to fetch history for ${item.ticker}`, e);
        }
      }));

      if (active) {
        setHistoryData(results);
        setLoadingHistory(false);
      }
    };

    if (watchlistItems.length > 0) {
      loadHistory();
    } else {
      setLoadingHistory(false);
    }

    return () => { active = false; };
  }, [watchlistItems]);

  const handleCurrencyChange = (_: React.SyntheticEvent, newCurrency: Currency | null) => {
    if (newCurrency) {
      setDisplayCurrency(newCurrency);
      localStorage.setItem('displayCurrency', newCurrency);
    }
  };

  const getTickerDisplayName = (item: any) => {
    // If we have live quote info with name
    const liveData = engine?.livePrices.get(`${item.exchange}:${item.ticker}`);
    const name = isRtl ? (item.nameHe || item.name) : item.name;
    return liveData?.name || name || item.ticker;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box m={2}>
        <Alert severity="error">
          {error === 'session_expired' 
            ? t('Your session has expired. Please sign in again.', 'פג תוקף החיבור. אנא התחבר שנית.')
            : t('Error loading watchlist data.', 'שגיאה בטעינת נתוני רשימת המעקב.')}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 3, px: { xs: 1, sm: 2 } }}>
      {/* Page Header */}
      <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={800} color="text.primary" gutterBottom>
            {t('Watchlist Situation Room', 'חדר מצב רשימת מעקב')}
          </Typography>
          <Breadcrumbs aria-label="breadcrumb">
            <MuiLink component={RouterLink} to="/dashboard" color="inherit" underline="hover">
              {t('Dashboard', 'דאשבורד')}
            </MuiLink>
            <Typography color="text.primary">{t('Watchlist', 'רשימת מעקב')}</Typography>
          </Breadcrumbs>
        </Box>

        <ToggleButtonGroup
          value={displayCurrency}
          exclusive
          onChange={handleCurrencyChange}
          size="small"
          aria-label="display currency selector"
        >
          <ToggleButton value={Currency.USD} aria-label="USD">USD</ToggleButton>
          <ToggleButton value={Currency.ILS} aria-label="ILS">ILS</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {watchlistItems.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.default' }} variant="outlined">
          <NotificationsActiveIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.primary" gutterBottom>
            {t('Your Watchlist is empty', 'רשימת המעקב שלך ריקה')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('To start monitoring assets, search for a ticker and tap the bell icon next to its name on the details page.', 
               'כדי להתחיל לעקוב אחר נכסים, חפש מניה ולחץ על סמל הפעמון בדף פרטי המניה.')}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {watchlistItems.map((item) => {
            const key = `${item.exchange}:${item.ticker}`;
            const liveData = engine?.livePrices.get(key);
            
            // Get 1-month history
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            const hist = (historyData[key] || [])
              .filter(p => new Date(p.date) >= oneMonthAgo)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const prices = hist.map(p => p.price);
            const min1m = prices.length > 0 ? Math.min(...prices) : 0;
            const max1m = prices.length > 0 ? Math.max(...prices) : 0;

            // Live Performance stats
            const curPrice = liveData?.price || (prices.length > 0 ? prices[prices.length - 1] : 0);
            const currencyCode = liveData?.currency || 'USD';
            
            const change1d = liveData?.changePct1d ?? 0;
            const change1w = liveData?.changePctRecent ?? 0;
            const change1m = liveData?.changePct1m ?? 0;

            // Aggregate Ownership
            const matchingHoldings = holdings.filter(h => h.ticker === item.ticker && h.exchange === item.exchange);
            const totalOwnedQty = matchingHoldings.reduce((sum, h) => sum + h.qtyTotal, 0);
            const totalOwnedValue = matchingHoldings.reduce((sum, h) => {
              const val = h.display.marketValue;
              return sum + val;
            }, 0);

            const isPositive1m = change1m >= 0;

            // Evaluate alerts
            const alerts = localAlerts[key] || [];
            const itemAlerts = alerts.map(alert => {
              let isTriggered = false;
              if (alert.type === 'price_above' && alert.targetPrice !== undefined) {
                isTriggered = curPrice >= alert.targetPrice;
              } else if (alert.type === 'price_below' && alert.targetPrice !== undefined) {
                isTriggered = curPrice <= alert.targetPrice;
              } else if (alert.type === 'price_moved_percent' && alert.percentChange !== undefined && alert.daysWindow !== undefined) {
                if (hist && hist.length > 0) {
                  const targetDate = new Date();
                  targetDate.setDate(targetDate.getDate() - alert.daysWindow);
                  
                  let priceNDaysAgo: number | undefined;
                  let minTimeDiff = Infinity;
                  for (const p of hist) {
                    const pDate = new Date(p.date);
                    const diff = Math.abs(pDate.getTime() - targetDate.getTime());
                    if (diff < minTimeDiff) {
                      minTimeDiff = diff;
                      priceNDaysAgo = p.price;
                    }
                  }
                  
                  if (priceNDaysAgo && priceNDaysAgo > 0) {
                    const changePct = (curPrice - priceNDaysAgo) / priceNDaysAgo;
                    isTriggered = Math.abs(changePct) * 100 >= alert.percentChange;
                  }
                } else {
                  const changePct = alert.daysWindow <= 1 ? liveData?.changePct1d :
                                    alert.daysWindow <= 7 ? liveData?.changePctRecent :
                                    liveData?.changePct1m;
                  isTriggered = Math.abs(changePct || 0) * 100 >= alert.percentChange;
                }
              }
              return { ...alert, isTriggered };
            });

            const isCardAlerted = itemAlerts.some(a => a.isTriggered);

            return (
              <Grid item xs={12} sm={6} md={4} key={key}>
                <Card 
                  variant="outlined" 
                  sx={{ 
                    height: '100%', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    position: 'relative',
                    border: isCardAlerted ? `1px solid ${theme.palette.error.main}` : undefined,
                    boxShadow: isCardAlerted ? `0 0 8px ${theme.palette.error.main}40` : undefined,
                    transition: 'border 0.3s ease, box-shadow 0.3s ease'
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, pb: '16px !important' }}>
                    
                    {/* Header */}
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                      <Box>
                        <Box display="flex" alignItems="center">
                          {isCardAlerted && (
                            <NotificationsActiveIcon 
                              color="error" 
                              sx={{ 
                                mr: 0.75, 
                                fontSize: '1.25rem',
                                animation: 'shake 0.5s infinite',
                                '@keyframes shake': {
                                  '0%': { transform: 'rotate(0deg)' },
                                  '25%': { transform: 'rotate(15deg)' },
                                  '50%': { transform: 'rotate(0deg)' },
                                  '75%': { transform: 'rotate(-15deg)' },
                                  '100%': { transform: 'rotate(0deg)' }
                                }
                              }} 
                            />
                          )}
                          <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            {getTickerDisplayName(item)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {item.ticker} • {t(item.exchange, item.exchange)}
                        </Typography>
                      </Box>
                      <IconButton 
                        component={RouterLink} 
                        to={`/ticker/${item.exchange}/${item.ticker}`}
                        size="small"
                        color="primary"
                        sx={{ mt: -0.5, mr: -0.5 }}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    {/* Price and Day Change */}
                    <Box display="flex" alignItems="baseline" gap={1.5} mb={2}>
                      <Typography variant="h4" fontWeight={800} color="text.primary">
                        {formatMoneyValue({ amount: curPrice, currency: normalizeCurrency(currencyCode) }, t)}
                      </Typography>
                      <Box display="flex" alignItems="center" color={change1d >= 0 ? 'success.main' : 'error.main'}>
                        {change1d >= 0 ? <TrendingUpIcon fontSize="inherit" /> : <TrendingDownIcon fontSize="inherit" />}
                        <Typography variant="body2" fontWeight="bold" sx={{ ml: 0.25 }}>
                          {formatPercent(change1d, true)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Recent Changes Tabular Grid */}
                    <Paper variant="outlined" sx={{ p: 1, mb: 2, bgcolor: 'background.default', borderStyle: 'dashed' }}>
                      <Grid container spacing={1} textAlign="center">
                        <Grid item xs={4}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {t('1D', 'יומי')}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color={change1d >= 0 ? 'success.main' : 'error.main'}>
                            {formatPercent(change1d, true)}
                          </Typography>
                        </Grid>
                        <Grid item xs={4} sx={{ borderLeft: `1px solid ${theme.palette.divider}`, borderRight: `1px solid ${theme.palette.divider}` }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {t('1W', 'שבועי')}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color={change1w >= 0 ? 'success.main' : 'error.main'}>
                            {formatPercent(change1w, true)}
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {t('1M', 'חודשי')}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color={change1m >= 0 ? 'success.main' : 'error.main'}>
                            {formatPercent(change1m, true)}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>

                    {/* 1 Month Sparkline */}
                    <Box sx={{ mb: 2, position: 'relative' }}>
                      {loadingHistory ? (
                        <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 50 }}>
                          <CircularProgress size={16} />
                        </Box>
                      ) : (
                        <Sparkline data={hist} isPositive={isPositive1m} />
                      )}
                    </Box>

                    {/* Min / Max and Stats */}
                    <Box display="flex" justifyContent="space-between" mb={2}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {t('1M Min', 'מינימום חודשי')}
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {min1m > 0 ? formatMoneyValue({ amount: min1m, currency: normalizeCurrency(currencyCode) }, t) : '-'}
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Typography variant="caption" color="text.secondary" display="block">
                          {t('1M Max', 'מקסימום חודשי')}
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {max1m > 0 ? formatMoneyValue({ amount: max1m, currency: normalizeCurrency(currencyCode) }, t) : '-'}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Ownership Details */}
                    <Box 
                      display="flex" 
                      justifyContent="space-between" 
                      alignItems="center" 
                      pt={1.5} 
                      borderTop={`1px solid ${theme.palette.divider}`}
                      pb={1.5}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {t('Owned Status', 'מצב אחזקה')}
                      </Typography>
                      <Typography variant="body2" fontWeight={700} color={totalOwnedQty > 0 ? 'primary.main' : 'text.secondary'}>
                        {totalOwnedQty > 0 
                          ? `${totalOwnedQty} ${t('units', 'יח\'')} (${formatMoneyValue({ amount: totalOwnedValue, currency: displayCurrency }, t)})`
                          : t('Not Owned', 'לא מוחזק')}
                      </Typography>
                    </Box>

                    {/* Alerts Section */}
                    <Box pt={1.5} borderTop={`1px solid ${theme.palette.divider}`}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          {t('Alerts', 'התראות')}
                        </Typography>
                        <IconButton 
                          size="small" 
                          color="primary" 
                          onClick={() => {
                            setActiveItem(item);
                            setAlertType('price_above');
                            setTargetPrice(curPrice ? curPrice.toFixed(2) : '');
                            setPercentChange('');
                            setDaysWindow('7');
                            setOpenAddAlert(true);
                          }}
                          sx={{ p: 0.25 }}
                        >
                          <AddAlertIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      {itemAlerts.length === 0 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block' }}>
                          {t('No alerts set', 'אין התראות מוגדרות')}
                        </Typography>
                      ) : (
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {itemAlerts.map(alert => {
                            let label = '';
                            if (alert.type === 'price_above') {
                              label = `> ${formatMoneyValue({ amount: alert.targetPrice || 0, currency: normalizeCurrency(currencyCode) }, t)}`;
                            } else if (alert.type === 'price_below') {
                              label = `< ${formatMoneyValue({ amount: alert.targetPrice || 0, currency: normalizeCurrency(currencyCode) }, t)}`;
                            } else if (alert.type === 'price_moved_percent') {
                              label = `|Δ| > ${alert.percentChange}% (${alert.daysWindow}d)`;
                            }

                            return (
                              <Chip
                                key={alert.id}
                                label={label}
                                size="small"
                                color={alert.isTriggered ? "error" : "default"}
                                variant={alert.isTriggered ? "filled" : "outlined"}
                                onDelete={() => handleDeleteAlert(item, alert.id)}
                                sx={{ 
                                  fontSize: '0.75rem',
                                  animation: alert.isTriggered ? 'pulse 2s infinite' : 'none',
                                  '@keyframes pulse': {
                                    '0%': { opacity: 1 },
                                    '50%': { opacity: 0.6 },
                                    '100%': { opacity: 1 }
                                  }
                                }}
                              />
                            );
                          })}
                        </Box>
                      )}
                    </Box>

                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Add Alert Dialog */}
      <Dialog open={openAddAlert} onClose={() => setOpenAddAlert(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('Add Alert for', 'הוסף התראה עבור')} {activeItem ? getTickerDisplayName(activeItem) : ''}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="alert-type-label">{t('Alert Type', 'סוג התראה')}</InputLabel>
              <Select
                labelId="alert-type-label"
                value={alertType}
                label={t('Alert Type', 'סוג התראה')}
                onChange={(e) => setAlertType(e.target.value as any)}
              >
                <MenuItem value="price_above">{t('Price rises above', 'מחיר עולה מעל')}</MenuItem>
                <MenuItem value="price_below">{t('Price falls below', 'מחיר יורד מתחת')}</MenuItem>
                <MenuItem value="price_moved_percent">{t('Price moves by % in N days', 'שינוי במחיר ב-% תוך N ימים')}</MenuItem>
                <MenuItem value="pct_change_from_now">{t('% Change from current price', 'שינוי באחוזים מהמחיר הנוכחי')}</MenuItem>
              </Select>
            </FormControl>

            {(alertType === 'price_above' || alertType === 'price_below') && (
              <TextField
                fullWidth
                label={t('Target Price', 'מחיר יעד')}
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                variant="outlined"
              />
            )}

            {alertType === 'price_moved_percent' && (
              <Stack direction="row" spacing={2}>
                <TextField
                  fullWidth
                  label={t('Percent Change (%)', 'אחוז שינוי (%)')}
                  type="number"
                  value={percentChange}
                  onChange={(e) => setPercentChange(e.target.value)}
                  variant="outlined"
                />
                <TextField
                  fullWidth
                  label={t('Days Window', 'טווח ימים')}
                  type="number"
                  value={daysWindow}
                  onChange={(e) => setDaysWindow(e.target.value)}
                  variant="outlined"
                />
              </Stack>
            )}

            {alertType === 'pct_change_from_now' && (
              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="direction-label">{t('Direction', 'כיוון')}</InputLabel>
                  <Select
                    labelId="direction-label"
                    value={pctFromNowDirection}
                    label={t('Direction', 'כיוון')}
                    onChange={(e) => setPctFromNowDirection(e.target.value as any)}
                  >
                    <MenuItem value="up">{t('Up (%)', 'למעלה (%)')}</MenuItem>
                    <MenuItem value="down">{t('Down (%)', 'למטה (%)')}</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label={t('Percent Move (%)', 'שיעור תנועה (%)')}
                  type="number"
                  value={percentChange}
                  onChange={(e) => setPercentChange(e.target.value)}
                  variant="outlined"
                  helperText={
                    activeItem
                      ? `${t('Current price:', 'מחיר נוכחי:')} ${
                          (engine?.livePrices.get(`${activeItem.exchange}:${activeItem.ticker}`)?.price || 0).toFixed(2)
                        } => ${t('Target:', 'יעד:')} ${
                          (
                            (engine?.livePrices.get(`${activeItem.exchange}:${activeItem.ticker}`)?.price || 0) *
                            (1 + (pctFromNowDirection === 'up' ? 1 : -1) * (parseFloat(percentChange) || 0) / 100)
                          ).toFixed(2)
                        }`
                      : ''
                  }
                />
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddAlert(false)} color="inherit">
            {t('Cancel', 'ביטול')}
          </Button>
          <Button onClick={handleAddAlertSubmit} color="primary" variant="contained">
            {t('Save', 'שמור')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
