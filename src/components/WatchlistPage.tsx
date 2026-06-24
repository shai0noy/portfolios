import { evaluateAlert } from '../lib/alerts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress, Alert, IconButton,
  ToggleButton, ToggleButtonGroup, Paper, useTheme, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip, Stack, Button
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AddAlertIcon from '@mui/icons-material/AddAlert';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Link as RouterLink } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip } from 'recharts';
import { toast } from 'react-hot-toast';

import { useDashboardData, calculateDashboardSummary } from '../lib/dashboard';
import { fetchTickerHistory } from '../lib/fetching';
import { useLanguage } from '../lib/i18n';
import { formatPercent, formatMoneyValue, normalizeCurrency } from '../lib/currencyUtils';
import { Currency } from '../lib/types';
import type { TickerAlert } from '../lib/types';
import { updateTickerAlerts } from '../lib/sheets/api';

interface SparklineProps {
  data: { date: Date; price: number }[];
  isPositive: boolean;
  currency: string;
}

function Sparkline({ data, isPositive, currency }: SparklineProps) {
  const theme = useTheme();
  const { t, isRtl } = useLanguage();

  if (data.length === 0) return <Box sx={{ height: 90 }} />;
  
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.05 || 0.1;
  const domain = [min - padding, max + padding];

  const color = isPositive ? theme.palette.success.main : theme.palette.error.main;
  const gradientId = `gradient-${isPositive ? 'pos' : 'neg'}-${Math.random().toString(36).substr(2, 9)}`;

  const formatXAxis = (dateVal: any) => {
    const d = new Date(dateVal);
    return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const formatYAxis = (value: number) => {
    const symbol = normalizeCurrency(currency) === 'ILS' ? '₪' : '$';
    if (value >= 1000) {
      return `${symbol}${(value / 1000).toFixed(1)}K`;
    }
    if (value >= 10) {
      return `${symbol}${value.toFixed(0)}`;
    }
    return `${symbol}${value.toFixed(1)}`;
  };

  return (
    <ResponsiveContainer width="100%" height={90}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -5, bottom: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatXAxis}
          tick={{ fontSize: 8, fill: theme.palette.text.secondary }}
          axisLine={false}
          tickLine={false}
          dy={4}
        />
        <YAxis
          type="number"
          domain={domain}
          tickFormatter={formatYAxis}
          tick={{ fontSize: 8, fill: theme.palette.text.secondary }}
          axisLine={false}
          tickLine={false}
          width={35}
        />
        <ChartTooltip
          contentStyle={{
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            borderRadius: 6,
            fontSize: '0.75rem',
            boxShadow: theme.shadows[2],
            padding: '4px 8px'
          }}
          labelFormatter={(label) => {
            const d = new Date(label);
            return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }}
          formatter={(value: any) => [
            formatMoneyValue({ amount: parseFloat(value) || 0, currency: normalizeCurrency(currency) }, t),
            t('Price', 'מחיר')
          ]}
        />
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

  const { holdings: rawHoldings, loading, error, trackingLists, engine, portfolios, exchangeRates, refresh } = useDashboardData(sheetId);

  const getAlertTriggerDescription = (alert: TickerAlert, currencyCode: string, curPrice: number, hist: any[]) => {
    const dir = alert.direction || 'both';
    const currency = normalizeCurrency(currencyCode);

    if (alert.type === 'price_above') {
      if (alert.isTriggered) {
        return t(
          `Price is ${formatMoneyValue({ amount: curPrice, currency }, t)} (target: > ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)})`,
          `המחיר הנוכחי ${formatMoneyValue({ amount: curPrice, currency }, t)} (יעד: > ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)})`
        );
      }
      return t(
        `Triggers when price rises above ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)}`,
        `מופעל כאשר המחיר עולה מעל ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)}`
      );
    }

    if (alert.type === 'price_below') {
      if (alert.isTriggered) {
        return t(
          `Price is ${formatMoneyValue({ amount: curPrice, currency }, t)} (target: < ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)})`,
          `המחיר הנוכחי ${formatMoneyValue({ amount: curPrice, currency }, t)} (יעד: < ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)})`
        );
      }
      return t(
        `Triggers when price falls below ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)}`,
        `מופעל כאשר המחיר יורד מתחת ${formatMoneyValue({ amount: alert.targetPrice || 0, currency }, t)}`
      );
    }

    if (alert.type === 'price_moved_percent' && alert.percentChange !== undefined && alert.daysWindow !== undefined) {
      let actualChange = 0;
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
          actualChange = ((curPrice - priceNDaysAgo) / priceNDaysAgo) * 100;
        }
      }

      if (alert.isTriggered) {
        const directionVerb = actualChange >= 0 ? t('rose by', 'עלה ב-') : t('fell by', 'ירד ב-');
        return t(
          `Price ${directionVerb} ${Math.abs(actualChange).toFixed(2)}% over the last ${alert.daysWindow} days`,
          `המחיר ${directionVerb} ${Math.abs(actualChange).toFixed(2)}% במהלך ${alert.daysWindow} הימים האחרונים`
        );
      }

      const directionStr = dir === 'up' ? t('rises by', 'עולה ב-') : dir === 'down' ? t('falls by', 'יורד ב-') : t('moves by', 'משתנה ב-');
      return t(
        `Triggers when price ${directionStr} ${alert.percentChange}% over ${alert.daysWindow} days`,
        `מופעל כאשר המחיר ${directionStr} ${alert.percentChange}% תוך ${alert.daysWindow} ימים`
      );
    }

    return '';
  };

  // Local state for display currency
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(() => 
    normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD')
  );

  // Compute enriched holdings with display values
  const enrichedHoldings = useMemo(() => {
    if (!rawHoldings || rawHoldings.length === 0 || !exchangeRates || !exchangeRates.current || loading || !engine) {
      return [];
    }
    const newPortMap = new Map(portfolios.map(p => [p.id, p]));
    const result = calculateDashboardSummary(rawHoldings, displayCurrency, exchangeRates, newPortMap, engine);
    return result.holdings;
  }, [rawHoldings, displayCurrency, exchangeRates, portfolios, loading, engine]);

  // Filter tracking list to only Watchlist items
  const watchlistItems = useMemo(() => {
    return trackingLists.filter(item => item.listName === 'Watchlist');
  }, [trackingLists]);

  // Local state for alerts
  const [localAlerts, setLocalAlerts] = useState<Record<string, TickerAlert[]>>({});
  
  // Dialog fields
  const [openAddAlert, setOpenAddAlert] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);
  const [alertMode, setAlertMode] = useState<'price_target' | 'price_moved_percent'>('price_target');
  const [priceTargetType, setPriceTargetType] = useState<'absolute' | 'relative'>('absolute');
  const [targetPrice, setTargetPrice] = useState('');
  const [percentChange, setPercentChange] = useState('');
  const [daysWindow, setDaysWindow] = useState('7');
  const [direction, setDirection] = useState<'up' | 'down' | 'both'>('up');

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
    let finalDirection: 'up' | 'down' | 'both' = direction;

    if (alertMode === 'price_target') {
      if (priceTargetType === 'absolute') {
        finalTargetPrice = parseFloat(targetPrice);
        if (direction === 'up') {
          finalType = 'price_above';
        } else if (direction === 'down') {
          finalType = 'price_below';
        } else {
          finalType = finalTargetPrice >= curPrice ? 'price_above' : 'price_below';
        }
      } else {
        const pct = parseFloat(percentChange);
        finalPercentChange = pct;
        if (direction === 'up') {
          finalType = 'price_above';
          finalTargetPrice = curPrice * (1 + pct / 100);
        } else if (direction === 'down') {
          finalType = 'price_below';
          finalTargetPrice = curPrice * (1 - pct / 100);
        } else {
          finalType = 'price_above';
          finalTargetPrice = curPrice * (1 + pct / 100);
        }
      }
    } else if (alertMode === 'price_moved_percent') {
      finalType = 'price_moved_percent';
      finalPercentChange = parseFloat(percentChange);
      finalDaysWindow = parseInt(daysWindow, 10);
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
      creationDate: new Date().toISOString(),
      direction: finalDirection
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
      {/* Currency Switcher */}
      <Box display="flex" justifyContent="flex-end" mb={2} alignItems="center" gap={2}>
        {refresh && (
          <Tooltip title={t("Refresh Data", "רענן נתונים")}>
            <IconButton onClick={() => refresh(true)} size="small" sx={{ color: 'text.secondary' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
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
            
            let hist = [...(historyData[key] || [])]
              .filter(p => new Date(p.date) >= oneMonthAgo)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Append live price to the end of history so the chart stretches to today
            if (liveData && liveData.price !== undefined) {
              const todayStr = new Date().toISOString().split('T')[0];
              const lastHistDateStr = hist.length > 0 ? new Date(hist[hist.length - 1].date).toISOString().split('T')[0] : '';
              
              if (lastHistDateStr !== todayStr) {
                hist.push({
                  date: new Date(),
                  price: liveData.price
                });
              } else if (hist.length > 0) {
                // Update last element with latest live price
                hist[hist.length - 1] = {
                  ...hist[hist.length - 1],
                  price: liveData.price
                };
              }
            }

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
            const matchingHoldings = enrichedHoldings.filter(h => h.ticker === item.ticker && h.exchange === item.exchange);
            const totalOwnedQty = matchingHoldings.reduce((sum, h) => sum + h.qtyTotal, 0);
            const totalOwnedValue = matchingHoldings.reduce((sum, h) => {
              const val = h.display?.marketValue || 0;
              return sum + val;
            }, 0);

            const isPositive1m = change1m >= 0;

            // Evaluate alerts
            const alerts = localAlerts[key] || [];
            const itemAlerts = alerts.map(alert => {
              const isTriggered = evaluateAlert(alert, liveData as any);
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
                            <Tooltip
                              title={
                                itemAlerts
                                  .filter(a => a.isTriggered)
                                  .map(a => getAlertTriggerDescription(a, currencyCode, curPrice, hist))
                                  .join('\n')
                              }
                              arrow
                            >
                              <NotificationsActiveIcon 
                                color="error" 
                                sx={{ 
                                  mr: 0.75, 
                                  fontSize: '1.25rem',
                                  animation: 'shake 0.5s ease-in-out 6',
                                  '@keyframes shake': {
                                    '0%': { transform: 'rotate(0deg)' },
                                    '25%': { transform: 'rotate(15deg)' },
                                    '50%': { transform: 'rotate(0deg)' },
                                    '75%': { transform: 'rotate(-15deg)' },
                                    '100%': { transform: 'rotate(0deg)' }
                                  }
                                }} 
                              />
                            </Tooltip>
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

                    {/* Price */}
                    <Box display="flex" alignItems="baseline" gap={1.5} mb={1}>
                      <Typography variant="h5" fontWeight={800} color="text.primary">
                        {formatMoneyValue({ amount: curPrice, currency: normalizeCurrency(currencyCode) }, t)}
                      </Typography>
                    </Box>

                    {/* Recent Changes Tabular Grid */}
                    <Paper variant="outlined" sx={{ p: 0.75, mb: 1.5, bgcolor: 'background.default', borderStyle: 'dashed' }}>
                      <Grid container spacing={0.5} textAlign="center">
                        <Grid item xs={4}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                            {t('1D', 'יומי')}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color={change1d >= 0 ? 'success.main' : 'error.main'} sx={{ fontSize: '0.75rem' }}>
                            {formatPercent(change1d, true)}
                          </Typography>
                        </Grid>
                        <Grid item xs={4} sx={{ borderLeft: `1px solid ${theme.palette.divider}`, borderRight: `1px solid ${theme.palette.divider}` }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                            {t('1W', 'שבועי')}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color={change1w >= 0 ? 'success.main' : 'error.main'} sx={{ fontSize: '0.75rem' }}>
                            {formatPercent(change1w, true)}
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                            {t('1M', 'חודשי')}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color={change1m >= 0 ? 'success.main' : 'error.main'} sx={{ fontSize: '0.75rem' }}>
                            {formatPercent(change1m, true)}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>

                    {/* 1 Month Sparkline */}
                    <Box sx={{ mb: 1.5, position: 'relative' }}>
                      {loadingHistory ? (
                        <Box display="flex" justifyContent="center" alignItems="center" sx={{ height: 90 }}>
                          <CircularProgress size={16} />
                        </Box>
                      ) : (
                        <Sparkline data={hist} isPositive={isPositive1m} currency={currencyCode} />
                      )}
                    </Box>

                    {/* Min / Max and Stats */}
                    <Box display="flex" justifyContent="space-between" mb={1.5}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                          {t('1M Min', 'מינימום חודשי')}
                        </Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>
                          {min1m > 0 ? formatMoneyValue({ amount: min1m, currency: normalizeCurrency(currencyCode) }, t) : '-'}
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                          {t('1M Max', 'מקסימום חודשי')}
                        </Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>
                          {max1m > 0 ? formatMoneyValue({ amount: max1m, currency: normalizeCurrency(currencyCode) }, t) : '-'}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Ownership Details */}
                    <Box 
                      display="flex" 
                      justifyContent="space-between" 
                      alignItems="center" 
                      pt={1} 
                      borderTop={`1px solid ${theme.palette.divider}`}
                      pb={1}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {t('Owned Status', 'מצב אחזקה')}
                      </Typography>
                      <Typography variant="caption" fontWeight={600} color={totalOwnedQty > 0 ? 'primary.main' : 'text.secondary'}>
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
                            setAlertMode('price_target');
                            setPriceTargetType('absolute');
                            setTargetPrice(curPrice ? curPrice.toFixed(2) : '');
                            setPercentChange('5');
                            setDaysWindow('7');
                            setDirection('up');
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
                            const dir = alert.direction || 'both';
                            if (alert.type === 'price_above') {
                              const sign = dir === 'both' ? '≈' : '>';
                              label = `${sign} ${formatMoneyValue({ amount: alert.targetPrice || 0, currency: normalizeCurrency(currencyCode) }, t)}`;
                            } else if (alert.type === 'price_below') {
                              const sign = dir === 'both' ? '≈' : '<';
                              label = `${sign} ${formatMoneyValue({ amount: alert.targetPrice || 0, currency: normalizeCurrency(currencyCode) }, t)}`;
                            } else if (alert.type === 'price_moved_percent') {
                              if (dir === 'up') {
                                label = `Δ > +${alert.percentChange}% (${alert.daysWindow}d)`;
                              } else if (dir === 'down') {
                                label = `Δ < -${alert.percentChange}% (${alert.daysWindow}d)`;
                              } else {
                                label = `|Δ| > ${alert.percentChange}% (${alert.daysWindow}d)`;
                              }
                            }

                            return (
                              <Tooltip key={alert.id} title={getAlertTriggerDescription(alert, currencyCode, curPrice, hist)} arrow>
                                <Chip
                                  label={label}
                                  size="small"
                                  color={alert.isTriggered ? "error" : "default"}
                                  variant={alert.isTriggered ? "filled" : "outlined"}
                                  onDelete={() => handleDeleteAlert(item, alert.id)}
                                  sx={{ 
                                    fontSize: '0.75rem'
                                  }}
                                />
                              </Tooltip>
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
      <Dialog 
        open={openAddAlert} 
        onClose={() => setOpenAddAlert(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
          {t('Add Alert for', 'הוסף התראה עבור')} {activeItem ? getTickerDisplayName(activeItem) : ''}
        </DialogTitle>
        <DialogContent
          sx={{
            py: 1.5,
            px: 3,
            maxHeight: '60vh',
            overflowY: 'auto',
            background: `
              linear-gradient(${theme.palette.background.paper} 30%, rgba(255, 255, 255, 0)),
              linear-gradient(rgba(255, 255, 255, 0), ${theme.palette.background.paper} 70%) 0 100%,
              radial-gradient(farthest-side at 50% 0, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0)),
              radial-gradient(farthest-side at 50% 100%, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0)) 0 100%
            `,
            backgroundRepeat: 'no-repeat',
            backgroundSize: '100% 40px, 100% 40px, 100% 14px, 100% 14px',
            backgroundAttachment: 'local, local, scroll, scroll'
          }}
        >
          <Stack spacing={3} sx={{ mt: 1.5 }}>
            
            {/* Toggle group for Mode */}
            <ToggleButtonGroup
              color="primary"
              value={alertMode}
              exclusive
              onChange={(_, val) => {
                if (val) {
                  setAlertMode(val);
                  if (val === 'price_target') {
                    setDirection('up');
                  } else {
                    setDirection('both');
                  }
                }
              }}
              fullWidth
              size="medium"
            >
              <ToggleButton value="price_target" sx={{ textTransform: 'none', py: 1.25, fontWeight: 600 }}>
                {t('Price Target', 'יעד מחיר')}
              </ToggleButton>
              <ToggleButton value="price_moved_percent" sx={{ textTransform: 'none', py: 1.25, fontWeight: 600 }}>
                {t('Price Movement', 'תנועת מחיר')}
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Explanation box */}
            <Box 
              sx={{ 
                p: 1.5, 
                borderRadius: 2, 
                bgcolor: 'action.hover', 
                borderLeft: `4px solid ${theme.palette.primary.main}` 
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {alertMode === 'price_target' 
                  ? t('Alert when the stock price crosses a specific price target.', 'קבל התראה כאשר מחיר המניה מגיע למחיר יעד מסוים.')
                  : t('Alert when the stock price moves by a percentage over a time window.', 'קבל התראה כאשר מחיר המניה משתנה באחוז מסוים בתוך מספר ימים.')}
              </Typography>
            </Box>

            {/* Render fields according to selected Mode */}
            {alertMode === 'price_target' && (
              <Stack spacing={2.5}>
                
                {/* Selector for Absolute Price vs relative % */}
                <ToggleButtonGroup
                  color="primary"
                  value={priceTargetType}
                  exclusive
                  onChange={(_, val) => {
                    if (val) setPriceTargetType(val);
                  }}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="absolute" sx={{ textTransform: 'none', fontWeight: 500 }}>
                    {t('Fixed Price', 'מחיר קבוע')}
                  </ToggleButton>
                  <ToggleButton value="relative" sx={{ textTransform: 'none', fontWeight: 500 }}>
                    {t('% Change from now', '% שינוי מעכשיו')}
                  </ToggleButton>
                </ToggleButtonGroup>

                {priceTargetType === 'absolute' ? (
                  <TextField
                    fullWidth
                    label={t('Target Price', 'מחיר יעד')}
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                          {activeItem ? (normalizeCurrency(activeItem.currency || 'USD') === Currency.ILS ? '₪' : '$') : ''}
                        </Typography>
                      )
                    }}
                  />
                ) : (
                  <TextField
                    fullWidth
                    label={t('Percent Offset (%)', 'הפרש אחוזים (%)')}
                    type="number"
                    value={percentChange}
                    onChange={(e) => setPercentChange(e.target.value)}
                    variant="outlined"
                    helperText={
                      activeItem && percentChange
                        ? `${t('Current price:', 'מחיר נוכחי:')} ${
                            (engine?.livePrices.get(`${activeItem.exchange}:${activeItem.ticker}`)?.price || 0).toFixed(2)
                          } => ${t('Target price:', 'מחיר יעד:')} ${
                            (
                              (engine?.livePrices.get(`${activeItem.exchange}:${activeItem.ticker}`)?.price || 0) *
                              (1 + (direction === 'up' ? 1 : -1) * (parseFloat(percentChange) || 0) / 100)
                            ).toFixed(2)
                          }`
                        : ''
                    }
                  />
                )}

                {/* Direction Selector */}
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {t('Trigger Condition', 'תנאי הפעלה')}
                  </Typography>
                  <ToggleButtonGroup
                    color="primary"
                    value={direction}
                    exclusive
                    onChange={(_, val) => {
                      if (val) setDirection(val);
                    }}
                    fullWidth
                    size="small"
                  >
                    <ToggleButton value="up" sx={{ textTransform: 'none', display: 'flex', alignItems: 'center' }}>
                      <TrendingUpIcon fontSize="small" sx={{ mr: 0.5, ml: 0.5 }} />
                      {t('Rises Above', 'עולה מעל')}
                    </ToggleButton>
                    <ToggleButton value="down" sx={{ textTransform: 'none', display: 'flex', alignItems: 'center' }}>
                      <TrendingDownIcon fontSize="small" sx={{ mr: 0.5, ml: 0.5 }} />
                      {t('Falls Below', 'יורד מתחת')}
                    </ToggleButton>
                    {priceTargetType === 'absolute' && (
                      <ToggleButton value="both" sx={{ textTransform: 'none', display: 'flex', alignItems: 'center' }}>
                        <SwapVertIcon fontSize="small" sx={{ mr: 0.5, ml: 0.5 }} />
                        {t('Crosses', 'חוצה')}
                      </ToggleButton>
                    )}
                  </ToggleButtonGroup>
                </Stack>
              </Stack>
            )}

            {alertMode === 'price_moved_percent' && (
              <Stack spacing={2.5}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    fullWidth
                    label={t('Percent Move (%)', 'אחוז שינוי (%)')}
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

                {/* Direction ToggleButtonGroup for price_moved_percent */}
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {t('Direction', 'כיוון שינוי')}
                  </Typography>
                  <ToggleButtonGroup
                    color="primary"
                    value={direction}
                    exclusive
                    onChange={(_, val) => {
                      if (val) setDirection(val);
                    }}
                    fullWidth
                    size="small"
                  >
                    <ToggleButton value="up" sx={{ textTransform: 'none', display: 'flex', alignItems: 'center' }}>
                      <TrendingUpIcon fontSize="small" sx={{ mr: 0.5, ml: 0.5 }} />
                      {t('Up', 'למעלה')}
                    </ToggleButton>
                    <ToggleButton value="down" sx={{ textTransform: 'none', display: 'flex', alignItems: 'center' }}>
                      <TrendingDownIcon fontSize="small" sx={{ mr: 0.5, ml: 0.5 }} />
                      {t('Down', 'למטה')}
                    </ToggleButton>
                    <ToggleButton value="both" sx={{ textTransform: 'none', display: 'flex', alignItems: 'center' }}>
                      <SwapVertIcon fontSize="small" sx={{ mr: 0.5, ml: 0.5 }} />
                      {t('Both', 'דו-כיווני')}
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
              </Stack>
            )}

          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenAddAlert(false)} color="inherit" sx={{ fontWeight: 600 }}>
            {t('Cancel', 'ביטול')}
          </Button>
          <Button onClick={handleAddAlertSubmit} color="primary" variant="contained" sx={{ px: 3, fontWeight: 600, borderRadius: 2 }}>
            {t('Save Alert', 'שמור התראה')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
