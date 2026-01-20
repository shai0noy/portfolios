import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice, formatPercent } from '../lib/currency';
import { Paper, Typography } from '@mui/material';

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

export function TickerChart({ data, currency }: TickerChartProps) {
    const { t } = useLanguage();

    if (!data || data.length < 2) {
        return (
            <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Not enough data to display chart.</Typography>
            </div>
        );
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
        <div style={{ width: '100%', height: 300, marginBottom: '1rem' }}>
            <ResponsiveContainer>
                <AreaChart
                    data={percentData}
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
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
