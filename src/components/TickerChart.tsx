import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot, ReferenceLine, ComposedChart, Bar } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice, formatPercent, formatCompactPrice, formatValue, formatCompactValue } from '../lib/currency';
import { formatDate } from '../lib/date';
import { Paper, Typography, Box, IconButton, Dialog, DialogContent, ToggleButton, ToggleButtonGroup, SvgIcon } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState, useEffect, useCallback, useMemo } from 'react';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { Menu, MenuItem } from '@mui/material';

export type TrendType = 'none' | 'linear' | 'exponential' | 'polynomial' | 'logarithmic';

export function TrendLineIcon(props: any) {
    return (
        <SvgIcon {...props}>
            <path d="M4 19 L20 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" fill="none" />
            <path d="M16 5 H20 V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </SvgIcon>
    );
}

// Simple regression solver
function solveUnivariableRegression(x: number[], y: number[], type: TrendType): ((v: number) => number) | null {
    const n = x.length;
    if (n < 2) return null;

    // Linear: y = mx + c
    if (type === 'linear') {
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumXX += x[i] * x[i];
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return (v: number) => slope * v + intercept;
    }

    // Exponential: y = A * e^(Bx) -> ln(y) = ln(A) + Bx
    // Linear regression on (x, ln(y))
    if (type === 'exponential') {
        // If any y <= 0, exponential fit is invalid/complex. 
        // For simplicity, ignore or clamp? If chart has negative values, exponential fit is bad.
        // Assuming we filter or handle it.
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        let validCount = 0;
        for (let i = 0; i < n; i++) {
            if (y[i] <= 0) continue;
            validCount++;
            const yL = Math.log(y[i]);
            sumX += x[i];
            sumY += yL;
            sumXY += x[i] * yL;
            sumXX += x[i] * x[i];
        }
        if (validCount < 2) return null;

        const B = (validCount * sumXY - sumX * sumY) / (validCount * sumXX - sumX * sumX);
        const lnA = (sumY - B * sumX) / validCount;
        const A = Math.exp(lnA);
        return (v: number) => A * Math.exp(B * v);
    }

    // Logarithmic: y = A + B * ln(x)
    // Linear regression on (ln(x), y)
    if (type === 'logarithmic') {
        // x must be > 0. We shift x if needed in caller.
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        let validCount = 0;
        for (let i = 0; i < n; i++) {
            if (x[i] <= 0) continue;
            validCount++;
            const xL = Math.log(x[i]);
            sumX += xL;
            sumY += y[i];
            sumXY += xL * y[i];
            sumXX += xL * xL;
        }
        if (validCount < 2) return null;

        const B = (validCount * sumXY - sumX * sumY) / (validCount * sumXX - sumX * sumX);
        const A = (sumY - B * sumX) / validCount;
        return (v: number) => (v > 0 ? A + B * Math.log(v) : 0);
    }

    // Polynomial (Cubic for now): y = a + bx + cx^2 + dx^3
    if (type === 'polynomial') {
        // Simplified: use a library or basic matrix solver? 
        // Implementing a full matrix solver is verbose.
        // Let's stick to simple least squares for degree 3?
        // Gaussian elimination implementation required.
        // For brevity, maybe fit quadratic? Or just small matrix solver.

        // Let's implement a tiny Gaussian elimination for degree 3 (4 coefficients).
        const order = 3;
        const matrixSize = order + 1;
        const matrix: number[][] = Array(matrixSize).fill(0).map(() => Array(matrixSize + 1).fill(0));

        for (let i = 0; i < n; i++) {
            for (let r = 0; r < matrixSize; r++) {
                for (let c = 0; c < matrixSize; c++) {
                    matrix[r][c] += Math.pow(x[i], r + c);
                }
                matrix[r][matrixSize] += y[i] * Math.pow(x[i], r);
            }
        }

        // Solve
        for (let i = 0; i < matrixSize; i++) {
            let pivot = matrix[i][i];
            for (let j = i + 1; j < matrixSize; j++) {
                const factor = matrix[j][i] / pivot;
                for (let k = i; k <= matrixSize; k++) {
                    matrix[j][k] -= factor * matrix[i][k];
                }
            }
        }

        const coeffs = Array(matrixSize).fill(0);
        for (let i = matrixSize - 1; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < matrixSize; j++) {
                sum += matrix[i][j] * coeffs[j];
            }
            coeffs[i] = (matrix[i][matrixSize] - sum) / matrix[i][i];
        }

        return (v: number) => coeffs[0] + coeffs[1] * v + coeffs[2] * v * v + coeffs[3] * v * v * v;
    }

    return null;
}


export interface ChartSeries {
    name: string;
    data: { date: Date; price: number; adjClose?: number; open?: number; high?: number; low?: number; volume?: number; totalVolume?: number }[];
    color?: string;
}

interface TickerChartProps {
    series: ChartSeries[];
    currency: string;
    mode?: 'percent' | 'price' | 'candle';
    valueType?: 'price' | 'value';
    height?: number | string;
    hideCurrentPrice?: boolean;
    allowFullscreen?: boolean;
    topControls?: React.ReactNode;
    scaleType?: 'linear' | 'log';
    onScaleTypeChange?: (type: 'linear' | 'log') => void;
    trendType?: TrendType;
    onTrendTypeChange?: (type: TrendType) => void;
    denseTicks?: boolean;
}

interface ChartPoint {
    date: Date;
    price: number;
    adjClose?: number;
    yValue: number;
    trendValue?: number; // Added
    highlightedY?: number;
    [key: string]: any;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    currency: string;
    t: any;
    basePrice: number;
    isComparison: boolean;
    series: ChartSeries[];
    mode: 'percent' | 'price' | 'candle';
    valueType?: 'price' | 'value';
    hideCurrentPrice?: boolean;
}

const CandleStickShape = (props: any) => {
    // Recharts passes `y` (y-coord of value) and `height` (length of bar from baseValue).
    // We assume dataKey="price" (close).
    // So y = scale(close), y + height = scale(0) [linear] or scale(domainMin) [log].
    const { x, width, height, y, payload, successColor, errorColor, domainMin } = props;
    // VERY IMPORTANT: Our payload contains `{ open, price, high, low }`
    // "price" maps to "close" based on mainSeries mapping.
    const { open, price: close, high, low } = payload;

    // Safety check
    if (open == null || close == null || high == null || low == null) return null;

    const isUp = close >= open;
    const color = isUp ? successColor : errorColor;

    // Derived scale function:
    let scale = (v: number) => {
        if (!height || Math.abs(close - domainMin) < 0.000001) return y;
        return (y + height) - (height / (close - domainMin)) * (v - domainMin);
    };

    const yOpen = scale(open);
    const yClose = scale(close);
    const yHigh = scale(high);
    const yLow = scale(low);

    const bodyTop = Math.min(yOpen, yClose);
    const bodyBottom = Math.max(yOpen, yClose);
    const bodyHeight = Math.max(1, bodyBottom - bodyTop);

    const wickX = x + width / 2;

    return (
        <g>
            <line
                x1={wickX} y1={yHigh}
                x2={wickX} y2={yLow}
                stroke={color}
                strokeWidth={1}
            />
            <rect
                x={x}
                y={bodyTop}
                width={width}
                height={bodyHeight}
                fill={color}
                stroke={color}
                strokeWidth={0}
            />
        </g>
    );
};

