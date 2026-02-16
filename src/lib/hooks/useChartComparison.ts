import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from '@mui/material';
import { Exchange } from '../types';
import { fetchTickerHistory } from '../fetching';
import type { ChartSeries } from '../../components/TickerChart';

export const SEARCH_OPTION_TICKER = 'SEARCH_ACTION';

export type ComparisonType = 'TICKER' | 'PORTFOLIO';

export interface ComparisonOption {
    type: ComparisonType;
    ticker: string; // Used as ID for Portfolios
    exchange: Exchange | 'PORTFOLIO';
    name: string;
    icon?: string;
    group?: string;
}

export const INITIAL_COMPARISON_OPTIONS: ComparisonOption[] = [
    { type: 'TICKER', ticker: SEARCH_OPTION_TICKER, exchange: Exchange.NYSE, name: 'Search...', icon: 'search', group: 'Actions' },

    // Equity Indices
    { type: 'TICKER', ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500', group: 'Indices' },
    { type: 'TICKER', ticker: '^NDX', exchange: Exchange.NASDAQ, name: 'NASDAQ 100', group: 'Indices' },
    { type: 'TICKER', ticker: '^MID', exchange: Exchange.NYSE, name: 'S&P 400 (Midcap)', group: 'Indices' },
    { type: 'TICKER', ticker: '^RUT', exchange: Exchange.NYSE, name: 'Russell 2000', group: 'Indices' },
    { type: 'TICKER', ticker: 'TA35', exchange: Exchange.TASE, name: 'Tel Aviv 35', group: 'Indices' },
    { type: 'TICKER', ticker: '137', exchange: Exchange.TASE, name: 'Tel Aviv 125', group: 'Indices' },
    { type: 'TICKER', ticker: 'GC=F', exchange: Exchange.NYSE, name: 'Gold Futures', group: 'Indices' },

    // Macro
    { type: 'TICKER', ticker: 'TCH-F91', exchange: Exchange.TASE, name: 'Tel Gov Makam', group: 'Macro' },
    { type: 'TICKER', ticker: 'ZB=F', exchange: Exchange.NYSE, name: 'US Treasury Bond Futures', group: 'Macro' },
    { type: 'TICKER', ticker: '120010', exchange: Exchange.CBS, name: 'Israel Consumer Price Index', group: 'Macro' },

    // Currencies
    { type: 'TICKER', ticker: 'ILS=X', exchange: Exchange.FOREX, name: 'USD/ILS', group: 'Currencies' },
    { type: 'TICKER', ticker: 'ILSUSD=X', exchange: Exchange.NYSE, name: 'ILS/USD', group: 'Currencies' },
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

interface UseChartComparisonProps {
    portfolios?: { id: string; name: string }[];
    getPortfolioHistory?: (portfolioId: string | null) => Promise<{ date: Date; price: number }[]>;
}

export function useChartComparison({ portfolios, getPortfolioHistory }: UseChartComparisonProps = {}) {
    const theme = useTheme();
    const [chartRange, setChartRange] = useState('1Y');
    const [comparisonSeries, setComparisonSeries] = useState<ChartSeries[]>([]);
    const [comparisonOptions, setComparisonOptions] = useState<ComparisonOption[]>(() => {
        // Initialize with default options
        const options = [...INITIAL_COMPARISON_OPTIONS];

        // Add Portfolios if provided
        if (portfolios && portfolios.length > 0) {
            // Add separator or header conceptually (UI handles rendering)
            // Add 'All Portfolios' option
            options.push({
                type: 'PORTFOLIO',
                ticker: 'ALL_PORTFOLIOS',
                exchange: 'PORTFOLIO',
                name: 'All Portfolios (TWR)',
                icon: 'pie_chart',
                group: 'Portfolios'
            });

            // Add individual portfolios
            portfolios.forEach(p => {
                options.push({
                    type: 'PORTFOLIO',
                    ticker: p.id, // Use ID as ticker
                    exchange: 'PORTFOLIO',
                    name: `${p.name} (TWR)`,
                    icon: 'business_center',
                    group: 'Portfolios'
                });
            });
        }

        return options;
    });

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

    useEffect(() => {
        if (!portfolios || portfolios.length === 0) return;

        setComparisonOptions(prev => {
            // Remove existing portfolio options to avoid duplicates/stale data
            const nonPortfolioOptions = prev.filter(o => o.group !== 'Portfolios');

            const newPortfolioOptions: ComparisonOption[] = [];

            // Add 'All Portfolios' option
            newPortfolioOptions.push({
                type: 'PORTFOLIO',
                ticker: 'ALL_PORTFOLIOS',
                exchange: 'PORTFOLIO',
                name: 'All Portfolios (TWR)',
                icon: 'pie_chart',
                group: 'Portfolios'
            });

            // Add individual portfolios
            portfolios.forEach(p => {
                newPortfolioOptions.push({
                    type: 'PORTFOLIO',
                    ticker: p.id,
                    exchange: 'PORTFOLIO',
                    name: `${p.name} (TWR)`,
                    icon: 'business_center',
                    group: 'Portfolios'
                });
            });

            // Combine: Maintain order (Non-Portfolios first, then Portfolios)
            // Or should we preserve specific placement?
            // The initial options + search are at the top. Portfolios at the bottom is fine.
            return [...nonPortfolioOptions, ...newPortfolioOptions];
        });
    }, [portfolios]);

    const handleSelectComparison = useCallback(async (option: ComparisonOption) => {
        if (option.ticker === SEARCH_OPTION_TICKER) {
            setIsSearchOpen(true);
            return;
        }

        if (comparisonSeries.some(s => s.name === option.name)) return;

        // Add to comparison options if it's not already there (for search results)
        if (!comparisonOptions.some(o => o.ticker === option.ticker && o.exchange === option.exchange)) {
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
            let data: { date: Date, price: number }[] | undefined;

            if (option.type === 'PORTFOLIO') {
                if (getPortfolioHistory) {
                    const portfolioId = option.ticker === 'ALL_PORTFOLIOS' ? null : option.ticker;
                    data = await getPortfolioHistory(portfolioId);
                } else {
                    console.error("getPortfolioHistory not provided");
                }
            } else {
                // Regular Ticker
                const historyResponse = await fetchTickerHistory(option.ticker, option.exchange as Exchange);
                data = historyResponse?.historical;
            }

            if (data && data.length > 0) {
                setComparisonSeries(prev => {
                    const usedColors = new Set(prev.map(s => s.color));
                    const nextColor = extraColors.find(c => !usedColors.has(c)) || extraColors[prev.length % extraColors.length];

                    return [...prev, {
                        name: option.name,
                        data: data!,
                        color: nextColor
                    }];
                });
            }
        } catch (e) {
            console.error(`Failed to fetch comparison ${option.name}`, e);
        } finally {
            setComparisonLoading(prev => ({ ...prev, [option.name]: false }));
        }
    }, [comparisonSeries, comparisonOptions, extraColors, getPortfolioHistory]);

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
