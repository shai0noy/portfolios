import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice, formatPercent } from '../lib/currency';
import { Paper, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState, Fragment, useEffect, useCallback, useMemo } from 'react';

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
    const { t } = useLanguage();
    const theme = useTheme();
    const [selection, setSelection] = useState({
        start: null as any | null,
        end: null as any | null,
        isSelecting: false,
    });

    useEffect(() => {
        setSelection({ start: null, end: null, isSelecting: false });
    }, [data]);

    if (!data || data.length < 2) {
        return <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography color="text.secondary">Not enough data.</Typography></div>;
    }

    const basePrice = data[0].price;
    const isUp = data[data.length - 1].price >= basePrice;
    const chartColor = isUp ? theme.palette.success.main : theme.palette.error.main;

    const percentData = useMemo(() => data.map(p => ({
        ...p,
        yValue: basePrice > 0 ? (p.price / basePrice - 1) : 0,
    })), [data, basePrice]);

    const formatXAxis = (tickItem: number) => new Date(tickItem).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    const yAxisTickFormatter = (tick: number) => formatPercent(tick, { maximumFractionDigits: 0 });

    const findClosestPoint = (date: number) => {
        return percentData.reduce((prev, curr) => Math.abs(curr.date.getTime() - date) < Math.abs(prev.date.getTime() - date) ? curr : prev);
    };

    const handleClick = useCallback((e: any) => {
        if (!e || !e.activeLabel) return;
        const point = findClosestPoint(e.activeLabel);

        setSelection(prev => {
            if (prev.isSelecting) {
                return { ...prev, end: point, isSelecting: false };
            }
            return { start: point, end: point, isSelecting: true };
        });
    }, [percentData]);

    const handleMouseMove = useCallback((e: any) => {
        if (selection.isSelecting && e && e.activeLabel) {
            const point = findClosestPoint(e.activeLabel);
            if (point.date.getTime() !== selection.end?.date?.getTime()) {
                setSelection(prev => ({ ...prev, end: point }));
            }
        }
    }, [selection.isSelecting, selection.end, percentData]);

    const selectionPoints = selection.start && selection.end ? [selection.start, selection.end].sort((a,b) => a.date.getTime() - b.date.getTime()) : [];
    const [startPoint, endPoint] = selectionPoints;

    return (
        <Fragment>
            <Box sx={{
                width: '100%',
                height: 300,
                position: 'relative',
                userSelect: 'none',
                marginBottom: '1rem',
                '& .recharts-wrapper': {
                    outline: 'none',
                },
                '& .recharts-wrapper:focus-visible': {
                    outline: 'none',
                },
                 '& .recharts-surface:focus-visible': {
                    outline: 'none',
                }
            }}>
                <SelectionSummary startPoint={startPoint} endPoint={endPoint} currency={currency} t={t} />
                <ResponsiveContainer>
                    <AreaChart
                        data={percentData}
                        onClick={handleClick}
                        onMouseMove={handleMouseMove}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.8} />
                                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis dataKey="date" tickFormatter={formatXAxis} minTickGap={60} type="number" domain={['dataMin', 'dataMax']} scale="time" />
                        <YAxis dataKey="yValue" orientation="right" tickFormatter={yAxisTickFormatter} domain={['auto', 'auto']} />
                        <Tooltip content={<CustomTooltip currency={currency} t={t} basePrice={basePrice} />} />
                        <Area type="monotone" dataKey="yValue" stroke={chartColor} strokeWidth={2} fill="url(#chartGradient)" />
                        
                        {startPoint && (
                            <ReferenceDot x={startPoint.date.getTime()} y={startPoint.yValue} r={6} fill={chartColor} stroke="white" strokeWidth={2} isFront={true} />
                        )}
                        {endPoint && (
                            <ReferenceDot x={endPoint.date.getTime()} y={endPoint.yValue} r={6} fill={chartColor} stroke="white" strokeWidth={2} isFront={true} />
                        )}
                        {startPoint && endPoint && startPoint.date.getTime() !== endPoint.date.getTime() && (
                            <path d={`M${startPoint.cx},${startPoint.cy}L${endPoint.cx},${endPoint.cy}`} stroke={chartColor} strokeWidth={2} strokeDasharray="5 5" />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </Box>
        </Fragment>
    );
}
