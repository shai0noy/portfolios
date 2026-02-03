import { useState, useEffect, useCallback } from 'react';
import { InstrumentType } from './types/instrument';
import { fetchPortfolios, fetchTransactions, getExternalPrices, fetchAllDividends } from './sheets/index';
import { getTickerData } from './fetching';
import { fetchCpi } from './fetching/cbs';
import type { TickerData } from './fetching/types';
import { getExchangeRates, convertCurrency, calculatePerformanceInDisplayCurrency, calculateHoldingDisplayValues, normalizeCurrency, toILS } from './currency';
import { logIfFalsy } from './utils';
import { toGoogleSheetDateFormat } from './date';
import { Currency, Exchange, type DashboardHolding, type Holding, type Portfolio, type ExchangeRates, type Transaction } from './types';
import { SessionExpiredError } from './errors';
import { useSession } from './SessionContext';

/**

 * Helper to interpolate CPI from historical data.

 * Used for Israeli 'REAL_GAIN' tax policy where gains are adjusted for inflation.

 */

const getCPI = (date: Date, cpiData: TickerData | null) => {

    if (!cpiData?.historical || cpiData.historical.length === 0) return 100;

    const timestamp = date.getTime();

    const history = cpiData.historical; // Assumed Date Descending

    

    // If date is NEWER than history, use the latest known value

    if (timestamp >= history[0].date.getTime()) return history[0].price;



    for (let i = 0; i < history.length - 1; i++) {

        const h1 = history[i]; // Newer

        const h2 = history[i+1]; // Older

        

        if (timestamp <= h1.date.getTime() && timestamp >= h2.date.getTime()) {

            const t1 = h1.date.getTime();

            const t2 = h2.date.getTime();

            const ratio = (t1 === t2) ? 0 : (timestamp - t2) / (t1 - t2);

            return h2.price + (h1.price - h2.price) * ratio;

        }

    }

    

    // If date is OLDER than history, use the oldest known value

    return history[history.length - 1].price;

};



/**
 * Data structure representing the aggregate performance of a portfolio or group of portfolios.
 */
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

interface SummaryAcc {
  aum: number;
  totalUnrealizedDisplay: number;
  totalRealizedDisplay: number;
  totalCostOfSoldDisplay: number;
  totalDividendsDisplay: number;
  totalReturnDisplay: number;
  totalRealizedTaxDisplay: number;
  totalUnrealizedTaxDisplay: number;
  totalDayChange: number;
  aumWithDayChangeData: number;
  holdingsWithDayChange: number;
  [key: string]: any;
}

/**
 * Aggregates holding-level data into a global summary.
 * Implements sophisticated taxation logic calculated in ILS and converted back to display currency.
 */
