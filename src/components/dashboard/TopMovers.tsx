import { Box, Typography, Paper, Tooltip, ToggleButtonGroup, ToggleButton, alpha, useTheme, useMediaQuery, Tabs, Tab, List, ListItem, Divider } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useLanguage } from '../../lib/i18n';
import { formatMoneyValue, normalizeCurrency, formatPercent } from '../../lib/currencyUtils';
import { type ExchangeRates, type DashboardHolding } from '../../lib/types';
import { calculateTopMovers, type Mover, type TimePeriod } from '../../lib/dashboard_movers';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollShadows, ScrollShadows } from '../../lib/ui-utils';

/**
 * Renders a single mover card.
 */
const MoverItem = ({ mover, navigate, displayCurrency, sortBy }: { mover: Mover, navigate: any, displayCurrency: string, sortBy: 'change' | 'pct' }) => {
    const { isRtl } = useLanguage();
    const isPositive = mover.change >= 0;
    const color = isPositive ? 'success.main' : 'error.main';

    const potentialName = isRtl
        ? (mover.holding.nameHe || mover.holding.longName || mover.holding.displayName || mover.name)
        : (mover.holding.longName || mover.holding.displayName || mover.holding.nameHe || mover.name);
    const hasValidName = potentialName && potentialName !== mover.ticker;
    const nameNode = hasValidName ? potentialName : mover.ticker;
    const tickerNode = hasValidName ? mover.ticker : null;

    const tooltipTitle = potentialName || mover.ticker;

    const valueStr = formatMoneyValue({ amount: mover.change, currency: normalizeCurrency(displayCurrency) }, undefined, Math.abs(mover.change) >= 1000 ? 0 : 2);
    const pctStr = formatPercent(mover.pct, true);

    return (
        <Paper
            variant="outlined"
            onClick={() => navigate(`/ticker/${mover.exchange.toUpperCase()}/${mover.ticker}`, { state: { holding: mover.holding, from: '/dashboard' } })}
            sx={{
                px: 1.5, py: 0.75,
                mr: 1,
                minWidth: 140,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderColor: 'divider',
                '&:hover': {
                    borderColor: isPositive ? 'success.light' : 'error.light',
                    bgcolor: (theme) => alpha(theme.palette[isPositive ? 'success' : 'error'].main, 0.04),
                    transform: 'translateY(-1px)',
                    boxShadow: 1
                }
            }}
        >
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
                <Tooltip title={tooltipTitle} enterTouchDelay={0} leaveTouchDelay={3000} arrow>
                    <Box sx={{ maxWidth: '85%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" fontWeight="bold" noWrap>
                            {nameNode}
                        </Typography>
                        {tickerNode && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1, mt: 0.25 }} noWrap>
                                {tickerNode}
                            </Typography>
                        )}
                    </Box>
                </Tooltip>
                {isPositive ?
                    <TrendingUpIcon fontSize="small" color="success" sx={{ opacity: 0.8, fontSize: '1rem', mt: 0.25 }} /> :
                    <TrendingDownIcon fontSize="small" color="error" sx={{ opacity: 0.8, fontSize: '1rem', mt: 0.25 }} />
                }
            </Box>

            <Box display="flex" alignItems="baseline" justifyContent="space-between">
                {sortBy === 'pct' ? (
                    <>
                        <Typography variant="body2" fontWeight="bold" color={color}>
                            {pctStr}
                        </Typography>
                        <Typography variant="caption" color={color} sx={{ opacity: 0.9 }}>
                            {valueStr}
                        </Typography>
                    </>
                ) : (
                    <>
                        <Typography variant="body2" fontWeight="bold" color={color}>
                            {valueStr}
                        </Typography>
                        <Typography variant="caption" color={color} sx={{ opacity: 0.9 }}>
                            {pctStr}
                        </Typography>
                    </>
                )}
            </Box>
        </Paper>
    );
};

/**
 * Renders a single mover item for mobile lists.
 */
