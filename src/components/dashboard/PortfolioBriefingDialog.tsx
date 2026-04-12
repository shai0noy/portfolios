import React, { useState, useEffect, useMemo } from 'react';
import {
  Link as MuiLink,
  Dialog, DialogTitle, DialogContent, Box, Typography,
  ToggleButtonGroup, ToggleButton, IconButton, useTheme,
  useMediaQuery, Grid, Paper, CircularProgress, Stack,
  Menu, MenuItem, ListItemIcon, ListItemText, Fade
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EventIcon from '@mui/icons-material/Event';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DateRangeIcon from '@mui/icons-material/DateRange';
import { useLanguage } from '../../lib/i18n';
import { formatDate } from '../../lib/date';
import { formatMoneyValue, formatPercent, convertCurrency } from '../../lib/currencyUtils';
import type { ExchangeRates } from '../../lib/types';
import { getTickerData } from '../../lib/fetching';
import { Exchange, type DashboardHolding, type Transaction, isBuy, isSell } from '../../lib/types';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import { useResponsiveDialogProps, useScrollShadows, ScrollShadows } from '../../lib/ui-utils';
import { getRecentEventsData } from './RecentEventsCard';
import { aggregateHoldingValues } from '../../lib/data/holding_utils';
import { CustomRangeDialog } from '../CustomRangeDialog';

interface PortfolioBriefingDialogProps {
  open: boolean;
  onClose: () => void;
  holdings: DashboardHolding[];
  transactions: Transaction[];
  dividendRecords?: any[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  boiTickerData?: { ticker: string, exchange: string, historical: { date: Date, price: number }[] };
  is1dStale?: boolean;
  summary?: any;
}

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'All' | 'Custom';

const timeDays: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365, 'YTD': 180, '3M': 90, '6M': 180, '3Y': 1095, '5Y': 1825, 'All': 1825 };

export function generateBriefingText(
  timeframe: Timeframe,
  stats: { totalGain: number, totalPct: number, totalPct1M: number, totalPct1Y: number, totalDivs: number, totalFlow?: number, totalVests?: number, allMovers?: { name: string, pct: number, gain: number }[] },
  marketData: { spx?: number, ndx?: number, tlv?: number, energy?: number, it?: number, stoxx?: number },
  displayCurrency: string,
  t: (key: string, backup: string) => string,
  customDays?: number,
  customEnd?: Date | null,
  is1dStale?: boolean,
  isMobile?: boolean
): string {
  const pfAbsPct = Math.abs(stats.totalPct);
  const isUp = stats.totalGain > 0;
  const gainStr = formatMoneyValue({ amount: Math.abs(stats.totalGain), currency: displayCurrency as any }, undefined, 0);
  const pctStr = formatPercent(stats.totalPct);

  const timeWord = (timeframe === '1D') ? (is1dStale ? (isMobile ? t('Last day', 'ביום האחרון') : t('On the last trading day', 'ביום המסחר האחרון')) : t('Today', 'היום')) :
    (timeframe === '1W') ? t('This week', 'השבוע') :
      (timeframe === '1M') ? t('This month', 'החודש') :
        (timeframe === '3M') ? t('In the past 3 months', 'בשלושת החודשים האחרונים') :
          (timeframe === '6M') ? t('In the past 6 months', 'בחצי השנה האחרונה') :
            (timeframe === 'YTD') ? t('Year to date', 'מתחילת השנה') :
              (timeframe === '1Y') ? t('In the past year', 'בשנה האחרונה') :
                (timeframe === '3Y') ? t('In the past 3 years', 'ב-3 השנים האחרונות') :
                  (timeframe === '5Y') ? t('In the past 5 years', 'ב-5 השנים האחרונות') :
                    (timeframe === 'All') ? t('Since inception', 'מאז הקמתו') :
                      t('In the selected period', 'בתקופה הנבחרת');

  const moveSentence = getMoveSentence(timeWord, timeframe, pfAbsPct, isUp, gainStr, pctStr, t);
  const marketSentence = getMarketSentence(timeframe, pfAbsPct, isUp, marketData.spx ?? 0, marketData.ndx ?? 0, marketData.tlv ?? 0, marketData.energy, marketData.it, marketData.stoxx, t, customDays);
  let showTrend1M = timeframe === '1D' || timeframe === '1W';
  let showTrend1Y = timeframe === '1M';

  if (timeframe === 'Custom' && customDays !== undefined) {
    if (!customEnd || (new Date().getTime() - customEnd.getTime() < 3 * 86400000)) {
      if (customDays <= 14) showTrend1M = true;
      else if (customDays >= 20 && customDays <= 45) showTrend1Y = true;
    }
  }

  const trendSentence = showTrend1M ? getTrendSentence(pfAbsPct, isUp, stats.totalPct1M, t, '1m') :
    showTrend1Y ? getTrendSentence(pfAbsPct, isUp, stats.totalPct1Y, t, '1y') : "";
  const moversSentence = getNotableMoversSentence(stats, timeframe, displayCurrency, t);
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

  const mainStory = [moveSentence, marketSentence, trendSentence].filter(Boolean).join('\n');
  return [mainStory, moversSentence, activitySentence].filter(Boolean).join('\n\n');
}

function getNotableMoversSentence(stats: { totalPct: number, totalGain?: number, allMovers?: { name: string, pct: number, gain: number }[] }, timeframe: string, displayCurrency: string, t: any) {
  if (!stats.allMovers || stats.allMovers.length === 0) return "";

  const pfGain = stats.totalGain || 0;
  const NOTABLE_GAIN_THRESHOLD = Math.abs(pfGain) * 0.1 > 100 ? Math.abs(pfGain) * 0.1 : (Math.abs(pfGain) > 0 ? Math.min(Math.abs(pfGain) * 0.5, 50) : 50);

  const outperformingValue = stats.allMovers.filter(m => m.gain >= NOTABLE_GAIN_THRESHOLD && m.gain > 0);
  const underperformingValue = stats.allMovers.filter(m => m.gain <= -NOTABLE_GAIN_THRESHOLD && m.gain < 0);

  outperformingValue.sort((a, b) => b.gain - a.gain);
  underperformingValue.sort((a, b) => a.gain - b.gain);

  const topOutValue = outperformingValue.slice(0, 2);
  const topUnderValue = underperformingValue.slice(0, 2);

  const outValueNames = new Set(topOutValue.map(m => m.name));
  const underValueNames = new Set(topUnderValue.map(m => m.name));

  let severePctThreshold = 0.05;
  if (timeframe === '1W') severePctThreshold = 0.10;
  if (timeframe === '1M') severePctThreshold = 0.20;
  if (timeframe === '1Y') severePctThreshold = 0.40;

  const outperformingPct = stats.allMovers.filter(m => m.pct >= severePctThreshold && !outValueNames.has(m.name) && !underValueNames.has(m.name));
  const underperformingPct = stats.allMovers.filter(m => m.pct <= -severePctThreshold && !outValueNames.has(m.name) && !underValueNames.has(m.name));

  outperformingPct.sort((a, b) => b.pct - a.pct);
  underperformingPct.sort((a, b) => a.pct - b.pct);

  const topOutPct = outperformingPct.slice(0, 2);
  const topUnderPct = underperformingPct.slice(0, 2);

  if (topOutValue.length === 0 && topUnderValue.length === 0 && topOutPct.length === 0 && topUnderPct.length === 0) return "";

  const formatListValue = (list: { name: string, gain: number }[]) =>
    list.map(m => `${m.name} (${m.gain > 0 ? '+' : ''}${formatMoneyValue({ amount: m.gain, currency: displayCurrency as any }, undefined, 0)})`).join(t(' and ', ' ו-'));

  const formatListPct = (list: { name: string, pct: number }[]) =>
    list.map(m => `${m.name} (${formatPercent(m.pct)})`).join(t(' and ', ' ו-'));

  let sentence = "";

  if (topOutValue.length > 0 && topUnderValue.length > 0) {
    sentence = t(
      `Notably, ${formatListValue(topOutValue)} outperformed, while ${formatListValue(topUnderValue)} saw significant drops.`,
      `ראוי לציון כי ${formatListValue(topOutValue)} בלטו לחיוב לראש הפסגה, בעוד ש-${formatListValue(topUnderValue)} רשמו ירידות משמעותיות.`
    );
  } else if (topOutValue.length > 0) {
    if (pfGain < 0) {
      sentence = t(`Bright spots included ${formatListValue(topOutValue)}, which bucked the downward trend.`, `נקודות האור כללו את ${formatListValue(topOutValue)}, שעלו בניגוד למגמה השלילית בתיק.`);
    } else {
      sentence = t(`Key drivers pushing the portfolio included ${formatListValue(topOutValue)}.`, `עליות התיק הובלו בין היתר על ידי ${formatListValue(topOutValue)} שבלטו במיוחד.`);
    }
  } else if (topUnderValue.length > 0) {
    if (pfGain > 0) {
      sentence = t(`However, ${formatListValue(topUnderValue)} lagged behind with notable drops.`,
        `עם זאת, ${formatListValue(topUnderValue)} רשמו ירידות משמעותיות במנוגד למגמה הכללית בתיק.`);
    } else {
      sentence = t(`The decline was largely driven by heavy drops in ${formatListValue(topUnderValue)}.`,
        `הירידות בתיק הושפעו בעיקר מירידות בולטות של ${formatListValue(topUnderValue)}.`);
    }
  }

  const extraPctArr = [];
  if (topOutPct.length > 0) {
    extraPctArr.push(t(`${formatListPct(topOutPct)} surged`, `${formatListPct(topOutPct)} זינקו`));
  }
  if (topUnderPct.length > 0) {
    extraPctArr.push(t(`${formatListPct(topUnderPct)} plunged`, `${formatListPct(topUnderPct)} צנחו`));
  }

  if (extraPctArr.length > 0) {
    const extraSentence = extraPctArr.join(t(' and ', ' ו-')) + ".";
    if (sentence) {
      sentence += " " + t("Additionally, ", "בנוסף, ") + extraSentence;
    } else {
      sentence = t("On a percentage basis, ", "במונחי אחוזים, ") + extraSentence;
    }
  }

  return sentence;
}

function getMoveSentence(timeWord: string, timeframe: string, pfAbsPct: number, isUp: boolean, gainStr: string, pctStr: string, t: any) {
  if (pfAbsPct < 0.005) {
    return t(`${timeWord}, your portfolio saw a small change of ${gainStr} (${pctStr}).`, `${timeWord}, התיק רשם שינוי קל בלבד של ${gainStr} (${pctStr}).`);
  }

  let severeThreshold = 0.05;
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

function getCoreMarketSentence(timeframe: string, pfAbsPct: number, isUp: boolean, mktUS: number, mktIL: number, t: any, customDays?: number) {
  const usMag = Math.abs(mktUS);
  const ilMag = Math.abs(mktIL);

  const days = (timeframe === 'Custom' && customDays) ? customDays : (timeDays[timeframe] || 30);

  const boundedDays = days;
  const flat = 0.003 + boundedDays * ((0.03 - 0.003) / 365);
  const sharp = 0.015 + boundedDays * ((0.15 - 0.015) / 365);

  const usDir = mktUS > flat ? 1 : mktUS < -flat ? -1 : 0;
  const ilDir = mktIL > flat ? 1 : mktIL < -flat ? -1 : 0;
  const pfDir = isUp ? 1 : -1;

  const avgMkt = usDir !== 0 && ilDir !== 0 ? (usMag + ilMag) / 2 : Math.max(usMag, ilMag);
  const avgMktMag = Math.abs(avgMkt);

  const getMarketDesc = (dir: number, mag: number, locale: 'US' | 'IL') => {
    const localeStr = locale === 'US' ? 'the US' : 'the Israeli';
    const localeStrHE = locale === 'US' ? 'האמריקאי' : 'הישראלי';
    
    if (dir === 1) {
      if (mag >= sharp * 2) {
        return t(`a substantial rally in ${localeStr} market`, `עליות חדות במיוחד בשוק ${localeStrHE}`);
      } else if (mag >= sharp) {
        return t(`strong surges in ${localeStr} market`, `עליות בולטות בשוק ${localeStrHE}`);
      } else if (mag >= flat) {
        return t(`positive trend in ${localeStr} market`, `מגמה חיובית בשוק ${localeStrHE}`);
      }
      return t(`stable conditions in ${localeStr} market`, `יציבות יחסית בשוק ${localeStrHE}`);
    } else {
      if (mag >= sharp * 2) {
        return t(`heavy losses in ${localeStr} market`, `ירידות חדות במיוחד בשוק ${localeStrHE}`);
      } else if (mag >= sharp) {
        return t(`sharp drops in ${localeStr} market`, `ירידות בולטות בשוק ${localeStrHE}`);
      } else if (mag >= flat) {
        return t(`negative trend in ${localeStr} market`, `מגמה שלילית בשוק ${localeStrHE}`);
      }
      return t(`stable conditions in ${localeStr} market`, `יציבות יחסית בשוק ${localeStrHE}`);
    }
  };

  if (pfAbsPct < flat) {
    if ((usDir === 1 || ilDir === 1) && (usDir === -1 || ilDir === -1)) {
      const timeWord = timeframe === '1D' ? 'session' : 'period';
      const timeWordHE = timeframe === '1D' ? 'יום המסחר' : 'התקופה';
      
      if (usDir === 1 && ilDir === -1) {
        return t(`The portfolio remained stable despite gains in the US and losses in the Israeli market during this ${timeWord}.`, `התיק שמר על יציבות למרות עליות בארה"ב וירידות בישראל במהלך ${timeWordHE}.`);
      } else if (usDir === -1 && ilDir === 1) {
        return t(`The portfolio remained stable despite losses in the US and gains in the Israeli market during this ${timeWord}.`, `התיק שמר על יציבות למרות ירידות בארה"ב ועליות בישראל במהלך ${timeWordHE}.`);
      }
      return t(`The portfolio remained stable amidst mixed trends across global markets.`, `התיק שמר על יציבות על רקע מגמה מעורבת בשווקים הכלליים.`);
    } else if (usDir === -1 || ilDir === -1) {
      const activeLocale = usDir === -1 ? 'US' : 'IL';
      const text = getMarketDesc(-1, usDir === -1 ? usMag : ilMag, activeLocale);
      return t(`The portfolio showed resilience, holding stable despite ${text}.`, `התיק הפגין חוסן מרשים ושמר על יציבות חרף ${text}.`);
    } else if (usDir === 1 || ilDir === 1) {
      const activeLocale = usDir === 1 ? 'US' : 'IL';
      const text = getMarketDesc(1, usDir === 1 ? usMag : ilMag, activeLocale);
      return t(`The portfolio saw no major shifts, remaining stable during ${text}.`, `התיק נותר ללא תנועה משמעותית בסביבה בה נרשמו ${text}.`);
    }
    return "";
  }

  if (pfDir === 1) {
    if (usDir === 1 && ilDir === 1) {
      const usText = getMarketDesc(1, usMag, 'US');
      const ilText = getMarketDesc(1, ilMag, 'IL');
      if (pfAbsPct < avgMktMag * 0.6) {
        return t(`This rise partially reflects ${usText} and ${ilText}.`, `העליה הזו משקפת באופן חלקי את ${usText} ואת ${ilText}.`);
      } else if (pfAbsPct > avgMktMag * 1.5) {
        return t(`This surge outpaces the broader trend of ${usText} and ${ilText}.`, `הזינוק בתיק גדול משמעותית ביחס ל${usText} ואל ${ilText}.`);
      }
      return t(`This rise aligns with ${usText} and ${ilText}.`, `העלייה הזו תואמת ל${usText} ול${ilText}.`);
    } else if (usDir === 1 || ilDir === 1) {
      const activeLocale = usDir === 1 ? 'US' : 'IL';
      const text = getMarketDesc(1, usDir === 1 ? usMag : ilMag, activeLocale);
      const mixed = usDir === -1 || ilDir === -1;
      if (mixed) {
        return t(`Bucking a mixed trend, this aligns with ${text}.`, `מגמה מעורבת בעולם, אך העלייה בתיק תואמת ל${text}.`);
      }
      return t(`This aligns with ${text}.`, `מגמה בהתאם ל${text}.`);
    } else if (usDir === -1 && ilDir === -1) {
      if (timeframe === '1D') {
        return t(`This is an impressive gain despite a red day in both US and Israeli markets.`, `זאת עלייה מרשימה למרות ירידות בשווקי ארה"ב וישראל.`);
      }
      return t(`This is an impressive gain despite a bearish period in both US and Israeli markets.`, `זאת עלייה מרשימה למרות ירידות בשווקי ארה"ב וישראל.`);
    } else if (usDir === -1 || ilDir === -1) {
      const dropLocale = usDir === -1 ? 'US' : 'IL';
      const text = getMarketDesc(-1, usDir === -1 ? usMag : ilMag, dropLocale);
      return t(`This is an impressive gain despite ${text}.`, `זאת עלייה מרשימה למרות ${text} במדדים.`);
    }
  } else {
    if (usDir === -1 && ilDir === -1) {
      const usText = getMarketDesc(-1, usMag, 'US');
      const ilText = getMarketDesc(-1, ilMag, 'IL');
      if (pfAbsPct < avgMktMag * 0.6) {
        return t(`This pullback partially reflects ${usText} and ${ilText}.`, `הירידה הזו משקפת באופן חלקי את ${usText} ואת ${ilText}.`);
      } else if (pfAbsPct > avgMktMag * 1.5) {
        return t(`This drop is heavier than the broader trend of ${usText} and ${ilText}.`, `זוהי נפילה חדה בתיק בהשוואה ל${usText} ול${ilText}.`);
      }
      return t(`This pullback mirrors ${usText} and ${ilText}.`, `הירידה תואמת למגמת ה${usText} וה${ilText}.`);
    } else if (usDir === -1 || ilDir === -1) {
      const activeLocale = usDir === -1 ? 'US' : 'IL';
      const text = getMarketDesc(-1, usDir === -1 ? usMag : ilMag, activeLocale);
      return t(`This pullback mirrors ${text}.`, `הירידה תואמת בעיקר ל${text}.`);
    } else if (usDir === 1 && ilDir === 1) {
      return t(`This is despite green rallies in both US and Israeli markets.`, `זאת חרף עליות בשווקי ארה"ב וישראל.`);
    } else if (usDir === 1 || ilDir === 1) {
      const activeLocale = usDir === 1 ? 'US' : 'IL';
      const text = getMarketDesc(1, usDir === 1 ? usMag : ilMag, activeLocale);
      return t(`This is despite ${text}.`, `זאת חרף ${text}.`);
    }
  }
  return "";
}

function getMarketSentence(timeframe: string, pfAbsPct: number, isUp: boolean, mktUS: number, mktNDX: number, mktIL: number, mktEnergy: number | undefined, mktIT: number | undefined, mktSTOXX: number | undefined, t: any, customDays?: number) {
  const core = getCoreMarketSentence(timeframe, pfAbsPct, isUp, mktUS, mktIL, t, customDays);
  if (!core) return "";

  let divergenceStr = "";
  const hasMktBase = mktUS !== 0 && mktNDX !== 0;
  if (hasMktBase) {
    const diffE = mktEnergy !== undefined ? Math.min(Math.abs(mktEnergy - mktUS), Math.abs(mktEnergy - mktNDX)) : 0;
    const diffI = mktIT !== undefined ? Math.min(Math.abs(mktIT - mktUS), Math.abs(mktIT - mktNDX)) : 0;

    const boundedDays = (timeframe === 'Custom' && customDays) ? customDays : (timeDays[timeframe] || 30);
    const thresh = 0.01 + boundedDays * ((0.12 - 0.01) / 365);

    if (diffE > thresh || diffI > thresh) {
      const eFmt = mktEnergy !== undefined ? formatPercent(mktEnergy) : "";
      const iFmt = mktIT !== undefined ? formatPercent(mktIT) : "";

      const getDirHE = (val: number) => val > mktUS ? 'ביצוע עודף' : 'ביצוע חסר';
      const getDirEN = (val: number) => val > mktUS ? 'outperformance' : 'underperformance';

      if (diffE > thresh && diffI > thresh) {
        divergenceStr = t(` Notably, the Energy (${eFmt}) and Tech (${iFmt}) sectors showed ${getDirEN(mktEnergy!)} and ${getDirEN(mktIT!)} respectively compared to the broader US market.`, ` בנוסף ניכר ${getDirHE(mktEnergy!)} במגזר האנרגיה (${eFmt}) ו${getDirHE(mktIT!)} במגזר הטכנולוגיה (${iFmt}) ביחס לשוק הכללי בארה"ב.`);
      } else if (diffE > thresh) {
        divergenceStr = t(` Notably, the Energy sector showed ${getDirEN(mktEnergy!)} against the broader US market, returning ${eFmt}.`, ` בנוסף ניכר ${getDirHE(mktEnergy!)} במגזר האנרגיה (${eFmt}) ביחס לשוק הכללי בארה"ב.`);
      } else if (diffI > thresh) {
        divergenceStr = t(` Notably, the Tech sector showed ${getDirEN(mktIT!)} against the broader US market, returning ${iFmt}.`, ` בנוסף ניכר ${getDirHE(mktIT!)} במגזר הטכנולוגיה (${iFmt}) ביחס לשוק הכללי בארה"ב.`);
      }
    }

    const getDivergenceDesc = (mktVal: number, baseVal: number) => {
      if (baseVal < 0) {
        if (mktVal > 0) {
          return { en: 'notably overperformed', he: 'הציגו ביצועי יתר משמעותיים' };
        } else if (mktVal > baseVal) {
          const isMostlySteady = Math.abs(mktVal) < 0.005;
          return isMostlySteady 
            ? { en: 'remained mostly steady', he: 'נותרו יציבים יחסית' }
            : { en: 'showed lesser drops', he: 'הציגו ירידות מתונות יותר' };
        } else {
          return { en: 'showed larger drops', he: 'הציגו ירידות חדות יותר' };
        }
      } else {
        if (mktVal > baseVal) {
          return { en: 'notably overperformed', he: 'הציגו ביצועי יתר משמעותיים' };
        } else if (mktVal > 0) {
          const isMostlySteady = Math.abs(mktVal) < 0.005;
          return isMostlySteady 
            ? { en: 'remained mostly steady', he: 'נותרו יציבים יחסית' }
            : { en: 'showed lesser gains', he: 'הציגו עליות מתונות יותר' };
        } else {
          return { en: 'notably underperformed', he: 'הציגו ביצועי חסר משמעותיים' };
        }
      }
    };

    if (mktSTOXX !== undefined) {
      const diffSTOXX = Math.abs(mktSTOXX - mktUS);
      const isSTOXXNotable = Math.abs(mktSTOXX) > 0.01;
      if (diffSTOXX > thresh && isSTOXXNotable) {
        const sFmt = formatPercent(mktSTOXX);
        const desc = getDivergenceDesc(mktSTOXX, mktUS);
        divergenceStr += t(` Meanwhile, European markets (STOXX) ${desc.en}, returning ${sFmt}.`, ` במקביל, שוקי אירופה (STOXX) ${desc.he} עם תשואה של ${sFmt}.`);
      }
    }
  }
  return core + divergenceStr;
}

function getTrendSentence(pfAbsPct: number, isUp: boolean, refPct: number, t: any, type: '1m' | '1y') {
  if (pfAbsPct < 0.005) return "";

  const isRefUp = refPct >= 0;
  const currentPct = isUp ? pfAbsPct : -pfAbsPct;
  const refFormatted = formatPercent(refPct);

  const refTextHE = type === '1m' ? 'החודש כולו' : 'השנה כולה';
  const refTextEN = type === '1m' ? 'the 30-day return' : 'the 1-year return';

  const refTrendHE = type === '1m' ? 'החודש האחרון' : 'השנה האחרונה';
  const refTrendEN = type === '1m' ? '30-day' : '1-year';
  const refProfitableHE = type === '1m' ? 'חודש רווחי' : 'שנה רווחית';

  if (isUp && isRefUp) {
    if (currentPct >= refPct) {
      return t(`This recent surge single-handedly pushed ${refTextEN} into the green (${refFormatted}).`, `זינוק אחרון זה העביר את ${refTextHE} לטריטוריה חיובית (${refFormatted}).`);
    } else {
      return t(`This continues a solid ${refTrendEN} uptrend (${refFormatted}).`, `זה ממשיך מגמה חיובית יציבה של ${refTrendHE} (${refFormatted}).`);
    }
  }

  if (isUp && !isRefUp) {
    return t(`This helps reverse an ongoing ${refTrendEN} slump (${refFormatted}).`, `עלייה זו מסייעת לתקן את הירידה של ${refTrendHE} (${refFormatted}).`);
  }

  if (!isUp && !isRefUp) {
    if (currentPct <= refPct) {
      return t(`This recent drop erased earlier gains, dragging ${refTextEN} into the red (${refFormatted}).`, `הירידה האחרונה הזו מוחקת עליות מוקדמות ומושכת את ${refTextHE} לטריטוריה שלילית (${refFormatted}).`);
    } else {
      return t(`This adds to a bearish ${refTrendEN} trend (${refFormatted}).`, `ירידה זו מצטרפת ומעמיקה את המגמה השלילית של ${refTrendHE} (${refFormatted}).`);
    }
  }

  return t(`This is a minor pullback following a strong ${refTrendEN} gain (${refFormatted}).`, `זהו תיקון קל למטה אחרי ${refProfitableHE} בסך הכל (${refFormatted}).`);
}

export function PortfolioBriefingDialog({ open, onClose, holdings, transactions, dividendRecords = [], displayCurrency, exchangeRates, boiTickerData, is1dStale, summary }: PortfolioBriefingDialogProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const responsiveProps = useResponsiveDialogProps();
  const navigate = useNavigate();

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [marketData, setMarketData] = useState<{ spx?: number, ndx?: number, tlv?: number, it?: number, energy?: number, stoxx?: number }>({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { containerRef, showTop, showBottom } = useScrollShadows('vertical');

  useEffect(() => {
    if (open) {
      const dr = timeframe === 'Custom' && customDateRange.start ? { start: customDateRange.start, end: customDateRange.end } : undefined;
      setLoadingMarket(true);
      Promise.all([
        getTickerData('^SPX', Exchange.NYSE, null),
        getTickerData('^IXIC', Exchange.NASDAQ, null),
        getTickerData('137', Exchange.TASE, 137),
        getTickerData('^NYETR', Exchange.NYSE, null),
        getTickerData('^SP500-45', Exchange.NYSE, null),
        getTickerData('^STOXX', Exchange.FWB, null)
      ]).then(([spx, ndx, tlv, nyn, it, stoxx]) => {
        const field = dr ? 'changePct1y' : (timeframe === '1D' ? 'changePct1d' : timeframe === '1W' ? 'changePctRecent' : timeframe === '1M' ? 'changePct1m' : 'changePct1y');
        setMarketData({
          spx: (spx as any)?.[field] || spx?.changePctRecent,
          ndx: (ndx as any)?.[field] || ndx?.changePctRecent,
          tlv: (tlv as any)?.[field] || tlv?.changePctRecent,
          energy: (nyn as any)?.[field] || nyn?.changePctRecent,
          it: (it as any)?.[field] || it?.changePctRecent,
          stoxx: (stoxx as any)?.[field] || stoxx?.changePctRecent
        });
      }).finally(() => {
        setLoadingMarket(false);
      });
    }
  }, [open, timeframe, customDateRange.start, customDateRange.end]);

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
            (timeframe === 'Custom') ? (
              (!customDateRange.start || d.getTime() >= customDateRange.start.getTime()) &&
              (!customDateRange.end || d.getTime() <= customDateRange.end.getTime())
            ) :
              (diff >= -365 && diff <= 0);

      if (!inPeriod) return;

      if (txn.type === 'DIVIDEND') {
        totalDivs += convertCurrency((txn.qty || txn.originalQty || 0) * (txn.price || txn.originalPrice || 0), txn.currency || 'USD', displayCurrency, exchangeRates);
      } else if (isBuy(txn.type)) {
        totalFlow += convertCurrency((txn.qty || txn.originalQty || 0) * (txn.price || txn.originalPrice || 0), txn.currency || 'USD', displayCurrency, exchangeRates);
      } else if (isSell(txn.type)) {
        totalFlow -= convertCurrency((txn.qty || txn.originalQty || 0) * (txn.price || txn.originalPrice || 0), txn.currency || 'USD', displayCurrency, exchangeRates);
      } else if (txn.vestDate) {
        const h = holdings.find(h => h.ticker === txn.ticker);
        const cp = h?.currentPrice || (txn.price || txn.originalPrice || 0);
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
            (timeframe === 'Custom') ? (
              (!customDateRange.start || d.getTime() >= customDateRange.start.getTime()) &&
              (!customDateRange.end || d.getTime() <= customDateRange.end.getTime())
            ) :
              (diff >= -365 && diff <= 0);

      if (!inPeriod) return;
      totalDivs += convertCurrency((div.unitsHeld || 0) * (div.pricePerUnit || div.grossAmount.amount || 0), div.grossAmount.currency || 'USD', displayCurrency, exchangeRates);
    });

    let totalEndVal = 0;
    let totalStartVal1M = 0;
    let totalStartVal1Y = 0;

    const groupedHoldings = new Map<string, typeof holdings[0][]>();
    for (const h of holdings) {
      if (!groupedHoldings.has(h.ticker)) groupedHoldings.set(h.ticker, []);
      groupedHoldings.get(h.ticker)!.push(h);
    }

    const movers = Array.from(groupedHoldings.values()).map(group => {
      const first = group[0];
      const agg = aggregateHoldingValues(group as any[], exchangeRates, displayCurrency);
      const val = agg.marketValue.amount;
      let pct = 0;
      if (timeframe === '1D') pct = agg.dayChangePct || 0;
      else if (timeframe === '1W') pct = first.perf1w || 0;
      else if (timeframe === '1M') pct = first.perf1m || 0;
      else if (timeframe === '3M') pct = first.perf3m || 0;
      else if (timeframe === '6M') pct = (first.perf3m || 0) * 2;
      else if (timeframe === 'YTD') pct = first.perfYtd || 0;
      else if (timeframe === '3Y') pct = first.perf3y || 0;
      else if (timeframe === '5Y') pct = first.perf5y || 0;
      else if (timeframe === 'All') pct = first.perfAll || 0;
      else if (timeframe === 'Custom') {
        const cDays = customDateRange.start
          ? Math.round(((customDateRange.end || new Date()).getTime() - customDateRange.start.getTime()) / msDaily)
          : 99999;
        // Fallback to closest bucket for holdings without historical data access here
        if (cDays <= 3) pct = agg.dayChangePct || 0;
        else if (cDays <= 10) pct = first.perf1w || 0;
        else if (cDays <= 45) pct = first.perf1m || 0;
        else if (cDays <= 120) pct = first.perf3m || 0;
        else if (cDays <= 450) pct = first.perf1y || 0;
        else if (cDays <= 1200) pct = first.perf3y || 0;
        else pct = first.perfAll || 0;
      }
      else pct = first.perf1y || 0;

      const base = val / (1 + pct);
      const gain = val - base;
      const pct1M = first.perf1m || 0;
      const base1M = val / (1 + pct1M);

      const pct1Y = first.perf1y || 0;
      const base1Y = val / (1 + pct1Y);

      return { ticker: first.ticker, exchange: first.exchange, name: first.displayName || first.longName || first.nameHe || first.ticker, gain, pct, val, base, base1M, base1Y };
    });

    for (const m of movers) {
      totalStartVal += m.base;
      totalEndVal += m.val;
      totalStartVal1M += m.base1M;
      totalStartVal1Y += m.base1Y;
    }

    const totalGainRaw = totalEndVal - totalStartVal;
    const totalPctRaw = totalStartVal > 0 ? totalGainRaw / totalStartVal : 0;
    const totalPct1MRaw = totalStartVal1M > 0 ? (totalEndVal - totalStartVal1M) / totalStartVal1M : 0;
    const totalPct1YRaw = totalStartVal1Y > 0 ? (totalEndVal - totalStartVal1Y) / totalStartVal1Y : 0;

    let totalGain = totalGainRaw;
    let totalPct = totalPctRaw;
    let totalPct1M = totalPct1MRaw;
    let totalPct1Y = totalPct1YRaw;

    if (summary) {
      totalPct1M = summary.perf1m || 0;
      totalPct1Y = summary.perf1y || 0;

      let exactPct: number | undefined;
      if (timeframe === '1D') exactPct = summary.totalDayChangePct;
      else if (timeframe === '1W') exactPct = summary.perf1w;
      else if (timeframe === '1M') exactPct = summary.perf1m;
      else if (timeframe === '3M') exactPct = summary.perf3m;
      else if (timeframe === '6M') exactPct = (summary.perf3m || 0) * 2;
      else if (timeframe === 'YTD') exactPct = summary.perfYtd;
      else if (timeframe === '1Y') exactPct = summary.perf1y;
      else if (timeframe === '3Y') exactPct = summary.perf3y;
      else if (timeframe === '5Y') exactPct = summary.perf5y;
      else if (timeframe === 'All') exactPct = summary.perfAll;

      if (exactPct !== undefined) {
        totalPct = exactPct;
        const aum = summary.aum || totalEndVal;
        const previousAUM = aum / (1 + exactPct);
        totalGain = aum - previousAUM;
      }
    }

    movers.sort((a, b) => b.gain - a.gain);
    const topGainers = movers.filter(m => m.gain > 0).slice(0, 3);
    const topLosers = movers.filter(m => m.gain < 0).reverse().slice(0, 3);
    const allMovers = movers.map(m => ({ exchange: m.exchange, name: m.name, pct: m.pct, gain: m.gain, ticker: m.ticker }));

    return { totalGain, totalPct, totalPct1M, totalPct1Y, topGainers, topLosers, allMovers, totalDivs, totalFlow, totalVests };
  }, [holdings, timeframe, transactions, exchangeRates, displayCurrency, dividendRecords, customDateRange.start, customDateRange.end, summary]);

  const recentEvents = useMemo(() => {
    const allEvents = getRecentEventsData(holdings, transactions, dividendRecords, t, boiTickerData);
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
  }, [holdings, transactions, dividendRecords, t, timeframe]);

  const handleAiSummary = () => {
    const timeframeEn = timeframe === 'Custom' && customDateRange.start
      ? `from ${formatDate(customDateRange.start)} to ${customDateRange.end ? formatDate(customDateRange.end) : 'today'}`
      : timeframe;
    const timeframeHe = timeframe === 'Custom' && customDateRange.start
      ? `מ-${formatDate(customDateRange.start)} עד ${customDateRange.end ? formatDate(customDateRange.end) : t('Today', 'היום')}`
      : t(timeframe, timeframe);

    const promptEn = `Please provide a detailed financial briefing of my portfolio performance and the broader market (S&P 500, NASDAQ, TA-125) for the period: ${timeframeEn}. Highlight key movers and recent notable events.`;
    const promptHe = `אנא ספק סיכום פיננסי מפורט של ביצועי התיק שלי ושל השוק הרחב (S&P 500, נאסד"ק, ת"א-125) לתקופה: ${timeframeHe}. ציין את המניות הבולטות ואירועים מרכזיים.`;

    const prompt = t(promptEn, promptHe);

    onClose();
    setTimeout(() => {
      navigate({ pathname: '/ai', search: `?prompt=${encodeURIComponent(prompt)}` });
    }, 50);
  };

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
                '&.Mui-selected': { bgcolor: 'background.paper', boxShadow: 1 }
              }
            }}
          >
            <ToggleButton value="1D">{is1dStale ? t('Last Trading', 'מסחר אחרון') : t('Day', 'יומי')}</ToggleButton>
            <ToggleButton value="1W">{t('Week', 'שבועי')}</ToggleButton>
            <ToggleButton value="1M">{t('Month', 'חודשי')}</ToggleButton>
            <ToggleButton value="1Y">{t('Year', 'שנתי')}</ToggleButton>
            <ToggleButton
              value="more"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                px: 1.5,
                borderLeft: "1px solid rgba(0,0,0,0.1) !important",
                color: (['3M', '6M', 'YTD', '3Y', '5Y', 'All', 'Custom'].includes(timeframe)) ? 'primary.main' : 'inherit',
                fontWeight: 800
              }}
            >
              {timeframe === 'Custom' ? <DateRangeIcon fontSize="small" /> :
                ['3M', '6M', 'YTD', '3Y', '5Y', 'All'].includes(timeframe) ? timeframe :
                  <KeyboardArrowDownIcon />}
            </ToggleButton>
          </ToggleButtonGroup>

          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} sx={{ mt: 1 }}>
            <MenuItem onClick={() => { setTimeframe("3M"); setAnchorEl(null); }} selected={timeframe === "3M"}>{t("3 Months", "3 חודשים")}</MenuItem>
            <MenuItem onClick={() => { setTimeframe("YTD"); setAnchorEl(null); }} selected={timeframe === "YTD"}>{t("YTD", "מתחילת שנה")}</MenuItem>
            <MenuItem onClick={() => { setTimeframe("All"); setAnchorEl(null); }} selected={timeframe === "All"}>{t("Lifetime", "כל הזמן")}</MenuItem>
            <MenuItem onClick={() => { setCustomRangeOpen(true); setAnchorEl(null); }} selected={timeframe === "Custom"}>
              <ListItemIcon><DateRangeIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("Custom", "מותאם אישית")}</ListItemText>
            </MenuItem>
          </Menu>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          {isMobile ? (
            <IconButton color="primary" size="small" onClick={handleAiSummary} sx={{ border: 1, borderColor: 'primary.main', borderRadius: 2, p: '5px' }}>
              <SmartToyIcon fontSize="small" />
            </IconButton>
          ) : (
            <Button variant="outlined" color="primary" size="small" startIcon={<SmartToyIcon fontSize="small" />} onClick={handleAiSummary} sx={{ borderRadius: 2, fontWeight: 'bold', minWidth: 0, px: 1.5 }}>
              <span>{t('AI Summary', 'סיכום AI')}</span>
            </Button>
          )}
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
          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover', border: 1, borderColor: 'divider', mb: 3, minHeight: isMobile ? 180 : 120 }}>
            {timeframe === 'Custom' && (customDateRange.start || customDateRange.end) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 700 }}>
                {customDateRange.start ? formatDate(customDateRange.start) : t('Inception', 'הקמה')} - {customDateRange.end ? formatDate(customDateRange.end) : t('Today', 'היום')}
              </Typography>
            )}
            <Fade
              key={timeframe + (customDateRange.start?.getTime() || '') + (customDateRange.end?.getTime() || '') + (loadingMarket ? 't' : 'f')}
              in={!loadingMarket}
              timeout={400}
            >
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {renderBriefingTextWithLinks(generateBriefingText(
                    timeframe,
                    stats,
                    marketData,
                    displayCurrency,
                    t,
                    (timeframe === 'Custom' && customDateRange.start)
                      ? Math.round(((customDateRange.end || new Date()).getTime() - customDateRange.start.getTime()) / 86400000)
                      : undefined,
                    customDateRange.end,
                    is1dStale,
                    isMobile
                  ))}
                </Typography>
              </Box>
            </Fade>
          </Box>

          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1, color: 'text.secondary' }}>{t('Market Benchmark', 'השוואת שוק')}</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
            {renderStatCard(t('Portfolio', 'התיק שלי'), '', stats.totalPct, 'transparent', 'text.primary')}
            {loadingMarket ? (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><CircularProgress size={20} /></Box>
            ) : (
              <>
                  {renderStatCard('S&P 500', '', marketData.spx, 'transparent', 'text.primary')}
                  {renderStatCard('TA-125', '', marketData.tlv, 'transparent', 'text.primary')}
              </>
            )}
          </Stack>

          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={6}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, color: 'success.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ArrowUpwardIcon fontSize="small" /> {t('Top Gainers', 'עולות')}
              </Typography>
              <Stack spacing={1.5}>
                {stats.topGainers.map(m => (
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
                ))}
                {stats.topGainers.length === 0 && <Typography variant="caption" color="text.secondary">{t('No gainers', 'אין')}</Typography>}
              </Stack>
            </Grid>

            <Grid item xs={6}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ArrowDownwardIcon fontSize="small" /> {t('Top Losers', 'יורדות')}
              </Typography>
              <Stack spacing={1.5}>
                {stats.topLosers.map(m => (
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
                ))}
                {stats.topLosers.length === 0 && <Typography variant="caption" color="text.secondary">{t('No losers', 'אין')}</Typography>}
              </Stack>
            </Grid>
          </Grid>

          {recentEvents.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, mt: 1, color: 'text.secondary' }}>{t('Events & Updates', 'אירועים ועדכונים')}</Typography>
              <Stack spacing={1}>
                {recentEvents.map(ev => {
                  const h = holdings.find(h => (h.ticker === ev.ticker && h.exchange === ev.exchange));
                  const holdingName = h ? (h.displayName || h.longName || h.nameHe || h.ticker) : (ev.ticker === 'BOI' ? t('Bank of Israel', 'בנק ישראל') : ev.ticker);
                  return (
                    <Paper key={ev.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
                      <Box sx={{ fontSize: '1.2rem', lineHeight: 1 }}><EventIcon fontSize="inherit" /></Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight="bold" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{holdingName} &middot; {ev.titleStr}</span>
                          <Typography component="span" variant="caption" color="text.secondary">{ev.dateDisplay}</Typography>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{ev.desc}{ev.valueDesc ? ` · ${ev.valueDesc}` : ""}</Typography>
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
      <CustomRangeDialog
        open={customRangeOpen}
        onClose={() => setCustomRangeOpen(false)}
        initialStart={customDateRange.start}
        initialEnd={customDateRange.end}
        onSave={(start, end) => {
          setCustomDateRange({ start, end });
          setTimeframe('Custom');
        }}
      />
    </Dialog>
  );
}
