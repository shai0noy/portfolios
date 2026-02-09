import React, { memo } from 'react';
import { Box, Typography, IconButton, TableRow, TableCell } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatPercent as formatPct, formatMoneyValue, normalizeCurrency } from '../lib/currencyUtils';
import { useLanguage } from '../lib/i18n';
import { DASHBOARD_COLUMNS } from '../lib/dashboardColumns';

interface DashboardGroupHeaderProps {
  groupName: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectPortfolio: (id: string | null) => void;
  portfolioId: string | null;
  displayCurrency: string;
  summary: {
    totalMV: number;
    totalDayChange: number;
    totalUnrealizedGain: number;
  };
  colSpan: number;
}

export const DashboardGroupHeader = memo(function DashboardGroupHeader(props: DashboardGroupHeaderProps) {
  const {
    groupName, isExpanded, onToggle, onSelectPortfolio, portfolioId,
    displayCurrency, summary, colSpan
  } = props;

  const theme = useTheme();
  const { t } = useLanguage();

  const groupDayChangePct = summary.totalMV > 0 ? summary.totalDayChange / (summary.totalMV - summary.totalDayChange) : 0;

  return (
    <TableRow sx={{ bgcolor: theme.palette.background.default }}>
      <TableCell colSpan={colSpan} sx={{ p: 0, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" p={1}>
          <Box display="flex" alignItems="center" gap={1} onClick={() => onSelectPortfolio(portfolioId)} style={{ cursor: 'pointer' }}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onToggle(); }} sx={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600 }}>{groupName}</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap" pr={1}>
            <Typography variant="body2">
              {t('Total:', 'סה"כ:')} {formatMoneyValue({ amount: summary.totalMV, currency: normalizeCurrency(displayCurrency) }, t)}
            </Typography>
            <Typography variant="body2" color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}>
              {t('Day:', 'יומי:')} {formatMoneyValue({ amount: summary.totalDayChange, currency: normalizeCurrency(displayCurrency) }, t)} ({formatPct(groupDayChangePct)})
            </Typography>
            <Typography variant="body2" color={summary.totalUnrealizedGain >= 0 ? 'success.main' : 'error.main'}>
              {t('Unrealized:', 'לא ממומש:')} {formatMoneyValue({ amount: summary.totalUnrealizedGain, currency: normalizeCurrency(displayCurrency) }, t)}
            </Typography>
          </Box>
        </Box>
      </TableCell>
    </TableRow>
  );
});