const MobileMoverListItem = ({ mover, navigate, displayCurrency, sortBy }: { mover: Mover, navigate: any, displayCurrency: string, sortBy: 'change' | 'pct' }) => {
    const { isRtl } = useLanguage();
    const isPositive = mover.change >= 0;
    const color = isPositive ? 'success.main' : 'error.main';

    const potentialName = isRtl
        ? (mover.holding.nameHe || mover.holding.longName || mover.holding.displayName || mover.name)
        : (mover.holding.longName || mover.holding.displayName || mover.holding.nameHe || mover.name);
    const hasValidName = potentialName && potentialName !== mover.ticker;
    const nameNode = hasValidName ? potentialName : mover.ticker;
    const tickerNode = hasValidName ? mover.ticker : null;

    const valueStr = formatMoneyValue({ amount: mover.change, currency: normalizeCurrency(displayCurrency) }, undefined, Math.abs(mover.change) >= 1000 ? 0 : 2);
    const pctStr = formatPercent(mover.pct, true);

    const primaryVal = sortBy === 'pct' ? pctStr : valueStr;
    const secondaryVal = sortBy === 'pct' ? valueStr : pctStr;

    return (
        <ListItem
            component="li"
            onClick={() => navigate(`/ticker/${mover.exchange.toUpperCase()}/${mover.ticker}`, { state: { holding: mover.holding, from: '/dashboard' } })}
            sx={{ px: 1, py: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        >
            <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', maxWidth: '60%', overflow: 'hidden' }}>
                    <Typography variant="body2" fontWeight="bold" noWrap>
                        {nameNode}
                    </Typography>
                    {tickerNode && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }} noWrap>
                            {tickerNode}
                        </Typography>
                    )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', textAlign: 'right' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <Typography variant="body2" fontWeight="bold" color={color}>
                            {primaryVal}
                        </Typography>
                        <Typography variant="caption" color={color} sx={{ opacity: 0.9 }}>
                            {secondaryVal}
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </ListItem>
    );
};

interface TopMoversProps { 
    holdings: DashboardHolding[];
    displayCurrency: string;
    exchangeRates: ExchangeRates;
    lockedMetric?: 'change' | 'pct';
}

/**
 * Displays the top moving assets for 1D, 1W, and 1M periods.
 */
