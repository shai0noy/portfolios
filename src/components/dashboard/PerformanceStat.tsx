import { Box, Typography, CircularProgress } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import { getValueColor } from '../../lib/utils';
import { SummaryStat } from './SummaryStat';

export interface PerfStatProps {
    label: string;
    percentage?: number;
    gainValue?: number;
    isIncomplete?: boolean;
    isLoading?: boolean;
    aum: number;
    displayCurrency: string;
    size?: 'normal' | 'small';
}

/**
 * Displays a performance statistic (e.g., 1W, 1M return) with support for loading,
 * incomplete data indicators, and automatic color coding.
 */
export const PerformanceStat = ({ 
    label, 
    percentage, 
    gainValue, 
    isIncomplete, 
    isLoading, 
    aum, 
    displayCurrency, 
    size = 'normal' 
}: PerfStatProps) => {
    const { t } = useLanguage();

    if (isLoading) {
        return (
            <Box sx={{ p: size === 'small' ? 1 : 1.5, minWidth: size === 'small' ? 90 : 120 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                    {label}
                </Typography>
                <Box display="flex" justifyContent="flex-end">
                    <CircularProgress size={14} />
                </Box>
            </Box>
        );
    }

    const effectivePercentage = percentage || 0;

    // If percentage is undefined (and not loading), it implies no data
    if (percentage === undefined || isNaN(percentage)) {
        return <SummaryStat label={label} value={0} pct={0} displayCurrency={displayCurrency} size={size} />;
    }

    let absoluteChange = 0;
    if (gainValue !== undefined) {
        absoluteChange = gainValue;
    } else {
        // Fallback to TWR derivation (only if gainValue not provided)
        const previousAUM = aum / (1 + effectivePercentage);
        absoluteChange = aum - previousAUM;
    }

    const color = getValueColor(effectivePercentage);

    return (
        <SummaryStat 
            label={label} 
            value={absoluteChange} 
            pct={effectivePercentage} 
            color={color} 
            tooltip={isIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined} 
            displayCurrency={displayCurrency} 
            size={size} 
        />
    );
}