export function calculateDashboardSummary(data: DashboardHolding[], displayCurrency: string, exchangeRates: ExchangeRates, portfolios: Map<string, Portfolio>): DashboardSummaryData {
  // 1. Accumulate Per-Portfolio Data for Tax Offsetting (Kizuz)
  const portfolioAcc: Record<string, {
      costBasisTotalILS: number;
      feesILS: number;
      ils: {
          std: { unrealized: number; realized: number; },
          reit: { realized: number; }
      }
  }> = {};

  const globalAcc: SummaryAcc = {
    aum: 0,
    totalUnrealizedDisplay: 0,
    totalRealizedDisplay: 0,
    totalCostOfSoldDisplay: 0,
    totalDividendsDisplay: 0,
    totalReturnDisplay: 0,
    totalRealizedTaxDisplay: 0,
    totalUnrealizedTaxDisplay: 0,
    totalDayChange: 0,
    aumWithDayChangeData: 0,
    holdingsWithDayChange: 0,
  };

  Object.keys(perfPeriods).forEach(p => {
    globalAcc[`totalChange_${p}`] = 0;
    globalAcc[`aumFor_${p}`] = 0;
    globalAcc[`holdingsFor_${p}`] = 0;
  });

  data.forEach(h => {
    const vals = calculateHoldingDisplayValues(h, displayCurrency, exchangeRates);
    globalAcc.aum += vals.marketValue;
    globalAcc.totalUnrealizedDisplay += vals.unrealizedGain;
    globalAcc.totalRealizedDisplay += vals.realizedGain;
    globalAcc.totalCostOfSoldDisplay += vals.costOfSold;
    globalAcc.totalDividendsDisplay += vals.dividends;
    globalAcc.totalReturnDisplay += vals.totalGain;

    const p = portfolios.get(h.portfolioId);
    if (!portfolioAcc[h.portfolioId]) {
        portfolioAcc[h.portfolioId] = { 
            costBasisTotalILS: 0,
            feesILS: 0,
            ils: { 
                std: { unrealized: 0, realized: 0 },
                reit: { realized: 0 }
            }
        };
    }
    const pAcc = portfolioAcc[h.portfolioId];
    pAcc.costBasisTotalILS += h.costBasisILS;
    pAcc.feesILS += convertCurrency(h.totalFeesPortfolioCurrency, h.portfolioCurrency, Currency.ILS, exchangeRates);

    let taxableUnrealizedILS = 0;
    let taxableRealizedILS = 0;
    if (p?.taxPolicy === 'REAL_GAIN') {
        taxableRealizedILS = h.realizedTaxableGainILS;
        taxableUnrealizedILS = h.unrealizedTaxableGainILS;
    } else {
        const priceInILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, exchangeRates);
        taxableRealizedILS = h.realizedGainILS;
        taxableUnrealizedILS = (h.totalQty * priceInILS) - h.costBasisILS;
    }

    // Capital Gains always go to Standard Bucket (CGT)
    pAcc.ils.std.unrealized += taxableUnrealizedILS;
    pAcc.ils.std.realized += taxableRealizedILS;

    // Dividends: REIT Dividends use Income Tax if configured, otherwise Standard Bucket
    const isReit = h.type?.type === InstrumentType.STOCK_REIT;
    const incTax = p?.incTax || 0;
    if (isReit && incTax > 0) {
        pAcc.ils.reit.realized += h.dividendsILS;
    } else {
        pAcc.ils.std.realized += h.dividendsILS;
    }

    if (h.dayChangePct !== 0 && isFinite(h.dayChangePct)) {
      globalAcc.totalDayChange += vals.marketValue * h.dayChangePct / (1 + h.dayChangePct);
      globalAcc.aumWithDayChangeData += vals.marketValue;
      globalAcc.holdingsWithDayChange++;
    }

    for (const [key, holdingKey] of Object.entries(perfPeriods)) {
      const perf = h[holdingKey as keyof DashboardHolding] as number;
      if (perf && !isNaN(perf)) {
        const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, perf, displayCurrency, exchangeRates);
        globalAcc[`totalChange_${key}`] += changeVal * h.totalQty;
        globalAcc[`aumFor_${key}`] += vals.marketValue;
        globalAcc[`holdingsFor_${key}`]++;
      }
    }
  });

  // 2. Calculate Final Tax Liability (In ILS) and apply to Display Summary
  Object.keys(portfolioAcc).forEach(pid => {
      const pData = portfolioAcc[pid];
      const p = portfolios.get(pid);
      let cgt = p?.cgt ?? 0.25;
      let incTax = p?.incTax ?? 0;
      if (p?.taxPolicy === 'TAX_FREE') { cgt = 0; incTax = 0; }

      let deductibleFeesILS = (p?.taxPolicy === 'REAL_GAIN') ? pData.feesILS : 0;
      
      // Standard Bucket: Deduct fees, then apply CGT with offsetting.
      const netStdRealizedGainILS = pData.ils.std.realized - deductibleFeesILS;
      const stdUnrealizedTaxILS = pData.ils.std.unrealized > 0 ? pData.ils.std.unrealized * cgt : 0;
      const stdRealizedTaxILS = netStdRealizedGainILS > 0 ? netStdRealizedGainILS * cgt : 0;
      
      // REIT Bucket: Only dividends, taxed at incTax rate.
      const reitRealizedTaxILS = pData.ils.reit.realized > 0 ? pData.ils.reit.realized * incTax : 0;
      
      // Wealth Tax (Income Tax on Base)
      const incomeTaxOnBaseILS = pData.costBasisTotalILS * incTax;

      const totalRealizedTaxILS = stdRealizedTaxILS + reitRealizedTaxILS;
      const totalUnrealizedTaxILS = stdUnrealizedTaxILS + incomeTaxOnBaseILS;

      // Convert ILS tax liability to Display Currency
      globalAcc.totalRealizedTaxDisplay += convertCurrency(totalRealizedTaxILS, Currency.ILS, displayCurrency, exchangeRates);
      globalAcc.totalUnrealizedTaxDisplay += convertCurrency(totalUnrealizedTaxILS, Currency.ILS, displayCurrency, exchangeRates);
  });

  const summaryResult: DashboardSummaryData = {
    ...INITIAL_SUMMARY,
    aum: globalAcc.aum,
    totalUnrealized: globalAcc.totalUnrealizedDisplay,
    totalRealized: globalAcc.totalRealizedDisplay,
    totalDividends: globalAcc.totalDividendsDisplay,
    totalReturn: globalAcc.totalReturnDisplay,
    totalCostOfSold: globalAcc.totalCostOfSoldDisplay,
    totalUnrealizedGainPct: (globalAcc.aum - globalAcc.totalUnrealizedDisplay) > 0 ? globalAcc.totalUnrealizedDisplay / (globalAcc.aum - globalAcc.totalUnrealizedDisplay) : 0,
    totalRealizedGainPct: globalAcc.totalCostOfSoldDisplay > 0 ? globalAcc.totalRealizedDisplay / globalAcc.totalCostOfSoldDisplay : 0,
    totalDayChange: globalAcc.totalDayChange,
    realizedGainAfterTax: (globalAcc.totalRealizedDisplay + globalAcc.totalDividendsDisplay) - globalAcc.totalRealizedTaxDisplay,
    valueAfterTax: globalAcc.aum - globalAcc.totalUnrealizedTaxDisplay,
  };

  const totalHoldings = data.length;
  const prevClose = globalAcc.aumWithDayChangeData - globalAcc.totalDayChange;
  summaryResult.totalDayChangePct = prevClose > 0 ? globalAcc.totalDayChange / prevClose : 0;
  summaryResult.perf1d = summaryResult.totalDayChangePct;
  summaryResult.totalDayChangeIsIncomplete = globalAcc.holdingsWithDayChange > 0 && globalAcc.holdingsWithDayChange < totalHoldings;

  for (const key of Object.keys(perfPeriods)) {
    const totalChange = globalAcc[`totalChange_${key}`];
    const aumForPeriod = globalAcc[`aumFor_${key}`];
    const prevValue = aumForPeriod - totalChange;
    (summaryResult as any)[key] = prevValue > 0 ? totalChange / prevValue : 0;
    (summaryResult as any)[`${key}_incomplete`] = globalAcc[`holdingsFor_${key}`] > 0 && globalAcc[`holdingsFor_${key}`] < totalHoldings;
  }
  return summaryResult;
}

