import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useLanguage } from '../lib/i18n';
import { formatPrice } from '../lib/currency';
import { Paper, Typography } from '@mui/material';

interface TickerChartProps {
    data: { date: number; price: number }[];
    currency: string;
}

const CustomTooltip = ({ active, payload, label, currency, t }: any) => {
    if (active && payload && payload.length) {
        const date = new Date(payload[0].payload.date);
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        return (
            <Paper elevation={3} sx={{ padding: '10px' }}>
                <Typography variant="caption" display="block">{dateStr}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatPrice(payload[0].value, currency, undefined, t)}
                </Typography>
            </Paper>
        );
    }
    return null;
};

export function TickerChart({ data, currency }: TickerChartProps) {
    const { t } = useLanguage();

    if (!data || data.length === 0) {
        return null;
    }

    const firstPrice = data[0].price;
    const lastPrice = data[data.length - 1].price;
    const isUp = lastPrice >= firstPrice;
    const chartColor = isUp ? '#4caf50' : '#f44336'; // Green for up, red for down

    const formatXAxis = (tickItem: number) => {
        return new Date(tickItem).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    };

    return (
        <div style={{ width: '100%', height: 300, marginBottom: '1rem' }}>
            <ResponsiveContainer>
                <AreaChart
                    data={data}
                    margin={{
                        top: 10,
                        right: 30,
                        left: 0,
                        bottom: 0,
                    }}
                >
                    <defs>
                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
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
                        orientation="right"
                        tickFormatter={(tick) => formatPrice(tick, currency, 0, t)}
                        domain={['dataMin', 'dataMax']}
                    />
                    <Tooltip content={<CustomTooltip currency={currency} t={t} />} />
                    <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#colorUv)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}