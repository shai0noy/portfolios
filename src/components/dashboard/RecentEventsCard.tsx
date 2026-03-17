import { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import type { DashboardHolding } from '../../lib/types';
import type { Transaction } from '../../lib/types';
import { coerceDate, formatDate } from '../../lib/date';
import SavingsIcon from '@mui/icons-material/Savings';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { ScrollShadows, useScrollShadows } from '../../lib/ui-utils';
import { formatMoneyValue } from '../../lib/currency';
import { Currency } from '../../lib/types';
import { Link as RouterLink } from 'react-router-dom';

interface RecentEventsCardProps {
  holdings: DashboardHolding[];
  transactions: Transaction[];
}

export function RecentEventsCard({ holdings, transactions }: RecentEventsCardProps) {
  const { t } = useLanguage();
  const scrollProps = useScrollShadows();
  const theme = useTheme();
  const { containerRef, showTop, showBottom } = scrollProps;

  const events = useMemo(() => {
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    const twoWeeksFuture = new Date();
    twoWeeksFuture.setDate(today.getDate() + 14);

    const holdingSymbols = new Set(holdings.map(h => h.ticker.toUpperCase()));

    const grouped = new Map<string, {
      id: string;
      date: Date;
      type: 'DIVIDEND' | 'VEST';
      ticker: string;
      exchange: string;
      qtySum: number;
      count: number;
      currency: Currency;
      price: number;
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

    for (const txn of transactions) {
      if (!holdingSymbols.has(txn.ticker.toUpperCase())) continue;
      const holding = holdings.find(h => h.ticker.toUpperCase() === txn.ticker.toUpperCase());
      if (!holding) continue;

      if (txn.type === 'DIVIDEND') {
        const divDate = coerceDate(txn.date);
        if (divDate && divDate >= twoWeeksAgo && divDate <= twoWeeksFuture) {
          const dateStr = formatDate(divDate);
          const key = `${dateStr}_${txn.ticker}_DIVIDEND`;
          const qty = txn.originalQty || 0;
          if (!grouped.has(key)) {
            grouped.set(key, {
              id: txn.numericId ? String(txn.numericId) : Math.random().toString(),
              date: divDate,
              type: 'DIVIDEND',
              ticker: txn.ticker,
              exchange: holding.exchange,
              qtySum: qty,
              count: 1,
              currency: (txn.currency || 'USD') as Currency,
              price: holding.currentPrice
            });
          } else {
            const existing = grouped.get(key)!;
            existing.qtySum += qty;
            existing.count++;
          }
        }
      } else if (txn.vestDate) {
        const vDate = coerceDate(txn.vestDate);
        if (vDate && vDate >= twoWeeksAgo && vDate <= twoWeeksFuture) {
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
            existing.qtySum += qty;
            existing.count++;
          }
        }
      }
    }

    const recentEvents = Array.from(grouped.values()).map(g => {
      const isFuture = g.date > new Date();
      const titleStr = g.type === 'DIVIDEND'
        ? (isFuture ? t('Upcoming Dividend', 'דיבידנד קרוב') : t('Dividend', 'דיבידנד'))
        : (isFuture ? t('Vesting', 'יבשיל') : t('Vested', 'הבשיל'));

      const countStr = g.count > 1 ? ` (${g.count} ${t('events', 'אירועים')})` : '';

      let valueDesc = '';
      if (g.type === 'DIVIDEND') {
        valueDesc = formatMoneyValue({ amount: g.qtySum, currency: g.currency }, undefined, 0);
      } else {
        const totalValue = g.qtySum * g.price;
        const units = g.qtySum > 0 && g.qtySum % 1 !== 0 ? g.qtySum.toFixed(1) : g.qtySum.toFixed(0);
        valueDesc = `${units} ${t('units', 'יח׳')} - ${formatMoneyValue({ amount: totalValue, currency: g.currency }, undefined, 0)}`;
      }

      return {
        ...g,
        desc: formatRelativeDays(g.date),
        titleStr: `${titleStr}${countStr}`,
        valueDesc
      };
    });

    return recentEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [holdings, transactions, t]);

  if (events.length === 0) return null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, px: 0.5 }}>
        <Typography variant="h6" component="div" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
          {t('Recent Events', 'אירועים אחרונים')}
        </Typography>
      </Box>
      <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box ref={containerRef} sx={{ flexGrow: 1, overflowY: 'auto', px: 0.5, pb: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {events.map(ev => {
            const isFuture = ev.date > new Date();
            const Icon = ev.type === 'DIVIDEND' ? SavingsIcon : (isFuture ? HourglassBottomIcon : LockOpenIcon);
            const iconColor = ev.type === 'DIVIDEND' ? 'success.main' : 'primary.main';

            return (
              <Box
                key={ev.id}
                component={RouterLink}
                to={`/ticker/${ev.exchange}/${ev.ticker}`}
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  justifyContent: 'space-between',
                  p: 1.5,
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
                    <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.85rem' }}>{ev.ticker}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {ev.titleStr} • {formatDate(ev.date)} • {ev.desc}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.8rem', opacity: 0.9, alignSelf: { xs: 'flex-end', sm: 'auto' } }}>
                  {ev.valueDesc}
                </Typography>
              </Box>
            );
          })}
        </Box>
        <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
      </Box>
    </Box>
  );
}
export function hasRecentEvents(holdings: DashboardHolding[], favoriteHoldings: DashboardHolding[], transactions: Transaction[]) {
  const today = new Date();
  const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    const twoWeeksFuture = new Date();
    twoWeeksFuture.setDate(today.getDate() + 14);

  const allHoldings = [...holdings, ...favoriteHoldings];
  const holdingSymbols = new Set(allHoldings.map(h => h.ticker.toUpperCase()));

  for (const txn of transactions) {
    if (!holdingSymbols.has(txn.ticker.toUpperCase())) continue;

    if (txn.type === 'DIVIDEND') {
      const divDate = coerceDate(txn.date);
      if (divDate && divDate >= twoWeeksAgo && divDate <= twoWeeksFuture) {
        return true;
      }
    } else if (txn.vestDate) {
      const vDate = coerceDate(txn.vestDate);
      if (vDate && vDate >= twoWeeksAgo && vDate <= twoWeeksFuture) {
        return true;
      }
    }
  }
  return false;
}
