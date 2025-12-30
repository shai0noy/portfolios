import { useState, useEffect, useMemo } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, CircularProgress, FormControlLabel, Switch, Grid 
} from '@mui/material';
import { fetchPortfolios, fetchTransactions } from '../lib/sheets';


interface DashboardProps {
  sheetId: string;
}

interface Holding {
  key: string; // Composite key: portfolioId_ticker
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  qtyVested: number;
  qtyUnvested: number;
  totalQty: number;
  avgCost: number;
  currentPrice: number; // Last transaction price
  mvVested: number;
  mvUnvested: number;
  totalMV: number;
  realizedGain: number; // Net realized gain
  dividends: number;
  costBasis: number; // For unrealized calc
}

export function Dashboard({ sheetId }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  
  // Grand Totals
  const [summary, setSummary] = useState({
    aum: 0,
    totalUnrealized: 0,
    totalRealized: 0,
    totalDividends: 0,
    totalReturn: 0
  });

  useEffect(() => {
    loadData();
  }, [sheetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ports, txns] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId)
      ]);

      const portMap = new Map(ports.map(p => [p.id, p]));
      const holdingMap = new Map<string, Holding>();

      // 1. Process Transactions
      txns.forEach(t => {
        const key = `${t.portfolioId}_${t.ticker}`;
        
        if (!holdingMap.has(key)) {
          holdingMap.set(key, {
            key,
            portfolioId: t.portfolioId,
            portfolioName: portMap.get(t.portfolioId)?.name || t.portfolioId,
            ticker: t.ticker,
            qtyVested: 0,
            qtyUnvested: 0,
            totalQty: 0,
            avgCost: 0,
            currentPrice: 0, // Will update with latest
            mvVested: 0,
            mvUnvested: 0,
            totalMV: 0,
            realizedGain: 0,
            dividends: 0,
            costBasis: 0
          });
        }

        const h = holdingMap.get(key)!;
        
        // Update Price (Naive: use latest transaction price)
        if (t.price > 0) h.currentPrice = t.price;

        const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();

        if (t.type === 'BUY') {
          if (isVested) h.qtyVested += t.qty;
          else h.qtyUnvested += t.qty;
          
          h.costBasis += (t.qty * t.price) + t.commission; // Include comms in cost basis
        } else if (t.type === 'SELL') {
          // FIFO or Avg Cost logic? Simplified: Reduce cost basis proportionally
          // const fractionSold = t.qty / (h.qtyVested + h.qtyUnvested + t.qty); // Pre-sell qty
          // Realized Gain = (Sell Price * Qty) - Cost Basis Portion - Commission - Tax (Implicit in Net Value?)
          // Actually, let's use the Net Value from sheet which already calculates (Price*Qty - Comm).
          // We need to subtract the Cost Basis of the sold shares to get Gain.
          // Simplified: Cost Basis reduction = Avg Cost * Qty Sold
          const avgCost = (h.qtyVested + h.qtyUnvested) > 0 ? h.costBasis / (h.qtyVested + h.qtyUnvested) : 0;
          const costOfSold = avgCost * t.qty;
          
          h.realizedGain += (t.netValue - costOfSold); // Net Value is (Gross - Comm)
          h.costBasis -= costOfSold;

          if (isVested) h.qtyVested -= t.qty;
          else h.qtyUnvested -= t.qty; // Rare to sell unvested, but possible in logic
        } else if (t.type === 'DIVIDEND') {
          h.dividends += t.netValue;
        }
      });

      // 2. Finalize Calculations
      const processedHoldings: Holding[] = [];
      let grandAUM = 0;
      let grandUnrealized = 0;
      let grandRealized = 0;
      let grandDividends = 0;

      holdingMap.forEach(h => {
        h.totalQty = h.qtyVested + h.qtyUnvested;
        h.avgCost = h.totalQty > 0 ? h.costBasis / h.totalQty : 0;
        h.mvVested = h.qtyVested * h.currentPrice;
        h.mvUnvested = h.qtyUnvested * h.currentPrice;
        h.totalMV = h.mvVested + h.mvUnvested;
        
        const unrealized = h.totalMV - h.costBasis;
        
        grandAUM += h.totalMV;
        grandUnrealized += unrealized;
        grandRealized += h.realizedGain;
        grandDividends += h.dividends;

        processedHoldings.push(h);
      });

      setSummary({
        aum: grandAUM,
        totalUnrealized: grandUnrealized,
        totalRealized: grandRealized,
        totalDividends: grandDividends,
        totalReturn: grandUnrealized + grandRealized + grandDividends
      });

      setHoldings(processedHoldings);

    } catch (e) {
      console.error(e);
      alert('Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Grouping Logic
  const groupedData = useMemo(() => {
    if (!groupByPortfolio) return { 'All Holdings': holdings };
    
    const groups: Record<string, Holding[]> = {};
    holdings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });
    return groups;
  }, [holdings, groupByPortfolio]);

  const formatMoney = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 4 }}>
      {/* SUMMARY CARD */}
      <Paper sx={{ p: 3, mb: 4, bgcolor: 'primary.main', color: 'white' }}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>TOTAL AUM</Typography>
            <Typography variant="h3" fontWeight="bold">${formatMoney(summary.aum)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 9 }}>
            <Box display="flex" gap={4} justifyContent="flex-end">
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>UNREALIZED GAIN</Typography>
                <Typography variant="h6" color={summary.totalUnrealized >= 0 ? '#4caf50' : '#ff5252'}>
                  {summary.totalUnrealized >= 0 ? '+' : ''}{formatMoney(summary.totalUnrealized)}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>REALIZED GAIN</Typography>
                <Typography variant="h6">
                  {summary.totalRealized >= 0 ? '+' : ''}{formatMoney(summary.totalRealized)}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>DIVIDENDS</Typography>
                <Typography variant="h6">+ {formatMoney(summary.totalDividends)}</Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>TOTAL RETURN</Typography>
                <Typography variant="h6" fontWeight="bold">
                  {summary.totalReturn >= 0 ? '+' : ''}{formatMoney(summary.totalReturn)}
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* CONTROLS */}
      <Box display="flex" justifyContent="flex-end" mb={2}>
        <FormControlLabel 
          control={<Switch checked={groupByPortfolio} onChange={e => setGroupByPortfolio(e.target.checked)} />} 
          label="Group by Portfolio" 
        />
      </Box>

      {/* TABLES */}
      {Object.entries(groupedData).map(([groupName, groupHoldings]) => (
        <TableContainer component={Paper} key={groupName} sx={{ mb: 4, overflowX: 'auto' }}>
          {groupByPortfolio && (
            <Box p={2} bgcolor="#f5f5f5" borderBottom="1px solid #e0e0e0">
              <Typography variant="h6" color="primary">{groupName}</Typography>
            </Box>
          )}
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell>Ticker</TableCell>
                <TableCell align="right">Qty (Vested)</TableCell>
                <TableCell align="right">Qty (Unvested)</TableCell>
                <TableCell align="right">Avg Cost</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">MV (Vested)</TableCell>
                <TableCell align="right">MV (Unvested)</TableCell>
                <TableCell align="right">Unrealized Gain</TableCell>
                <TableCell align="right">Realized Gain</TableCell>
                <TableCell align="right">Total Return</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groupHoldings.map(h => {
                const unrealized = h.totalMV - h.costBasis;
                const unrealizedPct = h.costBasis > 0 ? unrealized / h.costBasis : 0;
                const totalRet = unrealized + h.realizedGain + h.dividends;

                return (
                  <TableRow key={h.key} hover>
                    <TableCell sx={{ fontWeight: 'bold' }}>{h.ticker}</TableCell>
                    <TableCell align="right">{h.qtyVested.toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{h.qtyUnvested > 0 ? h.qtyUnvested.toLocaleString() : '-'}</TableCell>
                    <TableCell align="right">{formatMoney(h.avgCost)}</TableCell>
                    <TableCell align="right">{formatMoney(h.currentPrice)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 500 }}>{formatMoney(h.mvVested)}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{h.mvUnvested > 0 ? formatMoney(h.mvUnvested) : '-'}</TableCell>
                    <TableCell align="right">
                      <Box display="flex" flexDirection="column" alignItems="flex-end">
                        <Typography variant="body2" color={unrealized >= 0 ? 'success.main' : 'error.main'}>
                          {formatMoney(unrealized)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatPct(unrealizedPct)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">{formatMoney(h.realizedGain)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', color: totalRet >= 0 ? 'success.dark' : 'error.dark' }}>
                      {formatMoney(totalRet)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ))}
    </Box>
  );
}
