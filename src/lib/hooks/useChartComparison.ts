import { useState, useCallback } from 'react';
import { Exchange } from '../types';
import { fetchTickerHistory } from '../fetching';
import type { ChartSeries } from '../../components/TickerChart';

export const COMPARISON_OPTIONS = [
    { ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500' },
    { ticker: '^NDX', exchange: Exchange.NASDAQ, name: 'NASDAQ 100' },
    { ticker: 'TA35', exchange: Exchange.TASE, name: 'Tel Aviv 35' },
    { ticker: '137', exchange: Exchange.TASE, name: 'Tel Aviv 125' },
    { ticker: '120010', exchange: Exchange.CBS, name: 'Israel Consumer Price Index'}
];

export const EXTRA_COLORS = [
    '#5E9EFF', '#FF922B', '#69DB7C', '#B197FC', '#FF6B6B', '#3BC9DB', '#FCC419', '#F06595', '#20C997', '#94D82D',
];

export const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'];

export function useChartComparison() {
    const [chartRange, setChartRange] = useState('1Y');
    const [comparisonSeries, setComparisonSeries] = useState<ChartSeries[]>([]);
    const [comparisonLoading, setComparisonLoading] = useState<Record<string, boolean>>({});

    const handleSelectComparison = useCallback(async (option: typeof COMPARISON_OPTIONS[0]) => {
        if (comparisonSeries.some(s => s.name === option.name)) return;

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
    }, [comparisonSeries]);

    const handleRemoveComparison = useCallback((name: string) => {
        setComparisonSeries(prev => prev.filter(s => s.name !== name));
    }, []);

    const getClampedData = useCallback((data: any[] | null, range: string) => {
        if (!data) return [];
        if (range === 'ALL') return data;

        const now = new Date();
        const startDate = new Date();
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
        return data.filter(d => d.date.getTime() >= startDate.getTime());
    }, []);

    return {
        chartRange,
        setChartRange,
        comparisonSeries,
        setComparisonSeries, // Exposed in case manual manipulation needed
        comparisonLoading,
        handleSelectComparison,
        handleRemoveComparison,
        getClampedData
    };
}
