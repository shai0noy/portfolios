import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot, ReferenceLine } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice, formatPercent } from '../lib/currency';
import { Paper, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';import { useState, useEffect, useCallback, useMemo } from 'react';


export interface ChartSeries {
    name: string;
    data: { date: Date; price: number; adjClose?: number }[];
    color?: string;
}

interface TickerChartProps {
    series: ChartSeries[];
    currency: string;
    mode?: 'percent' | 'price';
}

const CustomTooltip = ({ active, payload, currency, t, basePrice, isComparison, series, mode }: any) => {
    if (active && payload && payload.length) {
        const point = payload[0].payload;
        const date = point.date; // It's already a Date object
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        if (isComparison) {
            const mainValue = point.yValue;
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

                            if (index === 0) {
                                // Main series
                                value = point.yValue;
                                // The main series color is dynamic, find it in the payload.
                                const payloadEntry = payload.find((p: any) => p.dataKey === 'yValue');
                                color = payloadEntry?.color;
                            } else {
                                // Comparison series
                                const dataKey = `series_${index - 1}`;
                                value = point[dataKey];
                                color = s.color; // Color is stored in the series object for comparisons.
                            }

                            let diff: number | undefined;
                            if (index !== 0 && value !== null && value !== undefined && mainValue !== null && mainValue !== undefined) {
                                if (mode === 'percent') {
                                    diff = (1 + value) / (1 + mainValue) - 1;
                                } else {
                                    diff = (mainValue !== 0) ? (value / mainValue - 1) : 0;
                                }
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
                                                ? (mode === 'percent' ? formatPercent(value) : formatPrice(value, currency, undefined, t)) 
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
        
        const val = point.adjClose || point.price;
        const percentChange = basePrice ? (val / basePrice - 1) : 0;

        return (
            <Paper elevation={3} sx={{ padding: '10px' }}>
                <Typography variant="caption" display="block">{dateStr}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatPrice(val, currency, undefined, t)}
                </Typography>
                <Typography variant="body2" sx={{ color: percentChange >= 0 ? 'success.main' : 'error.main' }}>
                    {formatPercent(percentChange)}
                </Typography>
            </Paper>
        );
    }
    return null;
};

const SelectionSummary = ({ startPoint, endPoint, currency, t, isComparison, series, mainLineColor, mode }: any) => {
    if (!startPoint || !endPoint) return null;

    const theme = useTheme();
    const isDarkMode = theme.palette.mode === 'dark';

    const startDate = new Date(Math.min(startPoint.date.getTime(), endPoint.date.getTime()));
    const endDate = new Date(Math.max(startPoint.date.getTime(), endPoint.date.getTime()));
    const startDateStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const endDateStr = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
                startVal = startPoint.yValue;
                endVal = endPoint.yValue;
            } else { // Comparison series
                const dataKey = `series_${index - 1}`;
                startVal = startPoint[dataKey];
                endVal = endPoint[dataKey];
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
    const startVal = startPoint.adjClose || startPoint.price;
    const endVal = endPoint.adjClose || endPoint.price;

    const priceChange = endVal - startVal;
    const percentChange = (startVal !== 0) ? (endVal / startVal) - 1 : 0;
    const isPositive = percentChange >= 0;
    const color = isPositive ? 'success.main' : 'error.main';

    return (
        <Box sx={{...boxStyle, textAlign: 'center', minWidth: 'auto'}}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', color: isDarkMode ? 'white' : 'black' }}>
                {startDateStr} to {endDateStr} ({duration} days)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color }}>
                {formatPrice(priceChange, currency, undefined, t)} ({formatPercent(percentChange)})
            </Typography>
        </Box>
    );
};

