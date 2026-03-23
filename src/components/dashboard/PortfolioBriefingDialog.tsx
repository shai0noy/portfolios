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
  stats: { totalGain: number, totalPct: number, totalPct1M: number, allMovers?: { name: string, pct: number, gain: number }[] },
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
  const moversSentence = getNotableMoversSentence(stats, t);

  return [moveSentence, marketSentence, trendSentence, moversSentence].filter(Boolean).join('\n\n');
}

function getNotableMoversSentence(stats: { totalPct: number, allMovers?: { name: string, pct: number, gain: number }[] }, t: any) {
  if (!stats.allMovers || stats.allMovers.length === 0) return "";

  const pfPct = stats.totalPct;
  const NOTABLE_THRESHOLD = 0.02;

  // Find movers that significantly outperformed the portfolio (rose >= 2% AND rose MORE than the portfolio)
  const outperforming = stats.allMovers.filter(m => m.pct >= NOTABLE_THRESHOLD && m.pct > pfPct);
  // Find movers that significantly underperformed the portfolio (fell <= -2% AND fell WORSE than the portfolio)
  const underperforming = stats.allMovers.filter(m => m.pct <= -NOTABLE_THRESHOLD && m.pct < pfPct);

  outperforming.sort((a, b) => b.pct - a.pct);
  underperforming.sort((a, b) => a.pct - b.pct);

  const topOut = outperforming.slice(0, 2);
  const topUnder = underperforming.slice(0, 2);

  if (topOut.length === 0 && topUnder.length === 0) return "";

  const formatList = (list: { name: string, pct: number }[]) =>
    list.map(m => `${m.name} (${formatPercent(m.pct)})`).join(t(' and ', ' ו-'));

  if (topOut.length > 0 && topUnder.length > 0) {
    return t(
      `Notably, ${formatList(topOut)} outperformed, while ${formatList(topUnder)} saw significant drops.`,
      `ראוי לציון כי ${formatList(topOut)} בלטו לחיוב לראש הפסגה, בעוד ש-${formatList(topUnder)} רשמו ירידות משמעותיות.`
    );
  } else if (topOut.length > 0) {
    if (pfPct < 0) {
      return t(`Bright spots included ${formatList(topOut)}, which bucked the downward trend.`, `נקודות האור כללו את ${formatList(topOut)}, שעלו בניגוד למגמה השלילית בתיק.`);
    } else {
      return t(`Key drivers pushing the portfolio included ${formatList(topOut)}.`, `עליות התיק הובלו בין היתר על ידי ${formatList(topOut)} שבלטו במיוחד.`);
    }
  } else if (topUnder.length > 0) {
    if (pfPct > 0) {
      return t(`However, ${formatList(topUnder)} lagged behind with notable drops.`, `עם זאת, ${formatList(topUnder)} רשמו ירידות משמעותיות במנוגד למגמה הכללית בתיק.`);
    } else {
      return t(`The decline was largely driven by heavy drops in ${formatList(topUnder)}.`, `ירידות אלו הובלו והוחמרו בעיקר בעקבות צניחה של ${formatList(topUnder)}.`);
    }
  }

  return "";
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

  const isUSSharpDrop = mktUS <= -0.02;
  const isUSDrop = mktUS < -0.005 && !isUSSharpDrop;
  const isUSSharpJump = mktUS >= 0.02;
  const isUSJump = mktUS > 0.005 && !isUSSharpJump;

  const isILSharpDrop = mktIL <= -0.02;
  const isILDrop = mktIL < -0.005 && !isILSharpDrop;
  const isILSharpJump = mktIL >= 0.02;
  const isILJump = mktIL > 0.005 && !isILSharpJump;

  if (isUp) {
    if ((isILJump || isILSharpJump) && (isUSDrop || isUSSharpDrop)) {
      const usText = isUSSharpDrop ? t(`sharp drops in the US markets`, `ירידות חדות בשווקי ארה"ב`) : t(`a red US market`, `ירידות מתונות בשווקי ארה"ב`);
      return t(`The portfolio showed an increase following Israeli market trends, despite ${usText}.`, `העליות בתיק משתלבות עם המגמה החיובית בשוק הישראלי, למרות ${usText}.`);
    }
    if ((isUSJump || isUSSharpJump) && (isILDrop || isILSharpDrop)) {
      const ilText = isILSharpDrop ? t(`sharp drops in the local IL market`, `ירידות חדות בשוק המקומי`) : t(`a red local market`, `ירידות מתונות בשוק המקומי`);
      const usText = isUSSharpJump ? t(`a strong surge in the US markets`, `ראלי חד בשווקי ארה"ב`) : t(`positive momentum in the US markets`, `מומנטום חיובי בארה"ב`);
      return t(`This rally aligns with ${usText}, despite ${ilText}.`, `העליות בתיק תואמות ל${usText}, למרות ${ilText}.`);
    }
    if (isUSSharpJump || isUSJump || isILSharpJump || isILJump) {
      if (isUSSharpJump) return t(`This rally aligns with a broader surge in the US markets.`, `העלייה הזו תואמת לראלי שורי חזק בשווקי ארה"ב.`);
      if (isUSJump) return t(`This rally aligns with steady positive momentum in the US markets.`, `העלייה הזו תואמת מומנטום חיובי מתון בשווקי ארה"ב.`);
      if (isILSharpJump) return t(`This aligns with a very strong green day in the local IL market.`, `העליות בתיק משתלבות עם יום ירוק עז בבורסה המקומית.`);
      if (isILJump) return t(`This aligns with a solid green day in the local IL market.`, `העליות בתיק משתלבות עם יום חיובי בבורסה המקומית.`);
    }
    if (mktUS < 0 && mktIL < 0) {
      return t(`Impressively, your portfolio gained value despite red markets in both the US and IL.`, `מרשים לראות שהתיק עלה למרות יום אדום בשווקי ארה"ב וישראל.`);
    }
    if (mktUS < 0) {
      const usText = isUSSharpDrop ? t(`sharp drops in the US`, `ירידות חדות בארה"ב`) : t(`a red US market`, `מגמה שלילית בארה"ב`);
      return t(`Impressively, your portfolio gained value despite ${usText}.`, `מרשים לראות שהתיק עלה למרות ${usText}.`);
    }
    if (mktIL < 0) {
      const ilText = isILSharpDrop ? t(`sharp drops in the local market`, `ירידות חדות בשוק הישראלי`) : t(`a red IL market`, `מגמה שלילית בארץ`);
      return t(`Impressively, your portfolio gained value despite ${ilText}.`, `מרשים לראות שהתיק עלה למרות ${ilText}.`);
    }
  } else {
    // isUp === false
    if ((isILDrop || isILSharpDrop) && (isUSJump || isUSSharpJump)) {
      const usText = isUSSharpJump ? t(`a broad rally in the US`, `ראלי חזק בארה"ב`) : t(`positive momentum in the US`, `מומנטום חיובי בארה"ב`);
      return t(`This pullback reflects a red day in the local IL market, despite ${usText}.`, `המגמה השלילית תואמת לירידות בשוק המקומי, למרות ${usText}.`);
    }
    if ((isUSDrop || isUSSharpDrop) && (isILJump || isILSharpJump)) {
      const usText = isUSSharpDrop ? t(`a massive selloff in the US markets`, `מגמה אדומה בוהקת בארה"ב`) : t(`a broader selloff in the US markets`, `מגמה שלילית רוחבית בשווקי ארה"ב`);
      return t(`This pullback mirrors ${usText}, despite a green day in the local IL market.`, `הירידה הזו משקפת את ה${usText}, חרף עליות בבורסה המקומית.`);
    }
    if (isUSSharpDrop || isUSDrop || isILSharpDrop || isILDrop) {
      if (isUSSharpDrop) return t(`This sharp pullback mirrors a major selloff in the US markets.`, `הירידה הזו משקפת יום אדום במיוחד ומגמה שלילית רוחבית בשווקי ארה"ב.`);
      if (isUSDrop) return t(`This pullback mirrors a red day in the US markets.`, `הירידה הזו משקפת מגמה שלילית מתונה בשווקי ארה"ב.`);
      if (isILSharpDrop) return t(`This reflects a particularly tough red day in the local IL market.`, `המגמה השלילית תואמת גל ירידות חדות בשוק המקומי (ת"א).`);
      if (isILDrop) return t(`This reflects a red day in the local IL market.`, `המגמה השלילית תואמת יום אדום בשוק המקומי.`);
    }
    if (mktUS > 0 && mktIL > 0) {
      return t(`The portfolio trended downwards despite generally positive markets in both the US and IL.`, `התיק ירד חרף יום ירוק בשווקי ארה"ב וישראל.`);
    }
    if (mktUS > 0) {
      const usText = isUSSharpJump ? t(`a massive rally in the US`, `ראלי משמעותי בארה"ב`) : t(`a positive US market`, `מגמה חיובית בארה"ב`);
      return t(`The portfolio trended downwards despite ${usText}.`, `התיק ירד חרף ${usText}.`);
    }
    if (mktIL > 0) {
      const ilText = isILSharpJump ? t(`a strong jump in the local market`, `עליות חזקות בשוק המקומי`) : t(`a positive IL market`, `מגמה חיובית בארץ`);
      return t(`The portfolio trended downwards despite ${ilText}.`, `התיק ירד חרף ${ilText}.`);
    }
  }

  return "";
}

