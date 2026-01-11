import { useState } from 'react';
import { 
  Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, 
  Collapse, IconButton, TableSortLabel, Typography, Menu, MenuItem 
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { convertCurrency, formatCurrency, calculatePerformanceInDisplayCurrency, calculateHoldingDisplayValues } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

interface Holding {
  key: string;
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  exchange: string;
  displayName: string;
  sector: string;
  qtyVested: number;
  qtyUnvested: number;
  totalQty: number;
  avgCost: number;
  currentPrice: number;
  mvVested: number;
  mvUnvested: number;
  totalMV: number;
  realizedGain: number;
  realizedGainPct: number;
  realizedGainAfterTax: number;
  dividends: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  totalGain: number;
  totalGainPct: number;
  valueAfterTax: number;
  dayChangePct: number;
  dayChangeVal: number;
  costBasis: number;
  stockCurrency: string;
  priceUnit?: 'base' | 'agorot' | 'cents';
  portfolioCurrency: string;
  dayChangeValuePortfolioCurrency: number;
  unrealizedGainPortfolioCurrency: number;
  realizedGainPortfolioCurrency: number;
  totalGainPortfolioCurrency: number;
  marketValuePortfolioCurrency: number;
  costBasisStockCurrency: number;
  costOfSoldStockCurrency: number;
  proceedsStockCurrency: number;
  dividendsStockCurrency: number;
  costBasisPortfolioCurrency: number;
  costOfSoldPortfolioCurrency: number;
  proceedsPortfolioCurrency: number;
  dividendsPortfolioCurrency: number;
}

interface TableProps {
  holdings: Holding[];
  groupedData: Record<string, Holding[]>;
  groupByPortfolio: boolean;
  displayCurrency: string;
  exchangeRates: Record<string, number>;
  includeUnvested: boolean;
  onSelectPortfolio: (id: string | null) => void;
  columnVisibility: Record<string, boolean>;
  onHideColumn: (column: string) => void;
}

export function DashboardTable(props: TableProps) {
  const { 
    groupedData, groupByPortfolio, displayCurrency, exchangeRates, includeUnvested, onSelectPortfolio, columnVisibility, onHideColumn 
  } = props;
  const theme = useTheme();
  const navigate = useNavigate();
  
  const [sortBy, setSortBy] = useState<string>('totalMV');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; column: string; } | null>(null);

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

  // Formats a number as currency, handling USD, ILS, and EUR symbols.
  // Uses priceUnit to determine if the price is in a sub-unit like Agorot.
  const formatMoney = (n: number, currency: string, decimals = 2, priceUnit: 'base' | 'agorot' | 'cents' = 'base') => {
    let curr = currency;
    if (curr === '#N/A' || !curr) curr = 'ILS'; 
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (curr === 'USD') return `$${val}`;
    if (curr === 'ILS' || curr === 'NIS') {
      if (priceUnit === 'agorot') return `${val} ag.`; // Agorot
      return `₪${val}`;
    }
    if (curr === 'EUR') return `€${val}`;
    return `${val} ${curr}`;
  };

  // Converts a value from a base currency to the display currency, handling sub-units.
  const formatConverted = (n: number, fromCurrency: string, decimals = 0, priceUnit: 'base' | 'agorot' | 'cents' = 'base') => {
    const safeFrom = (fromCurrency === '#N/A' || !fromCurrency) ? 'ILS' : fromCurrency;
    let valueInBase = n;
    if (priceUnit === 'agorot') {
      valueInBase = n / 100;
    } else if (priceUnit === 'cents') {
      valueInBase = n / 100;
    }
    const converted = convertCurrency(valueInBase, safeFrom, displayCurrency, exchangeRates);
    return formatMoney(converted, displayCurrency, decimals);
  };

  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  const getSortValue = (h: Holding, key: string) => {
    const toDisplay = (val: number, curr: string) => convertCurrency(val, curr, displayCurrency, exchangeRates);
    switch (key) {
      case 'ticker': return h.ticker || '';
      case 'qty': return h.totalQty;
      case 'avgCost': return toDisplay(h.avgCost, h.stockCurrency);
      case 'currentPrice': return toDisplay(h.currentPrice, h.stockCurrency);
      case 'dayChangePct': return calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.priceUnit, h.dayChangePct, 'ago1d', displayCurrency, exchangeRates).changePct;
      case 'dayChangeVal': return calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.priceUnit, h.dayChangePct, 'ago1d', displayCurrency, exchangeRates).changeVal * h.totalQty;
      case 'marketValue': return calculateHoldingDisplayValues(h, displayCurrency, exchangeRates).marketValue;
      case 'unrealized': return calculateHoldingDisplayValues(h, displayCurrency, exchangeRates).unrealizedGain;
      case 'realizedGain': return calculateHoldingDisplayValues(h, displayCurrency, exchangeRates).realizedGain;
      case 'totalGain': return calculateHoldingDisplayValues(h, displayCurrency, exchangeRates).totalGain;
      case 'valueAfterTax': return calculateHoldingDisplayValues(h, displayCurrency, exchangeRates).valueAfterTax;
      default: return 0;
    }
  };

  const renderGroup = ([groupName, groupHoldings]: [string, Holding[]]) => {
    const isExpanded = expandedGroups[groupName] ?? true;
    const hasUnvested = groupHoldings.some(h => h.qtyUnvested > 0);

    const groupSummary = groupHoldings.reduce((acc, h) => {
      const displayVals = calculateHoldingDisplayValues(h, displayCurrency, exchangeRates);
      const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.priceUnit, h.dayChangePct, 'ago1d', displayCurrency, exchangeRates);
      const dayChange = changeVal * h.totalQty;
      
      acc.totalMV += displayVals.marketValue;
      acc.totalDayChange += dayChange;
      acc.totalUnrealizedGain += displayVals.unrealizedGain;
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
                Total: {formatMoney(groupSummary.totalMV, displayCurrency, 0)}
              </Typography>
              <Typography variant="body2" color={groupSummary.totalDayChange >= 0 ? 'success.main' : 'error.main'}>
                Day: {formatMoney(groupSummary.totalDayChange, displayCurrency, 0)} ({formatPct(groupDayChangePct)})
              </Typography>
              <Typography variant="body2" color={groupSummary.totalUnrealizedGain >= 0 ? 'success.main' : 'error.main'}>
                Unrealized: {formatMoney(groupSummary.totalUnrealizedGain, displayCurrency, 0)}
              </Typography>
            </Box>
          </Box>
        )}
        <Collapse in={groupByPortfolio ? isExpanded : true} timeout="auto" unmountOnExit>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: theme.palette.background.paper }}>
                {columnVisibility.displayName ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'displayName')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>Display Name</TableSortLabel></TableCell> : null}
                {columnVisibility.ticker ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'ticker')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>Ticker</TableSortLabel></TableCell> : null}
                {columnVisibility.sector ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'sector')}><TableSortLabel active={sortBy === 'sector'} direction={sortDir} onClick={() => handleSort('sector')}>Sector</TableSortLabel></TableCell> : null}
                {columnVisibility.qty ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'qty')} align="right"><TableSortLabel active={sortBy === 'qty'} direction={sortDir} onClick={() => handleSort('qty')}>Quantity</TableSortLabel></TableCell> : null}
                {columnVisibility.avgCost ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'avgCost')} align="right"><TableSortLabel active={sortBy === 'avgCost'} direction={sortDir} onClick={() => handleSort('avgCost')}>Avg Cost</TableSortLabel></TableCell> : null}
                {columnVisibility.currentPrice ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'currentPrice')} align="right"><TableSortLabel active={sortBy === 'currentPrice'} direction={sortDir} onClick={() => handleSort('currentPrice')}>Current Price</TableSortLabel></TableCell> : null}
                
                {/* Split Day Change Columns */}
                {columnVisibility.dayChangeVal ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'dayChangeVal')} align="right"><TableSortLabel active={sortBy === 'dayChangeVal'} direction={sortDir} onClick={() => handleSort('dayChangeVal')}>Day Change $</TableSortLabel></TableCell> : null}
                {columnVisibility.dayChangePct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'dayChangePct')} align="right"><TableSortLabel active={sortBy === 'dayChangePct'} direction={sortDir} onClick={() => handleSort('dayChangePct')}>Day Change %</TableSortLabel></TableCell> : null}

                {columnVisibility.mv ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'mv')} align="right"><TableSortLabel active={sortBy === 'marketValue'} direction={sortDir} onClick={() => handleSort('marketValue')}>Market Value</TableSortLabel></TableCell> : null}
                {includeUnvested ? <TableCell align="right"><TableSortLabel active={sortBy === 'mvVested'} direction={sortDir} onClick={() => handleSort('mvVested')}>Vested Value</TableSortLabel></TableCell> : null}
                {hasUnvested ? <TableCell align="right"><TableSortLabel active={sortBy === 'mvUnvested'} direction={sortDir} onClick={() => handleSort('mvUnvested')}>Unvested Value</TableSortLabel></TableCell> : null}
                {columnVisibility.unrealizedGain ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGain')} align="right"><TableSortLabel active={sortBy === 'unrealizedGain'} direction={sortDir} onClick={() => handleSort('unrealizedGain')}>Unrealized Gain</TableSortLabel></TableCell> : null}
                {columnVisibility.unrealizedGainPct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGainPct')} align="right"><TableSortLabel active={sortBy === 'unrealizedGainPct'} direction={sortDir} onClick={() => handleSort('unrealizedGainPct')}>Unrealized Gain %</TableSortLabel></TableCell> : null}
                {columnVisibility.realizedGain ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGain')} align="right"><TableSortLabel active={sortBy === 'realizedGain'} direction={sortDir} onClick={() => handleSort('realizedGain')}>Realized Gain</TableSortLabel></TableCell> : null}
                {columnVisibility.realizedGainPct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainPct')} align="right"><TableSortLabel active={sortBy === 'realizedGainPct'} direction={sortDir} onClick={() => handleSort('realizedGainPct')}>Realized Gain %</TableSortLabel></TableCell> : null}
                {columnVisibility.realizedGainAfterTax ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainAfterTax')} align="right"><TableSortLabel active={sortBy === 'realizedGainAfterTax'} direction={sortDir} onClick={() => handleSort('realizedGainAfterTax')}>Realized Gain After Tax</TableSortLabel></TableCell> : null}
                {columnVisibility.totalGain ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGain')} align="right"><TableSortLabel active={sortBy === 'totalGain'} direction={sortDir} onClick={() => handleSort('totalGain')}>Total Gain</TableSortLabel></TableCell> : null}
                {columnVisibility.totalGainPct ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGainPct')} align="right"><TableSortLabel active={sortBy === 'totalGainPct'} direction={sortDir} onClick={() => handleSort('totalGainPct')}>Total Gain %</TableSortLabel></TableCell> : null}
                {columnVisibility.valueAfterTax ? <TableCell onContextMenu={(e) => handleContextMenu(e, 'valueAfterTax')} align="right"><TableSortLabel active={sortBy === 'valueAfterTax'} direction={sortDir} onClick={() => handleSort('valueAfterTax')}>Value After Tax</TableSortLabel></TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedHoldings.map(h => {
                const displayedVestedValue = h.mvVested; // TODO: Adjust if needed but usually ratio is same
                const displayedUnvestedValue = h.mvUnvested;
                
                // Dynamic Calculation
                const displayVals = calculateHoldingDisplayValues(h, displayCurrency, exchangeRates);

                // Calculate Day Change in Display Currency
                const { changeVal: dayChangeValDisplay, changePct: dayChangePctDisplay } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.priceUnit, h.dayChangePct, 'ago1d', displayCurrency, exchangeRates);
                
                return (
                  <TableRow key={h.key} hover onClick={() => navigate(`/ticker/${h.exchange.toUpperCase()}/${h.ticker}`, { state: { holding: h } })} sx={{ cursor: 'pointer' }}>
                    {columnVisibility.displayName ? <TableCell sx={{ fontWeight: 'bold' }}>{h.displayName}</TableCell> : null}
                    {columnVisibility.ticker ? <TableCell>{h.ticker}</TableCell> : null}
                    {columnVisibility.sector ? <TableCell>{h.sector}</TableCell> : null}
                    {columnVisibility.qty ? <TableCell align="right">{h.totalQty.toLocaleString()}</TableCell> : null}
                    {columnVisibility.avgCost ? <TableCell align="right">{formatMoney(h.avgCost, h.stockCurrency, 2, h.priceUnit)}</TableCell> : null}
                    {columnVisibility.currentPrice ? <TableCell align="right">{formatMoney(h.currentPrice, h.stockCurrency, 2, h.priceUnit)}</TableCell> : null}
                    {columnVisibility.dayChangeVal ? <TableCell align="right" sx={{ color: dayChangePctDisplay >= 0 ? theme.palette.success.main : theme.palette.error.main }}>{formatMoney(dayChangeValDisplay * h.totalQty, displayCurrency, 2)}</TableCell> : null}
                    {columnVisibility.dayChangePct ? <TableCell align="right" sx={{ color: dayChangePctDisplay >= 0 ? theme.palette.success.main : theme.palette.error.main }}>{formatPct(dayChangePctDisplay)}</TableCell> : null}
                    {columnVisibility.mv ? <TableCell align="right">{formatMoney(displayVals.marketValue, displayCurrency)}</TableCell> : null}
                    {includeUnvested ? <TableCell align="right">{formatConverted(displayedVestedValue, h.portfolioCurrency)}</TableCell> : null}
                    {hasUnvested && displayedUnvestedValue > 0 ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatConverted(displayedUnvestedValue, h.portfolioCurrency)}</TableCell> : hasUnvested ? <TableCell align="right" sx={{ color: 'text.secondary' }}>-</TableCell> : null}
                    {columnVisibility.unrealizedGain ? <TableCell align="right"><Typography variant="body2" color={displayVals.unrealizedGain >= 0 ? theme.palette.success.main : theme.palette.error.main}>{formatMoney(displayVals.unrealizedGain, displayCurrency)}</Typography></TableCell> : null}
                    {columnVisibility.unrealizedGainPct ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(displayVals.unrealizedGainPct)}</TableCell> : null}
                    {columnVisibility.realizedGain ? <TableCell align="right">{formatMoney(displayVals.realizedGain, displayCurrency)}</TableCell> : null}
                    {columnVisibility.realizedGainPct ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(displayVals.realizedGainPct)}</TableCell> : null}
                    {columnVisibility.realizedGainAfterTax ? <TableCell align="right">{formatMoney(displayVals.realizedGainAfterTax, displayCurrency)}</TableCell> : null}
                    {columnVisibility.totalGain ? <TableCell align="right" sx={{ fontWeight: 'bold', color: displayVals.totalGain >= 0 ? theme.palette.success.dark : theme.palette.error.dark }}>{formatMoney(displayVals.totalGain, displayCurrency)}</TableCell> : null}
                    {columnVisibility.totalGainPct ? <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(displayVals.totalGainPct)}</TableCell> : null}
                    {columnVisibility.valueAfterTax ? <TableCell align="right">{formatMoney(displayVals.valueAfterTax, displayCurrency)}</TableCell> : null}
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
      {Object.entries(groupedData).map(renderGroup)}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleHideColumn}>Hide Column</MenuItem>
      </Menu>
    </>
  );
}
