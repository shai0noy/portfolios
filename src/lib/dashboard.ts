import { useState, useEffect, useCallback } from 'react';
import { fetchPortfolios, fetchTransactions, getExternalPrices } from './sheets/index';
import { getTickerData } from './fetching';
import { getExchangeRates, convertCurrency, calculatePerformanceInDisplayCurrency, calculateHoldingDisplayValues, normalizeCurrency, toILS } from './currency';
import { logIfFalsy } from './utils';
import { toGoogleSheetDateFormat } from './date';
import { Currency, Exchange, type DashboardHolding, type Holding, type Portfolio, type ExchangeRates } from './types';
import { SessionExpiredError } from './errors';
import { useSession } from './SessionContext';

export interface DashboardSummaryData {
  aum: number;
  totalUnrealized: number;
  totalUnrealizedGainPct: number;
  totalRealized: number;
  totalRealizedGainPct: number;
  totalCostOfSold: number;
  totalDividends: number;
  totalReturn: number;
  realizedGainAfterTax: number;
  valueAfterTax: number;
  totalDayChange: number;
  totalDayChangePct: number;
  totalDayChangeIsIncomplete: boolean;
  perf1d: number;
  perf1w: number;
  perf1w_incomplete: boolean;
  perf1m: number;
  perf1m_incomplete: boolean;
  perf3m: number;
  perf3m_incomplete: boolean;
  perf1y: number;
  perf1y_incomplete: boolean;
  perf3y: number;
  perf3y_incomplete: boolean;
  perf5y: number;
  perf5y_incomplete: boolean;
  perfYtd: number;
  perfYtd_incomplete: boolean;
  divYield: number;
}

export const INITIAL_SUMMARY: DashboardSummaryData = {
  aum: 0,
  totalUnrealized: 0,
  totalUnrealizedGainPct: 0,
  totalRealized: 0,
  totalRealizedGainPct: 0,
  totalCostOfSold: 0,
  totalDividends: 0,
  totalReturn: 0,
  realizedGainAfterTax: 0,
  valueAfterTax: 0,
  totalDayChange: 0,
  totalDayChangePct: 0,
  totalDayChangeIsIncomplete: false,
  perf1d: 0,
  perf1w: 0, perf1w_incomplete: false,
  perf1m: 0, perf1m_incomplete: false,
  perf3m: 0, perf3m_incomplete: false,
  perf1y: 0, perf1y_incomplete: false,
  perf3y: 0, perf3y_incomplete: false,
  perf5y: 0, perf5y_incomplete: false,
  perfYtd: 0, perfYtd_incomplete: false,
  divYield: 0,
};

const perfPeriods = {
  perf1w: 'perf1w',
  perf1m: 'perf1m',
  perf3m: 'perf3m',
  perfYtd: 'perfYtd',
  perf1y: 'perf1y',
  perf3y: 'perf3y',
  perf5y: 'perf5y',
} as const;

