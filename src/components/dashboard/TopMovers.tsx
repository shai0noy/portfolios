import { Box, Typography, Paper, Tooltip, ToggleButtonGroup, ToggleButton, alpha } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useLanguage } from '../../lib/i18n';
import { formatMoneyValue, normalizeCurrency, formatPercent } from '../../lib/currencyUtils';
import { type ExchangeRates, type DashboardHolding } from '../../lib/types';
import { calculateTopMovers, type Mover, type TimePeriod } from '../../lib/dashboard_movers';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Renders a single mover card.
 */
const MoverItem = ({ mover, navigate, displayCurrency }: { mover: Mover, navigate: any, displayCurrency: string }) => {
    const isPositive = mover.change >= 0;
    const color = isPositive ? 'success.main' : 'error.main';

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
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                <Tooltip title={mover.name} enterTouchDelay={0} leaveTouchDelay={3000}>
                    <Typography variant="body2" fontWeight="bold" noWrap sx={{ maxWidth: 80 }}>
                        {mover.ticker}
                    </Typography>
                </Tooltip>
                {isPositive ?
                    <TrendingUpIcon fontSize="small" color="success" sx={{ opacity: 0.8, fontSize: '1rem' }} /> :
                    <TrendingDownIcon fontSize="small" color="error" sx={{ opacity: 0.8, fontSize: '1rem' }} />
                }
            </Box>

            <Box display="flex" alignItems="baseline" justifyContent="space-between">
                <Typography variant="body2" fontWeight="500" color={color}>
                    {formatMoneyValue({ amount: mover.change, currency: normalizeCurrency(displayCurrency) }, undefined)}
                </Typography>
                <Typography variant="caption" color={color} sx={{ fontWeight: 'bold', opacity: 0.9 }}>
                    {isPositive ? '+' : ''}{formatPercent(mover.pct)}
                </Typography>
            </Box>
        </Paper>
    );
};

interface TopMoversProps { 
    holdings: DashboardHolding[];
    displayCurrency: string;
    exchangeRates: ExchangeRates;
}

/**
 * Displays the top moving assets for 1D, 1W, and 1M periods.
 */
export const TopMovers = ({ holdings, displayCurrency, exchangeRates }: TopMoversProps) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [sortBy, setSortBy] = useState<'change' | 'pct'>('change');

    const allMovers = useMemo(() => {
        return calculateTopMovers(holdings, displayCurrency, exchangeRates);
    }, [holdings, displayCurrency, exchangeRates]);

    const periodLabels = {
        '1d': t('Daily', 'יומי'),
        '1w': t('Weekly', 'שבועי'),
        '1m': t('Monthly', 'חודשי')
    };

    const MoversRow = ({ period, isLast }: { period: TimePeriod, isLast: boolean }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', py: 0.25, borderBottom: isLast ? 'none' : '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', textTransform: 'uppercase', minWidth: 60, mr: 0.5 }}>{periodLabels[period]}</Typography>
            {allMovers[period].length === 0 ? (
                <Box sx={{ textAlign: 'left', color: 'text.secondary', pl: 1 }}>
                    <Typography variant="caption">{t('No significant movers.', 'אין תנודות משמעותיות.')}</Typography>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', overflowX: 'auto', py: 0.5, flex: 1 }}>
                    {allMovers[period].map(mover => (
                        <MoverItem 
                            key={`${mover.key}-${mover.holding.portfolioId}`} 
                            mover={mover} 
                            navigate={navigate} 
                            displayCurrency={displayCurrency} 
                        />
                    ))}
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ p: 0.5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5} px={0.5}>
                <Typography variant="subtitle2" color="text.secondary">{t('Top Movers', 'המניות הבולטות')}</Typography>
                <Box display="flex" alignItems="center">
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
                </Box>
            </Box>
            <Box>
                {(['1d', '1w', '1m'] as TimePeriod[]).map((period, index, arr) => (
                    <MoversRow key={period} period={period} isLast={index === arr.length - 1} />
                ))}
            </Box>
        </Box>
    );
};
