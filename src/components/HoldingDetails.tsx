import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tooltip, Link, Stack, CircularProgress, IconButton } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import type { DashboardHolding, Transaction, ExchangeRates, Holding, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { UnifiedHolding, EnrichedTransaction, EnrichedDividend } from '../lib/data/model';
import { useMemo, useState, useEffect } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';

export type HoldingSection = 'holdings' | 'transactions' | 'dividends';

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
    holdings?: UnifiedHolding[];
    displayCurrency: string;
    portfolios: Portfolio[];
    onPortfolioClick: (id: string) => void;
    section?: HoldingSection;
}

const formatDate = (dateInput: string | Date | number) => {
    if (!dateInput) return '';
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        const [y, m, d] = dateInput.split('-');
        return `${d}/${m}/${y}`;
    }
    const date = new Date(dateInput);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

export function HoldingDetails({ sheetId, holding, holdings, displayCurrency, portfolios, onPortfolioClick, section = 'holdings' }: HoldingDetailsProps) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    
    const transactions = useMemo(() => {
        if (holdings && holdings.length > 0) {
            return holdings.flatMap(h => h.transactions || []);
        }
        const unified = holding as unknown as UnifiedHolding;
        return unified.transactions || [];
    }, [holding, holdings]);

    const dividends = useMemo(() => {
        if (holdings && holdings.length > 0) {
            return holdings.flatMap(h => h.dividends || []);
        }
        const unified = holding as unknown as UnifiedHolding;
        return unified.dividends || [];
    }, [holding, holdings]);
    
    const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        getExchangeRates(sheetId)
            .then(rates => { setExchangeRates(rates); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
    }, [sheetId]);

    // Calculate Weights across all portfolios
    const holdingsWeights = useMemo(() => {
        if (!portfolios || portfolios.length === 0 || !exchangeRates) return [];
        
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
          const h = p.holdings?.find(h => h.ticker === holding.ticker && (h.exchange === (holding as any).exchange || !h.exchange));
          
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

    const enriched = (holding as any).display ? (holding as EnrichedDashboardHolding) : null;
    
    const vals = useMemo(() => {
        if (enriched?.display) return enriched.display;
        
        const u = holding as unknown as UnifiedHolding;
        if (typeof u.marketValueVested !== 'number' || !exchangeRates) return undefined;

        const dc = normalizeCurrency(displayCurrency || 'USD');
        const pc = u.portfolioCurrency;
        
        const marketValue = convertCurrency(u.marketValueVested, pc, dc, exchangeRates);
        const unrealizedGain = convertCurrency(u.unrealizedGainVested, pc, dc, exchangeRates);
        const realizedGain = convertCurrency(u.realizedGainPortfolioCurrency, pc, dc, exchangeRates);
        const dividends = convertCurrency(u.dividendsPortfolioCurrency, pc, dc, exchangeRates);
        const costOfSold = convertCurrency(u.costOfSoldPortfolioCurrency, pc, dc, exchangeRates);
        const costBasis = convertCurrency(u.costBasisVestedPortfolioCurrency, pc, dc, exchangeRates);
        
        const realizedTaxDisplay = convertCurrency(u.realizedTaxLiabilityILS, 'ILS', dc, exchangeRates);
        const unrealizedTaxDisplay = convertCurrency(u.unrealizedTaxLiabilityILS, 'ILS', dc, exchangeRates);

        const totalGain = unrealizedGain + realizedGain + dividends;
        const realizedGainAfterTax = (realizedGain + dividends) - realizedTaxDisplay;
        const valueAfterTax = marketValue - unrealizedTaxDisplay;
        
        return {
            marketValue,
            unrealizedGain,
            unrealizedGainPct: costBasis > 0 ? unrealizedGain / costBasis : 0,
            realizedGain,
            realizedGainPct: costOfSold > 0 ? realizedGain / costOfSold : 0,
            realizedGainAfterTax,
            totalGain,
            totalGainPct: (costBasis + costOfSold) > 0 ? totalGain / (costBasis + costOfSold) : 0,
            valueAfterTax,
            dayChangeVal: 0,
            dayChangePct: u.dayChangePct,
            costBasis,
            costOfSold,
            proceeds: convertCurrency(u.proceedsPortfolioCurrency, pc, dc, exchangeRates),
            dividends,
            currentPrice: convertCurrency(u.currentPrice, u.stockCurrency, dc, exchangeRates),
            avgCost: convertCurrency(u.avgCost, pc, dc, exchangeRates),
            weightInPortfolio: 0,
            weightInGlobal: 0,
            unvestedValue: convertCurrency(u.marketValueUnvested, pc, dc, exchangeRates)
        };
    }, [holding, enriched, exchangeRates, displayCurrency]);

    // Transactions are already filtered for this holding in UnifiedHolding
    const txnHistory = useMemo(() => {
        return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions]);

    const divHistory = useMemo(() => {
        return dividends.map(d => {
            const ed = d as EnrichedDividend;
            const p = portfolios.find(p => p.id === holding.portfolioId);
            const policy = p?.divPolicy || 'cash_taxed';
            const isReinvest = policy === 'accumulate_tax_free'; 

            const details: { action: 'Cashed' | 'Reinvested', amount: number }[] = [];
            if (ed.grossAmountSC > 0) {
                details.push({
                    action: isReinvest ? 'Reinvested' : 'Cashed',
                    amount: ed.grossAmountSC
                });
            }

            return {
                date: new Date(ed.date),
                amount: ed.amount,
                heldQty: ed.amount > 0 ? ed.grossAmountSC / ed.amount : 0,
                totalValue: ed.grossAmountSC,
                payoutDetails: details,
                source: (ed as any).source,
                rowIndex: (ed as any).rowIndex
            };
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [dividends, holding, portfolios]);

    const layers = useMemo(() => {
        return txnHistory.filter(txn => txn.type === 'BUY');
    }, [txnHistory]);

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
            {/* SECTION: HOLDINGS */}
            {section === 'holdings' && (
                <Box>
                  {!vals ? (
                     <Box sx={{ p: 2, textAlign: 'center' }}>
                         <Typography color="text.secondary">{t('Calculating holding details...', 'מחשב פרטי החזקה...')}</Typography>
                     </Box>
                  ) : (
                    <>
                    <Typography variant="h6" gutterBottom color="primary" sx={{ fontWeight: 'bold' }}>
                        {t('My Position', 'הפוזיציה שלי')}
                    </Typography>
                    
                    {(() => {
                        const hasGrants = layers.some(l => !!l.vestDate);
                        let unvestedVal = 0;
                        let unvestedGain = 0;
                        
                        if (hasGrants) {
                            const currentPrice = (holding as DashboardHolding).currentPrice || 0;
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

                        const unvestedValDisplay = convertCurrency(unvestedVal, stockCurrency, displayCurrency, exchangeRates || undefined);
                        const unvestedGainDisplay = convertCurrency(unvestedGain, stockCurrency, displayCurrency, exchangeRates || undefined);
                        const vestedValDisplay = hasGrants ? vals.marketValue - unvestedValDisplay : vals.marketValue;

                        return (
                            <>
                            <Paper variant="outlined" sx={{ p: 2, mb: 6 }}>
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

                            <Grid container spacing={3} sx={{ mb: 3 }}>
                                <Grid item xs={12} md={5}>
                                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Portfolio Distribution', 'התפלגות בתיקים')}</Typography>
                                    <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
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

                                <Grid item xs={12} md={7}>
                                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Buy Layers', 'שכבות רכישה')}</Typography>
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
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Gain', 'רווח')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Net Gain', 'רווח נטו')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Tax', 'מס')}</TableCell>
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {txnHistory.map((txn, i) => {
                                    const enriched = txn as EnrichedTransaction;
                                    const rawValue = (txn.qty || 0) * (txn.price || 0);
                                    const fees = txn.commission || 0;
                                    const tickerCurrency = txn.currency || 'USD';
                                    
                                    const p = portfolios.find(p => p.id === txn.portfolioId);
                                    const txnPortfolioCurrency = normalizeCurrency(p?.currency || (holding as any).portfolioCurrency || 'USD');
                                    
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
                                            <TableCell align="right" sx={{ color: enriched.realizedGainPC > 0 ? 'success.main' : enriched.realizedGainPC < 0 ? 'error.main' : 'text.secondary' }}>
                                                {txn.type === 'SELL' ? formatValue(enriched.realizedGainPC, txnPortfolioCurrency) : '-'}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold', color: (enriched.realizedGainPC - enriched.feePC) > 0 ? 'success.main' : 'inherit' }}>
                                                {txn.type === 'SELL' ? formatValue(enriched.realizedGainPC - enriched.feePC, txnPortfolioCurrency) : '-'}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                                                {enriched.taxLiabilityILS ? formatValue(enriched.taxLiabilityILS, 'ILS') : '-'}
                                            </TableCell>
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
                                    <TableRow><TableCell colSpan={11} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No transactions found.', 'לא נמצאו עסקאות.')}</TableCell></TableRow>
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