import { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import type { DashboardHolding } from '../../lib/types';
import type { Transaction } from '../../lib/types';
import { coerceDate, formatDate } from '../../lib/date';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { ScrollShadows, useScrollShadows } from '../../lib/ui-utils';
import { formatMoneyValue } from '../../lib/currency';
import { Currency } from '../../lib/types';
import { Link as RouterLink } from 'react-router-dom';

import type { DividendRecord } from '../../lib/data/model';

interface RecentEventsCardProps {
  holdings: DashboardHolding[];
  transactions: Transaction[];
  dividendRecords?: (DividendRecord & { ticker: string, exchange: string, portfolioId: string })[];
  boiTickerData?: { ticker: string, exchange: string, historical: { date: Date, price: number }[] };
}

export function getRecentEventsData(
  holdings: DashboardHolding[],
  transactions: Transaction[],
  dividendRecords: (DividendRecord & { ticker: string, exchange: string, portfolioId: string })[] = [],
  t: (key: string, backup: string) => string,
  boiTickerData?: { ticker: string, exchange: string, historical: { date: Date, price: number }[] }
) {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setDate(today.getDate() - 30);
  const oneMonthFuture = new Date();
  oneMonthFuture.setDate(today.getDate() + 30);

  const holdingSymbols = new Set(holdings.map(h => h.ticker.toUpperCase()));

  const grouped = new Map<string, {
    id: string;
    date: Date;
    type: 'DIVIDEND' | 'VEST' | 'CAL_DIVIDEND' | 'CAL_EARNINGS' | 'BOI_RATE_CHANGE';
    ticker: string;
    exchange: string;
    qtySum?: number;
    count?: number;
    currency?: Currency;
    price?: number;
    customValueDesc?: string;
    baseValueDesc?: string;
    expectedDivTotal?: number;
    stockCurrency?: Currency;
    dividendAmount?: number;
    dividendCurrency?: Currency;
  }>();

  const formatRelativeDays = (date: Date) => {
    const diffMs = date.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t('Today', 'היום');
    if (diffDays === -1) return t('Yesterday', 'אתמול');
    if (diffDays === 1) return t('Tomorrow', 'מחר');
    if (diffDays > 0) return t(`In ${diffDays} days`, `בעוד ${diffDays} ימים`);
    return t(`${Math.abs(diffDays)} days ago`, `לפני ${Math.abs(diffDays)} ימים`);
  };

  const realDivDatesByTicker = new Map<string, Set<string>>();

  for (const txn of transactions) {
    if (!holdingSymbols.has(txn.ticker.toUpperCase())) continue;
    const holding = holdings.find(h => h.ticker.toUpperCase() === txn.ticker.toUpperCase());
    if (!holding) continue;

    if (txn.vestDate) {
      const vDate = coerceDate(txn.vestDate);
      if (vDate && vDate >= oneMonthAgo && vDate <= oneMonthFuture) {
        const qty = txn.qty || txn.originalQty || 0;
        const dateStr = formatDate(vDate);
        const key = `${dateStr}_${txn.ticker}_VEST`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: txn.numericId ? String(txn.numericId) : Math.random().toString(),
            date: vDate,
            type: 'VEST',
            ticker: txn.ticker,
            exchange: holding.exchange,
            qtySum: qty,
            count: 1,
            currency: (holding.stockCurrency || txn.currency || 'USD') as Currency,
            price: holding.currentPrice
          });
        } else {
          const existing = grouped.get(key)!;
          existing.qtySum = (existing.qtySum || 0) + qty;
          existing.count = (existing.count || 0) + 1;
        }
      }
    }
  }

  for (const div of dividendRecords) {
    if (!holdingSymbols.has(div.ticker.toUpperCase())) continue;
    const holding = holdings.find(h => h.ticker.toUpperCase() === div.ticker.toUpperCase());
    if (!holding) continue;

    const divDate = coerceDate(div.date);
    if (divDate && divDate >= oneMonthAgo && divDate <= oneMonthFuture) {
      const dtStr = formatDate(divDate);
      if (!realDivDatesByTicker.has(div.ticker)) realDivDatesByTicker.set(div.ticker, new Set());
      realDivDatesByTicker.get(div.ticker)!.add(dtStr);

      const key = `${dtStr}_${div.ticker}_DIVIDEND`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `div_${div.ticker}_${dtStr}`,
          date: divDate,
          type: 'DIVIDEND',
          ticker: div.ticker,
          exchange: div.exchange,
          qtySum: div.unitsHeld,
          dividendAmount: div.pricePerUnit || div.grossAmount.amount,
          count: 1,
          currency: div.grossAmount.currency,
          price: holding.currentPrice
        });
      } else {
        const existing = grouped.get(key)!;
        existing.qtySum = (existing.qtySum || 0) + (div.unitsHeld || 0);
        existing.count = (existing.count || 0) + 1;
      }
    }
  }

  // Process calendarEvents for Calendar Dividends & Earnings
  for (const h of holdings) {
    const cal = h.calendarEvents;
    if (!cal) continue;

    const exDate = cal.exDividendDate ? coerceDate(cal.exDividendDate) : null;
    const payDate = cal.dividendDate ? coerceDate(cal.dividendDate) : null;

    let closestDivDate: Date | null = null;
    if (exDate && payDate) {
      closestDivDate = Math.abs(exDate.getTime() - today.getTime()) < Math.abs(payDate.getTime() - today.getTime()) ? exDate : payDate;
    } else {
      closestDivDate = exDate || payDate;
    }

    let realDivKey: string | null = null;
    if (payDate) {
      const payStr = formatDate(payDate);
      if (realDivDatesByTicker.get(h.ticker)?.has(payStr)) {
        realDivKey = `${payStr}_${h.ticker}_DIVIDEND`;
      }
    }

    if (realDivKey && grouped.has(realDivKey)) {
      const group = grouped.get(realDivKey)!;
      if (exDate && payDate) {
        group.baseValueDesc = `${t('Ex', 'אקס')}: ${formatDate(exDate)} | ${t('Pay', 'תשלום')}: ${formatDate(payDate)}`;
      } else if (exDate) {
        group.baseValueDesc = `${t('Ex', 'אקס')}: ${formatDate(exDate)}`;
      } else if (payDate) {
        group.baseValueDesc = `${t('Pay', 'תשלום')}: ${formatDate(payDate)}`;
      }

      if (cal.dividendAmount) {
        group.dividendAmount = cal.dividendAmount;
        group.dividendCurrency = cal.dividendCurrency;
        const curr = group.dividendCurrency || group.currency || h.stockCurrency!;
        const psStr = `${formatMoneyValue({ amount: group.dividendAmount, currency: curr })} ${t('PS', 'למניה')}`;
        const actualTotal = group.qtySum ? ` • ${formatMoneyValue({ amount: group.qtySum, currency: curr }, undefined, 0)} ${t('Total', 'סה״כ')}` : '';
        group.customValueDesc = `${group.baseValueDesc || ''} | ${psStr}${actualTotal}`;
      }
    } else if (closestDivDate && closestDivDate >= oneMonthAgo && closestDivDate <= oneMonthFuture) {
      const key = `CAL_DIV_${h.ticker}_${closestDivDate.getTime()}`;
      if (!grouped.has(key)) {
        let valueDesc = '';
        if (exDate && payDate) {
          valueDesc = `${t('Ex', 'אקס')}: ${formatDate(exDate)} | ${t('Pay', 'תשלום')}: ${formatDate(payDate)}`;
        } else if (exDate) {
          valueDesc = `${t('Ex', 'אקס')}: ${formatDate(exDate)}`;
        } else if (payDate) {
          valueDesc = `${t('Pay', 'תשלום')}: ${formatDate(payDate)}`;
        }

        grouped.set(key, {
          id: `cal_div_${h.ticker}`,
          date: closestDivDate,
          type: 'CAL_DIVIDEND',
          ticker: h.ticker,
          exchange: h.exchange,
          baseValueDesc: valueDesc,
          expectedDivTotal: 0,
          stockCurrency: h.stockCurrency,
          customValueDesc: valueDesc
        });
      }

      const group = grouped.get(key)!;
      if (cal.dividendAmount) {
        group.dividendAmount = cal.dividendAmount;
        group.dividendCurrency = cal.dividendCurrency;
        if (h.qtyTotal > 0) {
          group.expectedDivTotal = (group.expectedDivTotal || 0) + (cal.dividendAmount * h.qtyTotal);
        }

        const curr = group.dividendCurrency || group.stockCurrency!;
        const psStr = `${formatMoneyValue({ amount: group.dividendAmount, currency: curr })} ${t('PS', 'למניה')}`;
        const expectedPart = group.expectedDivTotal ? ` • ${formatMoneyValue({ amount: group.expectedDivTotal, currency: curr }, undefined, 0)} ${t('Total', 'סה״כ')}` : '';

        group.customValueDesc = `${group.baseValueDesc} | ${psStr}${expectedPart}`;
      }
    }

    const earnDate = cal.earningsDate ? coerceDate(cal.earningsDate) : null;
    if (earnDate && earnDate >= oneMonthAgo && earnDate <= oneMonthFuture) {
      const key = `CAL_EARN_${h.ticker}_${earnDate.getTime()}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `cal_earn_${h.ticker}`,
          date: earnDate,
          type: 'CAL_EARNINGS',
          ticker: h.ticker,
          exchange: h.exchange,
          customValueDesc: (cal.isEarningsDateEstimate ? t('Estimated ', 'צפוי ') : '') + formatDate(earnDate)
        });
      }
    }
  }

  // Process BOI Rate Changes
  if (boiTickerData && boiTickerData.historical && boiTickerData.historical.length > 1) {
    const hist = boiTickerData.historical.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (let i = 1; i < hist.length; i++) {
      const current = hist[i];
      const prev = hist[i - 1];
      if (Math.abs(current.price - prev.price) > 0.0001) {
        if (current.date >= oneMonthAgo && current.date <= oneMonthFuture) {
          const dtStr = formatDate(current.date);
          const key = `${dtStr}_BOI_RATE_CHANGE`;
          const diff = current.price - prev.price;
          const diffStr = diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
          grouped.set(key, {
            id: `boi_rate_${dtStr}`,
            date: current.date,
            type: 'BOI_RATE_CHANGE',
            ticker: 'BOI',
            exchange: 'BOI',
            customValueDesc: `${current.price}% (${t(diff > 0 ? 'up ' : 'down ', diff > 0 ? 'up ' : 'down ')}${diffStr})`
          });
        }
      }
    }
  }

  const recentEvents = Array.from(grouped.values()).map(g => {
    const isFuture = g.date > new Date();
    let titleStr = '';
    if (g.type === 'DIVIDEND' || g.type === 'CAL_DIVIDEND') {
      titleStr = isFuture ? t('Upcoming Dividend', 'דיבידנד קרוב') : t('Dividend', 'דיבידנד');
    } else if (g.type === 'CAL_EARNINGS') {
      titleStr = isFuture ? t('Upcoming Earnings', 'דוחות קרובים') : t('Earnings', 'דוחות');
    } else if (g.type === 'BOI_RATE_CHANGE') {
      titleStr = t('BOI Rate Change', 'שינוי ריבית בנק ישראל');
    } else {
      titleStr = isFuture ? t('Vesting', 'יבשיל') : t('Vested', 'הבשיל');
    }

    const countStr = g.count && g.count > 1 ? ` (${g.count} ${t('events', 'אירועים')})` : '';

    let valueDesc = g.customValueDesc || '';
    if (!g.customValueDesc) {
      if (g.type === 'DIVIDEND' && g.qtySum !== undefined && g.currency) {
        valueDesc = formatMoneyValue({ amount: g.qtySum, currency: g.currency }, undefined, 0);
      } else if (g.type === 'VEST' && g.qtySum !== undefined && g.price !== undefined && g.currency) {
        const totalValue = g.qtySum * g.price;
        const units = g.qtySum > 0 && g.qtySum % 1 !== 0 ? g.qtySum.toFixed(1) : g.qtySum.toFixed(0);
        valueDesc = `${units} ${t('units', 'יח׳')} - ${formatMoneyValue({ amount: totalValue, currency: g.currency }, undefined, 0)}`;
      }
    }

    const diffMs = g.date.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const isNamedDay = diffDays === 0 || diffDays === 1; // Today, Tomorrow

    const desc = formatRelativeDays(g.date);
    const isHighlighted = diffDays >= -1 && diffDays <= 3;

    return {
      ...g,
      desc,
      titleStr: `${titleStr}${countStr}`,
      valueDesc,
      dateDisplay: isNamedDay ? desc : `${formatDate(g.date)} • ${desc}`,
      isHighlighted
    };
  });

  return recentEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function RecentEventsCard({ holdings, transactions, dividendRecords = [], boiTickerData }: RecentEventsCardProps) {
  const { t } = useLanguage();
  const scrollProps = useScrollShadows();
  const theme = useTheme();
  const { containerRef, showTop, showBottom } = scrollProps;

  const events = useMemo(() => {
    return getRecentEventsData(holdings, transactions, dividendRecords, t, boiTickerData);
  }, [holdings, transactions, dividendRecords, t, boiTickerData]);

  if (events.length === 0) return null;

  const todayStartOfDay = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const upcomingEvents = events.filter(e => e.date.getTime() >= todayStartOfDay);
  const pastEvents = events.filter(e => e.date.getTime() < todayStartOfDay).reverse();

  const renderEvent = (ev: typeof events[0]) => {
    let Icon = LockOpenIcon;
    let iconColor = 'text.secondary';
    if (ev.type === 'DIVIDEND' || ev.type === 'CAL_DIVIDEND') {
      Icon = PaidOutlinedIcon;
    } else if (ev.type === 'CAL_EARNINGS') {
      Icon = AssessmentOutlinedIcon;
    } else if (ev.type === 'BOI_RATE_CHANGE') {
      Icon = AccountBalanceOutlinedIcon;
    } else {
      Icon = LockOpenIcon;
    }

    return (
      <Box
        key={ev.id}
        component={ev.type === 'BOI_RATE_CHANGE' ? 'div' : RouterLink}
        to={ev.type === 'BOI_RATE_CHANGE' ? undefined : `/ticker/${ev.exchange}/${ev.ticker}`}
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
          gap: { xs: 0.5, sm: 2 },
          borderRadius: 2,
          bgcolor: 'action.hover',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'background-color 0.2s',
          '&:hover': { bgcolor: 'action.selected' }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Icon sx={{ color: iconColor, fontSize: '1.4rem' }} />
          <Box>
            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.85rem' }}>
              {(() => {
                const h = holdings.find(x => x.ticker === ev.ticker && x.exchange === ev.exchange);
                if (h) return h.displayName || h.longName || h.nameHe || h.ticker;
                if (ev.ticker === 'BOI') return t('Bank of Israel', 'בנק ישראל');
                return ev.ticker;
              })()}
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.75rem', display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Box component="span" sx={{ color: 'text.secondary' }}>{ev.titleStr} •</Box>
              <Box component="span" sx={{
                color: ev.isHighlighted ? 'text.primary' : 'text.secondary',
                fontWeight: ev.isHighlighted ? 'bold' : 'normal'
              }}>
                {ev.dateDisplay}
              </Box>
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.8rem', opacity: 0.9, alignSelf: { xs: 'flex-end', sm: 'auto' } }}>
          {ev.valueDesc}
        </Typography>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 0.5 }}>
      <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 0, maxHeight: 300, display: 'flex', flexDirection: 'column' }}>
        <Box ref={containerRef} sx={{ flexGrow: 1, overflowY: 'auto', px: 0.5, pb: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {upcomingEvents.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="h6" component="div" sx={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                {t('Upcoming Events', 'אירועים קרובים')}
              </Typography>
              {upcomingEvents.map(renderEvent)}
            </Box>
          )}
          {pastEvents.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: upcomingEvents.length > 0 ? 1 : 0 }}>
              <Typography variant="h6" component="div" sx={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                {t('Recent Events', 'אירועים אחרונים')}
              </Typography>
              {pastEvents.map(renderEvent)}
            </Box>
          )}
        </Box>
        <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
      </Box>
    </Box>
  );
}
export function hasRecentEvents(
  holdings: DashboardHolding[],
  favoriteHoldings: DashboardHolding[],
  transactions: Transaction[],
  dividendRecords: (DividendRecord & { ticker: string, exchange: string, portfolioId: string })[] = [],
  boiTickerData?: { ticker: string, exchange: string, historical: { date: Date, price: number }[] }
) {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setDate(today.getDate() - 30);
  const oneMonthFuture = new Date();
  oneMonthFuture.setDate(today.getDate() + 30);

  if (boiTickerData && boiTickerData.historical) {
    for (let i = 1; i < boiTickerData.historical.length; i++) {
      const current = boiTickerData.historical[i];
      const prev = boiTickerData.historical[i - 1];
      if (Math.abs(current.price - prev.price) > 0.0001) {
        if (current.date >= oneMonthAgo && current.date <= oneMonthFuture) return true;
      }
    }
  }

  const allHoldings = [...holdings, ...favoriteHoldings];
  const holdingSymbols = new Set(allHoldings.map(h => h.ticker.toUpperCase()));

  for (const div of dividendRecords) {
    if (!holdingSymbols.has(div.ticker.toUpperCase())) continue;
    const divDate = coerceDate(div.date);
    if (divDate && divDate >= oneMonthAgo && divDate <= oneMonthFuture) return true;
  }

  for (const txn of transactions) {
    if (!holdingSymbols.has(txn.ticker.toUpperCase())) continue;

    if (txn.vestDate) {
      const vDate = coerceDate(txn.vestDate);
      if (vDate && vDate >= oneMonthAgo && vDate <= oneMonthFuture) {
        return true;
      }
    }
  }

  for (const h of allHoldings) {
    const cal = h.calendarEvents;
    if (cal) {
      if (cal.exDividendDate) {
        const d = coerceDate(cal.exDividendDate);
        if (d && d >= oneMonthAgo && d <= oneMonthFuture) return true;
      }
      if (cal.dividendDate) {
        const d = coerceDate(cal.dividendDate);
        if (d && d >= oneMonthAgo && d <= oneMonthFuture) return true;
      }
      if (cal.earningsDate) {
        const d = coerceDate(cal.earningsDate);
        if (d && d >= oneMonthAgo && d <= oneMonthFuture) return true;
      }
    }
  }
  return false;
}
