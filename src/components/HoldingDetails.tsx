import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tooltip, Link, Stack, CircularProgress } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import type { DashboardHolding, Transaction, ExchangeRates, Holding, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { useMemo, useState, useEffect } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import { fetchTransactions, fetchAllDividends } from '../lib/sheets';

export type HoldingSection = 'overview' | 'transactions' | 'dividends';

export interface HoldingWeight {
    portfolioId: string;
    portfolioName: string;
    weightInPortfolio: number;
    weightInGlobal: number;
    value: number;
}

interface HoldingDetailsProps {
    sheetId: string;
    holding: DashboardHolding | Holding;
    displayCurrency: string;
    portfolios: Portfolio[];
    onPortfolioClick: (id: string) => void;
    section?: HoldingSection;
}

const formatDate = (dateInput: string | Date | number) => {
    if (!dateInput) return '';
    // If it's a simple YYYY-MM-DD string, split it to avoid timezone shifts
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        const [y, m, d] = dateInput.split('-');
        return `${d}/${m}/${y}`;
    }
    const date = new Date(dateInput);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

export function HoldingDetails({ sheetId, holding, displayCurrency, portfolios, onPortfolioClick, section = 'overview' }: HoldingDetailsProps) {
    const { t } = useLanguage();
    
    // Internal state for fetched data
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [dividends, setDividends] = useState<any[]>([]);
    const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch data on mount
    useEffect(() => {
        let mounted = true;
        const loadData = async () => {
            try {
                setLoading(true);
                const [txns, divs, rates] = await Promise.all([
                    fetchTransactions(sheetId),
                    fetchAllDividends(sheetId),
                    getExchangeRates(sheetId)
                ]);
                
                if (mounted) {
                    setTransactions(txns);
                    setDividends(divs);
                    setExchangeRates(rates);
                }
            } catch (err) {
                console.error("Failed to fetch holding details:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        loadData();
        return () => { mounted = false; };
    }, [sheetId]);

    // Calculate Weights across all portfolios
    const holdingsWeights = useMemo(() => {
        if (!portfolios || portfolios.length === 0 || !exchangeRates) return [];
        
        // Ensure displayCurrency is available or fallback
        const targetCurrency = normalizeCurrency(displayCurrency || 'USD');

        let totalAum = 0;
        const portfolioValues: Record<string, number> = {};

        portfolios.forEach(p => {
          const pValue = p.holdings?.reduce((sum, h) => sum + convertCurrency(h.totalValue || 0, h.currency || 'USD', targetCurrency, exchangeRates), 0) || 0;
          portfolioValues[p.id] = pValue;
          totalAum += pValue;
        });
        
        const results: any[] = [];
        portfolios.forEach(p => {
          // Find holding in this portfolio matching our ticker
          const h = p.holdings?.find(h => h.ticker === holding.ticker && (h.exchange === (holding as any).exchange || !h.exchange)); // Loose match on exchange if needed
          
          if (h) {
            const pValue = portfolioValues[p.id] || 0;
            const hValue = convertCurrency(h.totalValue || 0, h.currency || 'USD', targetCurrency, exchangeRates);
            results.push({
              portfolioId: p.id,
              portfolioName: p.name,
              weightInPortfolio: pValue > 0 ? hValue / pValue : 0,
              weightInGlobal: totalAum > 0 ? hValue / totalAum : 0,
              value: hValue 
            });
          }
        });
        return results;
    }, [portfolios, holding, exchangeRates, displayCurrency]);

    // Check if it's an Enriched holding (from Dashboard) or raw (from TickerDetails hook)
    const enriched = (holding as any).display ? (holding as EnrichedDashboardHolding) : null;
    
    // If not enriched, we should still show what we can, or just wait for enrichment
    // However, Dashboard usually passes enriched.
    const vals = enriched?.display;

    // Filter transactions and dividends for this holding
    const txnHistory = useMemo(() => {
        return transactions
            .filter(txn => txn.portfolioId === holding.portfolioId && txn.ticker === holding.ticker)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, holding]);

    const divHistory = useMemo(() => {
        // Reconstruct Qty History to calculate actual payouts
        // 1. Sort transactions ascending
        const sortedTxns = [...txnHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const sortedDivs = [...dividends].filter(d => d.ticker === holding.ticker).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const payouts: any[] = [];
        let currentQty = 0;
        let txnIdx = 0;

        for (const div of sortedDivs) {
            const divDate = new Date(div.date);
            // Apply all txns before or on this date
            while (txnIdx < sortedTxns.length && new Date(sortedTxns[txnIdx].date) <= divDate) {
                const t = sortedTxns[txnIdx];
                if (t.type === 'BUY') currentQty += (t.qty || 0);
                if (t.type === 'SELL') currentQty -= (t.qty || 0);
                txnIdx++;
            }
            
            if (currentQty > 0) {
                payouts.push({
                    ...div,
                    heldQty: currentQty,
                    totalValue: div.amount * currentQty
                });
            }
        }
        return payouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [dividends, txnHistory, holding]);

    // Calculate Layers (Buy Lots)
    const layers = useMemo(() => {
        return txnHistory.filter(txn => txn.type === 'BUY');
    }, [txnHistory]);

    // Calculate Fees
    const totalFeesPC = useMemo(() => {
        return txnHistory.reduce((sum, txn) => sum + (txn.commission || 0), 0);
    }, [txnHistory]);

    const stockCurrency = (holding as DashboardHolding).stockCurrency || (holding as Holding).currency || 'USD';
    const totalQty = (holding as DashboardHolding).totalQty ?? (holding as Holding).qty ?? 0;
    
    const totalFeesDisplay = useMemo(() => {
        return convertCurrency(totalFeesPC, (holding as Holding).currency || stockCurrency, displayCurrency, exchangeRates || undefined);
    }, [totalFeesPC, holding, stockCurrency, displayCurrency, exchangeRates]);

    const totalGlobalWeight = useMemo(() => {
        return holdingsWeights.reduce((sum, w) => sum + w.weightInGlobal, 0);
    }, [holdingsWeights]);

    const portfolioName = enriched?.portfolioName || holdingsWeights.find(w => w.portfolioId === holding.portfolioId)?.portfolioName || '';

    if (loading) {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ mt: 2 }}>
            {/* SECTION: OVERVIEW */}
            {section === 'overview' && (
                <Box>
                  {!vals ? (
                     <Box sx={{ p: 2, textAlign: 'center' }}>
                         <Typography color="text.secondary">{t('Calculating holding details...', 'מחשב פרטי החזקה...')}</Typography>
                     </Box>
                  ) : (
                    <>
                    {/* 1. Key Metrics */}
                    <Typography variant="h6" gutterBottom color="primary" sx={{ fontWeight: 'bold' }}>
                        {t('My Position', 'הפוזיציה שלי')}
                    </Typography>
                    
                    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                        <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />} justifyContent="space-around" sx={{ mb: 2 }}>
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Value', 'שווי')}</Typography>
                                <Typography variant="h6" fontWeight="700">{formatValue(vals.marketValue, displayCurrency)}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Total Gain', 'רווח כולל')}</Typography>
                                <Typography variant="h6" fontWeight="700" color={vals.totalGain >= 0 ? 'success.main' : 'error.main'}>
                                    {formatValue(vals.totalGain, displayCurrency)}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.totalGain >= 0 ? 'success.main' : 'error.main'}>
                                    {vals.totalGainPct > 0 ? '+' : ''}{formatPercent(vals.totalGainPct)}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Net Realized', 'מימוש נטו')}</Typography>
                                <Typography variant="h6" fontWeight="700" color={vals.realizedGainAfterTax >= 0 ? 'success.main' : 'error.main'}>
                                    {formatValue(vals.realizedGainAfterTax, displayCurrency)}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Unrealized', 'לא ממומש')}</Typography>
                                <Typography variant="h6" fontWeight="700" color={vals.unrealizedGain >= 0 ? 'success.main' : 'error.main'}>
                                    {formatValue(vals.unrealizedGain, displayCurrency)}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.unrealizedGain >= 0 ? 'success.main' : 'error.main'}>
                                    {vals.unrealizedGainPct > 0 ? '+' : ''}{formatPercent(vals.unrealizedGainPct)}
                                </Typography>
                            </Box>
                        </Stack>
                        
                        <Divider sx={{ my: 2 }} />
                        
                        <Grid container spacing={2}>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary">{t('Avg Cost', 'מחיר ממוצע')}</Typography>
                                <Typography variant="body2" fontWeight="500">{formatPrice(vals.avgCost, displayCurrency)}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary">{t('Quantity', 'כמות')}</Typography>
                                <Typography variant="body1" fontWeight="500">{formatNumber(totalQty)}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary">{t('Total Cost', 'עלות מקורית')}</Typography>
                                <Typography variant="body2" fontWeight="500">{formatValue(vals.costBasis, displayCurrency)}</Typography>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary">{t('Total Fees', 'סה"כ עמלות')}</Typography>
                                <Typography variant="body2" fontWeight="500">{formatValue(totalFeesDisplay, displayCurrency)}</Typography>
                            </Grid>
                        </Grid>
                    </Paper>

                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {/* 2. Buy Layers */}
                        <Grid item xs={12} md={7}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Buy Lots / Layers', 'שכבות רכישה')}</Typography>
                            <Paper variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto' }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Price', 'מחיר')}</TableCell>
                                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Total', 'סה"כ')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {layers.length === 0 && (
                                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No buy transactions found.', 'לא נמצאו עסקאות קנייה.')}</TableCell></TableRow>
                                        )}
                                        {layers.map((layer, i) => (
                                            <TableRow key={i}>
                                                <TableCell>{formatDate(layer.date)}</TableCell>
                                                <TableCell align="right">{formatNumber(layer.qty)}</TableCell>
                                                <TableCell align="right">{formatPrice(layer.price || 0, layer.currency || 'USD')}</TableCell>
                                                <TableCell align="right">{formatValue((layer.qty || 0) * (layer.price || 0), layer.currency || 'USD')}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={5}>
                            <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', textTransform: 'uppercase', color: 'text.secondary' }}>
                                    {t('Portfolio Distribution', 'התפלגות בתיקים')}
                                </Typography>
                                
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, px: 1 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>{t('Portfolio', 'תיק')}</Typography>
                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', minWidth: 90, textAlign: 'right' }}>{t('Value', 'שווי')}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', minWidth: 110, textAlign: 'right' }}>{t('Weight in Portfolio', 'משקל בתיק')}</Typography>
                                    </Box>
                                </Box>
                                <Divider sx={{ mb: 2 }} />

                                <Stack spacing={1.5} sx={{ flex: 1, overflowY: 'auto' }}>
                                    {holdingsWeights.map((w) => (
                                        <Box key={w.portfolioId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden', mr: 1 }}>
                                                <Link
                                                    component="button"
                                                    variant="body2"
                                                    underline="hover"
                                                    onClick={() => onPortfolioClick(w.portfolioId)}
                                                    sx={{ fontWeight: '600', textAlign: 'left', color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                >
                                                    {w.portfolioName}
                                                </Link>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                                <Typography variant="body2" sx={{ minWidth: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatValue(w.value, displayCurrency)}
                                                </Typography>
                                                <Box sx={{ minWidth: 110, textAlign: 'right' }}>
                                                    <Typography variant="body2" fontWeight="bold" color="text.primary">
                                                        {formatPercent(w.weightInPortfolio)}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Box>
                                    ))}
                                </Stack>
                                <Divider sx={{ my: 2 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
                                    <Typography variant="body2" fontWeight="bold">{t('All portfolios', 'כל התיקים')}</Typography>
                                    <Typography variant="body2" fontWeight="bold" color="primary.main">{formatPercent(totalGlobalWeight)}</Typography>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                    </>
                  )}
                </Box>
            )}

            {/* SECTION: TRANSACTIONS */}
            {section === 'transactions' && (
                <Box>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Transaction History', 'היסטוריית עסקאות')}</Typography>
                    <Paper variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Action', 'פעולה')}</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper', maxWidth: 100 }}>{t('Portfolio', 'תיק')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Price', 'מחיר')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Value', 'שווי')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Fees', 'עמלות')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {txnHistory.map((txn, i) => {
                                    const rawValue = (txn.qty || 0) * (txn.price || 0);
                                    const fees = txn.commission || 0;
                                    const tickerCurrency = txn.currency || 'USD';
                                    
                                    return (
                                        <TableRow key={i} hover>
                                            <TableCell>{formatDate(txn.date)}</TableCell>
                                            <TableCell>
                                                <Typography 
                                                    variant="caption" 
                                                    fontWeight="bold"
                                                    sx={{ color: txn.type === 'BUY' ? 'primary.main' : txn.type === 'SELL' ? 'secondary.main' : 'text.secondary' }}
                                                >
                                                    {t(txn.type, txn.type)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                <Tooltip title={portfolioName} enterTouchDelay={0} leaveTouchDelay={3000}>
                                                    <span>{portfolioName}</span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell align="right">{formatNumber(txn.qty)}</TableCell>
                                            <TableCell align="right">{formatPrice(txn.price || 0, tickerCurrency)}</TableCell>
                                            <TableCell align="right">{formatValue(rawValue, tickerCurrency)}</TableCell>
                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>{fees > 0 ? formatValue(fees, tickerCurrency) : '-'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {txnHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No transactions found.', 'לא נמצאו עסקאות.')}</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Paper>
                </Box>
            )}

            {/* SECTION: DIVIDENDS */}
            {section === 'dividends' && (
                <Box>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Dividends Received', 'דיבידנדים שהתקבלו')}</Typography>
                    <Paper variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Per Share', 'למניה')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Held Qty', 'כמות מוחזקת')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Total Payout', 'תשלום כולל')}</TableCell>
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}>{t('Manual', 'ידני')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {divHistory.map((div, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell>{formatDate(div.date)}</TableCell>
                                        <TableCell align="right">{formatPrice(div.amount, stockCurrency)}</TableCell>
                                        <TableCell align="right">{formatNumber(div.heldQty)}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                            {formatValue(div.totalValue, stockCurrency)}
                                        </TableCell>
                                        <TableCell align="center">
                                            {div.source && div.source.toUpperCase().includes('MANUAL') && (
                                                <Tooltip title={t('Manually entered', 'הוזן ידנית')} arrow placement="top">
                                                    <EditIcon fontSize="small" color="action" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {divHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No dividend history recorded.', 'לא נמצאה היסטוריית דיבידנדים.')}</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Paper>
                </Box>
            )}
        </Box>
    );
}