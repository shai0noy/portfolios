import React, { useState, useEffect, useMemo } from 'react';
import {
  Link as MuiLink,
  Dialog, DialogTitle, DialogContent, Box, Typography,
  ToggleButtonGroup, ToggleButton, IconButton, useTheme,
  useMediaQuery, Grid, Paper, CircularProgress, Stack, Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EventIcon from '@mui/icons-material/Event';
import { useLanguage } from '../../lib/i18n';
import { formatMoneyValue, formatPercent, convertCurrency } from '../../lib/currencyUtils';
import type { ExchangeRates } from '../../lib/types';
import { getTickerData } from '../../lib/fetching';
import { Exchange, type DashboardHolding, type Transaction, isBuy, isSell } from '../../lib/types';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Button } from '@mui/material';
import { useResponsiveDialogProps, useScrollShadows, ScrollShadows } from '../../lib/ui-utils';
import { getRecentEventsData } from './RecentEventsCard';

interface PortfolioBriefingDialogProps {
  open: boolean;
  onClose: () => void;
  holdings: DashboardHolding[];
  transactions: Transaction[];
  dividendRecords?: any[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
}

type Timeframe = '1D' | '1W' | '1M' | '1Y';

export function generateBriefingText(
  timeframe: '1D' | '1W' | '1M' | '1Y',
  stats: { totalGain: number, totalPct: number, totalPct1M: number, totalDivs: number, totalFlow?: number, totalVests?: number, allMovers?: { name: string, pct: number, gain: number }[] },
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

  const timeWord = timeframe === '1D' ? t('Today', 'היום') : timeframe === '1W' ? t('This week', 'השבוע') : timeframe === '1M' ? t('This month', 'החודש') : t('This year', 'השנה');

  const moveSentence = getMoveSentence(timeWord, timeframe, pfAbsPct, isUp, gainStr, pctStr, t);
  const marketSentence = getMarketSentence(pfAbsPct, isUp, mktUS, mktIL, t);
  const trendSentence = getTrendSentence(timeframe, pfAbsPct, isUp, stats.totalPct1M, t);
  const moversSentence = getNotableMoversSentence(stats, timeframe, t);
  const divsValStr = stats.totalDivs > 0 ? formatMoneyValue({ amount: stats.totalDivs, currency: displayCurrency as any }, undefined, 0) : "";
  const vestValStr = (stats.totalVests && stats.totalVests > 100) ? formatMoneyValue({ amount: stats.totalVests, currency: displayCurrency as any }, undefined, 0) : "";
  const flowValStr = (stats.totalFlow && Math.abs(stats.totalFlow) > 100) ? formatMoneyValue({ amount: Math.abs(stats.totalFlow), currency: displayCurrency as any }, undefined, 0) : "";

  let parts: string[] = [];
  if (divsValStr) {
    parts.push(t(`the portfolio earned ${divsValStr} in dividends`, `התיק הניב ${divsValStr} מדיבידנדים`));
  }
  if (vestValStr) {
    parts.push(t(`equity grants worth about ${vestValStr} vested`, `הבשילו מניות ומענקים בשווי של כ-${vestValStr}`));
  }

  let activitySentence = "";
  if (parts.length > 0) {
    const combinedParts = parts.join(t(', and ', ', '));
    activitySentence = `${timeWord} ${combinedParts}.`;
  }

  if (flowValStr) {
    const flowText = stats.totalFlow! > 0 ?
      t(`Additionally, you deposited ${flowValStr} into the portfolio.`, `בנוסף הפקדת ${flowValStr} לתיק.`) :
      t(`Additionally, you withdrew ${flowValStr} from the portfolio.`, `בנוסף משכת ${flowValStr} מהתיק.`);
    activitySentence = activitySentence ? `${activitySentence} ${flowText}` : flowText;
  }

  return [moveSentence, marketSentence, trendSentence, moversSentence, activitySentence].filter(Boolean).join('\n\n');
}

function getNotableMoversSentence(stats: { totalPct: number, allMovers?: { name: string, pct: number, gain: number }[] }, timeframe: string, t: any) {
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

  // Thresholds for "צניחה" based on timeframe
  let severeThreshold = 0.05; // Default for 1D
  if (timeframe === '1W') severeThreshold = 0.10;
  if (timeframe === '1M') severeThreshold = 0.20;
  if (timeframe === '1Y') severeThreshold = 0.40;

  const hasSevereDrops = topUnder.some(m => m.pct <= -severeThreshold);

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
      return t(`However, ${formatList(topUnder)} lagged behind with notable drops.`,
        hasSevereDrops ? `עם זאת, במנוגד למגמה הכללית בתיק נרשמה צניחה של ${formatList(topUnder)}.` : `עם זאת, ${formatList(topUnder)} רשמו ירידות משמעותיות במנוגד למגמה הכללית בתיק.`);
    } else {
      return t(`The decline was largely driven by heavy drops in ${formatList(topUnder)}.`,
        hasSevereDrops ? `ירידות אלו הובלו והוחמרו בעיקר בעקבות צניחה של ${formatList(topUnder)}.` : `הירידות בתיק הושפעו בעיקר מירידות בולטות של ${formatList(topUnder)}.`);
    }
  }

  return "";
}

