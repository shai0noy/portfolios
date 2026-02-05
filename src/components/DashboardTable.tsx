import { useState, useEffect } from 'react';
import { 
  Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, 
  Collapse, IconButton, TableSortLabel, Typography, Menu, MenuItem, Alert 
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; 
import { formatNumber, formatValue, convertCurrency, formatPrice } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import type { ExchangeRates } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { useLanguage } from '../lib/i18n';

interface TableProps {
  holdings: EnrichedDashboardHolding[];
  groupedData: Record<string, EnrichedDashboardHolding[]>;
  groupByPortfolio: boolean;
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  onSelectPortfolio: (id: string | null) => void;
  columnVisibility: Record<string, boolean>;
  onHideColumn: (column: string) => void;
}

export function DashboardTable(props: TableProps) {
    const { groupedData, groupByPortfolio, displayCurrency, exchangeRates, onSelectPortfolio, columnVisibility, onHideColumn } = props;
    const theme = useTheme();
    const navigate = useNavigate();
    const { t, tTry, isRtl } = useLanguage();
    
    const [sortBy, setSortBy] = useState<string>('totalMV');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; column: string; } | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    if (exchangeRates && exchangeRates.current) {
        const missing = [];
        if (!exchangeRates.current.ILS) missing.push('ILS');
        if (!exchangeRates.current.EUR) missing.push('EUR');
        if (missing.length > 0) {
            setRateError(t(`Missing exchange rates for: ${missing.join(', ')}. Values may be 0. Check 'Currency_Conversions' sheet.`, `לא נמצאו שערי המרה עבור: ${missing.join(', ')}. ייתכן שערכים מסוימים יוצגו כ-0. יש לבדוק את גיליון 'Currency_Conversions'.`));
        } else {
            setRateError(null);
        }
    }
  }, [exchangeRates, t]);

  logIfFalsy(exchangeRates, "DashboardTable: exchangeRates missing");

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));
  };

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const handleContextMenu = (event: React.MouseEvent, column: string) => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4, column });
  };

  const handleCloseContextMenu = () => setContextMenu(null);

  const handleHideColumn = () => {
    if (contextMenu) onHideColumn(contextMenu.column);
    handleCloseContextMenu();
  };

  // Converts a value from a base currency to the display currency, handling sub-units only if explicitly needed for display
  // For standard monetary values (MV, Gains), we expect inputs in standard units (e.g. ILS, not Agorot)
  const formatConverted = (n: number, fromCurrency: string, decimals = 0) => {
    const safeFrom = (fromCurrency === '#N/A' || !fromCurrency) ? 'ILS' : fromCurrency;
    const converted = convertCurrency(n, safeFrom, displayCurrency, exchangeRates);
    return formatValue(converted, displayCurrency, decimals);
  };

  const formatPct = (n: number) => {
    if (n === undefined || n === null || isNaN(n)) return '-';
    const val = (n * 100).toFixed(2);
    return (isRtl && n < 0 ? '\u200E' : '') + val + '%';
  };

  const getSortValue = (h: EnrichedDashboardHolding, key: string) => {
    switch (key) {
      case 'ticker': return h.ticker || '';
      case 'type': return h.type ? t(h.type.nameEn, h.type.nameHe) : '';
      case 'qty': return h.totalQty;
      case 'avgCost': return h.display.avgCost;
      case 'costBasis': return h.display.costBasis;
      case 'currentPrice': return h.display.currentPrice;
      case 'weight': return h.display.weightInPortfolio;
      case 'dayChangePct': return h.display.dayChangePct;
      case 'dayChangeVal': return h.display.dayChangeVal;
      case 'marketValue': return h.display.marketValue;
      case 'unrealized': return h.display.unrealizedGain;
      case 'realizedGain': return h.display.realizedGain;
      case 'totalGain': return h.display.totalGain;
      case 'valueAfterTax': return h.display.valueAfterTax;
      default: return 0;
    }
  };

  const renderGroup = ([groupName, groupHoldings]: [string, EnrichedDashboardHolding[]]) => {
    const isExpanded = expandedGroups[groupName] ?? true;

    const groupSummary = groupHoldings.reduce((acc, h) => {
      acc.totalMV += h.display.marketValue;
      acc.totalDayChange += h.display.dayChangeVal;
      acc.totalUnrealizedGain += h.display.unrealizedGain;
      return acc;
    }, { totalMV: 0, totalDayChange: 0, totalUnrealizedGain: 0 });

    const groupDayChangePct = groupSummary.totalMV > 0 ? groupSummary.totalDayChange / (groupSummary.totalMV - groupSummary.totalDayChange) : 0;

    const sortedHoldings = [...groupHoldings].sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);
      if (va === vb) return 0;
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return (
      <Box key={groupName} component={Paper} sx={{ mb: 4, overflowX: 'auto' }}>
        {groupByPortfolio && (
          <Box display="flex" alignItems="center" justifyContent="space-between" p={1} bgcolor={theme.palette.background.default} borderBottom={`1px solid ${theme.palette.divider}`} sx={{ position: 'sticky', top: 0, left: 0, zIndex: 1 }}>
            <Box display="flex" alignItems="center" gap={1} onClick={() => onSelectPortfolio(groupHoldings[0]?.portfolioId || null)} style={{ cursor: 'pointer' }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleGroup(groupName); }} sx={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
                <ExpandMoreIcon fontSize="small" />
              </IconButton>
              <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600 }}>{groupName}</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap" pr={1}>
              <Typography variant="body2">
                {t('Total:', 'סה"כ:')} {formatValue(groupSummary.totalMV, displayCurrency, 0, t)}
              </Typography>
              <Typography variant="body2" color={groupSummary.totalDayChange >= 0 ? 'success.main' : 'error.main'}>
                {t('Day:', 'יומי:')} {formatValue(groupSummary.totalDayChange, displayCurrency, 0, t)} ({formatPct(groupDayChangePct)})
              </Typography>
              <Typography variant="body2" color={groupSummary.totalUnrealizedGain >= 0 ? 'success.main' : 'error.main'}>
                {t('Unrealized:', 'לא ממומש:')} {formatValue(groupSummary.totalUnrealizedGain, displayCurrency, 0, t)}
              </Typography>
            </Box>
          </Box>
        )}
        <Collapse in={groupByPortfolio ? isExpanded : true} timeout="auto" unmountOnExit>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: theme.palette.background.paper }}>
                {columnVisibility.displayName ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'displayName')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>{t('Display Name', 'שם תצוגה')}</TableSortLabel></TableCell> : null}
                {columnVisibility.ticker ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'ticker')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>{t('Ticker', 'סימול')}</TableSortLabel></TableCell> : null}
                {columnVisibility.type ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'type')}><TableSortLabel active={sortBy === 'type'} direction={sortDir} onClick={() => handleSort('type')}>{t('Type', 'סוג')}</TableSortLabel></TableCell> : null}
                {columnVisibility.sector ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'sector')}><TableSortLabel active={sortBy === 'sector'} direction={sortDir} onClick={() => handleSort('sector')}>{t('Sector', 'סקטור')}</TableSortLabel></TableCell> : null}
                {columnVisibility.qty ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'qty')} align="right"><TableSortLabel active={sortBy === 'qty'} direction={sortDir} onClick={() => handleSort('qty')}>{t('Quantity', 'כמות')}</TableSortLabel></TableCell> : null}
                {columnVisibility.avgCost ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'avgCost')} align="right"><TableSortLabel active={sortBy === 'avgCost'} direction={sortDir} onClick={() => handleSort('avgCost')}>{t('Avg Cost', 'עלות ממוצעת')}</TableSortLabel></TableCell> : null}
                {columnVisibility.costBasis ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'costBasis')} align="right"><TableSortLabel active={sortBy === 'costBasis'} direction={sortDir} onClick={() => handleSort('costBasis')}>{t('Cost Basis', 'עלות מקורית')}</TableSortLabel></TableCell> : null}
                {columnVisibility.currentPrice ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'currentPrice')} align="right"><TableSortLabel active={sortBy === 'currentPrice'} direction={sortDir} onClick={() => handleSort('currentPrice')}>{t('Current Price', 'מחיר נוכחי')}</TableSortLabel></TableCell> : null}
                {columnVisibility.weight ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'weight')} align="right"><TableSortLabel active={sortBy === 'weight'} direction={sortDir} onClick={() => handleSort('weight')}>{t('Weight', 'משקל')}</TableSortLabel></TableCell> : null}
                
                {/* Split Day Change Columns */}
                {columnVisibility.dayChangeVal ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'dayChangeVal')} align="right"><TableSortLabel active={sortBy === 'dayChangeVal'} direction={sortDir} onClick={() => handleSort('dayChangeVal')}>{t('Day Change $', 'שינוי יומי')}</TableSortLabel></TableCell> : null}
                {columnVisibility.dayChangePct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'dayChangePct')} align="right"><TableSortLabel active={sortBy === 'dayChangePct'} direction={sortDir} onClick={() => handleSort('dayChangePct')}>{t('Day Change %', '% שינוי יומי')}</TableSortLabel></TableCell> : null}

                {columnVisibility.mv ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'mv')} align="right"><TableSortLabel active={sortBy === 'marketValue'} direction={sortDir} onClick={() => handleSort('marketValue')}>{t('Market Value', 'שווי שוק')}</TableSortLabel></TableCell> : null}
                {columnVisibility.unvestedValue ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'unvestedValue')} align="right"><TableSortLabel active={sortBy === 'mvUnvested'} direction={sortDir} onClick={() => handleSort('mvUnvested')}>{t('Unvested Value', 'שווי לא מובשל')}</TableSortLabel></TableCell> : null}
                
                {columnVisibility.unrealizedGain ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGain')} align="right"><TableSortLabel active={sortBy === 'unrealizedGain'} direction={sortDir} onClick={() => handleSort('unrealizedGain')}>{t('Unrealized Gain', 'רווח לא ממומש')}</TableSortLabel></TableCell> : null}
                {columnVisibility.unrealizedGainPct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGainPct')} align="right"><TableSortLabel active={sortBy === 'unrealizedGainPct'} direction={sortDir} onClick={() => handleSort('unrealizedGainPct')}>{t('Unrealized Gain %', '% רווח לא ממומש')}</TableSortLabel></TableCell> : null}
                {columnVisibility.realizedGain ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGain')} align="right"><TableSortLabel active={sortBy === 'realizedGain'} direction={sortDir} onClick={() => handleSort('realizedGain')}>{t('Realized Gain', 'רווח ממומש')}</TableSortLabel></TableCell> : null}
                {columnVisibility.realizedGainPct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainPct')} align="right"><TableSortLabel active={sortBy === 'realizedGainPct'} direction={sortDir} onClick={() => handleSort('realizedGainPct')}>{t('Realized Gain %', '% רווח ממומש')}</TableSortLabel></TableCell> : null}
                {columnVisibility.realizedGainAfterTax ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainAfterTax')} align="right"><TableSortLabel active={sortBy === 'realizedGainAfterTax'} direction={sortDir} onClick={() => handleSort('realizedGainAfterTax')}>{t('Realized Gain After Tax', 'רווח ממומש נטו')}</TableSortLabel></TableCell> : null}
                {columnVisibility.totalGain ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGain')} align="right"><TableSortLabel active={sortBy === 'totalGain'} direction={sortDir} onClick={() => handleSort('totalGain')}>{t('Total Gain', 'רווח כולל')}</TableSortLabel></TableCell> : null}
                {columnVisibility.totalGainPct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGainPct')} align="right"><TableSortLabel active={sortBy === 'totalGainPct'} direction={sortDir} onClick={() => handleSort('totalGainPct')}>{t('Total Gain %', '% רווח כולל')}</TableSortLabel></TableCell> : null}
                {columnVisibility.valueAfterTax ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'valueAfterTax')} align="right"><TableSortLabel active={sortBy === 'valueAfterTax'} direction={sortDir} onClick={() => handleSort('valueAfterTax')}>{t('Value After Tax', 'שווי אחרי מס')}</TableSortLabel></TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedHoldings.map((h, index) => {
                const vals = h.display;
                
                // Special display logic for ILS: Show unit prices in Agorot (ILA) ONLY if the stock is natively ILS/ILA
                const showInILA = displayCurrency === 'ILS' && (h.stockCurrency === 'ILS' || h.stockCurrency === 'ILA');
                const priceDisplayCurrency = showInILA ? 'ILA' : displayCurrency;

                return (
                  <TableRow key={h.key || `${h.portfolioId}-${h.ticker}-${index}`} hover onClick={() => navigate(`/ticker/${h.exchange.toUpperCase()}/${h.ticker}`, { state: { holding: h, from: '/dashboard' } })} sx={{ cursor: 'pointer' }}>
                    {columnVisibility.displayName ? <TableCell sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{tTry(h.displayName, h.nameHe)}</TableCell> : null}
                    {columnVisibility.ticker ? <TableCell>{h.ticker}</TableCell> : null}
                    {columnVisibility.type ? <TableCell>
                        {h.type ? t(h.type.nameEn, h.type.nameHe) : '-'}
                    </TableCell> : null}
                    {columnVisibility.sector ? <TableCell>{h.sector}</TableCell> : null}
                    {columnVisibility.qty ? <TableCell align="right">{formatNumber(h.totalQty)}</TableCell> : null}
                    {columnVisibility.avgCost ? <TableCell align="right">{formatPrice(convertCurrency(vals.avgCost, displayCurrency, priceDisplayCurrency, exchangeRates), priceDisplayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.costBasis ? <TableCell align="right">{formatValue(vals.costBasis, displayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.currentPrice ? <TableCell align="right">{formatPrice(convertCurrency(vals.currentPrice, displayCurrency, priceDisplayCurrency, exchangeRates), priceDisplayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.weight ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(groupByPortfolio ? vals.weightInPortfolio : vals.weightInGlobal)}</TableCell> : null}
                    {columnVisibility.dayChangeVal ? <TableCell align="right" sx={{ color: vals.dayChangePct >= 0 ? theme.palette.success.main : theme.palette.error.main }}>{formatValue(vals.dayChangeVal, displayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.dayChangePct ? <TableCell align="right" sx={{ color: vals.dayChangePct >= 0 ? theme.palette.success.main : theme.palette.error.main }}>{formatPct(vals.dayChangePct)}</TableCell> : null}
                    {columnVisibility.mv ? <TableCell align="right">{formatValue(vals.marketValue, displayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.unvestedValue ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{h.mvUnvested > 0 ? formatConverted(h.mvUnvested, h.portfolioCurrency) : '-'}</TableCell> : null}
                    
                    {columnVisibility.unrealizedGain ? <TableCell align="right"><Typography variant="body2" color={vals.unrealizedGain >= 0 ? theme.palette.success.main : theme.palette.error.main}>{formatValue(vals.unrealizedGain, displayCurrency, 2, t)}</Typography></TableCell> : null}
                    {columnVisibility.unrealizedGainPct ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(vals.unrealizedGainPct)}</TableCell> : null}
                    {columnVisibility.realizedGain ? <TableCell align="right">{formatValue(vals.realizedGain, displayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.realizedGainPct ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(vals.realizedGainPct)}</TableCell> : null}
                    {columnVisibility.realizedGainAfterTax ? <TableCell align="right">{formatValue(vals.realizedGainAfterTax, displayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.totalGain ? <TableCell align="right" sx={{ fontWeight: 'bold', color: vals.totalGain >= 0 ? theme.palette.success.main : theme.palette.error.main }}>{formatValue(vals.totalGain, displayCurrency, 2, t)}</TableCell> : null}
                    {columnVisibility.totalGainPct ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(vals.totalGainPct)}</TableCell> : null}
                    {columnVisibility.valueAfterTax ? <TableCell align="right">{formatValue(vals.valueAfterTax, displayCurrency, 2, t)}</TableCell> : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Collapse>
      </Box>
    );
  };

  return (
    <>
      {rateError && <Alert severity="error" sx={{ mb: 2 }}>{rateError}</Alert>}
      {Object.entries(groupedData).map(renderGroup)}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleHideColumn}>{t('Hide Column', 'הסתר עמודה')}</MenuItem>
      </Menu>
    </>
  );
}
