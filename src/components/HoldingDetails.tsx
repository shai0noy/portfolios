import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tabs, Tab, Tooltip, Link, Stack } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import type { DashboardHolding, Transaction, ExchangeRates, Holding } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { useMemo, useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';

export interface HoldingWeight {
    portfolioId: string;
    portfolioName: string;
    weightInPortfolio: number;
    weightInGlobal: number;
    value: number;
}

interface HoldingDetailsProps {
    holding: DashboardHolding | Holding;
    transactions: Transaction[];
    dividends: any[]; // From Dividends sheet
    displayCurrency: string;
    exchangeRates: ExchangeRates;
    holdingsWeights: HoldingWeight[];
    onPortfolioClick: (id: string) => void;
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

export function HoldingDetails({ holding, transactions, dividends, displayCurrency, exchangeRates, holdingsWeights, onPortfolioClick }: HoldingDetailsProps) {
    const { t } = useLanguage();
    const [tabValue, setTabValue] = useState(0);

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
        return convertCurrency(totalFeesPC, (holding as Holding).currency || stockCurrency, displayCurrency, exchangeRates);
    }, [totalFeesPC, holding, stockCurrency, displayCurrency, exchangeRates]);

    const totalGlobalWeight = useMemo(() => {
        return holdingsWeights.reduce((sum, w) => sum + w.weightInGlobal, 0);
    }, [holdingsWeights]);

    const portfolioName = enriched?.portfolioName || holdingsWeights.find(w => w.portfolioId === holding.portfolioId)?.portfolioName || '';

    return (
        <Box sx={{ mt: 2 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                    <Tab label={t('Overview', 'סקירה כללית')} />
                    <Tab label={t('Transactions', 'עסקאות')} />
                    {divHistory.length > 0 && <Tab label={t('Dividends', 'דיבידנדים')} />}
                </Tabs>
            </Box>

            {/* TAB 0: OVERVIEW */}
            {tabValue === 0 && (
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

            {/* TAB 1: TRANSACTIONS */}
            {tabValue === 1 && (
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

            {/* TAB 2: DIVIDENDS */}
            {tabValue === 2 && divHistory.length > 0 && (
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