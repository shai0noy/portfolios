import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot, ReferenceLine } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice, formatPercent } from '../lib/currency';
import { Paper, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';import { useState, useEffect, useCallback, useMemo } from 'react';

const yAxisTickFormatter = (tick: number) => {
    return formatPercent(tick);
};

interface TickerChartProps {
    data: { date: Date; price: number }[];
    currency: string;
}

const CustomTooltip = ({ active, payload, label, currency, t, basePrice }: any) => {
    if (active && payload && payload.length) {
        const point = payload[0].payload;
        const date = point.date; // It's already a Date object
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const price = point.price;
        const percentChange = basePrice ? (price / basePrice - 1) : 0;

        return (
            <Paper elevation={3} sx={{ padding: '10px' }}>
                <Typography variant="caption" display="block">{dateStr}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatPrice(price, currency, undefined, t)}
                </Typography>
                <Typography variant="body2" sx={{ color: percentChange >= 0 ? 'success.main' : 'error.main' }}>
                    {formatPercent(percentChange)}
                </Typography>
            </Paper>
        );
    }
    return null;
};

const SelectionSummary = ({ startPoint, endPoint, currency, t }: any) => {
    if (!startPoint || !endPoint) return null;

    const theme = useTheme();
    const isDarkMode = theme.palette.mode === 'dark';

    const priceChange = endPoint.price - startPoint.price;
    const percentChange = (endPoint.price / startPoint.price) - 1;
    const duration = Math.abs(endPoint.date.getTime() - startPoint.date.getTime()) / (1000 * 60 * 60 * 24);
    const isPositive = percentChange >= 0;
    const color = isPositive ? 'success.main' : 'error.main';

    const startDateStr = new Date(Math.min(startPoint.date.getTime(), endPoint.date.getTime())).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const endDateStr = new Date(Math.max(startPoint.date.getTime(), endPoint.date.getTime())).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <Box sx={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            background: isDarkMode ? 'rgba(40, 40, 40, 0.7)' : 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(4px)',
            padding: '4px 12px',
            borderRadius: '8px',
            pointerEvents: 'none',
            textAlign: 'center',
            boxShadow: 3,
            border: `1px solid ${theme.palette.divider}`
        }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', color: isDarkMode ? 'white' : 'black' }}>
                {startDateStr} to {endDateStr} ({Math.round(duration)} days)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color }}>
                {formatPrice(priceChange, currency, undefined, t)} ({formatPercent(percentChange)})
            </Typography>
        </Box>
    );
};


export function TickerChart({ data, currency }: TickerChartProps) {
    const FADE_MS = 170;          // Speed of the opacity transition
    const TRANSFORM_MS = 360;     // Speed of the line movement (Very fast)
    const BUFFER_MS = 30;        // Safety window for browser paint
    
    // Relation Enforcement: Total delay before fading back in
    const FADE_IN_DELAY = TRANSFORM_MS + BUFFER_MS;

    const { t } = useLanguage();
    const theme = useTheme();

    const [displayData, setDisplayData] = useState(data);
    const [shadeOpacity, setShadeOpacity] = useState(1);
    
    const [selection, setSelection] = useState({
        start: null as any | null,
        end: null as any | null,
        isSelecting: false,
    });

    const dateRangeDays = useMemo(() => {
        if (!displayData || displayData.length < 2) return 0;
        const range = displayData[displayData.length - 1].date.getTime() - displayData[0].date.getTime();
        return range / (1000 * 60 * 60 * 24);
    }, [displayData]);

    const formatXAxis = useCallback((tickItem: number) => {
        const date = new Date(tickItem);
        if (dateRangeDays <= 35) { // ~1M and less
            // For the first of the month, show month to provide context
            if (date.getDate() === 1) {
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            }
            return date.toLocaleDateString(undefined, { day: 'numeric' });
        }
        if (dateRangeDays <= 366) { // up to 1Y
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        if (dateRangeDays <= 366 * 5) { // up to 5Y
            return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        }
        // > 5Y
        return date.toLocaleDateString(undefined, { year: 'numeric' });
    }, [dateRangeDays]);

    useEffect(() => {
        if (!data || data === displayData) return;

        // 1. Instant fade out
        setShadeOpacity(0);
        setSelection({ start: null, end: null, isSelecting: false });

        // 2. Wait for fade-out, then swap data (Triggers TRANSFORM_MS line move)
        const swapTimer = setTimeout(() => {
            setDisplayData(data);

            // 3. Re-enable shade ONLY after transform is guaranteed finished
            const fadeInTimer = setTimeout(() => {
                setShadeOpacity(1);
            }, FADE_IN_DELAY); 

            return () => clearTimeout(fadeInTimer);
        }, FADE_MS);

        return () => clearTimeout(swapTimer);
    }, [data, displayData, FADE_MS, FADE_IN_DELAY]);

    if (!displayData || displayData.length < 2) return null;

    // Calculations (Likeness & Gradient Offset)
    const basePrice = displayData[0].price;
    const isUp = displayData[displayData.length - 1].price >= basePrice;
    const chartColor = isUp ? theme.palette.success.main : theme.palette.error.main;

    const percentData = useMemo(() => displayData.map(p => ({
        ...p,
        yValue: basePrice > 0 ? (p.price / basePrice - 1) : 0,
    })), [displayData, basePrice]);

    const yMax = Math.max(...percentData.map(p => p.yValue));
    const yMin = Math.min(...percentData.map(p => p.yValue));

    let offset;
    if (yMin >= 0) {
        // If the entire graph is above the zero line, the "split" is at the bottom.
        offset = 1;
    } else if (yMax <= 0) {
        // If the entire graph is below the zero line, the "split" is at the top.
        offset = 0;
    } else {
        offset = Math.max(0, Math.min(1, yMax / (yMax - yMin)));
    }

    return (
        <Box sx={{ width: '100%', height: 300, position: 'relative' }}>
            <SelectionSummary startPoint={selection.start} endPoint={selection.end} currency={currency} t={t} />
            <ResponsiveContainer>
                <AreaChart data={percentData} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
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
                        domain={['dataMin', 'dataMax']}
                        scale="time"
                        tickFormatter={formatXAxis}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        tickCount={7}
                        dy={5}
                    />
                    <YAxis
                        orientation="right"
                        tickFormatter={yAxisTickFormatter}
                        width={50}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        dx={3}
                    />
                    <Tooltip content={<CustomTooltip currency={currency} t={t} basePrice={basePrice} />} />
                    <ReferenceLine y={0} stroke={theme.palette.text.secondary} strokeDasharray="3 3" />
                    
                    <Area 
                        type="monotone" 
                        dataKey="yValue" 
                        stroke={chartColor} 
                        strokeWidth={2} 
                        fill="url(#splitGradient)"
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
                </AreaChart>
            </ResponsiveContainer>
        </Box>
    );
}
