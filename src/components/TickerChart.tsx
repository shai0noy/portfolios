import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot, ReferenceArea } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice, formatPercent } from '../lib/currency';
import { Button, Paper, Typography } from '@mui/material';
import { useState, Fragment, useEffect } from 'react';

interface TickerChartProps {
    data: { date: number; price: number }[];
    currency: string;
}

const CustomTooltip = ({ active, payload, label, currency, t, basePrice }: any) => {
    if (active && payload && payload.length) {
        const point = payload[0].payload;
        const date = new Date(point.date);
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

const SelectionSummary = ({ selection, currency, t, onClear }: { selection: any[], currency: string, t: any, onClear: () => void }) => {
    if (selection.length < 2) {
        return null;
    }
    const [start, end] = selection;
    const priceChange = end.price - start.price;
    const percentChange = (end.price / start.price) - 1;
    const duration = (end.date - start.date) / (1000 * 60 * 60 * 24); // in days

    return (
        <Paper elevation={2} sx={{ padding: '15px', marginTop: '1rem' }}>
            <Typography variant="h6">Selection Summary</Typography>
            <Typography>
                From {new Date(start.date).toLocaleDateString()} to {new Date(end.date).toLocaleDateString()} ({Math.round(duration)} days)
            </Typography>
            <Typography>
                Price Change: {formatPrice(priceChange, currency, undefined, t)}
            </Typography>
            <Typography color={percentChange >= 0 ? 'success.main' : 'error.main'}>
                Percent Change: {formatPercent(percentChange)}
            </Typography>
            <Button onClick={onClear} size="small" sx={{ mt: 1 }}>Clear Selection</Button>
        </Paper>
    );
};


export function TickerChart({ data, currency }: TickerChartProps) {
    const { t } = useLanguage();
    const [selection, setSelection] = useState<any[]>([]);

    useEffect(() => {
        setSelection([]);
    }, [data]);

    if (!data || data.length < 2) {
        return (
            <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Not enough data to display chart.</Typography>
            </div>
        );
    }

    const handleChartClick = (chartState: any) => {
        if (chartState && chartState.xValue) {
            const clickedDate = chartState.xValue;

            // Find the closest point in data
            let closestPoint: any = null;
            let minDiff = Infinity;

            percentData.forEach(p => {
                const diff = Math.abs(p.date - clickedDate);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestPoint = p;
                }
            });

            if (closestPoint) {
                setSelection(prevSelection => {
                    if (prevSelection.length >= 2) {
                        return [closestPoint];
                    }
                    // avoid adding the same point twice
                    if (prevSelection.find(p => p.date === closestPoint!.date)) {
                        return prevSelection;
                    }
                    const newSelection = [...prevSelection, closestPoint].sort((a, b) => a.date - b.date);
                    return newSelection;
                });
            }
        }
    };

    const handleClearSelection = () => {
        setSelection([]);
    }

    const basePrice = data[0].price;
    const lastPrice = data[data.length - 1].price;
    const isUp = lastPrice >= basePrice;
    const chartColor = isUp ? '#4caf50' : '#f44336'; // Green for up, red for down

    const percentData = data.map(p => ({
        ...p,
        yValue: basePrice > 0 ? (p.price / basePrice - 1) : 0,
    }));

    const formatXAxis = (tickItem: number) => {
        return new Date(tickItem).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    };

    const yAxisTickFormatter = (tick: number) => {
        return formatPercent(tick, { maximumFractionDigits: 0 });
    }

    return (
        <Fragment>
            <div style={{ width: '100%', height: 300, marginBottom: '1rem', cursor: 'crosshair' }}>
                <ResponsiveContainer>
                    <AreaChart
                        data={percentData}
                        onClick={handleChartClick}
                        margin={{
                            top: 10,
                            right: 30,
                            left: 0,
                            bottom: 0,
                        }}
                    >
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.8} />
                                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatXAxis}
                            minTickGap={60}
                        />
                        <YAxis
                            dataKey="yValue"
                            orientation="right"
                            tickFormatter={yAxisTickFormatter}
                            domain={['auto', 'auto']}
                        />
                        <Tooltip content={<CustomTooltip currency={currency} t={t} basePrice={basePrice} />} />
                        <Area type="monotone" dataKey="yValue" stroke={chartColor} strokeWidth={2} fill="url(#chartGradient)" />
                        {selection.map(point => (
                            <ReferenceDot
                                key={point.date}
                                x={point.date}
                                y={point.yValue}
                                r={5}
                                fill={chartColor}
                                stroke="white"
                            />
                        ))}
                        {selection.length === 2 && (
                            <ReferenceArea
                                x1={selection[0].date}
                                x2={selection[1].date}
                                stroke={chartColor}
                                strokeOpacity={0.3}
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <SelectionSummary selection={selection} currency={currency} t={t} onClear={handleClearSelection} />
        </Fragment>
    );
}
