import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Typography,
  ToggleButtonGroup, ToggleButton, IconButton, useTheme,
  useMediaQuery, Grid, Paper, CircularProgress, Stack, Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EventIcon from '@mui/icons-material/Event';
import { useLanguage } from '../../lib/i18n';
import { formatMoneyValue, formatPercent } from '../../lib/currencyUtils';
import { getTickerData } from '../../lib/fetching';
import { Exchange, type DashboardHolding, type Transaction } from '../../lib/types';
import { useResponsiveDialogProps, useScrollShadows, ScrollShadows } from '../../lib/ui-utils';
import { getRecentEventsData } from './RecentEventsCard';

interface PortfolioBriefingDialogProps {
  open: boolean;
  onClose: () => void;
  holdings: DashboardHolding[];
  transactions: Transaction[];
  displayCurrency: string;
}

type Timeframe = '1D' | '1W' | '1M';

export function generateBriefingText(
  timeframe: '1D' | '1W' | '1M',
  stats: { totalGain: number, totalPct: number, totalPct1M: number },
  marketData: { spx?: number, ndx?: number, tlv?: number },
  displayCurrency: string,
  t: (key: string, backup: string) => string
): string {
  const pfAbsPct = Math.abs(stats.totalPct);
  const isUp = stats.totalGain > 0;
  const gainStr = formatMoneyValue({ amount: Math.abs(stats.totalGain), currency: displayCurrency as any }, undefined, 0);
  const pctStr = formatPercent(stats.totalPct);

  const mktUS = marketData.spx !== undefined ? marketData.spx : (marketData.ndx || 0);
  const mktIL = marketData.tlv || 0;

  const timeWord = timeframe === '1D' ? t('Today', 'היום') : timeframe === '1W' ? t('This week', 'השבוע') : t('This month', 'החודש');

  const moveSentence = getMoveSentence(timeWord, pfAbsPct, isUp, gainStr, pctStr, t);
  const marketSentence = getMarketSentence(pfAbsPct, isUp, mktUS, mktIL, t);
  const trendSentence = getTrendSentence(timeframe, pfAbsPct, isUp, stats.totalPct1M, t);

  return [moveSentence, marketSentence, trendSentence].filter(Boolean).join('\n');
}

function getMoveSentence(timeWord: string, pfAbsPct: number, isUp: boolean, gainStr: string, pctStr: string, t: any) {
  if (pfAbsPct < 0.005) {
    return t(`${timeWord}, your portfolio saw a small change of ${gainStr} (${pctStr}).`, `${timeWord}, התיק רשם שינוי קל בלבד של ${gainStr} (${pctStr}).`);
  }
  if (pfAbsPct > 0.04) {
    return isUp
      ? t(`${timeWord}, your portfolio experienced a sharp jump, soaring by ${gainStr} (${pctStr}).`, `${timeWord}, התיק חווה עלייה חדה, עם זינוק של ${gainStr} (${pctStr}).`)
      : t(`${timeWord}, your portfolio suffered a sharp drop, plunging by ${gainStr} (${pctStr}).`, `${timeWord}, התיק חווה ירידה חדה, בסך ${gainStr} (${pctStr}).`);
  }
  if (pfAbsPct > 0.015) {
    return isUp
      ? t(`${timeWord}, your portfolio experienced a notable jump, gaining ${gainStr} (${pctStr}).`, `${timeWord}, התיק רשם עלייה בולטת של ${gainStr} (${pctStr}).`)
      : t(`${timeWord}, your portfolio suffered a notable drop, losing ${gainStr} (${pctStr}).`, `${timeWord}, התיק רשם ירידה בולטת של ${gainStr} (${pctStr}).`);
  }
  return isUp
    ? t(`${timeWord}, your portfolio is up by ${gainStr} (${pctStr}).`, `${timeWord}, התיק שלך בעלייה של ${gainStr} (${pctStr}).`)
    : t(`${timeWord}, your portfolio is down by ${gainStr} (${pctStr}).`, `${timeWord}, התיק שלך בירידה של ${gainStr} (${pctStr}).`);
}

