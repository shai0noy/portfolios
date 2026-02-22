import React, { memo } from 'react';
import { TableCell, TableRow, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { formatPercent as formatPct, formatMoneyValue, formatMoneyPrice, convertCurrency, normalizeCurrency, formatNumber } from '../lib/currencyUtils';
import { getValueColor } from '../lib/utils';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { ExchangeRates } from '../lib/types';
import { useLanguage } from '../lib/i18n';
import { DASHBOARD_COLUMNS } from '../lib/dashboardColumns';

interface DashboardRowProps {
  holding: EnrichedDashboardHolding;
  index: number;
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  columnVisibility: Record<string, boolean>;
  groupByPortfolio: boolean;
}

export const DashboardRow = memo(function DashboardRow({
  holding: h,
  index,
  displayCurrency,
  exchangeRates,
  columnVisibility,
  groupByPortfolio
}: DashboardRowProps) {
  const navigate = useNavigate();
  const { t, tTry } = useLanguage();
  const vals = h.display;

  const handleRowClick = () => {
    navigate(`/ticker/${h.exchange.toUpperCase()}/${h.ticker}`, { state: { holding: h, from: '/dashboard' } });
  };

  const renderCell = (key: string) => {
    switch (key) {
      case 'displayName':
        return <TableCell sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{tTry(h.displayName, h.nameHe)}</TableCell>;
      case 'ticker':
        return <TableCell>{h.ticker}</TableCell>;
      case 'type':
        return <TableCell>{h.type ? t(h.type.nameEn, h.type.nameHe) : '-'}</TableCell>;
      case 'sector':
        return <TableCell>{h.sector}</TableCell>;
      case 'qty':
        return <TableCell align="left">{formatNumber(h.qtyTotal)}</TableCell>;
      case 'avgCost':
        // Display in stock currency (e.g. Agorot for ILA)
        const avgCostSC = convertCurrency(h.display.avgCost, displayCurrency, h.stockCurrency, exchangeRates);
        return <TableCell align="left">{formatMoneyPrice({ amount: avgCostSC, currency: h.stockCurrency }, t)}</TableCell>;
      case 'costBasis':
        return <TableCell align="left">{formatMoneyValue({ amount: vals.costBasis, currency: normalizeCurrency(displayCurrency) }, t)}</TableCell>;
      case 'currentPrice':
        return <TableCell align="left">{formatMoneyPrice({ amount: h.currentPrice, currency: h.stockCurrency }, t)}</TableCell>;
      case 'weight':
        return <TableCell align="left" sx={{ color: 'text.secondary' }}>{formatPct(groupByPortfolio ? vals.weightInPortfolio : vals.weightInGlobal)}</TableCell>;
      case 'dayChangeVal':
        return <TableCell align="left" sx={{ color: getValueColor(vals.dayChangePct) }}>{formatMoneyValue({ amount: vals.dayChangeVal, currency: normalizeCurrency(displayCurrency) }, t)}</TableCell>;
      case 'dayChangePct':
        return <TableCell align="left" sx={{ color: getValueColor(vals.dayChangePct) }}>{formatPct(vals.dayChangePct)}</TableCell>;
      case 'perf1w':
        return <TableCell align="left" sx={{ color: getValueColor(h.perf1w) }}>{formatPct(h.perf1w)}</TableCell>;
      case 'perf1m':
        return <TableCell align="left" sx={{ color: getValueColor(h.perf1m) }}>{formatPct(h.perf1m)}</TableCell>;
      case 'perfYtd':
        return <TableCell align="left" sx={{ color: getValueColor(h.perfYtd) }}>{formatPct(h.perfYtd)}</TableCell>;
      case 'perf1y':
        return <TableCell align="left" sx={{ color: getValueColor(h.perf1y) }}>{formatPct(h.perf1y)}</TableCell>;
      case 'mv':
        return <TableCell align="left">{formatMoneyValue({ amount: vals.marketValue, currency: normalizeCurrency(displayCurrency) }, t)}</TableCell>;
      case 'unvestedValue':
        return <TableCell align="left" sx={{ color: 'text.secondary' }}>{h.display.unvestedValue > 0 ? formatMoneyValue({ amount: h.display.unvestedValue, currency: normalizeCurrency(displayCurrency) }, t) : '-'}</TableCell>;
      case 'dividends':
        return <TableCell align="left" sx={{ color: 'success.main' }}>{vals.dividends > 0 ? formatMoneyValue({ amount: vals.dividends, currency: normalizeCurrency(displayCurrency) }, t) : '-'}</TableCell>;
      case 'dividendYield1y':
        return <TableCell align="left">{vals.dividendYield1y !== undefined ? formatPct(vals.dividendYield1y) : '-'}</TableCell>;
      case 'fees':
        return <TableCell align="left" sx={{ color: 'error.main' }}>{vals.fees > 0 ? formatMoneyValue({ amount: vals.fees, currency: normalizeCurrency(displayCurrency) }, t) : '-'}</TableCell>;
      case 'realizedTax':
        return <TableCell align="left" sx={{ color: 'error.main' }}>{vals.realizedTax > 0 ? formatMoneyValue({ amount: vals.realizedTax, currency: normalizeCurrency(displayCurrency) }, t) : '-'}</TableCell>;
      case 'unrealizedTax':
        return <TableCell align="left" sx={{ color: 'error.main' }}>{vals.unrealizedTax > 0 ? formatMoneyValue({ amount: vals.unrealizedTax, currency: normalizeCurrency(displayCurrency) }, t) : '-'}</TableCell>;
      case 'unrealizedGain':
        return <TableCell align="left"><Typography variant="body2" color={getValueColor(vals.unrealizedGain)}>{formatMoneyValue({ amount: vals.unrealizedGain, currency: normalizeCurrency(displayCurrency) }, t)}</Typography></TableCell>;
      case 'unrealizedGainPct':
        return <TableCell align="left" sx={{ color: getValueColor(vals.unrealizedGainPct) }}>{formatPct(vals.unrealizedGainPct)}</TableCell>;
      case 'realizedGain':
        return <TableCell align="left" sx={{ color: getValueColor(vals.realizedGain) }}>{formatMoneyValue({ amount: vals.realizedGain, currency: normalizeCurrency(displayCurrency) }, t)}</TableCell>;
      case 'realizedGainPct':
        return <TableCell align="left" sx={{ color: getValueColor(vals.realizedGainPct) }}>{formatPct(vals.realizedGainPct)}</TableCell>;
      case 'realizedGainAfterTax':
        return <TableCell align="left">{formatMoneyValue({ amount: vals.realizedGainAfterTax, currency: normalizeCurrency(displayCurrency) }, t)}</TableCell>;
      case 'totalGain':
        return <TableCell align="left" sx={{ fontWeight: 'bold', color: getValueColor(vals.totalGain) }}>{formatMoneyValue({ amount: vals.totalGain, currency: normalizeCurrency(displayCurrency) }, t)}</TableCell>;
      case 'totalGainPct':
        return <TableCell align="left" sx={{ color: getValueColor(vals.totalGainPct) }}>{formatPct(vals.totalGainPct)}</TableCell>;
      case 'valueAfterTax':
        const mv = vals.marketValue;
        const netVal = vals.valueAfterTax;
        const pctOfRow = mv > 0 ? netVal / mv : 0;
        return (
          <TableCell align="left">
            {formatMoneyValue({ amount: netVal, currency: normalizeCurrency(displayCurrency) }, t)}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              ({formatPct(pctOfRow)})
            </Typography>
          </TableCell>
        );
      default:
        return null;
    }
  };

  return (
    <TableRow
      key={h.key || `${h.portfolioId}-${h.ticker}-${index}`}
      hover
      onClick={handleRowClick}
      sx={{ cursor: 'pointer' }}
    >
      {DASHBOARD_COLUMNS.map(col => (
        columnVisibility[col.key] && (
          <React.Fragment key={col.key}>
            {renderCell(col.key)}
          </React.Fragment>
        )
      ))}
    </TableRow>
  );
});