export function calculateDashboardSummary(data: DashboardHolding[], displayCurrency: string, exchangeRates: ExchangeRates): DashboardSummaryData {
  const initialAcc = {
    aum: 0,
    totalUnrealizedDisplay: 0,
    totalRealizedDisplay: 0,
    totalCostOfSoldDisplay: 0,
    totalDividendsDisplay: 0,
    totalReturnDisplay: 0,
    realizedGainAfterTaxDisplay: 0,
    valueAfterTaxDisplay: 0,
    totalDayChange: 0,
    aumWithDayChangeData: 0,
    holdingsWithDayChange: 0,
    ...Object.fromEntries(Object.keys(perfPeriods).flatMap(p => [
      [`totalChange_${p}`, 0],
      [`aumFor_${p}`, 0],
      [`holdingsFor_${p}`, 0]
    ]))
  };

  const s = data.reduce((acc, h) => {
    const vals = calculateHoldingDisplayValues(h, displayCurrency, exchangeRates);

    acc.aum += vals.marketValue;
    acc.totalUnrealizedDisplay += vals.unrealizedGain;
    acc.totalRealizedDisplay += vals.realizedGain;
    acc.totalCostOfSoldDisplay += vals.costOfSold;
    acc.totalDividendsDisplay += vals.dividends;
    acc.totalReturnDisplay += vals.totalGain;

    if (h.dayChangePct !== 0 && isFinite(h.dayChangePct)) {
      const marketValueDisplay = vals.marketValue;
      const changeValDisplay = marketValueDisplay * h.dayChangePct / (1 + h.dayChangePct);

      acc.totalDayChange += changeValDisplay;
      acc.aumWithDayChangeData += vals.marketValue;
      acc.holdingsWithDayChange++;
    }

    for (const [key, holdingKey] of Object.entries(perfPeriods)) {
      const perf = h[holdingKey as keyof DashboardHolding] as number;
      if (perf && !isNaN(perf)) {
        const { changeVal } = calculatePerformanceInDisplayCurrency(
          h.currentPrice, h.stockCurrency,
          perf, displayCurrency, exchangeRates
        );

        const currentMVDisplay = vals.marketValue;
        const totalChangeForHolding = changeVal * h.totalQty;

        (acc as any)[`totalChange_${key}`] += totalChangeForHolding;
        (acc as any)[`aumFor_${key}`] += currentMVDisplay;
        (acc as any)[`holdingsFor_${key}`]++;
      }
    }

    return acc;
  }, initialAcc);

  const summaryResult: DashboardSummaryData = {
    ...INITIAL_SUMMARY,
    aum: s.aum,
    totalUnrealized: s.totalUnrealizedDisplay,
    totalRealized: s.totalRealizedDisplay,
    totalDividends: s.totalDividendsDisplay,
    totalReturn: s.totalReturnDisplay,
    totalCostOfSold: s.totalCostOfSoldDisplay,
    totalUnrealizedGainPct: (s.aum - s.totalUnrealizedDisplay) > 0 ? s.totalUnrealizedDisplay / (s.aum - s.totalUnrealizedDisplay) : 0,
    totalRealizedGainPct: s.totalCostOfSoldDisplay > 0 ? s.totalRealizedDisplay / s.totalCostOfSoldDisplay : 0,
    totalDayChange: s.totalDayChange,
    realizedGainAfterTax: s.totalRealizedDisplay * 0.75, // Approx
    valueAfterTax: s.aum - (s.totalUnrealizedDisplay > 0 ? s.totalUnrealizedDisplay * 0.25 : 0), // Approx
    totalDayChangePct: 0, perf1d: 0
  };

  const totalHoldings = data.length;
  const prevClose = s.aumWithDayChangeData - s.totalDayChange;
  summaryResult.totalDayChangePct = prevClose > 0 ? s.totalDayChange / prevClose : 0;
  summaryResult.perf1d = summaryResult.totalDayChangePct;
  summaryResult.totalDayChangeIsIncomplete = s.holdingsWithDayChange > 0 && s.holdingsWithDayChange < totalHoldings;

  for (const key of Object.keys(perfPeriods)) {
    const totalChange = (s as any)[`totalChange_${key}`];
    const aumForPeriod = (s as any)[`aumFor_${key}`];
    const prevValue = aumForPeriod - totalChange;
    (summaryResult as any)[key] = prevValue > 0 ? totalChange / prevValue : 0;

    const holdingsForPeriod = (s as any)[`holdingsFor_${key}`];
    (summaryResult as any)[`${key}_incomplete`] = holdingsForPeriod > 0 && holdingsForPeriod < totalHoldings;
  }

  return summaryResult;
}

