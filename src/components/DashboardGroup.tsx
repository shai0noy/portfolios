import React, { memo, useMemo, useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Collapse, IconButton, TableSortLabel, Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatPercent as formatPct, formatMoneyValue, normalizeCurrency } from '../lib/currencyUtils';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { TrackingListId, type ExchangeRates } from '../lib/types';
import { useLanguage } from '../lib/i18n';
import { DASHBOARD_COLUMNS } from '../lib/dashboardColumns';
import { DashboardRow } from './DashboardRow';
import { useScrollShadows, ScrollShadows } from '../lib/ui-utils';

interface DashboardGroupProps {
  groupName: string;
  groupHoldings: EnrichedDashboardHolding[];
  groupByPortfolio: boolean;
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  columnVisibility: Record<string, boolean>;
  onSelectPortfolio: (id: string | null) => void;
  onContextMenu: (event: React.MouseEvent, column: string) => void;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  isExpandedInitial?: boolean;
}

export const DashboardGroup = memo(function DashboardGroup(props: DashboardGroupProps) {
  const {
    groupName, groupHoldings, groupByPortfolio, displayCurrency, exchangeRates,
    columnVisibility, onSelectPortfolio, onContextMenu, sortBy, sortDir, onSort,
    isExpandedInitial = true
  } = props;

  const theme = useTheme();
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(isExpandedInitial);
  const { containerRef, showLeft, showRight } = useScrollShadows('horizontal');

  const toggleGroup = () => setIsExpanded(p => !p);

  const groupSummary = useMemo(() => {
    return groupHoldings.reduce((acc, h) => {
      acc.totalMV += h.display.marketValue;
      acc.totalDayChange += h.display.dayChangeVal;
      acc.totalUnrealizedGain += h.display.unrealizedGain;
      return acc;
    }, { totalMV: 0, totalDayChange: 0, totalUnrealizedGain: 0 });
  }, [groupHoldings]);

  const groupDayChangePct = groupSummary.totalMV > 0 ? groupSummary.totalDayChange / (groupSummary.totalMV - groupSummary.totalDayChange) : 0;

  const getSortValue = (h: EnrichedDashboardHolding, key: string) => {
    switch (key) {
      case 'ticker': return h.ticker || '';
      case 'displayName': return h.displayName || '';
      case 'type': return h.type ? t(h.type.nameEn, h.type.nameHe) : '';
      case 'qty': return h.qtyTotal;
      case 'sector': return h.sector || '';
      case 'avgCost': return h.display.avgCost;
      case 'costBasis': return h.display.costBasis;
      case 'currentPrice': return h.display.currentPrice;
      case 'weight': return h.display.weightInPortfolio;
      case 'dayChangePct': return h.display.dayChangePct;
      case 'dayChangeVal': return h.display.dayChangeVal;
      case 'perf1w': return h.tickerChangePct1w;
      case 'perf1m': return h.tickerChangePct1m;
      case 'perfYtd': return h.tickerChangePctYtd;
      case 'perf1y': return h.tickerChangePct1y;
      case 'marketValue': return h.display.marketValue;
      case 'dividends': return h.display.dividends;
      case 'dividendYield1y': return h.display.dividendYield1y || 0;
      case 'fees': return h.display.fees;
      case 'realizedTax': return h.display.realizedTax;
      case 'unrealizedTax': return h.display.unrealizedTax;
      case 'unrealizedGain': return h.display.unrealizedGain;
      case 'realizedGain': return h.display.realizedGain;
      case 'totalGain': return h.display.totalGain;
      case 'valueAfterTax': return h.display.valueAfterTax;
      case 'avgHoldingTimeYears': return h.avgHoldingTimeYears || 0;
      case 'avgYearlyReturn': return h.avgYearlyReturn || -Infinity;
      case 'unvestedValue':
      case 'mvUnvested': return h.display.unvestedValue;
      default: return (h.display as any)[key] || 0;
    }
  };

  const sortedHoldings = useMemo(() => {
    return [...groupHoldings].sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);

      const aIsNull = va === null || va === undefined || (typeof va === 'number' && Number.isNaN(va));
      const bIsNull = vb === null || vb === undefined || (typeof vb === 'number' && Number.isNaN(vb));

      if (aIsNull && bIsNull) return 0;
      if (aIsNull) return 1; // Always push nulls to the bottom
      if (bIsNull) return -1;

      if (va === vb) return 0;
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [groupHoldings, sortBy, sortDir, t]);

  return (
    <Box sx={{ position: 'relative', mb: 4 }}>
      <Paper ref={containerRef} sx={{ overflowX: 'auto' }}>
        {groupByPortfolio && (
          <Box display="flex" alignItems="center" justifyContent="space-between" px={{ xs: 1, sm: 1 }} py={{ xs: 0.75, sm: 1 }} bgcolor={theme.palette.background.default} borderBottom={`1px solid ${theme.palette.divider}`} sx={{ position: 'sticky', top: 0, left: 0, zIndex: 1 }}>
            <Box display="flex" alignItems="center" gap={{ xs: 0.5, sm: 1 }} onClick={() => onSelectPortfolio(groupHoldings[0]?.portfolioId || null)} style={{ cursor: 'pointer' }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleGroup(); }} sx={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms', padding: { xs: '2px', sm: '5px' } }}>
                <ExpandMoreIcon fontSize={theme.breakpoints.values.sm > window.innerWidth ? 'inherit' : 'small'} />
              </IconButton>
              <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600, fontSize: { xs: '0.875rem', sm: '1rem' } }}>{groupName}</Typography>
            </Box>
            <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-end', sm: 'center' }} gap={{ xs: 0.25, sm: 2 }} pr={{ xs: 0.5, sm: 1 }}>
              {groupHoldings[0]?.portfolioId !== TrackingListId.Favorites && (
                <>
                  <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, lineHeight: { xs: 1.35, sm: 1.5 } }}>
                    {t('Total:', 'סה"כ:')} {formatMoneyValue({ amount: groupSummary.totalMV, currency: normalizeCurrency(displayCurrency) }, t)}
                  </Typography>
                  <Typography variant="body2" color={groupSummary.totalDayChange >= 0 ? 'success.main' : 'error.main'} sx={{ display: { xs: 'none', sm: 'block' } }}>
                    {t('Day:', 'יומי:')} {formatMoneyValue({ amount: groupSummary.totalDayChange, currency: normalizeCurrency(displayCurrency) }, t)} ({formatPct(groupDayChangePct)})
                  </Typography>
                  <Typography variant="body2" color={groupSummary.totalUnrealizedGain >= 0 ? 'success.main' : 'error.main'} sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, lineHeight: { xs: 1.35, sm: 1.5 } }}>
                    {t('Unrealized:', 'לא ממומש:')} {formatMoneyValue({ amount: groupSummary.totalUnrealizedGain, currency: normalizeCurrency(displayCurrency) }, t)}
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        )}
        <Collapse in={groupByPortfolio ? isExpanded : true} timeout="auto" unmountOnExit>
          <Table size="small" sx={{ '& .MuiTableCell-root, & .MuiTypography-root, & .MuiTableSortLabel-root': { fontSize: { xs: '0.75rem', sm: '0.875rem' } } }}>
            <TableHead>
              <TableRow>
                {DASHBOARD_COLUMNS.map(col => (
                  columnVisibility[col.key] && (
                    <TableCell key={col.key} onContextMenu={(e) => onContextMenu(e, col.key)} align="left">
                      <TableSortLabel
                        active={sortBy === (col.sortKey || col.key)}
                        direction={sortDir}
                        onClick={() => onSort(col.sortKey || col.key)}
                      >
                        {t(col.labelEn, col.labelHe)}
                      </TableSortLabel>
                    </TableCell>
                  )
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedHoldings.map((h, index) => (
                <DashboardRow
                  key={h.key || `${h.portfolioId}-${h.ticker}-${index}`}
                  holding={h}
                  index={index}
                  displayCurrency={displayCurrency}
                  exchangeRates={exchangeRates}
                  columnVisibility={columnVisibility}
                  groupByPortfolio={groupByPortfolio}
                />
              ))}
            </TableBody>
          </Table>
        </Collapse>
      </Paper>
      <ScrollShadows left={showLeft} right={showRight} theme={theme} />
    </Box>
  );
});
