import { Box, Paper, Typography, Grid, ToggleButton, ToggleButtonGroup, IconButton, CircularProgress, useTheme, useMediaQuery, Tabs, Tab } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { fetchTickerHistory } from '../../lib/fetching';
import { Exchange } from '../../lib/types';
import { TickerChart, type ChartSeries } from '../TickerChart';
import { formatPercent } from '../../lib/currency';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { DARK_COLORS, LIGHT_COLORS } from '../../lib/hooks/useChartComparison';

interface MarketSection {
  title: string;
  tickers: { symbol: string; exchange: Exchange; name: string; nameHe?: string }[];
}

const MARKETS: MarketSection[] = [
  {
    title: 'TLV',
    tickers: [
      { symbol: '142', exchange: Exchange.TASE, name: 'TA-35', nameHe: 'ת״א-35' },
      { symbol: '137', exchange: Exchange.TASE, name: 'TA-125', nameHe: 'ת״א-125' },
      { symbol: '143', exchange: Exchange.TASE, name: 'TA-90', nameHe: 'ת״א-90' },
    ]
  },
  {
    title: 'US',
    tickers: [
      { symbol: '^GSPC', exchange: Exchange.NYSE, name: 'S&P 500', nameHe: 'S&P 500' },
      { symbol: '^IXIC', exchange: Exchange.NASDAQ, name: 'NASDAQ', nameHe: 'נאסד״ק' },
      { symbol: '^DJI', exchange: Exchange.NYSE, name: 'Dow Jones', nameHe: 'דאו ג׳ונס' },
      { symbol: '^RUT', exchange: Exchange.NYSE, name: 'Russell 2000', nameHe: 'ראסל 2000' },
    ]
  },
  {
    title: 'World',
    tickers: [
      { symbol: '^STOXX', exchange: Exchange.FWB, name: 'STOXX Europe 600', nameHe: 'STOXX Europe 600' },
      { symbol: '^FTSE', exchange: Exchange.LSE, name: 'FTSE 100 (UK)', nameHe: 'FTSE 100 (בריטניה)' },
      { symbol: '^N225', exchange: Exchange.JPX, name: 'Nikkei 225 (Japan)', nameHe: 'ניקיי 225 (יפן)' },
      { symbol: '^KS200', exchange: Exchange.KSE, name: 'KOSPI 200 (Korea)', nameHe: 'KOSPI 200 (קוריאה)' },
    ]
  }
];

type TimeRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | '10Y';
const TOGGLE_RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', '10Y'];

interface MarketViewProps {
  isMobile?: boolean;
  isActive?: boolean;
}