const CustomTooltip = ({ active, payload, currency, t, basePrice, isComparison, series, mode, valueType = 'price', hideCurrentPrice }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        const point = payload[0].payload as ChartPoint;
        const date = point.date;
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        if (isComparison) {
            const mainPct = point.pctValue;
            // The `payload` array can be sparse if some series have null data at this point.
            // Instead, we iterate over all `series` and look up their values in the `point` object.
            // The `point` object (`payload[0].payload`) contains the complete data for the hovered x-axis value.
            return (
                <Paper elevation={3} sx={{ padding: '10px', minWidth: 160 }}>
                    <Typography variant="caption" display="block" sx={{ mb: 1, borderBottom: 1, borderColor: 'divider', pb: 0.5 }}>
                        {dateStr}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {series.map((s: ChartSeries, index: number) => {
                            const seriesName = s.name;
                            let value: number | undefined | null;
                            let color: string | undefined;
                            let seriesPct: number | undefined | null;

                            if (index === 0) {
                                // Main series
                                value = point.yValue;
                                // The main series color is dynamic, find it in the payload.
                                const payloadEntry = payload.find((p: any) => p.dataKey === 'yValue');
                                value = point.rawY ?? point.yValue;
                                color = payloadEntry?.color;
                            } else {
                                // Comparison series
                                const dataKey = `series_${index - 1}`;
                                // Use RAW value for display if available, otherwise fallback to aligned value (backward compatibility)
                                const rawValue = point[`${dataKey}_raw`];
                                value = (rawValue !== undefined) ? rawValue : point[dataKey];
                                seriesPct = point[`${dataKey}_pct`];
                                color = s.color; // Color is stored in the series object for comparisons.
                            }

                            let diff: number | undefined;
                            if (index !== 0 && seriesPct !== null && seriesPct !== undefined && mainPct !== null && mainPct !== undefined) {
                                diff = (1 + seriesPct) / (1 + mainPct) - 1;
                            }

                            return (
                                <Box key={seriesName} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                                        <Typography variant="caption" noWrap sx={{ opacity: index === 0 ? 1 : 0.9 }}>
                                            {seriesName}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                            {(value !== null && value !== undefined)
                                                ? (mode === 'percent' ? formatPercent(value) : (valueType === 'value' ? formatValue(value, currency, undefined, t) : formatPrice(value, currency, undefined, t)))
                                                : 'N/A'}
                                            {index === 0 && (
                                                <Box component="span" sx={{ opacity: 0.6, ml: 0.5, fontSize: '0.65rem', fontWeight: 'normal' }}>
                                                    ({t('Base', 'בסיס')})
                                                </Box>
                                            )}
                                        </Typography>
                                        {diff !== undefined && !isNaN(diff) && (
                                            <Typography variant="caption" sx={{
                                                fontSize: '0.65rem',
                                                opacity: 0.7,
                                                fontWeight: 500
                                            }}>
                                                ({diff >= 0 ? '+' : ''}{formatPercent(diff)})
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Paper>
            );
        }

        const val = point.rawAdjClose ?? point.adjClose ?? point.rawPrice ?? point.price;
        const percentChange = basePrice ? (val / basePrice - 1) : 0;

        return (
            <Paper elevation={3} sx={{ padding: '10px' }}>
                <Typography variant="caption" display="block">{dateStr}</Typography>
                {!hideCurrentPrice && (
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {valueType === 'value' ? formatValue(val, currency, undefined, t) : formatPrice(val, currency, undefined, t)}
                    </Typography>
                )}
                {basePrice !== 0 && (
                    <Typography variant="body2" sx={{ fontWeight: hideCurrentPrice ? 'bold' : 'normal', color: percentChange >= 0 ? 'success.main' : 'error.main' }}>
                        {formatPercent(percentChange)}
                    </Typography>
                )}
                {point.trendValue !== undefined && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Typography variant="caption" color="text.secondary">Trend:</Typography>
                        <Typography variant="caption" fontWeight="bold">
                            {mode === 'percent' ? formatPercent(point.trendRaw ?? point.trendValue) : (valueType === 'value' ? formatValue(point.trendRaw ?? point.trendValue, currency, undefined, t) : formatPrice(point.trendRaw ?? point.trendValue, currency, undefined, t))}
                        </Typography>
                    </Box>
                )}
            </Paper>
        );
    }
    return null;
};

const CandleTooltip = ({ active, payload, currency, t }: any) => {
    if (active && payload && payload.length) {
        // Find the payload with the candle data (source data)
        const point = payload[0].payload;
        const rawOpen = point.rawOpen ?? point.open;
        const rawHigh = point.rawHigh ?? point.high;
        const rawLow = point.rawLow ?? point.low;
        const rawClose = point.rawPrice ?? point.price ?? point.close;
        const { date, volume } = point;
        const dateStr = formatDate(date);

        // Use close if price is missing, or price
        const currentPrice = rawClose;

        return (
            <Paper elevation={3} sx={{ padding: '10px', minWidth: 140 }}>
                <Typography variant="caption" display="block" sx={{ mb: 1, borderBottom: 1, borderColor: 'divider', pb: 0.5 }}>
                    {dateStr}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption">Open:</Typography>
                        <Typography variant="caption" fontWeight="bold">{formatPrice(rawOpen, currency, undefined, t)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption">High:</Typography>
                        <Typography variant="caption" fontWeight="bold">{formatPrice(rawHigh, currency, undefined, t)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption">Low:</Typography>
                        <Typography variant="caption" fontWeight="bold">{formatPrice(rawLow, currency, undefined, t)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption">Close:</Typography>
                        <Typography variant="caption" fontWeight="bold">{formatPrice(currentPrice, currency, undefined, t)}</Typography>
                    </Box>
                    {volume !== undefined && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                            <Typography variant="caption">Volume:</Typography>
                            <Typography variant="caption" fontWeight="bold">
                                {new Intl.NumberFormat(undefined, { notation: "compact", compactDisplay: "short" }).format((point as any).totalVolume ?? volume)}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Paper>
        );
    }
    return null;
};

interface SelectionSummaryProps {
    startPoint: ChartPoint | null;
    endPoint: ChartPoint | null;
    currency: string;
    t: any;
    isComparison: boolean;
    series: ChartSeries[];
    mainLineColor: string;
    mode: 'percent' | 'price' | 'candle';
    valueType?: 'price' | 'value';
    hideCurrentPrice?: boolean;
}

const SelectionSummary = ({ startPoint, endPoint, currency, t, isComparison, series, mainLineColor, mode, valueType = 'price', hideCurrentPrice }: SelectionSummaryProps) => {
    if (!startPoint || !endPoint) return null;

    const theme = useTheme();
    const isDarkMode = theme.palette.mode === 'dark';

    const startDate = new Date(Math.min(startPoint.date.getTime(), endPoint.date.getTime()));
    const endDate = new Date(Math.max(startPoint.date.getTime(), endPoint.date.getTime()));
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);
    const duration = Math.round(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const boxStyle = {
        position: 'absolute',
        top: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: isDarkMode ? 'rgba(40, 40, 40, 0.7)' : 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(4px)',
        padding: '8px 12px',
        borderRadius: '8px',
        pointerEvents: 'none',
        boxShadow: 3,
        border: `1px solid ${theme.palette.divider}`,
        minWidth: 200,
    };

    if (isComparison) {
        const changes = series.map((s: ChartSeries, index: number) => {
            let startVal: number | undefined;
            let endVal: number | undefined;

            if (index === 0) { // Main series
                startVal = startPoint.rawY ?? startPoint.yValue;
                endVal = endPoint.rawY ?? endPoint.yValue;
            } else { // Comparison series
                const dataKey = `series_${index - 1}`;
                // Use RAW values for selection summary too
                const startRaw = startPoint[`${dataKey}_raw`];
                const endRaw = endPoint[`${dataKey}_raw`];

                startVal = (startRaw !== undefined) ? startRaw : startPoint[dataKey];
                endVal = (endRaw !== undefined) ? endRaw : endPoint[dataKey];
            }

            if (startVal === undefined || endVal === undefined || startVal === null || endVal === null) {
                return { name: s.name, change: NaN, color: index === 0 ? mainLineColor : s.color };
            }

            let change: number;
            if (mode === 'percent') {
                change = (1 + endVal) / (1 + startVal) - 1;
            } else {
                change = (startVal !== 0) ? (endVal / startVal - 1) : 0;
            }

            return { name: s.name, change, color: index === 0 ? mainLineColor : s.color };
        });

        const mainChange = changes[0].change;

        return (
            <Box sx={boxStyle}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', color: isDarkMode ? 'white' : 'black', textAlign: 'center', mb: 1 }}>
                    {startDateStr} to {endDateStr} ({duration} days)
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {changes.map((item: any, index: number) => {
                        if (isNaN(item.change)) return null;
                        const textColor = item.change >= 0 ? 'success.main' : 'error.main';

                        let diff: number | undefined;
                        if (index !== 0 && !isNaN(mainChange)) {
                            diff = (1 + item.change) / (1 + mainChange) - 1;
                        }

                        return (
                            <Box key={item.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                                    <Typography variant="caption" noWrap>{item.name}</Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: textColor }}>
                                        {formatPercent(item.change)}
                                        {index === 0 && (
                                            <Box component="span" sx={{ opacity: 0.6, ml: 0.5, fontSize: '0.65rem', fontWeight: 'normal', color: isDarkMode ? 'white' : 'black' }}>
                                                ({t('Base', 'בסיס')})
                                            </Box>
                                        )}
                                    </Typography>
                                    {diff !== undefined && !isNaN(diff) && (
                                        <Typography variant="caption" sx={{
                                            fontSize: '0.65rem',
                                            opacity: 0.7,
                                            fontWeight: 500
                                        }}>
                                            ({diff >= 0 ? '+' : ''}{formatPercent(diff)})
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        );
    }

    // Single-line mode logic (existing)
    const startVal = startPoint.rawAdjClose ?? startPoint.adjClose ?? startPoint.rawPrice ?? startPoint.price;
    const endVal = endPoint.rawAdjClose ?? endPoint.adjClose ?? endPoint.rawPrice ?? endPoint.price;

    const priceChange = endVal - startVal;
    const percentChange = (startVal !== 0) ? (endVal / startVal) - 1 : 0;
    const isPositive = percentChange >= 0;
    const color = isPositive ? 'success.main' : 'error.main';

    return (
        <Box sx={{ ...boxStyle, textAlign: 'center', minWidth: 'auto' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', color: isDarkMode ? 'white' : 'black' }}>
                {startDateStr} to {endDateStr} ({duration} days)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color }}>
                {!hideCurrentPrice && (valueType === 'value' ? formatValue(priceChange, currency, undefined, t) : formatPrice(priceChange, currency, undefined, t))} ({formatPercent(percentChange)})
            </Typography>
        </Box>
    );
};

export function TickerChart({ series, currency, mode = 'percent', valueType = 'price', height = 300, hideCurrentPrice, allowFullscreen = true, topControls, scaleType: propScaleType, onScaleTypeChange, trendType: propTrendType, onTrendTypeChange, denseTicks }: TickerChartProps) {
    const FADE_MS = 170;          // Speed of the opacity transition
    const TRANSFORM_MS = 360;     // Speed of the line movement (Very fast)
    const BUFFER_MS = 30;        // Safety window for browser paint

    // Relation Enforcement: Total delay before fading back in
    const FADE_IN_DELAY = TRANSFORM_MS + BUFFER_MS;

    const { t } = useLanguage();
    const theme = useTheme();

    const gradientId = useMemo(() => `splitGradient-${Math.random().toString(36).substring(2, 9)}`, []);

    const [displaySeries, setDisplaySeries] = useState(series);
    const [shadeOpacity, setShadeOpacity] = useState(1);

    const [selection, setSelection] = useState<{
        start: ChartPoint | null;
        end: ChartPoint | null;
        isSelecting: boolean;
    }>({
        start: null,
        end: null,
        isSelecting: false,
    });

    const [isFullscreen, setIsFullscreen] = useState(false);

    const [internalScaleType, setInternalScaleType] = useState<'linear' | 'log'>('linear');
    const scaleType = propScaleType ?? internalScaleType;
    const setScaleType = onScaleTypeChange ?? setInternalScaleType;

    const [internalTrendType, setInternalTrendType] = useState<TrendType>('none');
    const trendType = propTrendType ?? internalTrendType;
    const setTrendType = onTrendTypeChange ?? setInternalTrendType;
    const [trendMenuAnchor, setTrendMenuAnchor] = useState<null | HTMLElement>(null);

    const mainSeries = displaySeries?.[0];
    const isComparison = displaySeries.length > 1;

    // Force line mode if comparison
    const currentMode = (mode === 'candle' && isComparison) ? 'percent' : mode;



    const dateRangeDays = useMemo(() => {
        if (!mainSeries?.data || mainSeries.data.length < 2) return 0;
        const range = mainSeries.data[mainSeries.data.length - 1].date.getTime() - mainSeries.data[0].date.getTime();
        return range / (1000 * 60 * 60 * 24);
    }, [mainSeries]);

    const hasData = useMemo(() => {
        return displaySeries[0]?.data && displaySeries[0].data.length > 0;
    }, [displaySeries]);

    const formatXAxis = useCallback((tickItem: number) => {
        const date = new Date(tickItem);
        if (dateRangeDays <= 95) { // ~3 months
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        if (dateRangeDays <= 366 * 2) { // up to 2Y
            return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        }
        // > 2Y
        return date.toLocaleDateString(undefined, { year: 'numeric' });
    }, [dateRangeDays]);

    useEffect(() => {
        if (!series || series === displaySeries) return;

        let swapTimer: ReturnType<typeof setTimeout>;
        let fadeInTimer: ReturnType<typeof setTimeout>;

        // If we are transitioning from nothing to data, just show it immediately without blinking
        const incomingHasData = series[0]?.data && series[0].data.length > 0;

        if (!hasData && incomingHasData) {
            setDisplaySeries(series);
            setShadeOpacity(1);
            return;
        }

        // 1. Instant fade out
        setShadeOpacity(0);
        setSelection({ start: null, end: null, isSelecting: false });

        // 2. Wait for fade-out, then swap data (Triggers TRANSFORM_MS line move)
        swapTimer = setTimeout(() => {
            setDisplaySeries(series);

            // 3. Re-enable shade ONLY after transform is guaranteed finished
            fadeInTimer = setTimeout(() => {
                setShadeOpacity(1);
            }, FADE_IN_DELAY);
        }, FADE_MS);

        return () => {
            clearTimeout(swapTimer);
            clearTimeout(fadeInTimer);
        };
    }, [series, displaySeries]);

    // Move hooks above the conditional return
    const chartData = useMemo<ChartPoint[]>(() => {
        if (!mainSeries?.data || mainSeries.data.length < 1) return [];

        // Downsampling logic for large datasets
        let sourceData = mainSeries.data;
        // Target max points similar to pixel width, e.g. 700.
        // User requested weekly data for > 10y (approx 520 points).
        const MAX_POINTS = 700;

        if (sourceData.length > MAX_POINTS) {
            const firstDate = sourceData[0].date.getTime();
            const lastDate = sourceData[sourceData.length - 1].date.getTime();
            const totalDuration = lastDate - firstDate;

            if (totalDuration > 0) {
                const minStep = totalDuration / MAX_POINTS;
                const aggregated: typeof sourceData = [];

                let i = 0;
                while (i < sourceData.length) {
                    const bucketStartTime = sourceData[i].date.getTime();
                    const bucketTargetEnd = bucketStartTime + minStep;

                    const firstP = sourceData[i];
                    let high = -Infinity;
                    let low = Infinity;
                    let vol = 0;
                    let count = 0;
                    let lastP = firstP;

                    // Aggregate points within the time bucket
                    while (i < sourceData.length) {
                        const p = sourceData[i];
                        // If we moved past the bucket time window, stop (unless it's the very first point of bucket)
                        if (p.date.getTime() >= bucketTargetEnd && p !== firstP) break;

                        high = Math.max(high, p.high ?? p.price);
                        low = Math.min(low, p.low ?? p.price);
                        vol += (p.volume ?? 0);
                        count++;
                        lastP = p;
                        i++;
                    }

                    // Push aggregated point
                    // We normalize 'volume' to weighted average so bars are consistent height regardless of bucket size
                    // We store 'totalVolume' for the tooltip
                    aggregated.push({
                        date: firstP.date,
                        open: firstP.open ?? firstP.price,
                        high: high === -Infinity ? firstP.high ?? firstP.price : high,
                        low: low === Infinity ? firstP.low ?? firstP.price : low,
                        price: lastP.price,         // Close
                        adjClose: lastP.adjClose,
                        volume: vol,
                        totalVolume: vol
                    });
                }
                sourceData = aggregated;
            }
        }

        // Use adjClose if available, otherwise price. 
        // Important: Must use consistent field for base and current to get correct % change.
        const first = sourceData[0];
        const basePrice = first.adjClose || first.price;

        const processedMain = sourceData.map(p => {
            const val = p.adjClose || p.price;
            const pct = basePrice > 0 ? (val / basePrice - 1) : 0;

            const rawData = {
                rawPrice: p.price,
                rawOpen: p.open,
                rawHigh: p.high,
                rawLow: p.low,
                rawAdjClose: p.adjClose,
                rawY: currentMode === 'percent' ? pct : val
            };

            let yVal = val;
            let p_open = p.open;
            let p_high = p.high;
            let p_low = p.low;
            let p_price = p.price;
            let p_adjClose = p.adjClose;

            if (scaleType === 'log') {
                if (currentMode === 'percent') {
                    yVal = Math.sign(pct) * Math.log10(1 + Math.abs(pct));
                } else {
                    yVal = Math.sign(val) * Math.log10(1 + Math.abs(val));
                    if (p_price != null) p_price = Math.sign(p_price) * Math.log10(1 + Math.abs(p_price));
                    if (p_open != null) p_open = Math.sign(p_open) * Math.log10(1 + Math.abs(p_open));
                    if (p_high != null) p_high = Math.sign(p_high) * Math.log10(1 + Math.abs(p_high));
                    if (p_low != null) p_low = Math.sign(p_low) * Math.log10(1 + Math.abs(p_low));
                    if (p_adjClose != null) p_adjClose = Math.sign(p_adjClose) * Math.log10(1 + Math.abs(p_adjClose));
                }
            } else {
                if (currentMode === 'percent') {
                    yVal = pct;
                }
            }

            return {
                ...p,
                ...rawData,
                yValue: yVal,
                pctValue: pct,
                open: p_open,
                high: p_high,
                low: p_low,
                price: p_price,
                adjClose: p_adjClose
            };
        });

        // Merge other series
        const otherSeries = displaySeries.slice(1);
        if (otherSeries.length === 0) return processedMain;

        // Create pointers for each comparison series for an efficient merge
        const seriesPointers = otherSeries.map(() => 0);

        // Track offsets to align comparison series with the main series at their first appearance
        const seriesOffsets = otherSeries.map(() => null as number | null);

        return processedMain.map(p => {
            const point = { ...p } as ChartPoint;
            otherSeries.forEach((s, i) => {
                // Advance the pointer for the current comparison series to find the
                // latest data point that is at or before the main series' current date.
                while (
                    seriesPointers[i] + 1 < s.data.length &&
                    s.data[seriesPointers[i] + 1].date.getTime() <= p.date.getTime()
                ) {
                    seriesPointers[i]++;
                }

                const match = s.data[seriesPointers[i]];

                // Ensure the match is valid and not in the future (though logic above ensures <=)
                // Also ensure we actually have data coverage (e.g. if main starts Jan 1, s starts June 1)
                // The loop finds closest <=. Check if it's potentially too old?
                // Assuming continuous history, if match.date < p.date - 7 days, maybe data gap?
                // For now trust the closest <= point logic.

                // IMPORTANT: Check if the match is actually within reasonable range or if s hasn't started yet.
                // If s starts June 1, and p is Jan 1. 
                // s.data[0] is June 1. match will be s.data[0] (index 0). 
                // But June 1 > Jan 1. So match.date > p.date.
                // We need to check data existence.

                let val: number | undefined;
                let pct: number | undefined;

                // Correction: The while loop finds the largest index <= p.date sets pointers[i].
                // But initially pointers[i] = 0.
                // If s.data[0].date > p.date, then s has NOT started yet.
                // We must check if s.data[seriesPointers[i]].date <= p.date

                if (match && match.date.getTime() <= p.date.getTime()) {
                    val = match.adjClose || match.price;
                    // Normalize other series to its own start in the visible range
                    const sFirst = s.data[0];
                    const sBase = sFirst.adjClose || sFirst.price;
                    const rawPct = sBase > 0 ? (val / sBase - 1) : 0;

                    // Determine Offset at the first valid point
                    if (seriesOffsets[i] === null) {
                        // This is the first overlapping point
                        // We want rawPct + offset = p.pctValue (Main Series Pct)
                        // offset = p.pctValue - rawPct
                        seriesOffsets[i] = (p.pctValue || 0) - rawPct;
                    }

                    pct = rawPct + (seriesOffsets[i] || 0);

                    // Calculate "aligned value" for price mode? 
                    // Price mode usually shows absolute prices. Aligning prices is confusing (1.0 vs 150).
                    // Only align in 'percent' mode.
                    if (currentMode === 'price' || currentMode === 'candle') {
                        point[`series_${i}`] = val;
                    } else {
                        point[`series_${i}`] = pct;
                    }
                    // Store aligned pct for diff calculation if desired, or raw?
                    // point[`series_${i}_pct`] usually stores the value used for the line?
                    // Actually CustomTooltip uses `series_${i}_pct` for the DIFF calculation (relative to main).
                    // If we want diff to be "how much higher/lower is this line compared to main line", we use aligned pct.
                    point[`series_${i}_pct`] = pct;

                    // Update series_i with shifted value if log
                    if (currentMode === 'percent' && scaleType === 'log') {
                        point[`series_${i}`] = Math.sign(pct) * Math.log10(1 + Math.abs(pct));
                    } else if (currentMode === 'price' || currentMode === 'candle') {
                        if (scaleType === 'log') {
                            point[`series_${i}`] = Math.sign(val) * Math.log10(1 + Math.abs(val));
                        } else {
                            point[`series_${i}`] = val;
                        }
                    } else {
                        point[`series_${i}`] = pct;
                    }

                    // Store RAW value for tooltip display
                    point[`series_${i}_raw`] = currentMode === 'percent' ? rawPct : val;
                }
            });
            return point;
        });
        // Re-memoize ChartData when scaleType changes to ensure yValue is updated (1+pct vs pct)
    }, [displaySeries, currentMode, mainSeries, mode, scaleType]);


    // Calculate Trend Line
    const dataWithTrend = useMemo(() => {
        const sourceData = chartData;
        if (trendType === 'none' || sourceData.length < 2) return sourceData;

        // Prepare Linear Data for Regression (Extract normalized X and raw Y)
        const firstTime = sourceData[0].date.getTime();

        // Create full list of points with X/Y pre-calculated
        const fullPoints = sourceData.map(d => ({
            d, // keep original reference
            x: (d.date.getTime() - firstTime) / (1000 * 60 * 60 * 24), // Days since start
            y: d.rawY ?? (currentMode === 'percent' ? (d.pctValue ?? d.yValue) : (d.adjClose || d.price))
        }));

        // Filter for valid points to build the regression model
        const validPoints = fullPoints.filter(p => typeof p.y === 'number' && isFinite(p.y));

        if (validPoints.length < 2) return sourceData;

        const xArr = validPoints.map(p => p.x);
        const yArr = validPoints.map(p => p.y);

        // Logarithmic regression needs x > 0. Shift x by +1 (Day 1).
        if (trendType === 'logarithmic') {
            for (let i = 0; i < xArr.length; i++) xArr[i] += 1;
        }

        const regressionFn = solveUnivariableRegression(xArr, yArr, trendType);

        if (!regressionFn) return sourceData;

        // Apply regression to ALL points (even those with missing/invalid original Y, we can extrapolate)
        return fullPoints.map((p) => {
            let xVal = p.x;
            if (trendType === 'logarithmic') xVal += 1;

            let predictedY = regressionFn(xVal);

            // Now we must transform predictedY if we are in a mode that transforms Y for display
            // Specifically: SymLog in percent mode.
            // If scaleType=log and currentMode=percent -> apply symlog transform
            let displayY = predictedY;

            if (scaleType === 'log') {
                // Symlog transform: sign(y) * log10(1 + abs(y))
                displayY = Math.sign(predictedY) * Math.log10(1 + Math.abs(predictedY));
            }

            return {
                ...p.d,
                trendValue: displayY,
                trendRaw: predictedY
            } as ChartPoint;
        });
    }, [chartData, trendType, currentMode, scaleType]);

    const { dataMin, dataMax, volMax } = useMemo(() => {
        if (!dataWithTrend || dataWithTrend.length === 0) return { dataMin: 0, dataMax: 0, volMax: 0 };
        let min = Infinity;
        let max = -Infinity;
        let vMax = 0;

        const updateMinMax = (val: any) => {
            if (typeof val === 'number' && !isNaN(val)) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        };

        dataWithTrend.forEach((p) => {
            updateMinMax(p.yValue);
            if (p.trendValue !== undefined) updateMinMax(p.trendValue);

            if (currentMode === 'candle') {
                if (p.high != null) updateMinMax(p.high);
                if (p.low != null) updateMinMax(p.low);
                if (p.volume != null && p.volume > vMax) vMax = p.volume;
            }

            Object.keys(p).forEach(k => {
                if (k.startsWith('series_') && !k.endsWith('_pct') && !k.endsWith('_raw')) {
                    updateMinMax(p[k]);
                }
            });
        });

        if (min === Infinity || max === -Infinity) return { dataMin: 0, dataMax: 0, volMax: 0 };
        return { dataMin: min, dataMax: max, volMax: vMax };
    }, [dataWithTrend, currentMode]);



    // Use SymLog whenever log is requested
    const useSymLog = scaleType === 'log';

    const { yMin, yMax } = useMemo(() => {
        if (!dataWithTrend || dataWithTrend.length === 0) return { yMin: 0, yMax: 0 };

        let min = dataMin;
        let max = dataMax;

        // Add padding to the domain so the line/candles doesn't touch the edges
        let calculatedMin, calculatedMax;
        if (scaleType === 'log') {
            // Multiplicative padding for log scale (using magnitude)
            // ~5% visual padding
            calculatedMin = min - Math.abs(min) * 0.05;
            calculatedMax = max + Math.abs(max) * 0.05;
        } else {
            // Linear padding
            const padding = (max - min) * 0.05;
            const effectivePadding = padding === 0 ? (Math.abs(max) * 0.05 || 0.01) : padding;
            calculatedMin = min - effectivePadding;
            calculatedMax = max + effectivePadding;
        }

        console.log("MIN_MAX", { min, max, calculatedMin, calculatedMax, scaleType });
        return { yMin: calculatedMin, yMax: calculatedMax };
    }, [dataWithTrend, dataMin, dataMax, scaleType]);

    const formatYAxis = useCallback((tick: number) => {
        let val = tick;
        // Generic SymLog Reverse Transform (applies to ALL modes if log is active)
        if (useSymLog) {
            // Reverse SymLog: sign(y) * (10^abs(y) - 1)
            val = Math.sign(tick) * (Math.pow(10, Math.abs(tick)) - 1);
        }

        if (currentMode === 'price' || currentMode === 'candle') {
            return valueType === 'value' ? formatCompactValue(val, currency, t) : formatCompactPrice(val, currency, t);
        }

        // Percent Mode
        const range = yMax - yMin;
        const decimals = range > 0.1 ? 0 : 1;

        return '\u200E' + new Intl.NumberFormat(undefined, {
            style: 'percent',
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        }).format(val);
    }, [yMin, yMax, currentMode, currency, t, scaleType, valueType, useSymLog]);

    const findClosestPoint = useCallback((date: number): ChartPoint | null => {
        const data = dataWithTrend;
        if (!data || data.length === 0) return null;
        // Optimization: Binary search for O(log N) lookup
        let low = 0;
        let high = data.length - 1;

        if (date <= data[0].date.getTime()) return data[0];
        if (date >= data[high].date.getTime()) return data[high];

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (data[mid].date.getTime() < date) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        // After loop, data[low] is the first point with date >= hovered date.
        // We want the point at or before the hovered date (the "floor").
        if (data[low].date.getTime() > date && low > 0) {
            return data[low - 1];
        }
        return data[low];
    }, [dataWithTrend]);

    const handleClick = useCallback((e: any) => {
        if (!e || !e.activeLabel) return;
        const point = findClosestPoint(Number(e.activeLabel));
        if (!point) return;

        setSelection(prev => {
            if (prev.isSelecting) {
                return { ...prev, end: point, isSelecting: false };
            }
            return { start: point, end: point, isSelecting: true };
        });
    }, [findClosestPoint]);

    const handleMouseMove = useCallback((e: any) => {
        if (selection.isSelecting && e && e.activeLabel) {
            const point = findClosestPoint(Number(e.activeLabel));
            if (point && point.date.getTime() !== selection.end?.date?.getTime()) {
                setSelection(prev => ({ ...prev, end: point }));
            }
        }
    }, [selection.isSelecting, selection.end, findClosestPoint]);

    const selectionPoints = selection.start && selection.end ? [selection.start, selection.end].sort((a, b) => a.date.getTime() - b.date.getTime()) : [];
    const [startPoint, endPoint] = selectionPoints;

    const finalData = useMemo(() => {
        if (!startPoint || !endPoint || startPoint === endPoint) return dataWithTrend;

        const startIndex = dataWithTrend.indexOf(startPoint);
        const endIndex = dataWithTrend.indexOf(endPoint);

        if (startIndex === -1 || endIndex === -1) return dataWithTrend;

        // Optimization: Recycle objects outside the range, map only the range
        // Optimization: Recycle objects outside the range, map only the range
        return [
            ...dataWithTrend.slice(0, startIndex),
            ...dataWithTrend.slice(startIndex, endIndex + 1).map((p) => ({ ...p, highlightedY: p.yValue })),
            ...dataWithTrend.slice(endIndex + 1)
        ];
    }, [dataWithTrend, startPoint, endPoint]);

    const xMin = dataWithTrend.length > 0 ? dataWithTrend[0].date.getTime() : null;
    const xMax = dataWithTrend.length > 0 ? dataWithTrend[dataWithTrend.length - 1].date.getTime() : null;

    const xAxisTicks = useMemo(() => {
        if (!xMin || !xMax) return undefined;

        const startDate = new Date(xMin);
        const endDate = new Date(xMax);
        const ticks: number[] = [];

        if (dateRangeDays <= 7) {
            return undefined; // Let recharts handle very short ranges
        }

        if (dateRangeDays <= 95) { // Up to ~3 months: weekly ticks
            let currentTick = new Date(startDate);
            currentTick.setHours(0, 0, 0, 0);
            // Start from the Monday of the week of the start date
            currentTick.setDate(currentTick.getDate() - (currentTick.getDay() + 6) % 7);

            while (currentTick <= endDate) {
                if (currentTick >= startDate) { // Only add ticks within the domain
                    ticks.push(currentTick.getTime());
                }
                currentTick.setDate(currentTick.getDate() + 7);
            }
        } else if (dateRangeDays <= 366 * 2) { // Up to 2 years: monthly ticks
            const monthInterval = dateRangeDays <= 366 ? 1 : 2;
            let currentTick = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            currentTick.setHours(0, 0, 0, 0);

            while (currentTick <= endDate) {
                if (currentTick >= startDate) {
                    ticks.push(currentTick.getTime());
                }
                currentTick.setMonth(currentTick.getMonth() + monthInterval);
            }
        } else { // More than 2 years: yearly ticks
            // Target roughly 12-15 ticks for yearly data since the text "YYYY" is short
            const totalYears = dateRangeDays / 365;
            const yearInterval = Math.max(1, Math.ceil(totalYears / 12));

            let currentTick = new Date(startDate.getFullYear(), 0, 1);
            currentTick.setHours(0, 0, 0, 0);

            while (currentTick <= endDate) {
                if (currentTick >= startDate) {
                    ticks.push(currentTick.getTime());
                }
                currentTick.setFullYear(currentTick.getFullYear() + yearInterval);
            }
        }

        if (ticks.length < 2) return undefined; // Fallback to default

        return ticks;
    }, [xMin, xMax, dateRangeDays]);

    if (!mainSeries?.data || mainSeries.data.length < 2 || dataWithTrend.length < 2) {
        return (
            <Box sx={{
                width: '100%',
                height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 1,
            }}>
                <Typography color="text.secondary">{t('No data available for this range', 'אין נתונים זמינים לטווח זה')}</Typography>
            </Box>
        );
    }

    // Calculations (Likeness & Gradient Offset)
    const first = mainSeries.data[0];
    const basePrice = first.adjClose || first.price;
    const last = mainSeries.data[mainSeries.data.length - 1];
    const lastPrice = last.adjClose || last.price;
    const isUp = lastPrice >= basePrice;
    const successColor = theme.palette.success.main || '#4caf50';
    const errorColor = theme.palette.error.main || '#f44336';
    const chartColor = isUp ? successColor : errorColor;
    const mainLineColor = isComparison ? theme.palette.text.primary : chartColor;

    // Determine the split threshold
    let threshold = (currentMode === 'price' || currentMode === 'candle') ? basePrice : 0;
    if (scaleType === 'log') {
        threshold = Math.sign(threshold) * Math.log10(1 + Math.abs(threshold));
    }

    // Calculate the offset for the gradient. This value represents the position
    // of the threshold on the Y-axis, where 0 is the top of the chart (yMax)
    // and 1 is the bottom (yMin).
    // We use the bounding box of the area (defined by data range and threshold)
    const areaMax = Math.max(dataMax, threshold);
    const areaMin = Math.min(dataMin, threshold);
    const gradientRange = areaMax - areaMin;
    let offset = 0;

    if (gradientRange !== 0) {
        if (scaleType === 'log' && areaMin > 0 && areaMax > 0 && threshold > 0) {
            // Logarithmic interpolation for gradient stop
            offset = (areaMax - threshold) / gradientRange;
        } else {
            offset = (areaMax - threshold) / gradientRange;
        }
    }

    // Clamp the offset between 0 and 1 to handle cases where the threshold
    // is outside the visible range.
    const clampedOffset = Math.max(0, Math.min(1, offset));

    const yTicks = useMemo(() => {
        const targetTickCount = (denseTicks || isFullscreen) ? 10 : 5;

        let realMin = yMin;
        let realMax = yMax;
        if (scaleType === 'log') {
            realMin = Math.sign(yMin) * (Math.pow(10, Math.abs(yMin)) - 1);
            realMax = Math.sign(yMax) * (Math.pow(10, Math.abs(yMax)) - 1);
        }

        const range = realMax - realMin;
        if (range <= 0) return scaleType === 'log' ? [yMin] : [realMin];

        const getLinearTicks = (minV: number, maxV: number) => {
            const rawStep = (maxV - minV) / targetTickCount;
            const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
            let step = Math.ceil(rawStep / mag) * mag; // e.g. 0.1, 1, 10...

            if (step / mag < 1.5) step = 1 * mag;
            else if (step / mag < 3.5) step = 2 * mag;
            else if (step / mag < 7.5) step = 5 * mag;
            else step = 10 * mag;

            const ticks: number[] = [];
            ticks.push(0);

            let curr = step;
            while (curr <= maxV) {
                ticks.push(curr);
                curr += step;
            }
            curr = -step;
            while (curr >= minV) {
                ticks.unshift(curr);
                curr -= step;
            }

            let rawTicks = new Set(ticks.filter(t => t >= minV && t <= maxV));

            // Log scale stretches the chart massively near 0.
            // Add evenly-distributed sub-ticks within the first standard step [0, step] to visually balance the axis
            if (scaleType === 'log' && step > 0) {
                const subStep = step / 10;

                if (maxV > 0) {
                    for (let val = subStep; val < step; val += subStep) {
                        if (val >= minV && val <= maxV) {
                            rawTicks.add(Number(val.toFixed(10)));
                        }
                    }
                }
                if (minV < 0) {
                    for (let val = subStep; val < step; val += subStep) {
                        if (-val >= minV && -val <= maxV) {
                            rawTicks.add(Number((-val).toFixed(10)));
                        }
                    }
                }
            }

            return Array.from(rawTicks).sort((a, b) => a - b);
        };

        const rawTicks = getLinearTicks(realMin, realMax);

        if (scaleType === 'log') {
            return rawTicks.map(t => Math.sign(t) * Math.log10(1 + Math.abs(t)));
        }
        return rawTicks;
    }, [yMin, yMax, scaleType, denseTicks, isFullscreen]);

    const showZeroLine = yMin <= 0 && yMax >= 0;

    return (
        <Box
            sx={{
                width: '100%',
                height,
                minWidth: 0,
                minHeight: 0,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                userSelect: 'none',
                '& *': {
                    outline: 'none !important',
                }
            }}>
            {(topControls || allowFullscreen) && !isFullscreen && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, gap: 1, flexWrap: 'nowrap' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: { xs: 'nowrap', md: 'wrap' }, minWidth: 0, flex: 1, overflowX: { xs: 'auto', md: 'visible' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                        {topControls}
                        {!onScaleTypeChange && (
                            <ToggleButtonGroup
                                value={scaleType}
                                exclusive
                                onChange={(_, next) => next && setScaleType(next)}
                                size="small"
                                sx={{ height: 26 }}
                            >
                                <ToggleButton value="linear" sx={{ px: 1, py: 0, fontSize: '0.7rem' }}>LIN</ToggleButton>
                                <ToggleButton value="log" sx={{ px: 1, py: 0, fontSize: '0.7rem' }}>LOG</ToggleButton>
                            </ToggleButtonGroup>
                        )}

                        {!onTrendTypeChange && (
                            <IconButton
                                size="small"
                                onClick={(e) => setTrendMenuAnchor(e.currentTarget)}
                                sx={{
                                    bgcolor: trendType !== 'none' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                                }}
                            >
                                <TrendLineIcon fontSize="small" color={trendType !== 'none' ? 'primary' : 'inherit'} />
                            </IconButton>
                        )}
                        {!onTrendTypeChange && (
                            <Menu
                                anchorEl={trendMenuAnchor}
                                open={Boolean(trendMenuAnchor)}
                                onClose={() => setTrendMenuAnchor(null)}
                            >
                                <MenuItem onClick={() => { setTrendType('none'); setTrendMenuAnchor(null); }} selected={trendType === 'none'}>
                                    {t('No Trend', 'ללא מגמה')}
                                </MenuItem>
                                <MenuItem onClick={() => { setTrendType('linear'); setTrendMenuAnchor(null); }} selected={trendType === 'linear'}>
                                    {t('Linear', 'ליניארי')}
                                </MenuItem>
                                <MenuItem onClick={() => { setTrendType('exponential'); setTrendMenuAnchor(null); }} selected={trendType === 'exponential'}>
                                    {t('Exponential', 'אקספוננציאלי')}
                                </MenuItem>
                                <MenuItem onClick={() => { setTrendType('polynomial'); setTrendMenuAnchor(null); }} selected={trendType === 'polynomial'}>
                                    {t('Cubic', 'פולינום (3)')}
                                </MenuItem>
                                <MenuItem onClick={() => { setTrendType('logarithmic'); setTrendMenuAnchor(null); }} selected={trendType === 'logarithmic'}>
                                    {t('Logarithmic', 'לוגריתמי')}
                                </MenuItem>
                            </Menu>
                        )}
                    </Box>
                    {allowFullscreen && (
                        <IconButton
                            size="small"
                            onClick={() => setIsFullscreen(true)}
                            sx={{
                                bgcolor: 'rgba(255,255,255,0.05)',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                            }}
                        >
                            <FullscreenIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>
            )
            }

            {
                isFullscreen && (
                    <Dialog
                        fullScreen
                        open={isFullscreen}
                        onClose={() => setIsFullscreen(false)}
                        PaperProps={{
                            sx: {
                                bgcolor: 'background.default',
                                backgroundImage: 'none',
                                display: 'flex',
                                flexDirection: 'column'
                            }
                        }}
                    >
                        <Box sx={{ p: 1, px: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                {topControls}
                            </Box>
                            <IconButton onClick={() => setIsFullscreen(false)}>
                                <FullscreenExitIcon />
                            </IconButton>
                        </Box>
                        <DialogContent sx={{ flex: 1, p: 2, pt: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <Box sx={{ flex: 1, minHeight: 0 }}>
                                <TickerChart
                                    series={series}
                                    currency={currency}
                                    mode={mode}
                                    valueType={valueType}
                                    height="100%"
                                    hideCurrentPrice={hideCurrentPrice}
                                    allowFullscreen={false}
                                    topControls={null} // Don't double render controls inside the inner chart
                                    scaleType={scaleType}
                                    onScaleTypeChange={setScaleType}
                                    trendType={trendType}
                                    onTrendTypeChange={setTrendType}
                                    denseTicks={true}
                                />
                            </Box>
                        </DialogContent>
                    </Dialog>
                )
            }
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <SelectionSummary startPoint={startPoint} endPoint={endPoint} currency={currency} t={t} isComparison={isComparison} series={displaySeries} mainLineColor={mainLineColor} mode={currentMode} hideCurrentPrice={hideCurrentPrice} />
                <ResponsiveContainer width="100%" height="100%">
                    {currentMode === 'candle' ? (
                        <ComposedChart
                            data={finalData}
                            onClick={handleClick}
                            onMouseMove={handleMouseMove}
                            margin={{ top: 10, right: 5, left: 0, bottom: 0 }}
                        >
                            <defs>
                                {/* Gradients are not used in candle mode generally, but we can keep defs if needed */}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                            <XAxis
                                dataKey="date"
                                type="number"
                                domain={[xMin ?? 'dataMin', xMax ?? 'dataMax']}
                                scale="time"
                                tickFormatter={formatXAxis}
                                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                                ticks={xAxisTicks}
                                dy={7}
                            />
                            {/* Price Axis */}
                            <YAxis
                                yAxisId="price"
                                orientation="right"
                                tickFormatter={formatYAxis}
                                width={60}
                                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                                dx={3}
                                domain={[yMin, yMax]}
                                ticks={yTicks}
                                scale="linear"
                                allowDataOverflow={true} // Important for log scale stability
                            />
                            {/* Volume Axis (hidden or scaled) */}
                            <YAxis
                                yAxisId="volume"
                                orientation="left"
                                hide={true}
                                width={0}
                                tickFormatter={() => ''}
                                domain={[0, volMax * 4]} // Scale so max volume is 1/4th height
                            />
                            <Tooltip content={<CandleTooltip currency={currency} t={t} mode={currentMode} />} />

                            <Bar
                                dataKey="volume"
                                yAxisId="volume"
                                fill={theme.palette.text.secondary}
                                opacity={0.5}
                                barSize={6} // Fixed width, wider than before
                                isAnimationActive={false}
                            />

                            {/* Candle Bar - using custom shape. use barSize to guarantee width. */}
                            <Bar
                                dataKey="price"
                                yAxisId="price"
                                shape={<CandleStickShape successColor={successColor} errorColor={errorColor} domainMin={yMin} />}
                                barSize={8} // 2x volume width
                                isAnimationActive={false}
                            />
                            {trendType !== 'none' && (
                                <Line
                                    type="monotone"
                                    yAxisId="price"
                                    dataKey="trendValue"
                                    stroke={theme.palette.warning.main}
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    activeDot={false}
                                    isAnimationActive={false}
                                />
                            )}
                        </ComposedChart>
                    ) : (
                        <AreaChart
                            data={finalData}
                            onClick={handleClick}
                            onMouseMove={handleMouseMove}
                            margin={{ top: 10, right: 5, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                                    <stop offset={clampedOffset} stopColor={theme.palette.success.main} stopOpacity={0.05} />
                                    <stop offset={clampedOffset} stopColor={theme.palette.error.main} stopOpacity={0.05} />
                                    <stop offset="1" stopColor={theme.palette.error.main} stopOpacity={0.4} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                            <XAxis
                                dataKey="date"
                                type="number"
                                domain={[xMin ?? 'dataMin', xMax ?? 'dataMax']}
                                scale="time"
                                tickFormatter={formatXAxis}
                                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                                ticks={xAxisTicks}
                                dy={7}
                            />
                            <YAxis
                                orientation="right"
                                tickFormatter={formatYAxis}
                                width={mode === 'price' ? 60 : 50}
                                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                                dx={3}
                                domain={[yMin, yMax]}
                                ticks={yTicks}
                                scale="linear"
                                allowDataOverflow={true}
                            />
                            <Tooltip content={<CustomTooltip currency={currency} t={t} basePrice={basePrice} isComparison={isComparison} series={displaySeries} mode={currentMode} hideCurrentPrice={hideCurrentPrice} />} />

                            {/* Zero line (solid, semi-opaque) - only if 0 is in range */}
                            {showZeroLine && (
                                <ReferenceLine y={0} stroke={theme.palette.text.secondary} strokeOpacity={0.4} strokeWidth={1} />
                            )}

                            {/* Threshold line (dashed) - used for base price in price mode. Avoid if it duplicates 0 (which is covered above) */}
                            {threshold !== 0 && (
                                <ReferenceLine y={threshold} stroke={theme.palette.text.secondary} strokeDasharray="3 3" />
                            )}

                            {displaySeries.slice(1).map((s, i) => (
                                <Line
                                    key={i}
                                    type="monotone"
                                    dataKey={`series_${i}`}
                                    stroke={s.color}
                                    strokeWidth={1.2}
                                    dot={false}
                                    isAnimationActive={true}
                                    connectNulls
                                    animationDuration={TRANSFORM_MS}
                                    animationEasing="ease-in-out"
                                />
                            ))}

                            <Line
                                type="monotone"
                                dataKey="yValue"
                                stroke={`url(#${gradientId})`}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                animationDuration={TRANSFORM_MS}
                                isAnimationActive={true}
                            />
                            {trendType !== 'none' && (
                                <Line
                                    type="monotone"
                                    dataKey="trendValue"
                                    stroke={theme.palette.warning.main}
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    activeDot={false}
                                    isAnimationActive={false}
                                />
                            )}

                            <Area
                                type="monotone"
                                dataKey="yValue"
                                stroke={mainLineColor}
                                strokeWidth={2}
                                fill={isComparison ? "none" : `url(#${gradientId})`}
                                baseValue={threshold}
                                fillOpacity={shadeOpacity}
                                isAnimationActive={hasData}
                                animationDuration={TRANSFORM_MS}
                                animationBegin={0}
                                animationEasing="ease-in-out"
                                style={{
                                    transition: `fill-opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                                    pointerEvents: 'none'
                                }}
                            />

                            {startPoint && endPoint && startPoint !== endPoint && (
                                <Area
                                    type="monotone"
                                    dataKey="highlightedY"
                                    stroke="none"
                                    fill={mainLineColor}
                                    fillOpacity={0.2}
                                    isAnimationActive={false}
                                    activeDot={false}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}

                            {startPoint && (
                                <ReferenceDot x={startPoint.date.getTime()} y={startPoint.yValue} r={6} fill={chartColor} stroke="white" strokeWidth={2} />
                            )}
                            {endPoint && (
                                <ReferenceDot x={endPoint.date.getTime()} y={endPoint.yValue} r={6} fill={chartColor} stroke="white" strokeWidth={2} />
                            )}

                            {/* Vertical lines for selection range */}
                            {startPoint && endPoint && startPoint !== endPoint && (
                                <>
                                    <ReferenceLine x={startPoint.date.getTime()} stroke={theme.palette.text.secondary} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.5} />
                                    <ReferenceLine x={endPoint.date.getTime()} stroke={theme.palette.text.secondary} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.5} />
                                </>
                            )}
                        </AreaChart>
                    )}
                </ResponsiveContainer>
            </Box>
        </Box >
    );
}