export function TickerChart({ series, currency, mode = 'percent' }: TickerChartProps) {
    const FADE_MS = 170;          // Speed of the opacity transition
    const TRANSFORM_MS = 360;     // Speed of the line movement (Very fast)
    const BUFFER_MS = 30;        // Safety window for browser paint
    
    // Relation Enforcement: Total delay before fading back in
    const FADE_IN_DELAY = TRANSFORM_MS + BUFFER_MS;

    const { t } = useLanguage();
    const theme = useTheme();

    const [displaySeries, setDisplaySeries] = useState(series);
    const [shadeOpacity, setShadeOpacity] = useState(1);
    
    const [selection, setSelection] = useState({
        start: null as any | null,
        end: null as any | null,
        isSelecting: false,
    });

    const mainSeries = displaySeries?.[0];
    const isComparison = displaySeries.length > 1;

    const dateRangeDays = useMemo(() => {
        if (!mainSeries?.data || mainSeries.data.length < 2) return 0;
        const range = mainSeries.data[mainSeries.data.length - 1].date.getTime() - mainSeries.data[0].date.getTime();
        return range / (1000 * 60 * 60 * 24);
    }, [mainSeries]);

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

        // 1. Instant fade out
        setShadeOpacity(0);
        setSelection({ start: null, end: null, isSelecting: false });

        // 2. Wait for fade-out, then swap data (Triggers TRANSFORM_MS line move)
        const swapTimer = setTimeout(() => {
            setDisplaySeries(series);

            // 3. Re-enable shade ONLY after transform is guaranteed finished
            const fadeInTimer = setTimeout(() => {
                setShadeOpacity(1);
            }, FADE_IN_DELAY); 

            return () => clearTimeout(fadeInTimer);
        }, FADE_MS);

        return () => clearTimeout(swapTimer);
    }, [series, displaySeries, FADE_MS, FADE_IN_DELAY]);

    // Move hooks above the conditional return
    const chartData = useMemo(() => {
        if (!mainSeries?.data || mainSeries.data.length < 1) return [];
        // Use adjClose if available, otherwise price. 
        // Important: Must use consistent field for base and current to get correct % change.
        const first = mainSeries.data[0];
        const basePrice = first.adjClose || first.price;
        
        const processedMain = mainSeries.data.map(p => {
            const val = p.adjClose || p.price;
            return {
                ...p,
                yValue: mode === 'percent' ? (basePrice > 0 ? (val / basePrice - 1) : 0) : val,
            };
        });

        // Merge other series
        const otherSeries = displaySeries.slice(1);
        if (otherSeries.length === 0) return processedMain;
        
        // Create pointers for each comparison series for an efficient merge
        const seriesPointers = otherSeries.map(() => 0);
 
        return processedMain.map(p => {
            const point: any = { ...p };
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
                if (match) {
                    const val = match.adjClose || match.price;
                    // Normalize other series to its own start in the visible range
                    const sFirst = s.data[0];
                    const sBase = sFirst.adjClose || sFirst.price;
                    point[`series_${i}`] = mode === 'percent' ? (sBase > 0 ? (val / sBase - 1) : 0) : val;
                }
            });
            return point;
        });
    }, [displaySeries, mode, mainSeries]);

    const { yMin, yMax } = useMemo(() => {
        if (!chartData || chartData.length === 0) return { yMin: 0, yMax: 0 };
        let min = Infinity;
        let max = -Infinity;
        chartData.forEach((p: any) => {
            if (p.yValue < min) min = p.yValue;
            if (p.yValue > max) max = p.yValue;
            // Check others
            Object.keys(p).forEach(k => {
                if (k.startsWith('series_')) {
                    const v = p[k];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            });
        });
        return { yMin: min, yMax: max };
    }, [chartData]);

    const formatYAxis = useCallback((tick: number) => {
        if (mode === 'price') {
            return formatPrice(tick, currency, 0, t);
        }
        const range = yMax - yMin;
        const decimals = range > 0.1 ? 0 : 1; 
        return '\u200E' + new Intl.NumberFormat(undefined, {
            style: 'percent',
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        }).format(tick);
    }, [yMin, yMax, mode, currency, t]);

    const findClosestPoint = useCallback((date: number) => {
        const data = chartData;
        if (!data || data.length === 0) return null;
        // Optimization: Binary search for O(log N) lookup
        let low = 0;
        let high = data.length - 1;
        
        if (date <= data[0].date.getTime()) return data[0] as any;
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
            return data[low - 1] as any;
        }
        return data[low] as any;
    }, [chartData]);

    const handleClick = useCallback((e: any) => {
        if (!e || !e.activeLabel) return;
        const point = findClosestPoint(e.activeLabel);
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
            const point = findClosestPoint(e.activeLabel);
            if (point && point.date.getTime() !== selection.end?.date?.getTime()) {
                setSelection(prev => ({ ...prev, end: point }));
            }
        }
    }, [selection.isSelecting, selection.end, findClosestPoint]);

    const selectionPoints = selection.start && selection.end ? [selection.start, selection.end].sort((a,b) => a.date.getTime() - b.date.getTime()) : [];
    const [startPoint, endPoint] = selectionPoints;

    const finalData = useMemo(() => {
        if (!startPoint || !endPoint || startPoint === endPoint) return chartData;
        
        const startIndex = chartData.indexOf(startPoint);
        const endIndex = chartData.indexOf(endPoint);

        if (startIndex === -1 || endIndex === -1) return chartData;

        // Optimization: Recycle objects outside the range, map only the range
        return [
            ...chartData.slice(0, startIndex),
            ...chartData.slice(startIndex, endIndex + 1).map((p: any) => ({ ...p, highlightedY: p.yValue })),
            ...chartData.slice(endIndex + 1)
        ];
    }, [chartData, startPoint, endPoint]);

    const xMin = chartData.length > 0 ? chartData[0].date.getTime() : null;
    const xMax = chartData.length > 0 ? chartData[chartData.length - 1].date.getTime() : null;

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
            const yearInterval = dateRangeDays <= 366 * 5 ? 1 : Math.ceil(dateRangeDays / (365 * 5));
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

    if (!mainSeries?.data || mainSeries.data.length < 2 || chartData.length < 2) {
        return (
            <Box sx={{
                width: '100%',
                height: 300,
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
    const chartColor = isUp ? theme.palette.success.main : theme.palette.error.main;    const mainLineColor = isComparison ? theme.palette.text.primary : chartColor;

    // Determine the split threshold
    const threshold = mode === 'price' ? basePrice : 0;

    let offset;
    if (yMin >= threshold) {
        // Entirely positive
        offset = 1; 
    } else if (yMax <= threshold) {
        // Entirely negative
        offset = 0;
    } else {
        // Split
        offset = Math.max(0, Math.min(1, (yMax - threshold) / (yMax - yMin)));
    }

    return (
        <Box sx={{
            width: '100%',
            height: 300,
            minWidth: 0,
            position: 'relative',
            userSelect: 'none',
            '& *': {
                outline: 'none !important',
            }
        }}>
            <SelectionSummary startPoint={startPoint} endPoint={endPoint} currency={currency} t={t} isComparison={isComparison} series={displaySeries} mainLineColor={mainLineColor} mode={mode} />
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={finalData}
                    onClick={handleClick}
                    onMouseMove={handleMouseMove}
                    margin={{ top: 10, right: 5, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="splitGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                            <stop offset={offset} stopColor={theme.palette.success.main} stopOpacity={0.02} />
                            <stop offset={offset} stopColor={theme.palette.error.main} stopOpacity={0.02} />
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
                        dy={5}
                    />
                    <YAxis
                        orientation="right"
                        tickFormatter={formatYAxis}
                        width={mode === 'price' ? 60 : 50}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        dx={3}
                        domain={[yMin, yMax]}
                    />
                    <Tooltip content={<CustomTooltip currency={currency} t={t} basePrice={basePrice} isComparison={isComparison} series={displaySeries} mode={mode} />} />
                    <ReferenceLine y={threshold} stroke={theme.palette.text.secondary} strokeDasharray="3 3" />
                    
                    {displaySeries.slice(1).map((s, i) => (
                        <Line
                            key={i}
                            type="monotone" 
                            dataKey={`series_${i}`} 
                            stroke={s.color} 
                            strokeWidth={2} 
                            dot={false}
                            isAnimationActive={true}
                            connectNulls
                            animationDuration={TRANSFORM_MS}
                            animationEasing="ease-in-out"
                        />
                    ))}

                    <Area 
                        type="monotone" 
                        dataKey="yValue" 
                        stroke={mainLineColor} 
                        strokeWidth={2} 
                        fill={isComparison ? "none" : "url(#splitGradient)"}
                        fillOpacity={shadeOpacity}
                        isAnimationActive={true}
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
            </ResponsiveContainer>
        </Box>
    );
}