function getMoveSentence(timeWord: string, timeframe: string, pfAbsPct: number, isUp: boolean, gainStr: string, pctStr: string, t: any) {
  if (pfAbsPct < 0.005) {
    return t(`${timeWord}, your portfolio saw a small change of ${gainStr} (${pctStr}).`, `${timeWord}, התיק רשם שינוי קל בלבד של ${gainStr} (${pctStr}).`);
  }

  // Thresholds for "צניחה" (plunge)
  let severeThreshold = 0.05; // 1D
  if (timeframe === '1W') severeThreshold = 0.10;
  if (timeframe === '1M') severeThreshold = 0.20;
  if (timeframe === '1Y') severeThreshold = 0.40;

  if (pfAbsPct >= severeThreshold) {
    return isUp
      ? t(`${timeWord}, your portfolio experienced a sharp jump, soaring by ${gainStr} (${pctStr}).`, `${timeWord}, התיק חווה עלייה חדה, עם זינוק של ${gainStr} (${pctStr}).`)
      : t(`${timeWord}, your portfolio suffered a sharp drop, plunging by ${gainStr} (${pctStr}).`, `${timeWord}, התיק חווה צניחה, עם ירידה חדה בסך ${gainStr} (${pctStr}).`);
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

  const usMag = Math.abs(mktUS);
  const ilMag = Math.abs(mktIL);

  const usDir = mktUS > 0.005 ? 1 : mktUS < -0.005 ? -1 : 0;
  const ilDir = mktIL > 0.005 ? 1 : mktIL < -0.005 ? -1 : 0;
  const pfDir = isUp ? 1 : -1;

  const isUSSharp = usMag >= 0.02;
  const isILSharp = ilMag >= 0.02;

  const avgMkt = usDir !== 0 && ilDir !== 0 ? (usMag + ilMag) / 2 : Math.max(usMag, ilMag);
  const avgMktMag = Math.abs(avgMkt);

  const getMarketDesc = (dir: number, sharp: boolean, locale: 'US' | 'IL') => {
    if (dir === 1) {
      if (locale === 'US') return sharp ? t('a massive bull rally in the US', 'העליות המשמעותיות בשוק האמריקאי') : t('positive US markets', 'מגמה חיובית בבורסות ארה"ב');
      return sharp ? t('strong surges in the Israeli market', 'העליות החריגות בשוק הישראלי') : t('a solid Israeli market', 'מגמה חיובית בשוק הישראלי');
    } else {
      if (locale === 'US') return sharp ? t('heavy losses in the US', 'ירידות משמעותיות בשוק האמריקאי') : t('a red US market', 'מגמה שלילית בארה"ב');
      return sharp ? t('sharp drops in the Israeli market', 'ירידות חריגות בשוק הישראלי') : t('a dropping Israeli market', 'מגמה שלילית בשוק הישראלי');
    }
  };

  if (pfDir === 1) {
    if (usDir === 1 && ilDir === 1) {
      const usText = getMarketDesc(1, isUSSharp, 'US');
      const ilText = getMarketDesc(1, isILSharp, 'IL');
      if (pfAbsPct < avgMktMag * 0.6) {
        return t(`This rise partially reflects ${usText} and ${ilText}.`, `העליה הזו משקפת באופן חלקי את ${usText} ואת ${ilText}.`);
      } else if (pfAbsPct > avgMktMag * 1.5) {
        return t(`This surge outpaces the broader trend of ${usText} and ${ilText}.`, `הזינוק בתיק גדול משמעותית ביחס ל${usText} ואל ${ilText}.`);
      }
      return t(`This rise aligns with ${usText} and ${ilText}.`, `העלייה הזו תואמת ל${usText} ול${ilText}.`);
    } else if (usDir === 1 || ilDir === 1) {
      const activeLocale = usDir === 1 ? 'US' : 'IL';
      const text = getMarketDesc(1, usDir === 1 ? isUSSharp : isILSharp, activeLocale);

      const mixed = usDir === -1 || ilDir === -1;
      if (mixed) {
        return t(`Bucking a mixed trend, this aligns with ${text}.`, `מגמה מעורבת בעולם, אך העלייה בתיק תואמת ל${text}.`);
      }
      return t(`This aligns with ${text}.`, `מגמה בהתאם ל${text}.`);
    } else if (usDir === -1 && ilDir === -1) {
      return t(`An impressive gain despite a red day in both US and Israeli markets.`, `עלייה מרשימה למרות ירידות בשווקי ארה"ב וישראל.`);
    } else if (usDir === -1 || ilDir === -1) {
      const dropLocale = usDir === -1 ? 'US' : 'IL';
      const text = getMarketDesc(-1, usDir === -1 ? isUSSharp : isILSharp, dropLocale);
      return t(`An impressive gain despite ${text}.`, `עלייה מרשימה למרות ${text} במדדים.`);
    }
  } else {
    // Portfolio is Down
    if (usDir === -1 && ilDir === -1) {
      const usText = getMarketDesc(-1, isUSSharp, 'US');
      const ilText = getMarketDesc(-1, isILSharp, 'IL');
      if (pfAbsPct < avgMktMag * 0.6) {
        return t(`This pullback partially reflects ${usText} and ${ilText}.`, `הירידה הזו משקפת באופן חלקי את ${usText} ואת ${ilText}.`);
      } else if (pfAbsPct > avgMktMag * 1.5) {
        return t(`This drop is heavier than the broader trend of ${usText} and ${ilText}.`, `נפילה חדה בתיק בהשוואה ל${usText} ול${ilText}.`);
      }
      return t(`This pullback mirrors ${usText} and ${ilText}.`, `הירידה תואמת למגמת ה${usText} וה${ilText}.`);
    } else if (usDir === -1 || ilDir === -1) {
      const activeLocale = usDir === -1 ? 'US' : 'IL';
      const text = getMarketDesc(-1, usDir === -1 ? isUSSharp : isILSharp, activeLocale);
      return t(`This pullback mirrors ${text}.`, `הירידה תואמת בעיקר ל${text}.`);
    } else if (usDir === 1 && ilDir === 1) {
      return t(`The portfolio dropped despite green rallies in both US and Israeli markets.`, `ירידות קשות בתיק חרף עליות בשווקי ארה"ב וישראל.`);
    } else if (usDir === 1 || ilDir === 1) {
      const activeLocale = usDir === 1 ? 'US' : 'IL';
      const text = getMarketDesc(1, usDir === 1 ? isUSSharp : isILSharp, activeLocale);
      return t(`The portfolio trended downwards despite ${text}.`, `התיק ירד חרף ${text}.`);
    }
  }

  return "";
}

function getTrendSentence(timeframe: string, pfAbsPct: number, isUp: boolean, totalPct1M: number, t: any) {
  if (timeframe === '1M' || timeframe === '1Y' || pfAbsPct < 0.005) return "";

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

export function PortfolioBriefingDialog({ open, onClose, holdings, transactions, dividendRecords = [], displayCurrency, exchangeRates }: PortfolioBriefingDialogProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const responsiveProps = useResponsiveDialogProps();
  const navigate = useNavigate();

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');

  const handleAiSummary = () => {
    const timeframeEn = timeframe === '1D' ? 'day (1D)' : timeframe === '1W' ? 'week (1W)' : timeframe === '1M' ? 'month (1M)' : 'year (1Y)';
    const timeframeHe = timeframe === '1D' ? 'יום (1D)' : timeframe === '1W' ? 'שבוע (1W)' : timeframe === '1M' ? 'חודש (1M)' : 'שנה (1Y)';

    const promptEn = `Please create a brief of my portfolio and the broader market (IL, US, and global) performance over the selected period (${timeframeEn}), and integrate my recent events and their effects.`;
    const promptHe = `אנא צור סיכום של תפקוד התיק שלי ושל שוקי המניות (ישראל, ארה"ב וגלובלי) לתקופה שנבחרה (${timeframeHe}), ושלב את האירועים האחרונים בחשבון ואת השפעתם.`;

    const prompt = t(promptEn, promptHe);

    onClose();
    setTimeout(() => {
      navigate({
        pathname: '/ai',
        search: `?prompt=${encodeURIComponent(prompt)}`
      });
    }, 50);
  };
  const [marketData, setMarketData] = useState<{ spx?: number, ndx?: number, tlv?: number }>({});
  const [loadingMarket, setLoadingMarket] = useState(false);

  const { containerRef, showTop, showBottom } = useScrollShadows('vertical');

  useEffect(() => {
    if (open) {
      setLoadingMarket(true);
      Promise.all([
        getTickerData('^SPX', Exchange.NYSE, null, undefined, false),
        getTickerData('^IXIC', Exchange.NASDAQ, null, undefined, false),
        getTickerData('137', Exchange.TASE, 137, undefined, false)
      ]).then(([spx, ndx, tlv]) => {
        setMarketData({
          spx: spx?.[timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : timeframe === '1M' ? 'changePct1m' : 'changePct1y'],
          ndx: ndx?.[timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : timeframe === '1M' ? 'changePct1m' : 'changePct1y'],
          tlv: tlv?.[timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : timeframe === '1M' ? 'changePct1m' : 'changePct1y']
        });
      }).finally(() => setLoadingMarket(false));
    }
  }, [open, timeframe]);

  const stats = useMemo(() => {
    let totalStartVal = 0;

    let totalDivs = 0;
    let totalFlow = 0;
    let totalVests = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msDaily = 86400000;

    transactions.forEach(txn => {
      const d = new Date(txn.vestDate || txn.date);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - today.getTime()) / msDaily);
      const inPeriod = (timeframe === '1D') ? (diff === 0) :
        (timeframe === '1W') ? (diff >= -7 && diff <= 0) :
          (timeframe === '1M') ? (diff >= -30 && diff <= 0) :
            (diff >= -365 && diff <= 0);

      if (!inPeriod) return;

      if (txn.type === 'DIVIDEND') {
        totalDivs += convertCurrency((txn.qty || txn.originalQty || 0) * (txn.price || txn.originalPrice || 0), txn.currency || 'USD', displayCurrency, exchangeRates);
      } else if (isBuy(txn.type)) {
        totalFlow += convertCurrency((txn.qty || txn.originalQty || 0) * (txn.price || txn.originalPrice || 0), txn.currency || 'USD', displayCurrency, exchangeRates);
      } else if (isSell(txn.type)) {
        totalFlow -= convertCurrency((txn.qty || txn.originalQty || 0) * (txn.price || txn.originalPrice || 0), txn.currency || 'USD', displayCurrency, exchangeRates);
      }

      if (txn.vestDate) {
        const h = holdings.find(hd => hd.ticker === txn.ticker);
        const cp = h?.display.currentPrice || (txn.price || txn.originalPrice || 0);
        const vestVal = (txn.qty || txn.originalQty || 0) * cp;
        totalVests += convertCurrency(vestVal, (txn.currency || 'USD') as any, displayCurrency, exchangeRates);
      }
    });

    (dividendRecords || []).forEach(div => {
      const d = new Date(div.date);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - today.getTime()) / msDaily);
      const inPeriod = (timeframe === '1D') ? (diff === 0) :
        (timeframe === '1W') ? (diff >= -7 && diff <= 0) :
          (timeframe === '1M') ? (diff >= -30 && diff <= 0) :
            (diff >= -365 && diff <= 0);

      if (!inPeriod) return;

      totalDivs += convertCurrency((div.unitsHeld || 0) * (div.pricePerUnit || div.grossAmount.amount || 0), div.grossAmount.currency || 'USD', displayCurrency, exchangeRates);
    });


    let totalEndVal = 0;
    let totalStartVal1M = 0;

    const movers = holdings.map(h => {
      const val = h.display.marketValue;
      let pct = 0;
      if (timeframe === '1D') pct = h.display.dayChangePct || 0;
      else if (timeframe === '1W') pct = h.perf1w || 0;
      else if (timeframe === '1M') pct = h.perf1m || 0;
      else pct = h.perf1y || 0;

      const base = val / (1 + pct);
      const gain = val - base;

      const pct1M = h.perf1m || 0;
      const base1M = val / (1 + pct1M);

      return { ticker: h.ticker, exchange: h.exchange, name: h.displayName || h.longName || h.nameHe || h.ticker, gain, pct, val, base, base1M };
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
    const allMovers = movers.map(m => ({ exchange: m.exchange, name: m.name, pct: m.pct, gain: m.gain, ticker: m.ticker }));

    return { totalGain, totalPct, totalPct1M, topGainers, topLosers, allMovers, totalDivs, totalFlow, totalVests };
  }, [holdings, timeframe, transactions, exchangeRates, displayCurrency]);

  const recentEvents = useMemo(() => {
    const allEvents = getRecentEventsData(holdings, transactions, dividendRecords, t);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allEvents.filter(ev => {
      const evDate = new Date(ev.date);
      evDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((evDate.getTime() - today.getTime()) / 86400000);

      if (timeframe === '1D') return diffDays >= 0 && diffDays <= 1;
      if (timeframe === '1W') return diffDays >= -7 && diffDays <= 1;
      if (timeframe === '1M') return diffDays >= -30 && diffDays <= 1;
      return diffDays >= -365 && diffDays <= 1;
    }).slice(0, 4);
  }, [holdings, transactions, t, timeframe]);

  const renderBriefingTextWithLinks = (text: string) => {
    let chunks: React.ReactNode[] = [text];
    stats.allMovers?.forEach(mover => {
      chunks = chunks.flatMap(chunk => {
        if (typeof chunk !== 'string') return [chunk];
        const parts = chunk.split(mover.name);
        if (parts.length === 1) return [chunk];
        const newChunks: React.ReactNode[] = [];
        for (let i = 0; i < parts.length; i++) {
          newChunks.push(parts[i]);
          if (i < parts.length - 1) {
            newChunks.push(
              <MuiLink key={mover.ticker + '-' + i} component={RouterLink} to={'/ticker/' + mover.exchange + '/' + mover.ticker} sx={{ fontWeight: 'bold' }} underline="hover" onClick={onClose} color="primary.main">
                {mover.name}
              </MuiLink>
            );
          }
        }
        return newChunks;
      });
    });
    return chunks;
  };

  const renderStatCard = (title: string, _v: string, pct: number | undefined, bg: string, color: string, to?: string) => {
    const card = (
      <Paper variant="outlined" sx={{ p: 1.5, width: '100%', textAlign: 'center', bgcolor: bg, color: color, borderRadius: 2, borderColor: 'divider', ...(to && { transition: '0.2s', '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' } }) }}>
        <Typography variant="body2" sx={{ opacity: 0.8, fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5, fontWeight: 'bold' }}>
          {pct === undefined ? '-' : (
            <>
              {pct >= 0 ? <ArrowUpwardIcon fontSize="inherit" color="success" /> : <ArrowDownwardIcon fontSize="inherit" color="error" />}
              {formatPercent(pct)}
            </>
          )}
        </Typography>
      </Paper>
    );
    if (to) return <MuiLink component={RouterLink} to={to} onClick={onClose} sx={{ flex: 1, display: 'flex', textDecoration: 'none' }}>{card}</MuiLink>;
    return <Box sx={{ flex: 1, display: 'flex' }}>{card}</Box>;
  };

  return (
    <Dialog open={open} onClose={onClose} {...responsiveProps} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle component="div" sx={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between', alignItems: 'center', pb: 1.5, pt: 1.5, px: isMobile ? 2 : 3, borderBottom: '1px solid', borderColor: 'divider', gap: 1 }}>
        <Typography variant="subtitle1" component="div" fontWeight={800} sx={{ display: { xs: 'none', sm: 'block' }, mr: 1, whiteSpace: 'nowrap' }}>
          {t('Briefing', 'סיכום')}
        </Typography>

        <Box sx={{ display: 'flex', flex: 1, justifyContent: { xs: 'flex-start', sm: 'center' }, minWidth: 0 }}>
          <ToggleButtonGroup
            value={timeframe}
            exclusive
            onChange={(_, val) => val && setTimeframe(val)}
            size="small"
            sx={{
              height: 32,
              bgcolor: 'action.hover',
              p: 0.3,
              borderRadius: 2,
              '& .MuiToggleButtonGroup-grouped': {
                margin: 0,
                border: 0,
                borderRadius: 1.5,
                px: { xs: 1.5, sm: 2 },
                py: 0,
                fontSize: { xs: '0.75rem', sm: '0.8rem' },
                fontWeight: 700,
                '&.Mui-disabled': { border: 0 },
                '&:not(:first-of-type)': { borderRadius: 1.5 },
                '&:first-of-type': { borderRadius: 1.5 },
              },
              '& .Mui-selected': { bgcolor: 'background.paper', boxShadow: 1 }
            }}
          >
            <ToggleButton value="1D" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>{t('Day', 'יומי')}</ToggleButton>
            <ToggleButton value="1W" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>{t('Week', 'שבועי')}</ToggleButton>
            <ToggleButton value="1M" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>{t('Month', 'חודשי')}</ToggleButton>
            <ToggleButton value="1Y" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>{t('Year', 'שנתי')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button variant="outlined" color="primary" size="small" startIcon={<SmartToyIcon fontSize="small" />} onClick={handleAiSummary} sx={{ borderRadius: 2, fontWeight: 'bold', minWidth: 0, px: { xs: 1, sm: 1.5 } }}>
            <span style={{ display: isMobile ? 'none' : 'inline', whiteSpace: 'nowrap' }}>{t('AI Summary', 'סיכום AI')}</span>
          </Button>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>
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
          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover', border: 1, borderColor: 'divider', mb: 3 }}>
            <Typography variant="body1" sx={{ fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {renderBriefingTextWithLinks(generateBriefingText(timeframe, stats, marketData, displayCurrency, t))}
            </Typography>
          </Box>

          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1, color: 'text.secondary' }}>{t('Market Benchmark', 'השוואת שוק')}</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
            {renderStatCard(t('Portfolio', 'התיק שלי'), '', stats.totalPct, 'transparent', 'text.primary')}
            {loadingMarket ? (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress size={20} /></Box>
            ) : (
              <>
                {renderStatCard('S&P 500', '', marketData.spx, 'transparent', 'text.primary', '/ticker/NASDAQ/^SPX')}
                {renderStatCard('NASDAQ', '', marketData.ndx, 'transparent', 'text.primary', '/ticker/NASDAQ/^IXIC')}
                {renderStatCard('TA-125', '', marketData.tlv, 'transparent', 'text.primary', '/ticker/TASE/137')}
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
                  return (
                    <Box key={m.ticker} sx={{ position: 'relative', overflow: 'hidden', p: 1.5, py: 1, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <MuiLink component={RouterLink} to={'/ticker/' + m.exchange + '/' + m.ticker} onClick={onClose} underline="hover" color="inherit" sx={{ display: 'block' }}>
                          <Typography component="div" variant="body2" fontWeight="bold" noWrap title={m.name} sx={{ mb: 0.25 }}>{m.name}</Typography>
                        </MuiLink>
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
                  return (
                    <Box key={m.ticker} sx={{ position: 'relative', overflow: 'hidden', p: 1.5, py: 1, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <MuiLink component={RouterLink} to={'/ticker/' + m.exchange + '/' + m.ticker} onClick={onClose} underline="hover" color="inherit" sx={{ display: 'block' }}>
                          <Typography component="div" variant="body2" fontWeight="bold" noWrap title={m.name} sx={{ mb: 0.25 }}>{m.name}</Typography>
                        </MuiLink>
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
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, mt: 1, color: 'text.secondary' }}>{t('Events & Updates', 'אירועים ועדכונים')}</Typography>
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
