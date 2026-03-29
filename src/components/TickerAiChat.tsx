import React from 'react';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import EventIcon from '@mui/icons-material/Event';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BalanceIcon from '@mui/icons-material/Balance';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { BaseAiChatDialog } from './chat/BaseAiChatDialog';
import { useLanguage } from '../lib/i18n';
import type { Holding } from '../lib/data/model';
import { formatMoneyValue, formatPercent } from '../lib/currency';
import { Exchange, type ExchangeRates } from '../lib/types';
import { aggregateHoldingValues } from '../lib/data/holding_utils';
import { computeAnalysisMetrics, calculateReturns, getAnnualizationFactor, synchronizeSeries } from '../lib/utils/analysis';
import type { TickerData } from '../lib/fetching/types';
import { fetchTickerHistory } from '../lib/fetching';
import { useState, useEffect } from 'react';

interface TickerAiChatProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  tickerData?: TickerData;
  advancedStats?: any;
  historicalData?: { date: Date; price: number }[];
  holdings: Holding[];
  displayCurrency: string;
  exchangeRates?: ExchangeRates | null;
  subjectName?: string;
  sheetId?: string;
}

export const TickerAiChat: React.FC<TickerAiChatProps> = ({
  open, onClose, apiKey, tickerData, advancedStats, historicalData, holdings, displayCurrency, exchangeRates, subjectName, sheetId
}) => {
  const { t } = useLanguage();
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<any>(null);

  useEffect(() => {
    if (!open || !historicalData || historicalData.length < 2 || !tickerData) return;

    // Choose Benchmark based on Exchange
    let benchTicker = '^SPX';
    let benchExchange: Exchange = Exchange.NYSE;
    let benchmarkName = 'S&P 500';
    const isIL = ['TASE', 'PENSION', 'GEMEL'].includes(tickerData.exchange);
    if (isIL || tickerData.currency === 'ILS' || tickerData.currency === 'ILA') {
      benchTicker = '137'; // TA-125
      benchExchange = Exchange.TASE;
      benchmarkName = 'TA-125';
    }

    const fetchBenchmarkAndCompute = async () => {
      try {
        const resp = await fetchTickerHistory(benchTicker, benchExchange);
        if (resp?.historical && resp.historical.length > 1) {
          const benchData = resp.historical.map(d => ({ timestamp: d.date.getTime(), value: d.price }));
          const mainData = historicalData.map(d => ({ timestamp: d.date.getTime(), value: d.price }));

          // Sync Benchmark to Main (x=Bench, y=Main)
          const pairs = synchronizeSeries(benchData, mainData);
          if (pairs.length >= 2) {
            const returnPairs = calculateReturns(pairs);
            const annualFactor = getAnnualizationFactor(historicalData.map(d => d.date));
            // Standard Alpha/Beta Calc requires Risk Free, but without it computes relative
            const metrics = computeAnalysisMetrics(returnPairs, undefined, annualFactor);
            if (metrics) {
              setBenchmarkMetrics({
                benchmarkUsed: benchmarkName,
                sharpeRatio: metrics.sharpeRatio.toFixed(2),
                alpha: metrics.alpha.toFixed(3),
                beta: metrics.beta.toFixed(2),
                rSquared: metrics.rSquared.toFixed(2),
                correlation: metrics.correlation.toFixed(2),
                downsideBeta: metrics.downsideBeta.toFixed(2),
                downsideAlpha: metrics.downsideAlpha.toFixed(4)
              });
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch benchmark for chat context", e);
      }
    };
    fetchBenchmarkAndCompute();
  }, [open, historicalData, tickerData]);

  if (!tickerData) return null;

  const summarizeTicker = () => {

    let advancedMetrics: any = benchmarkMetrics || 'Not enough historical data or benchmark missing, but raw standard deviation can be calculated';
    if (!benchmarkMetrics && historicalData && historicalData.length >= 2) {
      const pricePairs = historicalData.map(d => ({ x: d.price, y: d.price, timestamp: d.date.getTime() }));
      const returnPairs = calculateReturns(pricePairs);
      const annualFactor = getAnnualizationFactor(historicalData.map(d => d.date));
      // Passing undefined for Risk Free to get raw Sharpe Ratio
      const metrics = computeAnalysisMetrics(returnPairs, undefined, annualFactor);
      if (metrics) {
        advancedMetrics = {
          sharpeRatio: metrics.sharpeRatio.toFixed(2),
          // We can't do true alpha/beta without a benchmark, so we skip providing them if they evaluate to NaN/0 or we just provide raw standard deviation via math
          annualizedVolatility: (Math.sqrt(returnPairs.reduce((acc, val) => acc + (val.y - (returnPairs.reduce((a, b) => a + b.y, 0) / returnPairs.length)) ** 2, 0) / (returnPairs.length - 1)) * Math.sqrt(annualFactor) * 100).toFixed(2) + '%'
        };
      }
    }

    // Generate context string specifically for this ticker
    const contextObj = {
      analyzedAsset: {
        symbol: tickerData.ticker,
        exchange: tickerData.exchange,
        name: tickerData.name,
        nameHebrew: tickerData.nameHe,
        sector: tickerData.sector || 'N/A',
        subSector: tickerData.subSector,
        industry: tickerData.subSector || 'N/A',
        currency: tickerData.currency,
        typeId1: tickerData.globesTypeHe,
        typeId2: tickerData.taseType,
        providentInfo: tickerData.providentInfo,
        lastPrice: tickerData.price,
        changePct: {
          oneDay: tickerData.changePct1d ? formatPercent(tickerData.changePct1d) : 'N/A',
          oneMonth: tickerData.changePct1m ? formatPercent(tickerData.changePct1m) : 'N/A',
          threeMonth: tickerData.changePct3m ? formatPercent(tickerData.changePct3m) : 'N/A',
          ytd: tickerData.changePctYtd ? formatPercent(tickerData.changePctYtd) : 'N/A',
          oneYear: tickerData.changePct1y ? formatPercent(tickerData.changePct1y) : 'N/A',
          threeYear: tickerData.changePct3y ? formatPercent(tickerData.changePct3y) : 'N/A',
          fiveYear: tickerData.changePct5y ? formatPercent(tickerData.changePct5y) : 'N/A',
          tenYear: tickerData.changePct10y ? formatPercent(tickerData.changePct10y) : 'N/A',
          max: tickerData.changePctMax ? formatPercent(tickerData.changePctMax) : 'N/A',
          isStaleDayChange: tickerData.isStaleDayChange || false
        },
        dividendYield: tickerData.dividendYield ? formatPercent(tickerData.dividendYield) : 'N/A',
      },
      advancedStats,
      advancedTrailingMetrics: advancedMetrics,
      userHoldings: holdings.filter(h => h.ticker === tickerData.ticker).map(h => {
        const vals = exchangeRates ? aggregateHoldingValues([h], exchangeRates, displayCurrency) : null;
        return {
          portfolioId: h.portfolioId,
          totalQuantity: vals ? vals.totalQty : h.qtyTotal || 0,
          weightInAllHoldings: vals ? formatPercent(vals.weightInGlobal) : 'N/A',
          vestedQuantity: h.qtyVested || 0,
          unvestedQuantity: h.qtyUnvested || 0,
          marketValue: vals ? formatMoneyValue(vals.marketValue) : formatMoneyValue(h.marketValueTotal),
          unvestedValue: vals ? formatMoneyValue(vals.unvestedValue) : 'N/A',
          unrealizedGainPct: h.unrealizedGainPct ? formatPercent(h.unrealizedGainPct) : 'N/A',
          realizedGainNet: vals ? formatMoneyValue(vals.realizedGainNet) : 'N/A',
          realizedGainPct: (vals && vals.realizedGainPct) ? formatPercent(vals.realizedGainPct) : 'N/A',
          avgYearlyReturn: h.avgYearlyReturn ? formatPercent(h.avgYearlyReturn) : 'N/A',
          avgHoldingPeriodYears: h.avgHoldingTimeYears,
          dividendsTotal: h.dividendsTotal
        }
      })
    };
    return JSON.stringify(contextObj, null, 2);
  };

  const getSystemInstruction = () => {
    return `You are a financial assistant. Be professional, objective, and direct. Focus on data-driven analysis and facts. Provide suffciently comprehnsive responses.
Please be careful in your wording around suggestions - you are just an AI.
- Refer to the user in the 2nd person.
- Do NOT list sources at the end of your response.
- You can create interactive links in your response using these formats:
 * {prompt::Text to prefill} to suggest a new prompt for the user - use it to suggest a followup question or two.
 * {ticker::Label::EXCHANGE:SYMBOL} to link to a specific ticker e.g. {ticker::Google::NASDAQ:GOOGL}
 * {userinfo::Button Text} to link to the user profile info form
 * {url::Label::Path} to navigate to any URL
 * NOT supported - {portfolio::XYZ}
 * They CANNOT be nested

>> We are discussing the following asset - avoid parroting the data, use it to provide insights and refer to it as needed:

${summarizeTicker()}`;
  };

  const suggestions = [
    { text: t('Summarize this asset', 'סכם את הנכס הזה'), icon: <AssessmentOutlinedIcon fontSize="small" /> },
    { text: t('Summarize my holdings in this asset', 'סכם את האחזקות שלי בנכס הזה'), icon: <AccountBalanceWalletIcon fontSize="small" /> },
    { text: t('What are the recent news or events?', 'מה החדשות או האירועים האחרונים?'), icon: <EventIcon fontSize="small" /> },
    { text: t('Analyze performance over the last year', 'נתח את ביצועיו בשנה האחרונה'), icon: <TrendingUpIcon fontSize="small" /> },
    { text: t('Compare to its sector peers', 'השווה אותו למתחרים בסקטור'), icon: <BalanceIcon fontSize="small" /> },
    { text: t('How are the company fundamentals?', 'מהם יסודות החברה?'), icon: <QueryStatsIcon fontSize="small" /> },
    { text: t('Help me understand this asset metrics', 'עזור לי להבין את מדדי הנכס הזה'), icon: <LightbulbOutlinedIcon fontSize="small" /> }
  ];

  return (
    <BaseAiChatDialog
      open={open}
      onClose={onClose}
      apiKey={apiKey}
      sheetId={sheetId}
      chatId={`ticker_${tickerData?.exchange}_${tickerData?.ticker}`}
      contextUrl={`/ticker/${tickerData?.exchange}/${tickerData?.ticker}` + window.location.search}
      title={`${t('AI Assistant', 'עוזר AI')} - ${tickerData.ticker || subjectName || ''} `}
      displayName={tickerData.ticker || subjectName}
      getSystemInstruction={getSystemInstruction}
      suggestions={suggestions}
    />
  );
};
