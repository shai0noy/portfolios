import { useState } from 'react';
import { 
  Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, 
  Collapse, IconButton, TableSortLabel, Typography, Menu, MenuItem 
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { convertCurrency } from '../lib/currency';
import { TickerDetails } from './TickerDetails';

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
  sheetId: string;
}

export function DashboardTable({ 
  groupedData, groupByPortfolio, displayCurrency, exchangeRates, includeUnvested, onSelectPortfolio, columnVisibility, onHideColumn, sheetId 
}: TableProps) {
  const theme = useTheme();
  
  const [sortBy, setSortBy] = useState<string>('totalMV');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; column: string; } | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

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

  const formatMoney = (n: number, currency: string, decimals = 2) => {
    let curr = currency;
    if (curr === '#N/A' || !curr) curr = 'ILS'; 
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (curr === 'USD') return `$${val}`;
    if (curr === 'ILS' || curr === 'NIS') return `₪${val}`;
    if (curr === 'EUR') return `€${val}`;
    return `${val} ${curr}`;
  };

  const formatConverted = (n: number, fromCurrency: string, decimals = 0) => {
    const safeFrom = (fromCurrency === '#N/A' || !fromCurrency) ? 'ILS' : fromCurrency;
    const converted = convertCurrency(n, safeFrom, displayCurrency, exchangeRates);
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
      case 'dayChangePct': return h.dayChangePct;
      case 'dayChangeVal': return toDisplay(h.dayChangeVal, h.stockCurrency);
      case 'marketValue': return toDisplay(h.totalMV, h.stockCurrency);
      case 'unrealized': return toDisplay(h.unrealizedGain, h.stockCurrency);
      case 'realizedGain': return toDisplay(h.realizedGain, h.stockCurrency);
      case 'totalGain': return toDisplay(h.totalGain, h.stockCurrency);
      case 'valueAfterTax': return toDisplay(h.valueAfterTax, h.stockCurrency);
      default: return 0;
    }
  };

  const renderGroup = ([groupName, groupHoldings]: [string, Holding[]]) => {
    const isExpanded = expandedGroups[groupName] ?? true;
    const hasUnvested = groupHoldings.some(h => h.qtyUnvested > 0);

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
          <Box display="flex" alignItems="center" justifyContent="space-between" p={1} bgcolor={theme.palette.background.default} borderBottom={`1px solid ${theme.palette.divider}`}>
            <Box display="flex" alignItems="center" gap={1} onClick={() => onSelectPortfolio(groupName)} style={{ cursor: 'pointer' }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleGroup(groupName); }} sx={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
                <ExpandMoreIcon fontSize="small" />
              </IconButton>
              <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600 }}>{groupName}</Typography>
            </Box>
            <Typography variant="caption" sx={{ opacity: 0.7, pr: 1 }}>{groupHoldings.length} holdings</Typography>
          </Box>
        )}
        <Collapse in={groupByPortfolio ? isExpanded : true} timeout="auto" unmountOnExit>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: theme.palette.background.paper }}>
                {columnVisibility.displayName && <TableCell onContextMenu={(e) => handleContextMenu(e, 'displayName')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>Display Name</TableSortLabel></TableCell>}
                {columnVisibility.ticker && <TableCell onContextMenu={(e) => handleContextMenu(e, 'ticker')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>Ticker</TableSortLabel></TableCell>}
                {columnVisibility.sector && <TableCell onContextMenu={(e) => handleContextMenu(e, 'sector')}><TableSortLabel active={sortBy === 'sector'} direction={sortDir} onClick={() => handleSort('sector')}>Sector</TableSortLabel></TableCell>}
                {columnVisibility.qty && <TableCell onContextMenu={(e) => handleContextMenu(e, 'qty')} align="right"><TableSortLabel active={sortBy === 'qty'} direction={sortDir} onClick={() => handleSort('qty')}>Quantity</TableSortLabel></TableCell>}
                {columnVisibility.avgCost && <TableCell onContextMenu={(e) => handleContextMenu(e, 'avgCost')} align="right"><TableSortLabel active={sortBy === 'avgCost'} direction={sortDir} onClick={() => handleSort('avgCost')}>Avg Cost</TableSortLabel></TableCell>}
                {columnVisibility.currentPrice && <TableCell onContextMenu={(e) => handleContextMenu(e, 'currentPrice')} align="right"><TableSortLabel active={sortBy === 'currentPrice'} direction={sortDir} onClick={() => handleSort('currentPrice')}>Current Price</TableSortLabel></TableCell>}
                
                {/* Split Day Change Columns */}
                {columnVisibility.dayChangeVal && <TableCell onContextMenu={(e) => handleContextMenu(e, 'dayChangeVal')} align="right"><TableSortLabel active={sortBy === 'dayChangeVal'} direction={sortDir} onClick={() => handleSort('dayChangeVal')}>Day Change $</TableSortLabel></TableCell>}
                {columnVisibility.dayChangePct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'dayChangePct')} align="right"><TableSortLabel active={sortBy === 'dayChangePct'} direction={sortDir} onClick={() => handleSort('dayChangePct')}>Day Change %</TableSortLabel></TableCell>}

                {columnVisibility.mv && <TableCell onContextMenu={(e) => handleContextMenu(e, 'mv')} align="right"><TableSortLabel active={sortBy === 'marketValue'} direction={sortDir} onClick={() => handleSort('marketValue')}>Market Value</TableSortLabel></TableCell>}
                {includeUnvested && <TableCell align="right"><TableSortLabel active={sortBy === 'mvVested'} direction={sortDir} onClick={() => handleSort('mvVested')}>Vested Value</TableSortLabel></TableCell>}
                {hasUnvested && <TableCell align="right"><TableSortLabel active={sortBy === 'mvUnvested'} direction={sortDir} onClick={() => handleSort('mvUnvested')}>Unvested Value</TableSortLabel></TableCell>}
                {columnVisibility.unrealizedGain && <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGain')} align="right"><TableSortLabel active={sortBy === 'unrealizedGain'} direction={sortDir} onClick={() => handleSort('unrealizedGain')}>Unrealized Gain</TableSortLabel></TableCell>}
                {columnVisibility.unrealizedGainPct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGainPct')} align="right"><TableSortLabel active={sortBy === 'unrealizedGainPct'} direction={sortDir} onClick={() => handleSort('unrealizedGainPct')}>Unrealized Gain %</TableSortLabel></TableCell>}
                {columnVisibility.realizedGain && <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGain')} align="right"><TableSortLabel active={sortBy === 'realizedGain'} direction={sortDir} onClick={() => handleSort('realizedGain')}>Realized Gain</TableSortLabel></TableCell>}
                {columnVisibility.realizedGainPct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainPct')} align="right"><TableSortLabel active={sortBy === 'realizedGainPct'} direction={sortDir} onClick={() => handleSort('realizedGainPct')}>Realized Gain %</TableSortLabel></TableCell>}
                {columnVisibility.realizedGainAfterTax && <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainAfterTax')} align="right"><TableSortLabel active={sortBy === 'realizedGainAfterTax'} direction={sortDir} onClick={() => handleSort('realizedGainAfterTax')}>Realized Gain After Tax</TableSortLabel></TableCell>}
                {columnVisibility.totalGain && <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGain')} align="right"><TableSortLabel active={sortBy === 'totalGain'} direction={sortDir} onClick={() => handleSort('totalGain')}>Total Gain</TableSortLabel></TableCell>}
                {columnVisibility.totalGainPct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGainPct')} align="right"><TableSortLabel active={sortBy === 'totalGainPct'} direction={sortDir} onClick={() => handleSort('totalGainPct')}>Total Gain %</TableSortLabel></TableCell>}
                {columnVisibility.valueAfterTax && <TableCell onContextMenu={(e) => handleContextMenu(e, 'valueAfterTax')} align="right"><TableSortLabel active={sortBy === 'valueAfterTax'} direction={sortDir} onClick={() => handleSort('valueAfterTax')}>Value After Tax</TableSortLabel></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedHoldings.map(h => {
                const displayedVestedValue = h.mvVested;
                const displayedUnvestedValue = h.mvUnvested;
                const totalRet = h.unrealizedGain + h.realizedGain + h.dividends;
                
                return (
                  <TableRow key={h.key} hover>
                    {columnVisibility.displayName && <TableCell sx={{ fontWeight: 'bold' }}>{h.displayName}</TableCell>}
                    {columnVisibility.ticker && (
                      <TableCell 
                        onClick={() => setSelectedHolding(h)} 
                        sx={{ cursor: 'pointer', color: 'primary.main', textDecoration: 'underline' }}
                      >
                        {h.ticker}
                      </TableCell>
                    )}
                    {columnVisibility.sector && <TableCell>{h.sector}</TableCell>}
                    {columnVisibility.qty && <TableCell align="right">{h.totalQty.toLocaleString()}</TableCell>}
                    {columnVisibility.avgCost && <TableCell align="right">{formatMoney(h.avgCost, h.stockCurrency)}</TableCell>}
                    {columnVisibility.currentPrice && <TableCell align="right">{formatMoney(h.currentPrice, h.stockCurrency)}</TableCell>}
                    
                    {columnVisibility.dayChangeVal && <TableCell align="right" sx={{ color: h.dayChangePct >= 0 ? 'success.main' : 'error.main' }}>
                      {formatConverted(h.dayChangeVal, h.stockCurrency)}
                    </TableCell>}
                    {columnVisibility.dayChangePct && <TableCell align="right" sx={{ color: h.dayChangePct >= 0 ? 'success.main' : 'error.main' }}>
                      {formatPct(h.dayChangePct)}
                    </TableCell>}

                    {columnVisibility.mv && <TableCell align="right">{formatConverted(h.totalMV, h.stockCurrency)}</TableCell>}
                    {includeUnvested && <TableCell align="right">{formatConverted(displayedVestedValue, h.stockCurrency)}</TableCell>}
                    {hasUnvested && <TableCell align="right" sx={{ color: 'text.secondary' }}>{displayedUnvestedValue > 0 ? formatConverted(displayedUnvestedValue, h.stockCurrency) : '-'}</TableCell>}
                    {columnVisibility.unrealizedGain && <TableCell align="right"><Typography variant="body2" color={h.unrealizedGain >= 0 ? 'success.main' : 'error.main'}>{formatConverted(h.unrealizedGain, h.stockCurrency)}</Typography></TableCell>}
                    {columnVisibility.unrealizedGainPct && <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(h.unrealizedGainPct)}</TableCell>}
                    {columnVisibility.realizedGain && <TableCell align="right">{formatConverted(h.realizedGain, h.stockCurrency)}</TableCell>}
                    {columnVisibility.realizedGainPct && <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(h.realizedGainPct)}</TableCell>}
                    {columnVisibility.realizedGainAfterTax && <TableCell align="right">{formatConverted(h.realizedGainAfterTax, h.stockCurrency)}</TableCell>}
                    {columnVisibility.totalGain && <TableCell align="right" sx={{ fontWeight: 'bold', color: totalRet >= 0 ? 'success.dark' : 'error.dark' }}>{formatConverted(totalRet, h.stockCurrency)}</TableCell>}
                    {columnVisibility.totalGainPct && <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(h.totalGainPct)}</TableCell>}
                    {columnVisibility.valueAfterTax && <TableCell align="right">{formatConverted(h.valueAfterTax, h.stockCurrency)}</TableCell>}
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

      {selectedHolding && (
        <TickerDetails 
          open={!!selectedHolding} 
          onClose={() => setSelectedHolding(null)}
          ticker={selectedHolding.ticker}
          exchange={selectedHolding.exchange}
          name={selectedHolding.displayName}
          price={selectedHolding.currentPrice}
          currency={selectedHolding.stockCurrency}
          sector={selectedHolding.sector}
          dayChangePct={selectedHolding.dayChangePct}
          dayChangeVal={selectedHolding.currentPrice * selectedHolding.dayChangePct} 
          sheetId={sheetId}
        />
      )}
    </>
  );
}
