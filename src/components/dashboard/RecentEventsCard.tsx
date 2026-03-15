import { useMemo } from 'react';
import { Box, Typography, Card, Divider, Chip, useTheme } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import type { DashboardHolding } from '../../lib/types';
import type { Transaction } from '../../lib/types';
import { coerceDate, formatDate } from '../../lib/date';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import { ScrollShadows, useScrollShadows } from '../../lib/ui-utils';

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

    const recentEvents: Array<{
      id: string;
      date: Date;
      type: 'DIVIDEND' | 'VEST';
      ticker: string;
      desc: string;
    }> = [];

    for (const txn of transactions) {
      if (!holdingSymbols.has(txn.ticker.toUpperCase())) continue;

      if (txn.type === 'DIVIDEND') {
        const divDate = coerceDate(txn.date);
        if (divDate && divDate >= twoWeeksAgo && divDate <= twoWeeksFuture) {
          recentEvents.push({
            id: txn.numericId ? String(txn.numericId) : Math.random().toString(),
            date: divDate,
            type: 'DIVIDEND' as const,
            ticker: txn.ticker,
            desc: `${txn.originalQty} ${txn.currency || ''}`, // Assuming amount is in originalQty for div
          });
        }
      } else if (txn.vestDate) {
        const vDate = coerceDate(txn.vestDate);
        if (vDate && vDate >= twoWeeksAgo && vDate <= twoWeeksFuture) {
          recentEvents.push({
            id: txn.numericId ? String(txn.numericId) : Math.random().toString(),
            date: vDate,
            type: 'VEST',
            ticker: txn.ticker,
            desc: `${txn.qty || txn.originalQty} Units`,
          });
        }
      }
    }

    return recentEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [holdings, transactions]);

  if (events.length === 0) return null;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" fontWeight="bold">
          {t('Recent Events', 'אירועים אחרונים')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          ({t('±14 days', '±14 ימים')})
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box ref={containerRef} sx={{ flexGrow: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {events.map(ev => (
            <Box key={ev.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {ev.type === 'DIVIDEND' ? <PriceCheckIcon color="success" /> : <AccountBalanceWalletIcon color="info" />}
                <Box>
                  <Typography variant="body2" fontWeight="bold">{ev.ticker}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {ev.type === 'DIVIDEND' ? (ev.date > new Date() ? t('Upcoming Dividend', 'דיבידנד קרוב') : t('Dividend', 'דיבידנד')) : (ev.date > new Date() ? t('Vesting', 'יבשיל') : t('Vested', 'הבשיל'))} • {formatDate(ev.date)}
                  </Typography>
                </Box>
              </Box>
              <Chip label={ev.desc} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
            </Box>
          ))}
        </Box>
        <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
      </Box>
    </Card>
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