function getMarketSentence(pfAbsPct: number, isUp: boolean, mktUS: number, mktIL: number, t: any) {
  if (pfAbsPct < 0.005) return "";

  const isUSDrop = mktUS < -0.01;
  const isUSJump = mktUS > 0.01;
  const isILDrop = mktIL < -0.01;
  const isILJump = mktIL > 0.01;

  if (!isUp && (isUSDrop || isILDrop)) {
    return isUSDrop
      ? t(`This pullback mirrors a broader selloff in the US markets.`, `הירידה הזו משקפת מגמה שלילית רוחבית בשווקי ארה"ב.`)
      : t(`This pullback reflects a red day in the local IL market.`, `המגמה השלילית תואמת ירידות בשוק המקומי (ת"א).`);
  }
  if (isUp && (isUSJump || isILJump)) {
    return isUSJump
      ? t(`This rally aligns with strong positive momentum in the US markets.`, `העלייה הזו תואמת מומנטום חיובי חזק בשווקי ארה"ב.`)
      : t(`This aligns with a strong day in the local IL market.`, `העליות בתיק משתלבות עם יום ירוק בבורסה המקומית.`);
  }
  if (isUp && mktUS < 0) {
    return t(`Impressively, your portfolio gained value despite a red US market.`, `מרשים לראות שהתיק עלה למרות ירידות בשווקי ארה"ב.`);
  }
  if (!isUp && mktUS > 0) {
    return t(`The portfolio trended downwards despite a generally positive US market.`, `התיק ירד חרף מגמה כללית חיובית בשווקי ארה"ב.`);
  }
  return "";
}

function getTrendSentence(timeframe: string, pfAbsPct: number, isUp: boolean, totalPct1M: number, t: any) {
  if (timeframe === '1M' || pfAbsPct < 0.005) return "";

  const is1mUp = totalPct1M >= 0;
  const monthlyFormatted = formatPercent(totalPct1M);

  if (isUp && is1mUp) {
    return t(`This continues a solid 30-day uptrend (${monthlyFormatted}).`, `ממשיך מגמה חיובית יציבה של החודש האחרון (${monthlyFormatted}).`);
  }
  if (isUp && !is1mUp) {
    return t(`This helps reverse an ongoing 30-day slump (${monthlyFormatted}).`, `עלייה זו מסייעת לתקן את הירידה של החודש האחרון (${monthlyFormatted}).`);
  }
  if (!isUp && !is1mUp) {
    return t(`This adds to a bearish 30-day trend (${monthlyFormatted}).`, `ירידה זו מעמיקה את המגמה השלילית של 30 הימים האחרונים (${monthlyFormatted}).`);
  }
  return t(`A minor pullback following a strong 30-day gain (${monthlyFormatted}).`, `תיקון קל למטה אחרי חודש רווחי בסך הכל (${monthlyFormatted}).`);
}