export function useDashboardData(sheetId: string, options: { includeUnvested: boolean }) {
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<DashboardHolding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ current: { USD: 1, ILS: 3.7 } });
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [hasFutureTxns, setHasFutureTxns] = useState(false);
  const [error, setError] = useState<any>(null);
  const { showLoginModal } = useSession();

  useEffect(() => {
    getExchangeRates(sheetId).then(setExchangeRates).catch(e => {
      if (e instanceof SessionExpiredError) {
        showLoginModal();
      } else {
        setError(e);
      }
    });
  }, [sheetId, showLoginModal]);

  const loadData = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const [ports, txns, extPrices] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId),
        getExternalPrices(sheetId)
      ]);

      setPortfolios(ports);
      const newPortMap = new Map(ports.map(p => [p.id, p]));
      const holdingMap = new Map<string, DashboardHolding>();

      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const today = new Date();
      const futureTxns = txns.filter(t => new Date(t.date) > today);
      setHasFutureTxns(futureTxns.length > 0);
      const pastTxns = txns.filter(t => new Date(t.date) <= today);
      const filteredTxns = options.includeUnvested ? pastTxns : pastTxns.filter(t => !t.vestDate || new Date(t.vestDate) <= new Date());

      const liveDataMap = new Map<string, Holding>();
      ports.forEach(p => {
        p.holdings?.forEach(h => {
          liveDataMap.set(`${h.ticker}:${h.exchange}`, h);
        });
      });

      filteredTxns.forEach(t => {
        const key = `${t.portfolioId}_${t.ticker}`;
        const p = logIfFalsy(newPortMap.get(t.portfolioId), `Portfolio not found for ID ${t.portfolioId}`, t);
        const portfolioCurrency = normalizeCurrency(p?.currency || 'USD');

        if (!holdingMap.has(key)) {
          const live = liveDataMap.get(`${t.ticker}:${t.exchange}`);
          const exchange = t.exchange || live?.exchange;

          if (!exchange) {
            console.warn(`Exchange missing for ticker: ${t.ticker}`);
            return;
          }
          const isTase = exchange === Exchange.TASE;

          const stockCurrency = normalizeCurrency(live?.currency || t.currency || (isTase ? Currency.ILA : Currency.USD));
          const currentPrice = live?.price || 0;

          holdingMap.set(key, {
            key,
            portfolioId: t.portfolioId,
            portfolioName: p?.name || t.portfolioId,
            portfolioCurrency,
            ticker: t.ticker,
            exchange: exchange,
            displayName: live?.name || t.ticker,
            nameHe: live?.nameHe,
            qtyVested: 0,
            qtyUnvested: 0,
            totalQty: 0,
            currentPrice: currentPrice,
            stockCurrency,
            costBasisPortfolioCurrency: 0, costOfSoldPortfolioCurrency: 0, proceedsPortfolioCurrency: 0, dividendsPortfolioCurrency: 0,
            unrealizedGainPortfolioCurrency: 0, realizedGainPortfolioCurrency: 0, totalGainPortfolioCurrency: 0, marketValuePortfolioCurrency: 0,
            dayChangeValuePortfolioCurrency: 0, costBasisStockCurrency: 0, costOfSoldStockCurrency: 0, proceedsStockCurrency: 0, dividendsStockCurrency: 0,
            costBasisUSD: 0, costOfSoldUSD: 0, proceedsUSD: 0, dividendsUSD: 0, realizedGainUSD: 0,
            costBasisILS: 0, costOfSoldILS: 0, proceedsILS: 0, dividendsILS: 0, realizedGainILS: 0,
            avgCost: 0, mvVested: 0, mvUnvested: 0, totalMV: 0, realizedGain: 0, realizedGainPct: 0, realizedGainAfterTax: 0, dividends: 0, unrealizedGain: 0, unrealizedGainPct: 0, totalGain: 0, totalGainPct: 0, valueAfterTax: 0, dayChangeVal: 0,
            sector: live?.sector || '',
            dayChangePct: live?.changePct1d || 0,
            perf1w: live?.changePctRecent || 0, perf1m: live?.changePct1m || 0, perf3m: live?.changePct3m || 0,
            perfYtd: live?.changePctYtd || 0, perf1y: live?.changePct1y || 0, perf3y: live?.changePct3y || 0, perf5y: live?.changePct5y || 0,
          });
        }

        const h = holdingMap.get(key)!;
        const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();
        let originalPricePortfolioCurrency = 0;
        const priceInUSD = (t as any).originalPriceUSD || 0;
        const priceInAgorot = (t as any).originalPriceILA || 0;
        const priceInILS = toILS(priceInAgorot, Currency.ILA);
        const tQty = t.qty || 0;

        if (portfolioCurrency === Currency.ILS) {
          originalPricePortfolioCurrency = priceInILS;
        } else {
          originalPricePortfolioCurrency = convertCurrency(priceInUSD, Currency.USD, portfolioCurrency, exchangeRates);
        }

        const txnValuePortfolioCurrency = tQty * originalPricePortfolioCurrency;
        let effectiveTxnPrice = t.price || 0;
        if (h.stockCurrency === Currency.ILA) effectiveTxnPrice = priceInAgorot;
        else if (h.stockCurrency === Currency.ILS) effectiveTxnPrice = priceInILS;
        else if (h.stockCurrency === Currency.USD) effectiveTxnPrice = priceInUSD;
        else {
          const txnCurrency = normalizeCurrency(t.currency || '');
          if (txnCurrency === Currency.ILA) effectiveTxnPrice = toILS(effectiveTxnPrice, Currency.ILA);
        }

        const txnValueStockCurrency = tQty * effectiveTxnPrice;
        const txnValueUSD = tQty * priceInUSD;
        const txnValueILS = tQty * priceInILS;

        if (t.type === 'BUY') {
          if (isVested) h.qtyVested += tQty; else h.qtyUnvested += tQty;
          h.costBasisPortfolioCurrency += txnValuePortfolioCurrency;
          h.costBasisStockCurrency += txnValueStockCurrency;
          h.costBasisUSD += txnValueUSD;
          h.costBasisILS += txnValueILS;
        } else if (t.type === 'SELL') {
          const totalQtyPreSell = h.qtyVested + h.qtyUnvested;
          const avgCostPC = totalQtyPreSell > 1e-9 ? h.costBasisPortfolioCurrency / totalQtyPreSell : 0;
          const costOfSoldPC = avgCostPC * tQty;
          const avgCostSC = totalQtyPreSell > 1e-9 ? h.costBasisStockCurrency / totalQtyPreSell : 0;
          const costOfSoldSC = avgCostSC * tQty;
          const avgCostUSD = totalQtyPreSell > 1e-9 ? h.costBasisUSD / totalQtyPreSell : 0;
          const costOfSoldUSD = avgCostUSD * tQty;
          const avgCostILS = totalQtyPreSell > 1e-9 ? h.costBasisILS / totalQtyPreSell : 0;
          const costOfSoldILS = avgCostILS * tQty;

          h.costOfSoldPortfolioCurrency += costOfSoldPC;
          h.proceedsPortfolioCurrency += txnValuePortfolioCurrency;
          h.costBasisPortfolioCurrency -= costOfSoldPC;
          h.costOfSoldStockCurrency += costOfSoldSC;
          h.proceedsStockCurrency += txnValueStockCurrency;
          h.costBasisStockCurrency -= costOfSoldSC;
          h.costOfSoldUSD += costOfSoldUSD;
          h.proceedsUSD += txnValueUSD;
          h.costBasisUSD -= costOfSoldUSD;
          h.costOfSoldILS += costOfSoldILS;
          h.proceedsILS += txnValueILS;
          h.costBasisILS -= costOfSoldILS;

          if (Math.abs(h.costBasisPortfolioCurrency) < 1e-6) h.costBasisPortfolioCurrency = 0;
          if (Math.abs(h.costBasisStockCurrency) < 1e-6) h.costBasisStockCurrency = 0;
          if (Math.abs(h.costBasisUSD) < 1e-6) h.costBasisUSD = 0;
          if (Math.abs(h.costBasisILS) < 1e-6) h.costBasisILS = 0;

          let qtyToSell = tQty;
          if (isVested) {
            const canSellVested = Math.min(qtyToSell, h.qtyVested);
            h.qtyVested -= canSellVested;
            qtyToSell -= canSellVested;
          }
          if (qtyToSell > 0 && options.includeUnvested) {
            const canSellUnvested = Math.min(qtyToSell, h.qtyUnvested);
            h.qtyUnvested -= canSellUnvested;
          }
        } else if (t.type === 'DIVIDEND') {
          const taxAmountPC = txnValuePortfolioCurrency * (t.tax || 0);
          h.dividendsPortfolioCurrency += txnValuePortfolioCurrency - taxAmountPC;
          const taxAmountSC = txnValueStockCurrency * (t.tax || 0);
          h.dividendsStockCurrency += txnValueStockCurrency - taxAmountSC;
          const taxAmountUSD = txnValueUSD * (t.tax || 0);
          h.dividendsUSD += txnValueUSD - taxAmountUSD;
          const taxAmountILS = txnValueILS * (t.tax || 0);
          h.dividendsILS += txnValueILS - taxAmountILS;
        }
      });

      const processedHoldings: DashboardHolding[] = [];
      const holdingsList = Array.from(holdingMap.values());
      const missingDataPromises = holdingsList.map(async (h) => {
        const needsFetch = !h.currentPrice || h.currentPrice === 0 || h.exchange === Exchange.GEMEL || h.exchange === Exchange.PENSION || h.dayChangePct === 0;

        if (needsFetch) {
          try {
            const live = await getTickerData(h.ticker, h.exchange, null);
            if (live) {
              if ((live.exchange === Exchange.GEMEL || live.exchange === Exchange.PENSION) && live.timestamp) {
                const key = `${live.exchange}:${live.ticker}`;
                const storedHistory = extPrices[key];
                if (storedHistory) {
                  const liveDate = new Date(live.timestamp);
                  liveDate.setHours(0, 0, 0, 0);
                  const match = storedHistory.find(item => {
                    const itemDate = new Date(item.date);
                    itemDate.setHours(0, 0, 0, 0);
                    return itemDate.getTime() === liveDate.getTime();
                  });
                  if (match) {
                    const diff = Math.abs(match.price - (live.price || 0));
                    if (diff > 0.01) console.warn(`[Data Mismatch] ${key} at ${toGoogleSheetDateFormat(match.date)}: Live=${live.price}, Stored=${match.price}`);
                    else console.log(`[Data Verified] ${key} at ${toGoogleSheetDateFormat(match.date)}: Match (${live.price})`);
                  } else {
                    console.log(`[Data Info] ${key}: New live data point for ${toGoogleSheetDateFormat(liveDate)}. Latest stored: ${storedHistory[0]?.date ? toGoogleSheetDateFormat(storedHistory[0].date) : 'None'}`);
                  }
                }
              }
              if (live.price) h.currentPrice = live.price;
              if (live.changePct1d !== undefined) h.dayChangePct = live.changePct1d;
              if (live.name) h.displayName = live.name;
              if (live.nameHe) h.nameHe = live.nameHe;
              if (live.sector) h.sector = live.sector;
              if ([5,6,7,8].includes(live.recentChangeDays || 0)) {
                h.perf1w = live.changePctRecent!;
              }
              if (live.changePct1m !== undefined) h.perf1m = live.changePct1m;
              if (live.changePct3m !== undefined) h.perf3m = live.changePct3m;
              if (live.changePctYtd !== undefined) h.perfYtd = live.changePctYtd;
              if (live.changePct1y !== undefined) h.perf1y = live.changePct1y;
              if (live.changePct3y !== undefined) h.perf3y = live.changePct3y;
              if (live.changePct5y !== undefined) h.perf5y = live.changePct5y;
            }
          } catch (e) {
            console.warn(`Failed to hydrate missing data for ${h.ticker}`, e);
          }
        }
        return h;
      });

      await Promise.all(missingDataPromises);

      holdingMap.forEach(h => {
        h.totalQty = h.qtyVested + h.qtyUnvested;
        const priceInStockCurrency = h.currentPrice;
        const currentPricePC = convertCurrency(priceInStockCurrency, h.stockCurrency, h.portfolioCurrency, exchangeRates);
        h.marketValuePortfolioCurrency = h.totalQty * currentPricePC;
        h.unrealizedGainPortfolioCurrency = h.marketValuePortfolioCurrency - h.costBasisPortfolioCurrency;
        h.realizedGainPortfolioCurrency = h.proceedsPortfolioCurrency - h.costOfSoldPortfolioCurrency;
        h.totalGainPortfolioCurrency = h.unrealizedGainPortfolioCurrency + h.realizedGainPortfolioCurrency + h.dividendsPortfolioCurrency;
        h.dayChangeValuePortfolioCurrency = h.marketValuePortfolioCurrency * h.dayChangePct;
        h.avgCost = h.totalQty > 1e-9 ? h.costBasisStockCurrency / h.totalQty : 0;
        h.mvVested = h.qtyVested * currentPricePC;
        h.mvUnvested = h.qtyUnvested * currentPricePC;
        h.totalMV = h.marketValuePortfolioCurrency;
        h.unrealizedGainPct = h.costBasisPortfolioCurrency > 1e-6 ? h.unrealizedGainPortfolioCurrency / h.costBasisPortfolioCurrency : 0;
        h.realizedGainPct = h.costOfSoldPortfolioCurrency > 1e-6 ? h.realizedGainPortfolioCurrency / h.costOfSoldPortfolioCurrency : 0;
        h.totalGainPct = (h.costBasisPortfolioCurrency + h.costOfSoldPortfolioCurrency) > 1e-6 ? h.totalGainPortfolioCurrency / (h.costBasisPortfolioCurrency + h.costOfSoldPortfolioCurrency) : 0;
        processedHoldings.push(h);
      });

      setHoldings(processedHoldings);
    } catch (e) {
      console.error('loadData error:', e);
      if (e instanceof SessionExpiredError) {
        showLoginModal();
      } else {
        setError(e);
      }
    } finally {
      setLoading(false);
    }
  }, [sheetId, options.includeUnvested, exchangeRates, showLoginModal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh: loadData };
}