/**
 * Main data fetching hook for the Dashboard.
 * Orchestrates fetching portfolios, transactions, and dividends.
 * Performs chronological event replay to maintain quantity-aware states and apply complex tax rules.
 */
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
      if (e instanceof SessionExpiredError) { setError('session_expired'); showLoginModal(); } 
      else setError(e);
    });
  }, [sheetId, showLoginModal]);

  const loadData = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const [ports, txns, extPrices, sheetDividends, realCpi] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId),
        getExternalPrices(sheetId),
        fetchAllDividends(sheetId),
        fetchCpi(120010)
      ]);

      setPortfolios(ports);
      const newPortMap = new Map(ports.map(p => [p.id, p]));
      const holdingMap = new Map<string, DashboardHolding>();
      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const today = new Date();
      const pastTxns = txns.filter(t => new Date(t.date) <= today);
      setHasFutureTxns(txns.length > pastTxns.length);
      
      const combinedEvents: (Transaction & { kind: 'TXN' } | { kind: 'DIV_EVENT', date: string, ticker: string, exchange: Exchange, amountPerShare: number })[] = 
          pastTxns.map(t => ({ ...t, kind: 'TXN' }));

      sheetDividends.forEach(d => {
          const dateKey = d.date.toISOString().split('T')[0];
          // Deduplicate: Manual DIVIDEND transactions take precedence over external/auto-synced ones.
          const hasManual = txns.some(t => t.ticker === d.ticker && t.type === 'DIVIDEND' && t.date.startsWith(dateKey) && Math.abs((t.price || 0) - d.amount) < 0.001);
          if (!hasManual) {
              combinedEvents.push({ kind: 'DIV_EVENT', date: dateKey, ticker: d.ticker, exchange: d.exchange, amountPerShare: d.amount });
          }
      });

      combinedEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const processingEvents = options.includeUnvested 
          ? combinedEvents 
          : combinedEvents.filter(e => e.kind === 'DIV_EVENT' || !e.vestDate || new Date(e.vestDate) <= new Date());

      const liveDataMap = new Map<string, Holding>();
      ports.forEach(p => p.holdings?.forEach(h => liveDataMap.set(`${h.ticker}:${h.exchange}`, h)));

      processingEvents.forEach(e => {
        if (e.kind === 'DIV_EVENT') {
             holdingMap.forEach(h => {
                 if (h.ticker === e.ticker && h.exchange === e.exchange) {
                     const qty = h.qtyVested + h.qtyUnvested;
                     if (qty > 0) {
                         const totalAmountSC = qty * e.amountPerShare;
                         h.dividendsPortfolioCurrency += convertCurrency(totalAmountSC, h.stockCurrency, h.portfolioCurrency, exchangeRates);
                         h.dividendsStockCurrency += totalAmountSC;
                         h.dividendsUSD += convertCurrency(totalAmountSC, h.stockCurrency, Currency.USD, exchangeRates);
                         h.dividendsILS += convertCurrency(totalAmountSC, h.stockCurrency, Currency.ILS, exchangeRates);
                     }
                 }
             });
             return;
        }

        const t = e as Transaction;
        const key = `${t.portfolioId}_${t.ticker}`;
        const p = logIfFalsy(newPortMap.get(t.portfolioId), `Portfolio not found for ID ${t.portfolioId}`, t);
        const portfolioCurrency = normalizeCurrency(p?.currency || 'USD');

        if (!holdingMap.has(key)) {
          const live = liveDataMap.get(`${t.ticker}:${t.exchange}`);
          const exchange = t.exchange || live?.exchange;
          if (!exchange) return;

          holdingMap.set(key, {
            key, portfolioId: t.portfolioId, portfolioName: p?.name || t.portfolioId, portfolioCurrency,
            ticker: t.ticker, exchange, displayName: live?.name || t.ticker, nameHe: live?.nameHe,
            qtyVested: 0, qtyUnvested: 0, totalQty: 0, currentPrice: live?.price || 0, stockCurrency: normalizeCurrency(live?.currency || t.currency || (exchange === Exchange.TASE ? Currency.ILA : Currency.USD)),
            type: live?.type, costBasisPortfolioCurrency: 0, costOfSoldPortfolioCurrency: 0, proceedsPortfolioCurrency: 0, dividendsPortfolioCurrency: 0,
            unrealizedGainPortfolioCurrency: 0, unrealizedTaxableGain: 0, realizedGainPortfolioCurrency: 0, realizedTaxableGain: 0, totalGainPortfolioCurrency: 0, marketValuePortfolioCurrency: 0,
            dayChangeValuePortfolioCurrency: 0, totalFeesPortfolioCurrency: 0, costBasisStockCurrency: 0, costOfSoldStockCurrency: 0, proceedsStockCurrency: 0, dividendsStockCurrency: 0,
            costBasisUSD: 0, costOfSoldUSD: 0, proceedsUSD: 0, dividendsUSD: 0, realizedGainUSD: 0,
            costBasisILS: 0, costOfSoldILS: 0, proceedsILS: 0, dividendsILS: 0, realizedGainILS: 0, realizedTaxableGainILS: 0, unrealizedTaxableGainILS: 0,
            avgCost: 0, mvVested: 0, mvUnvested: 0, totalMV: 0, realizedGain: 0, realizedGainPct: 0, realizedGainAfterTax: 0, dividends: 0, unrealizedGain: 0, unrealizedGainPct: 0, totalGain: 0, totalGainPct: 0, valueAfterTax: 0, dayChangeVal: 0,
            sector: live?.sector || '', dayChangePct: live?.changePct1d || 0,
            perf1w: live?.changePctRecent || 0, perf1m: live?.changePct1m || 0, perf3m: live?.changePct3m || 0,
            perfYtd: live?.changePctYtd || 0, perf1y: live?.changePct1y || 0, perf3y: live?.changePct3y || 0, perf5y: live?.changePct5y || 0,
          });
        }

        const h = holdingMap.get(key)!;
        const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();
        const tQty = t.qty || 0;
        const priceInUSD = t.originalPriceUSD || 0;
        const priceInAgorot = t.originalPriceILA || 0;
        const priceInILS = toILS(priceInAgorot, Currency.ILA);
        
        let originalPricePC = (portfolioCurrency === Currency.ILS) ? priceInILS : convertCurrency(priceInUSD, Currency.USD, portfolioCurrency, exchangeRates);
        const txnValuePC = tQty * originalPricePC;
        let effectivePriceSC = t.price || 0;
        if (h.stockCurrency === Currency.ILA) effectivePriceSC = priceInAgorot;
        else if (h.stockCurrency === Currency.ILS) effectivePriceSC = priceInILS;
        else if (h.stockCurrency === Currency.USD) effectivePriceSC = priceInUSD;
        const txnValueSC = tQty * effectivePriceSC;

        // Fees
        let txnFeePC = 0;
        if (t.commission && t.commission > 0) {
            let commVal = (h.stockCurrency === Currency.ILA) ? t.commission / 100 : t.commission;
            txnFeePC = convertCurrency(commVal, h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, exchangeRates);
        }
        h.totalFeesPortfolioCurrency += txnFeePC;

        const currentCPI = getCPI(new Date(t.date), realCpi);
        if (t.type === 'BUY') {
          if (h.weightedAvgCPI === undefined) h.weightedAvgCPI = currentCPI;
          else h.weightedAvgCPI = ((h.qtyVested + h.qtyUnvested) * h.weightedAvgCPI + tQty * currentCPI) / (h.qtyVested + h.qtyUnvested + tQty);
          
          if (isVested) h.qtyVested += tQty; else h.qtyUnvested += tQty;
          h.costBasisPortfolioCurrency += txnValuePC; h.costBasisStockCurrency += txnValueSC; h.costBasisUSD += tQty * priceInUSD; h.costBasisILS += tQty * priceInILS;
        } else if (t.type === 'SELL') {
          const totalQty = h.qtyVested + h.qtyUnvested;
          const avgCostPC = totalQty > 0 ? h.costBasisPortfolioCurrency / totalQty : 0;
          const costOfSoldPC = avgCostPC * tQty;
          const avgCostILS = totalQty > 0 ? h.costBasisILS / totalQty : 0;
          const currentCostOfSoldILS = avgCostILS * tQty;
          const curPriceILS = convertCurrency(t.price || 0, t.currency || h.stockCurrency, Currency.ILS, exchangeRates);
          
          h.costOfSoldPortfolioCurrency += costOfSoldPC; h.proceedsPortfolioCurrency += txnValuePC; h.costBasisPortfolioCurrency -= costOfSoldPC;
          
          // REAL_GAIN Logic (Portfolio Currency Version)
          let taxableGain = txnValuePC - costOfSoldPC;
          if (h.portfolioCurrency === Currency.ILS && h.stockCurrency === Currency.ILS) {
              const inflationAdj = Math.max(0, costOfSoldPC * ((currentCPI / (h.weightedAvgCPI || currentCPI)) - 1));
              taxableGain -= inflationAdj;
          } else if (h.portfolioCurrency !== h.stockCurrency) {
              const avgCostSC = totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0;
              const costOfSoldSC = avgCostSC * tQty;
              const gainInBase = txnValueSC - costOfSoldSC;
              const taxableILSBase = convertCurrency(gainInBase, h.stockCurrency, h.portfolioCurrency, exchangeRates);
              taxableGain = Math.min(taxableGain, taxableILSBase);
          }
          h.realizedTaxableGain += taxableGain;

          // REAL_GAIN Logic (ILS Specific Version for Summary Tax Calc)
          let taxableGainILS = (tQty * curPriceILS) - currentCostOfSoldILS;
          if (h.stockCurrency === Currency.ILS) {
              const inflationAdjILS = Math.max(0, currentCostOfSoldILS * ((currentCPI / (h.weightedAvgCPI || currentCPI)) - 1));
              taxableGainILS -= inflationAdjILS;
          } else {
              const costOfSoldSC = (totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0) * tQty;
              const gainInSC = (tQty * (t.price || 0)) - costOfSoldSC;
              const realGainILS = convertCurrency(gainInSC, h.stockCurrency, Currency.ILS, exchangeRates);
              taxableGainILS = Math.min(taxableGainILS, realGainILS);
          }
          h.realizedTaxableGainILS += taxableGainILS;

          h.costOfSoldStockCurrency += (totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0) * tQty;
          h.costBasisStockCurrency -= (totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0) * tQty;
          h.costOfSoldUSD += (totalQty > 0 ? h.costBasisUSD / totalQty : 0) * tQty;
          h.costBasisUSD -= (totalQty > 0 ? h.costBasisUSD / totalQty : 0) * tQty;
          h.proceedsUSD += tQty * priceInUSD;
          h.costOfSoldILS += currentCostOfSoldILS; h.costBasisILS -= currentCostOfSoldILS; h.proceedsILS += tQty * curPriceILS;

          let q = tQty;
          if (isVested) { const canSell = Math.min(q, h.qtyVested); h.qtyVested -= canSell; q -= canSell; }
          if (q > 0) h.qtyUnvested -= q;

          // Fix Floating Point Drift (Ghost Holding protection)
          if (h.qtyVested < 1e-9) h.qtyVested = 0;
          if (h.qtyUnvested < 1e-9) h.qtyUnvested = 0;
          if (Math.abs(h.costBasisPortfolioCurrency) < 0.01 && h.qtyVested + h.qtyUnvested === 0) {
              h.costBasisPortfolioCurrency = 0;
              h.costBasisILS = 0;
              h.costBasisUSD = 0;
              h.costBasisStockCurrency = 0;
          }
        } else if (t.type === 'DIVIDEND') {
          h.dividendsPortfolioCurrency += txnValuePC; h.dividendsStockCurrency += txnValueSC; h.dividendsUSD += tQty * priceInUSD; h.dividendsILS += tQty * priceInILS;
        } else if (t.type === 'FEE') {
            const feePC = convertCurrency((h.stockCurrency === Currency.ILA ? t.price! / 100 : t.price!) * (t.qty || 1), h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, exchangeRates);
            h.totalFeesPortfolioCurrency += feePC;
        }
      });

      const holdingsList = Array.from(holdingMap.values());
      const missingDataPromises = holdingsList.map(async (h) => {
        if (!h.currentPrice || h.currentPrice === 0 || h.exchange === Exchange.GEMEL || h.exchange === Exchange.PENSION) {
          try {
            const live = await getTickerData(h.ticker, h.exchange, null);
            if (live) {
              if ((live.exchange === Exchange.GEMEL || live.exchange === Exchange.PENSION) && live.timestamp) {
                const key = `${live.exchange}:${live.ticker}`;
                const storedHistory = extPrices[key];
                if (storedHistory) {
                  const liveDate = new Date(live.timestamp); liveDate.setHours(0, 0, 0, 0);
                  const match = storedHistory.find(item => { const itemDate = new Date(item.date); itemDate.setHours(0, 0, 0, 0); return itemDate.getTime() === liveDate.getTime(); });
                  if (match) { if (Math.abs(match.price - (live.price || 0)) > 0.01) console.warn(`[Data Mismatch] ${live.ticker} at ${toGoogleSheetDateFormat(match.date)}: Live=${live.price}, Stored=${match.price}`); }
                }
              }
              if (live.price) h.currentPrice = live.price;
              if (live.changePct1d !== undefined) h.dayChangePct = live.changePct1d;
              if (live.name) h.displayName = live.name;
              if (live.type) h.type = live.type;
              if (live.changePctRecent) h.perf1w = live.changePctRecent;
              if (live.changePct1m) h.perf1m = live.changePct1m;
              if (live.changePct1y) h.perf1y = live.changePct1y;
            }
          } catch (e) { console.warn(`Failed to hydrate ${h.ticker}`, e); }
        }
        return h;
      });
      await Promise.all(missingDataPromises);

      holdingMap.forEach(h => {
        h.totalQty = h.qtyVested + h.qtyUnvested;
        const currentPricePC = convertCurrency(h.currentPrice, h.stockCurrency, h.portfolioCurrency, exchangeRates);
        h.marketValuePortfolioCurrency = h.totalQty * currentPricePC;
        h.unrealizedGainPortfolioCurrency = h.marketValuePortfolioCurrency - h.costBasisPortfolioCurrency;
        h.realizedGainPortfolioCurrency = h.proceedsPortfolioCurrency - h.costOfSoldPortfolioCurrency;
        h.totalGainPortfolioCurrency = h.unrealizedGainPortfolioCurrency + h.realizedGainPortfolioCurrency + h.dividendsPortfolioCurrency;
        
        const currentCPI = getCPI(new Date(), realCpi);
        let taxableUnrealized = h.unrealizedGainPortfolioCurrency;
        if (h.portfolioCurrency === Currency.ILS && h.stockCurrency === Currency.ILS) {
            taxableUnrealized -= Math.max(0, h.costBasisPortfolioCurrency * ((currentCPI / (h.weightedAvgCPI || currentCPI)) - 1));
        } else if (h.portfolioCurrency !== h.stockCurrency) {
            const gainInSC = (h.totalQty * h.currentPrice) - h.costBasisStockCurrency;
            const realGainPC = convertCurrency(gainInSC, h.stockCurrency, h.portfolioCurrency, exchangeRates);
            taxableUnrealized = Math.min(taxableUnrealized, realGainPC);
        }
        h.unrealizedTaxableGain = taxableUnrealized;

        const priceInILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, exchangeRates);
        let taxableUnrealizedILS = (h.totalQty * priceInILS) - h.costBasisILS;
        if (h.stockCurrency === Currency.ILS) {
            taxableUnrealizedILS -= Math.max(0, h.costBasisILS * ((currentCPI / (h.weightedAvgCPI || currentCPI)) - 1));
        } else {
            const gainInSC = (h.totalQty * h.currentPrice) - h.costBasisStockCurrency;
            const realGainILS = convertCurrency(gainInSC, h.stockCurrency, Currency.ILS, exchangeRates);
            taxableUnrealizedILS = Math.min(taxableUnrealizedILS, realGainILS);
        }
        h.unrealizedTaxableGainILS = taxableUnrealizedILS;
        h.totalMV = h.marketValuePortfolioCurrency;
      });
      setHoldings(Array.from(holdingMap.values()));
    } catch (e) {
      console.error('loadData error:', e);
      if (e instanceof SessionExpiredError) { setError('session_expired'); showLoginModal(); } else setError(e);
    } finally { setLoading(false); }
  }, [sheetId, options.includeUnvested, exchangeRates, showLoginModal]);

  useEffect(() => { loadData(); }, [loadData]);
  return { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh: loadData };
}
