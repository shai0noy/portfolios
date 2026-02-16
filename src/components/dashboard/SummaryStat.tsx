import { Box, Typography, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { formatMoneyValue, normalizeCurrency, formatPercent } from '../../lib/currencyUtils';
import { type ReactNode } from 'react';

export interface StatProps {
    label: string;
    value: number;
    pct?: number;
    gainValue?: number;
    gainLabel?: string;
    color?: string;
    tooltip?: ReactNode;
    isMain?: boolean;
    size?: 'normal' | 'small';
    displayCurrency: string;
    showSign?: boolean;
}

/**
 * Displays a single statistic with a label, value, and optional percentage change.
 * Used in the Dashboard Summary to show metrics like AUM, Daily Change, etc.
 */
export const SummaryStat = ({ 
    label, 
    value, 
    pct, 
    gainValue, 
    gainLabel, 
    color, 
    tooltip, 
    isMain = false, 
    size = 'normal', 
    displayCurrency, 
    showSign = true 
}: StatProps) => {
    const isSmall = size === 'small';

    return (
        <Box textAlign="left" minWidth={isSmall ? 'auto' : 120}>
            <Box display="flex" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: isSmall ? '0.7rem' : '0.75rem' }}>{label}</Typography>
                {tooltip && (
                    <Tooltip title={tooltip} enterTouchDelay={0} leaveTouchDelay={3000}>
                        <InfoOutlinedIcon sx={{ fontSize: '0.9rem', ml: 0.5, color: 'text.secondary' }} />
                    </Tooltip>
                )}
            </Box>
            <Typography
                variant={isMain ? "h4" : (isSmall ? "body2" : "h6")}
                fontWeight={isMain ? "bold" : "medium"}
                color={color || 'text.primary'}
                lineHeight={isSmall ? 1.2 : undefined}
            >
                {formatMoneyValue({ amount: value, currency: normalizeCurrency(displayCurrency) }, undefined)}
            </Typography>
            {(pct !== undefined && !isNaN(pct)) && (
                <Typography
                    variant="caption"
                    color={color || 'text.secondary'}
                    sx={{ opacity: color ? 1 : 0.7, fontSize: isSmall ? '0.7rem' : '0.75rem' }}
                >
                    {gainValue !== undefined ? (
                        <>
                            {gainLabel && <span>{gainLabel}: </span>}
                            {formatMoneyValue({ amount: gainValue, currency: normalizeCurrency(displayCurrency) }, undefined)} ({showSign && pct > 0 ? '+' : ''}{formatPercent(pct)})
                        </>
                    ) : (
                        <>{showSign && pct > 0 ? '+' : ''}{formatPercent(pct)}</>
                    )}
                </Typography>
            )}
        </Box>
    );
};