export function MarketViewSummary({ isMobile, isActive = true }: MarketViewProps) {
  const { t, isRtl } = useLanguage();
  const theme = useTheme();

  const getName = (ticker: any) => isRtl ? (ticker.nameHe || ticker.name) : ticker.name;

  const isMobileMediaQuery = useMediaQuery(theme.breakpoints.down('sm'));
  const isMobileRes = isMobile ?? isMobileMediaQuery;

  const colors = theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const [mobileTabIdx, setMobileTabIdx] = useState<number>(0);

  const [range, setRange] = useState<TimeRange>('6M');
  const [data, setData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);

  // Dialog State
  const [expandedSection, setExpandedSection] = useState<MarketSection | null>(null);

  const today = useMemo(() => new Date(), []);
  const startDate = useMemo(() => {
    const d = new Date(today);
    switch (range) {
      case '1W': d.setDate(d.getDate() - 7); break;
      case '1M': d.setMonth(d.getMonth() - 1); break;
      case '3M': d.setMonth(d.getMonth() - 3); break;
      case '6M': d.setMonth(d.getMonth() - 6); break;
      case 'YTD': d.setMonth(0, 1); d.setHours(0, 0, 0, 0); break;
      case '1Y': d.setFullYear(d.getFullYear() - 1); break;
      case '5Y': d.setFullYear(d.getFullYear() - 5); break;
      case '10Y': d.setFullYear(d.getFullYear() - 10); break;
      default: d.setMonth(d.getMonth() - 1); // Default 1M
    }
    return d;
  }, [range, today]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const allTickers = MARKETS.flatMap(m => m.tickers);
    const results: Record<string, any[]> = {};

    await Promise.all(allTickers.map(async (ticker) => {
      try {
        const historyData = await fetchTickerHistory(
          ticker.symbol,
          ticker.exchange,
          undefined,
          false // Use cache if available
        );

        if (historyData?.historical) {
          const hist = historyData.historical;
          if (hist.length > 0) {
            results[ticker.symbol] = hist;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch ${ticker.symbol}`, e);
      }
    }));

    setData(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isActive && !hasLoaded) {
      setHasLoaded(true);
      fetchAllData();
    }
  }, [isActive, hasLoaded, fetchAllData]);

  const processChartData = (tickers: MarketSection['tickers']) => {
    // Filter data by date range first
    const filteredData: Record<string, any[]> = {};
    tickers.forEach(t => {
      if (data[t.symbol]) {
        filteredData[t.symbol] = data[t.symbol].filter(d => d.date >= startDate);
      }
    });

    const activeTickers = tickers.filter(t => filteredData[t.symbol] && filteredData[t.symbol].length > 0);
    if (activeTickers.length === 0) return [];

    const maxPoints = 50;
    activeTickers.forEach(t => {
      const arr = filteredData[t.symbol];
      if (arr.length > maxPoints) {
        const step = Math.ceil(arr.length / maxPoints);
        const downsampled = [];
        for (let i = 0; i < arr.length; i += step) {
          downsampled.push(arr[i]);
        }
        if (downsampled[downsampled.length - 1] !== arr[arr.length - 1]) {
          downsampled.push(arr[arr.length - 1]);
        }
        filteredData[t.symbol] = downsampled;
      }
    });

    // Combine dates
    const allDates = new Set<number>();
    activeTickers.forEach(t => {
      filteredData[t.symbol].forEach(d => allDates.add(d.date.getTime()));
    });

    const sortedDates = Array.from(allDates).sort((a, b) => a - b);

    // Create chart points
    // Normalize to 0% at start
    const startValues: Record<string, number> = {};

    return sortedDates.map(dateMs => {
      const point: any = { date: dateMs };
      activeTickers.forEach(t => {
        const hist = filteredData[t.symbol];
        // Find specific entry for this date
        const entry = hist.find(d => d.date.getTime() === dateMs);

        if (entry) {
          if (!startValues[t.symbol]) startValues[t.symbol] = entry.price;
          const base = startValues[t.symbol];
          point[t.symbol] = (entry.price / base) - 1;
        }
      });
      return point;
    });
  };

  const handleOpenExpanded = (section: MarketSection) => {
    setExpandedSection(section);
  };

  const getChartSeries = useCallback((section: MarketSection | null): ChartSeries[] => {
    if (!section) return [];
    return section.tickers.map((t, index) => {
      const hist = data[t.symbol];
      if (!hist) return { name: getName(t), data: [], color: colors[index % colors.length] };

      return {
        name: getName(t),
        color: colors[index % colors.length],
        data: hist.filter(d => d.date >= startDate)
      };
    });
  }, [data, startDate, colors, isRtl]);

  const rangeSelector = (
    <ToggleButtonGroup
      value={range}
      exclusive
      onChange={(_, val) => val && setRange(val)}
      size="small"
      sx={{ height: 24 }}
    >
      {TOGGLE_RANGES.map(r => (
        <ToggleButton key={r} value={r} sx={{ px: 1, fontSize: '0.65rem' }}>{r}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  return (
    <>
      <Box sx={{ position: 'relative', height: isMobileRes ? 'auto' : 260, pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, pr: 2, pl: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
            {t('Market View', 'מבט לשווקים')}
          </Typography>
          {!isMobileRes && rangeSelector}
        </Box>

        {isMobileRes && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
            <Tabs value={mobileTabIdx} onChange={(_, val) => setMobileTabIdx(val)} variant="fullWidth" sx={{ minHeight: 36, mb: 0.5, '.MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontWeight: 'bold' } }}>
              {MARKETS.map((m, i) => (
                <Tab key={m.title} value={i} label={m.title} />
              ))}
            </Tabs>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1, pb: 0.5 }}>
              {rangeSelector}
            </Box>
          </Box>
        )}

        <Grid container spacing={2} sx={{ height: isMobileRes ? 'auto' : 'calc(100% - 32px)' }}>
          {MARKETS.map((market, index) => {
            if (isMobileRes && index !== mobileTabIdx) return null;

            const chartData = processChartData(market.tickers);

            return (
              <Grid item xs={12} md={4} key={market.title} sx={{ height: isMobileRes ? 250 : '100%' }}>
                <Paper variant="outlined" sx={{ p: 1, pb: isMobileRes ? 6 : 5, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: isMobileRes ? 'flex-end' : 'space-between', alignItems: 'center', mb: 1 }}>
                    {!isMobileRes && <Typography variant="subtitle2" fontWeight="bold">{market.title}</Typography>}
                    <IconButton size="small" onClick={() => handleOpenExpanded(market)}>
                      <OpenInNewIcon fontSize="small" sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  </Box>

                  {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ flex: 1, minHeight: 1, minWidth: 1 }}>
                        <ResponsiveContainer width="100%" height="100%"
                    minWidth={1} minHeight={1}>
                          <LineChart data={chartData} margin={{ top: 5, right: isMobileRes ? 20 : 0, left: isMobileRes ? -8 : 0, bottom: 0 }}>
                            <CartesianGrid stroke={theme.palette.text.disabled} strokeDasharray="3 3" strokeOpacity={0.4} />
                            <ReferenceLine y={0} stroke={theme.palette.text.secondary} strokeOpacity={0.5} strokeWidth={1} />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(time) => {
                                const d = new Date(time);
                                if (['1W', '1M', '3M'].includes(range)) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' });
                                if (['6M', 'YTD', '1Y'].includes(range)) return d.toLocaleDateString(undefined, { month: 'short' });
                                return d.getFullYear().toString();
                              }}
                              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                              minTickGap={30}
                              interval="preserveStartEnd"
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              orientation={theme.direction === 'rtl' ? 'left' : 'right'}
                              tickFormatter={(val) => `${(val * 100).toFixed(1)}%`}
                              domain={['auto', 'auto']}
                              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                              width={isMobileRes ? 45 : 45}
                              axisLine={false}
                              tickLine={{ stroke: theme.palette.text.secondary, strokeWidth: 1 }}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                backgroundColor: theme.palette.background.paper,
                                border: `1px solid ${theme.palette.divider}`,
                                fontSize: '0.7rem',
                                padding: '4px'
                              }}
                              formatter={(value: any, name: any) => {
                                if (value === undefined) return ['', ''];
                                const ticker = market.tickers.find(t => t.symbol === name);
                                return [formatPercent(value), ticker ? getName(ticker) : name];
                              }}
                              labelFormatter={(label) => new Date(label).toLocaleDateString()}
                            />
                            {market.tickers.map((t, i) => (
                              <Line
                                key={t.symbol}
                                type="monotone"
                                dataKey={t.symbol}
                                stroke={colors[i % colors.length]}
                                dot={false}
                                strokeWidth={1.5}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>

                      {/* Legend / Key */}
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: isMobileRes ? 0.5 : 0.5, pb: 0, justifyContent: 'center' }}>
                        {market.tickers.map((t, i) => (
                          <Box key={t.symbol} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: colors[i % colors.length] }} />
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: theme.palette.text.secondary }}>
                              {getName(t)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </>
                  )}
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      {/* Expanded Dialog */}
      <Dialog
        open={Boolean(expandedSection)}
        onClose={() => setExpandedSection(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {expandedSection?.title} - {t('Market View', 'מבט לשווקים')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ height: 400, mt: 1 }}>
            {expandedSection && (
              <TickerChart
                series={getChartSeries(expandedSection)}
                currency="USD"
                mode="percent"
                height="100%"
                    isEqualSeries={true}
                topControls={rangeSelector}
              />
            )}
          </Box>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
            {expandedSection?.tickers.map((ticker, i) => (
              <Box key={ticker.symbol} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors[i % colors.length] }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {getName(ticker)}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {t('Comparing percentage change over the selected period.', 'השוואת שינוי באחוזים לאורך התקופה הנבחרת.')}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpandedSection(null)}>{t('Close', 'סגור')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
