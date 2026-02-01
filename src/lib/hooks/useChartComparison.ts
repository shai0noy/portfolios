import { useState, useCallback } from 'react';
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
    { ticker: 'TA35', exchange: Exchange.TASE, name: 'Tel Aviv 35' },
    { ticker: '137', exchange: Exchange.TASE, name: 'Tel Aviv 125' },
    { ticker: '120010', exchange: Exchange.CBS, name: 'Israel Consumer Price Index'},
    { ticker: 'GC=F', exchange: Exchange.NYSE, name: 'Gold Futures'}
];

export const EXTRA_COLORS = [
    '#5E9EFF', '#FF922B', '#69DB7C', '#B197FC', '#FF6B6B', '#3BC9DB', '#FCC419', '#F06595', '#20C997', '#94D82D',
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

export function useChartComparison() {
    const [chartRange, setChartRange] = useState('1Y');
    const [comparisonSeries, setComparisonSeries] = useState<ChartSeries[]>([]);
    const [comparisonOptions, setComparisonOptions] = useState<ComparisonOption[]>(INITIAL_COMPARISON_OPTIONS);
    const [comparisonLoading, setComparisonLoading] = useState<Record<string, boolean>>({});
    const [isSearchOpen, setIsSearchOpen] = useState(false);

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
                setComparisonSeries(prev => [...prev, {
                    name: option.name,
                    data: historyResponse.historical!,
                    color: EXTRA_COLORS[prev.length % EXTRA_COLORS.length]
                }]);
            }
        } catch (e) {
            console.error(`Failed to fetch comparison ticker ${option.name}`, e);
        } finally {
            setComparisonLoading(prev => ({ ...prev, [option.name]: false }));
        }
    }, [comparisonSeries, comparisonOptions]);

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
            startDate.setHours(0, 0, 0, 0);

            switch (range) {
                case '1M': startDate.setMonth(now.getMonth() - 1); break;
                case '3M': startDate.setMonth(now.getMonth() - 3); break;
                case '6M': startDate.setMonth(now.getMonth() - 6); break;
                case 'YTD': startDate.setFullYear(now.getFullYear(), 0, 1); break;
                case '1Y': startDate.setFullYear(now.getFullYear() - 1); break;
                case '3Y': startDate.setFullYear(now.getFullYear() - 3); break;
                case '5Y': startDate.setFullYear(now.getFullYear() - 5); break;
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