export const TopMovers = ({ holdings, displayCurrency, exchangeRates, lockedMetric }: TopMoversProps) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [sortBy, setSortBy] = useState<'change' | 'pct'>(lockedMetric || 'change');
    const [mobileTab, setMobileTab] = useState<TimePeriod>('1d');
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { containerRef: mobileListRef, showTop: mobileShowTop, showBottom: mobileShowBottom } = useScrollShadows('vertical');

    // Sync state if lockedMetric changes
    useMemo(() => {
        if (lockedMetric) setSortBy(lockedMetric);
    }, [lockedMetric]);

    const allMovers = useMemo(() => {
        return calculateTopMovers(holdings, displayCurrency, exchangeRates, sortBy);
    }, [holdings, displayCurrency, exchangeRates, sortBy]);

    const periodLabels = {
        '1d': t('Daily', 'יומי'),
        '1w': t('Weekly', 'שבועי'),
        '1m': t('Monthly', 'חודשי')
    };

    const MoversRow = ({ period, isLast }: { period: TimePeriod, isLast: boolean }) => {
        const theme = useTheme();
        const { containerRef, showLeft, showRight } = useScrollShadows('horizontal');
        return (
        <Box sx={{ display: 'flex', alignItems: 'center', py: 0.25, borderBottom: isLast ? 'none' : '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', textTransform: 'uppercase', minWidth: 60, mr: 0.5 }}>{periodLabels[period]}</Typography>
            {allMovers[period].length === 0 ? (
                <Box sx={{ textAlign: 'left', color: 'text.secondary', pl: 1 }}>
                    <Typography variant="caption">{t('No significant movers.', 'אין תנודות משמעותיות.')}</Typography>
                </Box>
            ) : (
                        <Box sx={{ position: 'relative', flex: 1, display: 'flex', minWidth: 0 }}>
                            <Box
                                ref={containerRef}
                                sx={{
                                    display: 'flex',
                                    overflowX: 'auto',
                                    py: 0.5,
                                    flex: 1,
                                    // Hide scrollbar but keep functionality
                                    scrollbarWidth: 'none',
                                    '&::-webkit-scrollbar': { display: 'none' }
                                }}
                            >
                                {allMovers[period].map(mover => (
                                    <MoverItem
                                        key={`${mover.key}-${mover.holding.portfolioId}`}
                                        mover={mover}
                                        navigate={navigate}
                                        displayCurrency={displayCurrency}
                                        sortBy={sortBy}
                                    />
                                ))}
                            </Box>
                            <ScrollShadows left={showLeft} right={showRight} theme={theme} />
                </Box>
            )}
        </Box>
    );
    };

    return (
        <Box sx={{ p: 0.5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5} px={0.5} flexWrap="wrap">
                <Typography variant="h6" component="div" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>{t('Top Movers', 'המניות הבולטות')}</Typography>
                <Box display="flex" alignItems="center">
                    {!lockedMetric && (
                        <>
                            <Typography variant="caption" color="text.secondary" sx={{ mr: 1, display: { xs: 'none', sm: 'block' } }}>{t('Sort by:', 'מיין לפי:')}</Typography>
                            <ToggleButtonGroup
                                value={sortBy}
                                exclusive
                                size="small"
                                onChange={(_, newSortBy) => { if (newSortBy) setSortBy(newSortBy as 'change' | 'pct'); }}
                                aria-label="Sort by"
                            >
                                <ToggleButton value="change" sx={{ px: 1, fontSize: '0.7rem', textTransform: 'none' }} aria-label="Sort by value">{t('Value', 'ערך')}</ToggleButton>
                                <ToggleButton value="pct" sx={{ px: 1, fontSize: '0.7rem', textTransform: 'none' }} aria-label="Sort by percentage">{t('%', '%')}</ToggleButton>
                            </ToggleButtonGroup>
                        </>
                    )}
                </Box>
            </Box>
            <Box>
                {isMobile ? (
                    <Box>
                        <Tabs
                            value={mobileTab}
                            onChange={(_, newValue) => setMobileTab(newValue as TimePeriod)}
                            variant="fullWidth"
                            sx={{ minHeight: 36, mb: 0.5, '.MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 'bold', py: 0.5 } }}
                        >
                            <Tab value="1d" label={periodLabels['1d']} />
                            <Tab value="1w" label={periodLabels['1w']} />
                            <Tab value="1m" label={periodLabels['1m']} />
                        </Tabs>
                        <Box sx={{ position: 'relative' }}>
                            <List component="div" ref={mobileListRef} sx={{ pt: 0, pb: 0, maxHeight: 200, overflowY: 'auto' }}>
                                {allMovers[mobileTab].length === 0 ? (
                                    <Box sx={{ textAlign: 'center', py: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {t('No significant movers.', 'אין תנודות משמעותיות.')}
                                        </Typography>
                                    </Box>
                                ) : (
                                    allMovers[mobileTab].map((mover, index) => (
                                        <Box key={`${mover.key}-${mover.holding.portfolioId}`}>
                                            <MobileMoverListItem mover={mover} navigate={navigate} displayCurrency={displayCurrency} sortBy={sortBy} />
                                            {index < allMovers[mobileTab].length - 1 && <Divider component="li" sx={{ opacity: 0.5 }} />}
                                        </Box>
                                    ))
                                )}
                            </List>
                            <ScrollShadows top={mobileShowTop} bottom={mobileShowBottom} theme={theme} />
                        </Box>
                    </Box>
                ) : (
                    (['1d', '1w', '1m'] as TimePeriod[]).map((period, index, arr) => (
                        <MoversRow key={period} period={period} isLast={index === arr.length - 1} />
                    ))
                )}
            </Box>
        </Box>
    );
};
