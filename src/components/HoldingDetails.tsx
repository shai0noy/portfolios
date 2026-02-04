import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tooltip, Link, Stack, CircularProgress, IconButton } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import type { DashboardHolding, Transaction, ExchangeRates, Holding, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { useMemo, useState, useEffect } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import { fetchTransactions, fetchAllDividends } from '../lib/sheets';
import { useNavigate } from 'react-router-dom';

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
    const navigate = useNavigate();
    
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
            .filter(txn => txn.ticker === holding.ticker)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, holding]);

    const divHistory = useMemo(() => {
        // Reconstruct Qty History to calculate actual payouts and actions
        // We need to simulate the state of holdings (lots) over time across all portfolios
        
        const sortedTxns = [...txnHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const sortedDivs = [...dividends].filter(d => d.ticker === holding.ticker).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const payouts: any[] = [];
        
        // State: PortfolioID -> List of Lots { date, qty, vestDate }
        const portfolioLots: Record<string, { date: Date, qty: number, vestDate?: Date }[]> = {};
        
        // Initialize for known portfolios
        portfolios.forEach(p => portfolioLots[p.id] = []);

        // Merge and sort all events by date
        const events = [
            ...sortedTxns.map(t => ({ type: 'TXN' as const, date: new Date(t.date), data: t })),
            ...sortedDivs.map(d => ({ type: 'DIV' as const, date: new Date(d.date), data: d }))
        ].sort((a, b) => a.date.getTime() - b.date.getTime());

        for (const event of events) {
            if (event.type === 'TXN') {
                const t = event.data as Transaction;
                const pId = t.portfolioId;
                if (!portfolioLots[pId]) portfolioLots[pId] = [];

                if (t.type === 'BUY') {
                    portfolioLots[pId].push({
                        date: new Date(t.date),
                        qty: t.qty || 0,
                        vestDate: t.vestDate ? new Date(t.vestDate) : undefined
                    });
                } else if (t.type === 'SELL') {
                    let remaining = t.qty || 0;
                    // FIFO removal
                    while (remaining > 0 && portfolioLots[pId].length > 0) {
                        const lot = portfolioLots[pId][0];
                        if (lot.qty > remaining) {
                            lot.qty -= remaining;
                            remaining = 0;
                        } else {
                            remaining -= lot.qty;
                            portfolioLots[pId].shift(); // Remove exhausted lot
                        }
                    }
                }
            } else {
                // DIVIDEND
                const d = event.data;
                const divDate = event.date;
                let totalHeld = 0;
                const rawDetails: { action: 'Cashed' | 'Reinvested', amount: number }[] = [];

                for (const p of portfolios) {
                    const lots = portfolioLots[p.id] || [];
                    if (lots.length === 0) continue;

                    let vestedQty = 0;
                    let unvestedQty = 0;

                    for (const lot of lots) {
                        // Vested if no vestDate or vestDate <= divDate
                        if (!lot.vestDate || lot.vestDate <= divDate) {
                            vestedQty += lot.qty;
                        } else {
                            unvestedQty += lot.qty;
                        }
                    }

                    const totalPortQty = vestedQty + unvestedQty;
                    if (totalPortQty === 0) continue;
                    totalHeld += totalPortQty;

                    // Apply Policy
                    const policy = p.divPolicy || 'cash_taxed';
                    const amountPerShare = d.amount;
                    
                    let cashAmt = 0;
                    let reinvestAmt = 0;

                    if (policy === 'cash_taxed') {
                        cashAmt += totalPortQty * amountPerShare;
                    } else if (policy === 'accumulate_tax_free') {
                        reinvestAmt += totalPortQty * amountPerShare;
                    } else if (policy === 'hybrid_rsu') {
                        cashAmt += vestedQty * amountPerShare;
                        reinvestAmt += unvestedQty * amountPerShare;
                    }

                    if (cashAmt > 0.001) rawDetails.push({ action: 'Cashed', amount: cashAmt });
                    if (reinvestAmt > 0.001) rawDetails.push({ action: 'Reinvested', amount: reinvestAmt });
                }

                if (totalHeld > 0) {
                    // Aggregate details
                    const aggregatedDetails = rawDetails.reduce((acc, curr) => {
                        const existing = acc.find(x => x.action === curr.action);
                        if (existing) existing.amount += curr.amount;
                        else acc.push({ ...curr });
                        return acc;
                    }, [] as { action: 'Cashed' | 'Reinvested', amount: number }[]);

                    // Sort: Cashed first
                    aggregatedDetails.sort((a, b) => {
                        if (a.action === b.action) return 0;
                        return a.action === 'Cashed' ? -1 : 1;
                    });

                    payouts.push({
                        ...d,
                        heldQty: totalHeld,
                        totalValue: d.amount * totalHeld, // Total theoretical value
                        payoutDetails: aggregatedDetails
                    });
                }
            }
        }

        return payouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [dividends, txnHistory, holding, portfolios]);

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

    const portfolioNameMap = useMemo(() => {
        return portfolios.reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
        }, {} as Record<string, string>);
    }, [portfolios]);

    const handleEditTransaction = (txn: Transaction) => {
        navigate('/transaction', {
            state: {
                editTransaction: txn,
                initialName: enriched?.displayName || (holding as any).displayName,
                initialNameHe: enriched?.nameHe || (holding as any).nameHe
            }
        });
    };

    const handleEditDividend = (div: any) => {
        navigate('/transaction', {
            state: {
                editDividend: {
                    ticker: holding.ticker,
                    exchange: holding.exchange,
                    date: div.date,
                    amount: div.amount,
                    source: div.source,
                    rowIndex: div.rowIndex
                },
                initialName: enriched?.displayName || (holding as any).displayName,
                initialNameHe: enriched?.nameHe || (holding as any).nameHe
            }
        });
    };

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
                    
                    {(() => {
                        // Calculate unvested metrics
                        const hasGrants = layers.some(l => !!l.vestDate);
                        let unvestedVal = 0;
                        let unvestedGain = 0;
                        
                        if (hasGrants) {
                            const currentPrice = (holding as DashboardHolding).currentPrice || 0; // In Stock Major Unit
                            layers.forEach(l => {
                                if (l.vestDate && new Date(l.vestDate) > new Date()) {
                                    const qty = l.qty || 0;
                                    const layerVal = qty * currentPrice;
                                    const layerCost = qty * (l.price || 0);
                                    unvestedVal += layerVal;
                                    unvestedGain += (layerVal - layerCost);
                                }
                            });
                        }

                        // Convert to display currency
                        const unvestedValDisplay = convertCurrency(unvestedVal, stockCurrency, displayCurrency, exchangeRates || undefined);
                        const unvestedGainDisplay = convertCurrency(unvestedGain, stockCurrency, displayCurrency, exchangeRates || undefined);
                        const vestedValDisplay = hasGrants ? vals.marketValue - unvestedValDisplay : vals.marketValue;

                        return (
                            <>
                            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                                <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />} justifyContent="space-around" sx={{ mb: 2 }}>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>
                                            {t(hasGrants ? 'Vested Value' : 'Value', hasGrants ? 'שווי מובשל' : 'שווי')}
                                        </Typography>
                                        <Typography variant="h6" fontWeight="700">{formatValue(vestedValDisplay, displayCurrency)}</Typography>
                                    </Box>
                                    {hasGrants && (
                                        <Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Unvested Value', 'שווי לא מובשל')}</Typography>
                                            <Typography variant="h6" fontWeight="700">{formatValue(unvestedValDisplay, displayCurrency)}</Typography>
                                            <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={unvestedGain >= 0 ? 'success.main' : 'error.main'}>
                                                {formatValue(unvestedGainDisplay, displayCurrency)} {t('unvested gains', 'רווח לא מובשל')}
                                            </Typography>
                                        </Box>
                                    )}
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
                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting Date', 'תאריך הבשלה')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {layers.length === 0 && (
                                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No buy transactions found.', 'לא נמצאו עסקאות קנייה.')}</TableCell></TableRow>
                                                )}
                                                {layers.map((layer, i) => {
                                                    const vestDate = layer.vestDate ? new Date(layer.vestDate) : null;
                                                    const isVested = vestDate && vestDate <= new Date();
                                                    const vestColor = vestDate ? (isVested ? 'success.main' : 'text.secondary') : 'inherit';
                                                    
                                                    return (
                                                        <TableRow key={i}>
                                                            <TableCell>{formatDate(layer.date)}</TableCell>
                                                            <TableCell align="right">{formatNumber(layer.qty)}</TableCell>
                                                            <TableCell align="right">{formatPrice(layer.price || 0, layer.currency || 'USD')}</TableCell>
                                                            <TableCell align="right">{formatValue((layer.qty || 0) * (layer.price || 0), layer.currency || 'USD')}</TableCell>
                                                            <TableCell align="right" sx={{ color: vestColor, fontWeight: isVested ? 'bold' : 'normal' }}>
                                                                {vestDate ? formatDate(vestDate) : '-'}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
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
                                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', minWidth: 90, textAlign: 'right' }}>
                                                    {t(hasGrants ? 'Total Value' : 'Value', hasGrants ? 'שווי כולל' : 'שווי')}
                                                </Typography>
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
                        );
                    })()}
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
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {txnHistory.map((txn, i) => {
                                    const rawValue = (txn.qty || 0) * (txn.price || 0);
                                    const fees = txn.commission || 0;
                                    const tickerCurrency = txn.currency || 'USD';
                                    const isGrant = !!txn.vestDate;
                                    const actionLabel = isGrant ? t('Grant', 'הענקה') : t(txn.type, txn.type);
                                    const txnPortfolioName = portfolioNameMap[txn.portfolioId] || txn.portfolioId;
                                    
                                    return (
                                        <TableRow key={i} hover>
                                            <TableCell>{formatDate(txn.date)}</TableCell>
                                            <TableCell>
                                                <Typography 
                                                    variant="caption" 
                                                    fontWeight="bold"
                                                    sx={{ color: txn.type === 'BUY' ? 'primary.main' : txn.type === 'SELL' ? 'secondary.main' : 'text.secondary' }}
                                                >
                                                    {actionLabel}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                <Tooltip title={txnPortfolioName} enterTouchDelay={0} leaveTouchDelay={3000}>
                                                    <span>{txnPortfolioName}</span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell align="right">{formatNumber(txn.qty)}</TableCell>
                                            <TableCell align="right">{formatPrice(txn.price || 0, tickerCurrency)}</TableCell>
                                            <TableCell align="right">{formatValue(rawValue, tickerCurrency)}</TableCell>
                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>{fees > 0 ? formatValue(fees, tickerCurrency) : '-'}</TableCell>
                                            <TableCell align="center">
                                                <Tooltip title={t('Edit Transaction', 'ערוך עסקה')}>
                                                    <IconButton size="small" onClick={() => handleEditTransaction(txn)}>
                                                        <EditIcon fontSize="small" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {txnHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No transactions found.', 'לא נמצאו עסקאות.')}</TableCell></TableRow>
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
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {divHistory.map((div, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell>{formatDate(div.date)}</TableCell>
                                        <TableCell align="right">{formatPrice(div.amount, stockCurrency)}</TableCell>
                                        <TableCell align="right">{formatNumber(div.heldQty)}</TableCell>
                                        <TableCell align="right">
                                            {div.payoutDetails && div.payoutDetails.length > 0 ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                                                    {div.payoutDetails.map((detail: any, idx: number) => (
                                                        <Typography key={idx} variant="body2" sx={{ fontWeight: 'bold', color: detail.action === 'Cashed' ? 'success.main' : 'primary.main' }}>
                                                            {formatValue(detail.amount, stockCurrency)} 
                                                            <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary', fontWeight: 'normal' }}>
                                                                ({t(detail.action === 'Cashed' ? 'Cashed' : 'Reinvested', detail.action === 'Cashed' ? 'מזומן' : 'מושקע מחדש')})
                                                            </Typography>
                                                        </Typography>
                                                    ))}
                                                </Box>
                                            ) : (
                                                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                                    {formatValue(div.totalValue, stockCurrency)}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            {div.source && div.source.toUpperCase().includes('MANUAL') && (
                                                <Tooltip title={t('Manually entered. Click to edit.', 'הוזן ידנית. לחץ לעריכה.')} arrow placement="top">
                                                    <IconButton size="small" onClick={() => handleEditDividend(div)}>
                                                        <EditIcon fontSize="small" color="action" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                                                    </IconButton>
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