export function PortfolioBriefingDialog({ open, onClose, holdings, transactions, displayCurrency }: PortfolioBriefingDialogProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const responsiveProps = useResponsiveDialogProps();

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [marketData, setMarketData] = useState<{ spx?: number, ndx?: number, tlv?: number }>({});
  const [loadingMarket, setLoadingMarket] = useState(false);

  const { containerRef, showTop, showBottom } = useScrollShadows('vertical');

  useEffect(() => {
    if (open) {
      setLoadingMarket(true);
      Promise.all([
        getTickerData('^SPX', Exchange.NASDAQ, null, undefined, false),
        getTickerData('^IXIC', Exchange.NASDAQ, null, undefined, false),
        getTickerData('137', Exchange.TASE, 137, undefined, false)
      ]).then(([spx, ndx, tlv]) => {
        setMarketData({
          spx: spx?.[timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : 'changePct1m'] || 0,
          ndx: ndx?.[timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : 'changePct1m'] || 0,
          tlv: tlv?.[timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : 'changePct1m'] || 0
        });
      }).finally(() => setLoadingMarket(false));
    }
  }, [open, timeframe]);

  const stats = useMemo(() => {
    let totalStartVal = 0;
    let totalEndVal = 0;
    let totalStartVal1M = 0;

    const movers = holdings.map(h => {
      const val = h.display.marketValue;
      let pct = 0;
      if (timeframe === '1D') pct = h.display.dayChangePct || 0;
      else if (timeframe === '1W') pct = h.perf1w || 0;
      else pct = h.perf1m || 0;

      const base = val / (1 + pct);
      const gain = val - base;

      const pct1M = h.perf1m || 0;
      const base1M = val / (1 + pct1M);

      return { ticker: h.ticker, name: h.displayName || h.longName || h.nameHe || h.ticker, gain, pct, val, base, base1M };
    });

    for (const m of movers) {
      totalStartVal += m.base;
      totalEndVal += m.val;
      totalStartVal1M += m.base1M;
    }

    const totalGain = totalEndVal - totalStartVal;
    const totalPct = totalStartVal > 0 ? totalGain / totalStartVal : 0;
    const totalPct1M = totalStartVal1M > 0 ? (totalEndVal - totalStartVal1M) / totalStartVal1M : 0;

    movers.sort((a, b) => b.gain - a.gain);
    const topGainers = movers.filter(m => m.gain > 0).slice(0, 3);
    const topLosers = movers.filter(m => m.gain < 0).reverse().slice(0, 3);

    return { totalGain, totalPct, totalPct1M, topGainers, topLosers };
  }, [holdings, timeframe]);

  const recentEvents = useMemo(() => {
    const allEvents = getRecentEventsData(holdings, transactions, t);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allEvents.filter(ev => {
      const evDate = new Date(ev.date);
      evDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((evDate.getTime() - today.getTime()) / 86400000);

      if (timeframe === '1D') return diffDays >= 0 && diffDays <= 1;
      if (timeframe === '1W') return diffDays >= -7 && diffDays <= 1;
      return diffDays >= -30 && diffDays <= 1;
    }).slice(0, 4);
  }, [holdings, transactions, t, timeframe]);

  const renderStatCard = (title: string, _v: string, pct: number, bg: string, color: string) => (
    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: bg, color: color, borderRadius: 2, flex: 1, borderColor: 'divider' }}>
      <Typography variant="body2" sx={{ opacity: 0.8, fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5, fontWeight: 'bold' }}>
        {pct >= 0 ? <ArrowUpwardIcon fontSize="inherit" color="success" /> : <ArrowDownwardIcon fontSize="inherit" color="error" />}
        {formatPercent(pct)}
      </Typography>
    </Paper>
  );

  return (
    <Dialog open={open} onClose={onClose} {...responsiveProps} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle component="div" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" component="div" fontWeight={800}>{t('Portfolio Briefing', 'סיכום התיק')}</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box
          ref={containerRef}
          sx={{
            px: isMobile ? 2 : 3,
            pt: 2,
            pb: 4,
            overflowY: 'auto',
            flexGrow: 1,
            '&::-webkit-scrollbar': { display: 'none' },
            msOverflowStyle: 'none',
            scrollbarWidth: 'none'
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <ToggleButtonGroup
              value={timeframe}
              exclusive
              onChange={(_, val) => val && setTimeframe(val)}
              size="small"
              sx={{
                bgcolor: 'action.hover',
                p: 0.5,
                borderRadius: 2,
                '& .MuiToggleButtonGroup-grouped': {
                  margin: 0,
                  border: 0,
                  borderRadius: 1.5,
                  '&.Mui-disabled': { border: 0 },
                  '&:not(:first-of-type)': { borderRadius: 1.5 },
                  '&:first-of-type': { borderRadius: 1.5 },
                },
                '& .Mui-selected': {
                  bgcolor: 'background.paper',
                  boxShadow: 1,
                  color: 'text.primary',
                  '&:hover': { bgcolor: 'background.paper' },
                }
              }}
            >
              <ToggleButton value="1D" sx={{ px: 3, py: 0.75, fontWeight: 'bold', color: 'text.secondary' }}>{t('1 Day', 'יומי')}</ToggleButton>
              <ToggleButton value="1W" sx={{ px: 3, py: 0.75, fontWeight: 'bold', color: 'text.secondary' }}>{t('1 Week', 'שבועי')}</ToggleButton>
              <ToggleButton value="1M" sx={{ px: 3, py: 0.75, fontWeight: 'bold', color: 'text.secondary' }}>{t('1 Month', 'חודשי')}</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover', border: 1, borderColor: 'divider', mb: 3 }}>
            <Typography variant="body1" sx={{ fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {generateBriefingText(timeframe, stats, marketData, displayCurrency, t)}
            </Typography>
          </Box>

          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1, color: 'text.secondary' }}>{t('Market Benchmark', 'השוואת שוק')}</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
            {renderStatCard(t('Portfolio', 'התיק שלי'), '', stats.totalPct, 'transparent', 'text.primary')}
            {loadingMarket ? (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress size={20} /></Box>
            ) : (
              <>
                {renderStatCard('S&P 500', '', marketData.spx || 0, 'transparent', 'text.primary')}
                {renderStatCard('NASDAQ', '', marketData.ndx || 0, 'transparent', 'text.primary')}
                {renderStatCard('TA-125', '', marketData.tlv || 0, 'transparent', 'text.primary')}
              </>
            )}
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, color: 'success.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ArrowUpwardIcon fontSize="small" /> {t('Top Gainers', 'עולות')}
              </Typography>
              <Stack spacing={1.5}>
                {stats.topGainers.map(m => {
                  const percentageWidth = Math.min(100, Math.max(2, (m.gain / Math.max(0.01, stats.topGainers[0]?.gain || 1)) * 100));
                  return (
                    <Box key={m.ticker} sx={{ position: 'relative', overflow: 'hidden', p: 1.5, py: 1, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                      {(timeframe !== '1D') && (
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 'auto', height: '100%', width: `${percentageWidth}%`, bgcolor: 'success.main', opacity: 0.12, transition: 'width 1s ease-out' }} />
                      )}
                      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" fontWeight="bold" noWrap title={m.name} sx={{ mb: 0.25 }}>{m.name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                          <Typography variant="body2" fontWeight="bold" color="success.main"><span dir="ltr">+{formatMoneyValue({ amount: m.gain, currency: displayCurrency as any }, undefined, 0)}</span></Typography>
                          <Typography variant="caption" color="success.main" sx={{ fontWeight: 'bold' }}>
                            {formatPercent(m.pct)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
                {stats.topGainers.length === 0 && <Typography variant="caption" color="text.secondary">{t('No gainers', 'אין')}</Typography>}
              </Stack>
            </Grid>

            <Grid item xs={6}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ArrowDownwardIcon fontSize="small" /> {t('Top Losers', 'יורדות')}
              </Typography>
              <Stack spacing={1.5}>
                {stats.topLosers.map(m => {
                  const percentageWidth = Math.min(100, Math.max(2, (m.gain / Math.min(-0.01, stats.topLosers[0]?.gain || -1)) * 100));
                  return (
                    <Box key={m.ticker} sx={{ position: 'relative', overflow: 'hidden', p: 1.5, py: 1, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                      {(timeframe !== '1D') && (
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 'auto', height: '100%', width: `${percentageWidth}%`, bgcolor: 'error.main', opacity: 0.12, transition: 'width 1s ease-out' }} />
                      )}
                      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" fontWeight="bold" noWrap title={m.name} sx={{ mb: 0.25 }}>{m.name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                          <Typography variant="body2" fontWeight="bold" color="error.main"><span dir="ltr">{formatMoneyValue({ amount: m.gain, currency: displayCurrency as any }, undefined, 0)}</span></Typography>
                          <Typography variant="caption" color="error.main" sx={{ fontWeight: 'bold' }}>
                            {formatPercent(m.pct)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
                {stats.topLosers.length === 0 && <Typography variant="caption" color="text.secondary">{t('No losers', 'אין')}</Typography>}
              </Stack>
            </Grid>
          </Grid>

          {recentEvents.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, mt: 1, color: 'text.secondary' }}>{t('Key Events & Updates', 'אירועים מרכזיים')}</Typography>
              <Stack spacing={1}>
                {recentEvents.map(ev => {
                  const h = holdings.find(h => h.ticker === ev.ticker);
                  const holdingName = h ? (h.displayName || h.longName || h.nameHe || h.ticker) : ev.ticker;
                  return (
                    <Paper key={ev.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
                      <Box sx={{ fontSize: '1.2rem', lineHeight: 1 }}><EventIcon fontSize="inherit" /></Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight="bold" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{holdingName} &middot; {ev.titleStr}</span>
                          <Typography component="span" variant="caption" color="text.secondary">{ev.dateDisplay}</Typography>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{ev.desc}</Typography>
                      </Box>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          )}
        </Box>
        <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
      </DialogContent>
    </Dialog>
  );
}