function getTrendSentence(timeframe: string, pfAbsPct: number, isUp: boolean, totalPct1M: number, t: any) {
  if (timeframe === '1M' || pfAbsPct < 0.005) return "";

  const is1mUp = totalPct1M >= 0;
  const currentPct = isUp ? pfAbsPct : -pfAbsPct;
  const monthlyFormatted = formatPercent(totalPct1M);

  if (isUp && is1mUp) {
    if (currentPct >= totalPct1M) {
      return t(`This recent surge single-handedly pushed the 30-day return into the green (${monthlyFormatted}).`, `הזינוק האחרון העביר את החודש כולו לטריטוריה חיובית (${monthlyFormatted}).`);
    } else {
      return t(`This continues a solid 30-day uptrend (${monthlyFormatted}).`, `ממשיך מגמה חיובית יציבה של החודש האחרון (${monthlyFormatted}).`);
    }
  }

  if (isUp && !is1mUp) {
    return t(`This helps reverse an ongoing 30-day slump (${monthlyFormatted}).`, `עלייה זו מסייעת לתקן את הירידה של החודש האחרון (${monthlyFormatted}).`);
  }

  if (!isUp && !is1mUp) {
    if (currentPct <= totalPct1M) {
      return t(`This recent drop erased earlier gains, dragging the 30-day return into the red (${monthlyFormatted}).`, `הירידה האחרונה מוחקת עליות מוקדמות ומשכה את החודש כולו לטריטוריה שלילית (${monthlyFormatted}).`);
    } else {
      return t(`This adds to a bearish 30-day trend (${monthlyFormatted}).`, `ירידה זו מעמיקה את המגמה השלילית של 30 הימים האחרונים (${monthlyFormatted}).`);
    }
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
    const allMovers = movers.map(m => ({ name: m.name, pct: m.pct, gain: m.gain }));

    return { totalGain, totalPct, totalPct1M, topGainers, topLosers, allMovers };
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
