import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from '@mui/material';
import { Exchange } from '../types';
import { fetchTickerHistory } from '../fetching';
import type { ChartSeries } from '../../components/TickerChart';

export const SEARCH_OPTION_TICKER = 'SEARCH_ACTION';

export interface ComparisonOption {
    ticker: string;
    exchange: Exchange;
    name: string;
    icon?: string;
}

export const INITIAL_COMPARISON_OPTIONS: ComparisonOption[] = [
    { ticker: SEARCH_OPTION_TICKER, exchange: Exchange.NYSE, name: 'Search...', icon: 'search' },
    { ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500' },
    { ticker: '^NDX', exchange: Exchange.NASDAQ, name: 'NASDAQ 100' },
    { ticker: '^MID', exchange: Exchange.NYSE, name: 'S&P 400 (Midcap)' },
    { ticker: '^RUT', exchange: Exchange.NYSE, name: 'Russell 2000' },
    { ticker: 'ZB=F', exchange: Exchange.NYSE, name: 'US Treasury Bond Futures' },
    { ticker: 'TA35', exchange: Exchange.TASE, name: 'Tel Aviv 35' },
    { ticker: '137', exchange: Exchange.TASE, name: 'Tel Aviv 125' },
    { ticker: 'TCH-F91', exchange: Exchange.TASE, name: 'Tel Gov Makam' },
    { ticker: '120010', exchange: Exchange.CBS, name: 'Israel Consumer Price Index'},
    { ticker: 'GC=F', exchange: Exchange.NYSE, name: 'Gold Futures'},
    { ticker: 'ILS=X', exchange: Exchange.FOREX, name: 'USD/ILS' },
    { ticker: 'ILSUSD=X', exchange: Exchange.NYSE, name: 'ILS/USD' },
];

export const DARK_COLORS = [
    '#5E9EFF',
    '#FF922B',
    '#69DB7C',
    '#B197FC',
    '#FF6B6B',
    '#3BC9DB',
    '#FCC419',
    '#F06595',
    '#20C997',
    '#94D82D',
];

export const LIGHT_COLORS = [
    '#1864AB',
    '#D9480F',
    '#2B8A3E',
    '#5F3DC4',
    '#C92A2A',
    '#0B7285',
    '#E67700',
    '#A61E4D',
    '#087F5B',
    '#364FC7',
];

export const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'];

export function getAvailableRanges(startDate: Date | undefined): string[] {
    if (!startDate) return ['ALL'];
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const diffMonths = diffDays / 30;
    const diffYears = diffDays / 365;

    const ranges: string[] = [];
    if (diffMonths >= 1) ranges.push('1M');
    if (diffMonths >= 3) ranges.push('3M');
    if (diffMonths >= 6) ranges.push('6M');
    if (startDate.getFullYear() < now.getFullYear()) ranges.push('YTD');
    if (diffYears >= 1) ranges.push('1Y');
    if (diffYears >= 3) ranges.push('3Y');
    if (diffYears >= 5) ranges.push('5Y');
    ranges.push('ALL');
    return ranges;
}

export function getMaxLabel(startDate: Date | undefined): string {
    if (!startDate) return 'Max';
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - startDate.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
    
    if (diffYears >= 1) return `Max (${diffYears.toFixed(1)}Y)`;
    
    const diffMonths = diffYears * 12;
    if (diffMonths >= 1) return `Max (${diffMonths.toFixed(1)}M)`;
    
    const diffDays = diffYears * 365;
    return `Max (${Math.ceil(diffDays)}D)`;
}

export function useChartComparison() {
    const theme = useTheme();
    const [chartRange, setChartRange] = useState('1Y');
    const [comparisonSeries, setComparisonSeries] = useState<ChartSeries[]>([]);
    const [comparisonOptions, setComparisonOptions] = useState<ComparisonOption[]>(INITIAL_COMPARISON_OPTIONS);
    const [comparisonLoading, setComparisonLoading] = useState<Record<string, boolean>>({});
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const extraColors = useMemo(() => {
        return theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    }, [theme.palette.mode]);

    useEffect(() => {
        setComparisonSeries(prev => prev.map(s => {
            if (!s.color) return s;
            const isDark = theme.palette.mode === 'dark';
            const sourcePalette = isDark ? LIGHT_COLORS : DARK_COLORS;
            const targetPalette = isDark ? DARK_COLORS : LIGHT_COLORS;
            
            const idx = sourcePalette.indexOf(s.color);
            if (idx !== -1) {
                return { ...s, color: targetPalette[idx] };
            }
            return s;
        }));
    }, [theme.palette.mode]);

    const handleSelectComparison = useCallback(async (option: ComparisonOption) => {
        if (option.ticker === SEARCH_OPTION_TICKER) {
            setIsSearchOpen(true);
            return;
        }

        if (comparisonSeries.some(s => s.name === option.name)) return;

        // Add to comparison options if it's not already there
        if (!comparisonOptions.some(o => o.ticker === option.ticker && o.exchange === option.exchange)) {
            // Insert after the "Search..." option
            setComparisonOptions(prev => {
                const searchIndex = prev.findIndex(o => o.ticker === SEARCH_OPTION_TICKER);
                const newOptions = [...prev];
                const insertionIndex = searchIndex !== -1 ? searchIndex + 1 : 1;
                newOptions.splice(insertionIndex, 0, option);
                return newOptions;
            });
        }
        
        setComparisonLoading(prev => ({ ...prev, [option.name]: true }));
        try {
            const historyResponse = await fetchTickerHistory(option.ticker, option.exchange);
            if (historyResponse?.historical) {
                setComparisonSeries(prev => {
                    const usedColors = new Set(prev.map(s => s.color));
                    const nextColor = extraColors.find(c => !usedColors.has(c)) || extraColors[prev.length % extraColors.length];

                    return [...prev, {
                        name: option.name,
                        data: historyResponse.historical!,
                        color: nextColor
                    }];
                });
            }
        } catch (e) {
            console.error(`Failed to fetch comparison ticker ${option.name}`, e);
        } finally {
            setComparisonLoading(prev => ({ ...prev, [option.name]: false }));
        }
    }, [comparisonSeries, comparisonOptions, extraColors]);

    const handleRemoveComparison = useCallback((name: string) => {
        setComparisonSeries(prev => prev.filter(s => s.name !== name));
    }, []);

    const getClampedData = useCallback((data: any[] | null, range: string, minDate?: Date) => {
        if (!data) return [];
        
        let startDate: Date;
        const now = new Date();

        if (range === 'ALL') {
            if (!minDate) return data;
            startDate = new Date(minDate);
        } else {
            startDate = new Date();
            startDate.setUTCHours(0, 0, 0, 0);

            switch (range) {
                case '1M': startDate.setUTCMonth(now.getUTCMonth() - 1); break;
                case '3M': startDate.setUTCMonth(now.getUTCMonth() - 3); break;
                case '6M': startDate.setUTCMonth(now.getUTCMonth() - 6); break;
                case 'YTD': startDate.setUTCFullYear(now.getUTCFullYear(), 0, 1); break;
                case '1Y': startDate.setUTCFullYear(now.getUTCFullYear() - 1); break;
                case '3Y': startDate.setUTCFullYear(now.getUTCFullYear() - 3); break;
                case '5Y': startDate.setUTCFullYear(now.getUTCFullYear() - 5); break;
                default: return data;
            }
        }
        
        return data.filter(d => d.date.getTime() >= startDate.getTime());
    }, []);

    return {
        chartRange,
        setChartRange,
        comparisonSeries,
        setComparisonSeries, // Exposed in case manual manipulation needed
        comparisonOptions,
        comparisonLoading,
        handleSelectComparison,
        handleRemoveComparison,
        getClampedData,
        isSearchOpen,
        setIsSearchOpen
    };
}
