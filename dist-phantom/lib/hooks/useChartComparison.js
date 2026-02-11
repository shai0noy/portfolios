"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANGES = exports.LIGHT_COLORS = exports.DARK_COLORS = exports.INITIAL_COMPARISON_OPTIONS = exports.SEARCH_OPTION_TICKER = void 0;
exports.getAvailableRanges = getAvailableRanges;
exports.getMaxLabel = getMaxLabel;
exports.useChartComparison = useChartComparison;
const react_1 = require("react");
const material_1 = require("@mui/material");
const types_1 = require("../types");
const fetching_1 = require("../fetching");
exports.SEARCH_OPTION_TICKER = 'SEARCH_ACTION';
exports.INITIAL_COMPARISON_OPTIONS = [
    { ticker: exports.SEARCH_OPTION_TICKER, exchange: types_1.Exchange.NYSE, name: 'Search...', icon: 'search' },
    { ticker: '^SPX', exchange: types_1.Exchange.NYSE, name: 'S&P 500' },
    { ticker: '^NDX', exchange: types_1.Exchange.NASDAQ, name: 'NASDAQ 100' },
    { ticker: '^MID', exchange: types_1.Exchange.NYSE, name: 'S&P 400 (Midcap)' },
    { ticker: '^RUT', exchange: types_1.Exchange.NYSE, name: 'Russell 2000' },
    { ticker: 'ZB=F', exchange: types_1.Exchange.NYSE, name: 'US Treasury Bond Futures' },
    { ticker: 'TA35', exchange: types_1.Exchange.TASE, name: 'Tel Aviv 35' },
    { ticker: '137', exchange: types_1.Exchange.TASE, name: 'Tel Aviv 125' },
    { ticker: 'TCH-F91', exchange: types_1.Exchange.TASE, name: 'Tel Gov Makam' },
    { ticker: '120010', exchange: types_1.Exchange.CBS, name: 'Israel Consumer Price Index' },
    { ticker: 'GC=F', exchange: types_1.Exchange.NYSE, name: 'Gold Futures' },
    { ticker: 'ILS=X', exchange: types_1.Exchange.FOREX, name: 'USD/ILS' },
    { ticker: 'ILSUSD=X', exchange: types_1.Exchange.NYSE, name: 'ILS/USD' },
];
exports.DARK_COLORS = [
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
exports.LIGHT_COLORS = [
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
exports.RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'];
function getAvailableRanges(startDate) {
    if (!startDate)
        return ['ALL'];
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = diffDays / 30;
    const diffYears = diffDays / 365;
    const ranges = [];
    if (diffMonths >= 1)
        ranges.push('1M');
    if (diffMonths >= 3)
        ranges.push('3M');
    if (diffMonths >= 6)
        ranges.push('6M');
    if (startDate.getFullYear() < now.getFullYear())
        ranges.push('YTD');
    if (diffYears >= 1)
        ranges.push('1Y');
    if (diffYears >= 3)
        ranges.push('3Y');
    if (diffYears >= 5)
        ranges.push('5Y');
    ranges.push('ALL');
    return ranges;
}
function getMaxLabel(startDate) {
    if (!startDate)
        return 'Max';
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - startDate.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
    if (diffYears >= 1)
        return `Max (${diffYears.toFixed(1)}Y)`;
    const diffMonths = diffYears * 12;
    if (diffMonths >= 1)
        return `Max (${diffMonths.toFixed(1)}M)`;
    const diffDays = diffYears * 365;
    return `Max (${Math.ceil(diffDays)}D)`;
}
function useChartComparison() {
    const theme = (0, material_1.useTheme)();
    const [chartRange, setChartRange] = (0, react_1.useState)('1Y');
    const [comparisonSeries, setComparisonSeries] = (0, react_1.useState)([]);
    const [comparisonOptions, setComparisonOptions] = (0, react_1.useState)(exports.INITIAL_COMPARISON_OPTIONS);
    const [comparisonLoading, setComparisonLoading] = (0, react_1.useState)({});
    const [isSearchOpen, setIsSearchOpen] = (0, react_1.useState)(false);
    const extraColors = (0, react_1.useMemo)(() => {
        return theme.palette.mode === 'dark' ? exports.DARK_COLORS : exports.LIGHT_COLORS;
    }, [theme.palette.mode]);
    (0, react_1.useEffect)(() => {
        setComparisonSeries(prev => prev.map(s => {
            if (!s.color)
                return s;
            const isDark = theme.palette.mode === 'dark';
            const sourcePalette = isDark ? exports.LIGHT_COLORS : exports.DARK_COLORS;
            const targetPalette = isDark ? exports.DARK_COLORS : exports.LIGHT_COLORS;
            const idx = sourcePalette.indexOf(s.color);
            if (idx !== -1) {
                return { ...s, color: targetPalette[idx] };
            }
            return s;
        }));
    }, [theme.palette.mode]);
    const handleSelectComparison = (0, react_1.useCallback)(async (option) => {
        if (option.ticker === exports.SEARCH_OPTION_TICKER) {
            setIsSearchOpen(true);
            return;
        }
        if (comparisonSeries.some(s => s.name === option.name))
            return;
        // Add to comparison options if it's not already there
        if (!comparisonOptions.some(o => o.ticker === option.ticker && o.exchange === option.exchange)) {
            // Insert after the "Search..." option
            setComparisonOptions(prev => {
                const searchIndex = prev.findIndex(o => o.ticker === exports.SEARCH_OPTION_TICKER);
                const newOptions = [...prev];
                const insertionIndex = searchIndex !== -1 ? searchIndex + 1 : 1;
                newOptions.splice(insertionIndex, 0, option);
                return newOptions;
            });
        }
        setComparisonLoading(prev => ({ ...prev, [option.name]: true }));
        try {
            const historyResponse = await (0, fetching_1.fetchTickerHistory)(option.ticker, option.exchange);
            if (historyResponse?.historical) {
                setComparisonSeries(prev => {
                    const usedColors = new Set(prev.map(s => s.color));
                    const nextColor = extraColors.find(c => !usedColors.has(c)) || extraColors[prev.length % extraColors.length];
                    return [...prev, {
                            name: option.name,
                            data: historyResponse.historical,
                            color: nextColor
                        }];
                });
            }
        }
        catch (e) {
            console.error(`Failed to fetch comparison ticker ${option.name}`, e);
        }
        finally {
            setComparisonLoading(prev => ({ ...prev, [option.name]: false }));
        }
    }, [comparisonSeries, comparisonOptions, extraColors]);
    const handleRemoveComparison = (0, react_1.useCallback)((name) => {
        setComparisonSeries(prev => prev.filter(s => s.name !== name));
    }, []);
    const getClampedData = (0, react_1.useCallback)((data, range, minDate) => {
        if (!data)
            return [];
        let startDate;
        const now = new Date();
        if (range === 'ALL') {
            if (!minDate)
                return data;
            startDate = new Date(minDate);
        }
        else {
            startDate = new Date();
            startDate.setUTCHours(0, 0, 0, 0);
            switch (range) {
                case '1M':
                    startDate.setUTCMonth(now.getUTCMonth() - 1);
                    break;
                case '3M':
                    startDate.setUTCMonth(now.getUTCMonth() - 3);
                    break;
                case '6M':
                    startDate.setUTCMonth(now.getUTCMonth() - 6);
                    break;
                case 'YTD':
                    startDate.setUTCFullYear(now.getUTCFullYear(), 0, 1);
                    break;
                case '1Y':
                    startDate.setUTCFullYear(now.getUTCFullYear() - 1);
                    break;
                case '3Y':
                    startDate.setUTCFullYear(now.getUTCFullYear() - 3);
                    break;
                case '5Y':
                    startDate.setUTCFullYear(now.getUTCFullYear() - 5);
                    break;
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
